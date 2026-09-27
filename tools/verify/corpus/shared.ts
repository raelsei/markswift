import type { CorpusCategory, CorpusExample } from "../corpus-model.ts";

export function example(key: string, body: string, css = "", extra: Omit<CorpusExample, "key" | "body" | "css"> = {}): CorpusExample {
  return { key, body, css, ...extra };
}

export function category(id: string, title: string, features: readonly string[], examples: readonly CorpusExample[]): CorpusCategory {
  if (examples.length !== 6) throw new Error(`Corpus category ${id} must have six authored structures`);
  return { id, title, features, examples };
}

export const baseCss = `
html,body{margin:0;background:#f6f8fb}:root{--surface:#fff;--blue:#dbeafe;--green:#dcfce7;--amber:#fef3c7}*{box-sizing:border-box}
#corpus{width:100%;padding:16px;background:#f6f8fb;color:#243044;font:14px/20px system-ui}
h1{font:700 23px/28px system-ui;margin:0 0 16px}h2{font:700 18px/24px system-ui;margin:0 0 10px}
h3{font:600 15px/20px system-ui;margin:0 0 6px}p{margin:0 0 12px}ul,ol{margin:0 0 12px;padding-left:24px}
li{margin:0 0 4px}a{color:#2563eb;text-decoration:underline}button,input,textarea,select{font:inherit}
button{padding:8px 12px;border:1px solid #b8c4d6;border-radius:6px;background:#fff;color:#243044}
input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),textarea,select{max-width:100%;padding:6px 8px;border:1px solid #b8c4d6;border-radius:4px;background:#fff;color:#243044}
label{display:block;margin-bottom:6px}figure{margin:0}figcaption{margin-top:6px;color:#52647d}
.stack>*+*{margin-top:12px}.row{display:flex;gap:10px;align-items:center}.spread{display:flex;justify-content:space-between;gap:10px;align-items:center}
.panel{padding:12px;background:#fff;border:1px solid #d2dbe8;border-radius:8px}.muted{color:#52647d}.small{font-size:12px;line-height:17px}
.blue{background:#dbeafe}.green{background:#dcfce7}.amber{background:#fef3c7}.pink{background:#fce7f3}
.badge{display:inline-block;padding:3px 7px;border-radius:4px;background:#dbeafe;color:#243044;font-size:12px;line-height:16px}
.tile{padding:10px;min-width:0}.field{margin-bottom:12px}.field input,.field textarea{width:100%}
table{color:inherit;border-collapse:separate;border-spacing:0;width:100%}th,td{text-align:left;padding:8px;border-bottom:1px solid #d2dbe8}th{font-weight:600;background:#dbeafe}
caption{text-align:left;margin-bottom:10px}pre{margin:0;padding:12px;background:#e2e8f0;white-space:pre-wrap;font:13px/18px monospace}
@media(prefers-color-scheme:dark){:root{--surface:#253247;--blue:#243b59;--green:#234238;--amber:#4c3a24}html,body,#corpus{background:#161e2b}#corpus{color:#edf0f6}
.panel{background:#253247;border-color:#51627b}.panel,button,input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),textarea,select{background:#253247;border-color:#51627b}button,input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),textarea,select{color:#edf0f6}
.muted,figcaption{color:#b6c3d7}.blue,th,.badge{background:#243b59}.green{background:#234238}.amber{background:#4c3a24}.pink{background:#492c42}.badge{color:#edf0f6}pre{background:#2c394c}a{color:#93c5fd}th,td{border-color:#51627b}}
`;

export const landscapeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect width="240" height="120" fill="#dbeafe"/><circle cx="185" cy="30" r="17" fill="#fbbf24"/><path d="M0 100L65 28L132 100Z" fill="#478a69"/><path d="M73 120L149 46L240 120Z" fill="#285d55"/><rect y="100" width="240" height="20" fill="#1e4552"/></svg>`;
export const landscapeUrl = `data:image/svg+xml,${encodeURIComponent(landscapeSvg)}`;
export const iconSvg = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 12l4 4L19 6" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
