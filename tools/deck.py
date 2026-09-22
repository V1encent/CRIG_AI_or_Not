"""deck.py — 读 pptx 的共用底座。

★ 为什么不能直接 zipfile.ZipFile(path)：

  这个文件放在 OneDrive 里。实测 CreateFileW 的共享模式探测结果是
      READ|WRITE           → 失败
      READ|WRITE|DELETE    → 成功
  也就是说 OneDrive 持有 delete-share 锁，而 CPython 的 open() 用的是
  _SH_DENYNO，【不申请 FILE_SHARE_DELETE】，于是 zipfile 拿到 EACCES。
  同目录的其它 pptx 能正常打开，所以这是逐文件的问题，不是路径问题。

  解法是自己用 share=7（READ|WRITE|DELETE）打开，读进内存再交给 zipfile。
  备选是 `unzip -p` 流式、或先拷到临时目录——但那两条都要么丢随机访问，
  要么多一次 38MB 的拷贝。

★ 另一个必须记住的事实：**rel 顺序不等于视觉位置**。
  配对必须靠 <a:off x> 坐标排序，不能靠文件名编号、也不能靠 rId 顺序。
  本 deck 里这几条线索互相矛盾，只有坐标是可靠的结构事实。
"""

import io
import os
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

# ★ Windows 的控制台默认是 cp1252，打印中文会直接抛 UnicodeEncodeError。
#   这不是"显示不好看"——它会打断流水线跑到一半，而且报错信息指向 print，
#   完全看不出真正原因是编码。所有工具的入口都先调这个。
def utf8_console():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def _read_shared(path):
    """按 share=7 打开文件并全部读进内存。Windows 上绕开 OneDrive 的 delete-share 锁。"""
    if os.name != "nt":
        with open(path, "rb") as f:
            return f.read()

    import ctypes
    from ctypes import wintypes

    GENERIC_READ = 0x80000000
    OPEN_EXISTING = 3
    FILE_SHARE_ALL = 0x00000007  # ← READ | WRITE | DELETE，关键是最后这一位

    CreateFileW = ctypes.windll.kernel32.CreateFileW
    CreateFileW.restype = wintypes.HANDLE
    CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                            wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD,
                            wintypes.HANDLE]

    h = CreateFileW(path, GENERIC_READ, FILE_SHARE_ALL, None, OPEN_EXISTING, 0, None)
    if h == wintypes.HANDLE(-1).value or h == -1:
        raise OSError(ctypes.get_last_error(), "CreateFileW 失败: " + path)

    try:
        chunks = []
        buf = ctypes.create_string_buffer(1 << 20)
        read = wintypes.DWORD(0)
        while True:
            ok = ctypes.windll.kernel32.ReadFile(
                h, buf, len(buf), ctypes.byref(read), None)
            if not ok:
                raise OSError(ctypes.get_last_error(), "ReadFile 失败: " + path)
            if read.value == 0:
                break
            chunks.append(buf.raw[:read.value])
        return b"".join(chunks)
    finally:
        ctypes.windll.kernel32.CloseHandle(h)


class Deck:
    """一个已打开的 pptx。只暴露本流水线真正需要的部分。"""

    def __init__(self, path):
        self.path = path
        self._zip = zipfile.ZipFile(io.BytesIO(_read_shared(path)))
        self._names = set(self._zip.namelist())

    def read(self, name):
        return self._zip.read(name)

    def exists(self, name):
        return name in self._names

    def slide_names(self):
        """按 slide 编号【数值】排序 —— 字符串排序会把 slide10 排在 slide2 前面。"""
        got = [n for n in self._names if re.match(r"^ppt/slides/slide\d+\.xml$", n)]
        return sorted(got, key=lambda n: int(re.search(r"(\d+)", n.split("/")[-1]).group(1)))

    def slide_size(self):
        """幻灯片画布尺寸（EMU）。用来把 <a:off x> 归一化。"""
        root = ET.fromstring(self.read("ppt/presentation.xml"))
        sz = root.find("p:sldSz", NS)
        if sz is None:
            return None
        return int(sz.get("cx")), int(sz.get("cy"))

    def rels(self, slide_name):
        """slideN.xml → {rId: 'ppt/media/image3.jpeg'}"""
        base = slide_name.split("/")[-1]
        rels_name = "ppt/slides/_rels/" + base + ".rels"
        if not self.exists(rels_name):
            return {}
        out = {}
        root = ET.fromstring(self.read(rels_name))
        for rel in root.findall("rel:Relationship", NS):
            out[rel.get("Id")] = rel.get("Target").replace("../", "ppt/")
        return out

    def pictures(self, slide_name):
        """这一页上的所有图片，【按视觉左右排序】。

        返回 [{rid, media, x, y, cx, cy, src_rect, name}]。
        排序依据是 <a:off x>，不是它们在 XML 里出现的先后。
        """
        rels = self.rels(slide_name)
        root = ET.fromstring(self.read(slide_name))
        pics = []

        for pic in root.iter("{%s}pic" % NS["p"]):
            blip = pic.find(".//a:blip", NS)
            if blip is None:
                continue
            rid = blip.get("{%s}embed" % NS["r"])
            if not rid or rid not in rels:
                continue

            xfrm = pic.find(".//a:xfrm", NS)
            off = xfrm.find("a:off", NS) if xfrm is not None else None
            ext = xfrm.find("a:ext", NS) if xfrm is not None else None

            # 作者的裁切窗口。它透露了作者认为的主体在哪，是配对与构图的线索。
            src_rect = pic.find(".//a:srcRect", NS)

            name_el = pic.find(".//p:cNvPr", NS)
            pics.append({
                "rid": rid,
                "media": rels[rid],
                "x": int(off.get("x")) if off is not None else None,
                "y": int(off.get("y")) if off is not None else None,
                "cx": int(ext.get("cx")) if ext is not None else None,
                "cy": int(ext.get("cy")) if ext is not None else None,
                "src_rect": dict(src_rect.attrib) if src_rect is not None else None,
                "name": name_el.get("name") if name_el is not None else None,
            })

        # ★ 位置排序。x 缺失（极少见）时退回 y，再退回原始顺序——
        #   但绝不退回"XML 里先出现的算左边"，那正是错的那条。
        for i, p in enumerate(pics):
            p["_i"] = i
        pics.sort(key=lambda p: (p["x"] if p["x"] is not None else 1 << 62,
                                 p["y"] if p["y"] is not None else 1 << 62,
                                 p["_i"]))
        return pics

    def slide_text(self, slide_name):
        """这一页的全部文字，按出现顺序。用来判断这页是不是题、标题是什么。"""
        root = ET.fromstring(self.read(slide_name))
        out = []
        for t in root.iter("{%s}t" % NS["a"]):
            if t.text and t.text.strip():
                out.append(t.text.strip())
        return out


if __name__ == "__main__":
    utf8_console()
    d = Deck(sys.argv[1])
    size = d.slide_size()
    print("画布 %s EMU  (%.2f x %.2f in)" % (size, size[0] / 914400, size[1] / 914400))
    for name in d.slide_names():
        pics = d.pictures(name)
        text = d.slide_text(name)
        print("\n%s  %d 张图  %s" % (name.split("/")[-1], len(pics),
                                     ("文字: " + " | ".join(text)) if text else ""))
        for p in pics:
            frac = (p["x"] / size[0]) if (p["x"] is not None and size) else None
            print("    x=%-9s (%.3f)  %-28s %sx%s" % (
                p["x"], frac if frac is not None else -1, p["media"].split("/")[-1],
                p["cx"], p["cy"]))
