"""make_webp.py — 源图 → 落盘的 WebP。

内容流水线的第 2 步（第 1 步是人工填 CSV）。它只做四件事，每件都对应一条
具体的作弊路径：

  1. `exif_transpose` 之后【丢弃全部 EXIF / ICC / XMP】，并【断言】输出真的没有了。
     源 deck 里 image1.jpg 带 19 条 EXIF（Canon EOS 5DS R / Photoshop CS6 / GPS IFD），
     其余 6 张真图 0 条，全部 AI 图 0 条 —— 元数据的有无本身就是答案键。
  2. 裁到统一 3:2。源图宽高比 1.4801–1.5002，而 slide 2 的 AI 图是 1.3123。
     两侧宽高比不同 ⇒ 两张卡在页面上大小不同 ⇒ 那本身就是提示。
  3. 缩到长边 1200。源图 3713×2475（真）vs 1526–1536×1024（AI），分辨率是第二条泄露。
  4. 一对图用【完全相同】的编码参数。不同 quality / 不同缩放步数会重新引入
     可检测的伪影差异——那等于把刚堵上的洞又开一条缝。

★ 落盘路径必须中性：`assets/img/p/<puzzleId>/1.webp` 与 `2.webp`。
  绝不能出现 `assets/img/ai/…`。见 data/schema.md §6 与 js/validate.js 的正则守卫。

★ 本脚本写出 `data/crops.json`，记录【实际做了什么裁剪】。
  gen_manifest.py 靠它把 tellRegion 从源图坐标换算到裁剪后坐标。
  没有这条记录，"意图"与"落盘的字节"迟早分叉——所以它不是缓存，是凭证。

用法：
    python tools/make_webp.py                     # 从 ../20260917_....pptx 取源图
    python tools/make_webp.py --deck <path.pptx>  # 指定 deck
    python tools/make_webp.py --sources <dir>     # sources/ 根目录（非 pptx 来源）
    python tools/make_webp.py --dry-run           # 只打印将要做什么
"""

import argparse
import csv
import io
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deck import Deck, utf8_console  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                     # ai-or-not/
DATA = os.path.join(ROOT, "data")
ASSETS = os.path.join(ROOT, "assets", "img", "p")

# ★ 两侧必须完全一致。改这里等于改变所有已落盘图的质感，
#   所以要改就整体重跑，不要只改一部分。
OUT_LONG_EDGE = 1200
ASPECT = (3, 2)                                   # 目标宽高比
WEBP_OPTS = dict(quality=78, method=6)            # 唯一一份编码参数

# 超过这个比值就在报告里点名，但【不失败】——理由见文件末尾。
BYTE_RATIO_REPORT = 1.35

# ─────────────────────────────────────────────────────────────────────────
# 为什么体积比不是阻断项
#
# 实测这 7 组里 6 组的 AI 侧比真图侧大 1.40–2.84 倍。原因不是格式泄露
# （两侧都是同一份 WEBP_OPTS 编出来的），而是【降采样倍数不同】：
# 真图 3713×2475 → 1200×800，缩了 3.09 倍，颗粒被平均掉，压得很好；
# AI 图 1526×1024 → 1200×800，只缩 1.27 倍，高频纹理基本原样保留，
# 于是要花更多字节去编码它。这是源分辨率的必然结果，不是可修的错误。
#
# 为什么不修：
#   ① 它在游戏里【看不见】。两张卡同宽高比、同像素尺寸，页面上没有任何
#      位置能读出字节数。原计划里格式/分辨率/EXIF 三条是真泄露，因为
#      前两条会改变卡片在屏幕上的样子；体积不会。
#   ② 要压平它只能给两侧配不同的 quality，而那正好违反本脚本第 4 条原则
#      ——不同编码参数会引入可检测的伪影差异。用一个看不见的泄露，
#      去换一个看得见的泄露，是亏的。
#   ③ 能被 Network 面板利用的人，本来就能直接读 window.PUZZLES 里的
#      isAI（DESIGN.md 明确接受这一点：这是诚实的游戏，不是安全游戏）。
#
# 所以它是【报告项】：数值记进 crops.json，超阈值时点名，让人知道它存在，
# 但绝不因此拦住流水线。谁要"修"它，先读这三条。
# ─────────────────────────────────────────────────────────────────────────

