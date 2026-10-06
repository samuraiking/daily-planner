"""生成 demo.html：在本地浏览器直接打开即可预览（使用内存模拟数据，不保存）。
用法：python tools/build_demo.py"""
from pathlib import Path
root = Path(__file__).resolve().parent.parent
app = (root / "index.html").read_text(encoding="utf-8")
html = ('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<script src="demo/mock-claude.js"></script></head><body>\n' + app + '\n</body></html>\n')
(root / "demo.html").write_text(html, encoding="utf-8")
print("demo.html written")
