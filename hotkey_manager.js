/* ── Hotkey manager ───────────────────────────────────────────────────
   Shared registry for page-level shortcuts, plus a settings modal that
   lists them all and lets you rebind them (press '?', or the ⌨ button
   in the file tree header). Overrides are saved per browser.

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
(() => {
  if (window.solveitHotkeys) return;
  const STORAGE_KEY = 'solveit-hotkeys:v1';
  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

  let overrides = {};
  try { overrides = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch {}

  const actions = new Map(), order = [];
  let overlay = null, menuOpen = false, capturing = null;  // capturing: id being rebound
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

  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides)); } catch {} }

  function refreshChips() {
    document.querySelectorAll('[data-hotkey]').forEach(el => { el.textContent = formatCombo(effective(el.dataset.hotkey)) || ''; });
  }

  /* ── settings modal ── */

  const styles = document.createElement('style');
  styles.textContent = `
.hk-overlay { position: fixed; inset: 0; z-index: 10000; display: none; align-items: flex-start; justify-content: center; background: rgba(0,0,0,.55); padding-top: 12vh; }
.hk-overlay.open { display: flex; }
.hk-modal { width: min(560px, calc(100vw - 32px)); max-height: 74vh; display: flex; flex-direction: column; background: #1a1b26; color: #cfc9c2; border: 1px solid #2f3044; border-radius: 10px; box-shadow: 0 18px 48px rgba(0,0,0,.5); font-family: inherit; font-size: 13px; line-height: 1.4; }
.hk-head { display: flex; align-items: baseline; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #2f3044; }
.hk-sub { font-size: 11px; opacity: .6; }
.hk-close { margin-left: auto; }
.hk-body { overflow: auto; padding: 4px 16px; }
.hk-group { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; opacity: .55; margin: 12px 0 4px; }
.hk-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgba(47,48,68,.4); }
.hk-row:last-child { border-bottom: 0; }
.hk-suppress { opacity: .55; }
.hk-suppress.on { opacity: 1; background: #7aa2f7; border-color: #7aa2f7; color: #16161e; }
.hk-label { flex: 1; }
.hk-combo kbd { background: #222434; border: 1px solid #3a3b55; border-bottom-width: 2px; border-radius: 4px; padding: 1px 6px; font-family: inherit; font-size: 12px; margin-right: 3px; }
.hk-combo.hk-capturing { font-style: italic; opacity: .75; }
.hk-msg { color: #f7768e; font-size: 11.5px; max-width: 45%; }
.hk-body button, .hk-foot button { background: #222434; color: #cfc9c2; border: 1px solid #3a3b55; border-radius: 6px; padding: 2px 10px; cursor: pointer; font-size: 12px; font-family: inherit; }
.hk-body button:hover, .hk-foot button:hover { background: #2f3044; }
.hk-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; border-top: 1px solid #2f3044; font-size: 11.5px; opacity: .85; }
`;
  document.head.append(styles);

  function buildMenu() {
    overlay = document.createElement('div');
    overlay.className = 'hk-overlay';
    overlay.innerHTML = `
      <div class="hk-modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" tabindex="-1">
        <header class="hk-head"><strong>Keyboard shortcuts</strong><span class="hk-sub">Click Change to rebind · Esc cancels · ⊘ also disables a Solveit row's original key</span><button class="hk-close" type="button" aria-label="Close">×</button></header>
        <div class="hk-body"></div>
        <footer class="hk-foot"><span>Overrides are saved in this browser.</span><button class="hk-reset-all" type="button">Reset all</button></footer>
      </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('.hk-close')) closeMenu(); });
    overlay.querySelector('.hk-reset-all').onclick = () => { overrides = {}; save(); refreshChips(); renderRows(); };
    return overlay;
  }

  function rowFor(id) {
    const spec = actions.get(id);
    const row = document.createElement('div');
    row.className = 'hk-row'; row.dataset.id = id;
    const label = document.createElement('span');
    label.className = 'hk-label'; label.textContent = spec.label;
    const combo = document.createElement('span');
    combo.className = 'hk-combo';
    if (capturing === id) { combo.classList.add('hk-capturing'); combo.textContent = 'Press keys…'; }
    else comboParts(effective(id)).forEach(p => { const k = document.createElement('kbd'); k.textContent = p; combo.append(k); });
    const msg = document.createElement('span'); msg.className = 'hk-msg';
    const change = document.createElement('button');
    change.type = 'button'; change.className = 'hk-change'; change.textContent = capturing === id ? 'Cancel' : 'Change';
    change.onclick = () => { capturing = capturing === id ? null : id; renderRows(); };
    row.append(label, combo, msg, change);
    if (overrides[id]) {
      const reset = document.createElement('button');
      reset.type = 'button'; reset.className = 'hk-reset'; reset.title = 'Reset to default'; reset.textContent = '↺';
      reset.onclick = () => { delete overrides[id]; save(); refreshChips(); renderRows(); };
      row.append(reset);
    }
    if (spec.builtin && overrides[id]) {
      const sup = document.createElement('button');
      sup.type = 'button'; sup.className = 'hk-suppress' + (isSuppressed(id) ? ' on' : '');
      sup.textContent = '⊘'; sup.setAttribute('aria-pressed', String(isSuppressed(id)));
      sup.title = isSuppressed(id) ? `Original ${formatCombo(spec.combo)} disabled — click to re-enable` : `Also disable original ${formatCombo(spec.combo)}`;
      sup.onclick = () => { const o = norm(overrides[id]); o.suppress = !o.suppress; overrides[id] = o; save(); renderRows(); };
      row.append(sup);
    }
    return row;
  }

  function renderRows() {
    if (!overlay || !menuOpen) return;
    const body = overlay.querySelector('.hk-body');
    body.innerHTML = '';
    const groups = [...new Set(order.map(id => actions.get(id).group || 'Other'))];
    for (const g of groups) {
      const h = document.createElement('div');
      h.className = 'hk-group'; h.textContent = g; body.append(h);
      for (const id of order) if ((actions.get(id).group || 'Other') === g) body.append(rowFor(id));
    }
  }

  function openMenu() {
    if (menuOpen) return true;
    menuOpen = true;
    (overlay ?? buildMenu()).classList.add('open');
    document.body.append(overlay);
    renderRows();
    overlay.querySelector('.hk-modal').focus();
    return true;
  }
  function closeMenu() { menuOpen = false; capturing = null; overlay?.classList.remove('open'); }

  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (capturing) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.key === 'Escape') { capturing = null; renderRows(); return; }
      const c = eventCombo(e);
      if (!c) return;  // bare modifier press: keep listening
      const conflict = order.find(other => other !== capturing && sameCombo(c, parseCombo(effective(other))));
      if (conflict) {
        const msg = overlay?.querySelector(`.hk-row[data-id="${capturing}"] .hk-msg`);
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
  }, true);


  /* Solveit's own shortcuts-help control(s) open this menu instead.
     Matched semantically (tooltip/aria text, or a lucide keyboard glyph)
     because the app's markup isn't readable from the kernel; refine the
     selector if a specific button misses. The tree header's own ⌨ button
     and everything inside this modal are excluded. */
  const HELP_SEL = '[aria-label*="shortcut" i], [title*="shortcut" i], [uk-tooltip*="shortcut" i], [aria-label*="keyboard" i], [title*="keyboard" i], [uk-tooltip*="keyboard" i], .lucide-keyboard';
  document.addEventListener('click', e => {
    const el = e.target.closest?.(HELP_SEL);
    if (!el || el.closest('.hk-overlay, .solveit-tree-hotkeys')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    openMenu();
  }, true);

  function register(spec) {
    if (!spec?.id || !spec.combo || typeof spec.handler !== 'function') { console.warn('hotkey_manager: bad registration', spec); return; }
    if (!actions.has(spec.id)) order.push(spec.id);
    actions.set(spec.id, spec);
    renderRows();
  }

  window.solveitHotkeys = {register, dispatch, openMenu, effective, formatCombo, refreshChips};

  register({id: 'hotkeys-menu', label: 'Show this shortcuts menu', group: 'Hotkey manager', combo: '?', handler: openMenu});
  (window.__hotkeyQueue || []).splice(0).forEach(register);  // replay early registrations
})();