DEFAULT_DECK = os.path.join(os.path.dirname(ROOT),
                            "20260917_CRIG_Ontdekt_AIorNot.pptx")


# ─────────────────────────────────────────────────────────────────────────
# 槽位：哪张图落在 1.webp，哪张落在 2.webp
# ─────────────────────────────────────────────────────────────────────────

def ai_slot(puzzle_id):
    """AI 图落在 1.webp 还是 2.webp。★ 与 gen_manifest.py 必须给出同一个答案。

    为什么要哈希而不是"AI 永远在 1"：文件名编号也是一种泄露通道。
    如果每道题的 1.webp 都是 AI，那么打开 DevTools 看 Network 的人
    就拿到了答案——而路径/文件名正是"最容易漏、且能绕过其它所有防护"的那一条。

    为什么不用随机：构建必须可复现。同一个 puzzleId 永远给同一个槽位。
    """
    h = 0
    for ch in puzzle_id:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return 1 if (h % 2 == 0) else 2


# ─────────────────────────────────────────────────────────────────────────
# 裁剪
# ─────────────────────────────────────────────────────────────────────────

def crop_box(w, h, spec):
    """返回要保留的像素矩形 (x0, y0, x1, y1)。

    spec 为 None / '' / 'centre' → 居中裁到 3:2。
    spec 为 'x0,y0,x1,y1'（归一化 0–1）→ 先按归一化窗口裁，再在窗口内居中裁到 3:2。

    ★ 为什么允许逐题覆盖：居中裁会把主体切掉，也可能把破绽切掉。
      默认居中，需要时在 pairs.csv 的 cropWindow 里写死。
    """
    tw, th = ASPECT

    if spec and spec.strip() and spec.strip().lower() != "centre":
        parts = [float(v) for v in spec.split(",")]
        if len(parts) != 4:
            raise ValueError("cropWindow 必须是 'x0,y0,x1,y1' 或 'centre'：%r" % spec)
        x0, y0, x1, y1 = parts
        bx0, by0 = int(round(w * x0)), int(round(h * y0))
        bx1, by1 = int(round(w * x1)), int(round(h * y1))
        if not (0 <= bx0 < bx1 <= w and 0 <= by0 < by1 <= h):
            raise ValueError("cropWindow 越界或退化：%r" % spec)
    else:
        bx0, by0, bx1, by1 = 0, 0, w, h

    cw, ch = bx1 - bx0, by1 - by0
    # 在窗口内居中取最大的 tw:th 矩形
    if cw * th >= ch * tw:                 # 窗口偏宽 → 裁左右
        keep_w = ch * tw // th
        keep_h = ch
    else:                                  # 窗口偏高 → 裁上下
        keep_w = cw
        keep_h = cw * th // tw
    ox = bx0 + (cw - keep_w) // 2
    oy = by0 + (ch - keep_h) // 2
    return (ox, oy, ox + keep_w, oy + keep_h)


def resize_to(im, long_edge=OUT_LONG_EDGE):
    if im.width >= im.height:
        return im.resize((long_edge, max(1, round(long_edge * im.height / im.width))),
                         Image.LANCZOS)
    return im.resize((max(1, round(long_edge * im.width / im.height)), long_edge),
                     Image.LANCZOS)


# ─────────────────────────────────────────────────────────────────────────
# 读源图
# ─────────────────────────────────────────────────────────────────────────

