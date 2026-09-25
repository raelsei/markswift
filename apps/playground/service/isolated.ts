import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ConversionInput } from "./input.ts";
import { InputError } from "./input.ts";
import type { ServiceResult } from "./output.ts";

export class WorkerError extends Error {
  constructor(message: string, readonly status = 500) { super(message); }
}

export interface WorkerOptions {
  timeoutMs: number;
  maxOutputBytes?: number;
  maxErrorBytes?: number;
  signal?: AbortSignal;
  /** Internal test seam; production runs the adjacent Bun worker. */
  command?: string[];
  onSpawn?: (pid: number) => void;
}

const worker = fileURLToPath(new URL("./worker.ts", import.meta.url));

/** One browser capture per process, so a deadline can stop Chrome and its descendants. */
export function convertIsolated(input: ConversionInput, options: WorkerOptions): Promise<ServiceResult> {
  const command = options.command ?? [process.execPath, worker];
  const child = spawn(command[0]!, command.slice(1), {
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (child.pid !== undefined) options.onSpawn?.(child.pid);
  const maxOutput = options.maxOutputBytes ?? 16 * 1024 * 1024;
  const maxError = options.maxErrorBytes ?? 64 * 1024;
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let outputBytes = 0;
  let errorBytes = 0;
  let failure: Error | undefined;

  const killGroup = () => {
    if (child.pid === undefined) return;
    try {
      if (process.platform === "win32") { child.kill("SIGKILL"); return; }
      // Chromium may start its own process group. Stop the worker before taking
      // a descendant snapshot, kill those children, then kill its group.
      try { process.kill(-child.pid, "SIGSTOP"); } catch { /* Already exited. */ }
      for (const pid of descendantPids(child.pid).reverse()) {
        try { process.kill(pid, "SIGKILL"); } catch { /* Child already exited. */ }
      }
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") child.kill("SIGKILL");
    }
  };
  const fail = (error: Error) => {
    if (failure) return;
    failure = error;
    killGroup();
  };

  return new Promise<ServiceResult>((resolve, reject) => {
    const timer = setTimeout(() => fail(new WorkerError("Conversion timed out. Try a smaller document.", 504)), options.timeoutMs);
    const onAbort = () => fail(new WorkerError("Request was cancelled.", 408));
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutput) fail(new WorkerError("Conversion output exceeds the service limit."));
      else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errorBytes += chunk.length;
      if (errorBytes > maxError) fail(new WorkerError("Conversion log exceeds the service limit."));
      else stderr.push(chunk);
    });
    child.stdin.on("error", () => { /* A failed worker may close stdin before consuming the payload. */ });
    child.on("error", error => {
      failure ??= error;
      cleanup();
      reject(failure);
    });
    child.on("close", code => {
      cleanup();
      if (failure) { reject(failure); return; }
      const data = Buffer.concat(stdout).toString("utf-8");
      if (code === 2) {
        try { reject(new InputError((JSON.parse(data) as { error: string }).error)); }
        catch { reject(new WorkerError("Invalid Swift view name.")); }
        return;
      }
      if (code !== 0) {
        reject(new WorkerError(`Worker exited with code ${code ?? "unknown"}: ${Buffer.concat(stderr).toString("utf-8").slice(0, 512)}`));
        return;
      }
      try { resolve(JSON.parse(data) as ServiceResult); }
      catch { reject(new WorkerError("Worker returned an invalid result.")); }
    });
    if (!failure) child.stdin.end(JSON.stringify(input));
  });
}

function descendantPids(rootPid: number): number[] {
  let rows: string;
  try {
    rows = execFileSync("ps", ["-axo", "pid=,ppid="], {
      encoding: "utf8", timeout: 1_000, maxBuffer: 2 * 1024 * 1024,
    });
  } catch { return []; }
  const children = new Map<number, number[]>();
  for (const row of rows.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(row);
    if (!match) continue;
    const pid = Number(match[1]);
    const parent = Number(match[2]);
    const siblings = children.get(parent) ?? [];
    siblings.push(pid);
    children.set(parent, siblings);
  }
  const result: number[] = [];
  const queue = [rootPid];
  while (queue.length) {
    const parent = queue.shift()!;
    for (const pid of children.get(parent) ?? []) { result.push(pid); queue.push(pid); }
  }
  return result;
}
