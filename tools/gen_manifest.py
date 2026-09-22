"""gen_manifest.py — 三册 CSV → data/manifest.js。

    data/real.csv  ──┐
    data/ai.csv    ──┼──  校验 + join  ──→  data/manifest.js  ──→  引擎只看见 PUZZLES
    data/pairs.csv ──┘

★ 到 `status:"ready"` 的门槛（缺任一项就停在 review，永不 served）：

    ✅ which_is_ai 有人工核验记录（meta.reviewer）
    ✅ 三轴已评（tells / subject / postprocessing 各 1–5）
    ✅ teaching 齐全（cue + explanation / kidLine / rule 的至少一种语言）
    ✅ tellRegion 已设且在 [0,1] 内
    ✅ AI 侧有 generator（否则无法记录生成器条款）
    ✅ 授权：publicDisplay 与 derivatives 必须为真；
              permitsWeb 仅在 scope 含 web 时必须为真
    ✅ 人体材料（humanMaterial=true）另需 ethicsCleared 为真
    ✅ tells≥5 或落到 hard 档时另需 verifiedSolution 为真

★ 三道刻意的缝：

  1. **`isAI` 绝不从文件格式推断。** 源 deck 的全部 7 组都是 PNG 在左 JPEG 在右，
     于是"永远选左边"就能通关。答案键在这里是【人填的】+【有人签字】的。
  2. **scope 让 kiosk 与 web 的授权可以不同。** 源 deck 的图曾在现场公屏展示过，
     但公网托管未确认。把 permitsWeb 写成 true 是伪造；把它当成"不能玩"又会让
     整个 kiosk 版没内容。所以 scope 是显式的一列，谁也不装。
  3. **半成品合法存在。** 未配对的行不进 manifest.js、永不被 served，但不是错误。

用法：
    python tools/gen_manifest.py
    python tools/gen_manifest.py --require-min-per-tier 3   # 内容太少就别发布
    python tools/gen_manifest.py --check                    # 只校验，不写文件
"""

import argparse
import csv
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deck import utf8_console  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")

AXES = ("tells", "subject", "postprocessing")
# ★ 与 js/config.js 必须一致。verify_assets.py 会拿 node 跑 JS 那份来对账。
WEIGHTS = {"tells": 0.45, "subject": 0.30, "postprocessing": 0.25}
AXIS_MIN, AXIS_MAX = 1, 5
THRESHOLDS = {"easy": 0.34, "medium": 0.66}

SCOPES = ("kiosk", "web", "both")


# ─────────────────────────────────────────────────────────────────────────
# 难度：与 js/difficulty.js 的 score()/tier() 同一条公式
# ─────────────────────────────────────────────────────────────────────────

def score(d):
    """三轴归一化后加权平均。

    ★ 缺轴时计入分母但不计入分子 —— 于是"没评分的题"会变【更容易】，
      而不是悄悄把权重重新分配给它。静默重分配会让两条不同的题
      得到同一个分数，那是最难查的一类 bug。
    """
    total = 0.0
    for axis in AXES:
        v = d.get(axis)
        if v is None:
            total += WEIGHTS[axis] * 0.0
            continue
        v = max(AXIS_MIN, min(AXIS_MAX, float(v)))
        total += WEIGHTS[axis] * ((v - AXIS_MIN) / (AXIS_MAX - AXIS_MIN))
    return total


def tier_of(d):
    s = score(d)
    if s <= THRESHOLDS["easy"]:
        return "easy"
    if s <= THRESHOLDS["medium"]:
        return "medium"
    return "hard"


# ─────────────────────────────────────────────────────────────────────────

def read_csv(name):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        return [dict(r) for r in csv.DictReader(f)]


def truthy(v):
    return str(v or "").strip().lower() in ("1", "true", "ja", "yes", "y", "x")


def text(v):
    return (v or "").strip()


def num(v):
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return None


def lang(nl, en):
    """题目文案一律内联 {nl, en}，渲染时按 当前语言 → en → nl 回退。"""
    out = {}
    if text(nl):
        out["nl"] = text(nl)
    if text(en):
        out["en"] = text(en)
    return out or None