def make_reader(deck_path, sources_root):
    """返回 read(file_spec) -> PIL.Image。

    file_spec 有两种形态（见 data/schema.md §7）：
      '20260917_....pptx#ppt/media/image2.png'  ← 从 deck 里取（作者供图那一批）
      'sources/foo.jpg'                        ← 从 --sources 指定的根目录取
    """
    cache = {}

    def deck_for(path):
        if path not in cache:
            if not os.path.exists(path):
                raise SystemExit("找不到 deck：%s" % path)
            cache[path] = Deck(path)
        return cache[path]

    def read(spec):
        if "#" in spec:
            deck_name, entry = spec.split("#", 1)
            name = deck_name.strip()
            # CSV 里的 file 是【站点外】的相对名（见 data/schema.md §7）。
            # 它是相对于 ai-or-not 的父目录、也就是 CRIG Ontdekt/ 解析的。
            # ★ 必须 abspath：否则结果取决于调用者的 cwd，而流水线三个脚本
            #   各自被从不同目录跑过一次，就会得到三种答案。
            path = name if os.path.isabs(name) else os.path.abspath(
                os.path.join(os.path.dirname(ROOT), name))
            if os.path.exists(path):
                pass
            elif os.path.exists(deck_path or ""):
                path = deck_path
            else:
                raise SystemExit("找不到 deck：%s" % deck_name)
            d = deck_for(path)
            if not d.exists(entry):
                raise SystemExit("deck 里没有 %s" % entry)
            return Image.open(io.BytesIO(d.read(entry)))

        base = sources_root or os.path.join(os.path.dirname(ROOT), "sources")
        return Image.open(os.path.join(base, spec))

    return read


# ─────────────────────────────────────────────────────────────────────────

def read_csv(name):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        return [dict(r) for r in csv.DictReader(f)]


def process(im, spec):
    """源图 → 落盘前的 PIL.Image，并返回它经历过什么的记录。"""
    src_w, src_h = im.size
    # ★ exif_transpose 必须在丢弃 EXIF 之前：先按方向标签物理旋转，
    #   再扔掉标签。反过来会让竖拍的照片永久躺倒。
    im = im.convert("RGB")
    try:
        from PIL import ImageOps
        im = ImageOps.exif_transpose(im)
    except Exception:
        pass
    box = crop_box(im.width, im.height, spec)
    im = im.crop(box)
    im = resize_to(im)
    return im, {
        "source": [src_w, src_h],
        "sourceAspect": round(src_w / src_h, 4),
        "cropBox": list(box),
        "cropWindow": spec or "centre",
        "out": [im.width, im.height],
    }


def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "WEBP", **WEBP_OPTS)


def strip_metadata(path):
    """★ 本工具最重要的一行所在。

    重编码到 WebP 本身已经丢掉 EXIF，但"已经丢掉"必须是【被验证的事实】，
    不是推理。源 deck 里恰好只有一张真图带 EXIF——而它带的那 19 条里包含
    相机型号和一个 GPS IFD。这类差异一旦漏出去，玩家用任何看图工具都能读出来。
    """
    with Image.open(path) as out:
        exif = out.getexif()
        if exif:
            raise SystemExit("★ EXIF 没被剥干净：%s（%d 条）" % (path, len(exif)))
        for key in ("icc_profile", "xmp", "exif"):
            if out.info.get(key):
                raise SystemExit("★ %s 仍然带着 %s" % (path, key))
        if out.format != "WEBP":
            raise SystemExit("★ %s 不是 WebP，而是 %s" % (path, out.format))
        return out.size


