#!/usr/bin/env python3
"""从页面固定文案生成霞鹜文楷 UI 字体子集。

用法：python3 dev/make-font-subset.py
扫描 index.html 与 web/js 下固定中文文案，输出 web/assets/fonts/wenkai-ui.woff2。
文案变化后重跑即可。需要 fonttools（pip install fonttools brotli）。
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "dev/fonts/LXGWWenKaiScreen.ttf"
OUT = ROOT / "web/assets/fonts/wenkai-ui.woff2"
# 只扫描固定界面文案；terms.js / extract-rules.js 里的大词表不是一个字库能覆盖的
CHARS = [
    ROOT / "web/index.html",
    ROOT / "web/js/main.js",
    ROOT / "web/js/render.js",
    ROOT / "web/js/export.js",
    ROOT / "web/js/llm.js",
]

CJK = re.compile(r"[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]")
# 固定 UI 文案里用到的西文/数字字符，保证「前人做过吗」周边文字不缺字
ASCII = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ·—×/…“”‘’《》（）"

def collect() -> str:
    seen = set(ASCII)
    for path in CHARS:
        text = path.read_text(encoding="utf-8")
        seen.update(CJK.findall(text))
    return "".join(sorted(seen))

def main() -> int:
    if not SRC.exists():
        print(f"缺少源字体 {SRC}", file=sys.stderr)
        return 1
    text = collect()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "pyftsubset", str(SRC),
        "--text=" + text,
        "--flavor=woff2",
        "--output-file=" + str(OUT),
        "--layout-features=",
        "--no-hinting",
        "--desubroutinize",
        "--name-IDs=*",
    ]
    subprocess.run(cmd, check=True)
    size = OUT.stat().st_size
    print(f"{OUT.relative_to(ROOT)}: {len(text)} 字符, {size/1024:.1f} KB")
    if size > 150 * 1024:
        print("警告：超过 150KB 目标，请缩小文案集合", file=sys.stderr)
        return 2
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
