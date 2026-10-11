/** A realistic scrolling product list: the fixture the conversion and Swift build budgets measure. */
import { PNG } from "pngjs";

// One deterministic 48×48 image shared by every card, so the conversion must emit exactly one image file.
const png = new PNG({ width: 48, height: 48 });
for (let y = 0; y < 48; y++) {
  for (let x = 0; x < 48; x++) {
    const i = (y * 48 + x) * 4;
    png.data[i] = x * 5;
    png.data[i + 1] = y * 5;
    png.data[i + 2] = 128;
    png.data[i + 3] = 255;
  }
}
const IMAGE = PNG.sync.write(png).toString("base64");

const STYLE = `:root{color-scheme:light dark}
body{margin:0;font:15px/1.4 system-ui,-apple-system,sans-serif;background:#f4f4f5}
@media (prefers-color-scheme:dark){body{background:#18181b;color:#fafafa}.card{background:#27272a!important}}
main{width:390px;padding:16px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px}
.card{position:relative;background:#fff;border-radius:14px;padding:12px;display:flex;gap:12px;align-items:center;box-shadow:0 1px 3px rgba(0,0,0,.12),0 8px 24px rgba(0,0,0,.08)}
.card img{width:48px;height:48px;border-radius:10px;flex:none}
.body{flex:1;min-width:0}
.title{font-weight:600;font-size:16px;margin:0}
.desc{margin:2px 0 0;color:#71717a;font-size:13px}
.btn{border:0;border-radius:999px;padding:6px 12px;background:#2563eb;color:#fff;font:600 13px system-ui;box-shadow:0 2px 6px rgba(37,99,235,.4)}
.glow{position:absolute;inset:0;border-radius:14px;opacity:0;pointer-events:none;background:radial-gradient(circle at 30% 0,rgba(37,99,235,.35),transparent 60%)}
.card:hover .glow{opacity:1}
.badge{display:inline-block;margin-top:6px;padding:2px 8px;border-radius:6px;background:#dcfce7;color:#166534;font-size:11px;font-weight:600}
`;

export function bigPageHtml(cards = 80): string {
  let body = "";
  for (let i = 0; i < cards; i++) {
    body += `<article class="card"><div class="glow"></div><img src="data:image/png;base64,${IMAGE}" alt="Item ${i}"><div class="body"><h3 class="title">Item number ${i}</h3><p class="desc">Short description for card ${i}, two lines at most on a phone.</p><span class="badge">In stock</span></div><button class="btn">Buy</button></article>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${STYLE}</style></head><body><main data-markswift-root>${body}</main></body></html>`;
}
