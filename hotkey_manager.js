/* %% nbs/craft/03_hotkey_manager.ipynb #ea005e0d */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"hk_overlay": "<dialog class=\"craft-overlay hk-overlay\" aria-label=\"Keyboard shortcuts\"><div class=\"uk-card craft-card hk-modal\"><header class=\"uk-modal-header hk-head\"><strong>Keyboard shortcuts</strong><span class=\"hk-sub\">Click Change to rebind · Esc cancels · ⊘ also disables a Solveit row's original key</span><button class=\"hk-close\" type=\"button\" aria-label=\"Close\">×</button></header><div class=\"uk-modal-body hk-body\"></div><footer class=\"uk-modal-footer hk-foot\"><span>Overrides are saved in this browser.</span><button class=\"uk-btn uk-btn-default uk-btn-sm hk-reset-all\" type=\"button\">Reset all</button></footer></div></dialog>"});

/* %% nbs/craft/03_hotkey_manager.ipynb #8b08b80e */
(() => { /* iife:hotkeyManager */
/* #8b08b80e */
/* ── Hotkey manager ───────────────────────────────────────────────────
   Shared registry for page-level shortcuts, plus a settings modal that
   lists them all and lets you rebind them (press '?', or solveit's own
   shortcuts icon). Overrides are saved per browser.

   API on window.solveitHotkeys:
     register({id, label, group, combo, handler})  combo like 'Mod+B', '?', 'Escape'
     dispatch(e) -> true if an action consumed the KeyboardEvent
     openMenu() / refreshChips() / effective(id) / formatCombo(combo)

   Conventions:
   - 'Mod' matches ⌘ or Ctrl on any platform (labelled per platform).
   - Handlers return true when they consumed the event; anything else
     and the keypress falls through to the page untouched.
   - Combos without Mod are ignored while typing in a text field.
   - <kbd data-hotkey="id"> elements show the live combo and refresh
     automatically after a rebind.
   - Escape cancels rebind-capture mode, so it can't itself be bound.
   - Solveit's built-in bindings (hotkey_builtins.js) rebind by redispatch:
     the new combo re-fires the original keys on the same target so solveit's
     own handler runs the action; ⊘ on a menu row additionally swallows the
     original combo. Plain keys are never intercepted inside editors. */
  window.solveitHotkeys?.disable?.();
  const ac = new AbortController(), cap = {capture: true, signal: ac.signal};
  const {el: mkEl, mountTpl, qs, qsa, on, store} = window.__craftCMCore;
  const STORAGE_KEY = 'solveit-hotkeys:v1';
  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

  let overrides = store.json(STORAGE_KEY, {});

  const actions = new Map(), order = [];
  let overlay = null, menuRefs = null, menuOpen = false, capturing = null;  // capturing: id being rebound
  let redispatching = false;  // true while a redispatched synthetic event propagates

  function parseCombo(combo) {
    const m = {meta: false, ctrl: false, shift: false, alt: false};
    let key = null;
    for (const part of String(combo).split('+')) {
      if (part === 'Mod') m.meta = m.ctrl = true;
      else if (part === 'Cmd') m.meta = true;
      else if (part === 'Ctrl') m.ctrl = true;
      else if (part === 'Shift') m.shift = true;
      else if (part === 'Alt') m.alt = true;
      else if (part) key = part;
    }
    return key && {m, key: key.length === 1 ? key.toLowerCase() : key};
  }

  function eventCombo(e) {
    if (['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) return null;  // bare modifier
    const m = {meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey};
    if (e.key.length === 1) m.shift = /[A-Z]/.test(e.key);  // 'A' implies Shift; '?' carries it in the char
    return {m, key: e.key.length === 1 ? e.key.toLowerCase() : e.key};
  }

  function sameMods(a, b) {  // a: parsed action mods ('Mod' means either); b: live event mods
    if (a.meta && a.ctrl) return b.meta || b.ctrl;
    if (a.meta) return b.meta && !b.ctrl;
    if (a.ctrl) return b.ctrl && !b.meta;
    return !b.meta && !b.ctrl;
  }
  const sameCombo = (ev, ac) => !!ev && !!ac && ev.key === ac.key && ev.m.shift === ac.m.shift && ev.m.alt === ac.m.alt && sameMods(ac.m, ev.m);

  function norm(o) { return typeof o === 'string' ? {combo: o, suppress: false} : (o ?? {combo: null, suppress: false}); }
  const isSuppressed = id => !!norm(overrides[id]).suppress;

  /* Tier B: rebind a Solveit built-in by re-firing its original combo as a
     synthetic keydown on the same target, so solveit's own handler runs it.
     `redispatching` guards the re-entrancy: the synthetic event passes back
     through dispatch() untouched instead of being matched and swallowed. */
  function redispatch(e, combo) {
    const c = parseCombo(combo);
    if (!c) return;
    const key = c.key.length === 1 && c.m.shift ? c.key.toUpperCase() : c.key;
    const code = c.key.length === 1 ? (/[a-z]/i.test(c.key) ? 'Key' + c.key.toUpperCase() : /\d/.test(c.key) ? 'Digit' + c.key : e.code) : e.code;
    const ev = new KeyboardEvent('keydown', {key, code, ctrlKey: c.m.ctrl, metaKey: c.m.meta, shiftKey: c.m.shift, altKey: c.m.alt, bubbles: true, cancelable: true, composed: true});
    redispatching = true;
    try { e.target.dispatchEvent(ev); } finally { redispatching = false; }
  }

  function builtinDispatch(e, spec) {
    const orig = parseCombo(spec.combo);
    if (sameCombo(eventCombo(e), orig)) {  // the original combo itself was pressed
      if (!isSuppressed(spec.id)) return false;  // still live: let solveit handle it naturally
      if (inTextField(e) && !orig.m.meta && !orig.m.ctrl) return false;  // plain keys keep typing even when suppressed
      return true;  // suppressed: swallow it
    }
    redispatch(e, spec.combo);  // the rebound combo: re-fire the original keys
    return true;
  }

  function effective(id) { return norm(overrides[id]).combo ?? actions.get(id)?.combo; }

  function match(e) {
    const ec = eventCombo(e);
    if (!ec) return null;
    let suppressedHit = null;
    for (const id of order) {
      if (sameCombo(ec, parseCombo(effective(id)))) return id;
      const spec = actions.get(id);
      if (!suppressedHit && spec.builtin && isSuppressed(id) && sameCombo(ec, parseCombo(spec.combo))) suppressedHit = id;
    }
    return suppressedHit;  // an active override outranks a suppressed original
  }

  function inTextField(e) {
    const t = e.target;
    return !!t && typeof t.closest === 'function' && !!t.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], .monaco-editor');
  }

  function dispatch(e) {
    if (redispatching) return false;  // our own synthetic re-fire: let it reach solveit untouched
    const id = match(e);
    if (!id) return false;
    const spec = actions.get(id);
    const pc = parseCombo(effective(id));
    if (spec.builtin) {
      if (!(pc.m.meta || pc.m.ctrl) && inTextField(e)) return false;  // a plain new combo keeps typing
      return builtinDispatch(e, spec);
    }
    if (e.repeat) return false;
    if (!(pc.m.meta || pc.m.ctrl) && inTextField(e)) return false;  // plain keys don't fire while typing
    return spec.handler(e) === true;
  }

  function comboParts(combo) {
    const c = parseCombo(combo);
    if (!c) return [String(combo)];
    const parts = [];
    if (c.m.meta && c.m.ctrl) parts.push(isMac ? '⌘' : 'Ctrl');
    else if (c.m.meta) parts.push('⌘');
    else if (c.m.ctrl) parts.push('Ctrl');
    if (c.m.shift) parts.push(isMac ? '⇧' : 'Shift');
    if (c.m.alt) parts.push(isMac ? '⌥' : 'Alt');
    parts.push(c.key.length === 1 ? c.key.toUpperCase() : c.key);
    return parts;
  }
  const formatCombo = combo => comboParts(combo).join(isMac ? '' : '+');

  function comboStrFrom(c) {
    const parts = [];
    if (c.m.meta && c.m.ctrl) parts.push('Mod');
    else if (c.m.meta) parts.push('Cmd');
    else if (c.m.ctrl) parts.push('Ctrl');
    if (c.m.shift) parts.push('Shift');
    if (c.m.alt) parts.push('Alt');
    parts.push(c.key);
    return parts.join('+');
  }

  const save = () => store.setJson(STORAGE_KEY, overrides);

  function refreshChips() {
    qsa('[data-hotkey]').forEach(el => { el.textContent = formatCombo(effective(el.dataset.hotkey)) || ''; });
  }

/* #753cf37d */
/* ── settings modal ── */

  function buildMenu() {
    menuRefs = mountTpl('hk_overlay', {refs: {reset: '.hk-reset-all', body: '.hk-body', modal: '.hk-modal'}});
    overlay = menuRefs.root;
    on(overlay, 'click', e => { if (e.target === overlay || e.target.closest('.hk-close')) closeMenu(); });
    on(overlay, 'close', () => { menuOpen = false; capturing = null; });
    on(overlay, 'cancel', e => { e.preventDefault(); closeMenu(); });
    menuRefs.reset.onclick = () => { overrides = {}; save(); refreshChips(); renderRows(); };
    return overlay;
  }

  function rowFor(id) {
    const spec = actions.get(id), isCap = capturing === id;
    const combo = isCap
      ? mkEl('span', {cls: 'hk-combo hk-capturing'}, 'Press keys…')
      : mkEl('span', {cls: 'hk-combo'}, comboParts(effective(id)).map(p => mkEl('kbd', {}, p)));
    const reset = overrides[id] && mkEl('button', {
      type: 'button', cls: 'uk-btn uk-btn-default uk-btn-sm hk-reset', title: 'Reset to default',
      onclick: () => { delete overrides[id]; save(); refreshChips(); renderRows(); },
    }, '↺');
    const sup = spec.builtin && overrides[id] && mkEl('button', {
      type: 'button', cls: 'uk-btn uk-btn-default uk-btn-sm hk-suppress' + (isSuppressed(id) ? ' on' : ''),
      'aria-pressed': String(isSuppressed(id)),
      title: isSuppressed(id) ? `Original ${formatCombo(spec.combo)} disabled — click to re-enable` : `Also disable original ${formatCombo(spec.combo)}`,
      onclick: () => { const o = norm(overrides[id]); o.suppress = !o.suppress; overrides[id] = o; save(); renderRows(); },
    }, '⊘');
    return mkEl('div', {cls: 'hk-row', dataset: {id}},
      mkEl('span', {cls: 'hk-label'}, spec.label),
      combo,
      mkEl('span', {cls: 'hk-msg'}),
      mkEl('button', {type: 'button', cls: 'hk-change', onclick: () => { capturing = isCap ? null : id; renderRows(); }}, isCap ? 'Cancel' : 'Change'),
      reset, sup);
  }

  function renderRows() {
    if (!overlay || !menuOpen) return;
    const body = menuRefs.body;
    body.replaceChildren();
    const groups = [...new Set(order.map(id => actions.get(id).group || 'Other'))];
    for (const g of groups) {
      body.append(mkEl('div', {cls: 'hk-group'}, g));
      for (const id of order) if ((actions.get(id).group || 'Other') === g) body.append(rowFor(id));
    }
  }

  function openMenu() {
    if (menuOpen) return true;
    menuOpen = true;
    const dlg = overlay ?? buildMenu();
    if (!dlg.isConnected) document.body.append(dlg);
    renderRows();
    if (!dlg.open) dlg.showModal();
    return true;
  }
  function closeMenu() { menuOpen = false; capturing = null; if (overlay?.open) overlay.close(); }

  on(window, 'keydown', e => {
    if (e.repeat) return;
    if (capturing) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.key === 'Escape') { capturing = null; renderRows(); return; }
      const c = eventCombo(e);
      if (!c) return;  // bare modifier press: keep listening
      const conflict = order.find(other => other !== capturing && sameCombo(c, parseCombo(effective(other))));
      if (conflict) {
        const msg = qs(`.hk-row[data-id="${CSS.escape(capturing)}"] .hk-msg`, overlay);
        if (msg) msg.textContent = `In use by “${actions.get(conflict).label}”`;
        return;  // stay in capture mode so they can try another key
      }
      const id = capturing; capturing = null;
      overrides[id] = comboStrFrom(c); save(); refreshChips(); renderRows();
      return;
    }
    if (menuOpen) {
      const menuCombo = actions.has('hotkeys-menu') && parseCombo(effective('hotkeys-menu'));
      if (e.key === 'Escape' || (menuCombo && sameCombo(eventCombo(e), menuCombo))) {
        e.preventDefault(); e.stopImmediatePropagation(); closeMenu();
      }
      return;  // no page shortcuts while menu is open; focused buttons keep native Enter/Space
    }
    if (dispatch(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, cap);


  /* Solveit's own shortcuts-help control(s) open this menu instead.
     Matched semantically (tooltip/aria text, or a lucide keyboard glyph)
     because the app's markup isn't readable from the kernel; refine the
     selector if a specific button misses. The tree header's own ⌨ button
     and everything inside this modal are excluded. */
  const HELP_SEL = '[aria-label*="shortcut" i], [title*="shortcut" i], [uk-tooltip*="shortcut" i], [aria-label*="keyboard" i], [title*="keyboard" i], [uk-tooltip*="keyboard" i], .lucide-keyboard';
  on(document, 'click', e => {
    const el = e.target.closest?.(HELP_SEL);
    if (!el || el.closest('.hk-overlay, .solveit-tree-hotkeys')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    openMenu();
  }, cap);

  function register(spec) {
    if (!spec?.id || typeof spec.combo !== 'string' || typeof spec.handler !== 'function') { console.warn('hotkey_manager: bad registration', spec); return; }
    if (!actions.has(spec.id)) order.push(spec.id);
    actions.set(spec.id, spec);
    renderRows();
  }

  /* For the launcher: every action with its live combo, and run-by-id. Built-ins
     run by re-firing their original keys on the focused element, as a rebind does. */
  function list() { return order.map(id => { const s = actions.get(id); return {id, label: s.label, group: s.group, combo: effective(id), builtin: !!s.builtin}; }); }
  function run(id) {
    const spec = actions.get(id);
    if (!spec) return false;
    if (spec.builtin) { redispatch({target: document.activeElement || document.body, code: ''}, spec.combo); return true; }
    return spec.handler() === true;
  }

  function disable() {
    closeMenu();
    ac.abort();
    overlay?.remove();
    overlay = null;
    menuRefs = null;
  }

  window.solveitHotkeys = {register, dispatch, openMenu, effective, formatCombo, refreshChips, list, run, disable};

  register({id: 'hotkeys-menu', label: 'Show this shortcuts menu', group: 'Hotkey manager', combo: '?', handler: openMenu});
  (window.__hotkeyQueue || []).splice(0).forEach(register);  // replay early registrations
})();
