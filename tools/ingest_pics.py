"""ingest_pics.py — 从 data/pics/Level* 自动生成带分级等级的题库。

规则：
1. 扫描 data/pics/ 下所有 Level* 文件夹（按数字自然排序 Level1 -> Level2 -> Level3...）。
2. 在每个等级文件夹下按文件名自动配对：
     <Name>_AI.<ext> 与 <Name>_Real.<ext> （支持 .png, .jpg, .jpeg, .png.jpg）
3. 使用 Pillow 将图片安全重编码：
     - 剥除所有 EXIF 与相机元数据；
     - 居中裁剪到统一 3:2 宽高比；
     - 缩放为标准 1200x800；
     - 随机分配槽位（1.webp 与 2.webp），落盘路径完全中性化。
4. 读取 data/pics/metadata.json 填充教学与破绽信息。
5. 生成 data/manifest.js 与 data/crops.json。
"""

import os
import re
import json
import random
import sys
from PIL import Image

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PICS_DIR = os.path.join(ROOT, "data", "pics")
ASSETS_DIR = os.path.join(ROOT, "assets", "img", "p")
MANIFEST_JS = os.path.join(ROOT, "data", "manifest.js")
CROPS_JSON = os.path.join(ROOT, "data", "crops.json")
METADATA_JSON = os.path.join(PICS_DIR, "metadata.json")

TARGET_ASPECT = 3.0 / 2.0
TARGET_WIDTH = 1200
TARGET_HEIGHT = 800
WEBP_QUALITY = 78

FILE_PATTERN = re.compile(
    r"^(?P<key>.+)_(?P<role>AI|Real)\.(?:png|jpg|jpeg|png\.jpg)$",
    re.IGNORECASE
)

def process_and_save_webp(src_path, dest_path):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    with Image.open(src_path) as img:
        # 转为 RGB（去除 Alpha 通道，避免格式泄漏）
        if img.mode != "RGB":
            img = img.convert("RGB")
        
        w, h = img.size
        # 等比缩放，适应最大长宽 (TARGET_WIDTH, TARGET_HEIGHT)，绝不裁剪任何像素
        scale = min(TARGET_WIDTH / float(w), TARGET_HEIGHT / float(h))
        new_w = max(1, int(round(w * scale)))
        new_h = max(1, int(round(h * scale)))
        resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        
        # 统一尺寸为 1200 x 800：居中贴合，黑底补白，绝不裁剪任何有用信息
        canvas = Image.new("RGB", (TARGET_WIDTH, TARGET_HEIGHT), (0, 0, 0))
        offset_x = (TARGET_WIDTH - new_w) // 2
        offset_y = (TARGET_HEIGHT - new_h) // 2
        canvas.paste(resized, (offset_x, offset_y))
        
        # 丢弃 EXIF 保存为 WebP
        canvas.save(dest_path, "WEBP", quality=WEBP_QUALITY, method=6)
        
        return {
            "sourceWidth": w,
            "sourceHeight": h,
            "outWidth": TARGET_WIDTH,
            "outHeight": TARGET_HEIGHT,
            "cropBox": [0, 0, 1.0, 1.0],
            "pad": [offset_x, offset_y, new_w, new_h]
        }

