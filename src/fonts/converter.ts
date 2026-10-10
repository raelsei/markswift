import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      dst = join(dir, "dst");
    await Bun.write(src, bytes);
    let p: Bun.Subprocess<"ignore", "pipe", "pipe">;
    try {
      p = Bun.spawn(
        ["python3", fileURLToPath(new URL("./convert-font.py", import.meta.url)), src, dst, family, subfamily, "1"],
        { stdout: "pipe", stderr: "pipe", signal },
      );
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return "python3 not found on PATH (webfont conversion needs Python 3 with fontTools and brotli)";
      throw error;
    }
    const [out, err, code] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    if (code !== 0) return (err.trim().split("\n").pop() || `python3 exited ${code}`).slice(0, 200);
    let tool: Omit<FontToolResult, "bytes"> & { wrote: boolean };
    try {
      tool = JSON.parse(out);
    } catch {
      return `unreadable fontTools output: ${out.slice(0, 120)}`;
    }
    const { wrote, ...result } = tool;
    return wrote ? { ...result, bytes: new Uint8Array(await Bun.file(dst).arrayBuffer()) } : result;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
