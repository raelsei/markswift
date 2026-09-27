/** Independent structures for intrinsic flex admission, native sizing and visual proof. */
export const intrinsicFlexControls = [
  { id: "intrinsic-chips", labels: ["Computed CSS", "Native SwiftUI", "Responsive layouts", "Semantic controls", "Text geometry", "Paint layers"], css: "flex-wrap:wrap" },
  { id: "intrinsic-cross-sizes", labels: ["Small words", "Large words", "Compact content", "Another label"], css: "flex-wrap:wrap;align-items:center", extra: ".item:nth-child(2){font:700 18px/24px system-ui;padding:3px 12px}.item:nth-child(3){font:12px/18px system-ui;padding:9px 7px}" },
  { id: "intrinsic-spread-actions", labels: ["Status", "Open link", "Save changes"], tags: ["span", "a", "button"], css: "justify-content:space-between;align-items:flex-start" },
  { id: "intrinsic-singleton-shrink", labels: ["Measure the available width before translating complex content into reusable native components", "Next label"], css: "flex-wrap:wrap" },
  { id: "intrinsic-auto-minimum", labels: ["SupercalifragilisticexpialidociousSupercalifragilisticexpialidociousSupercalifragilisticexpialidocious", "Next label"], css: "flex-wrap:wrap" },
  { id: "intrinsic-no-shrink", labels: ["Measure the available width before translating complex content into reusable native components", "Next label"], css: "flex-wrap:wrap", extra: ".item:first-child{flex-shrink:0}" },
  { id: "intrinsic-zero-minimum", labels: ["Supercalifragilisticexpialidocious words", "Supercalifragilisticexpialidocious words"], css: "justify-content:space-between", extra: ".item{min-width:0}" },
] as const;

export function intrinsicFlexControl(profile: (typeof intrinsicFlexControls)[number]) {
  const tags: readonly string[] = "tags" in profile ? profile.tags : [];
  const html = `<main id="corpus" data-markswift-root><section id="flex">${profile.labels.map((text, index) => {
    const tag = tags[index] ?? "span";
    return `<${tag} id="item${index}" class="item"${tag === "a" ? ' href="#details"' : tag === "button" ? ' onclick="saveChanges()"' : ""}>${text}</${tag}>`;
  }).join("")}</section></main>`;
  const css = `html,body{margin:0;background:white}*{box-sizing:border-box}#corpus{width:100%;height:420px;padding:16px;font:14px/20px system-ui;color:black}#flex{display:flex;column-gap:8px;row-gap:8px;align-items:flex-start;${profile.css}}.item{font:inherit;color:inherit;text-align:start;appearance:none;border:0;border-radius:7px;margin:0;padding:7px 10px;background:#e0e7ff}a.item{text-decoration:underline}${"extra" in profile ? profile.extra : ""}`;
  return { html, css };
}
