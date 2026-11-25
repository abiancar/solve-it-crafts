/* %% nbs/craft/14_font_settings.ipynb #5017f048 */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"font_modal": "<dialog class=\"craft-overlay\" id=\"craft-font-modal\" aria-label=\"Font Settings by Cell Type\"><div class=\"uk-card craft-card craft-font-card\"><div class=\"craft-modal-head\"><strong>Font Settings by Cell Type</strong><button type=\"button\" class=\"craft-modal-x\" aria-label=\"Close\" data-ref=\"close\">×</button></div><div class=\"craft-font-main\"><div class=\"craft-font-tabs\" role=\"tablist\" data-ref=\"tabs\"><button type=\"button\" role=\"tab\" class=\"craft-font-tab\" data-tab=\"prompt\" aria-selected=\"false\">Prompt</button><button type=\"button\" role=\"tab\" class=\"craft-font-tab\" data-tab=\"response\" aria-selected=\"false\">Assistant response</button><button type=\"button\" role=\"tab\" class=\"craft-font-tab\" data-tab=\"note\" aria-selected=\"false\">Note</button><button type=\"button\" role=\"tab\" class=\"craft-font-tab\" data-tab=\"code\" aria-selected=\"false\">Code</button><button type=\"button\" role=\"tab\" class=\"craft-font-tab\" data-tab=\"raw\" aria-selected=\"false\">Raw</button></div><div class=\"craft-font-body\" data-ref=\"body\"><datalist id=\"craft-font-presets\"><option value=\"'Craft Encode Sans', -apple-system, sans-serif\">Craft Encode Sans (default prose)</option><option value=\"'Craft Iosevka', monospace\">Craft Iosevka (default code)</option><option value=\"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif\">System Sans-Serif</option><option value=\"Georgia, 'Iowan Old Style', 'Times New Roman', serif\">System Serif</option><option value=\"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace\">System Monospace</option></datalist><div class=\"craft-font-grid\"><label class=\"craft-font-row\"><span>CSS font-family</span><input class=\"uk-input craft-font-ctrl\" type=\"text\" list=\"craft-font-presets\" placeholder=\"Pick a preset or type a CSS font-family stack\" data-ref=\"family\"></label><label class=\"craft-font-row\"><span>Size <span class=\"craft-font-val\" data-ref=\"sizeVal\"></span></span><input type=\"range\" min=\"8\" max=\"24\" step=\"0.5\" class=\"craft-font-range\" data-ref=\"size\"></label><label class=\"craft-font-row\"><span>Line height <span class=\"craft-font-val\" data-ref=\"lhVal\"></span></span><input type=\"range\" min=\"1.0\" max=\"2.0\" step=\"0.05\" class=\"craft-font-range\" data-ref=\"lh\"></label><label class=\"craft-font-row\"><span>Weight <span class=\"craft-font-val\" data-ref=\"wtVal\"></span></span><input type=\"range\" min=\"200\" max=\"700\" step=\"20\" class=\"craft-font-range\" data-ref=\"weight\"></label></div><div class=\"craft-font-prev-wrap\"><div class=\"craft-font-prev-lbl\" data-ref=\"prevLbl\"></div><div class=\"craft-font-preview\" data-ref=\"preview\"></div></div></div></div><div class=\"craft-modal-foot\"><button class=\"uk-btn uk-btn-default uk-btn-xs\" data-ref=\"copyCss\" type=\"button\">Copy as CRAFT.css snippet</button><button class=\"uk-btn uk-btn-default uk-btn-xs\" data-ref=\"reset\" type=\"button\">Reset to defaults</button><button class=\"uk-btn uk-btn-primary uk-btn-xs\" data-ref=\"save\" type=\"button\">Save &amp; Close</button></div></div></dialog>"});

