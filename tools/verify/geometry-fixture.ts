/** Empty painted boxes avoid font differences while exercising native allocation and transforms. */
export const GEOMETRY_HTML = `<main id="geometry-root" data-markswift-root>
<section id="flex"><div id="flex-a"></div><div id="flex-b"></div></section>
<section id="grid"><div id="grid-a"></div><div id="grid-b"></div><div id="grid-c"></div></section>
<section id="text-auto"><article id="text-auto-a">${"M".repeat(45)}</article><article id="text-auto-b">${"M".repeat(45)}</article></section>
<section id="text-min"><article id="text-min-a">${"M".repeat(45)}</article><article id="text-min-b">${"M".repeat(45)}</article></section>
<section id="text-max"><article id="text-max-a">${"M".repeat(45)}</article><article id="text-max-b">${"M".repeat(45)}</article></section>
<section id="text-fixed"><article id="text-fixed-a">${"M".repeat(45)}</article><article id="text-fixed-b">${"M".repeat(45)}</article></section>
<section id="effects"><div id="translated"></div><div id="rotated"></div></section>
<section id="scroll"><div id="scroll-a"></div><div id="scroll-b"></div></section>
</main>`;
export const GEOMETRY_CSS = `body{margin:0}*{box-sizing:border-box}main{width:100%;height:960px;padding:16px;background:#fff}
section{margin-bottom:16px}#flex{display:flex;gap:12px;align-items:stretch}#flex>div{flex:1 1 0%;min-width:0;height:44px;background:#2c7; border:2px solid #125}#flex-b{flex-grow:2}
#grid{display:grid;grid-template-columns:64px minmax(0,1fr) minmax(0,2fr);gap:8px;grid-auto-rows:40px}#grid>div{background:#d84;border:2px solid #851}#grid-a{grid-column:span 2}
section[id^="text-"]{display:flex;gap:12px;align-items:stretch;font:16px/20px monospace}section[id^="text-"]>article{flex:1 1 0%;min-width:0;word-break:break-all;background:#fdc;overflow:hidden}#text-min{min-height:100px}#text-max{max-height:40px}#text-fixed{height:80px}
#effects{display:flex;gap:16px;height:64px;align-items:start}#effects>div{width:60px;height:40px;flex:none;background:#58d}#translated{transform:translate(7px,5px)}#rotated{transform:rotate(12deg)}
#scroll{height:80px;overflow:auto}#scroll>div{height:60px;background:#b6a}#scroll-b{background:#745}`;
export const GEOMETRY_WIDTHS = [320, 390, 500] as const;
