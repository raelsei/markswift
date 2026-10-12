/** Inline sources for repeated-sibling extraction (plan 030): rows with controls, icons, a grid and radios. */
export const SETTINGS = `<form data-markswift-root class="f"><h3>Email</h3>
 ${["Marketing", "Security", "Social"].map((t, i) => `<div class="row"><div><label for="c${i}">${t}</label><p>About ${t.toLowerCase()}</p></div><input id="c${i}" type="checkbox" role="switch" ${i ? "checked" : ""}><button type="button">Edit</button></div>`).join("")}
 <button type="button" onclick="save()">Save</button></form>`;
export const SETTINGS_CSS = `body{margin:0} .f{width:360px;padding:16px;display:flex;flex-direction:column;gap:12px;font:14px system-ui;background:#fff;color:#111}
 .row{display:flex;align-items:center;gap:12px;border:1px solid #ddd;border-radius:8px;padding:12px} .row>div{flex:1}
 p{margin:0;color:#666} h3{margin:0} @media (prefers-color-scheme: dark){.f{background:#16181d;color:#f2f2f2} p{color:#a0a4ab}}`;
export const ICONS = `<ul data-markswift-root class="l">${["M4 12h16", "M12 4v16", "M5 5l14 14"].map((d, i) => `<li><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="${d}"/></svg><span>Item ${i + 1}</span></li>`).join("")}</ul>`;
export const ICONS_CSS = `body{margin:0} .l{width:300px;margin:0;padding:12px;list-style:none;display:flex;flex-direction:column;gap:8px;font:15px system-ui;background:#fff;color:#123}
 li{display:flex;align-items:center;gap:10px}`;
export const GRID_RADIO = `<main data-markswift-root class="m"><div class="g">${[1, 2, 3, 4].map((n) => `<div class="t"><b>Tile ${n}</b><span>${n}0 items</span></div>`).join("")}</div>
 ${["a", "b", "c"].map((v) => `<div class="o"><input type="radio" id="p${v}" name="plan" value="${v}" ${v === "b" ? "checked" : ""}><label for="p${v}">Plan ${v.toUpperCase()}</label></div>`).join("")}</main>`;
export const GRID_RADIO_CSS = `body{margin:0} .m{width:320px;padding:12px;display:flex;flex-direction:column;gap:8px;font:14px system-ui;background:#fff;color:#111}
 .g{display:grid;grid-template-columns:1fr 1fr;gap:8px} .t{display:flex;flex-direction:column;gap:4px;padding:8px;border:1px solid #ccc;border-radius:6px}
 .o{display:flex;align-items:center;gap:8px}`;
