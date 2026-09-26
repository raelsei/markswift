const metaOrigin = document.querySelector('meta[name="markswift-api-origin"]')?.content.trim() ?? "";
const apiOrigin = metaOrigin.startsWith("__") ? "" : metaOrigin.replace(/\/$/, "");

function endpoint(path) {
  return `${apiOrigin}${path}`;
}

export async function checkHealth() {
  try {
    const response = await fetch(endpoint("/health"), { cache: "no-store", credentials: "omit" });
    if (!response.ok) return false;
    return (await response.json()).status === "ok";
  } catch {
    return false;
  }
}

export async function convertSource(payload, signal) {
  let response;
  try {
    response = await fetch(endpoint("/api/convert"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Converter is unreachable. Check the API service and playground origin.");
  }

  let body;
  try { body = await response.json(); }
  catch { throw new Error(`Converter returned ${response.status} without a JSON response.`); }
  if (!response.ok) {
    const detail = typeof body?.error === "string" ? body.error : typeof body?.message === "string" ? body.message : `Converter returned ${response.status}.`;
    throw new Error(detail);
  }
  const validMapping = (view) => view?.mapping && Array.isArray(view.diagnostics);
  const validBranches = Array.isArray(body?.branches) && body.branches.length === 2
    && body.branches[0]?.branch === "compact" && body.branches[1]?.branch === "regular"
    && Number.isInteger(body.breakpoint)
    && body.branches.every(branch => validMapping(branch) && Array.isArray(branch.warnings)
      && Number.isInteger(branch.width) && Number.isInteger(branch.height));
  if (!body || !body.files || typeof body.files !== "object" || Array.isArray(body.files)
    || !Array.isArray(body.warnings) || !(body.branches ? validBranches : validMapping(body))) {
    throw new Error("Converter returned an incomplete result.");
  }
  return body;
}
