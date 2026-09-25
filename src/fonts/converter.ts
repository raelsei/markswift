import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";


export interface FontToolResult {
  upem: number;
  ascent: number;
  descent: number;
  lineGap: number;
  useTypoMetrics: boolean;
  axes: Record<string, [number, number]>;
  converted: boolean;
  renamed: boolean;
  wrote: boolean;
}


export async function runFontTool(src: string, dst: string, family: string, subfamily: string, rename: boolean): Promise<FontToolResult | string> {
  // Source execution and the Node bundle both ship the Python helper under src/fonts/.
  const script = [new URL("./convert-font.py", import.meta.url), new URL("../src/fonts/convert-font.py", import.meta.url)]
    .find((candidate) => existsSync(candidate));
  if (!script) return "convert-font.py is missing from the package";
  const { out, err, code } = await new Promise<{ out: string; err: string; code: number }>((done) => {
    const p = spawn("python3", [fileURLToPath(script), src, dst, family, subfamily, rename ? "1" : "0"], { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    p.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    p.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    p.once("error", (error) => done({ out: "", err: error.message, code: -1 }));
    p.once("close", (exitCode) => done({ out: Buffer.concat(stdout).toString("utf8"), err: Buffer.concat(stderr).toString("utf8"), code: exitCode ?? -1 }));
  });
  if (code !== 0) return (err.trim().split("\n").pop() ?? `python3 exited ${code}`).slice(0, 200);
  try {
    return JSON.parse(out) as FontToolResult;
  } catch {
    return `unreadable fontTools output: ${out.slice(0, 120)}`;
  }
}
