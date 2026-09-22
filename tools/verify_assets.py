"""verify_assets.py — 对【构建产物】做断言。跑在 make_webp + gen_manifest 之后。

与 gen_manifest.py 的分工：那边管"内容对不对"（三册 join、授权、教学载荷），
这边管"落盘的字节对不对"。两者都可能单独出错，所以要分别跑。

★★ 最重要的一条：`assets/` 下不得出现任何 .pptx/.jpg/.jpeg/.png。

   源 deck 是 38 MB 且带 EXIF（含相机型号与一个 GPS IFD），它被刻意放在
   站点目录之外，就是为了让打包或 `git add -A` 永远不会把它发出去。
   这条断言是那个设计意图的执行者——目录约定靠人记，断言靠机器查。

★ 第二条：manifest 与 crops.json 必须互相对得上。
   这是答案键的第二道防线。gen_manifest.py 生成时会查一次，这里再查一次，
   用来抓"manifest.js 是旧的、crops.json 是新的"这种时间差——
   那种情况下游戏会拿一张图当 AI、而盘上那张其实是真图。

用法：
    python tools/verify_assets.py
    python tools/verify_assets.py --release    # 发布前跑：provisional 未清零即失败
    python tools/verify_assets.py --stats      # 只打印统计，不做断言
"""

import argparse
import csv
import json
import os
import re
import sys
from collections import Counter

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deck import utf8_console  # noqa: E402
from gen_manifest import AXES, tier_of  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
ASSETS = os.path.join(ROOT, "assets")

# ★ 源图格式一个都不许出现在 assets/ 下。见文件头。
FORBIDDEN_EXT = (".pptx", ".ppt", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".psd")
NEUTRAL_NAME = re.compile(r"^[12]\.webp$")
# 语义化命名只允许活在 CSV 里，落盘路径必须中性。
LEAKY_PATH = re.compile(r"(^|/)(ai|real)[/_.-]", re.I)


def load_manifest():
    """从生成的 manifest.js 里把 JSON 抠出来。不跑 JS。"""
    path = os.path.join(DATA, "manifest.js")
    if not os.path.exists(path):
        return None
    src = open(path, "r", encoding="utf-8").read()
    marker = "g.PUZZLES = "
    if marker not in src:
        raise SystemExit("★ data/manifest.js 里找不到 'g.PUZZLES = ' —— "
                         "文件被手工改过？删掉重跑 gen_manifest.py。")
    body = src.split(marker, 1)[1]
    # 结尾是 ";\n})(typeof window ...;\n"，从后往前找最后一个 ']' 更稳。
    body = body[:body.rindex("]") + 1]
    return json.loads(body)


def load_crops():
    path = os.path.join(DATA, "crops.json")
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def walk_assets():
    out = []
    for dirpath, _dirnames, filenames in os.walk(ASSETS):
        for fn in filenames:
            out.append(os.path.join(dirpath, fn))
    return out