/* %% nbs/craft/14_font_settings.ipynb #ca029cb5 */
(() => { /* iife:craftFonts */
/* #ca029cb5 */
window.craftFonts?.disable?.();

const CORE = window.__craftCMCore;
if (!CORE || !CORE.features.isEnabled('font-settings')) return;
const {on, store, mountModal, notify} = CORE;
const ac = new AbortController(), sig = {signal: ac.signal};
const STORE_KEY = 'craft-font-settings-v1';

const TYPES = [
  {key: 'prompt',   label: 'Prompt',             defFamily: "'Craft Encode Sans', -apple-system, sans-serif", defSize: 11, defLh: 1.2, defWeight: 360, sample: 'You: Summarize the trade-offs of this indexing strategy in 3 bullet points.'},
  {key: 'response', label: 'Assistant response',  defFamily: "'Craft Encode Sans', -apple-system, sans-serif", defSize: 11, defLh: 1.25, defWeight: 360, sample: 'Assistant: Covering indexes avoid heap lookups, at the cost of extra write amplification and storage.'},
  {key: 'note',     label: 'Note',               defFamily: "'Craft Encode Sans', -apple-system, sans-serif", defSize: 11, defLh: 1.25, defWeight: 360, sample: 'Design note — keep per-cell typography variables falling back to --craft-prose and --craft-code.'},
  {key: 'code',     label: 'Code',               defFamily: "'Craft Iosevka', monospace",                     defSize: 10, defLh: 1.2,  defWeight: 400, sample: 'def fib(n: int) -> int:\n    return n if n < 2 else fib(n - 1) + fib(n - 2)'},
  {key: 'raw',      label: 'Raw',                defFamily: "'Craft Iosevka', monospace",                     defSize: 10, defLh: 1.25, defWeight: 400, sample: '{"status": "ok", "tokens": 1257, "mode": "raw"}'},
];

const defaults = () => Object.fromEntries(TYPES.map(t => [t.key, {
  family: t.defFamily, size: t.defSize, lh: t.defLh, weight: t.defWeight,
}]));

const loadSettings = () => {
  const saved = store.json(STORE_KEY, null);
  const base = defaults();
  if (!saved || typeof saved !== 'object') return base;
  for (const t of TYPES) {
    if (saved[t.key]) base[t.key] = {...base[t.key], ...saved[t.key]};
  }
  return base;
};

let current = loadSettings();
let modal = null, activeTab = 'prompt';

function applySettings(cfg = current) {
  const root = document.documentElement.style;
  for (const t of TYPES) {
    const c = cfg[t.key];
    if (!c) continue;
    root.setProperty(`--craft-font-${t.key}-family`, c.family);
    root.setProperty(`--craft-font-${t.key}-size`, `${c.size}px`);
    root.setProperty(`--craft-font-${t.key}-lh`, String(c.lh));
    root.setProperty(`--craft-font-${t.key}-weight`, String(c.weight));
  }
  if (cfg.code) {
    root.setProperty('--craft-code', `${cfg.code.size}px`);
    root.setProperty('--craft-code-lh', String(cfg.code.lh));
    root.setProperty('--craft-code-family', cfg.code.family);
  }
}

function buildCssSnippet(cfg = current) {
  const lines = [':root {'];
  for (const t of TYPES) {
    const c = cfg[t.key];
    lines.push(`  --craft-font-${t.key}-family: ${c.family};`);
    lines.push(`  --craft-font-${t.key}-size: ${c.size}px;`);
    lines.push(`  --craft-font-${t.key}-lh: ${c.lh};`);
    lines.push(`  --craft-font-${t.key}-weight: ${c.weight};`);
  }
  lines.push('}');
  return lines.join('\n');
}

/* #0af4085b */
const activeType = () => TYPES.find(x => x.key === activeTab) || TYPES[0];

function renderModal() {
  if (!modal) return;
  for (const btn of modal.tabs.querySelectorAll('[data-tab]')) {
    const active = btn.dataset.tab === activeTab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  }
  const t = activeType(), cfg = current[t.key];
  modal.family.value = cfg.family;
  modal.size.value = String(cfg.size);
  modal.sizeVal.textContent = `${cfg.size}px`;
  modal.lh.value = String(cfg.lh);
  modal.lhVal.textContent = String(cfg.lh);
  modal.weight.value = String(cfg.weight);
  modal.wtVal.textContent = String(cfg.weight);
  modal.prevLbl.textContent = `Live preview — ${t.label}`;
  modal.preview.className = `craft-font-preview is-${t.key}`;
  modal.preview.textContent = t.sample;
  applySettings(current);
}

let revertOnClose = true;

function openModal() {
  if (!modal) {
    modal = mountModal('font_modal', {
      refs: true,
      signal: ac.signal,
      onClose: () => {
        if (revertOnClose) { current = loadSettings(); applySettings(current); }
        revertOnClose = true;
      },
    });
    on(modal.tabs, 'click', e => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      activeTab = btn.dataset.tab;
      renderModal();
    }, sig);
    on(modal.family, 'input', () => {
      const t = activeType();
      current[t.key].family = modal.family.value.trim() || t.defFamily;
      applySettings(current);
    }, sig);
    on(modal.size, 'input', () => {
      const v = parseFloat(modal.size.value);
      current[activeType().key].size = v;
      modal.sizeVal.textContent = `${v}px`;
      applySettings(current);
    }, sig);
    on(modal.lh, 'input', () => {
      const v = parseFloat(modal.lh.value);
      current[activeType().key].lh = v;
      modal.lhVal.textContent = String(v);
      applySettings(current);
    }, sig);
    on(modal.weight, 'input', () => {
      const v = parseInt(modal.weight.value, 10);
      current[activeType().key].weight = v;
      modal.wtVal.textContent = String(v);
      applySettings(current);
    }, sig);
    on(modal.save, 'click', () => {
      store.setJson(STORE_KEY, current);
      applySettings(current);
      revertOnClose = false;
      modal.close();
      notify('Font settings saved.', 'success');
    }, sig);
    on(modal.reset, 'click', () => {
      current = defaults();
      store.del(STORE_KEY);
      applySettings(current);
      renderModal();
      notify('Font settings reset to defaults.');
    }, sig);
    on(modal.copyCss, 'click', async () => {
      const css = buildCssSnippet(current);
      try {
        await navigator.clipboard.writeText(css);
        notify('Copied CRAFT.css font snippet to clipboard.', 'success');
      } catch {
        prompt('Copy CRAFT.css snippet:', css);
      }
    }, sig);
  }
  current = loadSettings();
  revertOnClose = true;
  renderModal();
  modal.open();
}

// Apply persisted settings immediately on load
if (store.json(STORE_KEY, null)) applySettings(current);

window.__hotkeyRegister?.({id: 'craft-font-settings', label: 'Font settings (by cell type)', group: 'CRAFT · Appearance', combo: '', handler: () => { openModal(); return true; }});
window.__hotkeyRegister?.({id: 'craft-font-reset', label: 'Reset font settings to defaults', group: 'CRAFT · Appearance', combo: '', handler: () => {
  current = defaults(); store.del(STORE_KEY); applySettings(current);
  notify('Font settings reset to defaults.');
  return true;
}});

window.craftFonts = {
  __loaded: true,
  open: openModal,
  get: () => loadSettings(),
  apply: applySettings,
  reset: () => { current = defaults(); store.del(STORE_KEY); applySettings(current); },
  snippet: () => buildCssSnippet(current),
  disable() {
    ac.abort();
    modal?.destroy?.();
    delete window.craftFonts;
  },
};
})();
