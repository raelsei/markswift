// Throwaway CI diagnostic for #34: does a warm (second) simulator boot stall Chromium like a first boot?
import { type Browser, chromium } from "playwright-core";

const sh = async (cmd: string[]) => {
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out.trim();
};
const t0 = performance.now();
const at = () => `${Math.round((performance.now() - t0) / 1000)}s`.padStart(5);
const stats = async () => {
  const free = (await sh(["memory_pressure", "-Q"])).match(/(\d+)%/)?.[1];
  const load = (await sh(["sysctl", "-n", "vm.loadavg"])).replace(/[{}]/g, "").trim();
  return `free=${free}% load=${load}`;
};
/** newPage + goto on the long-lived browser, bounded: a stalled probe is reported, not awaited. */
const probe = async (browser: Browser) => {
  const t = performance.now();
  const work = (async () => {
    const p = await browser.newPage();
    await p.goto("data:text/html,<p>probe</p>");
    await p.close();
  })();
  const result = await Promise.race([work.then(() => "ok"), Bun.sleep(20_000).then(() => "STALL>20s")]);
  return result === "ok" ? `${Math.round(performance.now() - t)}ms` : result;
};
const devices = JSON.parse(await sh(["xcrun", "simctl", "list", "devices", "available", "-j"])) as {
  devices: Record<string, Array<{ udid: string; name: string }>>;
};
const find = (name: string) =>
  Object.entries(devices.devices)
    .filter(([runtime]) => runtime.includes("iOS"))
    .flatMap(([, list]) => list)
    .find((d) => d.name === name)!.udid;
const iphone = find("iPhone 17");
const ipad = find("iPad Pro 13-inch (M5)");
const browser = await chromium.launch({ channel: "chromium" });
await probe(browser);

/** Boot `udid`, probing every 10 s until `after` seconds past bootstatus (or 15 min), then optionally shut down. */
const phase = async (label: string, udid: string, after: number, shutdown: boolean) => {
  const start = performance.now();
  let bootedAt: number | undefined;
  void sh(["xcrun", "simctl", "bootstatus", udid, "-b"]).then(() => (bootedAt = performance.now()));
  let stalls = 0;
  while (performance.now() - start < 900_000 && (bootedAt === undefined || performance.now() - bootedAt < after * 1000)) {
    const r = await probe(browser);
    if (r.startsWith("STALL")) stalls++;
    const booted = bootedAt === undefined ? "-" : `${Math.round((bootedAt - start) / 1000)}s`;
    console.log(`${at()} ${label} booted=${booted} probe=${r} ${await stats()}`);
    await Bun.sleep(10_000);
  }
  console.log(`${at()} ${label} SUMMARY stalls=${stalls}`);
  if (shutdown) console.log(`${at()} ${label} shutdown: ${await sh(["xcrun", "simctl", "shutdown", udid])}`);
};
await phase("iphone-first", iphone, 420, true);
await phase("iphone-warm", iphone, 300, true);
await phase("ipad-first", ipad, 420, true);
await phase("ipad-warm", ipad, 300, true);
await browser.close();
process.exit(0);