def main(argv=None):
    utf8_console()
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", action="store_true",
                    help="发布前检查：未复核答案键（provisional）未清零即失败")
    ap.add_argument("--stats", action="store_true", help="只打印统计，不做断言")
    args = ap.parse_args(argv)

    problems = []
    notes = []

    manifest = load_manifest()
    crops = load_crops()
    puzzles = manifest or []

    # ── 1. 站点目录里不许有源图 ──────────────────────────────────────
    files = walk_assets()
    leaked = [f for f in files if f.lower().endswith(FORBIDDEN_EXT)]
    for f in leaked:
        problems.append("assets/ 下有源图格式的文件：%s —— 源 deck 是 38MB 且带 EXIF，"
                        "它必须留在站点目录之外" % os.path.relpath(f, ROOT))

    # ── 2. 路径必须中性 ─────────────────────────────────────────────
    for f in files:
        rel = os.path.relpath(f, ROOT).replace("\\", "/")
        if LEAKY_PATH.search(rel):
            problems.append("路径泄露答案：%s（路径会出现在 URL、DOM 和 DevTools 里）" % rel)

    # ── 3. 每道 ready 题：两张图都在、都是 WebP、尺寸相同、无元数据 ──
    for p in puzzles:
        pid = p.get("id")
        if p.get("status") != "ready":
            continue
        dims = {}
        for n, im in zip((1, 2), p.get("images", [])):
            rel = im.get("src") or ""
            path = os.path.join(ROOT, rel.replace("/", os.sep))
            if not os.path.exists(path):
                problems.append("%s: %s 不存在" % (pid, rel))
                continue
            if not NEUTRAL_NAME.match(os.path.basename(path)):
                problems.append("%s: 落盘文件名 %s 不是 1.webp/2.webp"
                                % (pid, os.path.basename(path)))
            try:
                with Image.open(path) as out:
                    if out.format != "WEBP":
                        problems.append("%s: %s 不是 WebP 而是 %s" % (pid, rel, out.format))
                    dims[n] = out.size
                    if out.getexif():
                        problems.append("%s: %s 还带着 %d 条 EXIF"
                                        % (pid, rel, len(out.getexif())))
                    for key in ("icc_profile", "xmp", "exif"):
                        if out.info.get(key):
                            problems.append("%s: %s 还带着 %s" % (pid, rel, key))
            except Exception as exc:                       # noqa: BLE001
                problems.append("%s: 打不开 %s → %s" % (pid, rel, exc))

        if len(dims) == 2 and dims[1] != dims[2]:
            problems.append("%s: 两侧尺寸不同 %s vs %s —— 卡片在页面上大小会不一样"
                            % (pid, dims[1], dims[2]))
        for n in (1, 2):
            if n in dims:
                declared = (p["images"][n - 1].get("width"), p["images"][n - 1].get("height"))
                if declared != dims[n]:
                    problems.append("%s: manifest 声明 %sx%s，盘上是 %sx%s"
                                    % (pid, declared[0], declared[1], dims[n][0], dims[n][1]))

    # ── 4. manifest 与 crops.json 对账（答案键的第二道防线）──────────
    for p in puzzles:
        pid = p.get("id")
        rec = crops.get(pid)
        if not rec:
            notes.append("%s: crops.json 里没有记录（题不是从图生成的？）" % pid)
            continue
        for n, im in zip((1, 2), p.get("images", [])):
            kind = (rec.get("images") or {}).get(str(n), {}).get("kind")
            if not kind:
                continue
            if (kind == "ai") != (im.get("isAI") is True):
                problems.append("★ %s: %d.webp 在 crops.json 里是 %r，manifest 却说 isAI=%s"
                                " —— 答案键反了。重跑 make_webp.py && gen_manifest.py"
                                % (pid, n, kind, im.get("isAI")))

    # ── 5. 孤儿文件：盘上有图，但没有任何 ready 题引用 ────────────────
    referenced = set()
    for p in puzzles:
        for im in p.get("images", []):
            referenced.add(os.path.normpath(os.path.join(ROOT, (im.get("src") or "").replace("/", os.sep))))
    for f in files:
        if os.path.normpath(f) in referenced:
            continue
        notes.append("孤儿文件（没有任何题引用）：%s" % os.path.relpath(f, ROOT))

    # ── 6. 未复核答案键 ─────────────────────────────────────────────
    provisional = [p["id"] for p in puzzles if (p.get("meta") or {}).get("provisional")]
    if provisional and args.release:
        problems.append("★ 发布前仍有 %d 道题的答案键未复核（meta.provisional=true）：%s"
                        % (len(provisional), ", ".join(provisional)))

    # ── 统计 ───────────────────────────────────────────────────────
    print("题数：%d（ready %d）" % (len(puzzles),
                                    sum(1 for p in puzzles if p.get("status") == "ready")))
    print("盘上文件：%d 个，共 %.1f MB"
          % (len(files), sum(os.path.getsize(f) for f in files) / 1e6))

    hist = Counter()
    for p in puzzles:
        if p.get("status") == "ready" and len(p.get("difficulty") or {}) == 3:
            hist[tier_of(p["difficulty"])] += 1
    print("档位直方图（ready）：", dict(hist))
    if args.stats:
        axes = Counter()
        for p in puzzles:
            for a in AXES:
                axes["%s=%s" % (a, (p.get("difficulty") or {}).get(a))] += 1
        print("三轴分布：", dict(sorted(axes.items())))
        for m in notes:
            print("   ~", m)
        return 0

    if provisional:
        print("未复核答案键：%d 道%s"
              % (len(provisional), "（--release 会因此失败）" if not args.release else ""))
        print("   清单：%s" % ", ".join(provisional))

    if notes:
        print("\n提示（不阻断）%d 条：" % len(notes))
        for m in notes:
            print("   ~", m)

    if problems:
        print("\n★ %d 个问题：" % len(problems))
        for m in problems:
            print("   -", m)
        return 1

    print("\n全部断言通过。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