def to_post_crop(box, rec):
    """tellRegion 从【AI 图】的源图归一化坐标换算到【裁剪后】归一化坐标。

    ★ 为什么是 AI 图那一侧：破绽在 AI 图里，教学面板缩放居中的也是 AI 图。
      人是对着 AI 的源图量这个框的，所以源图坐标必须取自 crops.json 里
      aiSlot 那一侧的记录——取错了会得到"看起来合理但整体偏了一段"的框，
      那比直接报错更难发现。

    ★ 为什么需要换算而不是直接手写裁剪后坐标：人无法手算裁剪偏移。
      crops.json 是"流水线实际做了什么"的凭证，这里靠它把意图和落盘字节对上。
    """
    if not rec:
        return None
    slot = rec.get("aiSlot")
    img = (rec.get("images") or {}).get(str(slot))
    if not img:
        return None
    src, cb = img.get("source"), img.get("cropBox")
    if not src or not cb:
        return None
    sw, sh = src
    x0, y0, x1, y1 = cb
    cw, ch = (x1 - x0), (y1 - y0)
    if cw <= 0 or ch <= 0:
        return None

    x = (box["x"] * sw - x0) / cw
    y = (box["y"] * sh - y0) / ch
    w = box["w"] * sw / cw
    h = box["h"] * sh / ch
    # 裁掉越界的部分而不是整体判废：破绽常常贴着画面边缘，
    # 因为裁剪而被切掉一角，比整道题作废要好。
    nx0, ny0 = max(0.0, x), max(0.0, y)
    nx1, ny1 = min(1.0, x + w), min(1.0, y + h)
    if nx1 - nx0 <= 0.001 or ny1 - ny0 <= 0.001:
        return None
    return {"x": round(nx0, 4), "y": round(ny0, 4),
            "w": round(nx1 - nx0, 4), "h": round(ny1 - ny0, 4)}


