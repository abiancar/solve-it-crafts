/* %% nbs/craft/19_bug_capture.ipynb #b19a0003 */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"bug_help_btn": "<button type=\"button\" id=\"craft-bug-help-btn\" class=\"craft-bug-help-btn\" title=\"Report a bug (solveitcrafts support)\" aria-label=\"Report a bug\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z\"></path></svg></button>", "bug_modal": "<dialog class=\"craft-overlay\" id=\"craft-bug-overlay\" aria-label=\"Report a bug\"><div class=\"uk-card craft-card craft-bug-card\"><div class=\"craft-bug-hdr\"><span class=\"craft-bug-title\">Report a Bug</span><button type=\"button\" class=\"craft-bug-close\" aria-label=\"Close\" data-ref=\"close\">×</button></div><form data-ref=\"form\"><label>Title<input class=\"uk-input\" name=\"title\" placeholder=\"Short summary of the issue\" required data-ref=\"title\" type=\"text\"></label><label>Description<textarea name=\"description\" rows=\"4\" class=\"uk-textarea craft-bug-ta\" placeholder=\"What happened? What did you expect?\" required data-ref=\"description\"></textarea></label><label>Reporter notes (optional)<textarea name=\"reporter_notes\" rows=\"2\" class=\"uk-textarea craft-bug-ta\" placeholder=\"Steps to reproduce or extra context\" data-ref=\"notes\"></textarea></label><label>Ingestion endpoint<input class=\"uk-input\" name=\"endpoint\" placeholder=\"http://127.0.0.1:8791/api/tickets\" data-ref=\"endpoint\" type=\"text\"></label><label>Bearer token (optional)<input class=\"uk-input\" name=\"token\" type=\"password\" placeholder=\"Stored locally in browser\" autocomplete=\"off\" data-ref=\"token\"></label><div class=\"craft-bug-opts\"><label class=\"craft-bug-chk\"><input type=\"checkbox\" checked data-ref=\"inc_dom\"> Include sanitized DOM snapshot</label><label class=\"craft-bug-chk\"><input type=\"checkbox\" checked data-ref=\"inc_shot\"> Include best-effort screenshot</label></div><div class=\"craft-bug-meta\" data-ref=\"meta\"></div><div id=\"craft-bug-status\" class=\"craft-bug-status\" data-ref=\"status\"></div><div class=\"craft-bug-actions\"><button class=\"uk-btn uk-btn-default uk-btn-sm\" data-ref=\"cancel\" type=\"button\">Cancel</button><button class=\"uk-btn uk-btn-primary uk-btn-sm\" type=\"submit\" data-ref=\"submit\">Send Report</button></div></form></div></dialog>", "bug_menu_toggle": "<li class=\"craft-bug-menu-toggle\"><label class=\"craft-bug-menu-lbl\"><input type=\"checkbox\" data-ref=\"chk\"> Show bug-report help icon</label></li>"});

