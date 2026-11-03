"""Builds Receiving-Dashboard-Tutorial.pdf from tutorial.md.html.

Usage:  python docs/tutorial/build.py  (from the project root; needs Node + Playwright)
"""
import base64, html, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = ROOT / "docs" / "tutorial"
OUT_PDF = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "Receiving-Dashboard-Tutorial.pdf"

body = (HERE / "tutorial.md.html").read_text()
queries = (ROOT / "src" / "lib" / "queries.ts").read_text()

def sql_const(name):
    m = re.search(rf"export const {name}_SQL = `\n(.*?)\n`\.trim\(\);", queries, re.S)
    return m.group(1)

def img(match):
    file, cls = match.group(1), match.group(2)
    data = base64.b64encode((ROOT / "docs" / "screenshots" / file).read_bytes()).decode()
    return f'<img class="shot {cls}" src="data:image/png;base64,{data}">'

body = re.sub(r"\{\{IMG:([\w.-]+):([\w-]+)\}\}", img, body)
body = re.sub(r"\{\{SQL:(\w+)\}\}", lambda m: f"<pre class='sql'>{html.escape(sql_const(m.group(1)))}</pre>", body)

def box(x, y, title, cols, w=190):
    rows = "".join(f'<text x="{x+10}" y="{y+42+i*15}" class="c">{html.escape(c)}</text>' for i, c in enumerate(cols))
    h = 30 + len(cols) * 15 + 8
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" class="b"/>'
            f'<rect x="{x}" y="{y}" width="{w}" height="24" rx="6" class="h"/>'
            f'<rect x="{x}" y="{y+16}" width="{w}" height="8" class="h"/>'
            f'<text x="{x+10}" y="{y+17}" class="t">{title}</text>{rows}')

def line(x1, y1, x2, y2, label):
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" class="l"/>'
            f'<text x="{mx}" y="{my-4}" class="k" text-anchor="middle">{label}</text>')

diagram = f'''<svg viewBox="0 0 660 330" class="diagram" xmlns="http://www.w3.org/2000/svg">
<style>.b{{fill:#fff;stroke:#9aa6b2}}.h{{fill:#2a78d6}}.t{{fill:#fff;font:600 12px sans-serif}}
.c{{fill:#333;font:11px monospace}}.l{{stroke:#52514e;stroke-width:1.5}}.k{{fill:#52514e;font:10px sans-serif}}</style>
{line(200, 60, 240, 60, "1 → many")}
{line(105, 110, 105, 190, "")}<text x="112" y="155" class="k">1 → many</text>
{line(430, 60, 460, 60, "1 → many")}
{line(345, 120, 345, 190, "")}<text x="352" y="160" class="k">1 → many</text>
{line(200, 230, 240, 230, "")}<text x="205" y="222" class="k">many → 1</text>
{line(565, 120, 565, 190, "")}<text x="572" y="160" class="k">1 → many</text>
{line(460, 240, 430, 240, "")}<text x="420" y="232" class="k">many → 1</text>
{box(10, 20, "suppliers", ["supplier_id (PK)", "name", "city", "lead_time_days"])}
{box(240, 20, "purchase_orders", ["po_id (PK)", "po_number", "supplier_id (FK)", "ordered_on, expected_on"])}
{box(460, 20, "receipts", ["receipt_id (PK)", "po_id (FK)", "received_on", "received_by, source"])}
{box(10, 190, "products", ["product_id (PK)", "sku, name, category", "unit_cost", "supplier_id (FK)"])}
{box(240, 190, "po_lines", ["po_line_id (PK)", "po_id (FK)", "product_id (FK)", "qty_ordered, unit_cost"])}
{box(460, 190, "receipt_lines", ["receipt_line_id (PK)", "receipt_id (FK)", "po_line_id (FK)", "qty_received, qty_damaged"])}
</svg>
<p class="caption">PK = primary key (the row's ID). FK = foreign key (points at another table's ID). products → po_lines is also "1 → many": one product appears on many order lines.</p>'''
body = body.replace("{{DIAGRAM}}", diagram)

page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Receiving Dashboard Tutorial</title>
<style>
@page {{ size: Letter; margin: 0.7in 0.75in; }}
body {{ font: 10.5pt/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1b1b1a; }}
h1 {{ font-size: 30pt; margin: 0 0 8px; }}
h2 {{ font-size: 16pt; margin: 26px 0 8px; padding-top: 8px; border-top: 2px solid #2a78d6; break-after: avoid; }}
h3 {{ font-size: 12pt; margin: 18px 0 6px; break-after: avoid; }}
code {{ font: 9pt ui-monospace, Menlo, Consolas, monospace; background: #f0efeb; padding: 0 3px; border-radius: 3px; }}
pre {{ font: 8.6pt/1.45 ui-monospace, Menlo, Consolas, monospace; background: #f0efeb; padding: 10px 12px; border-radius: 6px; white-space: pre-wrap; break-inside: avoid; }}
.cover {{ break-after: page; padding-top: 40px; }}
.kicker {{ color: #2a78d6; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; font-size: 9pt; }}
.sub {{ font-size: 13pt; color: #52514e; }}
.meta {{ color: #7a7974; font-size: 9.5pt; }}
.shot {{ border: 1px solid #ddd; border-radius: 6px; display: block; margin: 10px auto; }}
.cover-shot {{ width: 100%; max-height: 6.3in; object-fit: cover; object-position: top; }}
.full {{ max-width: 100%; max-height: 7.4in; }}
.half {{ width: 70%; }}
.box {{ background: #eef4fc; border-left: 4px solid #2a78d6; padding: 10px 14px; border-radius: 4px; margin: 10px 0; break-inside: avoid; }}
.box ul {{ margin: 4px 0 0; }}
.note {{ color: #52514e; font-size: 9.5pt; border-left: 3px solid #ccc; padding-left: 10px; }}
table.t {{ border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 9.8pt; break-inside: avoid; }}
table.t td, table.t th {{ font-weight: 400; border-bottom: 1px solid #e2e1dc; padding: 5px 8px; text-align: left; vertical-align: top; }}
table.t th {{ color: #52514e; font-size: 9pt; font-weight: 700; }}
.qa p, .ex p {{ margin: 2px 0 8px; }}
.q {{ font-weight: 700; margin-top: 12px !important; break-after: avoid; }}
.ex {{ border: 1px solid #e2e1dc; border-radius: 6px; padding: 8px 12px; margin: 10px 0; break-inside: avoid; }}
.hint {{ color: #52514e; font-size: 9.8pt; }}
.diagram {{ width: 100%; margin: 6px 0 0; }}
.caption {{ color: #52514e; font-size: 9pt; margin-top: 0; }}
li {{ margin: 3px 0; }}
</style></head><body>{body}</body></html>"""

html_path = HERE / "tutorial.html"
html_path.write_text(page)
script = f"""
const {{ chromium }} = require('playwright');
(async () => {{
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://{html_path}');
  await p.pdf({{ path: {str(OUT_PDF)!r}, format: 'Letter', printBackground: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:8px;color:#888;width:100%;text-align:center">Receiving Dashboard tutorial · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
    margin: {{ top: '0.6in', bottom: '0.7in', left: '0.7in', right: '0.7in' }} }});
  await b.close();
}})();
"""
subprocess.run(["node", "-e", script], check=True)
html_path.unlink()
print("Wrote", OUT_PDF)