def build():
    problems = []
    reals = read_csv("real.csv")
    ais = read_csv("ai.csv")
    pairs = read_csv("pairs.csv")

    crops = {}
    cpath = os.path.join(DATA, "crops.json")
    if os.path.exists(cpath):
        with open(cpath, "r", encoding="utf-8") as f:
            crops = json.load(f)

    by_real, by_ai = {}, {}
    for r in reals:
        rid = text(r.get("realId"))
        if not rid:
            problems.append(("real-missing-id", "", "real.csv 有一行没有 realId"))
            continue
        if rid in by_real:
            problems.append(("duplicate-real-id", rid, "realId 重复"))
        by_real[rid] = r
    for a in ais:
        aid = text(a.get("aiId"))
        if not aid:
            problems.append(("ai-missing-id", "", "ai.csv 有一行没有 aiId"))
            continue
        if aid in by_ai:
            problems.append(("duplicate-ai-id", aid, "aiId 重复"))
        by_ai[aid] = a

    used_ai, used_real = {}, {}
    puzzles, skipped, provisional = [], [], []

    for p in pairs:
        pid = text(p.get("puzzleId"))
        # ★ 这一道题自己产生了几个问题。判 ready 时用它，而不是只看教学与授权：
        #   三轴越界、derivedFromRealId 对不上、缺 generator 同样是"这题还不能上"。
        mark = len(problems)
        rid, aid = text(p.get("realId")), text(p.get("aiId"))
        scope = text(p.get("scope")).lower() or "both"
        if scope not in SCOPES:
            problems.append(("bad-scope", pid, "scope=%r 不在 %s 里" % (scope, SCOPES)))
            continue

        # ── 配对完整性 ───────────────────────────────────────────────
        r = by_real.get(rid)
        a = by_ai.get(aid)
        if r is None:
            skipped.append((pid, "pair-missing-real:%s" % rid)); continue
        if a is None:
            skipped.append((pid, "pair-missing-ai:%s" % aid)); continue
        if aid in used_ai:
            problems.append(("ai-used-twice", pid, "aiId %s 被两道题用了" % aid))
        used_ai[aid] = pid
        used_real.setdefault(rid, []).append(pid)

        # ★ 反向引用必须对得上：AI 图自己记得它是照哪张真图生成的。
        #   这是"配错半边"的唯一检测手段。
        deriv = text(a.get("derivedFromRealId"))
        if not deriv:
            problems.append(("ai-missing-derived-from", pid,
                             "ai.csv 的 %s 没有 derivedFromRealId" % aid))
        elif deriv != rid:
            problems.append(("ai-derived-mismatch", pid,
                             "%s 是照 %s 生成的，却被配到 %s 上" % (aid, deriv, rid)))

        # ── 难度 ────────────────────────────────────────────────────
        d = {}
        for axis in AXES:
            v = num(p.get(axis))
            if v is None:
                problems.append(("axis-missing:" + axis, pid, "三轴未评全"))
            elif not (AXIS_MIN <= v <= AXIS_MAX):
                problems.append(("axis-out-of-range:" + axis, pid,
                                 "%s=%s 不在 %d–%d" % (axis, v, AXIS_MIN, AXIS_MAX)))
            else:
                d[axis] = int(v)

        tier = tier_of(d) if len(d) == 3 else None

        # ── 教学载荷 ────────────────────────────────────────────────
        teaching_problems = []
        cue = text(p.get("cue"))
        if not cue:
            teaching_problems.append("missing-cue")
        # CSV 的列名是 tellRegionX/Y/W/H，但 to_post_crop 与输出都用小写
        # ——统一在这里转一次，免得两处大小写各写各的（之前就是这里对不上，
        #   被上层提前 return 遮住了，改成能算通之后才炸出来）。
        box = {k.lower(): num(p.get("tellRegion" + k)) for k in ("X", "Y", "W", "H")}
        if any(v is None for v in box.values()):
            teaching_problems.append("missing-tellregion")
            region = None
        else:
            region = to_post_crop(box, crops.get(pid))
            if region is None:
                teaching_problems.append(
                    "tellregion-degenerate（源坐标 x%.3f y%.3f w%.3f h%.3f 在 AI 图的"
                    "裁剪窗口里是空的，或 crops.json 里没有 %s 的 AI 侧记录；"
                    "先跑 make_webp.py）"
                    % (box["x"], box["y"], box["w"], box["h"], pid))
        expl = lang(p.get("explanationNl"), p.get("explanationEn"))
        kid = lang(p.get("kidLineNl"), p.get("kidLineEn"))
        rule = lang(p.get("ruleNl"), p.get("ruleEn"))
        realnote = lang(p.get("realNoteNl"), p.get("realNoteEn"))
        for key, val in (("missing-explanation", expl), ("missing-kidline", kid),
                         ("missing-rule", rule)):
            if not val:
                teaching_problems.append(key)
        if teaching_problems:
            problems.append(("teaching", pid, "; ".join(teaching_problems)))

        # ── 授权闸门 ────────────────────────────────────────────────
        rights = []
        needs_web = scope in ("web", "both")
        human = truthy(r.get("humanMaterial"))
        if not truthy(r.get("permitsPublicDisplay")):
            rights.append("permitsPublicDisplay=false")
        if not truthy(r.get("permitsDerivatives")):
            rights.append("permitsDerivatives=false")
        if needs_web and not truthy(r.get("permitsWeb")):
            rights.append("permitsWeb=false（scope=%s 需要公网授权）" % scope)
        if human and not truthy(r.get("ethicsCleared")):
            rights.append("humanMaterial=true 但 ethicsCleared≠true")
        if rights:
            problems.append(("rights-not-cleared", pid, "; ".join(rights)))

        # ── 答案键与诚实护栏 ────────────────────────────────────────
        verifier = text(p.get("verifiedBy"))
        if not verifier:
            problems.append(("missing-verifier", pid,
                             "没有人工核验人 —— 答案键不能是从格式推断的"))
        # ★ 带 UNCONFIRMED 前缀的核验人 = 有人看过，但还不是 CRIG 的人签的字。
        #   这种题可以 served（否则"先用 deck 的图把版本做出来"就没法玩了），
        #   但在 manifest 里挂 meta.provisional=true，并在结尾大声点名。
        #   发布前应当清零：verify_assets.py --release 会因此失败。
        elif verifier.upper().startswith("UNCONFIRMED"):
            provisional.append(pid)
        if not text(a.get("generator")):
            problems.append(("missing-generator", pid, "ai.csv 的 %s 没有 generator" % aid))
        if not text(p.get("verifiedSolution")) or not truthy(p.get("verifiedSolution")):
            if tier == "hard":
                problems.append(("hard-unverified", pid, "hard 档但 verifiedSolution≠true"))

        # ── 组装 ────────────────────────────────────────────────────
        slot = crops.get(pid, {}).get("aiSlot")
        if slot not in (1, 2):
            # crops.json 缺失/过期时不能瞎猜槽位——猜错就是答案键错。
            problems.append(("no-crops-record", pid,
                             "data/crops.json 里没有 %s 的槽位记录，先跑 make_webp.py" % pid))
            slot = 1

        def image_row(n, is_ai):
            if is_ai:
                return {
                    "id": "%s-%d" % (pid, n),
                    "src": "assets/img/p/%s/%d.webp" % (pid, n),
                    "width": crops.get(pid, {}).get("dimensions", [1200, 800])[0],
                    "height": crops.get(pid, {}).get("dimensions", [1200, 800])[1],
                    "isAI": True,
                    "altKey": "alt.imageSlot",
                    "provenance": {
                        "kind": "ai",
                        "generator": text(a.get("generator")),
                        "model": text(a.get("model")) or None,
                        "prompt": text(a.get("prompt")) or None,
                        "credit": None,
                        "licence": text(a.get("licence")) or None,
                        "permits": {"web": True, "publicDisplay": True, "derivatives": True},
                        "ethicsCleared": None,
                        "rightsNote": text(a.get("rightsNote")) or None,
                    },
                }
            return {
                "id": "%s-%d" % (pid, n),
                "src": "assets/img/p/%s/%d.webp" % (pid, n),
                "width": crops.get(pid, {}).get("dimensions", [1200, 800])[0],
                "height": crops.get(pid, {}).get("dimensions", [1200, 800])[1],
                "isAI": False,
                "altKey": "alt.imageSlot",
                "provenance": {
                    "kind": text(r.get("kind")) or "photo",
                    "generator": None, "prompt": None,
                    "credit": text(r.get("credit")) or None,
                    "licence": text(r.get("licence")) or None,
                    "licenceUrl": text(r.get("licenceUrl")) or None,
                    "subject": lang(r.get("subjectNl"), r.get("subjectEn")),
                    "rightsCleared": all(truthy(r.get(k)) for k in
                                         ("permitsWeb", "permitsPublicDisplay",
                                          "permitsDerivatives")),
                    "permits": {"web": truthy(r.get("permitsWeb")),
                                "publicDisplay": truthy(r.get("permitsPublicDisplay")),
                                "derivatives": truthy(r.get("permitsDerivatives"))},
                    "ethicsCleared": truthy(r.get("ethicsCleared")) or None,
                    "humanMaterial": human,
                    "rightsNote": text(r.get("rightsNote")) or None,
                },
            }

        rec = crops.get(pid, {})

        # ★★ 这里是全项目唯一一处"写反了也能跑通"的地方，所以要说清楚：
        #   crops.json 的约定是【编号为 aiSlot 的那张就是 AI 图】
        #   （make_webp.py: plan[slot if kind=="ai" else 3-slot]）。
        #   所以 1 号是 AI 当且仅当 slot == 1。
        #
        #   我曾经把这里写成 slot != 1 和 slot == 1，结果 14 张图全部标反：
        #   游戏会告诉玩家"真照片是 AI"，而且 manifest 里看不出任何异常。
        #   所以下面不止修对，还加一条与 crops.json 的逐张对账 —— 那是
        #   make_webp 独立录下的 kind，不是这里重述一遍，能真的抓到反转。
        images = [image_row(1, slot == 1), image_row(2, slot != 1)]

        for n, img in zip((1, 2), images):
            want = text((rec.get("images") or {}).get(str(n), {}).get("kind"))
            if want and (want == "ai") != img["isAI"]:
                problems.append((
                    "answer-key-inverted", pid,
                    "%s 在 crops.json 里是 %r，却被标成 isAI=%s —— 答案键反了"
                    % (img["id"], want, img["isAI"])))

        # 只要这道题自己产生了任何问题，就停在 review，永不 served。
        # reason 已经在上面的 problems 列表里逐条打印过了，这里不再重复。
        status = "ready" if len(problems) == mark else "review"
        if text(p.get("status")).lower() == "retired":
            status = "retired"
        elif text(p.get("status")).lower() == "draft":
            status = "draft"

        puzzles.append({
            "id": pid, "schemaVersion": 1, "status": status,
            "scope": scope,
            "slide": int(num(p.get("sourceSlide"))) if num(p.get("sourceSlide")) else None,
            "difficulty": d,
            "images": images,
            "postprocess": {
                "recipe": "deck-v1",
                "applied": ["exif-strip", "crop-3:2", "resize-%d"
                            % (rec.get("dimensions") or [1200])[0], "webp-q78"],
                "sourceAspect": sorted(rec.get("images", {}).get(str(i), {})
                                       .get("sourceAspect", 0) for i in (1, 2)
                                       if rec.get("images", {}).get(str(i))),
                "cropWindow": (text(p.get("cropWindow")) or "centre"),
                "byteRatio": rec.get("byteRatio"),
            },
            "teaching": {
                "cue": cue,
                "tellRegion": region,
                "explanation": expl, "kidLine": kid, "rule": rule, "realNote": realnote,
            },
            "meta": {
                "author": text(p.get("author")) or None,
                "reviewer": verifier,
                "reviewedAt": text(p.get("verifiedAt")) or None,
                "verifiedSolution": truthy(p.get("verifiedSolution")),
                # ★ provisional = 有人看过，但签字的人不是 CRIG 的人。
                #   题可以玩，但发布前必须清零（verify_assets.py --release 会拦）。
                "provisional": pid in provisional,
                # tags 只从 tags 列来。别拿 notes 去 split —— notes 是一句人话，
                # 拆出来的"标签"会是一整句话，然后出现在界面上。
                "tags": [s.strip() for s in (text(p.get("tags")) or "").split("|") if s.strip()],
                "notes": text(p.get("notes")) or "",
            },
        })

    # ★ 一道真图被多道题引用是【允许且鼓励】的（内容量的乘数），
    #   但抽题必须按 realId 去重，否则同一张真照片会在一局里出现两次。
    multi = {k: v for k, v in used_real.items() if len(v) > 1}
    return puzzles, problems, skipped, multi, provisional


