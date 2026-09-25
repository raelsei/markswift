export const sample = {
  html: `<article class="ticket">
  <div class="ticket-top">
    <span class="ticket-number">No. 041</span>
    <span class="ticket-label">Weekend note</span>
  </div>
  <h1>Get outside.</h1>
  <p>Fresh air, a longer route, and no rush to get home.</p>
  <div class="ticket-bottom">
    <span>Saturday · 09:30</span>
    <button type="button">See route</button>
  </div>
</article>`,
  css: `* { box-sizing: border-box; }
body { margin: 0; padding: 24px; background: #eef2f6; font-family: Arial, sans-serif; color: #1d3543; }
.ticket { max-width: 345px; padding: 24px; border: 1px solid #d6e1e7; border-radius: 18px; background: white; }
.ticket-top, .ticket-bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ticket-number { font-size: 12px; font-weight: 700; color: #337c6a; }
.ticket-label { font-size: 12px; color: #748692; }
h1 { margin: 28px 0 9px; font-size: 30px; letter-spacing: -1px; }
p { margin: 0; color: #6d808b; font-size: 14px; line-height: 1.5; }
.ticket-bottom { margin-top: 29px; padding-top: 18px; border-top: 1px solid #e5ebef; font-size: 12px; }
button { border: 0; border-radius: 8px; padding: 10px 13px; background: #337c6a; color: white; font-size: 12px; font-weight: 700; }`,
};
