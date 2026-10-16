/** The silent-pins page: one width media query, one container query, width and grid pins, validation styling. */
export const HTML =
  "<main data-markswift-root>" +
  '<div class="row"><div id="shrunk"></div><div id="wide"></div></div>' +
  '<div id="half">half</div>' +
  '<div id="fit"><i>1</i><i>2</i><i>3</i><i>4</i></div>' +
  '<div class="split"><p class="title">Title</p></div>' +
  '<div class="card"><div class="inner">inner</div></div>' +
  '<form><input id="email" type="email" required></form>' +
  "</main>";
export const CSS = `html,body{margin:0}main{width:390px;font:15px/20px system-ui}
  .row{display:flex;width:300px;height:20px}#shrunk{width:150px;box-sizing:border-box}#wide{width:300px;box-sizing:border-box}
  #half{width:50%}
  #fit{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px}#fit>i{height:20px;background:#ddd}
  @media (min-width: 600px){.split{display:flex}.title{font-size:24px}}
  .card{container-type:inline-size}@container (min-width: 400px){.inner{padding:20px}}
  input:invalid{border:2px solid red}`;
