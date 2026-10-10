import { sample } from './sample.js';

const $ = (id) => document.getElementById(id);
const config = window.MARKSWIFT_CONFIG || { apiBaseUrl: '', nativePreview: false };
const inputs = ['html', 'css', 'name', 'width', 'height', 'theme', 'mode'];
const draftKey = 'markswift.playground.draft.v1';
let capabilities = { convert: false, nativePreview: false };
let revision = 0;
let conversion = null;
let activeRequest = null;
let pollTimer = null;
let previewTimer = null;
let converting = false;
let rendering = false;

const apiUrl = (path) => `${config.apiBaseUrl}${path}`;

function values() {
  return Object.fromEntries(inputs.map((id) => [id, ['width', 'height'].includes(id) ? Number($(id).value) : $(id).value]));
}
function notice(message = '', error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
  $('notice').hidden = !message;
}
function connection(state, label) {
  const element = $('connection-status');
  element.dataset.state = state;
  element.lastChild.textContent = label;
}
function buttons() {
  $('convert').disabled = !capabilities.convert || converting;
  $('convert').innerHTML = converting ? 'Converting…' : 'Convert to SwiftUI <kbd>⌘↵</kbd>';
  $('render').disabled = !capabilities.nativePreview || !conversion || rendering || converting;
  $('download').disabled = !conversion || converting;
  $('copy').disabled = !conversion || !$('code').textContent;
  $('files').disabled = !conversion;
}
function stopRender() {
  clearTimeout(pollTimer);
  rendering = false;
  $('render-progress').hidden = true;
}
function invalidate() {
  revision += 1;
  activeRequest?.abort();
  activeRequest = null;
  converting = false;
  stopRender();
  conversion = null;
  $('code').textContent = '';
  $('code-view').hidden = true;
  $('code-empty').hidden = false;
  $('files').replaceChildren(new Option('No generated files', ''));
  $('native-frame').hidden = true;
  $('native-image').removeAttribute('src');
  $('native-empty').hidden = false;
  $('native-status').textContent = 'Waiting for conversion';
  $('file-count').textContent = 'No output yet';
  $('diagnostic-count').textContent = 'No conversion yet';
  $('diagnostic-list').replaceChildren(Object.assign(document.createElement('li'), { textContent: 'Unsupported or approximate mappings will appear here.' }));
  $('diagnostics').open = false;
  notice();
  buttons();
}
function fitFrame(frame, child, width, height) {
  const available = Math.max(100, frame.parentElement.clientWidth - 36);
  const scale = Math.min(1, available / width);
  frame.style.width = `${width * scale}px`;
  frame.style.height = `${height * scale}px`;
  child.style.width = `${width}px`;
  child.style.height = `${height}px`;
  child.style.transform = `scale(${scale})`;
}
function fitPreviews() {
  const { width, height } = values();
  if (width > 0 && height > 0) fitFrame($('browser-frame'), $('preview'), width, height);
  if (conversion) fitFrame($('native-frame'), $('native-image'), conversion.width, conversion.height);
}
function updateSourceMeta() {
  const selected = $('html-tab').getAttribute('aria-selected') === 'true' ? 'html' : 'css';
  const lines = $(selected).value.split('\n').length;
  $('source-meta').textContent = `${lines} ${lines === 1 ? 'line' : 'lines'}`;
}
function updatePreview() {
  const { html, css, width, height, theme } = values();
  // Adaptive output follows the system appearance; so does the browser preview.
  const scheme = theme === 'adaptive' ? 'light dark' : theme;
  const frame = $('preview');
  // Put the policy before pasted markup so it applies before the browser parses resources.
  // Parsing the paste in the parent document could fetch external images before this point.
  const safeCss = css.replace(/<\/style/gi, '<\\/style');
  const source = '<!doctype html>\n'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; connect-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; frame-src \'none\'">\n'
    + html + '\n<style>' + safeCss + '</style>'
    + `<style>:root { color-scheme: ${scheme} !important; }</style>`;
  if (frame.style.colorScheme !== scheme) {
    const replacement = frame.cloneNode(false);
    replacement.style.colorScheme = scheme;
    replacement.srcdoc = source;
    frame.replaceWith(replacement);
  } else {
    frame.srcdoc = source;
  }
  $('browser-size').textContent = `${width || '—'} × ${height || '—'}`;
  updateSourceMeta();
  fitPreviews();
  try { localStorage.setItem(draftKey, JSON.stringify(values())); } catch { /* Draft storage is optional. */ }
}
function showDiagnostics(result) {
  const messages = [...(result.warnings || []), ...(result.diagnostics || []).map((item) => {
    if (typeof item === 'string') return item;
    const label = [item.id, item.kind].filter(Boolean).join(' / ');
    const notes = Array.isArray(item.diagnostics) ? item.diagnostics.map((d) => `[${d.level}] ${d.feature} — ${d.message}`).join(' ') : '';
    return [label, notes || item.message || item.reason || item.code || 'Conversion note'].filter(Boolean).join(': ');
  })];
  const unique = [...new Set(messages)];
  $('diagnostic-count').textContent = unique.length ? `${unique.length} ${unique.length === 1 ? 'note' : 'notes'}` : 'No warnings';
  $('diagnostic-list').replaceChildren(...(unique.length ? unique : ['No warnings for this conversion.']).map((message) => Object.assign(document.createElement('li'), { textContent: message })));
  $('diagnostics').open = unique.length > 0;
}
async function api(path, data, signal) {
  let response;
  try {
    response = await fetch(apiUrl(path), data === undefined ? { signal } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error('Converter is unreachable. Check the API address and try again.');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || `Request failed (HTTP ${response.status}).`);
  if (!result) throw new Error('Converter returned an invalid response.');
  return result;
}
async function checkCapabilities() {
  try {
    const available = await api('/api/capabilities');
    capabilities = { convert: available.convert === true, nativePreview: available.nativePreview === true && config.nativePreview === true };
    document.body.dataset.native = capabilities.nativePreview ? 'true' : 'false';
    connection(capabilities.convert ? 'ready' : 'offline', capabilities.convert ? 'Converter ready' : 'Converter unavailable');
  } catch {
    capabilities = { convert: false, nativePreview: false };
    document.body.dataset.native = 'false';
    connection('offline', 'Converter unavailable');
    notice('Browser preview is available. Connect a conversion API to generate SwiftUI.', true);
  }
  buttons();
  fitPreviews();
}

$('settings').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!capabilities.convert) return;
  invalidate();
  const current = revision;
  const controller = new AbortController();
  activeRequest = controller;
  converting = true;
  buttons();
  notice('Measuring HTML and generating SwiftUI files…');
  try {
    const result = await api('/api/convert', values(), controller.signal);
    if (current !== revision) return;
    conversion = result;
    const paths = Object.keys(result.files || {}).filter((file) => file.endsWith('.swift'));
    const primary = paths.find((file) => file.split('/').pop() === `${$('name').value}.swift`) || paths[0];
    $('files').replaceChildren(...paths.map((file) => new Option(file, file)));
    if (primary) $('files').value = primary;
    $('code').textContent = result.files?.[primary] || result.code || '';
    $('code-empty').hidden = true;
    $('code-view').hidden = false;
    $('file-count').textContent = `${paths.length} Swift ${paths.length === 1 ? 'file' : 'files'}`;
    showDiagnostics(result);
    notice();
    fitPreviews();
  } catch (error) {
    if (current === revision && error.name !== 'AbortError') notice(error.message, true);
  } finally {
    if (current === revision) { converting = false; activeRequest = null; buttons(); }
  }
});
$('files').addEventListener('change', () => {
  $('code').textContent = conversion?.files?.[$('files').value] || '';
  $('code-view').scrollTop = 0;
  buttons();
});
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('code').textContent);
    $('copy').textContent = 'Copied';
    setTimeout(() => { $('copy').textContent = 'Copy file'; }, 1500);
  } catch { notice('Clipboard access was denied. Select the code and copy it manually.', true); }
});
$('download').addEventListener('click', () => {
  if (conversion) window.location.assign(apiUrl(`/api/download/${encodeURIComponent(conversion.id)}`));
});
function renderState(job, current) {
  if (current !== revision) return;
  if (job.status === 'error') throw new Error(job.error || 'SwiftUI rendering failed.');
  if (job.status === 'done') {
    if (!job.imageUrl) throw new Error('Rendering finished without an image.');
    stopRender();
    $('native-frame').hidden = false;
    $('native-image').src = apiUrl(job.imageUrl);
    $('native-status').textContent = 'Native render complete';
    fitPreviews();
    buttons();
    return;
  }
  $('render-stage').textContent = job.stage || (job.status === 'queued' ? 'Queued…' : 'Compiling and rendering SwiftUI…');
  $('native-status').textContent = job.status === 'queued' ? 'Queued' : 'Rendering';
  pollTimer = setTimeout(async () => {
    try { renderState(await api(`/api/jobs/${encodeURIComponent(job.id)}`), current); }
    catch (error) { renderFailure(error, current); }
  }, 1000);
}
function renderFailure(error, current) {
  if (current !== revision) return;
  stopRender();
  $('native-empty').hidden = false;
  $('native-status').textContent = 'Render failed';
  notice(error.message, true);
  buttons();
}
$('render').addEventListener('click', async () => {
  if (!conversion || rendering || !capabilities.nativePreview) return;
  const current = revision;
  rendering = true;
  $('native-empty').hidden = true;
  $('native-frame').hidden = true;
  $('render-progress').hidden = false;
  $('render-stage').textContent = 'Starting native render…';
  $('native-status').textContent = 'Starting';
  notice();
  buttons();
  try { renderState(await api('/api/render', { id: conversion.id }), current); }
  catch (error) { renderFailure(error, current); }
});
$('native-image').addEventListener('error', () => {
  if (conversion && !$('native-frame').hidden) {
    $('native-frame').hidden = true;
    $('native-empty').hidden = false;
    notice('Native image could not be loaded. Try rendering again.', true);
  }
});
function setTab(kind) {
  for (const value of ['html', 'css']) {
    const selected = kind === value;
    $(`${value}-tab`).setAttribute('aria-selected', String(selected));
    $(`${value}-tab`).tabIndex = selected ? 0 : -1;
    $(`${value}-pane`).hidden = !selected;
  }
  updateSourceMeta();
}
for (const kind of ['html', 'css']) {
  $(`${kind}-tab`).addEventListener('click', () => setTab(kind));
  $(`${kind}-tab`).addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 'html' : event.key === 'End' ? 'css' : kind === 'html' ? 'css' : 'html';
      setTab(next);
      $(`${next}-tab`).focus();
    }
  });
}
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && capabilities.convert) {
    event.preventDefault();
    $('settings').requestSubmit();
  }
});
for (const id of inputs) $(id).addEventListener('input', () => {
  invalidate();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 180);
});
$('sample').addEventListener('click', () => {
  invalidate();
  clearTimeout(previewTimer);
  $('html').value = sample.html;
  $('css').value = sample.css;
  $('name').value = 'PreviewCard';
  $('width').value = '390';
  $('height').value = '520';
  $('theme').value = 'adaptive';
  $('mode').value = 'app';
  setTab('html');
  updatePreview();
});

$('html').value = sample.html;
$('css').value = sample.css;
try {
  const draft = JSON.parse(localStorage.getItem(draftKey) || 'null');
  if (draft && typeof draft === 'object') {
    for (const id of inputs) if (typeof draft[id] === 'string' || typeof draft[id] === 'number') $(id).value = String(draft[id]);
  }
} catch { /* Start with the sample if a draft is unavailable. */ }
new ResizeObserver(fitPreviews).observe(document.querySelector('.workspace'));
buttons();
updatePreview();
void checkCapabilities();