def histogram(puzzles):
    out = {"easy": 0, "medium": 0, "hard": 0}
    for p in puzzles:
        if len(p["difficulty"]) == 3:
            out[tier_of(p["difficulty"])] += 1
    return out


def axis_correlation(puzzles):
    """轴间相关系数。若 tells 与 subject 相关超过 ~0.7，说明实际上只有一条轴，
    难度菜单是假的——这个报告存在的唯一目的就是让那种情况可见。"""
    xs = [p["difficulty"] for p in puzzles if len(p["difficulty"]) == 3]
    if len(xs) < 3:
        return {}
    out = {}
    for i, a in enumerate(AXES):
        for b in AXES[i + 1:]:
            va, vb = [x[a] for x in xs], [x[b] for x in xs]
            ma, mb = sum(va) / len(va), sum(vb) / len(vb)
            num_ = sum((x - ma) * (y - mb) for x, y in zip(va, vb))
            da = sum((x - ma) ** 2 for x in va) ** 0.5
            db = sum((y - mb) ** 2 for y in vb) ** 0.5
            out["%s~%s" % (a, b)] = round(num_ / (da * db), 3) if da and db else None
    return out


HEADER = """/* manifest.js — 【生成物，请勿手工编辑】
 *
 * 由 tools/gen_manifest.py 从三册 CSV join 生成（见 data/schema.md）。
 * 要改内容就改 CSV，然后重跑：
 *
 *     python tools/make_webp.py && python tools/gen_manifest.py
 *
 * ★ 为什么是 .js 而不是 .json：
 *   file:// 下 fetch() 本地 JSON 会被 CORS 拦掉（展台必须能双击 index.html 打开），
 *   所以题库只能是一个赋值给全局变量的脚本。见 DESIGN.md §2 的约束表。
 *
 * ★ 为什么是 UMD 式收尾而不是直接写 window.PUZZLES：
 *   与 js/ 下所有模块同一套写法，于是这份生成物也能被 tests/run.js 在 Node 里
 *   求值 —— "生成出来的题库真的能通过 validate" 因此成了一条自动化测试，
 *   而不是靠人打开页面肉眼看。这条测试抓到的第一类 bug 就是答案键整体标反。
 *
 * ★ 只有 status === "ready" 的题会被 served。这道隔离机制保证：
 *   摄取真实图片永远不会意外让一道未核验的题变得可玩。
 *
 * ★ scope 是 kiosk | web | both：授权只在某一种场合成立时，题就只在那一种场合出现。
 *   kiosk 题不会出现在公网版里（compose.js 按 mode 过滤）。
 */

"""

