// Throwaway CI diagnostic for #34: Chromium health and memory across iPhone, then iPad, simulator boots.
import { type Browser, chromium } from "playwright-core";

const sh = async (cmd: string[]) => {
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out.trim();
};
const t0 = performance.now();
const at = () => `${Math.round((performance.now() - t0) / 1000)}s`.padStart(5);
const mem = async () => {
  const free = (await sh(["memory_pressure", "-Q"])).match(/(\d+)%/)?.[1];
  const swap = (await sh(["sysctl", "-n", "vm.swapusage"])).match(/used = (\S+)/)?.[1];
  return `free=${free}% swap=${swap}`;
};
const timed = async (fn: () => Promise<unknown>) => {
  const t = performance.now();
  try {
    await fn();
    return `${Math.round(performance.now() - t)}ms`;
  } catch (error) {
    return `FAIL ${Math.round(performance.now() - t)}ms ${String(error).split("\n")[0]!.slice(0, 80)}`;
  }
};
const page = async (browser: Browser) => {
  const p = await browser.newPage();
  try {
    await p.goto("data:text/html,<p>probe</p>", { timeout: 30_000 });
  } finally {
    await p.close();
  }
};
const fresh = () =>
  timed(async () => {
    const b = await chromium.launch({ channel: "chromium", timeout: 30_000 });
    try {
      await page(b);
    } finally {
      await b.close().catch(() => {});
    }
  });

console.log(`mem bytes / cpus: ${await sh(["sysctl", "-n", "hw.memsize", "hw.ncpu"])}`.replace(/\n/g, " / "));
// Six idle browsers, as the pilot keeps (one per width plus bpBrowser); the first one is probed.
const idle = await Promise.all(Array.from({ length: 6 }, () => chromium.launch({ channel: "chromium" })));
for (const b of idle) await page(b);
const devices = JSON.parse(await sh(["xcrun", "simctl", "list", "devices", "available", "-j"])) as {
  devices: Record<string, Array<{ udid: string; name: string }>>;
};
const find = (name: string) =>
  Object.entries(devices.devices)
    .filter(([runtime]) => runtime.includes("iOS"))
    .flatMap(([, list]) => list)
    .find((d) => d.name === name)?.udid;
const probeFor = async (label: string, seconds: number, boot?: string) => {
  let booted = "";
  if (boot) {
    console.log(`${at()} ${label}: boot ${boot}`);
    void sh(["xcrun", "simctl", "bootstatus", boot, "-b"]).then(() => (booted = at().trim()));
  }
  const end = performance.now() + seconds * 1000;
  while (performance.now() < end) {
    const [idleMs, freshMs, m] = [await timed(() => page(idle[0]!)), await fresh(), await mem()];
    console.log(`${at()} ${label} booted=${booted || "-"} idle=${idleMs} fresh=${freshMs} ${m}`);
    await Bun.sleep(5_000);
  }
};
await probeFor("baseline", 20);
await probeFor("iphone", 420, find("iPhone 17"));
await probeFor("ipad+iphone", 420, find(process.env.MARKSWIFT_SIMULATOR_IPAD ?? "iPad Pro 13-inch (M5)"));
await Promise.all(idle.map((b) => b.close().catch(() => {})));
process.exit(0);
