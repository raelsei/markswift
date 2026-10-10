/** The convert and download routes shared by the local and public apps; each app keeps its own error policy. */
import { convertHtml } from "../../src/index.ts";
import { conversionInput } from "./request.ts";
import type { ResultStore } from "./store.ts";

type Json = (body: unknown, status?: number) => Response;

/** Conversion failures throw; the caller decides whether to expose them. */
export function convertHandler(store: ResultStore, json: Json, untrustedInput: boolean) {
  let converting = false;
  return async (body: unknown): Promise<Response> => {
    const parsed = conversionInput.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("\n") }, 400);
    if (converting) return json({ error: "Converter is busy. Try again shortly." }, 429);
    converting = true;
    try {
      const { html, css, name, width, height, theme, mode } = parsed.data;
      const result = await convertHtml(html, { css, name, viewport: { width, height }, theme, mode, untrustedInput });
      const id = await store.add(result);
      return json({ id, code: result.code, files: result.files, warnings: result.warnings, diagnostics: result.diagnostics, width: result.layout.size.w, height: result.layout.size.h });
    } finally { converting = false; }
  };
}

export async function zipResponse(store: ResultStore, id: string, headers: Record<string, string>): Promise<Response> {
  const bundle = await store.download(id);
  return new Response(bundle.file, { headers: { ...headers, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${bundle.name}.zip"` } });
}