/* %% nbs/craft/19_bug_capture.ipynb #b19a0007 */
(() => { /* iife:craftBugCapture */
/* #b19a0007 */
window.craftBugCapture?.disable?.();

const CORE = window.__craftCMCore;
if (!CORE || !CORE.features.isEnabled('bug-capture')) return;
const {on, store, mountTpl, mountModal, notify, kid, onDomChange, fetchJson} = CORE;
const ac = new AbortController(), sig = {signal: ac.signal};

const ENABLED_KEY = 'craft-bug-capture:enabled';
const ENDPOINT_KEY = 'craft-bug-capture:endpoint';
const TOKEN_KEY = 'craft-bug-capture:token';
const DEFAULT_ENDPOINT = window.CRAFT_SUPPORT_ENDPOINT || 'http://127.0.0.1:8791/api/tickets';
const MAX_ERRORS = 50;

const recentErrors = [];
const pushErr = (msg) => {
  const text = String(msg || '').slice(0, 600);
  if (!text) return;
  recentErrors.push(`[${new Date().toISOString()}] ${text}`);
  if (recentErrors.length > MAX_ERRORS) recentErrors.shift();
};

const isEnabled = () => store.get(ENABLED_KEY) === '1';
const getEndpoint = () => store.get(ENDPOINT_KEY) || DEFAULT_ENDPOINT;
const getToken = () => (store.get(TOKEN_KEY) || '').trim();

let origConsoleError = null;
let wrappedConsoleError = null;
let errAc = null;

function uninstallErrorCapture() {
  errAc?.abort();
  errAc = null;
  if (wrappedConsoleError && console.error === wrappedConsoleError && origConsoleError) {
    console.error = origConsoleError;
  }
  wrappedConsoleError = null;
  origConsoleError = null;
}

function syncErrorCapture() {
  if (!isEnabled()) { uninstallErrorCapture(); return; }
  if (wrappedConsoleError) return;
  origConsoleError = console.error;
  const boundOrig = origConsoleError.bind(console);
  wrappedConsoleError = (...args) => {
    try {
      pushErr(args.map(a => (a instanceof Error ? (a.stack || a.message) : typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    } catch (_) {}
    return boundOrig(...args);
  };
  console.error = wrappedConsoleError;
  errAc = new AbortController();
  const esig = {signal: errAc.signal};
  on(window, 'error', (e) => pushErr(e?.error?.stack || e?.message || 'Window error'), esig);
  on(window, 'unhandledrejection', (e) => pushErr(e?.reason?.stack || e?.reason?.message || String(e?.reason || 'Unhandled rejection')), esig);
}

const helpBtn = mountTpl('bug_help_btn');
document.body.appendChild(helpBtn);
const syncVisibility = () => { helpBtn.hidden = !isEnabled(); };
syncVisibility();
syncErrorCapture();

/* #0060e99c */
/* Client-Side DOM Sanitization & Best-Effort Screenshot */
const SECRET_TEXT_RE = /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|(?:sk|pk|rk)_(?:live|test)?_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
const SENSITIVE_ATTR_RE = /token|secret|pass|auth|cookie|session|csrf|jwt|api[_-]?key|bearer/i;
const URL_ATTR_RE = /^(?:href|src|action|formaction|xlink:href|srcset|ping|background)$/;

function redactSecretText(text) {
  const s = String(text ?? '');
  SECRET_TEXT_RE.lastIndex = 0;
  return s.replace(SECRET_TEXT_RE, '[REDACTED]');
}

function isDangerousUrl(val) {
  return /^(?:javascript|vbscript):/i.test(String(val || '').replace(/[\u0000-\u0020]+/g, ''));
}

function serializeCleanDom(maxChars = 500000) {
  const clone = document.documentElement.cloneNode(true);
  clone.querySelectorAll('#craft-bug-overlay, #craft-bug-help-btn, script, noscript, iframe[srcdoc], meta[name*="csrf" i], meta[name*="token" i]').forEach(n => n.remove());
  for (const elNode of clone.querySelectorAll('*')) {
    const tag = elNode.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      const type = (elNode.getAttribute('type') || '').toLowerCase();
      const ident = `${elNode.getAttribute('name') || ''} ${elNode.getAttribute('id') || ''}`;
      const redact = type === 'password' || type === 'hidden' || type === 'email' || SENSITIVE_ATTR_RE.test(ident);
      if ('value' in elNode) elNode.value = '';
      if (elNode.hasAttribute('value')) elNode.setAttribute('value', redact ? '[REDACTED]' : '');
      if (tag === 'TEXTAREA') elNode.textContent = redact ? '[REDACTED]' : '';
    }
    for (const attr of [...elNode.attributes]) {
      const an = attr.name.toLowerCase();
      const av = attr.value || '';
      if (an.startsWith('on')) { elNode.removeAttribute(attr.name); continue; }
      if (URL_ATTR_RE.test(an) && isDangerousUrl(av)) { elNode.removeAttribute(attr.name); continue; }
      SECRET_TEXT_RE.lastIndex = 0;
      if (SENSITIVE_ATTR_RE.test(an) || SECRET_TEXT_RE.test(av)) {
        elNode.setAttribute(attr.name, '[REDACTED]');
      }
    }
  }
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeValue) {
      const cleaned = redactSecretText(node.nodeValue);
      if (cleaned !== node.nodeValue) node.nodeValue = cleaned;
    }
  }
  const html = '<!doctype html>\n' + clone.outerHTML;
  return html.length > maxChars ? html.slice(0, maxChars) + '\n<!-- truncated -->' : html;
}

async function captureBestEffortScreenshot() {
  try {
    if (typeof window.html2canvas === 'function') {
      const canvas = await window.html2canvas(document.body, {logging: false, useCORS: true, scale: 1});
      return canvas.toDataURL('image/png');
    }
    const w = Math.min(window.innerWidth || 1280, 1440);
    const h = Math.min(window.innerHeight || 800, 900);
    const xhtml = new XMLSerializer().serializeToString(document.body);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml;charset=utf-8'}));
    try {
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0);
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (_) {
    return null;
  }
}

/* #428fc2b7 */
/* Bug Report Modal & Submission */
let modal = null;
function closeModal() { modal?.close(); }

function ensureModal() {
  if (modal) return modal;
  modal = mountModal('bug_modal', {signal: ac.signal});
  on(modal.cancel, 'click', closeModal, sig);
  on(modal.form, 'submit', async (e) => {
    e.preventDefault();
    const endpoint = (modal.endpoint.value || '').trim() || DEFAULT_ENDPOINT;
    store.set(ENDPOINT_KEY, endpoint);
    const token = (modal.token?.value || '').trim();
    store.set(TOKEN_KEY, token);
    modal.submit.disabled = true;
    modal.status.className = 'craft-bug-status';
    modal.status.textContent = 'Capturing context and uploading ticket...';
    try {
      const data = await fetchJson(endpoint, {
        signal: ac.signal,
        headers: token ? {Authorization: `Bearer ${token}`} : {},
        body: {
          title: modal.title.value.trim(),
          description: modal.description.value.trim(),
          reporter_notes: modal.notes.value.trim(),
          url: location.href,
          viewport: {width: window.innerWidth, height: window.innerHeight},
          user_agent: navigator.userAgent,
          dialog_id: typeof kid === 'function' ? kid() : null,
          console_errors: recentErrors.slice(),
          dom_html: modal.inc_dom.checked ? serializeCleanDom() : '',
          screenshot_data_url: modal.inc_shot.checked ? await captureBestEffortScreenshot() : null,
        },
      });
      modal.status.className = 'craft-bug-status ok';
      modal.status.textContent = `Saved ticket ${data.id}`;
      const link = data.url || data.folder_url;
      if (link && !isDangerousUrl(link)) {
        modal.status.append(' · ', Object.assign(document.createElement('a'), {
          href: link, target: '_blank', rel: 'noopener noreferrer', textContent: 'Open ticket',
        }));
      }
      modal.title.value = '';
      modal.description.value = '';
      modal.notes.value = '';
    } catch (err) {
      modal.status.className = 'craft-bug-status err';
      modal.status.textContent = `Failed to submit: ${err?.message || err}`;
    } finally {
      modal.submit.disabled = false;
    }
  }, sig);
  return modal;
}

function openModal() {
  const m = ensureModal();
  m.endpoint.value = getEndpoint();
  if (m.token) m.token.value = getToken();
  m.meta.textContent = `${location.pathname} · ${window.innerWidth}×${window.innerHeight} · ${recentErrors.length} recent console error(s)`;
  m.status.className = 'craft-bug-status';
  m.status.textContent = '';
  m.open();
  m.title.focus();
}

on(helpBtn, 'click', openModal, sig);

/* #d590a7a5 */
/* Menu Toggle, Hotkeys & Lifecycle */
function setEnabled(val) {
  store.set(ENABLED_KEY, val ? '1' : '0');
  syncVisibility();
  syncErrorCapture();
  syncMenuToggle();
  notify(isEnabled() ? 'Bug-report help icon enabled.' : 'Bug-report help icon hidden.', 'primary');
  return isEnabled();
}

function syncMenuToggle() {
  document.querySelectorAll('.craft-bug-menu-toggle input[type="checkbox"]').forEach(chk => {
    chk.checked = isEnabled();
  });
}

function injectMenuToggle() {
  const lists = document.querySelectorAll('.uk-container > nav.monster-navbar .uk-dropdown ul, .uk-container > nav.monster-navbar .uk-drop ul, .uk-navbar-dropdown ul');
  for (const ul of lists) {
    if (ul.querySelector('.craft-bug-menu-toggle')) continue;
    const item = mountTpl('bug_menu_toggle', {refs: true});
    item.chk.checked = isEnabled();
    on(item.chk, 'change', () => setEnabled(item.chk.checked), sig);
    ul.appendChild(item.root);
  }
}
injectMenuToggle();
const stopMenuObs = onDomChange?.(injectMenuToggle);

window.__hotkeyRegister?.({
  id: 'craft-bug-toggle-icon',
  label: 'Toggle bug-report help icon',
  group: 'CRAFT · Support',
  combo: '',
  handler: () => { setEnabled(!isEnabled()); return true; },
});
window.__hotkeyRegister?.({
  id: 'craft-bug-open-form',
  label: 'Report a bug (open support form)',
  group: 'CRAFT · Support',
  combo: '',
  handler: () => { openModal(); return true; },
});

window.craftBugCapture = {
  __loaded: true,
  isEnabled,
  setEnabled,
  open: openModal,
  close: closeModal,
  getRecentErrors: () => recentErrors.slice(),
  disable: () => {
    ac.abort();
    stopMenuObs?.();
    uninstallErrorCapture();
    modal?.destroy();
    modal = null;
    helpBtn.remove();
    document.querySelectorAll('.craft-bug-menu-toggle').forEach(el => el.remove());
    delete window.craftBugCapture;
  },
};
})();