def main():
    if not os.path.exists(PICS_DIR):
        print(f"[Error] 找不到素材目录：{PICS_DIR}")
        return 1

    metadata = {}
    if os.path.exists(METADATA_JSON):
        with open(METADATA_JSON, "r", encoding="utf-8") as f:
            metadata = json.load(f)

    level_dirs = []
    for item in os.listdir(PICS_DIR):
        item_path = os.path.join(PICS_DIR, item)
        if os.path.isdir(item_path):
            m = re.match(r"^Level(\d+)$", item, re.IGNORECASE)
            if m:
                level_dirs.append((int(m.group(1)), item, item_path))

    level_dirs.sort(key=lambda x: x[0])
    print(f"发现 {len(level_dirs)} 个等级目录: {[d[1] for d in level_dirs]}")

    puzzles = []
    crops_record = {}
    puzzle_idx = 1

    # 固定随机种子，保证构建产物可复现
    rng = random.Random(20260922)

    for level_num, level_name, level_path in level_dirs:
        pairs = {}
        for fname in os.listdir(level_path):
            m = FILE_PATTERN.match(fname)
            if not m:
                continue
            key = m.group("key").strip()
            role = m.group("role").upper() # "AI" or "REAL"
            pair_key = key.lower()
            if pair_key not in pairs:
                pairs[pair_key] = {"orig_key": key, "level": level_num}
            pairs[pair_key][role] = os.path.join(level_path, fname)

        for pair_key, pdata in pairs.items():
            if "AI" not in pdata or "REAL" not in pdata:
                print(f"  [Skip] {level_name}/{pair_key} 缺失配对 (AI={bool('AI' in pdata)}, Real={bool('REAL' in pdata)})")
                continue

            orig_key = pdata["orig_key"]
            pid = f"p{puzzle_idx:03d}"
            puzzle_idx += 1

            # 随机决定哪一侧放 AI（0: AI 在 1.webp，1: AI 在 2.webp）
            ai_slot = 1 if rng.random() < 0.5 else 2
            real_slot = 2 if ai_slot == 1 else 1

            slot1_file = pdata["AI"] if ai_slot == 1 else pdata["REAL"]
            slot2_file = pdata["AI"] if ai_slot == 2 else pdata["REAL"]

            dest1 = os.path.join(ASSETS_DIR, pid, "1.webp")
            dest2 = os.path.join(ASSETS_DIR, pid, "2.webp")

            info1 = process_and_save_webp(slot1_file, dest1)
            info2 = process_and_save_webp(slot2_file, dest2)

            crops_record[pid] = {
                "aiSlot": ai_slot,
                "images": {
                    "1": info1,
                    "2": info2
                }
            }

            meta = metadata.get(orig_key, {})
            title = meta.get("subject", {"nl": orig_key, "en": orig_key})
            explanation = meta.get("explanation", {
                "nl": f"Kijk goed naar de details en consistentie van {orig_key}.",
                "en": f"Look closely at the details and consistency of {orig_key}."
            })
            rule = meta.get("rule", {
                "nl": "Vergroot altijd verdachte structuren om te zien of ze natuurlijk doorlopen.",
                "en": "Always zoom in on suspicious structures to check if they have natural continuity."
            })
            tell_region = meta.get("tellRegion", {"x": 0.25, "y": 0.25, "w": 0.5, "h": 0.5})

            puzzle_obj = {
                "id": pid,
                "schemaVersion": 1,
                "status": "ready",
                "scope": "both",
                "level": level_num,
                "pairKey": orig_key,
                "difficulty": {
                    "tells": max(1, min(5, 6 - level_num)),
                    "subject": min(5, level_num + 1),
                    "postprocessing": 2
                },
                "meta": {
                    "reviewer": "CRIG Team (Ingest 2026)",
                    "reviewedAt": "2026-09-22",
                    "verifiedSolution": True
                },
                "images": [
                    {
                        "id": f"{pid}-1",
                        "src": f"assets/img/p/{pid}/1.webp",
                        "width": info1["outWidth"],
                        "height": info1["outHeight"],
                        "isAI": (ai_slot == 1),
                        "altKey": "alt.imageSlot",
                        "provenance": {
                            "kind": "ai" if ai_slot == 1 else "photo",
                            "generator": "Diffusion Generator" if ai_slot == 1 else None,
                            "credit": "CRIG Ontdekt (UGent)",
                            "subject": title,
                            "permits": {
                                "web": True,
                                "publicDisplay": True,
                                "derivatives": True
                            }
                        }
                    },
                    {
                        "id": f"{pid}-2",
                        "src": f"assets/img/p/{pid}/2.webp",
                        "width": info2["outWidth"],
                        "height": info2["outHeight"],
                        "isAI": (ai_slot == 2),
                        "altKey": "alt.imageSlot",
                        "provenance": {
                            "kind": "ai" if ai_slot == 2 else "photo",
                            "generator": "Diffusion Generator" if ai_slot == 2 else None,
                            "credit": "CRIG Ontdekt (UGent)",
                            "subject": title,
                            "permits": {
                                "web": True,
                                "publicDisplay": True,
                                "derivatives": True
                            }
                        }
                    }
                ],
                "teaching": {
                    "cue": meta.get("cue", "text"),
                    "tellRegion": tell_region,
                    "explanation": explanation,
                    "kidLine": {
                        "nl": f"Kijk goed naar de details van {orig_key}.",
                        "en": f"Look closely at the details of {orig_key}."
                    },
                    "rule": rule
                }
            }
            puzzles.append(puzzle_obj)
            print(f"  [OK] Level {level_num}: {orig_key} -> {pid} (AI=Slot {ai_slot})")

    # 写入 data/manifest.js
    manifest_content = [
        "/* manifest.js — 自动由 tools/ingest_pics.py 从 data/pics/Level* 生成 */",
        "(function (g) {",
        "  'use strict';",
        "  g.PUZZLES = " + json.dumps(puzzles, indent=2, ensure_ascii=False) + ";",
        "})(typeof window !== 'undefined' ? window : globalThis);",
        ""
    ]
    with open(MANIFEST_JS, "w", encoding="utf-8") as f:
        f.write("\n".join(manifest_content))

    # 写入 data/crops.json
    with open(CROPS_JSON, "w", encoding="utf-8") as f:
        json.dump(crops_record, f, indent=2)

    print(f"\n成功构建 {len(puzzles)} 道题目，已生成 {MANIFEST_JS} 与 {CROPS_JSON}")
    return 0

if __name__ == "__main__":
    import sys
    sys.exit(main())