def main(argv=None):
    utf8_console()
    ap = argparse.ArgumentParser()
    ap.add_argument("--deck", default=DEFAULT_DECK)
    ap.add_argument("--sources", default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    read = make_reader(args.deck, args.sources)

    reals = {r["realId"]: r for r in read_csv("real.csv") if r.get("realId")}
    ais = {a["aiId"]: a for a in read_csv("ai.csv") if a.get("aiId")}
    pairs = [p for p in read_csv("pairs.csv") if p.get("puzzleId")]

    if not pairs:
        print("pairs.csv 里没有配对行——没有图要生成。")
        return 0

    crops = {}
    if os.path.exists(os.path.join(DATA, "crops.json")):
        with open(os.path.join(DATA, "crops.json"), "r", encoding="utf-8") as f:
            crops = json.load(f)

    problems = []
    warnings = []
    for p in pairs:
        pid = p["puzzleId"]
        slot = ai_slot(pid)
        members = [(1, "real", reals.get(p.get("realId")), p.get("realId")),
                   (2, "ai", ais.get(p.get("aiId")), p.get("aiId"))]
        # 槽位是算出来的：AI 落在 slot，真图落在另一个。
        plan = {}
        for s, kind, row, rid in members:
            if row is None:
                problems.append("%s: 引用不存在的 %s=%r" % (pid, kind, rid))
                continue
            plan[slot if kind == "ai" else (3 - slot)] = (kind, row)

        if len(plan) != 2:
            continue

        record = {"puzzleId": pid, "aiSlot": slot, "images": {}}
        sizes = {}
        for s in (1, 2):
            kind, row = plan[s]
            spec = (row.get("file") or "").strip()
            ref = row.get("aiId") or row.get("realId")
            try:
                src = read(spec)
                im, info = process(src, (p.get("cropWindow") or "").strip())
            except Exception as exc:                      # noqa: BLE001
                problems.append("%s/%s: 读源图失败 %s → %s" % (pid, ref, spec, exc))
                continue
            dest = os.path.join(ASSETS, pid, "%d.webp" % s)
            if not args.dry_run:
                save(im, dest)
                sizes[s] = strip_metadata(dest)
            else:
                sizes[s] = im.size
            out_w, out_h = im.size
            # ★ 键名不能叫 "out"：那个位置被下面这行的输出路径占着，
            #   两者相撞会让尺寸被路径字符串覆盖（打印出 "px0" 就是这么来的）。
            info.update({"kind": kind, "ref": ref, "file": spec,
                         "outFile": "%s/%d.webp" % (pid, s)})
            record["images"][str(s)] = info
            print("%s  %d.webp  %-4s  %-5s  %sx%s → %sx%s  (宽高比 %.4f)"
                  % (pid, s, kind, ref,
                     info["source"][0], info["source"][1], out_w, out_h,
                     info["sourceAspect"]))

        if 1 in sizes and 2 in sizes:
            if sizes[1] != sizes[2]:
                problems.append("%s: 两侧尺寸不同 %s vs %s" % (pid, sizes[1], sizes[2]))
            record["dimensions"] = list(sizes[1])

        if not args.dry_run:
            # 体积比：只报告，不失败。理由见文件末尾"为什么体积比不是阻断项"。
            try:
                b1 = os.path.getsize(os.path.join(ASSETS, pid, "1.webp"))
                b2 = os.path.getsize(os.path.join(ASSETS, pid, "2.webp"))
                ratio = max(b1, b2) / max(1, min(b1, b2))
                record["bytes"] = [b1, b2]
                record["byteRatio"] = round(ratio, 3)
                if ratio >= BYTE_RATIO_REPORT:
                    big = record["images"]["1" if b1 > b2 else "2"]["kind"]
                    warnings.append("%s: 两侧体积比 %.2f（%s 侧更大，%d vs %d 字节）"
                                    % (pid, ratio, big, b1, b2))
            except OSError:
                pass

        crops[pid] = record

    if not args.dry_run:
        with open(os.path.join(DATA, "crops.json"), "w", encoding="utf-8") as f:
            json.dump(crops, f, ensure_ascii=False, indent=1, sort_keys=True)
        print("\n写出 data/crops.json（%d 道题）" % len(crops))

    if warnings:
        print("\n报告（不阻断）%d 条：" % len(warnings))
        for m in warnings:
            print("   ~", m)

    if problems:
        print("\n★ %d 个问题：" % len(problems))
        for m in problems:
            print("   -", m)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
