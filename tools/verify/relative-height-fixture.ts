import type { GeometryProofFixture } from "./geometry-proof.ts";

/** Fixed pixel paint offsets, including nested offsets, leave normal flow slots unchanged. */
export const RELATIVE_GEOMETRY_FIXTURE: GeometryProofFixture = {
  name: "RelativeGeometry", selector: "#relative-root", height: 400,
  html: `<main id="relative-root" data-markswift-root><section id="shifted"><div id="nested"></div></section><div id="following"></div>
<section id="flex"><div id="flex-shift"></div><div id="flex-next"></div></section>
<section id="grid"><div id="grid-shift"></div><div id="grid-next"></div></section>
<section id="rtl"><div id="both-rtl" dir="ltr"></div></section><section id="ltr"><div id="both-ltr" dir="rtl"></div></section></main>`,
  css: `body{margin:0}*{box-sizing:border-box}main{width:100%;height:400px;padding:16px;background:white}section{margin:0 0 12px}div{height:24px;background:#def}
#shifted{position:relative;left:12px;top:8px;padding:4px}#nested{position:relative;right:5px;bottom:3px}
#following{margin-bottom:12px}#flex{display:flex;gap:10px}#flex>div{flex:1 1 0%;min-width:0}#flex-shift{position:relative;left:-7px;top:6px}
#grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:10px}#grid-shift{position:relative;left:5px;bottom:4px}
#rtl{direction:rtl}#ltr{direction:ltr}#rtl>div,#ltr>div{position:relative;left:10px;right:20px;top:3px;bottom:9px}`,
};

/** Padding prevents a flex item's last paragraph margin from collapsing through its border. */
export const ALLOCATED_MARGIN_FIXTURE: GeometryProofFixture = {
  name: "AllocatedMarginGeometry", selector: "#margin-root", height: 400,
  html: `<main id="margin-root" data-markswift-root><section id="tracks"><aside id="sidebar"><h3 id="tools">Tools</h3><p id="stages">Capture Analyze Export</p></aside><article id="pane"><h2 id="heading">Current component</h2><p id="description">Shared flexible text can grow naturally at a narrower width.</p></article></section></main>`,
  css: `body{margin:0}*{box-sizing:border-box}main{width:100%;height:400px;padding:16px;font:16px/20px system-ui;background:white}section{display:flex;gap:12px}aside{flex:0 0 82px}article{flex:1 1 0px}aside,article{padding:10px;min-width:0;background:#def}h3{font:700 15px/20px system-ui;margin:0 0 6px}h2{font:700 18px/24px system-ui;margin:0 0 10px}p{margin:0 0 12px}aside p{font:13px/17px system-ui}`,
};

/** Negative margins can place a relative child wholly inside its parent's padding. */
export const HANGING_RELATIVE_FIXTURE: GeometryProofFixture = {
  name: "HangingRelativeGeometry", selector: "#hanging-root", height: 60,
  html: `<main id="hanging-root" data-markswift-root><div id="hanging-child"></div></main>`,
  css: `body{margin:0}*{box-sizing:border-box}main{width:100%;height:60px;padding-left:50px;background:white}#hanging-child{width:20px;height:20px;margin-left:-40px;position:relative;left:5px;background:red}`,
};
