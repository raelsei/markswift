/** Self-contained layout cases shared by Chrome checks and local native comparisons. */
export const FLOW_HTML = `<main data-markswift-root id="flow-root">
  <section id="unequal-grid" class="grid unequal"><div id="unequal-a"></div><div id="unequal-b"></div></section>
  <section id="hole-grid" class="grid three"><div id="hole-a"></div><div id="hole-b"></div><div id="hole-c"></div><div id="hole-d"></div><div id="hole-e"></div></section>
  <section id="aligned-grid" class="grid aligned"><div></div><div></div><div></div><div></div></section>
  <section id="span-grid" class="grid two"><div id="span-a"></div><div></div><div></div></section>
  <section id="empty-grid" class="grid three"><div id="empty-a"></div><div id="empty-b"></div></section>
  <section id="areas-grid" class="grid areas"><div id="area-side"></div><div id="area-main"></div><div id="area-head"></div></section>
  <section id="overlap-grid" class="grid two"><div id="overlap-front"></div><div id="overlap-back"></div></section>
  <section id="native-wrap" class="wrap"><div></div><div></div><div></div></section>
  <section id="single-wrap" class="wrap single"><div></div><div></div><div></div></section>
  <section id="reverse-wrap" class="wrap reverse"><div></div><div></div><div></div></section>
  <section id="column-wrap" class="wrap column"><div></div><div></div><div></div></section>
  <section id="distributed-wrap" class="wrap distributed"><div></div><div></div><div></div></section>
</main>`;

export const FLOW_CSS = `
  html,body{margin:0;font:16px/20px system-ui}
  #flow-root{box-sizing:border-box;width:100%;padding:16px;background:#f8f9fb;color:#14141c}
  @media(prefers-color-scheme:dark){#flow-root{background:#18181e;color:#f0f0f5}}
  section{margin-bottom:12px;box-sizing:border-box;padding:8px;border:2px solid #aaa}
  section>div{background:#dc503c}section>div:nth-child(even){background:#3c78dc}
  .grid{display:grid;gap:10px;grid-auto-rows:30px;align-content:start}
  .unequal{grid-template-columns:100px 1fr}.two,.aligned,.areas{grid-template-columns:repeat(2,minmax(0,1fr))}
  .three{grid-template-columns:repeat(3,minmax(0,1fr))}
  #hole-b{grid-column:3}#hole-c{grid-column:1;grid-row:2}
  #hole-d{grid-column:2;grid-row:2}#hole-e{grid-column:3;grid-row:2}
  .aligned{justify-items:end}.aligned>div:nth-child(1),.aligned>div:nth-child(4){width:20px}
  .aligned>div:nth-child(2),.aligned>div:nth-child(3){width:40px}
  #span-a{grid-column:span 2}
  #empty-grid{grid-template-rows:30px 30px 30px}#empty-b{grid-column:3;grid-row:3}
  .areas{grid-template-areas:'head head' 'side main'}
  #area-side{grid-area:side}#area-main{grid-area:main}#area-head{grid-area:head}
  #overlap-front,#overlap-back{grid-column:1;grid-row:1}
  #overlap-front{z-index:10;background:#dc503c}#overlap-back{z-index:0;background:#3c78dc}
  .wrap{display:flex;flex-wrap:wrap;gap:8px 10px;justify-content:center;align-items:flex-start;align-content:start}
  .wrap>div{width:120px;height:30px;flex:0 0 auto}
  .single>div{width:190px}.reverse{flex-wrap:wrap-reverse}
  .column{flex-direction:column;height:88px;justify-content:start}
  .distributed{height:140px;align-content:center}
`;
