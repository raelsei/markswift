/** The convert and download routes shared by the local and public apps; each app keeps its own error policy. */
import { convertHtml } from "../../src/index.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import { conversionInput } from "./request.ts";
import { SerialQueue } from "./queue.ts";
import type { ResultStore } from "./store.ts";

type Json = (body: unknown, status?: number) => Response;
const MAX_PENDING = 3;

/** Layout node id → `tag#id` / `tag.class` / `tag`, so the UI can name the element a diagnostic belongs to. */
function labelNodes(node: LayoutNode, labels: Record<string, string>): void {
  if (node.id) {
    const className = node.attrs["class"]?.trim().split(/\s+/)[0];
    labels[node.id] = node.tag + (node.attrs["id"] ? `#${node.attrs["id"]}` : className ? `.${className}` : "");
  }
  for (const child of node.children) labelNodes(child, labels);
}

/**
 * Conversions run one at a time with up to MAX_PENDING waiting. Every capture uses the restricted
 * policy the preview iframe enforces (no scripts, no remote resources); files and live URLs belong
 * to the CLI. `admit` runs after the capacity check, so a busy rejection never consumes rate-limit
 * quota. Conversion failures throw; the caller decides whether to expose them.
 */
export function convertHandler(store: ResultStore, json: Json) {
  const queue = new SerialQueue();
  let pending = 0;
  return async (body: unknown, options?: { admit?: () => boolean; signal?: AbortSignal }): Promise<Response> => {
    const parsed = conversionInput.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("\n") }, 400);
    if (pending >= MAX_PENDING) return json({ error: "Converter is busy. Try again shortly." }, 429);
    if (options?.admit && !options.admit()) return json({ error: "Too many conversions. Try again in a minute." }, 429);
    pending++;
    try {
      return await queue.run(async () => {
        if (options?.signal?.aborted) return json({ error: "Cancelled." }, 499);
        const { html, css, name, width, height, theme, mode } = parsed.data;
        const result = await convertHtml(html, { css, name, viewport: { width, height }, theme, mode, untrustedInput: true });
        const id = await store.add(result);
        const labels: Record<string, string> = {};
        labelNodes(result.layout.root, labels);
        if (result.darkLayout) labelNodes(result.darkLayout.root, labels);
        return json({ id, code: result.code, files: result.files, warnings: result.warnings, diagnostics: result.diagnostics, labels, width: result.layout.size.w, height: result.layout.size.h });
      });
    } finally { pending--; }
  };
}

export async function zipResponse(store: ResultStore, id: string, headers: Record<string, string>): Promise<Response> {
  const bundle = await store.download(id);
  return new Response(bundle.file, { headers: { ...headers, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${bundle.name}.zip"` } });
}
