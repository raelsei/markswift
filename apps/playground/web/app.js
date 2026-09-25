import { checkHealth, convertSource } from "./api.js";
import { bundleZip, downloadBlob } from "./bundle.js";
import { renderPreview } from "./preview.js";
import { mappingText, renderReport } from "./report.js";
import { sample } from "./sample.js";

const $ = (id) => document.getElementById(id);
const fields = {
  html: $("html-input"), css: $("css-input"), name: $("view-name"),
  width: $("viewport-width"), height: $("viewport-height"),
  theme: $("theme"), mode: $("mode"),
};
const state = { result: null, convertedInput: null, sourceTab: "html", resultTab: "swift", pending: false };
let previewTimer;

function setStatus(message, error = false) {
  const label = $("status-message");
  label.textContent = message;
  label.classList.toggle("status-error", error);
}

function inputSnapshot() {
  return {
    html: fields.html.value, css: fields.css.value, name: fields.name.value.trim(),
    mode: fields.mode.value, theme: fields.theme.value,
    viewport: { width: Number(fields.width.value), height: Number(fields.height.value) },
  };
}

function inputKey() { return JSON.stringify(inputSnapshot()); }

function markStale() {
  if (!state.result) return;
  const stale = state.convertedInput !== inputKey();
  $("result-subtitle").textContent = stale ? "Source changed since conversion" : `${Object.keys(state.result.files).length} generated files`;
  $("mapping-summary").textContent = stale ? "Previous result · convert again" : mappingText(state.result.mapping);
  if (stale) setStatus("Source changed. Convert again to update the Swift output.");
}

function sourceCount() {
  const text = fields[state.sourceTab].value;
  $("source-count").textContent = `${text.split("\n").length} lines · ${text.length.toLocaleString()} characters`;
}

function activateTab(kind, name, focus = false) {
  const names = kind === "source" ? ["html", "css"] : ["swift", "preview", "report"];
  for (const item of names) {
    const selected = item === name;
    const tab = $(`${item}-tab`);
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(`${item}-pane`).hidden = !selected;
  }
  state[`${kind}Tab`] = name;
  if (kind === "source") sourceCount();
  if (focus) $(`${name}-tab`).focus();
}

function bindTabs(kind) {
  const selector = `[data-${kind}-tab]`;
  const tabs = [...document.querySelectorAll(selector)];
  for (const tab of tabs) {
    tab.addEventListener("click", () => activateTab(kind, tab.dataset[`${kind}Tab`]));
    tab.addEventListener("keydown", (event) => {
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      const target = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (tabs.indexOf(tab) + step + tabs.length) % tabs.length;
      activateTab(kind, tabs[target].dataset[`${kind}Tab`], true);
    });
  }
}

function updatePreview() {
  const width = Math.min(1920, Math.max(240, Number(fields.width.value) || 393));
  const height = Math.min(2400, Math.max(240, Number(fields.height.value) || 852));
  renderPreview($("html-preview"), fields.html.value, fields.css.value, { width, height });
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 180);
}

function validatedInput() {
  const input = inputSnapshot();
  if (!input.html.trim()) throw new Error("Paste HTML before converting.");
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(input.name)) throw new Error("View name must start with an uppercase letter and use letters, numbers or underscores.");
  if (input.name.length > 80) throw new Error("View name must be 80 characters or fewer.");
  const { width, height } = input.viewport;
  if (!Number.isInteger(width) || width < 240 || width > 1920 || !Number.isInteger(height) || height < 240 || height > 2400) {
    throw new Error("Viewport width must be 240–1920 px and height 240–2400 px.");
  }
  return input;
}

function renderSelectedFile() {
  const filename = $("file-select").value;
  $("swift-code").firstElementChild.textContent = state.result?.files?.[filename] ?? "Generated Swift files will appear here.";
}

function renderResult(result) {
  state.result = result;
  const names = Object.keys(result.files).sort((a, b) => a === `${result.name}.swift` ? -1 : b === `${result.name}.swift` ? 1 : a.localeCompare(b));
  const fileSelect = $("file-select");
  fileSelect.replaceChildren(...names.map((name) => new Option(name, name)));
  fileSelect.disabled = names.length === 0;
  $("copy-file").disabled = names.length === 0;
  $("download-file").disabled = names.length === 0;
  $("download-bundle").disabled = names.length === 0;
  $("result-subtitle").textContent = `${names.length} generated files`;
  $("mapping-summary").textContent = mappingText(result.mapping);
  renderSelectedFile();
  const reportCount = renderReport($("report-content"), result);
  $("report-count").textContent = String(reportCount);
  $("report-count").hidden = reportCount === 0;
  activateTab("result", "swift");
}

async function convert(event) {
  event.preventDefault();
  if (state.pending) return;
  let input;
  try { input = validatedInput(); }
  catch (error) { setStatus(error.message, true); return; }
  const key = inputKey();
  state.pending = true;
  $("convert-button").disabled = true;
  $("convert-button").firstElementChild.textContent = "Converting…";
  setStatus("Chrome is measuring the page and generating SwiftUI…");
  try {
    const result = await convertSource(input);
    renderResult(result);
    state.convertedInput = key;
    markStale();
    if (state.convertedInput === inputKey()) setStatus(`Generated ${Object.keys(result.files).length} files. Review the mapping report before using them.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Conversion failed.", true);
  } finally {
    state.pending = false;
    $("convert-button").disabled = false;
    $("convert-button").firstElementChild.textContent = "Convert to SwiftUI";
  }
}

function loadExample() {
  if (fields.html.value !== sample.html || fields.css.value !== sample.css) {
    if ((fields.html.value || fields.css.value) && !confirm("Replace your current HTML and CSS with the example?")) return;
  }
  fields.html.value = sample.html;
  fields.css.value = sample.css;
  fields.name.value = "ExampleCard";
  activateTab("source", "html");
  updatePreview();
  markStale();
}

async function initialize() {
  bindTabs("source");
  bindTabs("result");
  $("convert-form").addEventListener("submit", convert);
  $("load-example").addEventListener("click", loadExample);
  $("file-select").addEventListener("change", renderSelectedFile);
  for (const field of Object.values(fields)) {
    field.addEventListener("input", () => { sourceCount(); schedulePreview(); markStale(); });
    field.addEventListener("change", () => { schedulePreview(); markStale(); });
  }
  $("copy-file").addEventListener("click", async () => {
    const text = state.result?.files?.[$("file-select").value];
    if (!text) return;
    try { await navigator.clipboard.writeText(text); setStatus("Current Swift file copied."); }
    catch { setStatus("Clipboard access is unavailable. Select and copy the code manually.", true); }
  });
  $("download-file").addEventListener("click", () => {
    const name = $("file-select").value;
    const text = state.result?.files?.[name];
    if (text) downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), name.split("/").at(-1));
  });
  $("download-bundle").addEventListener("click", () => {
    if (!state.result) return;
    try { downloadBlob(bundleZip(state.result.files, state.result.assets), `${state.result.name || "Markswift"}.zip`); }
    catch { setStatus("Could not package the generated files. Download Swift files individually.", true); }
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      $("convert-form").requestSubmit();
    }
  });
  loadExample();
  sourceCount();
  const ready = await checkHealth();
  $("service-state").classList.add(ready ? "is-ready" : "is-unavailable");
  $("service-label").textContent = ready ? "Converter ready" : "Converter unavailable";
  if (!ready) setStatus("Converter unavailable. The HTML preview works, but conversion needs the API service.", true);
}

initialize();
