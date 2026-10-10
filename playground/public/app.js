import { sample } from './sample.js';

const $ = (id) => document.getElementById(id);
const config = window.MARKSWIFT_CONFIG || { apiBaseUrl: '', nativePreview: false };
const inputs = ['html', 'css', 'name', 'width', 'height', 'theme', 'mode'];
const draftKey = 'markswift.playground.draft.v1';
const emptyText = document.querySelector('#code-empty p').textContent;
const modeHelp = {
  app: 'App layout: native SwiftUI stacks and text that reflow — the code to ship.',
  fidelity: 'Captured layout: pins the measured browser geometry — for visual comparison, not for shipping.',
};
let capabilities = { convert: false, nativePreview: false };
/** Bumped on every source edit; a result converted from an older revision is stale. */
let revision = 0;
/** Bumped whenever a new result is shown; native render polling for an older result stops. */
let generation = 0;
let conversion = null;
let stale = false;
let pollTimer = null;
let previewTimer = null;
let converting = false;
let rendering = false;

const apiUrl = (path) => `${config.apiBaseUrl}${path}`;

function values() {
  return Object.fromEntries(inputs.map((id) => [id, ['width', 'height'].includes(id) ? Number($(id).value) : $(id).value]));
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function notice(message = '', error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
  $('notice').hidden = !message;
}
function connection(state, label) {
  const status = $('connection-status');
  status.dataset.state = state;
  status.lastChild.textContent = label;
}
function buttons() {
  const blocked = !conversion || stale || conversion.expired;
  $('convert').disabled = !capabilities.convert || converting;
  $('convert').innerHTML = converting ? 'Converting…' : 'Convert to SwiftUI <kbd>⌘↵</kbd>';
  $('render').disabled = !capabilities.nativePreview || blocked || rendering || converting;
  $('download').disabled = blocked || converting;
  $('copy').disabled = !conversion || !$('code').textContent;
  $('copy-all').disabled = !conversion;
  $('wrap').disabled = !conversion;
}
function syncStale() {
  document.body.dataset.stale = String(stale);
  $('stale').textContent = conversion?.expired
    ? 'This result expired on the server — convert again to download.'
    : 'Source changed — convert again to update the output.';
  $('stale').hidden = !stale && !conversion?.expired;
  buttons();
}
/** Edits keep the last result visible and mark it out of date instead of discarding it. */
function markStale() {
  revision += 1;
  if (conversion && !stale) {
    stale = true;
    syncStale();
  }
}
function goOffline() {
  capabilities = { convert: false, nativePreview: false };
  document.body.dataset.native = 'false';
  connection('offline', 'Converter offline');
  $('retry').hidden = false;
  document.querySelector('#code-empty p').textContent = 'The converter is offline. The browser preview still works — retry when the API is back.';
  buttons();
}
function stopRender() {
  clearTimeout(pollTimer);
  rendering = false;
  $('render-progress').hidden = true;
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
function updateModeHelp() {
  $('mode-help').textContent = modeHelp[$('mode').value] || '';
}

// ponytail: approximate Swift tokenizer (no multi-line strings, no nested comments); swap for a grammar only if users complain.
const SWIFT = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*")|\b(\d+(?:\.\d+)?)\b|\b(import|struct|enum|extension|func|var|let|static|private|public|nonisolated|some|return|if|else|guard|for|in|switch|case|default|true|false|nil|self|Self|init|where|throws|try|await|async)\b|\b([A-Z][A-Za-z0-9_]*)\b/g;
const tokenClasses = ['tok-comment', 'tok-string', 'tok-number', 'tok-keyword', 'tok-type'];
function highlight(code) {
  const nodes = [];
  let last = 0;
  for (const match of code.matchAll(SWIFT)) {
    if (match.index > last) nodes.push(document.createTextNode(code.slice(last, match.index)));
    const group = match.slice(1).findIndex((value) => value !== undefined);
    nodes.push(element('span', match[0], tokenClasses[group]));
    last = match.index + match[0].length;
  }
  if (last < code.length) nodes.push(document.createTextNode(code.slice(last)));
  return nodes;
}
function showFile(file) {
  for (const tab of $('file-tabs').querySelectorAll('[role="tab"]')) {
    const selected = tab.dataset.file === file;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  $('code').replaceChildren(...highlight(conversion?.files?.[file] || ''));
  $('code-view').scrollTop = 0;
  buttons();
}
function showFiles(result, name) {
  const files = Object.keys(result.files || {}).filter((file) => result.files[file].trim());
  const primary = files.find((file) => file === `${name}.swift`) || files[0];
  const support = files.filter((file) => file !== primary).sort();
  const tab = (file) => {
    const button = element('button', file);
    Object.assign(button, { type: 'button', tabIndex: -1 });
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'code-view');
    button.dataset.file = file;
    return button;
  };
  $('file-tabs').replaceChildren(
    ...(primary ? [tab(primary)] : []),
    ...(support.length ? [element('span', 'Support', 'tab-group')] : []),
    ...support.map(tab),
  );
  $('file-count').textContent = `${files.length} Swift ${files.length === 1 ? 'file' : 'files'}`;
  if (primary) showFile(primary);
}

/** Report ids may carry an analysis suffix (`#text`, `#box2`, `/row0`, `/beside`); fall back to the owning element. */
function nodeLabel(labels, id) {
  for (let key = id; key;) {
    if (labels[key]) return labels[key];
    const parent = key.replace(/[#/][^#/]*$/, '');
    if (parent === key) break;
    key = parent;
  }
  return id;
}
function diagnosticGroup(level, title, lines, unit) {
  const item = element('li', undefined, 'diagnostic-group');
  item.dataset.level = level;
  const count = `${lines.length} ${unit}${lines.length === 1 ? '' : 's'}`;
  item.append(element('span', level === 'resources' ? 'Resources' : level, 'level'), element('strong', title), ` — ${count}`);
  const list = element('ul');
  list.append(...lines.slice(0, 20).map((line) => element('li', line)));
  if (lines.length > 20) list.append(element('li', `and ${lines.length - 20} more`, 'more'));
  item.append(list);
  return item;
}
function showDiagnostics(result) {
  const labels = result.labels || {};
  const levels = { unmapped: new Map(), approximated: new Map() };
  for (const entry of result.diagnostics || []) {
    for (const d of entry.diagnostics || []) {
      const features = levels[d.level];
      if (!features) continue;
      if (!features.has(d.feature)) features.set(d.feature, []);
      features.get(d.feature).push(`${nodeLabel(labels, entry.id || entry.kind)}: ${d.message}`);
    }
  }
  const total = (level) => [...levels[level].values()].reduce((sum, lines) => sum + lines.length, 0);
  const unmapped = total('unmapped');
  const approximated = total('approximated');
  const warnings = result.warnings || [];
  const groups = ['unmapped', 'approximated'].flatMap((level) =>
    [...levels[level]].map(([feature, lines]) => diagnosticGroup(level, feature, lines, 'element')));
  if (warnings.length) groups.push(diagnosticGroup('resources', 'Capture and packaging', warnings, 'note'));
  const [level, summary] = unmapped ? ['error', `${unmapped} unmapped · ${approximated} approximated`]
    : approximated ? ['warn', `${approximated} approximated`]
    : warnings.length ? ['warn', `${warnings.length} resource ${warnings.length === 1 ? 'note' : 'notes'}`]
    : ['ok', 'No approximations'];
  $('fidelity').dataset.level = level;
  $('fidelity').textContent = summary;
  $('fidelity').hidden = false;
  const notes = unmapped + approximated + warnings.length;
  $('diagnostic-count').textContent = notes ? `${notes} ${notes === 1 ? 'note' : 'notes'}` : 'No notes';
  $('diagnostic-list').replaceChildren(...(groups.length ? groups : [element('li', 'Every element mapped without approximation.')]));
  $('diagnostics').open = unmapped > 0;
}
function showResult(result, submitted) {
  stopRender();
  generation += 1;
  conversion = { ...result, name: submitted.name };
  stale = submitted.revision !== revision;
  $('native-frame').hidden = true;
  $('native-image').removeAttribute('src');
  $('native-empty').hidden = false;
  $('native-status').textContent = 'Ready to render';
  $('code-empty').hidden = true;
  $('code-view').hidden = false;
  showFiles(result, submitted.name);
  showDiagnostics(result);
  syncStale();
  fitPreviews();
}

async function api(path, data) {
  let response;
  try {
    response = await fetch(apiUrl(path), data === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
  } catch {
    goOffline();
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
    $('retry').hidden = capabilities.convert;
    document.querySelector('#code-empty p').textContent = emptyText;
    notice();
  } catch {
    goOffline();
    notice('Browser preview is available. Connect a conversion API to generate SwiftUI.', true);
  }
  buttons();
  fitPreviews();
}

$('settings').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!capabilities.convert || converting) return;
  const submitted = { revision, name: $('name').value };
  converting = true;
  buttons();
  notice('Measuring HTML and generating SwiftUI files…');
  try {
    showResult(await api('/api/convert', values()), submitted);
    notice();
  } catch (error) {
    notice(error.message, true);
  } finally {
    converting = false;
    buttons();
  }
});
async function copy(button, text, label) {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = label; }, 1500);
  } catch { notice('Clipboard access was denied. Select the code and copy it manually.', true); }
}
$('copy').addEventListener('click', () => copy($('copy'), $('code').textContent, 'Copy file'));
$('copy-all').addEventListener('click', () => {
  const files = [...$('file-tabs').querySelectorAll('[role="tab"]')].map((tab) => tab.dataset.file);
  copy($('copy-all'), files.map((file) => `// MARK: - ${file}\n${conversion.files[file]}`).join('\n\n'), 'Copy all');
});
$('wrap').addEventListener('click', () => {
  const wrap = $('wrap').getAttribute('aria-pressed') !== 'true';
  $('wrap').setAttribute('aria-pressed', String(wrap));
  $('code-view').dataset.wrap = String(wrap);
});
$('file-tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[role="tab"]');
  if (tab) showFile(tab.dataset.file);
});
$('file-tabs').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...$('file-tabs').querySelectorAll('[role="tab"]')];
  const index = tabs.indexOf(event.target);
  if (index < 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
    : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
  showFile(tabs[next].dataset.file);
  tabs[next].focus();
});
$('fidelity').addEventListener('click', () => {
  $('diagnostics').open = true;
  $('diagnostics').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
});
$('download').addEventListener('click', async () => {
  if (!conversion) return;
  let response;
  try { response = await fetch(apiUrl(`/api/download/${encodeURIComponent(conversion.id)}`)); } catch {
    goOffline();
    notice('Converter is unreachable. Check the API address and try again.', true);
    return;
  }
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    if (response.status === 404) conversion.expired = true;
    syncStale();
    notice(result?.error || 'Download failed.', true);
    return;
  }
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: `${conversion.name}.zip` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
function renderState(job, current) {
  if (current !== generation) return;
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
  if (current !== generation) return;
  stopRender();
  $('native-empty').hidden = false;
  $('native-status').textContent = 'Render failed';
  notice(error.message, true);
  buttons();
}
$('render').addEventListener('click', async () => {
  if (!conversion || rendering || !capabilities.nativePreview) return;
  const current = generation;
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
$('retry').addEventListener('click', () => {
  connection('connecting', 'Connecting…');
  void checkCapabilities();
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
  markStale();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 180);
});
$('mode').addEventListener('change', updateModeHelp);
$('sample').addEventListener('click', () => {
  const html = $('html').value;
  if (html.trim() && (html !== sample.html || $('css').value !== sample.css)
    && !confirm('Replace your current HTML and CSS with the sample?')) return;
  markStale();
  clearTimeout(previewTimer);
  $('html').value = sample.html;
  $('css').value = sample.css;
  $('name').value = 'PreviewCard';
  $('width').value = '390';
  $('height').value = '520';
  $('theme').value = 'adaptive';
  $('mode').value = 'app';
  updateModeHelp();
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
updateModeHelp();
buttons();
updatePreview();
void checkCapabilities();
