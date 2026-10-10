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


export async function runFontTool(src: string, dst: string, family: string, subfamily: string, rename: boolean, signal?: AbortSignal): Promise<FontToolResult | string> {
  let p: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try {
    p = Bun.spawn(["python3", fileURLToPath(new URL("./convert-font.py", import.meta.url)), src, dst, family, subfamily, rename ? "1" : "0"], { stdout: "pipe", stderr: "pipe", signal });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "python3 not found on PATH (webfont conversion needs Python 3 with fontTools and brotli)";
    throw error;
  }
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code !== 0) return (err.trim().split("\n").pop() || `python3 exited ${code}`).slice(0, 200);
  try {
    return JSON.parse(out) as FontToolResult;
  } catch {
    return `unreadable fontTools output: ${out.slice(0, 120)}`;
  }
}
