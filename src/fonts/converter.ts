import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import script from "./convert-font.py" with { type: "text" };

const run = promisify(execFile);

export interface FontToolResult {
  upem: number;
  ascent: number;
  descent: number;
  lineGap: number;
  useTypoMetrics: boolean;
  axes: Record<string, [number, number]>;
  converted: boolean;
  renamed: boolean;
  /** Rewritten sfnt bytes; absent when the input already registers under `family` as-is. */
  bytes?: Uint8Array;
}

/** Decompress WOFF/WOFF2 and rewrite the name table so `family` resolves; a string is the failure reason. */
export type FontConverter = (
  bytes: Uint8Array,
  family: string,
  subfamily: string,
  signal?: AbortSignal,
) => Promise<FontToolResult | string>;

/** python3 + fontTools. The only temp files in font packaging live and die here. */
export const pythonFontConverter: FontConverter = async (bytes, family, subfamily, signal) => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-font-"));
  try {
    const src = join(dir, "src"),
      dst = join(dir, "dst"),
      py = join(dir, "convert-font.py");
    await writeFile(src, bytes);
    await writeFile(py, script);
    let out: string;
    try {
      ({ stdout: out } = await run("python3", [py, src, dst, family, subfamily, "1"], {
        signal,
        maxBuffer: 16 * 1024 * 1024,
      }));
    } catch (error) {
      const e = error as NodeJS.ErrnoException & { stderr?: string };
      if (e.code === "ENOENT")
        return "python3 not found on PATH (webfont conversion needs Python 3 with fontTools and brotli)";
      return (e.stderr?.trim().split("\n").pop() || `python3 failed: ${e.message}`).slice(0, 200);
    }
    let tool: Omit<FontToolResult, "bytes"> & { wrote: boolean };
    try {
      tool = JSON.parse(out);
    } catch {
      return `unreadable fontTools output: ${out.slice(0, 120)}`;
    }
    const { wrote, ...result } = tool;
    return wrote ? { ...result, bytes: new Uint8Array(await readFile(dst)) } : result;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