UMD_TAIL = "})(typeof window !== 'undefined' ? window : globalThis);\n"


def write_manifest(puzzles, path):
    body = json.dumps(puzzles, ensure_ascii=False, indent=2)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(HEADER)
        f.write("(function (g) {\n  'use strict';\n  g.PUZZLES = ")
        f.write(body)
        f.write(";\n")
        f.write(UMD_TAIL)


def main(argv=None):
    utf8_console()
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只校验，不写文件")
    ap.add_argument("--require-min-per-tier", type=int, default=0, metavar="N",
                    help="每档至少 N 道 ready 题，否则非零退出（防止'7 道题铺 3 档'就发布）")
    args = ap.parse_args(argv)

    puzzles, problems, skipped, multi, provisional = build()
    hist = histogram(puzzles)
    ready = [p for p in puzzles if p["status"] == "ready"]

    print("配对 %d 道：ready %d / 其它 %d" % (len(puzzles), len(ready),
                                              len(puzzles) - len(ready)))
    print("档位直方图（全部）：", hist)
    print("档位直方图（ready）：", histogram(ready))
    scopes = {}
    for p in puzzles:
        scopes[p["scope"]] = scopes.get(p["scope"], 0) + 1
    print("scope：", scopes)
    corr = axis_correlation(puzzles)
    if corr:
        print("轴间相关：", corr)
        for k, v in corr.items():
            if v is not None and abs(v) > 0.7:
                print("   ⚠ %s 相关 %.2f > 0.7 —— 这两条轴实际上是一条，难度菜单是假的" % (k, v))
    if multi:
        print("★ 一图多题（realId 被多道题引用，抽题时必须按 realId 去重）：", multi)

    if skipped:
        print("\n未配对（合法存在，不进 manifest，永不 served）：")
        for pid, why in skipped:
            print("   -", pid, why)

    if problems:
        print("\n★ %d 个问题：" % len(problems))
        for code, pid, why in problems:
            print("   [%s] %s: %s" % (code, pid or "-", why))

    if provisional:
        print("\n" + "=" * 72)
        print("★ 未复核答案键：%d/%d 道题的 verifiedBy 带 UNCONFIRMED 前缀。" % (
            len(provisional), len(puzzles)))
        print("  这意味着答案键是【工具目视核验】出来的，不是 CRIG 的人签字确认的。")
        print("  题可以玩、可以评审、可以调难度——但【不可以这样发布】。")
        print("  发布前：请人逐组看一遍，把 pairs.csv 的 verifiedBy 改成那个人的名字。")
        print("  清单：%s" % ", ".join(provisional))
        print("=" * 72)

    if not args.check:
        write_manifest(puzzles, os.path.join(DATA, "manifest.js"))
        print("\n写出 data/manifest.js（%d 道题，其中 ready %d）"
              % (len(puzzles), len(ready)))

    if args.require_min_per_tier:
        n = args.require_min_per_tier
        thin = {k: v for k, v in histogram(ready).items() if v < n}
        if thin:
            print("\n★ 内容不足：%s 少于 %d 道。发布前请先补内容，"
                  "或明确接受这一点。" % (thin, n))
            return 2

    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
