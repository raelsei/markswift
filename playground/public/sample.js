export const sample = {
  html: `<article class="card">
  <div class="heading">
    <span class="avatar">MK</span>
    <div>
      <p class="eyebrow">This week's route</p>
      <h1>Take it slow.</h1>
    </div>
  </div>
  <div class="artwork">
    <span class="sun"></span>
    <span class="hill hill-back"></span>
    <span class="hill hill-front"></span>
    <span class="art-label">A little fresh air.</span>
  </div>
  <div class="body">
    <span class="tag">Weekend plan</span>
    <h2>Just outside the city</h2>
    <p>A new trail, fresh coffee, and a morning without rushing.</p>
    <div class="bottom">
      <span class="duration">3 stops · 2 hours</span>
      <button>Explore route</button>
    </div>
  </div>
</article>`,
  css: `* { box-sizing: border-box; }
body { margin: 0; padding: 24px; background: #eef2f6; font-family: -apple-system, sans-serif; color: #213849; }
.card { width: 100%; background: #ffffff; border-radius: 20px; overflow: hidden; }
.heading { display: flex; align-items: center; gap: 12px; padding: 20px; }
.avatar { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: #e5eee8; border-radius: 12px; color: #426753; font-size: 12px; font-weight: 700; }
.eyebrow { margin: 0 0 4px; color: #7d8990; font-size: 11px; }
h1 { margin: 0; font-size: 18px; font-weight: 650; }
.artwork { position: relative; height: 148px; overflow: hidden; background: #c8deea; }
.sun { position: absolute; top: 22px; right: 56px; width: 44px; height: 44px; border-radius: 50%; background: #fff0bb; }
.hill { position: absolute; width: 300px; height: 180px; border-radius: 50%; }
.hill-back { left: -55px; top: 70px; background: #90b7a5; }
.hill-front { right: -65px; top: 94px; background: #527f6d; }
.art-label { position: absolute; left: 20px; bottom: 14px; color: white; font-size: 10px; font-weight: 600; }
.body { padding: 20px; }
.tag { color: #527f6d; font-size: 10px; font-weight: 600; }
h2 { font-size: 20px; margin: 9px 0; letter-spacing: -0.5px; }
.body p { color: #7a8791; font-size: 12px; line-height: 1.7; margin: 0; }
.bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 22px; }
.duration { font-size: 10px; color: #7a8791; }
button { background: #315e50; color: white; border: 0; border-radius: 9px; padding: 11px 14px; font-size: 11px; font-weight: 600; }
@media (prefers-color-scheme: dark) {
  body { background: #17232b; color: #e5eeeb; }
  .card { background: #24343e; }
  .body p, .duration, .eyebrow { color: #a4b6c0; }
  .tag { color: #9cc6b0; }
}`,
};
