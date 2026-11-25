/* %% nbs/craft/03_hotkey_manager.ipynb #378fda2c */
/* ── Hotkey manager bootstrap ──────────────────────────────────────
   The shared shortcut registry lives in hotkey_manager.js (served from
   ~/.craft-assets at /static/.craft-assets/hotkey_manager.js). Load it first so the sections below
   can register their shortcuts; registrations made before it finishes
   loading are queued and replayed by the manager. */
(() => {
  window.__hotkeyQueue ||= [];
  window.__hotkeyRegister = spec => { if (window.solveitHotkeys) window.solveitHotkeys.register(spec); else window.__hotkeyQueue.push(spec); };
  for (const [src, tag] of [['/static/.craft-assets/hotkey_manager.js', '1'], ['/static/.craft-assets/hotkey_builtins.js', 'builtins']])
    if (!document.querySelector(`script[data-solveit-hotkeys="${tag}"]`)) {
      const s = document.createElement('script');
      s.src = src; s.dataset.solveitHotkeys = tag;
      document.head.append(s);
    }
})();

/* %% nbs/craft/04_cm_core.ipynb #1cf3dd3a */
window.__craftCfg = Object.assign(window.__craftCfg || {}, {"cm_dark_pal": {"kw": "#f97583", "str": "#9ecbff", "re": "#dbedff", "num": "#79b8ff", "fn": "#b392f0", "tag": "#85e89d", "fg": "#e1e4e8", "inv": "#fdaeb7"}, "cm_light_pal": {"kw": "#d73a49", "str": "#032f62", "re": "#032f62", "num": "#005cc5", "fn": "#6f42c1", "tag": "#22863a", "fg": "#24292e", "inv": "#cb2431"}});

/* %% nbs/craft/04_cm_core.ipynb #c38c2857 */
(() => { /* iife:cmCore */
/* #c38c2857 */
window.__craftCMCore?.disable?.();
const LOCAL_CM_BASE = '/static/.craft-assets/cm6';
  const CM_DEPS = 'deps=@codemirror/state@6.5.2,@codemirror/view@6.36.5,@codemirror/language@6.11.0,@lezer/highlight@1.2.5';
  const CM_URLS = {
    state: 'https://esm.sh/@codemirror/state@6.5.2',
    view: 'https://esm.sh/@codemirror/view@6.36.5?deps=@codemirror/state@6.5.2',
    lang: 'https://esm.sh/@codemirror/language@6.11.0?deps=@codemirror/state@6.5.2,@codemirror/view@6.36.5,@lezer/highlight@1.2.5',
    python: `https://esm.sh/@codemirror/lang-python@6.1.7?${CM_DEPS}`,
    cmds: `https://esm.sh/@codemirror/commands@6.8.1?${CM_DEPS}`,
    ac: `https://esm.sh/@codemirror/autocomplete@6.18.6?${CM_DEPS}`,
    search: 'https://esm.sh/@codemirror/search@6.5.10?deps=@codemirror/state@6.5.2,@codemirror/view@6.36.5',
    hl: 'https://esm.sh/@lezer/highlight@1.2.5',
  };

  const LANG_SPECS = {
    javascript: ['JavaScript', ['js', 'jsx'], 'lang-javascript.js', `https://esm.sh/@codemirror/lang-javascript@6?${CM_DEPS}`, m => m.javascript({jsx: true})],
    typescript: ['TypeScript', ['ts', 'tsx'], 'lang-javascript.js', `https://esm.sh/@codemirror/lang-javascript@6?${CM_DEPS}`, m => m.javascript({typescript: true, jsx: true})],
    html: ['HTML', ['htm'], 'lang-html.js', `https://esm.sh/@codemirror/lang-html@6?${CM_DEPS}`, m => m.html()],
    css: ['CSS', ['scss'], 'lang-css.js', `https://esm.sh/@codemirror/lang-css@6?${CM_DEPS}`, m => m.css()],
    json: ['JSON', ['jsonc'], 'lang-json.js', `https://esm.sh/@codemirror/lang-json@6?${CM_DEPS}`, m => m.json()],
    sql: ['SQL', ['sqlite', 'postgres', 'postgresql', 'duckdb'], 'lang-sql.js', `https://esm.sh/@codemirror/lang-sql@6?${CM_DEPS}`, m => m.sql()],
    markdown: ['Markdown', ['md'], 'lang-markdown.js', `https://esm.sh/@codemirror/lang-markdown@6.3.2?${CM_DEPS}`, m => m.markdown()],
    xml: ['XML', ['svg'], 'lang-xml.js', `https://esm.sh/@codemirror/lang-xml@6?${CM_DEPS}`, m => m.xml()],
    yaml: ['YAML', ['yml'], 'lang-yaml.js', `https://esm.sh/@codemirror/lang-yaml@6?${CM_DEPS}`, m => m.yaml()],
    rust: ['Rust', ['rs'], 'lang-rust.js', `https://esm.sh/@codemirror/lang-rust@6?${CM_DEPS}`, m => m.rust()],
    cpp: ['C++', ['c', 'cpp', 'c++', 'cxx', 'h'], 'lang-cpp.js', `https://esm.sh/@codemirror/lang-cpp@6?${CM_DEPS}`, m => m.cpp()],
    shell: ['Shell', ['bash', 'sh', 'zsh', 'shell', 'script'], 'mode-shell.js', `https://esm.sh/@codemirror/legacy-modes@6.5.1/mode/shell?${CM_DEPS}`, (m, cm) => new cm.lang.LanguageSupport(cm.lang.StreamLanguage.define(m.shell))],
  };
  const LANG_ALIASES = {
    py: 'python', py3: 'python', python3: 'python',
    ...Object.fromEntries(Object.entries(LANG_SPECS).flatMap(([k, [, aliases]]) => aliases.map(a => [a, k]))),
  };

  const isMac = navigator.userAgentData?.platform === 'macOS' || /Mac/.test(navigator.userAgent);
  const isDark = () => document.documentElement.classList.contains('dark');
  const normId = id => String(id || '').replace(/^_/, '');
  const getCellEl = id => document.getElementById('_' + normId(id));
  const normalizeText = s => String(s ?? '').replace(/\r\n?/g, '\n');

  const notifyErr = (msg, tag = 'craft') => {
    const d = el('div', {}, String(msg || 'Request failed.'));
    if (window.UIkit?.notification) window.UIkit.notification(d.innerHTML, {status: 'destructive', pos: 'bottom-right'});
    else console.error(`${tag}:`, msg);
  };

  const defineGhStyle = (cm, p, codeOnly = false) => {
    const t = cm.hl.tags;
    const rules = [
      {tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#6a737d'},
      {tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.operator, t.compareOperator, t.logicOperator, t.arithmeticOperator, t.bitwiseOperator, t.updateOperator], color: p.kw},
      {tag: [t.string, t.special(t.string), t.docString], color: p.str},
      {tag: [t.regexp], color: p.re},
      {tag: [t.self, t.escape, t.number, t.integer, t.float, t.bool, t.null, t.atom, t.constant(t.variableName), t.propertyName, t.attributeName, t.standard(t.variableName), t.special(t.variableName), ...(codeOnly ? [] : [t.link, t.url])], color: p.num},
      {tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName)), t.className, t.definition(t.className), t.typeName, t.meta, t.annotation], color: p.fn},
      {tag: [t.tagName], color: p.tag},
      {tag: [t.invalid], color: p.inv, fontStyle: 'italic'},
    ];
    if (!codeOnly) {
      rules.push(
        {tag: [t.heading], color: p.num, fontWeight: 'bold'},
        {tag: [t.strong], fontWeight: 'bold', color: p.fg},
        {tag: [t.emphasis], fontStyle: 'italic', color: p.fg},
        {tag: [t.variableName, t.definition(t.variableName), t.punctuation, t.bracket, t.paren, t.squareBracket, t.brace], color: p.fg},
      );
    }
    return cm.lang.HighlightStyle.define(rules);
  };

  const DARK_PAL = window.__craftCfg?.cm_dark_pal || {kw: '#f97583', str: '#9ecbff', re: '#dbedff', num: '#79b8ff', fn: '#b392f0', tag: '#85e89d', fg: '#e1e4e8', inv: '#fdaeb7'};
  const LIGHT_PAL = window.__craftCfg?.cm_light_pal || {kw: '#d73a49', str: '#032f62', re: '#032f62', num: '#005cc5', fn: '#6f42c1', tag: '#22863a', fg: '#24292e', inv: '#cb2431'};

  const buildStyles = cm => {
    if (cm.ghDarkStyle && cm.ghLightStyle && cm.mdCodeDarkStyle && cm.mdCodeLightStyle) return cm;
    cm.ghDarkStyle = defineGhStyle(cm, DARK_PAL, false);
    cm.ghLightStyle = defineGhStyle(cm, LIGHT_PAL, false);
    cm.mdCodeDarkStyle = defineGhStyle(cm, DARK_PAL, true);
    cm.mdCodeLightStyle = defineGhStyle(cm, LIGHT_PAL, true);
    cm.darkTheme = cm.view.EditorView.theme({'&': {lineHeight: 'var(--craft-code-lh, 1.2)'}, '.cm-scroller': {lineHeight: 'var(--craft-code-lh, 1.2)'}}, {dark: true});
    cm.lightTheme = cm.view.EditorView.theme({'&': {lineHeight: 'var(--craft-code-lh, 1.2)'}, '.cm-scroller': {lineHeight: 'var(--craft-code-lh, 1.2)'}}, {dark: false});
    cm.theme = cm.darkTheme;
    return cm;
  };

  const loadCoreCM = () => window.__craftCM6LocalPromise ??= (async () => {
    try {
      const mod = await import(`${LOCAL_CM_BASE}/index.js`);
      return buildStyles({...mod, _source: 'local'});
    } catch (localErr) {
      console.warn('craftC2: local CM6 bundle unavailable, falling back to esm.sh', localErr);
      const entries = await Promise.all(Object.entries(CM_URLS).map(async ([k, u]) => [k, await import(u)]));
      return buildStyles({...Object.fromEntries(entries), _source: 'cdn'});
    }
  })().catch(err => {
    window.__craftCM6LocalPromise = null;
    console.error('craftC2: failed to load CodeMirror 6', err);
    throw err;
  });

/* #0d55ecdc */
const langCache = window.__craftCM6Langs ??= new Map();
  async function loadLang(cm, langKey) {
    if (langKey === 'python') return cm.python.python();
    const spec = LANG_SPECS[langKey];
    if (!spec) return [];
    const ck = `${cm._source || 'cdn'}:${langKey}`;
    if (langCache.has(ck)) return langCache.get(ck);
    const local = cm._source === 'local';
    const mod = await import(local ? `${LOCAL_CM_BASE}/${spec[2]}` : spec[3]);
    const ext = spec[4](mod, cm);
    langCache.set(ck, ext);
    return ext;
  }

  function codeLanguages(cm) {
    const LD = cm.lang.LanguageDescription;
    return [
      LD.of({name: 'Python', alias: ['py', 'py3', 'python3'], load: async () => cm.python.python()}),
      ...Object.entries(LANG_SPECS)
        .filter(([k]) => k !== 'markdown')
        .map(([k, [name, alias]]) => LD.of({name, alias, load: () => loadLang(cm, k)})),
    ];
  }

  function syncFindBoxToView(v, cm) {
    if (!cm) return;
    const box = document.getElementById('find-box');
    if (!box || box.classList.contains('hidden')) return;
    const q = document.getElementById('search')?.value || '';
    if (!q) return;
    const isRegex = Boolean(document.getElementById('use_regex')?.checked);
    const useCase = Boolean(document.getElementById('use_case')?.checked);
    const caseSensitive = typeof window.smartCased === 'function' ? window.smartCased(q, useCase) : (useCase || /\p{Uppercase}/u.test(q));
    const replRow = document.getElementById('replace-row');
    const replace = replRow && !replRow.classList.contains('hidden') ? (document.getElementById('replace')?.value || '') : '';
    try {
      const sq = new cm.search.SearchQuery({search: q, regexp: isRegex, caseSensitive, replace});
      v.dispatch({effects: cm.search.setSearchQuery.of(sq)});
      cm.search.openSearchPanel(v);
    } catch {}
  }

  function applySelection(v, selSpec, resolveHint = null) {
    const len = v.state.doc.length;
    const clamp = n => Math.max(0, Math.min(len, n));
    if (selSpec?.anchor != null) {
      const anchor = clamp(selSpec.anchor);
      v.dispatch({selection: {anchor, head: clamp(selSpec.head ?? anchor)}});
    } else if (selSpec?.caretHint && resolveHint) {
      const matched = resolveHint(v.state.doc.toString(), selSpec.caretHint);
      if (matched != null) v.dispatch({selection: {anchor: clamp(matched)}});
      else if (selSpec.coords) {
        const pos = v.posAtCoords(selSpec.coords);
        v.dispatch({selection: {anchor: pos != null ? clamp(pos) : len}});
      }
    } else if (selSpec?.coords) {
      const pos = v.posAtCoords(selSpec.coords);
      v.dispatch({selection: {anchor: pos != null ? clamp(pos) : len}});
    } else if (selSpec?.toEnd) {
      v.dispatch({selection: {anchor: len}});
    }
  }

  const _dirtyGuards = new Set();
  let _origFollowRename = null, _followRenameWrapped = false;
  const _ensureFollowRenameWrapped = () => {
    if (_followRenameWrapped || typeof window.followRename !== 'function') return;
    _origFollowRename = window.followRename;
    _followRenameWrapped = true;
    window.followRename = async function(url) {
      for (const guard of [..._dirtyGuards]) {
        if (!(await guard())) return;
      }
      return _origFollowRename.call(this, url);
    };
  };
  const _teardownFollowRename = () => {
    if (!_followRenameWrapped) return;
    window.followRename = _origFollowRename;
    _origFollowRename = null;
    _followRenameWrapped = false;
  };
  function installDirtyGuards({dirtyIds, getContent, save, failMsg, tag = 'craft'}) {
    const onBeforeUnload = e => {
      if (!dirtyIds.size) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    const guard = async () => {
      for (const k of [...dirtyIds]) {
        const content = getContent(k);
        if (content != null && !(await save(k, content))) {
          notifyErr(failMsg || 'Could not save edit before reopening renamed dialog.', tag);
          return false;
        }
      }
      return true;
    };
    _dirtyGuards.add(guard);
    _ensureFollowRenameWrapped();
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      _dirtyGuards.delete(guard);
      if (!_dirtyGuards.size) _teardownFollowRename();
    };
  }

  const SOLVEIT = Object.freeze({
    sel: Object.freeze({
      dialog: '#dialog-container',
      cell: '#dialog-container > .editable',
      cellWithId: '#dialog-container > .editable[id]',
      primaryCell: '#dialog-container > .editable[data-sm="primary"]',
      selectedCell: '[data-sm="primary"],[data-sm="secondary"]',
      cardIn: ':scope > .card-in',
      cardOut: ':scope > .card-out',
      cardInType: '.card-in[data-mtype]',
      codeCard: '.card-in[data-mtype="code"]',
      noteCard: '.card-in[data-mtype="note"]',
      promptCard: '.card-in[data-mtype="prompt"]',
      rawCard: '.card-in[data-mtype="raw"]',
      cardHeader: '.uk-card-header',
      msgBody: '.msg-body',
      msgContent: '.msg-content',
      findBox: '#find-box',
      kid: '#kid',
      tblRow: '.tbl-row',
      ansiRed: '.ansi-red-fg',
      collapseBtn: '[hx-post="/collapse_"]',
      skipBtn: 'button[hx-post="/toggle_skip_"]',
      skipActive: 'button[hx-post="/toggle_skip_"] use[href="#lc-eye-off"]',
      editBtn: '.card-in [hx-post="/editor_"]',
      deleteBtn: '.uk-card-header button[title^="Delete"], .uk-card-header button[hx-post*="rm_msg"], .uk-card-header button[hx-post*="del_msg"]',
      running: '#dialog-container .editable[data-wait="true"], #dialog-container .htmx-request, #dialog-container [data-running="true"]',
    }),
    api: Object.freeze({
      addAbove: '/add_above_',
      addBelow: '/add_below_',
      setMtyp: '/set_mtyp_',
      toggleSkip: '/toggle_skip_',
      upsertMsg: '/upsert_msg_',
      rmMsg: '/rm_msg_',
      collapse: '/collapse_',
      addRunq: '/add_runq_',
      setContents: '/set_contents_',
      splitAt: '/split_at_',
      continuePrompt: '/continue_prompt_',
      editor: '/editor_',
      uploadAttachment: '/upload_attachment_',
    }),
    cardInOf: mtype => `.card-in[data-mtype="${mtype}"]`,
  });

  async function jumpToLastCell(exitFn) {
    await exitFn();
    const all = [...document.querySelectorAll(SOLVEIT.sel.cell)].filter(e => !e.hidden && getComputedStyle(e).display !== 'none');
    const last = all[all.length - 1];
    if (!last) return;
    if (window.craftC2?.manages?.(last.id) && !last.querySelector(SOLVEIT.sel.cardIn)?.classList.contains('collapsed')) {
      last.scrollIntoView({block: 'nearest'});
      window.craftC2.edit(last.id, {toEnd: true});
    } else if (window.craftMd?.manages?.(last.id)) {
      last.scrollIntoView({block: 'nearest'});
      window.craftMd.edit(last.id, {toEnd: true});
    } else {
      last.querySelector(`div[hx-post^="${SOLVEIT.api.editor}"]`)?.click();
    }
  }
  const MODAL_OPEN_SEL = '.uk-modal.uk-open, dialog.craft-overlay[open], dialog[data-craft-modal][open], .craft-overlay.open, [data-craft-modal].open';
  const BLOCKED_SEL = `input,textarea,select,[contenteditable],.monaco-editor,#full_editor,${MODAL_OPEN_SEL},[role="dialog"]`;
  const kid = () => document.getElementById('kid')?.value || '';
  const typingBlocked = (extra = '') => !!document.activeElement?.closest(extra ? `${BLOCKED_SEL},${extra}` : BLOCKED_SEL);

  const htmxPost = (url, values = {}, opts = {}) => window.htmx.ajax('POST', url, {
    source: '#kid', swap: 'none', ...opts, values: {kid: kid(), ...values},
  });

  const patch = (node, attrs) => {
    if (!node || !attrs) return node;
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'cls' || k === 'className') { if (v != null && v !== false) node.className = v; }
      else if (k === 'classes' && typeof v === 'object') { for (const [c, flag] of Object.entries(v)) node.classList.toggle(c, !!flag); }
      else if (k === 'dataset') { for (const [dk, dv] of Object.entries(v)) { if (dv == null || dv === false) delete node.dataset[dk]; else node.dataset[dk] = String(dv); } }
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in node && !k.includes('-') && k !== 'role' && k !== 'popover' && k !== 'popovertarget') {
        if (typeof node[k] === 'boolean') node[k] = !!v;
        else if (v != null && v !== false) node[k] = v;
      } else if (v == null || v === false) node.removeAttribute(k);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    return node;
  };

  const el = (tag, attrs = {}, ...kids) => {
    const node = patch(document.createElement(tag), attrs);
    for (const c of kids.flat()) if (c != null && c !== false) node.append(c);
    return node;
  };

  const qs = (sel, root = document) => root?.querySelector(sel) || null;
  const qsa = (sel, root = document) => root ? [...root.querySelectorAll(sel)] : [];

  const on = (target, evs, fn, opts) => {
    if (!target) return () => {};
    if (typeof evs === 'object' && !Array.isArray(evs)) {
      const offs = Object.entries(evs).map(([k, h]) => on(target, k, h, fn));
      return () => offs.forEach(f => f());
    }
    const list = Array.isArray(evs) ? evs : String(evs).trim().split(/\s+/);
    for (const ev of list) target.addEventListener(ev, fn, opts);
    return () => { for (const ev of list) target.removeEventListener(ev, fn, opts); };
  };

  const rafOnce = fn => {
    let id = 0;
    const run = () => { if (!id) id = requestAnimationFrame(() => { id = 0; fn(); }); };
    run.cancel = () => { if (id) { cancelAnimationFrame(id); id = 0; } };
    return run;
  };

  const store = {
    get: (k, def = null, s = localStorage) => { try { const v = s.getItem(k); return v === null ? def : v; } catch { return def; } },
    set: (k, v, s = localStorage) => { try { if (v === null || v === undefined) s.removeItem(k); else s.setItem(k, String(v)); } catch {} },
    del: (k, s = localStorage) => { try { s.removeItem(k); } catch {} },
    json: (k, def = null, s = localStorage) => { try { const v = s.getItem(k); return v === null ? def : JSON.parse(v); } catch { return def; } },
    setJson: (k, v, s = localStorage) => { try { s.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const mountTpl = (name, {htmx = false, refs = false} = {}) => {
    const html = window.__craftTpl?.[name];
    if (!html) return null;
    const t = document.createElement('template');
    t.innerHTML = html;
    const node = t.content.firstElementChild;
    if (node && htmx) window.htmx?.process?.(node);
    if (!refs || !node) return node;
    const out = {root: node};
    if (typeof refs === 'object') {
      for (const [k, sel] of Object.entries(refs)) out[k] = node.querySelector(sel);
    } else {
      for (const n of node.querySelectorAll('[data-ref]')) out[n.dataset.ref] = n;
    }
    return out;
  };

  const offsetIn = (root, node, offset) => {
    if (!root || !node || !root.contains(node)) return null;
    try {
      const r = document.createRange();
      r.selectNodeContents(root);
      r.setEnd(node, offset);
      return r.toString().length;
    } catch { return null; }
  };

/* #06a65527 */
async function saveInputContents({id, content, waitersMap, key = id, tag = 'craft'}) {
    let resolveReq;
    const statusP = new Promise(r => { resolveReq = r; });
    const waiters = waitersMap.get(key) || [];
    waiters.push(resolveReq);
    waitersMap.set(key, waiters);
    try {
      const ajaxP = htmxPost(SOLVEIT.api.setContents, {id_: '_' + id, ids: id, contents: JSON.stringify({[id]: content})})
        .then(() => statusP).catch(() => false);
      const timeoutP = new Promise(r => setTimeout(() => r(false), 8000));
      return Boolean(await Promise.race([ajaxP, timeoutP]));
    } catch (err) {
      console.error(`${tag}: save failed`, err);
      return false;
    } finally {
      const list = waitersMap.get(key);
      if (list) {
        const i = list.indexOf(resolveReq);
        if (i >= 0) list.splice(i, 1);
        if (!list.length) waitersMap.delete(key);
      }
    }
  }

  async function splitCellAt({id, view, msgType, onSuccess, tag = 'craft'}) {
    const content = view.state.doc.toString();
    const linenos = [...new Set(view.state.selection.ranges.map(r => view.state.doc.lineAt(r.from).number))];
    try {
      await htmxPost(SOLVEIT.api.splitAt, {content, linenos: JSON.stringify(linenos), id_: id, msg_type: msgType, is_input: '1'});
      onSuccess?.();
    } catch (err) {
      notifyErr('Could not split cell.', tag);
      console.error(`${tag}: split failed`, err);
    }
  }

  async function switchCellMtype({id, mtyp, onMatch, tag = 'craft'}) {
    try {
      await htmxPost(SOLVEIT.api.setMtyp, {id_: '_' + id, ids: '_' + id, mtyp});
      if (!onMatch) return;
      const matched = await waitForHtmxSettle(
        () => getCellEl(id)?.querySelector(SOLVEIT.sel.cardIn)?.dataset.mtype === mtyp,
        2500
      );
      if (matched) onMatch();
    } catch (err) {
      notifyErr('Could not change cell type.', tag);
      console.error(`${tag}: set_mtyp failed`, err);
    }
  }

  async function runCellCmd({id, cmd, after = '', tag = 'craft', failMsg = ''}) {
    const runCmd = cmd === 'continue' ? 'run' : cmd;
    try {
      await htmxPost(SOLVEIT.api.addRunq, {id_: '_' + id, ids: '_' + id, cmd: runCmd, after});
      if (cmd === 'continue') await htmxPost(SOLVEIT.api.continuePrompt, {id_: '_' + id, ids: '_' + id});
      return true;
    } catch (err) {
      console.error(`${tag}: run failed`, err);
      if (failMsg) notifyErr(failMsg, tag);
      return false;
    }
  }

  function isAtVerticalEdge(v, up, tol = 2) {
    const head = v.state.selection.main.head, doc = v.state.doc;
    const cHead = v.coordsAtPos(head), cEdge = v.coordsAtPos(up ? 0 : doc.length);
    return cHead && cEdge ? Math.abs(cHead.top - cEdge.top) <= tol : doc.lineAt(head).number === (up ? 1 : doc.lines);
  }

  const _domSubs = new Set();
  const _cellSubs = new Set();
  const _pendingCells = new Set();
  const _pendingAttrCells = new Map();
  let _cellRaf = 0;
  const _DOM_ATTRS = ['class', 'style', 'hidden', 'data-mtype', 'data-editing', 'data-sm', 'data-sm-header', 'data-c2-editing', 'data-md-editing', 'data-diff', 'data-wait', 'value'];
  let _domObs = null, _domObserving = false, _domCharData = false;
  const _inDialog = target => {
    const el = target instanceof Element ? target : target?.parentElement;
    return Boolean(el && (el.id === 'dialog-container' || el.closest(SOLVEIT.sel.dialog)));
  };
  const _flushCells = () => {
    _cellRaf = 0;
    const added = [..._pendingCells].filter(c => c.isConnected);
    const attrMap = new Map(_pendingAttrCells);
    _pendingCells.clear();
    _pendingAttrCells.clear();
    if (!added.length && !attrMap.size) return;
    for (const sub of [..._cellSubs]) {
      if (!sub.attrs) {
        if (added.length) sub.fn(added);
        continue;
      }
      const hit = new Set(added);
      for (const a of sub.attrs) {
        const s = attrMap.get(a);
        if (s) for (const c of s) if (c.isConnected) hit.add(c);
      }
      if (hit.size) sub.fn([...hit]);
    }
  };
  const _collectCells = records => {
    if (!_cellSubs.size) return;
    let dirty = false;
    for (const r of records) {
      if (r.type === 'childList') {
        for (const node of r.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(SOLVEIT.sel.cell)) { _pendingCells.add(node); dirty = true; }
          else if (node.id === 'dialog-container' || node.querySelector?.(SOLVEIT.sel.cell)) {
            for (const c of node.querySelectorAll(SOLVEIT.sel.cell)) { _pendingCells.add(c); dirty = true; }
          } else {
            const hostCell = node.closest?.(SOLVEIT.sel.cell);
            if (hostCell) { _pendingCells.add(hostCell); dirty = true; }
          }
        }
      } else if (r.type === 'attributes' && r.target instanceof Element) {
        const hostCell = r.target.closest?.(SOLVEIT.sel.cell);
        if (hostCell) {
          let s = _pendingAttrCells.get(r.attributeName);
          if (!s) _pendingAttrCells.set(r.attributeName, s = new Set());
          s.add(hostCell);
          dirty = true;
        }
      }
    }
    if (dirty && !_cellRaf) _cellRaf = requestAnimationFrame(_flushCells);
  };
  let _muting = 0;
  const _isLiveMut = r => r.type !== 'attributes' || !(r.target instanceof Element) || r.target.getAttribute(r.attributeName) !== r.oldValue;
  const _handleRecords = records => {
    const live = records.filter(_isLiveMut);
    if (!live.length) return;
    _collectCells(live);
    for (const sub of [..._domSubs]) {
      const hit = live.some(r =>
        (!sub.inDialog || _inDialog(r.target)) &&
        (r.type === 'childList' || (sub.charData && r.type === 'characterData') || (sub.attrs && sub.attrs.has(r.attributeName)))
      );
      if (!hit) continue;
      if (sub.delay === 0) sub.fn(live);
      else if (sub.delay === 'micro') { if (!sub.pend) { sub.pend = true; queueMicrotask(() => { sub.pend = false; if (_domSubs.has(sub)) _runMuted(sub.fn); }); } }
      else if (sub.delay === 'raf') { if (!sub.pend) sub.pend = requestAnimationFrame(() => { sub.pend = 0; if (_domSubs.has(sub)) _runMuted(sub.fn); }); }
      else if (typeof sub.delay === 'number') { if (!sub.pend) sub.pend = setTimeout(() => { sub.pend = 0; if (_domSubs.has(sub)) _runMuted(sub.fn); }, sub.delay); }
    }
  };
  const _runMuted = fn => {
    if (!_domObs || !_domObserving) return fn();
    if (!_muting) {
      const pre = _domObs.takeRecords();
      if (pre.length) _handleRecords(pre);
    }
    _muting++;
    try { return fn(); }
    finally {
      _muting--;
      if (!_muting && _domObs && _domObserving) _domObs.takeRecords();
    }
  };
  const _ensureDomObs = () => {
    if ((!_domSubs.size && !_cellSubs.size) || !document.body) return;
    const needCharData = [..._domSubs].some(s => s.charData);
    if (_domObserving && _domCharData === needCharData) return;
    if (!_domObs) _domObs = new MutationObserver(_handleRecords);
    if (_domObserving) _domObs.disconnect();
    _domObs.observe(document.body, {childList: true, subtree: true, attributes: true, attributeOldValue: true, characterData: needCharData, attributeFilter: _DOM_ATTRS});
    _domObserving = true;
    _domCharData = needCharData;
  };
  const _teardownDomObs = () => {
    document.removeEventListener('DOMContentLoaded', _ensureDomObs);
    if (_cellRaf) { cancelAnimationFrame(_cellRaf); _cellRaf = 0; }
    _cellSubs.clear();
    _pendingCells.clear();
    _pendingAttrCells.clear();
    for (const sub of _domSubs) {
      if (sub.delay === 'raf' && sub.pend) cancelAnimationFrame(sub.pend);
      else if (typeof sub.delay === 'number' && sub.pend) clearTimeout(sub.pend);
      sub.pend = 0;
    }
    _domSubs.clear();
    if (_domObs) { _domObs.disconnect(); _domObserving = false; _domCharData = false; }
  };
  function onDomChange(fn, {attrs = null, delay = 'raf', inDialog = false, charData = false} = {}) {
    const sub = {fn, attrs: attrs ? new Set(attrs) : null, delay, inDialog, charData, pend: 0};
    _domSubs.add(sub);
    if (document.body) _ensureDomObs();
    else document.addEventListener('DOMContentLoaded', _ensureDomObs, {once: true});
    return () => {
      _domSubs.delete(sub);
      if (sub.delay === 'raf' && sub.pend) cancelAnimationFrame(sub.pend);
      else if (typeof sub.delay === 'number' && sub.pend) clearTimeout(sub.pend);
      sub.pend = 0;
      if (!_domSubs.size && !_cellSubs.size && _domObs) { _domObs.disconnect(); _domObserving = false; _domCharData = false; }
      else if (sub.charData) _ensureDomObs();
    };
  }
  function onCells(fn, {attrs = null, initial = false} = {}) {
    const sub = {fn, attrs: attrs ? new Set(attrs) : null};
    _cellSubs.add(sub);
    if (document.body) _ensureDomObs();
    else document.addEventListener('DOMContentLoaded', _ensureDomObs, {once: true});
    if (initial) {
      const runInit = () => { const cs = allCells(); if (cs.length && _cellSubs.has(sub)) fn(cs); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runInit, {once: true});
      else runInit();
    }
    return () => {
      _cellSubs.delete(sub);
      if (!_domSubs.size && !_cellSubs.size && _domObs) { _domObs.disconnect(); _domObserving = false; _domCharData = false; }
    };
  }

  const allCells = ({visible = false} = {}) => {
    const cells = qsa(SOLVEIT.sel.cellWithId);
    return visible ? cells.filter(c => !c.classList.contains('craft-omitted') && c.offsetParent !== null) : cells;
  };
  const selectedCells = ({includeOmitted = false} = {}) => allCells().filter(e =>
    e.matches(SOLVEIT.sel.selectedCell) && (includeOmitted || !e.classList.contains('craft-omitted'))
  );
  const primaryCell = () => qs(SOLVEIT.sel.primaryCell) || selectedCells()[0] || null;
  const cellMtype = cell => cell?.querySelector(SOLVEIT.sel.cardIn)?.dataset.mtype || 'note';
  const dlgKey = () => {
    const u = new URL(location.href);
    return u.searchParams.get('name') || u.pathname || 'default';
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const notify = (msg, opts = {}) => {
    const {status = 'primary', pos = 'bottom-right', timeout = 2500} = typeof opts === 'string' ? {status: opts} : opts;
    const d = el('div', {}, String(msg || ''));
    if (window.UIkit?.notification) window.UIkit.notification(d.innerHTML, {status, pos, timeout});
    else if (status === 'danger' || status === 'destructive') console.error('craft:', msg);
    else console.info('craft:', msg);
  };
  async function deleteCellEl(cell, {tag = 'craft'} = {}) {
    if (!cell || !cell.isConnected) return false;
    const delBtn = cell.querySelector(SOLVEIT.sel.deleteBtn);
    if (delBtn) {
      delBtn.click();
      await waitForHtmxSettle(() => !cell.isConnected, 1500);
      return true;
    }
    try {
      await htmxPost(SOLVEIT.api.rmMsg, {id_: cell.id, ids: cell.id});
      return true;
    } catch (err) {
      console.error(`${tag}: delete failed`, err);
      return false;
    }
  }
  function waitForHtmxSettle(checkOrEl = null, timeoutMs = 2500) {
    const isPred = typeof checkOrEl === 'function';
    if (isPred) { const hit = checkOrEl(); if (hit) return Promise.resolve(hit); }
    return new Promise(resolve => {
      let done = false;
      const finish = val => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        offSettle(); offSwap(); offDom();
        resolve(val);
      };
      const check = e => {
        if (isPred) { const hit = checkOrEl(); if (hit) finish(hit); }
        else if (!checkOrEl || e?.target === checkOrEl || checkOrEl.contains?.(e?.target)) finish(true);
      };
      const offSettle = on(document, 'htmx:afterSettle', check);
      const offSwap = on(document, 'htmx:afterSwap', check);
      const offDom = isPred ? onDomChange(() => check(), {delay: 'micro', inDialog: true}) : () => {};
      const timer = setTimeout(() => finish(isPred ? (checkOrEl() || null) : false), timeoutMs);
    });
  }

  const waitForNewCell = (beforeIds, timeoutMs = 3000) =>
    waitForHtmxSettle(() => allCells().find(c => !beforeIds.has(c.id)) || null, timeoutMs);

  function getCellInputText(cell, {rawOnly = false} = {}) {
    if (!cell) return rawOnly ? null : '';
    const id = normId(cell.id);
    const ta = cell.querySelector(`textarea[name="content"], input[name="content"], textarea#_${id}_content, textarea[data-content], textarea[name="msg"], textarea`);
    if (ta && typeof ta.value === 'string') return ta.value;
    const mtype = cellMtype(cell);
    if (mtype === 'code' || mtype === 'raw') {
      const pre = cell.querySelector(':scope > .card-in .msg-content pre code, :scope > .card-in .msg-content pre');
      if (pre) return pre.textContent || '';
    }
    if (rawOnly) return null;
    const cm = cell.querySelector('.cm-content');
    if (cm) return cm.textContent || '';
    return cell.querySelector(`${SOLVEIT.sel.cardIn} ${SOLVEIT.sel.msgContent}`)?.textContent?.trim() || '';
  }

  function headingLevel(cell) {
    const h = cell?.querySelector(`${SOLVEIT.sel.noteCard} ${SOLVEIT.sel.msgContent} :is(h1,h2,h3,h4,h5,h6)`);
    return h ? Number(h.tagName[1]) || 0 : 0;
  }

  function onCellHtmx(paths, fn, {signal = null} = {}) {
    const prefixes = Array.isArray(paths) ? paths : [paths];
    return on(document, 'htmx:configRequest', e => {
      const path = e.detail?.path || '';
      if (!prefixes.some(p => path.startsWith(p))) return;
      const params = e.detail?.parameters || {};
      const rawId = params.id_ || params.id || '';
      const id = rawId ? normId(rawId) : '';
      const ids = params.ids ? String(params.ids).split(',').map(normId).filter(Boolean) : (id ? [id] : []);
      let contents = null;
      if (params.contents) { try { contents = JSON.parse(params.contents); } catch {} }
      fn({path, params, id, ids, contents, event: e});
    }, signal ? {signal} : undefined);
  }

  async function fetchJson(url, {method = 'POST', body = null, signal = null, timeoutMs = 15000, headers = {}} = {}) {
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    if (signal) {
      if (signal.aborted) ac.abort();
      else signal.addEventListener('abort', onAbort, {once: true});
    }
    const timer = timeoutMs ? setTimeout(() => ac.abort(), timeoutMs) : 0;
    try {
      const opts = {method, signal: ac.signal, headers: {...headers}};
      if (body !== null && body !== undefined) {
        if (typeof body === 'string' || body instanceof FormData || body instanceof URLSearchParams || body instanceof Blob) opts.body = body;
        else { opts.headers['Content-Type'] ||= 'application/json'; opts.body = JSON.stringify(body); }
      }
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  function mountModal(tplOrEl, {refs = true, htmx = false, closeOnBackdrop = true, closeOnEscape = true, onOpen = null, onClose = null, signal = null} = {}) {
    const mounted = typeof tplOrEl === 'string' ? mountTpl(tplOrEl, {refs, htmx}) : {root: tplOrEl};
    const root = mounted.root || mounted;
    const isDlg = root.tagName === 'DIALOG' && typeof root.showModal === 'function';
    root.setAttribute('data-craft-modal', '');
    if (!root.isConnected && document.body) document.body.append(root);
    const localAc = new AbortController();
    const onExtAbort = () => destroy();
    if (signal) {
      if (signal.aborted) localAc.abort();
      else signal.addEventListener('abort', onExtAbort, {once: true});
    }
    const sig = {signal: localAc.signal};
    const isOpen = () => isDlg ? root.open : root.classList.contains('open');
    const close = () => {
      if (!isOpen()) return;
      if (isDlg) root.close();
      else { root.classList.remove('open'); onClose?.(); }
    };
    const open = () => {
      if (!root.isConnected && document.body) document.body.append(root);
      if (isDlg) { if (!root.open) root.showModal(); }
      else root.classList.add('open');
      onOpen?.();
    };
    const destroy = () => {
      if (signal) signal.removeEventListener('abort', onExtAbort);
      localAc.abort();
      if (isDlg && root.open) root.close();
      root.remove();
    };
    if (isDlg) {
      on(root, 'close', () => onClose?.(), sig);
      on(root, 'cancel', e => {
        if (!closeOnEscape) e.preventDefault();
        else e.stopPropagation();
      }, sig);
    } else if (closeOnEscape) {
      on(document, 'keydown', e => {
        if (e.key === 'Escape' && isOpen()) { e.preventDefault(); e.stopPropagation(); close(); }
      }, {capture: true, signal: localAc.signal});
    }
    if (closeOnBackdrop) on(root, 'click', e => { if (e.target === root) close(); }, sig);
    const closeBtn = mounted.close instanceof Element ? mounted.close : null;
    if (closeBtn) on(closeBtn, 'click', close, sig);
    return {...(typeof mounted === 'object' ? mounted : {}), root, closeBtn, open, close, isOpen, destroy};
  }

  function mountMenu(tplOrEl, {refs = false, htmx = false, onOpen = null, onClose = null, signal = null} = {}) {
    const mounted = typeof tplOrEl === 'string' ? mountTpl(tplOrEl, {refs, htmx}) : {root: tplOrEl};
    const root = mounted.root || mounted;
    if (!root.hasAttribute('popover')) root.setAttribute('popover', 'auto');
    if (!root.isConnected && document.body) document.body.append(root);
    const localAc = new AbortController();
    const onExtAbort = () => destroy();
    if (signal) {
      if (signal.aborted) localAc.abort();
      else signal.addEventListener('abort', onExtAbort, {once: true});
    }
    const sig = {signal: localAc.signal};
    const isOpen = () => root.matches(':popover-open');
    const items = () => qsa('button:not(:disabled), [role="menuitem"]:not([aria-disabled="true"])', root);
    const openAt = (x, y) => {
      if (!root.isConnected && document.body) document.body.append(root);
      if (!isOpen()) root.showPopover();
      if (x != null && y != null) {
        const r = root.getBoundingClientRect();
        const pad = 8;
        root.style.left = Math.max(pad, Math.min(x, window.innerWidth - r.width - pad)) + 'px';
        root.style.top = Math.max(pad, Math.min(y, window.innerHeight - r.height - pad)) + 'px';
      }
    };
    const close = () => { if (isOpen()) root.hidePopover(); };
    const destroy = () => {
      if (signal) signal.removeEventListener('abort', onExtAbort);
      localAc.abort();
      close();
      root.remove();
    };
    on(root, 'toggle', e => {
      if (e.newState === 'open') onOpen?.();
      else onClose?.();
    }, sig);
    on(root, 'keydown', e => {
      const list = items();
      if (!list.length) return;
      const idx = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); list[(idx + 1) % list.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[(idx - 1 + list.length) % list.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
      else if (e.key === 'Escape') { e.stopPropagation(); close(); }
    }, sig);
    return {...(typeof mounted === 'object' ? mounted : {}), root, openAt, close, isOpen, items, destroy};
  }

  function mountBar(tplOrEl, {refs = true, htmx = false, parent = null} = {}) {
    let mounted = null;
    const ensure = () => {
      if (mounted) return mounted;
      mounted = typeof tplOrEl === 'string' ? mountTpl(tplOrEl, {refs, htmx}) : {root: tplOrEl};
      return mounted;
    };
    const show = () => {
      const m = ensure();
      const host = parent || document.body;
      if (host && !m.root.isConnected) host.append(m.root);
      m.root.hidden = false;
      return m;
    };
    const hide = () => { if (mounted?.root) mounted.root.hidden = true; };
    const destroy = () => { mounted?.root?.remove(); mounted = null; };
    const isShown = () => Boolean(mounted?.root?.isConnected && !mounted.root.hidden);
    return {ensure, show, hide, destroy, isShown, get current() { return mounted; }};
  }

  const FEATURE_KEY = 'craft-features-v1';
  const _featureRegistry = new Map();
  const _readFeatureFlags = () => {
    const raw = store.json(FEATURE_KEY, {});
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  };
  const features = {
    KEY: FEATURE_KEY,
    all: () => _readFeatureFlags(),
    isEnabled: id => _readFeatureFlags()[id] !== false,
    setEnabled(id, enabled) {
      const flags = _readFeatureFlags();
      if (enabled) delete flags[id];
      else flags[id] = false;
      store.setJson(FEATURE_KEY, flags);
      return enabled;
    },
    toggle: id => features.setEnabled(id, !features.isEnabled(id)),
    register(id, label = id, desc = '') {
      _featureRegistry.set(id, {id, label, desc});
      return features.isEnabled(id);
    },
    init(id, label = id, desc = '') { return features.register(id, label, desc); },
    list: () => [..._featureRegistry.values()].map(f => ({...f, enabled: features.isEnabled(f.id)})),
  };

/* #57a40547 */
const _optMap = new Map();
  let _optSuppressAutoEdit = 0;
  const optimistic = {
    isOptimistic: id => Boolean(id && String(id).replace(/^_/, '').startsWith('craftopt_')),
    isPending: id => { const r = _optMap.get(normId(id)); return Boolean(r && !r.realId && !r.failed); },
    get: id => _optMap.get(normId(id)) || null,
    register(optId, promise) {
      const k = normId(optId);
      const rec = {promise, realId: null, failed: false};
      _optMap.set(k, rec);
      promise.then(realId => { if (realId) rec.realId = normId(realId); else rec.failed = true; }, () => { rec.failed = true; });
      return rec;
    },
    resolve(optId, realId) { const rec = _optMap.get(normId(optId)); if (rec) rec.realId = normId(realId); },
    fail(optId) { const rec = _optMap.get(normId(optId)); if (rec) rec.failed = true; },
    clear(optId) { _optMap.delete(normId(optId)); },
    async waitForReal(id) {
      const rec = _optMap.get(normId(id));
      if (!rec) return optimistic.isOptimistic(id) ? null : normId(id);
      if (rec.realId) return rec.realId;
      if (rec.failed) return null;
      return await rec.promise;
    },
    suppressAutoEdit() {
      _optSuppressAutoEdit++;
      let done = false;
      return () => { if (!done) { done = true; _optSuppressAutoEdit = Math.max(0, _optSuppressAutoEdit - 1); } };
    },
    isSuppressingAutoEdit: () => _optSuppressAutoEdit > 0,
  };

  function moveNodePreservingFocus(parent, node, afterEl, view) {
    const hadFocus = Boolean(view?.hasFocus || (document.activeElement && node.contains(document.activeElement)));
    const sel = hadFocus && view ? view.state.selection : null;
    const refNode = afterEl ? afterEl.nextSibling : null;
    if (typeof parent.moveBefore === 'function') {
      try { parent.moveBefore(node, refNode); }
      catch { if (afterEl) afterEl.after(node); else parent.append(node); }
    } else {
      if (afterEl) afterEl.after(node); else parent.append(node);
    }
    if (hadFocus && view && !view.hasFocus) {
      if (sel) view.dispatch({selection: sel});
      view.focus();
    }
  }


function createInlineEditor(cfg) {
    const tag = cfg.tag || 'craft';
    const keyToId = cfg.keyToId || (k => k);
    const idToInputKey = cfg.idToInputKey || (id => id);
    const normValue = cfg.normValue || (s => s);
    const saveState = cfg.saveState || ((m, k, rec) => m.set(k, rec.view.state));
    const getStateDoc = cfg.getStateDoc || (st => st.doc.toString());

    const states = new Map(), views = new Map(), pendingSaves = new Map();
    const dirtyIds = new Set(), failedSaves = new Set(), saveWaiters = new Map();
    const requests = new WeakMap();
    let activeKey = null, destroyed = false;

    const syncSaveState = key => {
      const st = failedSaves.has(key) ? 'error' : (pendingSaves.has(key) ? 'saving' : (dirtyIds.has(key) ? 'dirty' : ''));
      cfg.applySaveState(key, st);
    };

    async function resolveOptimisticKey(key) {
      const id = keyToId(key);
      if (!optimistic.isOptimistic(id)) return {key, id};
      const realId = await optimistic.waitForReal(id);
      return realId ? {key: idToInputKey(realId), id: realId} : null;
    }

    async function saveCell(key, content) {
      const resolved = await resolveOptimisticKey(key);
      if (!resolved) return false;
      const {key: curKey, id} = resolved;
      const el = getCellEl(id);
      if (!el) return true;
      const prev = cfg.getText(el, curKey);
      if (content === prev) {
        dirtyIds.delete(curKey);
        failedSaves.delete(curKey);
        syncSaveState(curKey);
        return pendingSaves.get(curKey) ? await pendingSaves.get(curKey) : true;
      }
      dirtyIds.add(curKey);
      failedSaves.delete(curKey);
      syncSaveState(curKey);
      const p = (async () => {
        let ok = false;
        try {
          ok = cfg.persistSave
            ? await cfg.persistSave(curKey, content, saveWaiters)
            : await saveInputContents({id, content, waitersMap: saveWaiters, key: curKey, tag});
        } finally {
          if (pendingSaves.get(curKey) === p) pendingSaves.delete(curKey);
        }
        if (ok) {
          failedSaves.delete(curKey);
          const curEl = getCellEl(id);
          const inp = cfg.getInput(curEl, curKey);
          if (inp && normValue(inp.value) === prev) inp.value = content;
          const curView = views.get(curKey)?.view;
          if (!curView || curView.state.doc.toString() === content) dirtyIds.delete(curKey);
        } else {
          failedSaves.add(curKey);
          notifyErr(cfg.saveFailMsg ? cfg.saveFailMsg(curKey) : 'Could not save cell edit — changes kept in editor.', tag);
        }
        syncSaveState(curKey);
        return ok;
      })();
      pendingSaves.set(curKey, p);
      syncSaveState(curKey);
      return await p;
    }

    function unmountCell(key) {
      const rec = views.get(key);
      cfg.beforeUnmount?.(key, rec);
      if (!rec) return;
      saveState(states, key, rec);
      const el = getCellEl(keyToId(key)), card = cfg.getCard(el, key);
      rec.view.destroy();
      rec.host.remove();
      views.delete(key);
      card?.classList.remove(cfg.mountedCls);
      cfg.setEditing(key, false, el, card);
      if (activeKey === key) activeKey = null;
    }

    async function onCellBlur(key) {
      const rec = views.get(key);
      cfg.beforeBlur?.(key, rec);
      if (!rec) return;
      const ref = rec.ref;
      const el = getCellEl(keyToId(ref.key)), card = cfg.getCard(el, ref.key);
      cfg.setEditing(ref.key, false, el, card);
      if (activeKey === ref.key) activeKey = null;
      const content = rec.view.state.doc.toString();
      saveState(states, ref.key, rec);
      const saved = await saveCell(ref.key, content);
      const curKey = ref.key, cur = views.get(curKey);
      if (!cur || cur.view.hasFocus || activeKey === curKey) return;
      if (!saved || dirtyIds.has(curKey) || cfg.keepMounted?.(curKey, cur)) return;
      unmountCell(curKey);
    }

    async function exitCell(key) {
      if (!key) return;
      const rec = views.get(key);
      cfg.beforeExit?.(key, rec);
      const el = getCellEl(keyToId(key));
      if (rec) {
        rec.view.contentDOM.blur();
        if (el) window.selectMsg?.(window.$(el), {scroll: false});
        await onCellBlur(key);
      }
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    }

    async function saveAndRun(key, cmd) {
      const rec = views.get(key);
      if (!rec) return;
      const ref = rec.ref;
      cfg.beforeRun?.(ref.key, rec);
      const content = rec.view.state.doc.toString();
      saveState(states, ref.key, rec);
      const saved = await saveCell(ref.key, content);
      if (!saved) return;
      const curKey = ref.key, id = keyToId(curKey), el = getCellEl(id);
      if (!el) return;
      const next = cmd === 'shift-run' ? window.adjacentMsg?.(window.$(el), false) : null;
      const after = cmd === 'alt-run' ? (window.sectionTail?.(el) || '') : '';
      cfg.setEditing(curKey, false, el, cfg.getCard(el, curKey));
      if (activeKey === curKey) activeKey = null;
      rec.view.contentDOM.blur();
      if (cmd === 'shift-run' && next?.length) window.selectMsg?.(next);
      else window.selectMsg?.(window.$(el), {scroll: false});
      const cur = views.get(curKey);
      if (cur && !cur.view.hasFocus && activeKey !== curKey && !dirtyIds.has(curKey) && !cfg.keepMounted?.(curKey, cur)) unmountCell(curKey);
      if (await runCellCmd({id, cmd, after, tag, failMsg: cfg.runFailMsg || ''})) schedule();
    }

    async function splitCell(key, v, msgType) {
      const resolved = await resolveOptimisticKey(key);
      if (!resolved) return;
      const {key: curKey, id} = resolved;
      cfg.beforeSplit?.(curKey, v);
      await splitCellAt({
        id, view: v, msgType, tag,
        onSuccess: () => { dirtyIds.delete(curKey); failedSaves.delete(curKey); syncSaveState(curKey); unmountCell(curKey); },
      });
    }

    async function switchCellType(key, v, mtyp, {clearState = false, onMatch} = {}) {
      const resolved = await resolveOptimisticKey(key);
      if (!resolved) return;
      const {key: curKey, id} = resolved;
      const sel = v.state.selection.main;
      const selSpec = {anchor: sel.anchor, head: sel.head};
      cfg.beforeSwitch?.(curKey, v);
      const saved = await saveCell(curKey, v.state.doc.toString());
      if (!saved) return;
      unmountCell(curKey);
      if (clearState) states.delete(curKey);
      const el = getCellEl(id);
      if (el) window.selectMsg?.(window.$(el), {scroll: false});
      await switchCellMtype({id, mtyp, tag, onMatch: onMatch ? () => onMatch(id, selSpec) : null});
    }

    function stepBoundary(key, v, up, {tol = 2, canStep, beforeStep} = {}) {
      if (v.state.selection.ranges.length !== 1 || !v.state.selection.main.empty) return false;
      if (canStep && !canStep(v)) return false;
      if (!isAtVerticalEdge(v, up, tol)) return false;
      const id = keyToId(key), el = getCellEl(id);
      const next = el && window.adjacentMsg?.(window.$(el), up);
      const nextEl = next?.[0];
      if (!nextEl || nextEl === el) return false;
      beforeStep?.(key, v);
      const rec = views.get(key), ref = rec?.ref;
      if (rec) saveState(states, key, {...rec, view: v});
      cfg.setEditing(key, false, el, cfg.getCard(el, key));
      if (activeKey === key) activeKey = null;
      v.contentDOM.blur();
      saveCell(key, v.state.doc.toString()).then(ok => {
        const curKey = ref?.key || key, cur = views.get(curKey);
        if (ok && cur && !cur.view.hasFocus && activeKey !== curKey && !dirtyIds.has(curKey) && !cfg.keepMounted?.(curKey, cur)) unmountCell(curKey);
      });
      const nextId = normId(nextEl.id);
      const edgeSel = up ? {toEnd: true} : {anchor: 0, head: 0};
      const codeCard = nextEl.querySelector(SOLVEIT.sel.codeCard);
      if (window.craftC2?.manages?.(nextId) && codeCard && !codeCard.classList.contains('collapsed')) {
        nextEl.scrollIntoView({block: 'nearest'});
        window.craftC2.edit(nextId, edgeSel);
      } else if (window.craftMd?.manages?.(nextId)) {
        nextEl.scrollIntoView({block: 'nearest'});
        window.craftMd.edit(nextId, edgeSel);
      } else {
        window.selectMsg?.(next);
      }
      return true;
    }

    function openView(key, {el, card, text, cm, selSpec = null, resolveHint = null, canReuseRec, prepareState, hostClass, extraRec, themeExts, onExisting, onMounted}) {
      const body = card?.querySelector(SOLVEIT.sel.msgBody), contentEl = body?.querySelector(SOLVEIT.sel.msgContent);
      if (!body || !contentEl) return false;
      window.selectMsg?.(window.$(el), {scroll: false});
      let rec = views.get(key);
      if (rec && (!canReuseRec || canReuseRec(rec))) {
        if (!body.contains(rec.host)) { contentEl.after(rec.host); card.classList.add(cfg.mountedCls); }
        if (rec.view.state.doc.toString() !== text && !pendingSaves.has(key) && !dirtyIds.has(key)) {
          rec.view.dispatch({changes: {from: 0, to: rec.view.state.doc.length, insert: text}});
        }
        if (selSpec) applySelection(rec.view, selSpec, resolveHint);
        activeKey = key;
        cfg.setEditing(key, true, el, card);
        syncFindBoxToView(rec.view, cm);
        rec.view.focus();
        onExisting?.(rec);
        return true;
      }
      if (rec) unmountCell(key);
      const ref = {key, id: keyToId(key)};
      const {edState, activeComps, reusePrev} = prepareState(ref);
      const host = document.createElement('div');
      host.className = hostClass;
      contentEl.after(host);
      card.classList.add(cfg.mountedCls);
      cfg.setEditing(key, true, el, card);
      const v = new cm.view.EditorView({state: edState, parent: host});
      rec = {view: v, host, ref, ...activeComps, ...extraRec};
      attachHost(rec, host);
      views.set(key, rec);
      activeKey = key;
      cfg.setEditing(key, true, el, card);
      if (reusePrev && themeExts && activeComps.themeComp) v.dispatch({effects: activeComps.themeComp.reconfigure(themeExts)});
      onMounted?.(rec);
      applySelection(v, selSpec || (reusePrev ? null : {toEnd: true}), resolveHint);
      syncFindBoxToView(v, cm);
      v.focus();
      requestAnimationFrame(() => {
        const curKey = ref.key;
        if (!destroyed && activeKey === curKey && views.get(curKey)?.view === v && !v.hasFocus && document.activeElement === document.body) v.focus();
      });
      return true;
    }

    function attachHost(rec, host) {
      host.addEventListener('keydown', e => { e.stopPropagation(); });
      host.addEventListener('focusin', () => {
        const key = rec.ref.key;
        activeKey = key;
        const curEl = getCellEl(keyToId(key));
        cfg.setEditing(key, true, curEl, cfg.getCard(curEl, key));
      });
      host.addEventListener('focusout', () => {
        const check = () => {
          if (destroyed || rec._reparenting) return;
          if (!host.isConnected) { sync(); return; }
          const ae = document.activeElement;
          if (host.contains(ae) || ae?.closest?.('.cm-tooltip')) return;
          onCellBlur(rec.ref.key);
        };
        queueMicrotask(() => {
          if (destroyed || rec._reparenting) return;
          if (!host.isConnected) { sync(); return; }
          requestAnimationFrame(check);
        });
      });
    }

    function rekey(oldKey, newKey, {el, card} = {}) {
      const rec = views.get(oldKey);
      if (!rec) return false;
      const oldId = keyToId(oldKey), newId = keyToId(newKey);
      const oldEl = getCellEl(oldId), oldCard = cfg.getCard(oldEl, oldKey);
      views.delete(oldKey);
      views.set(newKey, rec);
      rec.ref.key = newKey;
      rec.ref.id = newId;
      if (states.has(oldKey)) { states.set(newKey, states.get(oldKey)); states.delete(oldKey); }
      if (dirtyIds.has(oldKey)) { dirtyIds.delete(oldKey); dirtyIds.add(newKey); }
      if (failedSaves.has(oldKey)) { failedSaves.delete(oldKey); failedSaves.add(newKey); }
      if (pendingSaves.has(oldKey)) { pendingSaves.set(newKey, pendingSaves.get(oldKey)); pendingSaves.delete(oldKey); }
      if (saveWaiters.has(oldKey)) { saveWaiters.set(newKey, saveWaiters.get(oldKey)); saveWaiters.delete(oldKey); }
      if (activeKey === oldKey) activeKey = newKey;
      cfg.onRekey?.(oldKey, newKey, rec);
      const realEl = el || getCellEl(newId), realCard = card || cfg.getCard(realEl, newKey);
      const body = realCard?.querySelector(SOLVEIT.sel.msgBody), contentEl = body?.querySelector(SOLVEIT.sel.msgContent);
      if (body && contentEl) {
        rec._reparenting = true;
        try { moveNodePreservingFocus(body, rec.host, contentEl, rec.view); }
        finally { queueMicrotask(() => { rec._reparenting = false; }); }
        realCard.classList.add(cfg.mountedCls);
        oldCard?.classList.remove(cfg.mountedCls);
        cfg.setEditing(oldKey, false, oldEl, oldCard);
        if (activeKey === newKey || rec.view.hasFocus) cfg.setEditing(newKey, true, realEl, realCard);
      }
      syncSaveState(newKey);
      return true;
    }

    const sync = () => {
      cfg.onSync?.();
      for (const [key, rec] of [...views]) {
        const el = getCellEl(keyToId(key)), card = cfg.getCard(el, key);
        if (!el || !card || !cfg.isViewValid(key, rec, el, card)) {
          rec.view.destroy();
          views.delete(key);
          dirtyIds.delete(key);
          failedSaves.delete(key);
          syncSaveState(key);
          if (activeKey === key) activeKey = null;
          continue;
        }
        const body = card.querySelector(SOLVEIT.sel.msgBody), contentEl = body?.querySelector(SOLVEIT.sel.msgContent);
        if (body && contentEl) {
          if (!body.contains(rec.host)) contentEl.after(rec.host);
          card.classList.add(cfg.mountedCls);
          if (activeKey === key) {
            cfg.setEditing(key, true, el, card);
            if (!rec.view.hasFocus || document.activeElement !== rec.view.contentDOM) rec.view.focus();
          }
        }
        cfg.onViewSynced?.(key, rec);
      }
      for (const key of [...states.keys()]) {
        if (!views.has(key) && !dirtyIds.has(key) && !pendingSaves.has(key) && !getCellEl(keyToId(key))) states.delete(key);
      }
    };
    const schedule = rafOnce(sync);

    const before = ({detail: {ctx} = {}}) => {
      const request = ctx?.request, body = request?.body;
      if (!body?.get || request.method !== 'POST') return;
      const pathname = new URL(request.action, location.href).pathname;
      if (pathname === SOLVEIT.api.setContents) {
        const id = normId(body.get('ids'));
        const key = id ? idToInputKey(id) : '';
        const waiters = key ? saveWaiters.get(key) : null;
        if (waiters?.length) {
          const resolve = waiters.shift();
          if (!waiters.length) saveWaiters.delete(key);
          requests.set(ctx, {kind: 'save', resolve});
        }
        return;
      }
      cfg.onBeforeRequest?.(ctx, pathname, body);
    };

    const after = ({detail: {ctx} = {}}) => {
      const rec = ctx && requests.get(ctx);
      if (rec?.kind === 'save') {
        const ok = Boolean(ctx.response && ctx.response.status >= 200 && ctx.response.status < 300);
        rec.resolve?.(ok);
        return;
      }
      cfg.onAfterRequest?.(ctx);
    };

    const onKeyDown = e => {
      if (!cfg.openPrimaryOnEnter) return;
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (typingBlocked(cfg.typingBlockedExtra || '')) return;
      const el = document.querySelector(SOLVEIT.sel.primaryCell);
      if (!el || !cfg.openPrimaryOnEnter(el, false)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      cfg.openPrimaryOnEnter(el, true);
    };

    const onClick = e => {
      if (cfg.onEditClick) {
        const edit = e.target.closest?.(cfg.editClickSel || SOLVEIT.sel.editBtn);
        if (edit) {
          if (cfg.onEditClick(edit, e)) return;
        }
      }
      cfg.onExtraClick?.(e);
    };

    const onThemeChange = () => {
      if (!cfg.getThemeExts) return;
      for (const rec of views.values()) {
        const exts = cfg.getThemeExts(rec);
        if (exts && rec.themeComp) rec.view.dispatch({effects: rec.themeComp.reconfigure(exts)});
      }
    };

    const DEFAULT_POINTER_IGNORE = 'a, button, summary, input, select, textarea, label, [role="button"], .craft-cm-host, .copy-wrap > button';
    let pendingPointer = null;
    const onPointerDown = cfg.pointerEdit ? e => {
      const pe = cfg.pointerEdit;
      if (e.button !== 0) return;
      if (pe.ignoreMods && (e.metaKey || e.ctrlKey || e.altKey)) return;
      if (e.target.closest?.(pe.ignoreSel || DEFAULT_POINTER_IGNORE)) return;
      const hit = pe.resolveTarget(e);
      if (!hit) return;
      pendingPointer = {...hit, x: e.clientX, y: e.clientY};
    } : null;
    const onPointerUp = cfg.pointerEdit ? e => {
      if (!pendingPointer) return;
      const p = pendingPointer;
      pendingPointer = null;
      const sel = window.getSelection();
      if (p.dragSelectGuard) {
        const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
        if (moved > 5 && sel && !sel.isCollapsed) return;
        cfg.pointerEdit.onOpen(p, {caretHint: p.caretHint, coords: {x: e.clientX, y: e.clientY}}, e);
        return;
      }
      const anchor = offsetIn(p.codeEl, sel?.anchorNode, sel?.anchorOffset);
      const head = offsetIn(p.codeEl, sel?.focusNode, sel?.focusOffset);
      if (anchor != null) sel?.removeAllRanges();
      cfg.pointerEdit.onOpen(p, anchor != null ? {anchor, head: head ?? anchor} : {coords: {x: e.clientX, y: e.clientY}}, e);
    } : null;

    const sep = window.htmx?.config.metaCharacter || ':';
    const configEvent = ['htmx', 'config', 'request'].join(sep);
    const afterEvent = ['htmx', 'after', 'request'].join(sep);
    const unsubDom = onDomChange(schedule, {attrs: cfg.domAttrs || null, delay: 'raf', inDialog: Boolean(cfg.inDialog)});
    const removeDirtyGuards = installDirtyGuards({
      dirtyIds,
      getContent: key => (views.get(key) ? views.get(key).view.state.doc.toString() : (states.get(key) ? getStateDoc(states.get(key)) : undefined)),
      save: saveCell,
      failMsg: cfg.failRenameMsg || 'Could not save edit before reopening renamed dialog.',
      tag,
    });
    const ac = new AbortController(), sig = {signal: ac.signal}, cap = {capture: true, signal: ac.signal};
    on(document, {[configEvent]: before, [afterEvent]: after, 'uk-theme-switcher:change': onThemeChange}, sig);
    on(document, {click: onClick, keydown: onKeyDown}, cap);
    if (onPointerDown && onPointerUp) on(document, {mousedown: onPointerDown, mouseup: onPointerUp}, sig);

    return {
      states, views, pendingSaves, dirtyIds, failedSaves, saveWaiters,
      get activeKey() { return activeKey; },
      set activeKey(v) { activeKey = v; },
      get destroyed() { return destroyed; },
      syncSaveState, saveCell, unmountCell, onCellBlur, exitCell, saveAndRun, splitCell,
      switchCellType, stepBoundary, openView, attachHost, rekey, sync, schedule,
      disable() {
        destroyed = true;
        unsubDom();
        schedule.cancel();
        removeDirtyGuards();
        pendingPointer = null;
        ac.abort();
        for (const key of [...views.keys()]) unmountCell(key);
        views.clear(); states.clear(); pendingSaves.clear(); dirtyIds.clear(); failedSaves.clear(); saveWaiters.clear();
      },
    };
  }

/* #4cbe7dfe */
/**
   * @typedef {Object} CraftSolveitContract
   * @property {Readonly<Record<string, string>>} sel
   * @property {Readonly<Record<string, string>>} api
   * @property {(mtype: string) => string} cardInOf
   */
  /**
   * @typedef {Object} CraftFeatureInfo
   * @property {string} id
   * @property {string} label
   * @property {string} desc
   * @property {boolean} enabled
   */
  /**
   * @typedef {Object} CraftFeaturesApi
   * @property {string} KEY
   * @property {() => Record<string, boolean>} all
   * @property {(id: string) => boolean} isEnabled
   * @property {(id: string, enabled: boolean) => boolean} setEnabled
   * @property {(id: string) => boolean} toggle
   * @property {(id: string, label?: string, desc?: string) => boolean} register
   * @property {(id: string, label?: string, desc?: string) => boolean} init
   * @property {() => CraftFeatureInfo[]} list
   */
  /**
   * @typedef {Object} CraftPointerEditConfig
   * @property {string} [ignoreSel]
   * @property {boolean} [ignoreMods]
   * @property {(e: MouseEvent) => ({id: string, codeEl?: Element|null, caretHint?: any, dragSelectGuard?: boolean} | null)} resolveTarget
   * @property {(target: any, selSpec: any, e: MouseEvent) => void} onOpen
   */
  /**
   * @typedef {Object} CraftCMCore
   * @property {string} LOCAL_CM_BASE
   * @property {string} CM_DEPS
   * @property {Record<string, string>} CM_URLS
   * @property {Record<string, any>} LANG_SPECS
   * @property {Record<string, string>} LANG_ALIASES
   * @property {Map<string, any>} langCache
   * @property {CraftSolveitContract} SOLVEIT
   * @property {CraftFeaturesApi} features
   * @property {boolean} isMac
   * @property {() => boolean} isDark
   * @property {(id: any) => string} normId
   * @property {(id: any) => HTMLElement|null} getCellEl
   * @property {(s: any) => string} normalizeText
   * @property {(msg: string, tag?: string) => void} notifyErr
   * @property {(cm: any) => any} buildStyles
   * @property {() => Promise<any>} loadCoreCM
   * @property {(cm: any, langKey: string) => Promise<any>} loadLang
   * @property {(code: string) => string[]} codeLanguages
   * @property {(view: any, cm: any) => void} syncFindBoxToView
   * @property {(view: any, selSpec: any, resolveHint?: any) => void} applySelection
   * @property {(opts: any) => () => void} installDirtyGuards
   * @property {(exitFn: () => Promise<any>) => Promise<void>} jumpToLastCell
   * @property {string} MODAL_OPEN_SEL
   * @property {() => string} kid
   * @property {(extra?: string) => boolean} typingBlocked
   * @property {(url: string, values?: Record<string, any>, opts?: Record<string, any>) => Promise<any>} htmxPost
   * @property {(node: any, attrs: Record<string, any>) => any} patch
   * @property {(tag: string, attrs?: Record<string, any>, ...kids: any[]) => HTMLElement} el
   * @property {(sel: string, root?: ParentNode|null) => Element|null} qs
   * @property {(sel: string, root?: ParentNode|null) => Element[]} qsa
   * @property {(target: any, evs: any, fn: any, opts?: any) => () => void} on
   * @property {(fn: () => void) => ((() => void) & {cancel: () => void})} rafOnce
   * @property {{get: Function, set: Function, del: Function, json: Function, setJson: Function}} store
   * @property {(name: string, opts?: {htmx?: boolean, refs?: boolean|Record<string, string>}) => any} mountTpl
   * @property {(root: Node|null, node: Node|null|undefined, offset: number|undefined) => number|null} offsetIn
   * @property {(opts: any) => Promise<boolean>} saveInputContents
   * @property {(opts: any) => Promise<void>} splitCellAt
   * @property {(opts: any) => Promise<void>} switchCellMtype
   * @property {(opts: any) => Promise<boolean>} runCellCmd
   * @property {(v: any, up: boolean, tol?: number) => boolean} isAtVerticalEdge
   * @property {(fn: (records?: MutationRecord[]) => void, opts?: {attrs?: string[]|null, delay?: number|'raf'|'micro', inDialog?: boolean, charData?: boolean}) => () => void} onDomChange
   * @property {(fn: (cells: HTMLElement[]) => void, opts?: {attrs?: string[]|null, initial?: boolean}) => () => void} onCells
   * @property {(cfg: any) => any} createInlineEditor
   * @property {Record<string, any>} optimistic
   * @property {(opts?: {visible?: boolean}) => HTMLElement[]} allCells
   * @property {(opts?: {includeOmitted?: boolean}) => HTMLElement[]} selectedCells
   * @property {() => HTMLElement|null} primaryCell
   * @property {(cell: Element|null) => string} cellMtype
   * @property {() => string} dlgKey
   * @property {(ms: number) => Promise<void>} sleep
   * @property {(msg: string, opts?: string|Record<string, any>) => void} notify
   * @property {(cell: Element|null, opts?: {tag?: string}) => Promise<boolean>} deleteCellEl
   * @property {(tplOrEl: string|Element, opts?: Record<string, any>) => any} mountModal
   * @property {(tplOrEl: string|Element, opts?: Record<string, any>) => any} mountMenu
   * @property {(tplOrEl: string|Element, opts?: Record<string, any>) => any} mountBar
   * @property {(checkOrEl?: any, timeoutMs?: number) => Promise<any>} waitForHtmxSettle
   * @property {(beforeIds: Set<string>, timeoutMs?: number) => Promise<HTMLElement|null>} waitForNewCell
   * @property {(cell: Element|null, opts?: {rawOnly?: boolean}) => string|null} getCellInputText
   * @property {(cell: Element|null) => number} headingLevel
   * @property {(paths: string|string[], fn: (ev: any) => void, opts?: {signal?: AbortSignal|null}) => () => void} onCellHtmx
   * @property {(url: string, opts?: Record<string, any>) => Promise<any>} fetchJson
   * @property {() => void} disable
   */
  /** @type {CraftCMCore} */
  window.__craftCMCore = {
    LOCAL_CM_BASE, CM_DEPS, CM_URLS, LANG_SPECS, LANG_ALIASES, langCache,
    SOLVEIT, features,
    isMac, isDark, normId, getCellEl, normalizeText, notifyErr,
    buildStyles, loadCoreCM, loadLang, codeLanguages, syncFindBoxToView, applySelection,
    installDirtyGuards, jumpToLastCell,
    MODAL_OPEN_SEL, kid, typingBlocked, htmxPost, patch, el, qs, qsa, on, rafOnce, store, mountTpl, offsetIn,
    saveInputContents, splitCellAt, switchCellMtype, runCellCmd, isAtVerticalEdge,
    onDomChange, onCells, createInlineEditor, optimistic, allCells, selectedCells, primaryCell, cellMtype, dlgKey, sleep, notify, deleteCellEl, mountModal, mountMenu, mountBar, waitForHtmxSettle, waitForNewCell, getCellInputText, headingLevel, onCellHtmx, fetchJson,
    disable() { _teardownDomObs(); _dirtyGuards.clear(); _teardownFollowRename(); },
  };
})();

/* %% nbs/craft/05_dialog_chrome.ipynb #6efd82c1 */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"mobile_toggle_btn": "<button id=\"craft-mobile-toggle\" class=\"craft-nav-icon-btn\" type=\"button\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"craft-icon-phone\"><rect x=\"7\" y=\"2\" width=\"10\" height=\"20\" rx=\"2\"></rect><path d=\"M11 18h2\"></path></svg><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"craft-icon-desk\"><rect x=\"2\" y=\"3\" width=\"20\" height=\"14\" rx=\"2\"></rect><path d=\"M8 21h8M12 17v4\"></path></svg></button>", "launcher_root": "<dialog class=\"craft-overlay\" id=\"solveit-launcher\" aria-label=\"Command palette\"><div class=\"uk-card craft-card solveit-launcher-card\"><input type=\"text\" placeholder=\"Run a command or open a dialog/file…\" autocomplete=\"off\" spellcheck=\"false\" aria-label=\"Search commands and files\" data-ref=\"input\"><ul role=\"listbox\" data-ref=\"list\"></ul></div></dialog>"});

/* %% nbs/craft/05_dialog_chrome.ipynb #c87b8aba */
/* ── Mobile mode detection & view toggle ───────────────────────────────
   Auto-enables `html.craft-mobile` only on touch/mobile devices (`(hover: none)
   and (pointer: coarse)`), so shrinking a desktop window stays in desktop view.
   Users can explicitly switch between Desktop and Mobile at any time via the
   navbar toggle button (#craft-mobile-toggle), the launcher, or
   `window.craftMobile.setMode('auto'|'mobile'|'desktop')`. */
(() => {
  window.craftMobile?.disable?.();
  if (!window.__craftCMCore.features.init('mobile-mode', 'Mobile mode toggle', 'Auto-detect touch layout & view switcher')) return;
  const {mountTpl, qs, on, store, patch} = window.__craftCMCore;
  const ac = new AbortController(), sig = {signal: ac.signal};
  const PREF_KEY = 'craft-mobile-mode';
  const mq = matchMedia('(hover: none) and (pointer: coarse)');
  const root = document.documentElement, listeners = new Set();
  let meta = qs('meta[name="viewport"]'), addedMeta = false, prevMeta = meta?.content;
  const VIEWPORT = 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content';
  if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; document.head.append(meta); addedMeta = true; }
  if (!/width\s*=\s*device-width/.test(meta.content || '')) meta.content = VIEWPORT;
  else {
    if (!/viewport-fit/.test(meta.content)) meta.content += ', viewport-fit=cover';
    if (!/interactive-widget/.test(meta.content)) meta.content += ', interactive-widget=resizes-content';
  }
  const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS && !/maximum-scale/.test(meta.content)) meta.content += ', maximum-scale=1';

  const readPref = () => { const v = store.get(PREF_KEY); return (v === 'mobile' || v === 'desktop') ? v : 'auto'; };
  let pref = readPref();
  const computeActive = () => pref === 'mobile' ? true : pref === 'desktop' ? false : mq.matches;

  const toggleBtn = mountTpl('mobile_toggle_btn');

  const syncToggleBtn = () => {
    const isMob = root.classList.contains('craft-mobile');
    const key = `${isMob ? 'm' : 'd'}:${pref}`;
    if (toggleBtn.dataset.state === key) return;
    const title = isMob
      ? `Switch to desktop view (current: ${pref === 'auto' ? 'auto mobile' : 'mobile'})`
      : `Switch to mobile view (current: ${pref === 'auto' ? 'auto desktop' : 'desktop'})`;
    patch(toggleBtn, {dataset: {state: key}, title, 'aria-label': title, 'aria-pressed': String(isMob)});
  };

  const mountToggleBtn = () => {
    if (!toggleBtn.isConnected && document.body) document.body.append(toggleBtn);
    syncToggleBtn();
  };

  const apply = () => {
    const on = computeActive();
    if (root.classList.contains('craft-mobile') !== on) {
      root.classList.toggle('craft-mobile', on);
      listeners.forEach(fn => { try { fn(on); } catch (err) { console.error('craftMobile listener', err); } });
    }
    syncToggleBtn();
  };

  const setMode = m => {
    pref = (m === 'mobile' || m === 'desktop') ? m : 'auto';
    store.set(PREF_KEY, pref === 'auto' ? null : pref);
    apply();
    return root.classList.contains('craft-mobile');
  };
  const toggle = () => setMode(root.classList.contains('craft-mobile') ? 'desktop' : 'mobile');
  on(toggleBtn, 'click', e => { e.preventDefault(); e.stopPropagation(); toggle(); }, sig);
  on(mq, 'change', apply, sig);
  apply();
  if (document.body) mountToggleBtn(); else on(document, 'DOMContentLoaded', mountToggleBtn, {once: true, signal: ac.signal});

  window.__hotkeyRegister?.({
    id: 'craft-toggle-mobile',
    label: 'Toggle mobile / desktop view',
    group: 'CRAFT · Layout',
    combo: '',
    handler: () => { toggle(); return true; },
  });

  window.craftMobile = {
    active: () => root.classList.contains('craft-mobile'),
    mode: () => pref,
    setMode,
    toggle,
    onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    reposition: () => {},
    disable() {
      ac.abort();
      toggleBtn.remove();
      root.classList.remove('craft-mobile');
      if (addedMeta) meta.remove(); else if (prevMeta != null) meta.content = prevMeta;
      listeners.clear();
      delete window.craftMobile;
    },
  };
})();

/* %% nbs/craft/05_dialog_chrome.ipynb #816121ae */
/* Auto-hiding top nav is now pure CSS in Dialog Chrome CSS below; clean up any hot-reloaded listener from older builds. */
window.craftAutoNav?.disable?.();
delete window.craftAutoNav;

/* %% nbs/craft/05_dialog_chrome.ipynb #a77b15e8 */
/* Monaco is removed by craftNoMonaco below; clean up any hot-reloaded instance from older builds. */
window.craftCompactMonaco?.disable?.();

/* %% nbs/craft/05_dialog_chrome.ipynb #3cd92916 */
/* ── Launcher (⌘⇧P) ──────────────────────────────────────────────────
   One fuzzy box over commands (every hotkey-registry action, custom and
   Solveit built-in) and dialogs/files (whatever the file tree has loaded).
   Enter runs or opens the selection; Esc or a click outside closes. */
(() => {
  window.craftLauncher?.disable?.();
  const {el, mountModal, qsa, on, notify, notifyErr, features} = window.__craftCMCore;
  const ac = new AbortController(), sig = {signal: ac.signal};
  let modal = null, results = [], sel = 0, pool = [];

  function score(q, text) {
    if (!q) return 1;
    const t = text.toLowerCase();
    let i = 0, s = 0, run = 0, last = -2;
    for (const ch of q) {
      const j = t.indexOf(ch, i);
      if (j < 0) return 0;
      run = j === last + 1 ? run + 1 : 0;
      s += 1 + run * 2 + (j === 0 || /[\s/_.-]/.test(t[j - 1]) ? 3 : 0);
      last = j; i = j + 1;
    }
    return s - t.length * 0.01;
  }

  const where = n => { try { const u = new URL(n.href, location.href); return u.searchParams.get('name') || u.searchParams.get('fp') || decodeURIComponent(u.pathname); } catch { return ''; } };

  function build() {
    modal = mountModal('launcher_root', {refs: true, signal: ac.signal});
    on(modal.input, {
      input: () => { sel = 0; render(); },
      keydown: e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(results.length, 1); paint(); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); run(results[sel]); }
      },
    }, sig);
    on(modal.list, 'click', e => { const li = e.target.closest('li[data-i]'); if (li) run(results[+li.dataset.i]); }, sig);
  }

  function render() {
    const q = modal.input.value.trim().toLowerCase();
    results = pool.map(it => ({it, s: score(q, it.label + ' ' + it.detail)})).filter(r => r.s > 0).sort((a, b) => b.s - a.s).slice(0, 60).map(r => r.it);
    sel = Math.min(sel, Math.max(results.length - 1, 0));
    modal.list.replaceChildren(...(results.length ? results.map((it, i) =>
      el('li', {cls: 'kind-' + it.kind, role: 'option', dataset: {i}},
        el('span', {cls: 'label'}, it.label), el('span', {cls: 'detail'}, it.detail), el('span', {cls: 'hint'}, it.hint))
    ) : [el('li', {cls: 'empty'}, 'No matches')]));
    paint();
  }

  function paint() {
    qsa('li[data-i]', modal.list).forEach(li => { const on = +li.dataset.i === sel; li.setAttribute('aria-selected', String(on)); if (on) li.scrollIntoView({block: 'nearest'}); });
  }

  async function open() {
    if (!modal) build();
    const hk = window.solveitHotkeys;
    const cmds = (hk?.list?.() || []).filter(a => a.id !== 'launcher').map(a => ({kind: 'command', label: a.label, detail: a.group || '', hint: a.combo ? hk.formatCombo(a.combo) : '', go: () => hk.run(a.id)}));
    const toggles = (features?.list?.() || []).map(f => ({
      kind: 'feature',
      label: `Feature: ${f.label}`,
      detail: f.desc || f.id,
      hint: f.enabled ? 'On' : 'Off',
      go: () => {
        const next = features.toggle(f.id);
        notify(`${f.label}: ${next ? 'enabled' : 'disabled'} — reload page to apply.`, {status: next ? 'success' : 'warning'});
      },
    }));
    const base = cmds.concat(toggles);
    pool = base; modal.input.value = ''; sel = 0; render(); modal.open(); modal.input.focus();
    try {
      const entries = await window.solveitFileTree?.entries?.() || [];
      pool = base.concat(entries.map(n => ({kind: n.kind, label: n.name, detail: where(n), hint: n.kind, go: () => window.solveitFileTree.open(n)})));
      if (modal.isOpen()) render();
    } catch {}
  }

  const close = () => modal?.close();
  function run(item) { if (!item) return; close(); setTimeout(() => Promise.resolve().then(item.go).catch(err => { console.error('Launcher action failed', err); notifyErr('Action failed: ' + (err.message || err), 'craftLauncher'); }), 0); }

  window.__hotkeyRegister?.({id: 'launcher', label: 'Open launcher', group: 'Launcher', combo: 'Mod+Shift+P', handler: () => { if (modal?.isOpen()) close(); else open(); return true; }});
  window.craftLauncher = { open, close, disable() { ac.abort(); modal?.destroy(); modal = null; } };
})();

/* %% nbs/craft/05_dialog_chrome.ipynb #098b8be2 */
/* ── Remove Monaco & #full_editor unconditionally ─────────────────── */
(() => {
  window.craftIdleComposer?.disable?.();
  window.craftNoMonaco?.disable?.();
  const {on} = window.__craftCMCore;
  const ac = new AbortController(), sig = {signal: ac.signal};
  let retryTimer = null, tries = 0, disposedReal = false;

  const MONACO_STUB = Object.freeze({
    __craftStub: true,
    editor: Object.freeze({
      getEditors: () => [],
      getModels: () => [],
      getDiffEditors: () => [],
      setTheme() {},
      remeasureFonts() {},
      onDidCreateEditor: () => ({dispose() {}}),
    }),
  });

  const stubContainer = document.createElement('div');
  const EDITOR_STUB = Object.freeze({
    __craftStub: true,
    getContainerDomNode: () => stubContainer,
    getDomNode: () => stubContainer,
    layout() {},
    focus() {},
    hasTextFocus: () => false,
    hasWidgetFocus: () => false,
    getModel: () => null,
    setModel() {},
    getValue: () => '',
    setValue() {},
    dispose() {},
    updateOptions() {},
    getRawOptions: () => ({}),
    getOption: () => undefined,
    getPosition: () => null,
    getSelection: () => null,
    onDidChangeModel: () => ({dispose() {}}),
    onDidChangeModelContent: () => ({dispose() {}}),
    trigger() {},
  });

  const wrapFollowRename = () => {
    const fn = window.followRename;
    if (typeof fn !== 'function' || fn.__craftSafe) return;
    const wrapped = function(...args) {
      if (!document.getElementById('id_')) return;
      return fn.apply(this, args);
    };
    wrapped.__craftSafe = true;
    window.followRename = wrapped;
  };

  const disposeMonaco = (forceRemove = false) => {
    const hasRealMonaco = Boolean(window.monaco && !window.monaco.__craftStub);
    const hasRealEditor = Boolean(window.editor && !window.editor.__craftStub);
    const hasEditors = Boolean(hasRealEditor || window.diffEditor || (hasRealMonaco && window.monaco.editor?.getEditors?.().length));
    document.documentElement.classList.remove('craft-show-monaco');
    if (!hasEditors && !forceRemove) return false;
    if (hasRealMonaco || hasEditors) {
      try { window.cleanupEd?.(); } catch {}
      try { if (hasRealEditor) window.editor?.dispose?.(); } catch {}
      try { window.diffEditor?.dispose?.(); } catch {}
      try { window.monaco?.editor?.getEditors?.().forEach(ed => { try { ed.dispose(); } catch {} }); } catch {}
      try { window.monaco?.editor?.getDiffEditors?.().forEach(ed => { try { ed.dispose(); } catch {} }); } catch {}
      try { window.monaco?.editor?.getModels?.().forEach(m => { try { m.dispose(); } catch {} }); } catch {}
      window.diffEditor = null;
    }
    window.editor = EDITOR_STUB;
    window.monaco = MONACO_STUB;
    window.createMonacoEditor = () => null;
    window.msgToModel = () => null;
    window.pushModelEdits = () => {};
    window.edValue = () => '';
    wrapFollowRename();
    document.getElementById('full_editor')?.remove();
    disposedReal = true;
    return true;
  };

  const blockFullEditorSwap = e => {
    const tgt = e.detail?.target || e.target;
    if (tgt?.id === 'full_editor' || tgt?.closest?.('#full_editor')) {
      if (e.detail) e.detail.shouldSwap = false;
      e.preventDefault();
      if (disposedReal) document.getElementById('full_editor')?.remove();
    }
  };

  const sep = window.htmx?.config?.metaCharacter || ':';
  on(document, ['htmx', 'oobBeforeSwap'].join(sep), blockFullEditorSwap, sig);
  on(document, ['htmx', 'beforeSwap'].join(sep), blockFullEditorSwap, sig);
  on(window, 'load', () => disposeMonaco(false), {once: true, signal: ac.signal});

  // Wait for in-flight initMonaco()/_cme() to create window.editor before disposing & removing #full_editor,
  // with a bounded fallback so non-Monaco pages still clean up without leaving a permanent timer.
  const ensureDisposed = () => {
    if (ac.signal.aborted) return;
    if (disposeMonaco(false)) return;
    if (++tries < 40) {
      retryTimer = setTimeout(ensureDisposed, 100);
    } else {
      disposeMonaco(true);
    }
  };
  ensureDisposed();

  const teardown = () => disposeMonaco(true);
  window.craftNoMonaco = {
    teardown,
    disable() {
      ac.abort();
      clearTimeout(retryTimer);
      retryTimer = null;
      if (window.craftNoMonaco?.teardown === teardown) delete window.craftNoMonaco;
    },
  };
})();

/* %% nbs/craft/05_dialog_chrome.ipynb #e5cec0de */
/* ── Accessibility: mirror uk-tooltip & fallback aria-labels on icon controls ── */
(() => {
  window.craftA11y?.disable?.();
  if (!window.__craftCMCore.features.init('a11y', 'Accessibility labels', 'Mirror uk-tooltip into aria-label on icon controls')) return;
  const {SOLVEIT, onDomChange} = window.__craftCMCore;
  const extractTip = raw => {
    if (!raw) return '';
    const s = String(raw).trim();
    const m = s.match(/(?:^|;)\s*title\s*:\s*([^;]+)/i);
    return (m ? m[1] : s).replace(/<[^>]*>/g, '').trim();
  };
  const labelControls = (root = document) => {
    // 1. Any interactive element carrying uk-tooltip / data-uk-tooltip without an accessible name
    for (const el of root.querySelectorAll('[uk-tooltip], [data-uk-tooltip]')) {
      if (!el.matches('button, a, input, select, textarea')) continue;
      if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) continue;
      const tip = extractTip(el.getAttribute('uk-tooltip') || el.getAttribute('data-uk-tooltip'));
      if (tip) el.setAttribute('aria-label', tip);
    }
    // 2. #find-box controls (checkboxes wrapped in <label uk-tooltip>, search/replace inputs)
    const fb = root.querySelector?.(SOLVEIT.sel.findBox) || document.querySelector(SOLVEIT.sel.findBox);
    if (fb) {
      for (const el of fb.querySelectorAll('input, button, select')) {
        if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) continue;
        const lbl = el.closest('label') || (el.id && fb.querySelector(`label[for="${CSS.escape(el.id)}"]`));
        const tip = extractTip(
          el.getAttribute('uk-tooltip') || el.getAttribute('data-uk-tooltip') ||
          lbl?.getAttribute('uk-tooltip') || lbl?.getAttribute('data-uk-tooltip') ||
          el.getAttribute('title') || lbl?.getAttribute('title')
        );
        const fallback = tip || (el.getAttribute('placeholder') || '').replace(/\.+$/, '').trim();
        if (fallback) el.setAttribute('aria-label', fallback);
      }
    }
    // 3. Navbar <select name="mode"> and Dialogs link
    const nav = root.querySelector?.('.uk-container > nav.monster-navbar') || document.querySelector('.uk-container > nav.monster-navbar');
    if (nav) {
      const modeSel = nav.querySelector('select[name="mode"]');
      if (modeSel && !modeSel.hasAttribute('aria-label')) modeSel.setAttribute('aria-label', 'AI mode');
      const dlgsLink = nav.querySelector('a[href^="/?at="]');
      if (dlgsLink && !dlgsLink.hasAttribute('aria-label') && !(dlgsLink.textContent || '').trim()) {
        dlgsLink.setAttribute('aria-label', 'Dialogs');
      }
      // 4. Any remaining icon-only navbar buttons/links without accessible name
      for (const btn of nav.querySelectorAll('button, a')) {
        if (btn.hasAttribute('aria-label') || btn.hasAttribute('aria-labelledby')) continue;
        if ((btn.textContent || '').trim()) continue;
        const tip = extractTip(
          btn.getAttribute('title') || btn.getAttribute('uk-tooltip') || btn.getAttribute('data-uk-tooltip')
        );
        const iconRef = btn.querySelector('use')?.getAttribute('href')?.replace(/^#lc-/, '') ||
                        btn.getAttribute('uk-icon') || btn.querySelector('[uk-icon]')?.getAttribute('uk-icon') || '';
        const hxPost = (btn.getAttribute('hx-post') || btn.getAttribute('hx-get') || '').replace(/^\/|_+$/g, '').replace(/_/g, ' ');
        const fallback = tip || (iconRef ? iconRef.replace(/[-_]+/g, ' ').replace(/^\w/, c => c.toUpperCase()) : '') || hxPost;
        if (fallback) btn.setAttribute('aria-label', fallback);
      }
    }
  };
  let offDom = null;
  const start = () => {
    labelControls(document);
    offDom = onDomChange(() => labelControls(document), {delay: 120});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  window.craftA11y = { refresh: () => labelControls(document), disable() { offDom?.(); offDom = null; document.removeEventListener('DOMContentLoaded', start); } };
})();

/* %% nbs/craft/06_file_tree.ipynb #654a40d5 */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"ft_upload_icon": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path><polyline points=\"17 8 12 3 7 8\"></polyline><line x1=\"12\" y1=\"3\" x2=\"12\" y2=\"15\"></line></svg>", "ft_collapse_icon": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"7 20 12 15 17 20\"></polyline><polyline points=\"7 4 12 9 17 4\"></polyline><line x1=\"4\" y1=\"12\" x2=\"20\" y2=\"12\"></line></svg>", "ft_temp_editor": "<dialog class=\"craft-overlay\" id=\"solveit-temp-editor\"><div class=\"solveit-temp-editor-bar\"><strong></strong><button type=\"button\" aria-label=\"Close editor\">×</button></div><iframe title=\"Temporary file editor\"></iframe></dialog>", "ft_create_form": "<form class=\"solveit-tree-create\"><input class=\"uk-input\" autocomplete=\"off\" spellcheck=\"false\" enterkeyhint=\"done\" aria-describedby=\"solveit-tree-create-error\" type=\"text\"><div id=\"solveit-tree-create-error\" role=\"alert\"></div></form>", "ft_upload_pop": "<div class=\"uk-card craft-card solveit-tree-upload-pop\" role=\"dialog\" popover=\"auto\"><div class=\"solveit-tree-upload-head\"><span class=\"solveit-tree-upload-dest\"></span><button type=\"button\" class=\"solveit-tree-upload-x\" aria-label=\"Close\">×</button></div><div class=\"solveit-tree-upload-drop\">Drop files or folders here</div><div class=\"solveit-tree-upload-actions\"><button class=\"uk-btn uk-btn-default uk-btn-sm solveit-tree-upload-pick-files\" type=\"button\">Files…</button><button class=\"uk-btn uk-btn-default uk-btn-sm solveit-tree-upload-pick-dir\" type=\"button\">Folder…</button></div><input type=\"file\" class=\"solveit-tree-upload-input-files\" multiple hidden><input type=\"file\" class=\"solveit-tree-upload-input-dir\" webkitdirectory multiple hidden></div>", "ft_panel": "<aside id=\"solveit-file-tree-panel\" role=\"complementary\" aria-label=\"Files\"><div class=\"solveit-tree-brand\"><span class=\"solveit-tree-appname\">solveit</span></div><header><strong>Files</strong><kbd class=\"solveit-tree-shortcut\" data-hotkey=\"file-tree-toggle\">⌘B</kbd><button class=\"solveit-tree-new\" type=\"button\" aria-label=\"New dialog, file, or folder\" title=\"New dialog, file, or folder (name/ for folder)\">+</button><button class=\"solveit-tree-upload\" type=\"button\" aria-label=\"Upload files or folders\" title=\"Upload files or folders\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path><polyline points=\"17 8 12 3 7 8\"></polyline><line x1=\"12\" y1=\"3\" x2=\"12\" y2=\"15\"></line></svg></button><button class=\"solveit-tree-collapse\" type=\"button\" aria-label=\"Collapse all folders\" title=\"Collapse all folders\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"7 20 12 15 17 20\"></polyline><polyline points=\"7 4 12 9 17 4\"></polyline><line x1=\"4\" y1=\"12\" x2=\"20\" y2=\"12\"></line></svg></button><button class=\"solveit-tree-dots\" type=\"button\" aria-pressed=\"true\">.*</button><button class=\"solveit-tree-refresh\" type=\"button\" aria-label=\"Refresh files\" title=\"Refresh files\">↻</button><a href=\"/?at=.\" class=\"solveit-tree-home\" aria-label=\"Dialogs home\" title=\"Dialogs home\">⌂</a></header><input class=\"uk-input solveit-tree-filter\" type=\"search\" placeholder=\"Filter loaded files…\" autocomplete=\"off\"><div class=\"solveit-tree-status\" role=\"status\"></div><div class=\"solveit-tree-rootbar\" title=\"Right-click to create/paste/upload in root; drop here to move or upload to root\"><span class=\"solveit-tree-rootbar-path\">~/</span><span class=\"solveit-tree-rootbar-hint\">root · drop / right-click</span><button class=\"solveit-tree-row-upload\" type=\"button\" aria-label=\"Upload into root\" title=\"Upload into root\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path><polyline points=\"17 8 12 3 7 8\"></polyline><line x1=\"12\" y1=\"3\" x2=\"12\" y2=\"15\"></line></svg></button><button class=\"solveit-tree-row-more\" type=\"button\" aria-label=\"Actions for root\" title=\"New dialog, file, folder…\">⋯</button></div><div id=\"solveit-file-tree\" role=\"tree\"></div><div class=\"solveit-tree-resizer\" aria-hidden=\"true\" title=\"Drag to resize · Double-click to reset\"></div></aside>", "ft_menu": "<div class=\"craft-menu solveit-tree-menu\" role=\"menu\" popover=\"auto\"></div>", "ft_workspace": "<div class=\"solveit-tree-workspace\"></div>"});

/* %% nbs/craft/06_file_tree.ipynb #bdd93cf1 */
(() => { /* iife:fileTree */
/* #bdd93cf1 */
window.solveitFileTree?.disable?.();
  if (!window.__craftCMCore.features.init('file-tree', 'File tree sidebar', 'Resizable sidebar file browser (Mod+B)')) return;
  const {mountTpl, mountModal, mountMenu, qs, on, store, patch, SOLVEIT} = window.__craftCMCore;
  const DOTS_KEY = 'solveit-file-tree:hide-dots';
  const CACHE_KEY = 'solveit-file-tree:v4', CLIP_KEY = 'solveit-file-tree:clipboard', CACHE_MAX_AGE = 180000;
  let panel, rendered = false, filterText = '', previousFocus;
  let refreshTimer, busy = false, menu = null, uploadPop = null, tempEditor = null, lastTreeDir = null;
  const UPLOAD_SVG = window.__craftTpl?.ft_upload_icon || '', COLLAPSE_SVG = window.__craftTpl?.ft_collapse_icon || '';
  let workspaceRow = null, dlgNameNode = null, dlgNameOrigParent = null, dlgNameOrigNext = null;
  let draggedNode = null, dropHighlightEl = null, hoverExpandTimer = null, hoverExpandPath = null;

  let hideDots = store.get(DOTS_KEY, '1') === '1';

  const OPEN_KEY = 'solveit-file-tree:open';
  const saveOpen = open => store.set(OPEN_KEY, open ? '1' : '0', sessionStorage);
  window.__hotkeyRegister?.({id: 'file-tree-toggle', label: 'Toggle file tree', group: 'File tree', combo: 'Mod+B', handler: () => { toggle(); return true; }});

  const rowsByPath = new Map(), fetchedAtByPath = new Map(), expandedPaths = new Set(), loadingPaths = new Set();
  const nodeByPath = new Map(), liByPath = new Map();
  const cached = store.json(CACHE_KEY, null, sessionStorage);
  if (cached) {
    cached.rows?.forEach(([path, rows]) => rowsByPath.set(path, rows));
    cached.fetchedAt?.forEach(([path, time]) => fetchedAtByPath.set(path, time));
    cached.expanded?.forEach(path => expandedPaths.add(path));
  }
  const saveCache = () => store.setJson(CACHE_KEY, {rows: [...rowsByPath], fetchedAt: [...fetchedAtByPath], expanded: [...expandedPaths]}, sessionStorage);

  /* ── Path & clipboard helpers ──────────────────────────────────────── */
  const normPath = p => {
    const s = String(p || '').trim().replace(/^\/+/, '').replace(/^\.\//, '').replace(/\/+$/, '');
    return s || '.';
  };
  const parentOf = p => {
    const n = normPath(p);
    if (n === '.') return '.';
    const i = n.lastIndexOf('/');
    return i > 0 ? n.slice(0, i) : '.';
  };
  const baseOf = p => {
    const n = normPath(p);
    if (n === '.') return '.';
    const i = n.lastIndexOf('/');
    return i >= 0 ? n.slice(i + 1) : n;
  };
  const joinPath = (dir, name) => (!dir || dir === '.' ? name : `${dir}/${name}`);
  const staticUrl = p => '/static/' + normPath(p).split('/').map(encodeURIComponent).join('/') + '?download=true';
  const ancestorsOf = dir => {
    const n = normPath(dir);
    if (n === '.') return ['.'];
    const parts = n.split('/'), out = ['.'];
    for (let i = 0; i < parts.length; i++) out.push(parts.slice(0, i + 1).join('/'));
    return out;
  };
  function getCurrentContext() {
    const params = new URLSearchParams(location.search);
    if (location.pathname.startsWith('/dialog_')) {
      const raw = normPath(params.get('name') || '');
      if (raw !== '.') {
        const dlgPath = raw.endsWith('.ipynb') ? raw : `${raw}.ipynb`;
        return {dir: parentOf(dlgPath), dlgPath};
      }
    }
    if (location.pathname === '/') return {dir: normPath(params.get('at') || '.'), dlgPath: null};
    return {dir: '.', dlgPath: null};
  }
  const getClipboard = () => store.json(CLIP_KEY, null, sessionStorage);
  const setClipboard = item => item ? store.setJson(CLIP_KEY, item, sessionStorage) : store.del(CLIP_KEY, sessionStorage);
  function setStatus(msg) {
    const el = qs('.solveit-tree-status', panel);
    if (el) el.textContent = msg || '';
  }

/* #18757c3f */
/* ── Minimal ZIP builders (for mkdir & renamed recursive folder copy) ── */
  function makeEmptyDirZip(dirName) {
    const nameBytes = new TextEncoder().encode(dirName.replace(/\/+$/, '') + '/');
    const n = nameBytes.length;
    const lfh = new Uint8Array(30 + n), lv = new DataView(lfh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(26, n, true);
    lfh.set(nameBytes, 30);
    const cdh = new Uint8Array(46 + n), cv = new DataView(cdh.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 0x0314, true); cv.setUint16(6, 20, true);
    cv.setUint16(28, n, true); cv.setUint32(38, 0x41ed0010, true); cv.setUint32(42, 0, true);
    cdh.set(nameBytes, 46);
    const eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true);
    ev.setUint32(12, cdh.length, true); ev.setUint32(16, lfh.length, true);
    return new Blob([lfh, cdh, eocd], {type: 'application/zip'});
  }
  function renameZipTopDir(bytes, oldTop, newTop) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dec = new TextDecoder(), enc = new TextEncoder();
    let eocd = bytes.length - 22;
    while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
    if (eocd < 0) throw new Error('Invalid zip archive');
    const cdCount = view.getUint16(eocd + 10, true);
    if (cdCount === 0xffff) throw new Error('ZIP64 archives are not supported');
    const cdOff = view.getUint32(eocd + 16, true);
    const entries = [];
    let p = cdOff;
    for (let i = 0; i < cdCount; i++) {
      const nLen = view.getUint16(p + 28, true);
      const exLen = view.getUint16(p + 30, true);
      const cmLen = view.getUint16(p + 32, true);
      const lfhOff = view.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nLen));
      entries.push({cdOff: p, cdLen: 46 + nLen + exLen + cmLen, nLen, lfhOff, name});
      p += 46 + nLen + exLen + cmLen;
    }
    const byLfh = [...entries].sort((a, b) => a.lfhOff - b.lfhOff);
    const prefix = oldTop.replace(/\/+$/, '') + '/';
    const newPrefix = newTop.replace(/\/+$/, '') + '/';
    const localParts = [];
    let curOff = 0;
    for (let i = 0; i < byLfh.length; i++) {
      const e = byLfh[i];
      const nextOff = i + 1 < byLfh.length ? byLfh[i + 1].lfhOff : cdOff;
      const origLfhNameLen = view.getUint16(e.lfhOff + 26, true);
      const renamed = e.name.startsWith(prefix) ? newPrefix + e.name.slice(prefix.length) : newPrefix + e.name;
      e.newNameBytes = enc.encode(renamed);
      e.newLfhOff = curOff;
      const head = new Uint8Array(bytes.subarray(e.lfhOff, e.lfhOff + 30));
      new DataView(head.buffer).setUint16(26, e.newNameBytes.length, true);
      const rest = bytes.subarray(e.lfhOff + 30 + origLfhNameLen, nextOff);
      localParts.push(head, e.newNameBytes, rest);
      curOff += head.length + e.newNameBytes.length + rest.length;
    }
    const newCdOff = curOff, cdParts = [];
    let newCdSize = 0;
    for (const e of entries) {
      const head = new Uint8Array(bytes.subarray(e.cdOff, e.cdOff + 46));
      const hv = new DataView(head.buffer);
      hv.setUint16(28, e.newNameBytes.length, true);
      hv.setUint32(42, e.newLfhOff, true);
      const rest = bytes.subarray(e.cdOff + 46 + e.nLen, e.cdOff + e.cdLen);
      cdParts.push(head, e.newNameBytes, rest);
      newCdSize += head.length + e.newNameBytes.length + rest.length;
    }
    const newEocd = new Uint8Array(bytes.subarray(eocd));
    const ev = new DataView(newEocd.buffer);
    ev.setUint32(12, newCdSize, true);
    ev.setUint32(16, newCdOff, true);
    return new Blob([...localParts, ...cdParts, newEocd], {type: 'application/zip'});
  }

  /* ── Backend requests ──────────────────────────────────────────────── */
  async function getRows(dirPath) {
    const cleanDir = normPath(dirPath);
    const response = await fetch(`/?at=${encodeURIComponent(cleanDir)}`, {method: 'POST', credentials: 'same-origin', headers: {'HX-Request': 'true'}});
    if (!response.ok) throw new Error(`File listing failed: ${response.status}`);
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    return [...doc.querySelectorAll(SOLVEIT.sel.tblRow)].map(row => {
      const link = row.querySelector('a.file-link');
      if (!link) return null;
      const href = link.getAttribute('href'), hxPost = link.getAttribute('hx-post'), isDir = !!hxPost;
      const kind = isDir ? 'directory' : href?.startsWith('/dialog_?') ? 'dialog' : 'file';
      const label = link.textContent.trim();
      let relPath = isDir
        ? new URL(hxPost, location.href).searchParams.get('at')
        : (link.getAttribute('title') || null);
      if (!relPath && href && href !== '#') {
        const u = new URL(href, location.href);
        relPath = u.searchParams.get('fp') || u.searchParams.get('name');
      }
      relPath = normPath(relPath || joinPath(cleanDir, kind === 'dialog' && !label.endsWith('.ipynb') ? `${label}.ipynb` : label));
      const filename = baseOf(relPath);
      return {
        id: relPath,
        name: label,
        filename,
        kind,
        href: href && href !== '#' ? href : null,
        path: relPath,
        parentPath: parentOf(relPath),
        delUrl: row.querySelector('a.file-del')?.getAttribute('hx-post') || null,
        dlUrl: row.querySelector('a[download]')?.getAttribute('href') || null,
      };
    }).filter(Boolean);
  }

  async function uploadBlob(folder, filename, blob, extract = false) {
    const fd = new FormData();
    fd.append('files', new File([blob], filename, {type: blob.type || 'application/octet-stream'}));
    if (extract) fd.append('extract_archives', 'on');
    const r = await fetch(`/upload_file_?folder=${encodeURIComponent(normPath(folder))}`, {
      method: 'POST', credentials: 'same-origin', headers: {'HX-Request': 'true'}, body: fd,
    });
    if (!r.ok) throw new Error(`Upload failed: HTTP ${r.status} ${(await r.text()).trim()}`);
  }

  async function downloadBytes(node) {
    const url = node.dlUrl || staticUrl(node.path);
    const r = await fetch(new URL(url, location.href), {credentials: 'same-origin'});
    if (!r.ok) throw new Error(`Download failed: HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }

  async function deleteRecursive(node) {
    if (node.kind === 'directory') {
      const children = await getRows(node.path);
      for (const child of children) await deleteRecursive(child);
    }
    const url = node.delUrl || (node.kind === 'dialog'
      ? `/rm_dialog_?name=${encodeURIComponent(node.path)}`
      : `/delete_file_?filename=${encodeURIComponent(node.path)}`);
    const r = await fetch(new URL(url, location.href), {method: 'POST', credentials: 'same-origin', headers: {'HX-Request': 'true'}});
    if (!r.ok) {
      const detail = (await r.text()).trim();
      throw new Error(detail || `HTTP ${r.status}`);
    }
  }

  function purgeDirCache(dirPath) {
    const prefix = dirPath + '/';
    [...rowsByPath.keys()].filter(p => p === dirPath || p.startsWith(prefix)).forEach(p => {
      rowsByPath.delete(p); fetchedAtByPath.delete(p); expandedPaths.delete(p);
    });
  }

/* #b73a2155 */
/* ── Tree rendering & navigation ───────────────────────────────────── */
  const KIND_ORDER = {directory: 0, dialog: 1, file: 2};
  function nodesFor(path, curAncestors) {
    return (rowsByPath.get(path) || [])
      .filter(n => {
        const fname = n.filename || n.name || '';
        if (!hideDots || !fname.startsWith('.')) return true;
        return n.kind === 'directory' && curAncestors.has(n.path);
      })
      .sort((a, b) => {
        const ka = KIND_ORDER[a.kind] ?? 3, kb = KIND_ORDER[b.kind] ?? 3;
        if (ka !== kb) return ka - kb;
        return (a.name || '').localeCompare(b.name || '', undefined, {numeric: true, sensitivity: 'base'});
      })
      .map(node => node.kind !== 'directory' ? node : ({
        ...node,
        children: rowsByPath.has(node.path)
          ? nodesFor(node.path, curAncestors)
          : [{id: `loading:${node.path}`, name: 'Loading…', kind: 'loading', selectable: false}],
      }));
  }

  const findNode = path => liByPath.get(path) || null;
  const rowOf = li => li?.querySelector(':scope > details > summary.solveit-tree-row, :scope > .solveit-tree-row') || null;
  const folderDetailsOf = li => li?.querySelector(':scope > details.solveit-tree-folder') || null;
  const nodeOf = target => {
    const li = target?.closest?.('li.solveit-tree-item[data-path]');
    return li ? nodeByPath.get(li.dataset.path) || null : null;
  };

  function focusPath(path) {
    const row = rowOf(findNode(path));
    if (!row) return false;
    row.scrollIntoView({block: 'nearest'});
    row.focus();
    return true;
  }

  function filterNodes(nodes, q) {
    const out = [];
    for (const node of nodes) {
      const selfMatch = (node.name || '').toLowerCase().includes(q) || (node.path || '').toLowerCase().includes(q);
      if (node.kind === 'directory') {
        const kids = filterNodes(node.children || [], q);
        if (selfMatch || kids.length) out.push({...node, children: kids.length ? kids : (selfMatch ? node.children : []), _forceOpen: kids.length > 0});
      } else if (selfMatch) out.push(node);
    }
    return out;
  }

  function buildRow(node, {dir, dlgPath, touch}) {
    const {el} = window.__craftCMCore;
    const isDir = node.kind === 'directory';
    const row = el(isDir ? 'summary' : 'div', {cls: `solveit-tree-row solveit-tree-${node.kind}`, role: 'treeitem', tabIndex: 0});
    if (node.kind !== 'loading' && !touch) row.draggable = true;
    if ((dlgPath && node.path === dlgPath) || (!dlgPath && dir !== '.' && node.path === dir)) row.classList.add('solveit-tree-current');
    row.append(el('span', {cls: isDir ? 'solveit-tree-caret' : 'solveit-tree-caret-spacer', 'aria-hidden': 'true'}, isDir ? '▸' : ''));
    if (node.kind !== 'loading') {
      if (isDir) {
        row.append(el('span', {cls: 'solveit-tree-icon solveit-tree-folder-icon', 'aria-hidden': 'true'}));
      } else {
        const fname = node.filename || node.name || '';
        const ext = fname.includes('.') ? fname.split('.').pop().toLowerCase() : '';
        const icons = {js: 'file_type_js.svg', css: 'file_type_css.svg', json: 'file_type_json.svg'};
        const icon = node.kind === 'dialog' ? 'file_type_ipynb.svg' : (icons[ext] || 'default_file.svg');
        row.append(el('img', {cls: 'solveit-tree-icon', src: `/static/.craft-assets/vscode-icons/${icon}`, alt: ''}));
      }
    }
    row.append(el('span', {cls: 'solveit-tree-label'}, node.name));
    if (isDir) {
      const up = el('button', {
        type: 'button', cls: 'solveit-tree-row-upload', tabIndex: -1,
        title: `Upload into ${node.name}`, 'aria-label': `Upload into ${node.name}`,
      });
      up.innerHTML = UPLOAD_SVG;
      row.append(up);
    }
    if (touch && node.kind !== 'loading') {
      const t = `Actions for ${node.name}`;
      row.append(el('button', {type: 'button', cls: 'solveit-tree-row-more', tabIndex: -1, title: t, 'aria-label': t}, '⋯'));
    }
    return row;
  }

  function buildList(nodes, ctx) {
    const {el} = window.__craftCMCore;
    const ul = el('ul', {cls: 'solveit-tree-list', role: 'group'});
    for (const node of nodes) {
      const li = el('li', {cls: 'solveit-tree-item', role: 'none'});
      if (node.path) {
        li.dataset.path = node.path;
        nodeByPath.set(node.path, node);
        liByPath.set(node.path, li);
      }
      const row = buildRow(node, ctx);
      if (node.kind === 'directory') {
        const details = el('details', {cls: 'solveit-tree-folder'});
        if (expandedPaths.has(node.path) || node._forceOpen) details.open = true;
        details.append(row, buildList(node.children || [], ctx));
        details.addEventListener('toggle', () => {
          if (!details.isConnected) return;
          if (details.open) loadFolder(node.path);
          if (!filterText.trim()) {
            if (details.open) expandedPaths.add(node.path);
            else expandedPaths.delete(node.path);
            saveCache();
          }
        });
        li.append(details);
      } else {
        li.append(row);
      }
      ul.append(li);
    }
    return ul;
  }

  function renderTree() {
    if (!panel) return;
    const treeEl = panel.querySelector('#solveit-file-tree');
    const prevScroll = treeEl ? treeEl.scrollTop : 0;
    const focused = createDraft?.input;
    const draftFocus = focused && document.activeElement === focused ? [focused.selectionStart, focused.selectionEnd] : null;
    const activePath = panel.contains(document.activeElement)
      ? document.activeElement?.closest?.('li.solveit-tree-item[data-path]')?.dataset.path
      : null;
    const ctx = {...getCurrentContext(), touch: !!window.craftMobile?.active()};
    const curAncestors = new Set(ancestorsOf(ctx.dir));
    const q = filterText.trim().toLowerCase();
    const data = q ? filterNodes(nodesFor('.', curAncestors), q) : nodesFor('.', curAncestors);
    nodeByPath.clear(); liByPath.clear();
    treeEl.replaceChildren(buildList(data, ctx));
    rendered = true;
    mountCreate();
    if (draftFocus && createDraft?.input.isConnected) {
      const input = createDraft.input;
      input.focus({preventScroll: true});
      input.setSelectionRange(...draftFocus);
    } else if (activePath) {
      rowOf(findNode(activePath))?.focus({preventScroll: true});
    }
    const rootLabel = panel.querySelector('.solveit-tree-rootbar-path');
    if (rootLabel) rootLabel.textContent = ctx.dir === '.' ? '~/' : `~/${ctx.dir}`;
    if (treeEl && prevScroll) treeEl.scrollTop = prevScroll;
  }

  async function loadFolder(path, force = false) {
    const clean = normPath(path);
    if ((!force && rowsByPath.has(clean)) || loadingPaths.has(clean)) return;
    loadingPaths.add(clean);
    try {
      rowsByPath.set(clean, await getRows(clean));
      fetchedAtByPath.set(clean, Date.now());
      saveCache();
      renderTree();
    } catch (err) { setStatus(`Could not load folder: ${err.message || err}`); }
    finally { loadingPaths.delete(clean); }
  }

  async function refreshDirs(...dirs) {
    const targets = [...new Set(dirs.map(normPath))];
    await Promise.all(targets.map(async p => {
      rowsByPath.set(p, await getRows(p));
      fetchedAtByPath.set(p, Date.now());
    }));
    saveCache();
    renderTree();
  }

  function activeRefreshPaths() {
    const set = new Set(['.']);
    for (const p of expandedPaths) set.add(p);
    return [...set];
  }

  async function refreshTree() {
    const button = panel.querySelector('.solveit-tree-refresh');
    button.disabled = true; setStatus('Refreshing files…');
    try {
      const keys = activeRefreshPaths();
      const results = await Promise.allSettled(keys.map(async p => [p, await getRows(p)]));
      let changed = false;
      results.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          const [p, rows] = res.value;
          const prev = rowsByPath.get(p);
          if (!prev || JSON.stringify(prev) !== JSON.stringify(rows)) changed = true;
          rowsByPath.set(p, rows); fetchedAtByPath.set(p, Date.now());
        } else if (keys[i] !== '.') {
          rowsByPath.delete(keys[i]); fetchedAtByPath.delete(keys[i]); expandedPaths.delete(keys[i]);
          changed = true;
        }
      });
      saveCache();
      if (changed || !rendered) renderTree();
      setStatus('');
    } catch (err) { setStatus(`Could not refresh files: ${err.message || err}`); }
    finally { button.disabled = false; }
  }

  async function ensureCurrentDirLoaded() {
    const {dir} = getCurrentContext();
    const chain = ancestorsOf(dir);
    const missing = [];
    for (const p of chain) {
      if (p !== '.') expandedPaths.add(p);
      if (!rowsByPath.has(p)) missing.push(p);
    }
    if (missing.length) {
      const results = await Promise.all(missing.map(async p => [p, await getRows(p)]));
      const now = Date.now();
      for (const [p, rows] of results) {
        rowsByPath.set(p, rows);
        fetchedAtByPath.set(p, now);
      }
    }
    saveCache();
  }

  function openNode(node) {
    if (!node.href) return;
    // On a phone the drawer covers the content: get it out of the way (and don't restore it after navigation).
    if (window.craftMobile?.active() && panel?.classList.contains('open')) closePanel();
    if (node.kind === 'dialog') { location.href = node.href; return; }
    const url = new URL(node.href, location.href); url.pathname = '/file_editor_';
    if (!tempEditor) {
      tempEditor = mountModal('ft_temp_editor', {
        refs: {close: 'button', frame: 'iframe'},
        closeOnBackdrop: false,
        onClose: () => { tempEditor.frame.src = 'about:blank'; },
      });
      const {frame} = tempEditor;
      on(frame, 'load', () => {
        on(frame.contentWindow, 'keydown', e => {
          if (window.solveitHotkeys?.dispatch(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
        }, true);
        // Phone: the overlay bar already names the file and closes it, so give Monaco the page's own header room too.
        const fd = frame.contentDocument;
        if (window.craftMobile?.active() && fd?.head && !fd.getElementById('craft-mobile-file-editor')) {
          const st = fd.createElement('style'); st.id = 'craft-mobile-file-editor';
          st.textContent = 'body > div.h-screen > header { display: none !important; } body > div.h-screen { padding: 0 !important; gap: 0 !important; } #file_editor { border: 0 !important; }';
          fd.head.append(st);
          frame.contentWindow.dispatchEvent(new Event('resize'));
        }
      });
    }
    qs('strong', tempEditor.root).textContent = url.searchParams.get('fp') || 'File editor';
    tempEditor.open(); tempEditor.frame.src = url.href;
  }

  function handleTreeClick(e) {
    if (e.target.closest('.solveit-tree-create')) return;
    const li = e.target.closest('li.solveit-tree-item[data-path]');
    if (!li) return;
    const node = nodeByPath.get(li.dataset.path);
    if (!node) return;
    const moreBtn = e.target.closest('.solveit-tree-row-more');
    if (moreBtn) {
      e.preventDefault(); e.stopPropagation();
      const row = rowOf(li) || moreBtn;
      showMenu({target: row, currentTarget: moreBtn, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {}});
      return;
    }
    const upBtn = e.target.closest('.solveit-tree-row-upload');
    if (upBtn && node.kind === 'directory') {
      e.preventDefault(); e.stopPropagation();
      openUploadPop(node.path, upBtn);
      return;
    }
    if (node.kind !== 'directory' && node.href) openNode(node);
  }

/* #73352039 */
/* ── File operations: Create, Delete, Copy/Paste, Drag-Move ────────── */
  function validateName(raw, kind) {
    const trimmed = raw.trim();
    if (!trimmed) throw new Error('Enter a name.');
    if (trimmed === '.' || trimmed === '..' || /[\\/]/.test(trimmed)) throw new Error('Name cannot be "." or ".." or contain slashes.');
    if (kind === 'dialog') return trimmed.endsWith('.ipynb') ? trimmed : `${trimmed}.ipynb`;
    return trimmed;
  }

  function uniqueName(existingSet, filename, kind) {
    if (!existingSet.has(filename)) return filename;
    let stem = filename, ext = '';
    if (kind !== 'directory') {
      const dot = filename.lastIndexOf('.');
      if (dot > 0) { stem = filename.slice(0, dot); ext = filename.slice(dot); }
    }
    let candidate = `${stem} copy${ext}`, n = 2;
    while (existingSet.has(candidate)) candidate = `${stem} copy ${n++}${ext}`;
    return candidate;
  }

  async function withBusy(label, fn) {
    if (busy) { setStatus('Wait for the current file action to finish…'); return; }
    busy = true; setStatus(label);
    try { return await fn(); }
    catch (err) { setStatus(err.message || String(err)); }
    finally { busy = false; }
  }

  async function createItem(targetDir, kind, filename) {
    const existing = await getRows(targetDir);
    if (existing.some(r => r.filename === filename)) throw new Error(`'${filename}' already exists in this folder.`);
  if (kind === 'directory') {
    await uploadBlob(targetDir, '__mkdir__.zip', makeEmptyDirZip(filename), true);
  } else if (kind === 'dialog') {
    const nb = JSON.stringify({cells: [], metadata: {solveit: {mode: 'learning'}}, nbformat: 4, nbformat_minor: 5}, null, 1);
    await uploadBlob(targetDir, filename, new Blob([nb], {type: 'application/json'}), false);
  } else {
    await uploadBlob(targetDir, filename, new Blob([''], {type: 'text/plain'}), false);
  }
  }

  let createDraft;
  function dismissCreate(restoreFocus = false) {
    if (!createDraft) return;
    const {form, dir} = createDraft;
    createDraft = null;
    form.remove();
    if (restoreFocus && !focusPath(dir)) panel?.querySelector('.solveit-tree-filter')?.focus();
  }

  function mountCreate() {
    if (!createDraft) return;
    const {dir, form} = createDraft;
    if (dir === '.') panel.querySelector('#solveit-file-tree').prepend(form);
    else findNode(dir)?.querySelector(':scope > details > summary')?.after(form);
  }

  function beginCreate(dir, kind) {
    if (busy) { setStatus('Wait for the current file action to finish…'); return; }
    dismissCreate();
    const label = {dialog: 'New dialog name', file: 'New file name', directory: 'New folder name', auto: 'New name (.ipynb by default)'}[kind];
    const {root: form, input, error} = mountTpl('ft_create_form', {refs: {input: 'input', error: '[role="alert"]'}});
    input.placeholder = label;
    input.setAttribute('aria-label', label);
    const setError = msg => { error.textContent = msg; input.setAttribute('aria-invalid', String(!!msg)); };
    const draft = createDraft = {dir, form, input};
    on(form, 'keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); if (!input.readOnly) dismissCreate(true); }
    });
    on(input, 'input', () => setError(''));
    on(form, 'submit', async e => {
      e.preventDefault();
      if (input.readOnly) return;
      if (busy) { setError('Wait for the current file action to finish.'); return; }
      const raw = input.value.trim();
      const resolvedKind = kind === 'auto' ? (/^.+\.[^.]+$/.test(raw) && !raw.endsWith('.ipynb') ? 'file' : 'dialog') : kind;
      let filename;
      try { filename = validateName(raw, resolvedKind); }
      catch (err) { setError(err.message); return; }
      setError('');
      input.readOnly = busy = true;
      setStatus(`Creating '${filename}'…`);
      try {
        await createItem(dir, resolvedKind, filename);
      } catch (err) {
        setStatus('');
        setError(err.message || String(err));
        if (createDraft === draft) input.focus();
        return;
      } finally { input.readOnly = false; busy = false; }
      if (createDraft === draft) dismissCreate();
      if (dir !== '.') expandedPaths.add(dir);
      try { await refreshDirs(dir); }
      catch (err) { setStatus(`Created '${filename}', but could not refresh: ${err.message || err}`); return; }
      if (!createDraft && panel?.classList.contains('open')) focusPath(joinPath(dir, filename));
      setStatus(hideDots && filename.startsWith('.') ? `Created '${filename}' (hidden by .* filter)` : `Created '${filename}'`);
    });
    const folder = dir === '.' ? null : findNode(dir);
    const details = folderDetailsOf(folder);
    if (details && !details.open) details.open = true;
    mountCreate();
    input.focus();
  }

  async function deleteNode(node) {
    const {dlgPath} = getCurrentContext();
    const affectsActive = dlgPath && (dlgPath === node.path || (node.kind === 'directory' && dlgPath.startsWith(node.path + '/')));
    const msg = node.kind === 'directory'
      ? `Delete folder '${node.name}' and all its contents? This cannot be undone.`
      : `Delete '${node.filename || node.name}'? This cannot be undone.`;
    if (!confirm(affectsActive ? `${msg}\n\nNote: This includes the currently open dialog.` : msg)) return;
    await withBusy(`Deleting '${node.filename || node.name}'…`, async () => {
      await deleteRecursive(node);
      if (node.kind === 'directory') purgeDirCache(node.path);
      const clip = getClipboard();
      if (clip && (clip.path === node.path || (node.kind === 'directory' && clip.path.startsWith(node.path + '/')))) {
        setClipboard(null);
      }
      await refreshDirs(node.parentPath || '.');
      setStatus(`Deleted '${node.filename || node.name}'`);
      if (affectsActive) location.href = '/?at=.';
    });
  }

  function copyNode(node) {
    setClipboard({
      path: node.path,
      filename: node.filename || baseOf(node.path),
      name: node.name,
      kind: node.kind,
      dlUrl: node.dlUrl || staticUrl(node.path),
      parentPath: node.parentPath || parentOf(node.path),
    });
    setStatus(`Copied '${node.filename || node.name}'`);
  }

  function canPaste(src, destDir) {
    if (!src) return false;
    const d = normPath(destDir);
    if (src.kind === 'directory' && (d === src.path || d.startsWith(src.path + '/'))) return false;
    return true;
  }

  async function pasteNodeInto(src, destDir) {
    const targetDir = normPath(destDir);
    if (!canPaste(src, targetDir)) { setStatus('Cannot paste a folder into itself.'); return; }
    await withBusy(`Pasting '${src.filename}'…`, async () => {
      const existing = await getRows(targetDir);
      const existingNames = new Set(existing.map(r => r.filename));
      const targetName = uniqueName(existingNames, src.filename, src.kind);
      const bytes = await downloadBytes(src);
      if (src.kind === 'directory') {
        const zipBlob = targetName === src.filename
          ? new Blob([bytes], {type: 'application/zip'})
          : renameZipTopDir(bytes, src.filename, targetName);
        await uploadBlob(targetDir, `${targetName}.zip`, zipBlob, true);
      } else {
        await uploadBlob(targetDir, targetName, new Blob([bytes]), false);
      }
      if (targetDir !== '.') expandedPaths.add(targetDir);
      await refreshDirs(targetDir);
      const newPath = joinPath(targetDir, targetName);
      focusPath(newPath);
      setStatus(`Pasted '${targetName}'`);
    });
  }

  function canDrop(src, destDir) {
    if (!src || src.kind === 'loading') return false;
    const d = normPath(destDir);
    if ((src.parentPath || parentOf(src.path)) === d) return false;
    if (src.kind === 'directory' && (d === src.path || d.startsWith(src.path + '/'))) return false;
    return true;
  }

  async function relocateNode(node, targetDir, newName, {confirmVerb, busyLabel, abortVerb, doneLabel, existsMsg, matchKind = false, transformDirBytes = null}) {
    const {dlgPath} = getCurrentContext();
    const affectsActive = dlgPath && (dlgPath === node.path || (node.kind === 'directory' && dlgPath.startsWith(node.path + '/')));
    if (affectsActive && !confirm(`'${node.filename}' includes the currently open dialog. ${confirmVerb} it will reload at the new location. Continue?`)) return;

    await withBusy(busyLabel, async () => {
      const destBefore = await getRows(targetDir);
      if (destBefore.some(r => r.filename === newName)) throw new Error(existsMsg);

      const bytes = await downloadBytes(node);
      if (node.kind === 'directory') {
        const zipBlob = transformDirBytes ? transformDirBytes(bytes) : new Blob([bytes], {type: 'application/zip'});
        await uploadBlob(targetDir, `${newName}.zip`, zipBlob, true);
      } else {
        await uploadBlob(targetDir, newName, new Blob([bytes]), false);
      }
      const destAfter = await getRows(targetDir);
      const created = destAfter.find(r => r.filename === newName && (!matchKind || r.kind === node.kind));
      if (!created) throw new Error(`${abortVerb} aborted: '${newName}' did not appear`);

      await deleteRecursive(node);
      const wasExpanded = node.kind === 'directory' && expandedPaths.has(node.path);
      if (node.kind === 'directory') purgeDirCache(node.path);
      const newPath = joinPath(targetDir, newName);
      if (wasExpanded) expandedPaths.add(newPath);
      if (targetDir !== '.') expandedPaths.add(targetDir);

      const clip = getClipboard();
      if (clip && (clip.path === node.path || (node.kind === 'directory' && clip.path.startsWith(node.path + '/')))) setClipboard(null);

      rowsByPath.set(targetDir, destAfter); fetchedAtByPath.set(targetDir, Date.now());
      const srcDir = node.parentPath || parentOf(node.path) || '.';
      const dirsToRefresh = srcDir === targetDir ? [targetDir] : [srcDir];
      if (wasExpanded) dirsToRefresh.push(newPath);
      await refreshDirs(...dirsToRefresh);
      focusPath(newPath);
      setStatus(doneLabel);

      if (affectsActive) {
        const nextDlg = dlgPath === node.path ? newPath : newPath + dlgPath.slice(node.path.length);
        location.href = `/dialog_?name=${encodeURIComponent(nextDlg)}`;
      }
    });
  }

  async function moveNode(src, destDir) {
    const targetDir = normPath(destDir);
    if (!canDrop(src, targetDir)) return;
    const destDisp = targetDir === '.' ? '~/' : targetDir + '/';
    await relocateNode(src, targetDir, src.filename, {
      confirmVerb: 'Moving',
      busyLabel: `Moving '${src.filename}' to ${destDisp}…`,
      abortVerb: 'Move',
      doneLabel: `Moved '${src.filename}' to ${destDisp}`,
      existsMsg: `Cannot move: '${src.filename}' already exists in ${targetDir === '.' ? '~/' : targetDir}`,
      matchKind: true,
    });
  }

  async function renameNode(node) {
    if (!node || node.kind === 'loading') return;
    const oldName = node.filename || baseOf(node.path);
    const dir = node.parentPath || parentOf(node.path);
    const raw = prompt(`Rename '${oldName}' to:`, oldName);
    if (raw === null) return;
    let newName;
    try { newName = validateName(raw, 'file'); }
    catch (err) { setStatus(err.message || 'Invalid name.'); return; }
    if (newName === oldName) return;
    await relocateNode(node, dir, newName, {
      confirmVerb: 'Renaming',
      busyLabel: `Renaming '${oldName}' to '${newName}'…`,
      abortVerb: 'Rename',
      doneLabel: `Renamed '${oldName}' to '${newName}'`,
      existsMsg: `'${newName}' already exists in ${dir === '.' ? '~/' : dir}`,
      transformDirBytes: bytes => renameZipTopDir(bytes, oldName, newName),
    });
  }

/* #e08775ac */
/* ── Upload (files & folders, via drag-and-drop or Upload popover) ─── */
  function snapshotDataTransfer(dt) {
    const entries = dt?.items
      ? [...dt.items].filter(it => it.kind === 'file').map(it => it.webkitGetAsEntry?.()).filter(Boolean)
      : [];
    const files = dt?.files ? [...dt.files] : [];
    return {entries, files};
  }

  function readAllDirEntries(dirEntry) {
    return new Promise((resolve, reject) => {
      const reader = dirEntry.createReader(), all = [];
      const next = () => reader.readEntries(batch => {
        if (!batch.length) resolve(all);
        else { all.push(...batch); next(); }
      }, reject);
      next();
    });
  }

  async function collectFromEntries(entries) {
    const items = [];
    for (const entry of entries) {
      if (!entry) continue;
      if (entry.isFile) {
        const file = await new Promise((res, rej) => entry.file(res, rej));
        items.push({kind: 'file', name: entry.name || file.name, file});
      } else if (entry.isDirectory) {
        const dirs = [], files = [];
        const walk = async (dirEntry, relDir) => {
          const children = await readAllDirEntries(dirEntry);
          for (const child of children) {
            if (child.isDirectory) {
              const nextRel = relDir ? `${relDir}/${child.name}` : child.name;
              dirs.push(nextRel);
              await walk(child, nextRel);
            } else if (child.isFile) {
              const file = await new Promise((res, rej) => child.file(res, rej));
              files.push({relDir, name: child.name || file.name, file});
            }
          }
        };
        await walk(entry, '');
        items.push({kind: 'directory', name: entry.name, dirs, files});
      }
    }
    return items;
  }

  function collectFromFileList(fileList) {
    const files = [...(fileList || [])];
    const dirsByTop = new Map(), items = [];
    for (const file of files) {
      const rel = (file.webkitRelativePath || '').replace(/^\/+/, '');
      if (rel && rel.includes('/')) {
        const parts = rel.split('/'), top = parts[0];
        if (!dirsByTop.has(top)) {
          const rec = {kind: 'directory', name: top, dirs: new Set(), files: []};
          dirsByTop.set(top, rec);
          items.push(rec);
        }
        const rec = dirsByTop.get(top);
        let acc = '';
        for (const seg of parts.slice(1, -1)) { acc = acc ? `${acc}/${seg}` : seg; rec.dirs.add(acc); }
        rec.files.push({relDir: acc, name: parts[parts.length - 1], file});
      } else {
        items.push({kind: 'file', name: file.name, file});
      }
    }
    return items.map(it => it.kind === 'directory' ? {...it, dirs: [...it.dirs]} : it);
  }

  async function handleDroppedTransfer(destDir, snap) {
    try {
      const items = snap.entries.length ? await collectFromEntries(snap.entries) : collectFromFileList(snap.files);
      await uploadItemsTo(destDir, items);
    } catch (err) {
      setStatus('Upload failed: ' + (err.message || err));
    }
  }

  async function uploadItemsTo(targetDir, items) {
    const dest = normPath(targetDir);
    if (!items.length) { setStatus('No files found to upload.'); return; }
    await withBusy(`Uploading to ${dest === '.' ? '~/' : dest + '/'}…`, async () => {
      const existing = await getRows(dest);
      const existingNames = new Set(existing.map(r => r.filename));
      const createdPaths = [], dirsToRefresh = new Set([dest]);
      let uploadedFiles = 0, createdDirs = 0;

      for (const item of items) {
        if (item.kind === 'file') {
          const targetName = uniqueName(existingNames, item.name, 'file');
          existingNames.add(targetName);
          setStatus(`Uploading '${targetName}'…`);
          await uploadBlob(dest, targetName, item.file, false);
          uploadedFiles++;
          createdPaths.push(joinPath(dest, targetName));
        } else {
          const targetDirName = uniqueName(existingNames, item.name, 'directory');
          existingNames.add(targetDirName);
          const rootCreated = joinPath(dest, targetDirName);
          setStatus(`Creating folder '${targetDirName}'…`);
          await uploadBlob(dest, '__mkdir__.zip', makeEmptyDirZip(targetDirName), true);
          createdDirs++;
          createdPaths.push(rootCreated);

          const sortedDirs = [...new Set(item.dirs)].sort((a, b) => a.split('/').length - b.split('/').length);
          for (const relSub of sortedDirs) {
            const parentSub = parentOf(relSub);
            const parentFull = parentSub === '.' ? rootCreated : joinPath(rootCreated, parentSub);
            await uploadBlob(parentFull, '__mkdir__.zip', makeEmptyDirZip(baseOf(relSub)), true);
            createdDirs++;
          }
          for (const f of item.files) {
            const fileParent = f.relDir ? joinPath(rootCreated, f.relDir) : rootCreated;
            setStatus(`Uploading '${f.name}'…`);
            await uploadBlob(fileParent, f.name, f.file, false);
            uploadedFiles++;
          }
          if (rowsByPath.has(rootCreated)) dirsToRefresh.add(rootCreated);
        }
      }

      if (dest !== '.') expandedPaths.add(dest);
      await refreshDirs(...dirsToRefresh);
      if (createdPaths.length) focusPath(createdPaths[createdPaths.length - 1]);
      const parts = [];
      if (uploadedFiles) parts.push(`${uploadedFiles} file${uploadedFiles === 1 ? '' : 's'}`);
      if (createdDirs) parts.push(`${createdDirs} folder${createdDirs === 1 ? '' : 's'}`);
      const hiddenCount = hideDots ? createdPaths.filter(p => baseOf(p).startsWith('.')).length : 0;
      const suffix = hiddenCount ? ' (hidden by .* filter)' : '';
      setStatus(`Uploaded ${parts.join(', ')} to ${dest === '.' ? '~/' : dest + '/'}${suffix}`);
    });
  }

  function closeUploadPop() {
    if (!uploadPop) return false;
    const pop = uploadPop;
    uploadPop = null;
    const wasOpen = pop.matches(':popover-open');
    if (wasOpen) pop.hidePopover();
    pop.remove();
    return wasOpen;
  }

  function openUploadPop(targetDir, anchorEl = null) {
    const dest = normPath(targetDir);
    closeMenu(); closeUploadPop();
    const {root: pop, dest: destEl, files: filesInput, dir: dirInput, drop: dropZone, close: closeBtn, pickFiles, pickDir} = mountTpl('ft_upload_pop', {refs: {
      dest: '.solveit-tree-upload-dest', files: '.solveit-tree-upload-input-files',
      dir: '.solveit-tree-upload-input-dir', drop: '.solveit-tree-upload-drop',
      close: '.solveit-tree-upload-x', pickFiles: '.solveit-tree-upload-pick-files',
      pickDir: '.solveit-tree-upload-pick-dir',
    }});
    uploadPop = pop;
    pop.setAttribute('aria-label', `Upload to ${dest === '.' ? '~/' : dest}`);
    const labelPath = dest === '.' ? '~/' : `~/${dest}/`;
    destEl.textContent = `Upload to ${labelPath}`; destEl.title = labelPath;

    closeBtn.onclick = () => closeUploadPop();
    pickFiles.onclick = () => { filesInput.value = ''; filesInput.click(); };
    pickDir.onclick = () => { dirInput.value = ''; dirInput.click(); };

    const onPicked = input => () => {
      const items = collectFromFileList(input.files);
      closeUploadPop();
      if (items.length) uploadItemsTo(dest, items);
    };
    on(filesInput, 'change', onPicked(filesInput));
    on(dirInput, 'change', onPicked(dirInput));

    on(dropZone, {
      dragover: e => {
        e.preventDefault(); e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        dropZone.classList.add('dragover');
      },
      dragleave: e => {
        if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('dragover');
      },
      drop: e => {
        e.preventDefault(); e.stopPropagation();
        dropZone.classList.remove('dragover');
        const snap = snapshotDataTransfer(e.dataTransfer);
        closeUploadPop();
        handleDroppedTransfer(dest, snap);
      },
    });

    document.body.append(pop);
    on(pop, 'toggle', e => {
      if (e.newState === 'closed' && uploadPop === pop) { pop.remove(); uploadPop = null; }
    });
    pop.showPopover();
    const b = anchorEl?.getBoundingClientRect?.() || panel.getBoundingClientRect();
    const r = pop.getBoundingClientRect();
    pop.style.left = Math.max(4, Math.min(b.left, innerWidth - r.width - 4)) + 'px';
    pop.style.top = Math.max(4, Math.min(b.bottom + 4, innerHeight - r.height - 4)) + 'px';
    pop.querySelector('.solveit-tree-upload-pick-files')?.focus();
  }

  function collapseAllFolders() {
    closeMenu(); closeUploadPop(); dismissCreate();
    expandedPaths.clear();
    saveCache();
    if (rendered) renderTree();
    setStatus('Collapsed all folders');
  }

/* #8c1d01d4 */
/* ── Context menu ──────────────────────────────────────────────────── */
  function closeMenu() { if (!menu?.isOpen()) return false; menu.close(); return true; }

  async function copyNodePath(node) {
    const path = `/app/data/${node.path}`;
    try {
      await navigator.clipboard.writeText(path);
      setStatus(`Copied path: ${path}`);
    } catch (err) { setStatus(`Could not copy path: ${err.message}`); }
  }

  function showMenu(e, forcedDir = null) {
    if (e.target.closest('.solveit-tree-create')) return;
    const li = forcedDir ? null : e.target.closest('li.solveit-tree-item[data-path]');
    const node = li ? nodeByPath.get(li.dataset.path) || null : null;
    if (node?.kind === 'loading') return;
    e.preventDefault(); e.stopPropagation(); closeMenu();

    const clip = getClipboard();
    menu ||= mountMenu('ft_menu');
    menu.root.replaceChildren();
    const item = (label, fn, {disabled = false, title = '', danger = false} = {}) => {
      menu.root.append(window.__craftCMCore.el('button', {
        type: 'button', role: 'menuitem', disabled, title: title || null, cls: danger ? 'danger' : null,
        onClick: ev => { ev.stopPropagation(); closeMenu(); fn(); },
      }, label));
    };
    const sep = () => { menu.root.append(window.__craftCMCore.el('hr', {cls: 'solveit-tree-menu-sep'})); };

    if (!node || node.kind === 'directory') {
      const targetDir = forcedDir ? normPath(forcedDir) : (node ? node.path : '.');
      item('New Dialog…', () => beginCreate(targetDir, 'dialog'));
      item('New File…', () => beginCreate(targetDir, 'file'));
      item('New Folder…', () => beginCreate(targetDir, 'directory'));
      item('Upload…', () => openUploadPop(targetDir, li || e.currentTarget));
      sep();
      if (node) {
        item('Rename…', () => renameNode(node));
        item('Copy', () => copyNode(node));
        item('Copy Path', () => copyNodePath(node));
      }
      item(clip ? `Paste '${clip.filename}'` : 'Paste', () => pasteNodeInto(clip, targetDir), {
        disabled: !clip || !canPaste(clip, targetDir),
        title: !clip ? 'Copy a file, dialog, or folder first' : (!canPaste(clip, targetDir) ? 'Cannot paste a folder into itself' : ''),
      });
      if (node) {
        sep();
        item('Delete…', () => deleteNode(node), {danger: true});
      }
    } else {
      const targetDir = node.parentPath || '.';
      item('Open', () => openNode(node), {disabled: !node.href});
      item('Upload…', () => openUploadPop(targetDir, li || e.currentTarget));
      sep();
      item('Rename…', () => renameNode(node));
      item('Copy', () => copyNode(node));
      item('Copy Path', () => copyNodePath(node));
      item(clip ? `Paste '${clip.filename}'` : 'Paste', () => pasteNodeInto(clip, targetDir), {
        disabled: !clip || !canPaste(clip, targetDir),
        title: !clip ? 'Copy a file, dialog, or folder first' : (!canPaste(clip, targetDir) ? 'Cannot paste a folder into itself' : ''),
      });
      item('Duplicate', () => pasteNodeInto(node, targetDir));
      sep();
      item('Delete…', () => deleteNode(node), {danger: true});
    }

    const anchor = li || e.currentTarget;
    const at = (e.clientX || e.clientY) ? {x: e.clientX, y: e.clientY} : (b => ({x: b.left + 24, y: b.bottom}))(anchor.getBoundingClientRect());
    menu.openAt(at.x, at.y);
    menu.items()[0]?.focus();
  }

  /* ── Drag and drop ─────────────────────────────────────────────────── */
  function clearDropState() {
    if (dropHighlightEl) { dropHighlightEl.classList.remove('solveit-tree-drop-target'); dropHighlightEl = null; }
    clearTimeout(hoverExpandTimer); hoverExpandTimer = null; hoverExpandPath = null;
  }

  function resolveDropTarget(targetEl) {
    const rootbar = panel?.querySelector('.solveit-tree-rootbar');
    if (targetEl.closest?.('.solveit-tree-rootbar')) return {destDir: '.', highlightEl: rootbar, dirLi: null};
    const li = targetEl.closest?.('li.solveit-tree-item[data-path]');
    if (!li) return {destDir: '.', highlightEl: rootbar, dirLi: null};
    const node = nodeByPath.get(li.dataset.path);
    if (!node || node.kind === 'loading') return null;
    if (node.kind === 'directory') return {destDir: node.path, highlightEl: rowOf(li), dirLi: li};
    const destDir = node.parentPath || '.';
    const parentLi = destDir === '.' ? null : findNode(destDir);
    return {destDir, highlightEl: parentLi ? rowOf(parentLi) : rootbar, dirLi: parentLi};
  }

  function wireDragAndDrop(treeEl, rootbar) {
    treeEl.addEventListener('dragstart', e => {
      const li = e.target.closest('li.solveit-tree-item[data-path]');
      const node = li ? nodeByPath.get(li.dataset.path) : null;
      if (!node || node.kind === 'loading') { e.preventDefault(); return; }
      closeMenu();
      draggedNode = node;
      li.classList.add('solveit-tree-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try {
        e.dataTransfer.setData('application/x-solveit-node', JSON.stringify(node));
        e.dataTransfer.setData('text/plain', node.path);
      } catch {}
    });

    const isExternalFileDrag = e => !draggedNode && [...(e.dataTransfer?.types || [])].includes('Files');

    const onDragOver = e => {
      const external = isExternalFileDrag(e);
      if (!draggedNode && !external) return;
      if (e.target.closest?.('.solveit-tree-upload-pop')) return;
      const target = resolveDropTarget(e.target);
      if (!target || (!external && !canDrop(draggedNode, target.destDir))) {
        clearDropState();
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = external ? 'copy' : 'move';
      if (dropHighlightEl !== target.highlightEl) {
        if (dropHighlightEl) dropHighlightEl.classList.remove('solveit-tree-drop-target');
        dropHighlightEl = target.highlightEl;
        dropHighlightEl?.classList.add('solveit-tree-drop-target');
      }
      const dirDetails = folderDetailsOf(target.dirLi);
      if (dirDetails && !dirDetails.open && target.destDir !== '.') {
        if (hoverExpandPath !== target.destDir) {
          clearTimeout(hoverExpandTimer);
          hoverExpandPath = target.destDir;
          hoverExpandTimer = setTimeout(() => {
            if (dirDetails.isConnected && !dirDetails.open) dirDetails.open = true;
          }, 600);
        }
      } else {
        clearTimeout(hoverExpandTimer); hoverExpandTimer = null; hoverExpandPath = null;
      }
    };

    const onDrop = e => {
      const external = isExternalFileDrag(e);
      if (!draggedNode && !external) return;
      if (e.target.closest?.('.solveit-tree-upload-pop')) return;
      e.preventDefault(); e.stopPropagation();
      const target = resolveDropTarget(e.target);
      clearDropState();
      if (external) {
        const snap = snapshotDataTransfer(e.dataTransfer);
        if (target) handleDroppedTransfer(target.destDir, snap);
        return;
      }
      const src = draggedNode;
      panel?.querySelectorAll('li.solveit-tree-dragging').forEach(el => el.classList.remove('solveit-tree-dragging'));
      draggedNode = null;
      if (target && canDrop(src, target.destDir)) moveNode(src, target.destDir);
    };

    const onDragEnd = () => {
      clearDropState();
      panel?.querySelectorAll('li.solveit-tree-dragging').forEach(el => el.classList.remove('solveit-tree-dragging'));
      draggedNode = null;
    };

    const onDragLeave = e => {
      if (!panel.contains(e.relatedTarget)) clearDropState();
    };

    on(panel, {dragover: onDragOver, drop: onDrop, dragleave: onDragLeave});
    on(treeEl, 'dragend', onDragEnd);
  }

/* #4d083eaf */
/* ── Panel construction & lifecycle ────────────────────────────────── */
  function updateDotsBtn() {
    const dots = qs('.solveit-tree-dots', panel);
    if (!dots) return;
    const lbl = hideDots ? 'Hidden files are hidden (click to show)' : 'Showing all files (click to hide dot files)';
    patch(dots, {'aria-pressed': String(hideDots), title: lbl, 'aria-label': lbl});
  }

  /* iOS Safari never fires contextmenu for a touch hold, so hold-to-open is done by hand.
     Android fires both: whichever comes first wins and the other is swallowed. */
  function wireTouchLongPress(panel, rootbar) {
    let lpTimer = null, lpStart = null, lpFiredAt = 0;
    const lpCancel = () => { clearTimeout(lpTimer); lpTimer = null; };
    panel.addEventListener('touchstart', e => {
      lpCancel();
      if (e.touches.length !== 1) return;
      const t = e.target, onRoot = rootbar.contains(t);
      if (t.closest('button, input, .solveit-tree-create') || !(onRoot || t.closest('li.solveit-tree-item[data-path]'))) return;
      const {clientX, clientY} = e.touches[0];
      lpStart = {x: clientX, y: clientY};
      lpTimer = setTimeout(() => {
        lpTimer = null; lpFiredAt = Date.now();
        navigator.vibrate?.(10);
        showMenu({target: t, currentTarget: t, clientX, clientY, preventDefault() {}, stopPropagation() {}}, onRoot ? '.' : null);
      }, 500);
    }, {passive: true});
    panel.addEventListener('touchmove', e => {
      const p = e.touches[0];
      if (lpTimer && Math.hypot(p.clientX - lpStart.x, p.clientY - lpStart.y) > 10) lpCancel();
    }, {passive: true});
    panel.addEventListener('touchend', e => { lpCancel(); if (Date.now() - lpFiredAt < 800) e.preventDefault(); });  // the hold must not also open the row
    panel.addEventListener('touchcancel', lpCancel, {passive: true});
    panel.addEventListener('contextmenu', e => {
      lpCancel();
      if (Date.now() - lpFiredAt < 1000) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  }

  function wirePanelResizer(panel, resizer) {
    const WIDTH_KEY = 'solveit-file-tree:width';
    const applyWidth = px => {
      if (!px) { panel.style.removeProperty('--solveit-tree-w'); return; }
      const clamped = Math.max(200, Math.min(Math.round(px), Math.round(innerWidth * 0.6)));
      panel.style.setProperty('--solveit-tree-w', clamped + 'px');
    };
    const savedW = Number(store.get(WIDTH_KEY)); if (savedW >= 200) applyWidth(savedW);
    on(resizer, {
      pointerdown: e => {
        if (e.button !== 0 || window.craftMobile?.active?.()) return;
        e.preventDefault(); e.stopPropagation();
        resizer.setPointerCapture?.(e.pointerId);
        panel.classList.add('resizing');
        const startX = e.clientX, startW = panel.getBoundingClientRect().width;
        const onMove = ev => applyWidth(startW + (ev.clientX - startX));
        let offDrag;
        const onUp = () => {
          panel.classList.remove('resizing');
          offDrag?.();
          store.set(WIDTH_KEY, Math.round(panel.getBoundingClientRect().width));
        };
        offDrag = on(resizer, {pointermove: onMove, pointerup: onUp, pointercancel: onUp});
      },
      dblclick: e => {
        e.preventDefault(); e.stopPropagation();
        applyWidth(0);
        store.del(WIDTH_KEY);
      },
    });
  }

  function makePanel() {
    if (panel) return panel;
    const r = mountTpl('ft_panel', {refs: {
      brand: '.solveit-tree-brand', btnNew: '.solveit-tree-new', btnUpload: '.solveit-tree-upload',
      btnCollapse: '.solveit-tree-collapse', btnRefresh: '.solveit-tree-refresh', btnDots: '.solveit-tree-dots',
      filter: '.solveit-tree-filter', treeEl: '#solveit-file-tree',
      rootbar: '.solveit-tree-rootbar', resizer: '.solveit-tree-resizer',
    }});
    panel = r.root;
    const {treeEl, rootbar, resizer} = r;

    dlgNameNode = qs('nav.monster-navbar h2#dlg-name');
    if (dlgNameNode) {
      dlgNameOrigParent = dlgNameNode.parentNode;
      dlgNameOrigNext = dlgNameNode.nextSibling;
      r.brand.append(dlgNameNode);
    }
    on(panel, 'click', e => e.stopPropagation());
    r.btnNew.onclick = () => beginCreate(lastTreeDir || getCurrentContext().dir, 'auto');
    r.btnUpload.onclick = e => openUploadPop(lastTreeDir || getCurrentContext().dir, e.currentTarget);
    r.btnCollapse.onclick = collapseAllFolders;
    r.btnRefresh.onclick = refreshTree;
    updateDotsBtn();
    r.btnDots.onclick = () => {
      hideDots = !hideDots;
      updateDotsBtn();
      store.set(DOTS_KEY, hideDots ? '1' : '0');
      if (rendered) renderTree();
    };
    window.solveitHotkeys?.refreshChips();
    let filterTimer = null;
    on(r.filter, 'input', e => {
      filterText = e.target.value;
      clearTimeout(filterTimer);
      if (!filterText) { if (rendered) renderTree(); return; }
      filterTimer = setTimeout(() => { if (rendered) renderTree(); }, 80);
    });
    rootbar.querySelector('.solveit-tree-row-upload').onclick = e => {
      e.stopPropagation();
      openUploadPop('.', e.currentTarget);
    };
    rootbar.querySelector('.solveit-tree-row-more').onclick = e => {
      e.stopPropagation();
      const b = e.currentTarget;
      showMenu({target: b, currentTarget: b, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {}}, '.');
    };
    treeEl.addEventListener('focusin', e => {
      const node = nodeOf(e.target);
      if (!node || node.kind === 'loading') return;
      lastTreeDir = node.kind === 'directory' ? node.path : (node.parentPath || '.');
    });
    treeEl.addEventListener('contextmenu', e => showMenu(e));
    rootbar.addEventListener('contextmenu', e => showMenu(e, '.'));
    panel.addEventListener('contextmenu', e => {
      if (e.target === panel || e.target.matches('.solveit-tree-status')) showMenu(e, '.');
    });
    wireTouchLongPress(panel, rootbar);
    panel.addEventListener('dblclick', e => {
      if (e.target.closest('.solveit-tree-row-upload, .solveit-tree-upload-pop')) return;
      const atRoot = rootbar.contains(e.target);
      const onBlank = e.target === panel || e.target.matches('.solveit-tree-status') || (treeEl.contains(e.target) && !e.target.closest('li.solveit-tree-item[data-path], .solveit-tree-create'));
      if (!atRoot && !onBlank) return;
      e.preventDefault(); e.stopPropagation();
      closeMenu();
      beginCreate(atRoot ? '.' : getCurrentContext().dir, 'auto');
    });
    treeEl.addEventListener('click', handleTreeClick, true);
    wireDragAndDrop(treeEl, rootbar);
    wirePanelResizer(panel, resizer);

    panel.inert = true;
    const scroller = qs('.uk-container > .overflow-y-auto');
    if (scroller) {
      workspaceRow = mountTpl('ft_workspace');
      scroller.before(workspaceRow);
      workspaceRow.append(panel, scroller);
    } else document.body.append(panel);
    return panel;
  }

/* #d864989a */
async function toggle(focus = true) {
    const p = makePanel(), opening = !p.classList.contains('open');
    if (!opening) { closePanel(); return; }
    previousFocus = document.activeElement; p.inert = false; p.classList.add('open');
    saveOpen(true);
    if (!refreshTimer) refreshTimer = setInterval(() => {
      if (panel?.classList.contains('open') && activeRefreshPaths().some(path => Date.now() - (fetchedAtByPath.get(path) || 0) > CACHE_MAX_AGE)) refreshTree();
    }, CACHE_MAX_AGE);
    try {
      setStatus('Loading files…');
      await ensureCurrentDirLoaded();
      renderTree(); setStatus('');
      if (focus && p.classList.contains('open')) {
        const {dir, dlgPath} = getCurrentContext();
        if (!(dlgPath && focusPath(dlgPath)) && !(dir !== '.' && focusPath(dir))) p.querySelector('#solveit-file-tree .solveit-tree-row')?.focus();
      }
      if (activeRefreshPaths().some(path => Date.now() - (fetchedAtByPath.get(path) || 0) > CACHE_MAX_AGE)) refreshTree();
    } catch (err) { setStatus('Unable to load files: ' + (err.message || err)); }
  }

  function handleTreeKeys(e) {
    const current = e.target.closest?.('.solveit-tree-row');
    if (!current) return;
    const li = current.closest('li.solveit-tree-item[data-path]');
    const node = li ? nodeByPath.get(li.dataset.path) : null;
    if (!node) return;
    const details = folderDetailsOf(li);
    const items = [...panel.querySelectorAll('#solveit-file-tree .solveit-tree-row')].filter(row => {
      let d = row.parentElement.closest('details.solveit-tree-folder');
      if (row.tagName === 'SUMMARY' && d === row.parentElement) d = d.parentElement.closest('details.solveit-tree-folder');
      while (d) { if (!d.open) return false; d = d.parentElement.closest('details.solveit-tree-folder'); }
      return true;
    });
    const index = items.indexOf(current);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[Math.max(0, Math.min(items.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    } else if (e.key === 'ArrowRight' && node.kind === 'directory') {
      e.preventDefault();
      if (details?.open) details.querySelector(':scope > ul.solveit-tree-list .solveit-tree-row')?.focus();
      else if (details) details.open = true;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (node.kind === 'directory' && details?.open) details.open = false;
      else rowOf(li.parentElement.closest('li.solveit-tree-item[data-path]'))?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (node.kind === 'directory' && details) details.open = !details.open;
      else if (node.href) openNode(node);
    } else if (e.key === 'F2') {
      e.preventDefault(); renameNode(node);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); deleteNode(node);
    } else if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'c') {
      e.preventDefault(); copyNode(node);
    } else if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      const clip = getClipboard();
      if (clip) pasteNodeInto(clip, node.kind === 'directory' ? node.path : (node.parentPath || '.'));
    } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault(); showMenu({target: current, currentTarget: current, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {}});
    }
  }

  function closePanel() {
    if (!panel) return;
    closeMenu(); closeUploadPop(); dismissCreate(); clearDropState(); panel.classList.remove('open'); panel.inert = true; previousFocus?.focus();
    saveOpen(false);
  }

  const onDocPointerDown = e => {
    if (createDraft && !createDraft.input.readOnly && !createDraft.form.contains(e.target)) dismissCreate();
  };
  const onWinKeyDown = e => {
    if (document.querySelector('#solveit-launcher[open], #solveit-launcher.open')) return;
    if (e.target.closest?.('.solveit-tree-create')) return;
    if (e.key === 'Escape' && (closeUploadPop() || closeMenu())) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    const active = panel?.classList.contains('open') && panel.contains(document.activeElement);
    const isTreeMod = (e.metaKey || e.ctrlKey) && !e.altKey && ['c', 'v'].includes(e.key.toLowerCase());
    if (active && !menu?.isOpen() && !e.target.closest?.('.solveit-tree-filter') && (isTreeMod || ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'ContextMenu', 'F10', 'F2', 'Delete', 'Backspace'].includes(e.key))) {
      if (e.key === 'F10' && !e.shiftKey) return;
      e.stopImmediatePropagation();
      handleTreeKeys(e);
      return;
    }
  };
  const ac = new AbortController(), cap = {capture: true, signal: ac.signal};
  on(document, 'pointerdown', onDocPointerDown, cap);
  on(window, 'keydown', onWinKeyDown, cap);

  function disable() {
    clearInterval(refreshTimer); refreshTimer = null;
    menu?.destroy(); menu = null; closeUploadPop(); tempEditor?.destroy(); tempEditor = null; dismissCreate(); clearDropState();
    ac.abort();
    if (dlgNameNode && dlgNameOrigParent) {
      if (dlgNameOrigNext && dlgNameOrigNext.parentNode === dlgNameOrigParent) dlgNameOrigParent.insertBefore(dlgNameNode, dlgNameOrigNext);
      else dlgNameOrigParent.append(dlgNameNode);
    }
    if (workspaceRow) {
      const scroller = workspaceRow.querySelector(':scope > .overflow-y-auto');
      if (scroller) workspaceRow.before(scroller);
      workspaceRow.remove();
      workspaceRow = null;
    }
    panel?.remove();
    panel = null; rendered = false; nodeByPath.clear(); liByPath.clear();
  }

  const offMobile = window.craftMobile?.onChange(() => { if (rendered) renderTree(); });
  window.solveitFileTree = {
    refresh: () => refreshCurrent(),
    getCurrentContext,
    toggle, open: openNode, close: closePanel,
    isOpen: () => !!panel?.classList.contains('open'),
    disable() { offMobile?.(); disable(); },
    async entries() {  // every loaded dialog/file, for the launcher
      if (!rowsByPath.has('.')) { rowsByPath.set('.', await getRows('.')); fetchedAtByPath.set('.', Date.now()); saveCache(); }
      return [...rowsByPath.entries()]
        .filter(([p]) => !hideDots || !p.split('/').some(part => part !== '.' && part.startsWith('.')))
        .flatMap(([, rows]) => rows)
        .filter(n => n.kind !== 'directory' && (!hideDots || !(n.filename || n.name).startsWith('.')));
    },
  };
  function restoreOpen() {
    if (window.craftMobile?.active()) return;  // a drawer popping open over the page on load is just in the way on a phone
    if (store.get(OPEN_KEY, null, sessionStorage) === '1' && !panel?.classList.contains('open')) toggle(false);
  }
  if (document.readyState === 'loading') on(document, 'DOMContentLoaded', restoreOpen, {once: true, signal: ac.signal});
  else restoreOpen();
})();

/* %% nbs/craft/06_file_tree.ipynb #c8602651 */
(() => {
  window.craftDotPrompts?.disable?.();
  if (!window.__craftCMCore.features.init('dot-prompts', 'Dot-prompt markers', 'Compact empty or bare-dot prompt cells')) return;
  const {SOLVEIT, onCells} = window.__craftCMCore;
  function markDotPrompts(cells = null) {
    const list = cells || document.querySelectorAll(SOLVEIT.sel.cell);
    list.forEach(editable => {
      const prompt = editable.querySelector(`.msg-card${SOLVEIT.sel.promptCard}`);
      const body = prompt?.querySelector(SOLVEIT.sel.msgBody);
      const isDot = !!body && ['', '.'].includes(body.textContent.trim()) && !body.querySelector('img,video,audio,iframe,canvas,svg');

      editable.classList.toggle('dot-prompt', isDot);
      const response = editable.querySelector(`${SOLVEIT.sel.cardOut} ${SOLVEIT.sel.msgContent}`);
      const hasResponse = !!response && (!!response.textContent.trim() || !!response.querySelector('img,video,audio,iframe,canvas,svg'));
      editable.classList.toggle('dot-prompt-response', isDot && hasResponse);
    });
  }

  const offDom = onCells(markDotPrompts, {initial: true});
  window.craftDotPrompts = {refresh: () => markDotPrompts(), disable() { offDom?.(); }};
})();

/* %% nbs/craft/07_cell_presentation.ipynb #455c9f8a */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"action_menu": "<div class=\"craft-menu craft-action-menu\" id=\"craft-cell-action-menu\" role=\"menu\" popover=\"auto\"></div>", "action_trigger": "<button type=\"button\" class=\"craft-action-trigger\" aria-haspopup=\"menu\" aria-expanded=\"false\" aria-controls=\"craft-cell-action-menu\">…</button>", "omit_marker": "<button type=\"button\" class=\"craft-omit-marker\"></button>"});

/* %% nbs/craft/07_cell_presentation.ipynb #68ce4acb */
(() => {
  window.craftCellChains?.disable();
  if (!window.__craftCMCore.features.init('cell-chains', 'Cell chains', 'Group consecutive notes, code, and prompts')) return;
  const {SOLVEIT, onCells} = window.__craftCMCore;
  const sync = () => {
    const all = [...document.querySelectorAll(SOLVEIT.sel.cell)];
    const cells = all.filter(e => !e.hidden && getComputedStyle(e).display !== 'none');
    const type = e => e?.querySelector(SOLVEIT.sel.cardIn)?.dataset.mtype;
    const joins = (a, b) => ['prompt', 'code', 'note'].includes(type(a)) && type(a) === type(b);
    const prev = new Set(cells.filter((e, i) => i > 0 && joins(cells[i-1], e)));
    const next = new Set(cells.filter((e, i) => i < cells.length-1 && joins(e, cells[i+1])));
    for (const e of all) {
      if (e.classList.contains('craft-chain-prev') !== prev.has(e)) e.classList.toggle('craft-chain-prev', prev.has(e));
      if (e.classList.contains('craft-chain-next') !== next.has(e)) e.classList.toggle('craft-chain-next', next.has(e));
    }
  };
  const offDom = onCells(sync, {attrs: ['class', 'style', 'hidden', 'data-mtype']});
  window.craftCellChains = {
    sync,
    disable() {
      offDom();
      document.querySelectorAll('.craft-chain-prev,.craft-chain-next').forEach(e => e.classList.remove('craft-chain-prev', 'craft-chain-next'));
    }
  };
  sync();
})();

/* %% nbs/craft/07_cell_presentation.ipynb #958ca2ad */
(() => {
  window.craftActionMenus?.disable();
  if (window.CRAFT_ACTION_MENUS === false || !window.__craftCMCore.features.init('action-menus', 'Compact action menus', 'Collapse card action strips into popover menu')) return;
  let current = null;
  const providers = window.__craftActionMenuProviders || new Set();
  window.__craftActionMenuProviders = providers;
  const {mountTpl, mountMenu, qsa, on, onCells, SOLVEIT, allCells} = window.__craftCMCore;
  const ac = new AbortController(), sig = {signal: ac.signal}, cap = {capture: true, signal: ac.signal};
  const menuCtl = mountMenu('action_menu', {
    signal: ac.signal,
    onClose() {
      const trigger = current;
      current = null;
      trigger?.setAttribute('aria-expanded', 'false');
    },
  });
  const menu = menuCtl.root;
  const close = (restore = false) => {
    const trigger = current;
    menuCtl.close();
    if (restore && trigger?.isConnected) trigger.focus({preventScroll: true});
  };
  const open = trigger => {
    if (current === trigger) return close(true);
    close();
    const card = trigger.closest('.msg-card');
    const group = card.querySelector(`${SOLVEIT.sel.cardHeader} .uk-btn-group`);
    if (!group) return;
    menu.replaceChildren();
    for (const source of group.querySelectorAll('button,a')) {
      if (source.hidden) continue;
      const label = source.title || source.querySelector('[title]')?.getAttribute('title') || source.getAttribute('aria-label');
      if (!label) continue;
      menu.append(window.__craftCMCore.el('button', {
        type: 'button', role: 'menuitem', disabled: source.disabled,
        dataset: /^Delete/i.test(label) ? {danger: ''} : {},
        onClick: e => {
          e.stopPropagation();
          close();
          if (source.isConnected) source.click();
          queueMicrotask(() => { if (document.activeElement === document.body && trigger.isConnected) trigger.focus({preventScroll: true}); });
        },
      }, label));
    }
    const cellEl = card.closest('.editable');
    const cid = cellEl?.id?.replace(/^_/, '') || '';
    const ctx = {cell: cellEl, card, id: cid, isOutput: card.classList.contains('card-out'), close};
    for (const fn of providers) {
      let items = null;
      try { items = fn(ctx); } catch (err) { console.error('craftActionMenus provider', err); }
      if (!Array.isArray(items) || !items.length) continue;
      if (menu.children.length) menu.append(window.__craftCMCore.el('hr', {cls: 'craft-action-sep'}));
      for (const it of items) {
        if (!it) continue;
        if (it.sep) { menu.append(window.__craftCMCore.el('hr', {cls: 'craft-action-sep'})); continue; }
        if (it.header) { menu.append(window.__craftCMCore.el('div', {cls: 'craft-action-hdr'}, it.header)); continue; }
        menu.append(window.__craftCMCore.el('button', {
          type: 'button', role: 'menuitem', disabled: !!it.disabled,
          dataset: it.danger ? {danger: ''} : {},
          onClick: e => {
            e.stopPropagation();
            close();
            try { it.onClick?.(ctx, e); } catch (err) { console.error('craftActionMenus item', err); }
          },
        }, it.label));
      }
    }
    current = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    menu.setAttribute('aria-label', trigger.getAttribute('aria-label'));
    menu.showPopover();
    const r = trigger.getBoundingClientRect();
    menuCtl.openAt(r.right - menu.offsetWidth, r.bottom + 4);
    menu.querySelector('button:not(:disabled)')?.focus({preventScroll: true});
  };
  const sync = (cells = null) => {
    if (current && !current.isConnected) close();
    const roots = cells || allCells();
    const groups = [];
    for (const c of roots) for (const g of c.querySelectorAll(`.msg-card > ${SOLVEIT.sel.cardHeader} .uk-btn-group`)) groups.push(g);
    for (const group of groups) {
      const nav = group.closest('nav');
      if (!nav) continue;
      let shell = group;
      while (shell.parentElement !== nav && shell.parentElement) shell = shell.parentElement;
      if (shell === group && shell.parentElement !== nav) continue;
      shell.classList.add('craft-action-source');
      for (const button of nav.querySelectorAll(':scope > button[data-uk-toggle]')) button.classList.add('craft-old-action-toggle');
      if (nav.querySelector(':scope > .craft-action-trigger')) continue;
      const trigger = mountTpl('action_trigger');
      const card = nav.closest('.msg-card');
      trigger.setAttribute('aria-label', card.classList.contains('card-out') ? 'Output actions' : 'Input actions');
      on(trigger, {
        click: e => { e.stopPropagation(); open(trigger); },
        keydown: e => { if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); open(trigger); } },
      });
      nav.append(trigger);
    }
  };
  const offDom = onCells(sync);
  on(document, 'keydown', e => {
    if (e.key === 'Escape' && current) { e.preventDefault(); e.stopImmediatePropagation(); close(true); }
  }, cap);
  const beforeSwap = ['htmx', 'before', 'swap'].join(window.htmx?.config?.metaCharacter || ':');
  on(document, beforeSwap, () => close(), sig);
  window.craftActionMenus = {
    sync,
    close,
    registerProvider(fn) { providers.add(fn); return () => providers.delete(fn); },
    disable() {
      offDom();
      close();
      ac.abort();
      qsa('.craft-action-trigger').forEach(e => e.remove());
      qsa('.craft-action-source,.craft-old-action-toggle').forEach(e => e.classList.remove('craft-action-source', 'craft-old-action-toggle'));
      menuCtl.destroy();
    }
  };
  sync();
})();

/* %% nbs/craft/07_cell_presentation.ipynb #b89894f9 */
(() => {
  const {mountTpl, qs, qsa, on, onCells, notify, SOLVEIT, features} = window.__craftCMCore;
  const preserved = qsa('.editable.craft-omitted').map(e => e.id);
  window.craftOmit?.disable();
  if (!features.init('cell-omit', 'Whole-cell omit', 'Hide selected cells locally with U')) return;
  const omitted = new Set(preserved), markers = new Map();
  let approach = 1;
  const root = () => qs(SOLVEIT.sel.dialog);
  const cells = () => qsa(SOLVEIT.sel.cell);
  const eligible = e => !e.hidden && !e.matches('.filter-hidden,.heading-hidden,.hidden');
  const marker = () => document.activeElement?.closest('.craft-omit-marker');
  const blocked = () => window.__craftCMCore.typingBlocked();
  const selected = () => cells().filter(e => e.matches(SOLVEIT.sel.selectedCell) && e.offsetParent !== null);
  const clearSelection = () => document.querySelectorAll(SOLVEIT.sel.selectedCell).forEach(e => e.setAttribute('data-sm', 'unselected'));
  const choose = (e, direction = 1) => {
    if (!e) return;
    approach = direction;
    if (e.matches('.craft-omit-marker')) {
      clearSelection();
      e.focus({preventScroll: true});
      e.scrollIntoView({block: 'nearest'});
    } else {
      marker()?.blur();
      window.selectMsg(window.$(e));
      document.activeElement?.closest('.craft-omit-marker')?.blur();
    }
  };
  const restore = button => {
    const ids = JSON.parse(button.dataset.omitIds);
    ids.forEach(id => { omitted.delete(id); window.craftParts?.restoreCell(id); });
    const target = document.getElementById(approach < 0 ? ids.at(-1) : ids[0]);
    sync();
    if (target) choose(target);
    return true;
  };
  const sync = () => {
    const all = cells(), runs = [];
    let run;
    for (const e of all) {
      const hide = omitted.has(e.id) || !!window.craftParts?.fullyHidden(e);
      if (e.classList.contains('craft-omitted') !== hide) e.classList.toggle('craft-omitted', hide);
      if (!eligible(e) || !hide) { run = null; continue; }
      if (!run) { run = []; runs.push(run); }
      run.push(e);
    }
    const keys = new Set();
    for (const group of runs) {
      const key = group[0].id, ids = group.map(e => e.id);
      keys.add(key);
      let button = markers.get(key);
      if (!button) {
        button = mountTpl('omit_marker');
        on(button, {click: () => restore(button), focus: clearSelection});
        markers.set(key, button);
      }
      const text = `▸ ${ids.length}`, label = `Expand ${ids.length} omitted ${ids.length === 1 ? 'cell' : 'cells'}`;
      if (button.textContent !== text) button.textContent = text;
      if (button.getAttribute('aria-label') !== label) {
        button.setAttribute('aria-label', label);
        button.title = label + ' · Right arrow, Enter, or Omit';
      }
      button.setAttribute('aria-expanded', 'false');
      button.dataset.omitIds = JSON.stringify(ids);
      if (button.nextElementSibling !== group[0]) group[0].before(button);
    }
    for (const [key, button] of markers) {
      if (keys.has(key)) continue;
      const focused = document.activeElement === button;
      const ids = JSON.parse(button.dataset.omitIds);
      button.remove();
      markers.delete(key);
      if (focused) {
        const replacement = [...markers.values()].find(b => JSON.parse(b.dataset.omitIds).some(id => ids.includes(id)));
        replacement?.focus();
      }
    }
    window.craftCellChains?.sync();
  };
  const toggle = () => {
    if (blocked()) return false;
    if (marker()) return restore(marker());
    const targets = selected();
    if (!targets.length) return false;
    if (targets.some(e => e.dataset.editing === 'true' || e.dataset.c2Editing === 'true' || e.dataset.mdEditing === 'true')) {
      notify('Finish editing the cell before omitting it.', {status: 'warning'});
      return true;
    }
    targets.forEach(e => omitted.add(e.id));
    sync();
    const button = [...markers.values()].find(b => JSON.parse(b.dataset.omitIds).includes(targets[0].id));
    choose(button);
    return true;
  };
  const stop = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  const keys = e => {
    if (blocked() || e.isComposing) return;
    const current = marker();
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      if (current && ['ArrowRight', 'Enter', ' '].includes(e.key)) { stop(e); restore(current); return; }
      const direction = ['ArrowDown','j'].includes(e.key) ? 1 : ['ArrowUp','k'].includes(e.key) ? -1 : 0;
      if (direction) {
        const visible = [...(root()?.children || [])].filter(n => n.matches('.editable,.craft-omit-marker') && n.offsetParent !== null);
        const active = current || qs(SOLVEIT.sel.primaryCell);
        const index = visible.indexOf(active), next = visible[index + direction];
        if (current || next?.matches('.craft-omit-marker')) { stop(e); choose(next, direction); return; }
      }
      if (current && ['Home','End'].includes(e.key)) {
        const visible = [...root().children].filter(n => n.matches('.editable,.craft-omit-marker') && n.offsetParent !== null);
        stop(e); choose(e.key === 'Home' ? visible[0] : visible.at(-1)); return;
      }
    }
    if (current && e.key !== 'Tab') stop(e);
  };
  const pointer = e => { if (marker() && !e.target.closest('.craft-omit-marker')) marker().blur(); };
  const ac = new AbortController();
  const offDom = onCells(() => sync(), {attrs: ['class', 'hidden', 'data-sm-header']});
  on(document, {keydown: keys, pointerdown: pointer}, {capture: true, signal: ac.signal});
  window.__hotkeyRegister?.({id: 'cell-omit', label: 'Toggle omit cells', group: 'Dialog · Presentation', combo: 'u', handler: () => window.craftOmit?.toggle() === true});
  window.craftOmit = {
    toggle, sync,
    disable() {
      offDom();
      ac.abort();
      markers.forEach(b => b.remove());
      cells().forEach(e => e.classList.remove('craft-omitted'));
      window.craftCellChains?.sync();
    }
  };
  sync();
})();

/* %% nbs/craft/07_cell_presentation.ipynb #0ef67c86 */
(() => {
  window.craftParts?.disable();
  if (!window.__craftCMCore.features.init('cell-parts', 'Three-state part minimize', 'Cycle input/output between expanded, collapsed, and hidden')) return;
  const states = new Map(), controls = new Map(), pending = new Map();
  const originals = window.solveitHotkeys?.list().filter(s => ['si-i','si-o'].includes(s.id)) || [];
  let bypass = false;
  const {qs, qsa, on, onCells, notify, SOLVEIT} = window.__craftCMCore;
  const cells = () => qsa(SOLVEIT.sel.cell);
  const card = (e, side) => e.querySelector(side === 'input' ? SOLVEIT.sel.cardIn : SOLVEIT.sel.cardOut);
  const button = (e, side) => card(e, side)?.querySelector(SOLVEIT.sel.collapseBtn);
  const present = (e, side) => side === 'input' ? !!card(e, side) : !!card(e, side)?.querySelector(SOLVEIT.sel.msgBody);
  const blocked = () => window.__craftCMCore.typingBlocked();
  const busy = e => e.dataset.editing === 'true' || e.dataset.c2Editing === 'true' || e.dataset.mdEditing === 'true';
  const waiting = (e, side) => {
    const key = e.id + side, p = pending.get(key);
    if (p && (p.collapsed !== !!card(e, side)?.classList.contains('collapsed') || performance.now() > p.until)) pending.delete(key);
    return pending.has(key);
  };
  const native = (e, side) => {
    const b = button(e, side);
    if (!b || waiting(e, side)) return;
    const selection = cells().map(n => [n, n.getAttribute('data-sm')]);
    window.selectMsg(window.$(e), {scroll: false});
    pending.set(e.id + side, {collapsed: !!card(e, side)?.classList.contains('collapsed'), until: performance.now() + 5000});
    bypass = true;
    try { b.click(); }
    finally {
      bypass = false;
      selection.forEach(([n, value]) => value === null ? n.removeAttribute('data-sm') : n.setAttribute('data-sm', value));
    }
  };
  const restore = (id, side) => {
    const state = states.get(id), e = document.getElementById(id);
    if (!state || !e) return;
    state.hidden.delete(side);
    if (!state.hidden.size) states.delete(id);
    sync();
    if (card(e, side)?.classList.contains('collapsed')) native(e, side);
    window.selectMsg(window.$(e), {scroll: false});
  };
  const restoreCell = id => {
    const state = states.get(id);
    if (state) restore(id, state.last);
  };
  const fullyHidden = e => {
    const state = states.get(e.id);
    return !!state && ['input','output'].filter(s => present(e, s)).every(s => state.hidden.has(s));
  };
  const focusMarker = id => {
    const b = [...document.querySelectorAll('.craft-omit-marker')].find(n => JSON.parse(n.dataset.omitIds).includes(id));
    b?.focus({preventScroll: true});
  };
  const sync = () => {
    const live = new Set();
    for (const e of cells()) {
      const state = states.get(e.id), full = fullyHidden(e);
      for (const side of ['input','output']) {
        const c = card(e, side), hidden = !!state?.hidden.has(side), key = e.id + ':' + side;
        if (c && c.classList.contains('craft-part-hidden') !== hidden) c.classList.toggle('craft-part-hidden', hidden);
        if (!hidden || !c || full) continue;
        live.add(key);
        let b = controls.get(key);
        if (!b) {
          b = window.__craftCMCore.el('button', {
            type: 'button', cls: 'craft-part-restore', title: `Restore ${side}`,
            'aria-label': `Restore ${side}`, onClick: () => restore(e.id, side),
          }, side === 'input' ? '⌃' : '⌄');
          controls.set(key, b);
        }
        if (side === 'input') {
          const output = card(e, 'output');
          if (output && b.nextElementSibling !== output) output.before(b);
        } else if (b.previousElementSibling !== card(e, 'input')) card(e, 'input')?.after(b);
      }
    }
    for (const [key, b] of controls) if (!live.has(key)) { b.remove(); controls.delete(key); }
    window.craftOmit?.sync();
  };
  const cycleOne = (e, side) => {
    if (!present(e, side) || waiting(e, side)) return;
    if (busy(e)) {
      notify('Finish editing before minimizing this cell.', {status: 'warning'});
      return;
    }
    const state = states.get(e.id);
    if (state?.hidden.has(side)) { restore(e.id, side); return; }
    if (!card(e, side).classList.contains('collapsed')) { native(e, side); return; }
    const next = state || {hidden: new Set(), last: side};
    next.hidden.add(side);
    next.last = side;
    states.set(e.id, next);
    sync();
    if (fullyHidden(e)) focusMarker(e.id);
  };
  const cycle = side => {
    if (blocked()) return false;
    const marker = document.activeElement?.closest('.craft-omit-marker');
    if (marker) {
      for (const id of JSON.parse(marker.dataset.omitIds)) if (states.get(id)?.hidden.has(side)) restore(id, side);
      return true;
    }
    const selected = cells().filter(e => e.matches(SOLVEIT.sel.selectedCell) && e.offsetParent !== null);
    selected.forEach(e => cycleOne(e, side));
    return !!selected.length;
  };
  const click = event => {
    if (bypass) return;
    const b = event.target.closest(SOLVEIT.sel.collapseBtn);
    const c = b?.closest('.msg-card'), e = c?.closest('.editable');
    if (!e) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cycleOne(e, c.classList.contains('card-in') ? 'input' : 'output');
  };
  const finished = event => {
    const b = event.detail?.elt?.closest?.(SOLVEIT.sel.collapseBtn);
    const c = b?.closest('.msg-card'), e = c?.closest('.editable');
    if (e) pending.delete(e.id + (c.classList.contains('card-in') ? 'input' : 'output'));
  };
  const ac = new AbortController();
  const offDom = onCells(() => sync(), {attrs: ['class']});
  on(document, 'click', click, {capture: true, signal: ac.signal});
  on(document, 'htmx:afterRequest', finished, {signal: ac.signal});
  window.__hotkeyRegister?.({id: 'si-i', label: 'Cycle input: expanded / collapsed / hidden', group: 'Solveit · Dialog (selection mode)', combo: 'i', handler: () => cycle('input')});
  window.__hotkeyRegister?.({id: 'si-o', label: 'Cycle output: expanded / collapsed / hidden', group: 'Solveit · Dialog (selection mode)', combo: 'o', handler: () => cycle('output')});
  window.craftParts = {
    cycle, sync, fullyHidden, restoreCell,
    disable() {
      offDom();
      ac.abort();
      controls.forEach(b => b.remove());
      states.clear();
      qsa('.craft-part-hidden').forEach(c => c.classList.remove('craft-part-hidden'));
      originals.forEach(s => window.__hotkeyRegister?.({...s, handler: () => true}));
      window.craftOmit?.sync();
    }
  };
  sync();
})();

/* %% nbs/craft/08_tables.ipynb #abdf09dd */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"table_wrap": "<div class=\"craft-table-wrap\" tabindex=\"0\" role=\"region\" aria-label=\"Scrollable table\"></div>", "table_copy_btn": "<button type=\"button\" class=\"craft-table-copy\" aria-label=\"Copy table as TSV\">Copy TSV</button>"});

/* %% nbs/craft/08_tables.ipynb #7e6edaa3 */
/* ── Progressive table enhancer (wrap, numeric align, flat-table sort, copy TSV) ── */
(() => {
  window.craftTables?.disable?.();
  if (!window.__craftCMCore.features.init('tables', 'Progressive tables', 'Scroll wrapper, numeric align, sort, and Copy TSV')) return;
  const {mountTpl, onCells, SOLVEIT} = window.__craftCMCore;
  const NUM_RE = /^[-+\u2212]?[$€£¥]?\s*\d[\d,_]*(?:\.\d+)?(?:[eE][+-]?\d+)?%?$/;
  const EMPTY_RE = /^(?:|nan|na|n\/a|null|none|-|\u2014)$/i;
  const parseNum = s => {
    const t = s.trim();
    if (!t || EMPTY_RE.test(t)) return null;
    if (!NUM_RE.test(t)) return NaN;
    return parseFloat(t.replace(/[\u2212]/g, '-').replace(/[$€£¥,\s_%]/g, ''));
  };

  const enhanceTable = tbl => {
    if (!tbl || tbl.dataset.craftTable) return;
    tbl.dataset.craftTable = '1';
    tbl.classList.add('uk-table', 'uk-table-small', 'uk-table-divider', 'uk-table-hover');

    // 1. Wrap in a keyboard-scrollable container if not already wrapped
    let wrap = tbl.parentElement;
    if (!wrap?.classList.contains('craft-table-wrap')) {
      wrap = mountTpl('table_wrap');
      tbl.parentNode.insertBefore(wrap, tbl);
      wrap.appendChild(tbl);
    }

    const headRows = [...tbl.querySelectorAll(':scope > thead > tr')];
    const tbody = tbl.querySelector(':scope > tbody');
    const bodyRows = tbody ? [...tbody.querySelectorAll(':scope > tr')] : [];
    const hasSpans = [...tbl.querySelectorAll('th, td')].some(c => c.colSpan > 1 || c.rowSpan > 1);

    // 2. Detect numeric columns and right-align both header and cells
    if (!hasSpans && bodyRows.length) {
      const sample = bodyRows.slice(0, 40);
      const colCount = sample[0].children.length;
      const headCells = headRows.length === 1 ? [...headRows[0].children] : null;
      for (let col = 0; col < colCount; col++) {
        let numHits = 0, nonEmpty = 0;
        for (const row of sample) {
          const cell = row.children[col];
          if (!cell || cell.tagName === 'TH') continue;
          const v = parseNum(cell.textContent || '');
          if (v === null) continue;
          nonEmpty++;
          if (!Number.isNaN(v)) numHits++;
        }
        if (nonEmpty > 0 && numHits === nonEmpty) {
          for (const row of bodyRows) row.children[col]?.classList.add('craft-num');
          if (headCells && headCells[col]) headCells[col].classList.add('craft-num');
        }
      }
    } else if (hasSpans && bodyRows.length) {
      // MultiIndex: align numeric <td> cells (and matching top-row headers) without disturbing rowspan
      for (const row of bodyRows) {
        for (const cell of row.children) {
          if (cell.tagName !== 'TD') continue;
          const v = parseNum(cell.textContent || '');
          if (v !== null && !Number.isNaN(v)) cell.classList.add('craft-num');
        }
      }
      if (headRows.length && headRows[0].children.length === bodyRows[0].children.length) {
        for (let col = 0; col < bodyRows[0].children.length; col++) {
          if (bodyRows[0].children[col]?.classList.contains('craft-num')) {
            headRows[0].children[col]?.classList.add('craft-num');
          }
        }
      }
    }

    // 3. Click/keyboard sort on flat tables (>= 2 rows, single header row, no spans)
    if (!hasSpans && headRows.length === 1 && bodyRows.length >= 2) {
      const origOrder = bodyRows.slice();
      const ths = [...headRows[0].children];
      ths.forEach((th, colIdx) => {
        if (!(th.textContent || '').trim()) return;
        th.classList.add('craft-sort');
        th.tabIndex = 0;
        th.setAttribute('aria-sort', 'none');
        const toggle = () => {
          const cur = th.getAttribute('aria-sort');
          const next = cur === 'ascending' ? 'descending' : cur === 'descending' ? 'none' : 'ascending';
          for (const other of ths) if (other !== th && other.classList.contains('craft-sort')) other.setAttribute('aria-sort', 'none');
          th.setAttribute('aria-sort', next);
          if (next === 'none') {
            tbody.append(...origOrder);
            return;
          }
          const dir = next === 'ascending' ? 1 : -1;
          const isNum = th.classList.contains('craft-num');
          const sorted = origOrder.slice().sort((a, b) => {
            const ta = (a.children[colIdx]?.textContent || '').trim();
            const tb = (b.children[colIdx]?.textContent || '').trim();
            if (isNum) {
              const na = parseNum(ta), nb = parseNum(tb);
              const va = (na === null || Number.isNaN(na)) ? Infinity : na;
              const vb = (nb === null || Number.isNaN(nb)) ? Infinity : nb;
              return (va - vb) * dir;
            }
            return ta.localeCompare(tb, undefined, { numeric: true, sensitivity: 'base' }) * dir;
          });
          tbody.append(...sorted);
        };
        th.addEventListener('click', toggle);
        th.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });
      });
    }

    // 4. Subtle Copy TSV button on output tables
    if (tbl.closest('.card-out') && !wrap.querySelector(':scope > .craft-table-copy')) {
      const btn = mountTpl('table_copy_btn');
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const rows = [...tbl.querySelectorAll('tr')].map(tr =>
          [...tr.children].map(c => (c.textContent || '').replace(/[\t\r\n]+/g, ' ').trim()).join('\t')
        ).join('\n');
        try {
          await navigator.clipboard.writeText(rows);
          btn.textContent = 'Copied';
          btn.classList.add('is-copied');
          setTimeout(() => { btn.textContent = 'Copy TSV'; btn.classList.remove('is-copied'); }, 1400);
        } catch {}
      });
      wrap.insertBefore(btn, tbl);
    }
  };

  const enhanceCells = cells => {
    for (const cell of cells) {
      for (const tbl of cell.querySelectorAll(`${SOLVEIT.sel.msgContent} table:not([data-craft-table])`)) enhanceTable(tbl);
    }
  };
  const enhanceAll = () => {
    for (const tbl of document.querySelectorAll(`${SOLVEIT.sel.dialog} ${SOLVEIT.sel.msgContent} table:not([data-craft-table])`)) {
      enhanceTable(tbl);
    }
  };
  let offDom = onCells(enhanceCells, {initial: true});
  window.craftTables = {
    enhance: enhanceAll,
    disable() {
      offDom?.();
      offDom = null;
    },
  };
})();

/* %% nbs/craft/09_cell_insertion.ipynb #99c8fe76 */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"insert_trigger": "<button id=\"craft-insert-preview\" class=\"craft-nav-icon-btn\" type=\"button\" hidden popovertarget=\"craft-insert-preview-menu\"></button>", "insert_menu": "<div class=\"craft-menu\" id=\"craft-insert-preview-menu\" popover=\"auto\"><small>New cell type</small><button type=\"button\" data-kind=\"Code\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 6l-6 6 6 6m8-12 6 6-6 6M14 4l-4 16\"></path></svg>Code</button><button type=\"button\" data-kind=\"Note\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 3h10l4 4v14H5z M15 3v5h4M8 12h8m-8 4h8\"></path></svg>Note</button><button type=\"button\" data-kind=\"Raw\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 5h18v14H3z M7 9v6\"></path></svg>Raw</button><button type=\"button\" data-kind=\"Prompt\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 4h18v12H9l-6 4z M7 10h.01m5 0h.01m5 0h.01\"></path></svg>Prompt</button></div>", "desk_edge_below": "<button type=\"button\" class=\"craft-desk-edge\" data-edge=\"below\" aria-label=\"Insert cell below (drag to pick type)\"><span class=\"craft-desk-edge-pill\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"12\" height=\"12\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 6v12M6 12h12\"></path></svg><span class=\"craft-desk-edge-kind\"></span></span></button>", "desk_picker": "<div id=\"craft-desk-picker\" class=\"craft-type-picker\" popover=\"auto\" role=\"menu\"><div class=\"craft-type-picker-head craft-desk-picker-head\"></div><div class=\"craft-type-picker-opts craft-desk-picker-opts\"><button class=\"uk-btn uk-btn-default uk-btn-sm\" role=\"menuitem\" data-type=\"Code\" type=\"button\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 6l-6 6 6 6m8-12 6 6-6 6M14 4l-4 16\"></path></svg><span>Code</span><kbd>C</kbd></button><button class=\"uk-btn uk-btn-default uk-btn-sm\" role=\"menuitem\" data-type=\"Note\" type=\"button\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 3h10l4 4v14H5z M15 3v5h4M8 12h8m-8 4h8\"></path></svg><span>Note</span><kbd>N</kbd></button><button class=\"uk-btn uk-btn-default uk-btn-sm\" role=\"menuitem\" data-type=\"Prompt\" type=\"button\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 4h18v12H9l-6 4z M7 10h.01m5 0h.01m5 0h.01\"></path></svg><span>Prompt</span><kbd>P</kbd></button><button class=\"uk-btn uk-btn-default uk-btn-sm\" role=\"menuitem\" data-type=\"Raw\" type=\"button\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 5h18v14H3z M7 9v6\"></path></svg><span>Raw</span><kbd>R</kbd></button></div></div>", "optimistic_cell": "<div class=\"editable craft-opt-cell\" data-craft-optimistic=\"1\"><div class=\"uk-card uk-card-default msg-card card-in\"><div class=\"msg-body\"><div class=\"msg-content\"></div></div><form hidden><textarea name=\"content\"></textarea></form></div></div>", "empty_add": "<div id=\"craft-empty-add\"><span class=\"craft-empty-add-label\">Empty dialog — press a/b or add your first cell</span><div class=\"craft-empty-add-btns\"><button class=\"uk-btn uk-btn-default uk-btn-sm\" data-type=\"Code\" type=\"button\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 6l-6 6 6 6m8-12 6 6-6 6M14 4l-4 16\"></path></svg><span>Code</span></button><button class=\"uk-btn uk-btn-default uk-btn-sm\" data-type=\"Note\" type=\"button\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 3h10l4 4v14H5z M15 3v5h4M8 12h8m-8 4h8\"></path></svg><span>Note</span></button><button class=\"uk-btn uk-btn-default uk-btn-sm\" data-type=\"Prompt\" type=\"button\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 4h18v12H9l-6 4z M7 10h.01m5 0h.01m5 0h.01\"></path></svg><span>Prompt</span></button><button class=\"uk-btn uk-btn-default uk-btn-sm\" data-type=\"Raw\" type=\"button\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 5h18v14H3z M7 9v6\"></path></svg><span>Raw</span></button></div></div>", "cell_icon_Code": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 6l-6 6 6 6m8-12 6 6-6 6M14 4l-4 16\"></path></svg>", "cell_icon_Note": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 3h10l4 4v14H5z M15 3v5h4M8 12h8m-8 4h8\"></path></svg>", "cell_icon_Raw": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 5h18v14H3z M7 9v6\"></path></svg>", "cell_icon_Prompt": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 4h18v12H9l-6 4z M7 10h.01m5 0h.01m5 0h.01\"></path></svg>", "desk_icon_Code": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"11\" height=\"11\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 6l-6 6 6 6m8-12 6 6-6 6M14 4l-4 16\"></path></svg>", "desk_icon_Note": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"11\" height=\"11\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 3h10l4 4v14H5z M15 3v5h4M8 12h8m-8 4h8\"></path></svg>", "desk_icon_Raw": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"11\" height=\"11\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 5h18v14H3z M7 9v6\"></path></svg>", "desk_icon_Prompt": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"11\" height=\"11\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 4h18v12H9l-6 4z M7 10h.01m5 0h.01m5 0h.01\"></path></svg>"});
window.__craftCfg = Object.assign(window.__craftCfg || {}, {"cell_types": ["Code", "Note", "Prompt", "Raw"], "key_to_type": {"c": "Code", "n": "Note", "p": "Prompt", "r": "Raw"}, "slash_map": {"c": "Code", "code": "Code", "n": "Note", "note": "Note", "p": "Prompt", "prompt": "Prompt", "r": "Raw", "raw": "Raw"}});

/* %% nbs/craft/09_cell_insertion.ipynb #6d845b7d */
(() => {
  window.craftInsertPreview?.disable();
  if (!window.__craftCMCore.features.init('insert-preview', 'Insert type picker', 'Typed A/B optimistic cell insertion')) return;
  if (!window.__craftCMCore.qs(window.__craftCMCore.SOLVEIT.sel.dialog)) return;
  const types = {Code: 1, Note: 1, Raw: 1, Prompt: 1};
  const icon = name => window.__craftTpl?.[`cell_icon_${name}`] || '';
  const key = 'craft-insert-preview:v1:' + (new URLSearchParams(location.search).get('name') || location.pathname);
  const {mountTpl, qs, qsa, on, store, patch, onDomChange, SOLVEIT, allCells} = window.__craftCMCore;
  const ac = new AbortController(), sig = {signal: ac.signal}, cap = {capture: true, signal: ac.signal};
  const trigger = mountTpl('insert_trigger'), menu = mountTpl('insert_menu'), emptyAdd = mountTpl('empty_add');
  let current;
  const select = name => {
    current = name;
    const title = `A/B inserts: ${name}`;
    patch(trigger, {innerHTML: icon(name), title, 'aria-label': title});
    for (const option of qsa('button', menu)) option.setAttribute('aria-pressed', String(option.dataset.kind === name));
  };
  const saved = store.get(key);
  select(Object.hasOwn(types, saved) ? saved : document.getElementById('default_code')?.checked ? 'Code' : 'Prompt');
  let scroller;
  const sync = () => {
    const next = qs(SOLVEIT.sel.dialog);
    if (scroller !== next) {
      scroller?.classList.remove('craft-insert-preview');
      scroller = next;
      trigger.hidden = !scroller;
      scroller?.classList.add('craft-insert-preview');
      window.craftMobile?.reposition?.();
    }
    if (scroller && !emptyAdd.isConnected) scroller.append(emptyAdd);
    else if (!scroller && emptyAdd.isConnected) emptyAdd.remove();
  };
  const choose = name => {
    select(name);
    store.set(key, name);
  };
  const activeCells = () => allCells().filter(el => el.matches(SOLVEIT.sel.selectedCell) && el.getClientRects().length);
  const cellType = el => el?.querySelector(SOLVEIT.sel.cardInType)?.dataset.mtype;
  const notify = error => {
    console.error('CRAFT insertion:', error);
    window.__craftCMCore.notify(error.message, {status: 'danger'});
  };
  const waitFor = (check, timeout = 5000) => {
    if (ac.signal.aborted) return Promise.resolve(null);
    const immediate = check();
    if (immediate) return Promise.resolve(immediate);
    return new Promise(resolve => {
      let done = false;
      const onAbort = () => finish(null);
      const finish = val => {
        if (done) return;
        done = true;
        ac.signal.removeEventListener('abort', onAbort);
        offDomWait();
        clearInterval(tick);
        clearTimeout(cap);
        resolve(val);
      };
      const probe = () => { const r = check(); if (r) finish(r); };
      ac.signal.addEventListener('abort', onAbort, {once: true});
      const offDomWait = onDomChange(probe, {attrs: ['data-mtype', 'class', 'hidden', 'data-editing'], delay: 0});
      const tick = setInterval(probe, 100);
      const cap = setTimeout(() => finish(null), timeout);
    });
  };
  const setType = async (id, type) => {
    if (cellType(document.getElementById(id)) !== type) {
      await window.__craftCMCore.htmxPost(SOLVEIT.api.setMtyp, {id_: id, ids: id, mtyp: type});
      if (!(await waitFor(() => cellType(document.getElementById(id)) === type))) throw new Error(`Could not switch cell to ${type}.`);
    }
  };
  const blocked = () => window.__craftCMCore.typingBlocked('.cm-editor,#craft-insert-preview-menu');
  let busy = false;
  const execute = action => {
    if (!busy) {
      busy = true;
      Promise.resolve().then(action).catch(notify).finally(() => { busy = false; });
    }
    return true;
  };
  const mode = name => {
    if (blocked()) return false;
    choose(name);
    const cells = activeCells();
    if (cells.length !== 1) return true;
    return execute(async () => {
      let id = cells[0].id;
      if (window.__craftCMCore.optimistic?.isOptimistic?.(id)) {
        const realId = await window.__craftCMCore.optimistic.waitForReal(id);
        if (!realId) return;
        id = '_' + realId;
      }
      await setType(id, name.toLowerCase());
    });
  };
  let optSeq = 0;
  let serverQueue = Promise.resolve();
  const isRealCell = el => Boolean(el?.id && !el.dataset.craftOptimistic);
  const realCells = () => allCells().filter(isRealCell);

  // opts.type ('Code'|'Note'|'Prompt'|'Raw') overrides the picker; opts.cell targets a cell other than the
  // selection; opts.force skips the focus guard (the mobile toolbar has already closed any editor).
  const insert = (where, opts = {}) => {
    if (!opts.force && blocked()) return false;
    const primary = opts.cell || activeCells().find(el => el.dataset.sm === 'primary');
    const isFirst = !primary && allCells().length === 0;
    if (!primary && !isFirst) return true;
    const addSel = `[hx-post="${where === 'above' ? SOLVEIT.api.addAbove : SOLVEIT.api.addBelow}"]`;
    if (primary && !primary.dataset.craftOptimistic && !primary.querySelector(addSel)) return true;
    const container = qs(SOLVEIT.sel.dialog);
    if (isFirst && !container) return true;
    const name = Object.hasOwn(types, opts.type || '') ? opts.type : current;
    const type = name.toLowerCase();
    const CORE = window.__craftCMCore;
    const optId = 'craftopt_' + (++optSeq);
    const optEl = mountTpl('optimistic_cell');
    optEl.id = '_' + optId;
    const optCard = optEl.querySelector(SOLVEIT.sel.cardIn);
    if (optCard) optCard.dataset.mtype = type;
    if (isFirst) container.append(optEl); else if (where === 'above') primary.before(optEl); else primary.after(optEl);
    window.selectMsg?.(window.$(optEl), {scroll: false});
    optEl.scrollIntoView({block: 'nearest'});

    let resolveOpt;
    const optPromise = new Promise(r => { resolveOpt = r; });
    CORE.optimistic.register(optId, optPromise);

    const openP = type === 'code'
      ? Promise.resolve(window.craftC2?.edit?.(optId, {anchor: 0, head: 0}))
      : Promise.resolve(window.craftMd?.edit?.(optId, {toEnd: true}));

    const runSync = async () => {
      const releaseAutoEdit = CORE.optimistic.suppressAutoEdit();
      let oldReal = new Set();
      let realDomId = null;
      const hidden = new Set();
      const hideIncoming = () => {
        for (const c of realCells()) {
          if (!oldReal.has(c.id)) {
            if (!c.classList.contains('craft-opt-hidden')) c.classList.add('craft-opt-hidden');
            hidden.add(c);
          }
        }
      };
      let offHide = null;
      try {
        if (isFirst) {
          oldReal = new Set(realCells().map(el => el.id));
          offHide = onDomChange(hideIncoming, {delay: 0, inDialog: true});
          await CORE.htmxPost(SOLVEIT.api.upsertMsg, {id_: '', msg_type: type, is_input: '1', content: ' '});
        } else {
          let anchorEl = primary;
          if (primary.dataset.craftOptimistic) {
            const anchorRealId = await CORE.optimistic.waitForReal(primary.id);
            if (!anchorRealId) throw new Error(`Could not confirm ${name} insertion.`);
            anchorEl = document.getElementById('_' + anchorRealId);
          }
          const button = anchorEl?.querySelector(addSel);
          if (!button) throw new Error(`Could not confirm ${name} insertion.`);
          oldReal = new Set(realCells().map(el => el.id));
          offHide = onDomChange(hideIncoming, {delay: 0, inDialog: true});
          button.dispatchEvent(new MouseEvent('click', {bubbles: false}));
        }
        realDomId = await waitFor(() => {
          hideIncoming();
          return realCells().find(el => !oldReal.has(el.id))?.id;
        });
        if (!realDomId) throw new Error(`Could not confirm ${name} insertion.`);
        hideIncoming();
        if (cellType(document.getElementById(realDomId)) !== type) await setType(realDomId, type);
        const realEl = document.getElementById(realDomId);
        if (!realEl) throw new Error(`Could not confirm ${name} insertion.`);
        if (realEl.dataset.editing) delete realEl.dataset.editing;
        await openP;
        const realNormId = CORE.normId(realDomId);
        const realCard = realEl.querySelector(SOLVEIT.sel.cardIn);
        const editorApi = type === 'code' ? window.craftC2 : window.craftMd;
        const optKey = type === 'code' ? optId : `${optId}:in`;
        const realKey = type === 'code' ? realNormId : `${realNormId}:in`;
        const hadView = Boolean(editorApi?.view?.(optKey));
        realEl.classList.remove('craft-opt-hidden');
        hidden.delete(realEl);
        if (hadView) {
          editorApi.rekey(optId, realNormId, {el: realEl, card: realCard});
        } else {
          window.selectMsg?.(window.$(realEl), {scroll: false});
        }
        optEl.remove();
        CORE.optimistic.resolve(optId, realNormId);
        resolveOpt(realNormId);
        if (hadView && editorApi.active?.() === realKey) {
          window.selectMsg?.(window.$(realEl), {scroll: false});
        }
      } catch (err) {
        for (const c of hidden) c.classList.remove('craft-opt-hidden');
        const editorApi = type === 'code' ? window.craftC2 : window.craftMd;
        const optKey = type === 'code' ? optId : `${optId}:in`;
        const v = editorApi?.view?.(optKey);
        const draft = v ? v.state.doc.toString() : '';
        CORE.optimistic.fail(optId);
        resolveOpt(null);
        editorApi?.abortOptimistic?.(optId);
        optEl.remove();
        CORE.optimistic.clear(optId);
        if (primary?.isConnected) window.selectMsg?.(window.$(primary), {scroll: false});
        let copied = false;
        if (draft.trim() && navigator.clipboard?.writeText) {
          try { await navigator.clipboard.writeText(draft); copied = true; } catch {}
        }
        const msg = copied ? `${err.message} Your draft was copied to the clipboard.` : err.message;
        notify(new Error(msg));
      } finally {
        offHide?.();
        for (const c of hidden) c.classList.remove('craft-opt-hidden');
        releaseAutoEdit();
      }
    };
    serverQueue = serverQueue.then(runSync, runSync);
    return true;
  };
  const defs = [
    ['si-a', 'a', 'Add message above', () => insert('above')],
    ['si-b', 'b', 'Add message below', () => insert('below')],
    ...['Code','Note','Prompt','Raw'].map((name,i) => [`si-mode-${name.toLowerCase()}`, `Mod+Shift+${'JKL;'[i]}`, `Switch message to ${name.toLowerCase()}`, () => mode(name)]),
  ].map(([id,combo,label,handler]) => ({id,combo,label,handler,group:'Solveit · Dialog (selection mode)'}));
  const registerBindings = () => defs.forEach(spec => window.__hotkeyRegister?.(spec));
  const builtins = qs('script[data-solveit-hotkeys="builtins"]');
  on(builtins, 'load', registerBindings, {once: true, signal: ac.signal});
  registerBindings();
  on(menu, 'click', e => {
    const option = e.target.closest('button[data-kind]');
    if (!option) return;
    choose(option.dataset.kind);
    menu.hidePopover(); trigger.focus();
  }, sig);
  document.body.append(trigger, menu);
  on(emptyAdd, 'click', e => {
    const opt = e.target.closest('button[data-type]');
    if (!opt) return;
    e.preventDefault(); e.stopPropagation();
    insert('below', {type: opt.dataset.type, force: true});
  }, sig);
  const KIND_MAP = {code: 'Code', note: 'Note', prompt: 'Prompt', raw: 'Raw'};
  const onHtmxConfig = e => {
    const path = e.detail?.path || '';
    const mtyp = e.detail?.parameters?.mtyp || e.detail?.parameters?.msg_type;
    if ((path.startsWith(SOLVEIT.api.setMtyp) || path.startsWith(SOLVEIT.api.upsertMsg)) && mtyp && KIND_MAP[String(mtyp).toLowerCase()]) {
      choose(KIND_MAP[String(mtyp).toLowerCase()]);
    }
  };
  on(document, 'htmx:configRequest', onHtmxConfig, sig);
  const offDom = onDomChange(sync, {delay: 0});
  window.craftInsertPreview = {
    insert: (where, opts) => insert(where, opts),
    choose,
    setType,
    type: () => current,
    isBusy: () => busy,
    disable() {
    ac.abort();
    offDom();
    defs.forEach(spec => window.__hotkeyRegister?.({...spec, builtin:true, handler:() => true}));
    scroller?.classList.remove('craft-insert-preview');
    trigger.remove(); menu.remove(); emptyAdd.remove(); delete window.craftInsertPreview;
  }};
  sync();
})();

/* %% nbs/craft/09_cell_insertion.ipynb #55053b2e */
/* ── Desktop UX: hover-edge drag-to-insert, click-margin escape, Shift+A/B seam picker & slash-morph ── */
(() => {
  window.craftDesktopUX?.disable?.();
  if (!window.__craftCMCore.features.init('desktop-ux', 'Desktop insertion UX', 'Hover-edge drag handle, Shift+A/B seam picker, slash-morph')) return;
  const {mountTpl, qs, on, SOLVEIT} = window.__craftCMCore;
  if (!qs(SOLVEIT.sel.dialog)) return;
  const ac = new AbortController(), sig = {signal: ac.signal}, cap = {capture: true, signal: ac.signal};
  const isMobile = () => !!window.craftMobile?.active?.();
  const dialog = () => qs(SOLVEIT.sel.dialog);
  const CELL_TYPES = window.__craftCfg?.cell_types || ['Code', 'Note', 'Prompt', 'Raw'];
  const KEY_TO_TYPE = window.__craftCfg?.key_to_type || {c: 'Code', n: 'Note', p: 'Prompt', r: 'Raw'};
  const SLASH_RE = /^\/(c|code|n|note|p|prompt|r|raw)[ \t\n]$/i;
  const SLASH_MAP = window.__craftCfg?.slash_map || {c: 'Code', code: 'Code', n: 'Note', note: 'Note', p: 'Prompt', prompt: 'Prompt', r: 'Raw', raw: 'Raw'};
  /* Bottom hover-edge + handle on desktop (shown when hovering near bottom-center) */
  const hBelow = mountTpl('desk_edge_below');
  const syncHandleKinds = () => {
    const t = window.craftInsertPreview?.type?.() || 'Code';
    const k = hBelow.querySelector('.craft-desk-edge-kind');
    if (k) k.innerHTML = window.__craftTpl?.[`desk_icon_${t}`] || window.__craftTpl?.desk_icon_Code || '';
    hBelow.title = `Click to insert ${t} below · Drag to choose type`;
  };

  /* Shared 4-option fan picker for both drag-to-insert and Shift+A/B */
  const picker = mountTpl('desk_picker');
  document.body.append(picker);

  let hostCell = null, pState = null; // {edge, cell, pointerId, startX, startY, dragged, hotType, keyMode}
  const detachHandles = () => {
    hostCell?.classList.remove('craft-desk-host');
    hBelow.remove();
    hostCell = null;
  };
  const attachHandles = cell => {
    if (isMobile() || !cell?.isConnected) { detachHandles(); return; }
    if (cell === hostCell) { syncHandleKinds(); return; }
    detachHandles();
    hostCell = cell;
    cell.classList.add('craft-desk-host');
    syncHandleKinds();
    cell.append(hBelow);
  };
  const setHot = type => {
    if (pState) pState.hotType = type;
    for (const b of picker.querySelectorAll('button[data-type]')) {
      b.toggleAttribute('data-hot', b.dataset.type === type);
    }
  };
  const closePicker = () => {
    hBelow.removeAttribute('data-active');
    if (picker.matches(':popover-open')) picker.hidePopover();
    setHot(null);
    pState = null;
  };
  const positionPicker = (anchorRect, edge, hint) => {
    picker.querySelector('.craft-desk-picker-head').textContent = hint || (edge === 'above' ? 'Insert above' : 'Insert below');
    if (!picker.matches(':popover-open')) picker.showPopover();
    const pw = picker.offsetWidth || 270, ph = picker.offsetHeight || 68;
    const cx = anchorRect.left + anchorRect.width / 2;
    const left = Math.max(8, Math.min(cx - pw / 2, innerWidth - pw - 8));
    let top;
    if (edge === 'above') {
      const aboveTop = anchorRect.top - ph - 10;
      top = aboveTop >= 8 ? aboveTop : Math.min(anchorRect.bottom + 10, innerHeight - ph - 8);
    } else {
      const belowTop = anchorRect.bottom + 10;
      top = (belowTop + ph <= innerHeight - 8) ? belowTop : Math.max(8, anchorRect.top - ph - 10);
    }
    picker.style.left = Math.round(left) + 'px';
    picker.style.top = Math.round(top) + 'px';
  };
  const hitOpt = (x, y) => {
    const PAD = 8;
    for (const b of picker.querySelectorAll('button[data-type]')) {
      const r = b.getBoundingClientRect();
      if (x >= r.left - PAD && x <= r.right + PAD && y >= r.top - PAD && y <= r.bottom + PAD) return b.dataset.type;
    }
    return null;
  };
  async function commitEditors() {
    if (window.craftC2?.active?.()) await window.craftC2.exit();
    if (window.craftMd?.active?.()) await window.craftMd.exit();
  }
  async function doInsert(edge, cell, type) {
    if (type) window.craftInsertPreview?.choose?.(type);
    syncHandleKinds();
    await commitEditors();
    window.craftInsertPreview?.insert?.(edge, {type: type || window.craftInsertPreview?.type?.(), cell, force: true});
  }

  const onHandleDown = e => {
    if (isMobile() || e.button !== 0) return;
    const handle = e.currentTarget;
    const cell = handle.closest(SOLVEIT.sel.cellWithId);
    if (!cell) return;
    e.preventDefault(); e.stopPropagation();
    closePicker();
    const edge = handle.dataset.edge;
    handle.dataset.active = 'true';
    handle.setPointerCapture?.(e.pointerId);
    pState = {edge, cell, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, dragged: false, hotType: null, keyMode: false};
  };
  const onHandleMove = e => {
    if (!pState || e.pointerId !== pState.pointerId || pState.keyMode) return;
    const dist = Math.hypot(e.clientX - pState.startX, e.clientY - pState.startY);
    if (!pState.dragged && dist > 6) {
      pState.dragged = true;
      positionPicker(e.currentTarget.getBoundingClientRect(), pState.edge, `Drop to insert ${pState.edge} & set default`);
    }
    if (pState.dragged) setHot(hitOpt(e.clientX, e.clientY));
  };
  const onHandleUp = e => {
    if (!pState || e.pointerId !== pState.pointerId || pState.keyMode) return;
    const {edge, cell, dragged, hotType} = pState;
    closePicker();
    if (!dragged) doInsert(edge, cell, null);
    else if (hotType) doInsert(edge, cell, hotType);
  };
  const onHandleCancel = e => { if (pState && e.pointerId === pState.pointerId) closePicker(); };
  const onHandleClick = e => { e.preventDefault(); e.stopPropagation(); };
  on(hBelow, {pointerdown: onHandleDown, pointermove: onHandleMove, pointerup: onHandleUp, pointercancel: onHandleCancel, click: onHandleClick}, sig);
  const onPickerClick = e => {
    const b = e.target.closest('button[data-type]');
    if (!b || !pState) return;
    e.preventDefault(); e.stopPropagation();
    const {edge, cell} = pState;
    closePicker();
    doInsert(edge, cell, b.dataset.type);
  };
  on(picker, 'click', onPickerClick, sig);
  on(picker, 'toggle', e => { if (e.newState === 'closed' && pState) closePicker(); }, sig);

  /* Attach bottom hover-edge handle to the hovered cell on desktop (CSS :hover reveals the pill) */
  const onDialogOver = e => {
    if (isMobile() || pState) return;
    const cell = e.target instanceof Element ? e.target.closest(SOLVEIT.sel.cellWithId) : null;
    if (cell && cell !== hostCell) attachHandles(cell);
  };
  const onDialogLeave = () => { if (!pState) detachHandles(); };
  on(dialog(), 'mouseover', onDialogOver, sig);
  on(dialog(), 'mouseleave', onDialogLeave, sig);

  /* Click-margin / click-header to escape active inline editors on desktop */
  const onDocMouseDown = e => {
    if (isMobile()) return;
    if (e.button !== 0) return;
    const hasEd = !!(window.craftC2?.active?.() || window.craftMd?.active?.());
    if (!hasEd) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest('#solveit-file-tree-panel, #solveit-temp-editor, #solveit-launcher, .craft-action-menu, #craft-desk-picker, .craft-desk-edge, .cm-editor, .cm-tooltip, .uk-modal, .uk-dropdown, .uk-drop, nav.monster-navbar')) return;
    const inDialog = t.closest(SOLVEIT.sel.dialog);
    if (!inDialog) return;
    const inCell = t.closest(SOLVEIT.sel.cellWithId);
    const onHeaderBlank = inCell && t.closest(SOLVEIT.sel.cardHeader) && !t.closest('button, a, input, select');
    if (!inCell || onHeaderBlank) {
      commitEditors();
    }
  };
  on(document, 'mousedown', onDocMouseDown, cap);

  /* Shift+A / Shift+B inline seam quick-picker in selection mode */
  const blocked = () => window.__craftCMCore.typingBlocked('.cm-editor');
  const onKeyDown = e => {
    if (isMobile() || e.isComposing) return;
    if (pState?.keyMode) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closePicker(); return; }
      const t = KEY_TO_TYPE[e.key.toLowerCase()];
      if (t && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); e.stopImmediatePropagation();
        const {edge, cell} = pState;
        closePicker();
        doInsert(edge, cell, t);
        return;
      }
      return;
    }
    if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'A' || e.key === 'B')) {
      if (blocked()) return;
      const cell = qs(SOLVEIT.sel.primaryCell);
      if (!cell) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const edge = e.key === 'A' ? 'above' : 'below';
      const r = cell.getBoundingClientRect();
      const seamRect = edge === 'above'
        ? {left: r.left, width: r.width, top: r.top, bottom: r.top}
        : {left: r.left, width: r.width, top: r.bottom, bottom: r.bottom};
      pState = {edge, cell, pointerId: null, startX: 0, startY: 0, dragged: false, hotType: null, keyMode: true};
      positionPicker(seamRect, edge, `Insert ${edge} · press C / N / P / R`);
    }
  };
  on(document, 'keydown', onKeyDown, cap);

  /* Slash-morph on empty cells: typing /c, /code, /n, /note, /p, /prompt, /r, /raw + Space/Enter morphs the cell */
  let morphing = false;
  const checkSlashMorph = () => {
    if (morphing || isMobile()) return;
    let id = null, view = null;
    const c2Id = window.craftC2?.active?.();
    if (c2Id) {
      view = window.craftC2.view(c2Id);
      if (view?.hasFocus) id = '_' + String(c2Id).replace(/^_/, '');
    }
    if (!id) {
      const mdKey = window.craftMd?.active?.();
      if (mdKey && mdKey.endsWith(':in')) {
        view = window.craftMd.view(mdKey);
        if (view?.hasFocus) id = '_' + mdKey.split(':')[0].replace(/^_/, '');
      }
    }
    if (!id || !view) return;
    const text = view.state.doc.toString();
    const m = SLASH_RE.exec(text);
    if (!m) return;
    const targetName = SLASH_MAP[m[1].toLowerCase()];
    const targetType = targetName.toLowerCase();
    const el = document.getElementById(id);
    const curType = el?.querySelector(SOLVEIT.sel.cardInType)?.dataset.mtype;
    if (!el || curType === targetType) return;
    morphing = true;
    view.dispatch({changes: {from: 0, to: text.length, insert: ''}});
    (async () => {
      try {
        await commitEditors();
        window.craftInsertPreview?.choose?.(targetName);
        if (window.craftInsertPreview?.setType) {
          await window.craftInsertPreview.setType(id, targetType);
        }
        if (targetType === 'code') window.craftC2?.edit?.(id.slice(1), {anchor: 0, head: 0});
        else window.craftMd?.edit?.(id.slice(1), {toEnd: true});
      } catch (err) {
        console.error('craftDesktopUX: slash-morph failed', err);
      } finally { morphing = false; }
    })();
  };
  let slashPend = false;
  const onSlashInput = e => {
    const t = e.target;
    if (!(t instanceof Element) || !t.closest('.cm-content, .cm-editor')) return;
    if (slashPend) return;
    slashPend = true;
    queueMicrotask(() => { slashPend = false; checkSlashMorph(); });
  };
  on(document, 'input', onSlashInput, cap);

  const offMobile = window.craftMobile?.onChange?.(active => { if (active) { closePicker(); detachHandles(); } });
  window.craftDesktopUX = {
    disable() {
      offMobile?.(); closePicker(); detachHandles(); picker.remove();
      ac.abort();
      delete window.craftDesktopUX;
    },
  };
})();

/* %% nbs/craft/09_cell_insertion.ipynb #dc465295 */
(() => {
  window.craftImageDrop?.disable();
  if (!window.__craftCMCore.features.init('image-drop', 'Image drop upload', 'Drop images onto code/note/prompt cards')) return;
  const {on, notify: coreNotify, SOLVEIT, kid, htmxPost, getCellInputText} = window.__craftCMCore;
  const target = e => e.target.closest?.(`${SOLVEIT.sel.cell} > .card-in:is([data-mtype="code"],[data-mtype="note"],[data-mtype="prompt"])`);
  const notify = message => coreNotify(message, {status: 'warning'});
  let busy = false, disabled = false;

  const dragover = e => {
    if (!target(e)) return;
    const items = [...(e.dataTransfer?.items || [])];
    if (!items.some(i => i.kind === 'file' && (!i.type || i.type.startsWith('image/'))) && (items.length || !e.dataTransfer?.types.includes('Files'))) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const insertIntoActiveView = (id, md) => {
    const view = window.craftC2?.view?.(id) || window.craftMd?.view?.(`${id}:in`) || window.craftMd?.view?.(id);
    if (!view) return false;
    const {from, to} = view.state.selection.main;
    const ins = `\n${md}\n`;
    view.dispatch({changes: {from, to, insert: ins}, selection: {anchor: from + ins.length}});
    view.focus();
    return true;
  };

  const attach = async (e, card, file) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return notify('Wait for the current image upload to finish.');
    const cell = card.parentElement, id = cell.id.replace(/^_/, ''), kind = card.dataset.mtype;
    const k = kid();
    if (!k) return notify('No active kernel session for image upload.');
    busy = true;
    try {
      const ext = file.name.match(/\.([^.]+)$/)?.[1] || file.type.split('/')[1] || 'png';
      const fd = new FormData();
      fd.append('id_', id);
      fd.append('msg_type', kind);
      fd.append('kid', k);
      fd.append('file', file, file.name || `image.${ext}`);
      const resp = await fetch(SOLVEIT.api.uploadAttachment, {method: 'POST', body: fd});
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (disabled) return;
      const ref = data.saved_file || (data.id ? `attachment:${data.id}` : '');
      if (!ref) throw new Error('Upload did not return an attachment reference.');
      const alt = (file.name || 'image').replace(/[\[\]]/g, '');
      const md = `![${alt}](${ref})`;
      if (!insertIntoActiveView(id, md)) {
        const cur = getCellInputText(cell);
        const next = cur ? `${cur.replace(/\n*$/, '')}\n${md}\n` : `${md}\n`;
        await htmxPost(SOLVEIT.api.setContents, {id_: '_' + id, ids: id, contents: JSON.stringify({[id]: next})});
      }
    } catch (err) {
      console.error('CRAFT image attachment:', err);
      notify('Could not attach the image.');
    } finally { busy = false; }
  };

  const drop = e => {
    const card = target(e), file = e.dataTransfer?.files[0];
    if (card && file?.type.startsWith('image/')) attach(e, card, file);
  };
  const ac = new AbortController();
  on(window, {dragover, drop}, {capture: true, signal: ac.signal});
  window.craftImageDrop = {disable() {
    disabled = true;
    ac.abort();
    delete window.craftImageDrop;
  }};
})();

/* %% nbs/craft/10_code_editor_c2.ipynb #e2023303 */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"c2_tooltip_portal": "<div id=\"craft-c2-tooltips\" class=\"craft-c2-tooltips\"></div>", "c2_ai_form": "<form class=\"craft-c2-ai-form\"><input class=\"uk-input craft-c2-ai-input\" name=\"query\" autocomplete=\"off\" placeholder=\"Enter your query... (Enter to apply, Esc to cancel)\" type=\"text\"></form>", "c2_spinner": "<div class=\"craft-c2-spinner\" data-uk-spinner=\"ratio: 0.5\"></div>", "c2_sighelp": "<div class=\"craft-c2-sighelp\"><div class=\"craft-c2-sig-head\"><span class=\"craft-c2-sig-label\"></span><span class=\"craft-c2-sig-nav\" hidden><button type=\"button\" data-dir=\"-1\">▲</button><span class=\"craft-c2-sig-count\"></span><button type=\"button\" data-dir=\"1\">▼</button></span></div><div class=\"craft-c2-sig-meta\" hidden></div><pre class=\"craft-c2-sig-doc\" hidden></pre></div>"});

/* %% nbs/craft/10_code_editor_c2.ipynb #d0e1d53d */
(() => { /* iife:craftC2 */
/* #d0e1d53d */
window.craftC2?.disable();
  const CORE = window.__craftCMCore;
  if (!CORE.features.init('code-editor', 'Inline Code Editor (C2)', 'CodeMirror 6 inline editing for code cells')) return;
  const {SOLVEIT, mountTpl, qsa, on, store, patch, isMac, normId, LANG_ALIASES, langCache, isDark, buildStyles} = CORE;
  const staticHlText = new WeakMap(), smartSelHist = new WeakMap();
  const ghostTimers = new Map(), ghostAborts = new Map(), sigAborts = new Map();
  const getTooltipPortal = () => {
    let p = document.getElementById('craft-c2-tooltips');
    if (!p) { p = mountTpl('c2_tooltip_portal'); document.body.append(p); }
    return p;
  };

  const getServerPrefs = () => ({enterComp: false, autoClose: false});

  let cmCache = null;

  const kernelLang = () => (document.getElementById('kid')?.dataset.language || 'python').toLowerCase();
  const fimEnabled = () => kernelLang() === 'python';
  const dialogMode = () => document.querySelector('[name=mode]')?.value || '';
  const notifyErr = msg => CORE.notifyErr(msg, 'craftC2');
  const loadCM = CORE.loadCoreCM;
  loadCM().then(cm => { cmCache = cm; reconcileCells(CORE.allCells()); schedule(); }).catch(() => {});

  let cmExtras = null;
  const ensureCMExtras = cm => {
    if (!cm.ghLightStyle) buildStyles(cm);
    if (cmExtras) return cmExtras;
    const {state, view} = cm;
    const setGhost = state.StateEffect.define();
    const setSigHelp = state.StateEffect.define();
    const setAiEdit = state.StateEffect.define();

    class GhostWidget extends view.WidgetType {
      constructor(text) { super(); this.text = text; }
      eq(other) { return other.text === this.text; }
      toDOM() {
        return CORE.el('span', {cls: 'craft-c2-ghost'}, this.text);
      }
      ignoreEvent() { return true; }
    }

    const ghostField = state.StateField.define({
      create: () => null,
      update(val, tr) {
        for (const e of tr.effects) if (e.is(setGhost)) return e.value;
        if (!val) return null;
        if (tr.docChanged) {
          let next = null, count = 0;
          tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
            count++;
            if (count === 1 && fromA === toA && fromA === val.pos) {
              const ins = inserted.toString();
              if (ins && val.text.startsWith(ins) && ins.length < val.text.length) {
                next = {pos: val.pos + ins.length, text: val.text.slice(ins.length)};
              }
            }
          });
          return count === 1 ? next : null;
        }
        if (tr.selection) return null;
        return val;
      },
      provide: f => view.EditorView.decorations.from(f, g => (
        g ? view.Decoration.set([view.Decoration.widget({widget: new GhostWidget(g.text), side: 1}).range(g.pos)]) : view.Decoration.none
      )),
    });

    const buildSigTooltip = val => ({
      pos: val.pos,
      above: true,
      strictSide: false,
      arrow: false,
      create(edView) {
        const {el, mountTpl} = CORE;
        const {root: dom, label: sigEl, nav, count, meta, doc} = mountTpl('c2_sighelp', {refs: {
          label: '.craft-c2-sig-label', nav: '.craft-c2-sig-nav', count: '.craft-c2-sig-count',
          meta: '.craft-c2-sig-meta', doc: '.craft-c2-sig-doc',
        }});
        let latest = val;
        nav.addEventListener('mousedown', e => {
          const btn = e.target.closest('button[data-dir]');
          if (!btn || !latest?.values?.length) return;
          e.preventDefault();
          const n = latest.values.length;
          edView.dispatch({effects: setSigHelp.of({...latest, active: (latest.active + Number(btn.dataset.dir) + n) % n})});
        });
        const render = cur => {
          latest = cur;
          const s = cur.values[cur.active] || cur.values[0];
          if (!s) return;
          const descs = (s.params || []).map(p => typeof p === 'string' ? p : String(p.desc || p.name || '').replace(/^param /, ''));
          const fullLabel = String(s.label || ''), openIdx = fullLabel.indexOf('('), closeIdx = fullLabel.lastIndexOf(')');
          sigEl.replaceChildren(
            (openIdx >= 0 ? fullLabel.slice(0, openIdx) : fullLabel) + '(',
            ...descs.flatMap((d, i) => [i > 0 ? ', ' : null, i === s.idx ? el('strong', {cls: 'craft-c2-sig-active'}, d) : d]),
            closeIdx >= 0 ? fullLabel.slice(closeIdx) : ')');
          nav.hidden = cur.values.length <= 1;
          if (!nav.hidden) count.textContent = ` ${cur.active + 1}/${cur.values.length} `;
          meta.hidden = !(s.typ || s.mod);
          meta.replaceChildren(
            ...(s.typ ? [el('b', {}, 'Type: '), el('kbd', {}, s.typ), ' '] : []),
            ...(s.mod ? [el('b', {}, 'Module: '), el('kbd', {}, s.mod)] : []));
          doc.hidden = !s.doc;
          doc.textContent = s.doc || '';
        };
        render(val);
        return {
          dom,
          update(u) {
            const next = u.state.field(sigHelpField, false);
            if (next) render(next);
          },
        };
      },
    });

    const sigHelpField = state.StateField.define({
      create: () => null,
      update(val, tr) {
        for (const e of tr.effects) if (e.is(setSigHelp)) return e.value;
        if (tr.docChanged || tr.selection) return null;
        return val;
      },
      provide: f => view.showTooltip.from(f, val => val ? buildSigTooltip(val) : null),
    });

    class AiEditWidget extends view.WidgetType {
      constructor(spec) { super(); this.spec = spec; }
      eq(other) { return other.spec === this.spec; }
      toDOM() {
        const form = CORE.mountTpl('c2_ai_form');
        const input = form.querySelector('input');
        form.addEventListener('submit', e => {
          e.preventDefault();
          e.stopPropagation();
          this.spec.onSubmit(input.value);
        });
        input.addEventListener('keydown', e => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            this.spec.onCancel();
          }
        });
        requestAnimationFrame(() => input.focus());
        return form;
      }
      ignoreEvent() { return true; }
    }

    const aiEditField = state.StateField.define({
      create: () => null,
      update(val, tr) {
        for (const e of tr.effects) if (e.is(setAiEdit)) return e.value;
        return val;
      },
      provide: f => view.EditorView.decorations.from(f, spec => (
        spec ? view.Decoration.set([view.Decoration.widget({widget: new AiEditWidget(spec), block: true, side: -1}).range(spec.lineFrom)]) : view.Decoration.none
      )),
    });

    const t = cm.hl.tags;
    const staticHighlighter = cm.hl.tagHighlighter([
      {tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: 'color:light-dark(#6a737d,#6a737d)'},
      {tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.operator, t.compareOperator, t.logicOperator, t.arithmeticOperator, t.bitwiseOperator, t.updateOperator], class: 'color:light-dark(#d73a49,#f97583)'},
      {tag: [t.string, t.special(t.string), t.docString], class: 'color:light-dark(#032f62,#9ecbff)'},
      {tag: [t.regexp], class: 'color:light-dark(#032f62,#dbedff)'},
      {tag: [t.self, t.escape, t.number, t.integer, t.float, t.bool, t.null, t.atom, t.constant(t.variableName), t.propertyName, t.attributeName, t.standard(t.variableName), t.special(t.variableName), t.link, t.url], class: 'color:light-dark(#005cc5,#79b8ff)'},
      {tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName)), t.className, t.definition(t.className), t.typeName, t.meta, t.annotation], class: 'color:light-dark(#6f42c1,#b392f0)'},
      {tag: [t.tagName], class: 'color:light-dark(#22863a,#85e89d)'},
      {tag: [t.heading], class: 'color:light-dark(#005cc5,#79b8ff);font-weight:700'},
      {tag: [t.strong], class: 'color:light-dark(#24292e,#e1e4e8);font-weight:700'},
      {tag: [t.emphasis], class: 'color:light-dark(#24292e,#e1e4e8);font-style:italic'},
      {tag: [t.variableName, t.definition(t.variableName), t.punctuation, t.bracket, t.paren, t.squareBracket, t.brace], class: 'color:light-dark(#24292e,#e1e4e8)'},
      {tag: [t.invalid], class: 'color:light-dark(#cb2431,#fdaeb7);font-style:italic'},
    ]);

    const igDeco = view.Decoration.mark({class: 'craft-c2-ig'});
    const buildIndentGuides = edView => {
      const builder = new state.RangeSetBuilder();
      const doc = edView.state.doc;
      const seen = new Set();
      for (const {from, to} of edView.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = doc.lineAt(pos);
          if (!seen.has(line.number)) {
            seen.add(line.number);
            const m = line.text.match(/^ +/);
            if (m && m[0].length < line.text.length) {
              const spaces = m[0].length;
              for (let col = 0; col + 4 <= spaces; col += 4) {
                builder.add(line.from + col, line.from + col + 1, igDeco);
              }
            }
          }
          if (line.to >= doc.length) break;
          pos = line.to + 1;
        }
      }
      return builder.finish();
    };
    const indentGuidesExt = view.ViewPlugin.fromClass(class {
      constructor(edView) { this.decorations = buildIndentGuides(edView); }
      update(u) { if (u.docChanged || u.viewportChanged) this.decorations = buildIndentGuides(u.view); }
    }, {decorations: p => p.decorations});

    const brDecos = [
      view.Decoration.mark({class: 'craft-c2-br-0'}),
      view.Decoration.mark({class: 'craft-c2-br-1'}),
      view.Decoration.mark({class: 'craft-c2-br-2'}),
    ];
    const brErrDeco = view.Decoration.mark({class: 'craft-c2-br-err'});
    const BR_OPEN = {'(': ')', '[': ']', '{': '}'};
    const BR_CLOSE = new Set([')', ']', '}']);
    const SKIP_NODES = new Set(['Comment', 'LineComment', 'BlockComment', 'String', 'FormatString', 'TemplateString', 'RegExp', 'RawString']);
    const buildRainbowBrackets = edView => {
      const st = edView.state;
      const doc = st.doc;
      if (doc.length > 50_000) return view.Decoration.none;
      const visible = edView.visibleRanges;
      if (!visible.length) return view.Decoration.none;
      const maxTo = visible[visible.length - 1].to;
      const text = doc.sliceString(0, maxTo);
      const tree = cm.lang.syntaxTree(st);
      const builder = new state.RangeSetBuilder();
      const stack = [];
      let vIdx = 0;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const isOpen = Boolean(BR_OPEN[ch]);
        if (!isOpen && !BR_CLOSE.has(ch)) continue;
        let skip = false;
        for (let n = tree.resolveInner(i, 1); n; n = n.parent) {
          if (SKIP_NODES.has(n.name)) { skip = true; break; }
        }
        if (skip) continue;
        while (vIdx < visible.length && visible[vIdx].to <= i) vIdx++;
        const inVis = vIdx < visible.length && i >= visible[vIdx].from && i < visible[vIdx].to;
        if (isOpen) {
          const depth = stack.length;
          stack.push({close: BR_OPEN[ch], depth});
          if (inVis) builder.add(i, i + 1, brDecos[depth % 3]);
        } else {
          let matched = null;
          for (let j = stack.length - 1; j >= 0; j--) {
            if (stack[j].close === ch) { matched = stack.splice(j)[0]; break; }
          }
          if (inVis) builder.add(i, i + 1, matched ? brDecos[matched.depth % 3] : brErrDeco);
        }
      }
      return builder.finish();
    };
    const rainbowBracketsExt = view.ViewPlugin.fromClass(class {
      constructor(edView) { this.decorations = buildRainbowBrackets(edView); }
      update(u) { if (u.docChanged || u.viewportChanged || cm.lang.syntaxTree(u.startState) !== cm.lang.syntaxTree(u.state)) this.decorations = buildRainbowBrackets(u.view); }
    }, {decorations: p => p.decorations});

    cmExtras = {setGhost, ghostField, setSigHelp, sigHelpField, setAiEdit, aiEditField, staticHighlighter, indentGuidesExt, rainbowBracketsExt};
    return cmExtras;
  };

/* #618f0173 */
const themeExtensions = cm => {
    ensureCMExtras(cm);
    return [
      cm.lang.syntaxHighlighting(isDark() ? cm.ghDarkStyle : cm.ghLightStyle),
      isDark() ? cm.darkTheme : cm.lightTheme,
    ];
  };

  const detectLangKey = text => {
    const kl = kernelLang();
    if (kl === 'python') {
      const m = String(text || '').match(/^%%(\w+)/)?.[1]?.toLowerCase();
      if (m) return LANG_ALIASES[m] || m;
    }
    return LANG_ALIASES[kl] || kl;
  };

    async function resolveLangExt(cm, langKey) {
    try { return await CORE.loadLang(cm, langKey); }
    catch (err) { console.warn('craftC2: language fallback to plaintext for', langKey, err); return []; }
  }

  async function syncCellLanguage(id, v) {
    const rec = views.get(id);
    if (!rec || !cmCache) return;
    const want = detectLangKey(v.state.doc.toString());
    if (rec.langKey === want) return;
    rec.langKey = want;
    const ext = await resolveLangExt(cmCache, want);
    const cur = views.get(id);
    if (!cur || cur !== rec || cur.langKey !== want) return;
    cur.view.dispatch({effects: cur.langComp.reconfigure(ext)});
  }

  function renderStaticHighlight(codeEl, text, tree, langKey) {
    if (!cmCache || !codeEl || !tree) return;
    const {staticHighlighter} = ensureCMExtras(cmCache);
    const frag = document.createDocumentFragment();
    let pos = 0;
    cmCache.hl.highlightTree(tree, staticHighlighter, (from, to, cls) => {
      if (from > pos) frag.append(document.createTextNode(text.slice(pos, from)));
      if (cls) {
        frag.append(CORE.el('span', {style: cls.trim().replace(/\s+/g, ';')}, text.slice(from, to)));
      } else {
        frag.append(document.createTextNode(text.slice(from, to)));
      }
      pos = to;
    });
    if (pos < text.length) frag.append(document.createTextNode(text.slice(pos)));
    codeEl.replaceChildren(frag);
    codeEl.dataset.highlighted = 'true';
    staticHlText.set(codeEl, {text, langKey});
  }

  function ensureStaticHighlighted(card) {
    if (!cmCache || !card) return;
    const codeEl = card.querySelector(`${SOLVEIT.sel.msgBody} ${SOLVEIT.sel.msgContent} pre code`);
    if (!codeEl) return;
    const text = codeEl.textContent || '';
    if (!text.trim()) return;
    const langKey = detectLangKey(text);
    const prev = staticHlText.get(codeEl);
    if (prev && prev.text === text && prev.langKey === langKey && codeEl.querySelector('span[style]')) return;
    if (langKey === 'python') {
      const parser = cmCache.python.pythonLanguage?.parser || cmCache.python.python().language?.parser;
      if (parser) renderStaticHighlight(codeEl, text, parser.parse(text), langKey);
      return;
    }
    const cacheKey = `${cmCache._source || 'cdn'}:${langKey}`;
    const cached = langCache.get(cacheKey);
    const parser = cached?.language?.parser || cached?.parser;
    if (parser) {
      renderStaticHighlight(codeEl, text, parser.parse(text), langKey);
      return;
    }
    resolveLangExt(cmCache, langKey).then(ext => {
      if (ed.destroyed || !codeEl.isConnected) return;
      const curCard = codeEl.closest(SOLVEIT.sel.cardInType);
      if (curCard?.classList.contains('craft-c2-mounted')) return;
      if ((codeEl.textContent || '') !== text) return;
      const p = ext?.language?.parser || ext?.parser;
      if (p) renderStaticHighlight(codeEl, text, p.parse(text), langKey);
    });
  }

    const syncFindBoxToView = v => CORE.syncFindBoxToView(v, cmCache);

  function smartExpandSelection(v) {
    if (!cmCache) return false;
    const st = v.state;
    const sel = st.selection.main;
    const tree = cmCache.lang.ensureSyntaxTree(st, st.doc.length, 150) || cmCache.lang.syntaxTree(st);
    let node = tree.resolveInner(sel.from, 1);
    if (!node || (node.from === sel.from && node.to === sel.to && sel.from > 0)) {
      const alt = tree.resolveInner(sel.from, -1);
      if (alt) node = alt;
    }
    while (node && !(node.from <= sel.from && node.to >= sel.to && (node.from < sel.from || node.to > sel.to))) {
      node = node.parent;
    }
    if (!node) return false;
    let hist = smartSelHist.get(v);
    const cur = {from: sel.from, to: sel.to};
    if (!hist || hist.doc !== st.doc || !hist.last || hist.last.from !== cur.from || hist.last.to !== cur.to) {
      hist = {doc: st.doc, stack: [], last: null};
    }
    hist.stack.push(cur);
    hist.last = {from: node.from, to: node.to};
    smartSelHist.set(v, hist);
    v.dispatch({selection: {anchor: node.from, head: node.to}, scrollIntoView: true});
    return true;
  }

  function smartShrinkSelection(v) {
    const hist = smartSelHist.get(v);
    const sel = v.state.selection.main;
    if (!hist || hist.doc !== v.state.doc || !hist.stack.length || !hist.last || hist.last.from !== sel.from || hist.last.to !== sel.to) {
      return false;
    }
    const prev = hist.stack.pop();
    hist.last = hist.stack.length ? prev : null;
    v.dispatch({selection: {anchor: prev.from, head: prev.to}, scrollIntoView: true});
    return true;
  }

  async function switchCellType(id, v, mtyp) {
    if (mtyp === 'code') return;
    await ed.switchCellType(id, v, mtyp, {
      onMatch: window.craftMd ? (cid, selSpec) => window.craftMd.edit(cid, selSpec) : null,
    });
  }

/* #564ce3de */
const jumpToLastCell = id => CORE.jumpToLastCell(() => exitCell(id));

  const getCellEl = id => document.getElementById('_' + id);
  const getCardIn = el => el?.querySelector(SOLVEIT.sel.codeCard);
  const getCellText = el => el?.querySelector('form [name="content"]')?.value ?? '';
  const hasDiff = el => !!(el && (el.dataset.diff || el.querySelector('[data-diff]')));
  let nonCodeInsertion = null;
  const isNonCodeInsertion = id => nonCodeInsertion && !nonCodeInsertion.has(id);
  const isC2El = el => !!el && !isNonCodeInsertion(el.id) && !!getCardIn(el) && !hasDiff(el);
  const typingBlocked = () => CORE.typingBlocked();

  const ed = CORE.createInlineEditor({
    tag: 'craftC2',
    mountedCls: 'craft-c2-mounted',
    getCard: el => getCardIn(el),
    getText: el => getCellText(el),
    getInput: el => el?.querySelector('form [name="content"]'),
    applySaveState: (id, st) => {
      const el = getCellEl(id);
      if (!el) return;
      if (st) el.dataset.c2Save = st;
      else delete el.dataset.c2Save;
    },
    setEditing: (_id, on, el) => {
      if (!el) return;
      if (on) el.dataset.c2Editing = 'true';
      else delete el.dataset.c2Editing;
    },
    beforeUnmount: (id, rec) => {
      cancelGhost(id);
      const ab = sigAborts.get(id);
      if (ab) { ab.abort(); sigAborts.delete(id); }
      if (!rec) return;
      const docText = rec.view.state.doc.toString();
      const codeEl = getCardIn(getCellEl(id))?.querySelector(`${SOLVEIT.sel.msgBody} ${SOLVEIT.sel.msgContent} pre code`);
      if (codeEl) {
        if (cmCache && docText.trim()) {
          const tree = cmCache.lang.ensureSyntaxTree(rec.view.state, docText.length, 200) || cmCache.lang.syntaxTree(rec.view.state);
          renderStaticHighlight(codeEl, docText, tree, rec.langKey || detectLangKey(docText));
        } else {
          codeEl.textContent = docText;
          staticHlText.delete(codeEl);
        }
      }
    },
    beforeBlur: id => cancelGhost(id),
    beforeExit: id => cancelGhost(id),
    beforeRun: id => cancelGhost(id),
    beforeSplit: (id, v) => cancelGhost(id, v),
    onRekey: oldId => {
      cancelGhost(oldId);
      const ab = sigAborts.get(oldId);
      if (ab) { ab.abort(); sigAborts.delete(oldId); }
    },
    keepMounted: (_id, rec) => Boolean(cmCache && hasFolds(cmCache, rec.view.state)),
    isViewValid: (_id, _rec, el) => !hasDiff(el) && isC2El(el),
    onSync: () => {
      reconcileAutoEdits();
      driveAutoEdit();
    },
    onBeforeRequest: (ctx, pathname, body) => {
      if (pathname === SOLVEIT.api.addAbove || pathname === SOLVEIT.api.addBelow) {
        if (nonCodeInsertion || CORE.optimistic?.isSuppressingAutoEdit?.()) return;
        if (!pendingAutoEdits.some(r => r.forceCode && r.expires > Date.now())) queueAutoEdit({forceCode: false});
        return;
      }
      if (pathname === SOLVEIT.api.addRunq) {
        if (body.get('cmd') === 'alt-run') queueAutoEdit({forceCode: false, ttl: 30000});
        return;
      }
    },
    openPrimaryOnEnter: (el, run) => {
      if (!isC2El(el)) return false;
      const card = getCardIn(el);
      if (!card || card.classList.contains('collapsed')) return false;
      if (run) openCell(el.id.replace(/^_/, ''));
      return true;
    },
    onEditClick: (edit, e) => {
      const cell = edit.closest(SOLVEIT.sel.cell), cellId = cell?.id?.replace(/^_/, ''), codeCard = getCardIn(cell);
      if (!cellId || !codeCard || hasDiff(cell) || isNonCodeInsertion(cell.id) || codeCard.classList.contains('collapsed')) return false;
      e.preventDefault(); e.stopImmediatePropagation();
      openCell(cellId);
      return true;
    },
    getThemeExts: () => (cmCache ? themeExtensions(cmCache) : null),
    beforeSwitch: (id, v) => cancelGhost(id, v),
    failRenameMsg: 'Could not save code edit before reopening renamed dialog.',
    domAttrs: ['value', 'data-diff'],
    inDialog: false,
    pointerEdit: {
      ignoreSel: 'button, a, .craft-c2-host',
      resolveTarget: e => {
        const content = e.target.closest?.(`${SOLVEIT.sel.cell} ${SOLVEIT.sel.codeCard} ${SOLVEIT.sel.msgContent}`);
        if (!content) return null;
        const el = content.closest(SOLVEIT.sel.cell);
        if (!isC2El(el)) return null;
        return {id: normId(el.id), codeEl: content.querySelector('pre code')};
      },
      onOpen: (p, selSpec) => openCell(p.id, selSpec),
    },
  });
  const {states, views, pendingSaves, dirtyIds, failedSaves, syncSaveState, saveCell, unmountCell, exitCell, saveAndRun, sync, schedule} = ed;
  function reconcileCells(cells) {
    for (const el of cells) {
      const card = el.querySelector(SOLVEIT.sel.cardIn);
      if (!card) continue;
      syncSaveState(normId(el.id));
      if (card.dataset.mtype === 'code' && !card.classList.contains('craft-c2-mounted') && !card.closest('[data-streaming]')) {
        ensureStaticHighlighted(card);
      }
    }
  }
  const unsubCells = CORE.onCells(reconcileCells, {attrs: ['data-mtype', 'data-streaming'], initial: true});
  const splitCell = (id, v) => ed.splitCell(id, v, 'code');

  const pendingAutoEdits = [];
  let autoEditGuard = null;

  const clearAutoEditGuard = () => { autoEditGuard = null; };

  const queueAutoEdit = ({forceCode = false, ttl = 6000} = {}) => {
    clearAutoEditGuard();
    const existing = new Set(qsa(SOLVEIT.sel.cellWithId).map(el => el.id));
    pendingAutoEdits.push({existing, forceCode, expires: Date.now() + ttl});
  };

  const claimNewCell = (nid, {forceCode = false} = {}) => {
    clearAutoEditGuard();
    autoEditGuard = {id: nid, forceCode, wantOpen: true, converted: false, expires: Date.now() + 4000};
    driveAutoEdit();
  };

  const driveAutoEdit = () => {
    if (!autoEditGuard) return;
    const g = autoEditGuard;
    if (Date.now() > g.expires) { clearAutoEditGuard(); return; }
    const el = getCellEl(g.id);
    const card = el?.querySelector(SOLVEIT.sel.cardIn);
    const isCode = card?.dataset.mtype === 'code';
    if (el && card && !isCode) {
      if (g.forceCode) {
        if (!g.converted) {
          g.converted = true;
          CORE.htmxPost(SOLVEIT.api.setMtyp, {id_: '_' + g.id, ids: '_' + g.id, mtyp: 'code'})
            .catch(err => console.error('craftC2: set_mtyp failed', err));
        }
        return;
      }
      clearAutoEditGuard();
      return;
    }
    if (el && isCode && !hasDiff(el) && g.wantOpen) {
      g.wantOpen = false;
      if (el.dataset.editing) delete el.dataset.editing;
      el.scrollIntoView({block: 'nearest'});
      openCell(g.id, {anchor: 0, head: 0});
    }
  };

  const reconcileAutoEdits = () => {
    if (!pendingAutoEdits.length) return;
    const now = Date.now();
    for (let i = pendingAutoEdits.length - 1; i >= 0; i--) {
      if (pendingAutoEdits[i].expires < now) pendingAutoEdits.splice(i, 1);
    }
    if (!pendingAutoEdits.length) return;
    const cells = qsa(SOLVEIT.sel.cellWithId);
    for (let i = 0; i < pendingAutoEdits.length; i++) {
      const req = pendingAutoEdits[i];
      const added = cells.filter(el => !isNonCodeInsertion(el.id) && !req.existing.has(el.id) && (req.forceCode ? Boolean(el.querySelector(SOLVEIT.sel.cardIn)) : Boolean(getCardIn(el))));
      if (!added.length) continue;
      pendingAutoEdits.splice(i, 1);
      claimNewCell(added[0].id.replace(/^_/, ''), req);
      break;
    }
  };

  async function newCodeCell() {
    if (ed.destroyed) return false;
    if (ed.activeKey) await exitCell(ed.activeKey);
    const kid = CORE.kid();
    if (!kid) return false;
    const allCells = qsa(SOLVEIT.sel.cellWithId);
    const last = allCells[allCells.length - 1];
    queueAutoEdit({forceCode: true});
    try {
      if (last) {
        const lastId = last.id.replace(/^_/, '');
        const after = window.sectionTail ? window.sectionTail(last) : last.id;
        await CORE.htmxPost(SOLVEIT.api.addBelow, {id_: lastId, after});
      } else {
        await CORE.htmxPost(SOLVEIT.api.upsertMsg, {id_: '', msg_type: 'code', is_input: '1', content: ' '});
      }
      schedule();
      const existing = new Set(allCells.map(el => el.id));
      const added = await CORE.waitForHtmxSettle(() =>
        CORE.allCells().find(el => !existing.has(el.id) && isC2El(el) && el.querySelector('.craft-c2-host')) || null
      , 6000);
      const addedId = added ? added.id.slice(1) : null;
      if (addedId && !document.activeElement?.closest?.(`#_${addedId} .craft-c2-host`)) openCell(addedId, {anchor: 0, head: 0});
      return true;
    } catch (err) {
      pendingAutoEdits.pop();
      notifyErr('Could not create code cell.');
      console.error('craftC2: newCodeCell failed', err);
      return false;
    }
  }

  function stepBoundary(id, v, up) {
    if (!cmCache || !cmExtras) return false;
    const {sigHelpField, aiEditField} = cmExtras;
    return ed.stepBoundary(id, v, up, {
      tol: 2,
      canStep: view => !(cmCache.ac.completionStatus(view.state) || view.state.field(sigHelpField, false) || view.state.field(aiEditField, false)),
      beforeStep: (cid, view) => cancelGhost(cid, view),
    });
  }

/* #f79e8477 */
const hasFolds = (cm, state) => {
    let any = false;
    cm.lang.foldedRanges(state).between(0, state.doc.length, () => { any = true; return false; });
    return any;
  };

  const TRIGGER_CHARS = new Set(['.', '(', '[', '{', '@', ',', ' ', '+', '-', '/', '*', '%', '^']);
  const SURROUND_PAIRS = {'(': ')', '[': ']', '{': '}', "'": "'", '"': '"'};

  const inCommentOrString = (cm, st, pos) => {
    const name = cm.lang.syntaxTree(st).resolveInner(pos, -1)?.name || '';
    return name === 'Comment' || name === 'String' || name === 'FormatString';
  };

  const kindMap = {
    Function: 'function', Method: 'method', Class: 'class', Module: 'namespace',
    Variable: 'variable', Property: 'property', Keyword: 'keyword', Constant: 'constant',
    Field: 'property', Interface: 'interface', Enum: 'enum', File: 'text', Folder: 'text',
  };

  async function kernelComplete(context) {
    if (window.svCopts?.scon === false) return null;
    const kid = document.getElementById('kid')?.value;
    if (!kid) return null;
    if (!context.explicit && cmCache && inCommentOrString(cmCache, context.state, context.pos)) return null;
    const word = context.matchBefore(/[\w./]+/);
    const prevCh = context.pos > 0 ? context.state.doc.sliceString(context.pos - 1, context.pos) : '';
    if (!context.explicit && !word && !TRIGGER_CHARS.has(prevCh)) return null;
    const doc = context.state.doc;
    const code = doc.toString();
    if (!code) return null;
    const ctrl = new AbortController();
    let timer = null;
    context.addEventListener('abort', () => { clearTimeout(timer); ctrl.abort(); });
    await new Promise(resolve => { timer = setTimeout(resolve, 250); });
    if (context.aborted) return null;
    const line = doc.lineAt(context.pos);
    try {
      const {completions} = await CORE.fetchJson('/complete_', {
        body: {code, line_no: line.number, col_no: context.pos - line.from + 1, kid},
        signal: ctrl.signal,
      });
      if (!Array.isArray(completions) || !completions.length || context.aborted) return null;
      const clamp = n => Math.max(0, Math.min(doc.length, n));
      const toPos = (ln, col) => clamp(doc.line(Math.max(1, Math.min(doc.lines, ln))).from + Math.max(0, col - 1));
      let from = word ? word.from : context.pos, to = context.pos;
      const firstRange = completions[0]?.range;
      if (firstRange) {
        from = toPos(firstRange.startLineNumber, firstRange.startColumn);
        to = toPos(firstRange.endLineNumber, firstRange.endColumn);
      }
      const options = completions.map(c => {
        let apply = c.text;
        if (c.range) {
          const itemFrom = toPos(c.range.startLineNumber, c.range.startColumn);
          const itemTo = toPos(c.range.endLineNumber, c.range.endColumn);
          if (itemFrom !== from || itemTo !== to) {
            apply = (edView, _comp, _curFrom, curTo) => {
              const delta = curTo - to;
              const maxLen = edView.state.doc.length;
              const a = Math.max(0, Math.min(maxLen, itemFrom));
              const b = Math.max(a, Math.min(maxLen, itemTo + delta));
              edView.dispatch({changes: {from: a, to: b, insert: c.text}, selection: {anchor: a + c.text.length}});
            };
          }
        }
        return {
          label: c.text,
          apply,
          detail: c.detail || undefined,
          type: kindMap[c.kind] || 'variable',
          boost: -(Number(c.rank) || 0),
        };
      });
      return {from, to, options, validFor: /^\w*$/};
    } catch { return null; }
  }

  function wordComplete(context) {
    if (!context.explicit && cmCache && inCommentOrString(cmCache, context.state, context.pos)) return null;
    const word = context.matchBefore(context.explicit ? /[A-Za-z_]\w*/ : /[A-Za-z_]\w+/);
    if (!word) return null;
    const seen = new Set([word.text]);
    const options = [];
    const text = context.state.doc.toString();
    for (const m of text.matchAll(/\b[A-Za-z_]\w+\b/g)) {
      const w = m[0];
      if (seen.has(w)) continue;
      seen.add(w);
      options.push({label: w, type: 'text', boost: -100});
      if (options.length >= 200) break;
    }
    return options.length ? {from: word.from, to: word.to, options, validFor: /^\w*$/} : null;
  }

  function cancelGhost(id, v = null) {
    clearTimeout(ghostTimers.get(id));
    ghostTimers.delete(id);
    const ab = ghostAborts.get(id);
    if (ab) { ab.abort(); ghostAborts.delete(id); }
    const edView = v || views.get(id)?.view;
    if (edView && cmExtras && edView.state.field(cmExtras.ghostField, false)) {
      edView.dispatch({effects: cmExtras.setGhost.of(null)});
    }
  }

  async function requestGhost(id, v, explicit = false) {
    if (ed.destroyed || !cmCache || !fimEnabled()) return;
    const copts = window.svCopts;
    const kid = document.getElementById('kid')?.value;
    if (!kid || copts?.scon === false) return;
    if (!v.hasFocus || !v.state.selection.main.empty || v.state.readOnly) return;
    if (v.state.doc.length > 32_000) return;
    if (!explicit && dialogMode() === 'learning') return;
    if (cmCache.ac.selectedCompletionIndex(v.state) != null) return;
    const pos = v.state.selection.main.head;
    const doc = v.state.doc;
    const line = doc.lineAt(pos);
    const triggerChars = typeof copts?.triggerc === 'string' ? (() => { try { return JSON.parse(copts.triggerc); } catch { return []; } })() : copts?.triggerc;
    if (!explicit && !triggerChars?.some(c => line.text.endsWith(c))) return;
    const prevAb = ghostAborts.get(id);
    if (prevAb) prevAb.abort();
    const ctrl = new AbortController();
    ghostAborts.set(id, ctrl);
    const pfx = doc.sliceString(0, pos), sfx = doc.sliceString(pos);
    const prevLine = doc.line(Math.max(line.number - 1, 1)).text;
    const req_id = Math.random().toString(36).slice(2);
    const origText = doc.toString();
    try {
      const {completions} = await CORE.fetchJson('/ghost_', {
        body: {id_: id, mtype: 'code', output: false, pfx, sfx, req_id, kid},
        signal: ctrl.signal,
      });
      if (!Array.isArray(completions) || !completions.length || ctrl.signal.aborted) return;
      const cur = views.get(id);
      if (!cur || cur.view !== v || !v.hasFocus || v.state.doc.toString() !== origText || v.state.selection.main.head !== pos || !v.state.selection.main.empty) return;
      const first = completions[0].text;
      if (!first) return;
      if (/^\s*$/.test(first) && copts?.acceptichars && !sfx.length && !/^\s*$/.test(prevLine)) {
        v.dispatch({changes: {from: pos, to: pos, insert: first}, selection: {anchor: pos + first.length}});
        if (fimEnabled() && copts?.triggeronaccept && dialogMode() !== 'learning') {
          clearTimeout(ghostTimers.get(id));
          ghostTimers.set(id, setTimeout(() => {
            ghostTimers.delete(id);
            if (!ed.destroyed) requestGhost(id, v, false);
          }, 50));
        }
        return;
      }
      const {setGhost} = ensureCMExtras(cmCache);
      v.dispatch({effects: setGhost.of({pos, text: first})});
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('craftC2: ghost error', err);
    } finally {
      if (ghostAborts.get(id) === ctrl) ghostAborts.delete(id);
    }
  }

  function scheduleGhost(id, v) {
    clearTimeout(ghostTimers.get(id));
    const prevAb = ghostAborts.get(id);
    if (prevAb) { prevAb.abort(); ghostAborts.delete(id); }
    if (!fimEnabled() || window.svCopts?.scon === false || dialogMode() === 'learning') return;
    ghostTimers.set(id, setTimeout(() => {
      ghostTimers.delete(id);
      const cur = views.get(id);
      if (cur && cur.view === v && v.hasFocus) requestGhost(id, v, false);
    }, 1500));
  }

  function acceptGhost(id, v) {
    if (!cmExtras || !v.state.selection.main.empty) return false;
    const {ghostField, setGhost} = cmExtras;
    const g = v.state.field(ghostField, false);
    if (!g) return false;
    v.dispatch({
      changes: {from: g.pos, to: g.pos, insert: g.text},
      selection: {anchor: g.pos + g.text.length},
      effects: setGhost.of(null),
    });
    if (fimEnabled() && window.svCopts?.triggeronaccept && dialogMode() !== 'learning') {
      clearTimeout(ghostTimers.get(id));
      ghostTimers.set(id, setTimeout(() => {
        ghostTimers.delete(id);
        const cur = views.get(id);
        if (!ed.destroyed && cur && cur.view === v && v.hasFocus) requestGhost(id, v, false);
      }, 50));
    }
    return true;
  }

  async function triggerSigHelp(id, v) {
    if (!cmCache || !fimEnabled() || !v.state.selection.main.empty) return false;
    const {sigHelpField, setSigHelp} = ensureCMExtras(cmCache);
    if (v.state.field(sigHelpField, false)) return false;
    const kid = document.getElementById('kid')?.value;
    if (!kid) return false;
    const prevAb = sigAborts.get(id);
    if (prevAb) prevAb.abort();
    const ctrl = new AbortController();
    sigAborts.set(id, ctrl);
    const pos = v.state.selection.main.head;
    const doc = v.state.doc;
    const line = doc.lineAt(pos);
    const origText = doc.toString();
    try {
      const {values} = await CORE.fetchJson('/sig_help_', {
        body: {code: origText, line_no: line.number, col_no: pos - line.from, kid},
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return false;
      let items = [], active = 0;
      if (Array.isArray(values)) {
        items = values.map(s => ({
          label: String(s.label || ''),
          params: (s.params || []).map(p => String(p.desc || p.name || '').replace(/^param /, '')),
          idx: s.idx ?? 0,
          typ: s.typ || '',
          mod: s.mod || '',
          doc: s.doc || '',
        }));
      } else if (values && Array.isArray(values.signatures)) {
        active = values.activeSignature || 0;
        items = values.signatures.map(s => ({
          label: String(s.label || ''),
          params: (s.parameters || []).map(p => (typeof p === 'string' ? p : String(p.label || ''))),
          idx: s.activeParameter ?? values.activeParameter ?? 0,
          typ: s.typ || '',
          mod: s.mod || '',
          doc: typeof s.documentation === 'string' ? s.documentation : (s.documentation?.value || ''),
        }));
      }
      if (!items.length) return false;
      const cur = views.get(id);
      if (!cur || cur.view !== v || v.state.doc.toString() !== origText || v.state.selection.main.head !== pos) return false;
      cmCache.ac.closeCompletion(v);
      v.dispatch({effects: setSigHelp.of({pos, values: items, active: Math.max(0, Math.min(items.length - 1, active))})});
      return true;
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('craftC2: sig_help error', err);
      return false;
    } finally {
      if (sigAborts.get(id) === ctrl) sigAborts.delete(id);
    }
  }

  function setCellSpinner(rec, on) {
    if (!rec?.host) return;
    let sp = rec.host.querySelector('.craft-c2-spinner');
    if (on && !sp) {
      sp = CORE.mountTpl('c2_spinner');
      rec.host.append(sp);
    } else if (!on && sp) sp.remove();
  }

  async function runSuperComplete(id, v, hl, instr, from, to) {
    const rec = views.get(id);
    if (!rec || !cmCache || !fimEnabled()) return;
    const kid = document.getElementById('kid')?.value;
    if (!kid) return;
    v.dispatch({effects: rec.readOnlyComp.reconfigure(cmCache.state.EditorState.readOnly.of(true))});
    setCellSpinner(rec, true);
    try {
      const doc = v.state.doc;
      const pfx = doc.sliceString(0, from), sfx = doc.sliceString(to);
      const {completions} = await CORE.fetchJson(hl ? '/supere_' : '/superc_', {
        body: {id_: id, mtype: 'code', output: false, pfx, sfx, hl, instr, kid},
        timeoutMs: 60000,
      });
      const cur = views.get(id);
      if (cur && cur.view === v) {
        v.dispatch({effects: rec.readOnlyComp.reconfigure(cmCache.state.EditorState.readOnly.of(false))});
        if (Array.isArray(completions) && completions.length) {
          const txt = completions[0].text;
          v.dispatch({changes: {from, to, insert: txt}, selection: {anchor: from + txt.length}});
        }
        v.focus();
      }
    } catch (err) {
      const cur = views.get(id);
      if (cur && cur.view === v) {
        v.dispatch({effects: rec.readOnlyComp.reconfigure(cmCache.state.EditorState.readOnly.of(false))});
        v.focus();
      }
      notifyErr(err?.message || 'Completion request failed.');
    } finally {
      setCellSpinner(views.get(id), false);
    }
  }

  function triggerSuperComplete(id, v) {
    const rec = views.get(id);
    if (!rec || !cmCache || !fimEnabled() || v.state.readOnly) return false;
    cancelGhost(id, v);
    const {setAiEdit} = ensureCMExtras(cmCache);
    const sel = v.state.selection.main;
    if (sel.empty) {
      runSuperComplete(id, v, '', '', sel.from, sel.to);
      return true;
    }
    const lineFrom = v.state.doc.lineAt(sel.from).from;
    const hl = v.state.doc.sliceString(sel.from, sel.to);
    const dismiss = () => {
      const cur = views.get(id);
      if (!cur || cur.view !== v) return;
      v.dispatch({effects: [setAiEdit.of(null), rec.readOnlyComp.reconfigure(cmCache.state.EditorState.readOnly.of(false))]});
    };
    v.dispatch({
      effects: [
        rec.readOnlyComp.reconfigure(cmCache.state.EditorState.readOnly.of(true)),
        setAiEdit.of({
          lineFrom,
          onCancel() {
            dismiss();
            v.focus();
          },
          onSubmit(instr) {
            v.dispatch({effects: setAiEdit.of(null)});
            runSuperComplete(id, v, hl, instr, sel.from, sel.to);
          },
        }),
      ],
    });
    return true;
  }

/* #f3ed72d7 */
function buildExtensions(cm, idOrRef, comps) {
    const ref = typeof idOrRef === 'string' ? {id: idOrRef, key: idOrRef} : idOrRef;
    const {state, view, lang, python, cmds, ac, search} = cm;
    const {ghostField, sigHelpField, setSigHelp, aiEditField, indentGuidesExt, rainbowBracketsExt} = ensureCMExtras(cm);
    const {langComp, themeComp, readOnlyComp} = comps;

    const autoSurroundExt = view.EditorView.inputHandler.of((v, _from, _to, text) => {
      if (v.state.readOnly || text.length !== 1 || !SURROUND_PAIRS[text]) return false;
      const sel = v.state.selection;
      if (!sel.ranges.some(r => !r.empty)) return false;
      const close = SURROUND_PAIRS[text];
      const tr = v.state.changeByRange(r => {
        if (r.empty) return {changes: {from: r.from, to: r.to, insert: text}, range: state.EditorSelection.cursor(r.from + 1)};
        const inner = v.state.doc.sliceString(r.from, r.to);
        return {
          changes: {from: r.from, to: r.to, insert: text + inner + close},
          range: state.EditorSelection.range(r.from + 1, r.to + 1),
        };
      });
      v.dispatch(tr);
      return true;
    });

    const sigKeyHandler = view.EditorView.domEventHandlers({
      keydown(e, v) {
        const cur = v.state.field(sigHelpField, false);
        if (!cur) return false;
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return false;
        if (cur.values.length > 1 && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          const n = cur.values.length;
          const delta = e.key === 'ArrowDown' ? 1 : -1;
          v.dispatch({effects: setSigHelp.of({...cur, active: (cur.active + delta + n) % n})});
          return true;
        }
        v.dispatch({effects: setSigHelp.of(null)});
        return e.key === 'Escape';
      },
    });

    const prefs = getServerPrefs();
    const smartExpandKey = isMac ? 'Ctrl-Shift-ArrowRight' : 'Alt-Shift-ArrowRight';
    const smartShrinkKey = isMac ? 'Ctrl-Shift-ArrowLeft' : 'Alt-Shift-ArrowLeft';
    const jumpLastKey = isMac ? 'Ctrl-Shift-ArrowUp' : 'Mod-Shift-ArrowUp';
    const acceptOrPickFirst = v => {
      if (ac.completionStatus(v.state) !== 'active') return false;
      if (ac.selectedCompletionIndex(v.state) == null) {
        if (!ac.currentCompletions(v.state).length) return false;
        v.dispatch({effects: ac.setSelectedCompletion(0)});
      }
      return ac.acceptCompletion(v);
    };

    const solveitKeys = state.Prec.high(view.keymap.of([
      {key: 'Shift-Enter', run: () => { saveAndRun(ref.id, 'shift-run'); return true; }},
      {key: 'Mod-Enter', run: () => { saveAndRun(ref.id, 'run'); return true; }},
      {key: 'Alt-Enter', run: () => { saveAndRun(ref.id, 'alt-run'); return true; }},
      {key: 'Mod-Shift-Enter', run: () => { saveAndRun(ref.id, 'continue'); return true; }},
      {key: 'Alt-.', run: v => { requestGhost(ref.id, v, true); return true; }},
      {key: 'ArrowRight', run: v => !getServerPrefs().enterComp && acceptGhost(ref.id, v)},
      {key: 'ArrowUp', run: v => stepBoundary(ref.id, v, true)},
      {key: 'ArrowDown', run: v => stepBoundary(ref.id, v, false)},
      {key: 'Mod-Shift-.', run: v => triggerSuperComplete(ref.id, v)},
      {key: 'Mod-Shift->', run: v => triggerSuperComplete(ref.id, v)},
      {key: 'Ctrl-Shift--', run: v => { splitCell(ref.id, v); return true; }},
      {key: 'Ctrl-Shift-_', run: v => { splitCell(ref.id, v); return true; }},
      {key: 'Mod-Shift-j', run: () => true},
      {key: 'Mod-Shift-k', run: v => { switchCellType(ref.id, v, 'note'); return true; }},
      {key: 'Mod-Shift-l', run: v => { switchCellType(ref.id, v, 'prompt'); return true; }},
      {key: 'Mod-Shift-;', run: v => { switchCellType(ref.id, v, 'raw'); return true; }},
      {key: 'Mod-Shift-d', run: () => { document.getElementById('brain-btn')?.click(); return true; }},
      {key: smartExpandKey, run: v => smartExpandSelection(v)},
      {key: smartShrinkKey, run: v => smartShrinkSelection(v)},
      {key: jumpLastKey, run: () => { jumpToLastCell(ref.id); return true; }},
      {key: 'Alt-Shift-n', run: () => { newCodeCell(); return true; }},
      {key: 'Shift-Escape', run: () => { exitCell(ref.id); return true; }},
      {key: 'Enter', run: v => {
        if (ac.completionStatus(v.state) !== 'active') return false;
        if (ac.selectedCompletionIndex(v.state) != null) return ac.acceptCompletion(v);
        return getServerPrefs().enterComp ? acceptOrPickFirst(v) : false;
      }},
      {key: 'Escape', run: v => {
        if (v.state.field(sigHelpField, false)) { v.dispatch({effects: setSigHelp.of(null)}); return true; }
        if (ac.completionStatus(v.state)) return ac.closeCompletion(v);
        if (v.state.field(ghostField, false)) { cancelGhost(ref.id, v); return true; }
        if (search.searchPanelOpen(v.state)) return search.closeSearchPanel(v);
        if (v.state.selection.ranges.length > 1) return cmds.simplifySelection(v);
        exitCell(ref.id);
        return true;
      }},
      {key: 'Tab', run: v => {
        if (getServerPrefs().enterComp) {
          if (acceptGhost(ref.id, v)) return true;
          return cmds.indentWithTab.run(v);
        }
        if (acceptOrPickFirst(v)) return true;
        return cmds.indentWithTab.run(v);
      }, shift: v => {
        if (v.state.selection.main.empty && fimEnabled() && !v.state.field(sigHelpField, false)) {
          triggerSigHelp(ref.id, v);
          return true;
        }
        return cmds.indentWithTab.shift(v);
      }},
    ]));

    const vscodeKeys = view.keymap.of([
      {key: 'Mod-/', run: cmds.toggleLineComment},
      {key: 'Mod-d', run: search.selectNextOccurrence, preventDefault: true},
      {key: 'Mod-Shift-b', run: search.selectSelectionMatches},
      {key: 'Alt-ArrowUp', run: cmds.moveLineUp},
      {key: 'Alt-ArrowDown', run: cmds.moveLineDown},
      {key: 'Shift-Alt-ArrowUp', run: cmds.copyLineUp},
      {key: 'Shift-Alt-ArrowDown', run: cmds.copyLineDown},
      {key: 'Mod-]', run: cmds.indentMore},
      {key: 'Mod-[', run: cmds.indentLess},
      {key: 'Mod-Shift-[', run: lang.foldCode},
      {key: 'Mod-Shift-]', run: lang.unfoldCode},
      {key: 'Mod-Alt-[', run: lang.foldCode},
      {key: 'Mod-Alt-]', run: lang.unfoldCode},
      {key: 'Mod-f', run: search.openSearchPanel},
      {key: 'Mod-h', run: search.openSearchPanel},
      {key: 'Mod-g', run: search.findNext},
      {key: 'Mod-Shift-g', run: search.findPrevious},
      {key: 'F3', run: search.findNext},
      {key: 'Shift-F3', run: search.findPrevious},
      {key: 'Mod-Space', run: ac.startCompletion},
      {key: 'Mod-i', run: ac.startCompletion},
      ...(prefs.autoClose ? ac.closeBracketsKeymap : []),
      ...ac.completionKeymap.filter(k => k.key !== 'Enter'),
      ...search.searchKeymap,
      ...cmds.historyKeymap,
      ...cmds.defaultKeymap,
      ...lang.foldKeymap,
    ]);

    return [
      solveitKeys,
      vscodeKeys,
      langComp.of(python.python()),
      themeComp.of(themeExtensions(cm)),
      readOnlyComp.of(state.EditorState.readOnly.of(false)),
      ghostField,
      sigHelpField,
      aiEditField,
      prefs.autoClose ? ac.closeBrackets() : autoSurroundExt,
      sigKeyHandler,
      cmds.history(),
      state.EditorState.allowMultipleSelections.of(true),
      view.drawSelection(),
      view.dropCursor(),
      view.rectangularSelection(),
      view.crosshairCursor(),
      view.highlightActiveLine(),
      view.placeholder(`${(kernelLang() || 'python').replace(/^./, c => c.toUpperCase())}…`),
      view.EditorView.lineWrapping,
      lang.indentUnit.of('    '),
      lang.indentOnInput(),
      lang.bracketMatching(),
      lang.codeFolding({placeholderText: '…'}),
      indentGuidesExt,
      rainbowBracketsExt,
      search.search({top: false}),
      search.highlightSelectionMatches(),
      ac.autocompletion({
        override: [kernelComplete, wordComplete],
        activateOnTyping: true,
        defaultKeymap: false,
        selectOnOpen: false,
        interactionDelay: 0,
      }),
      view.tooltips({parent: getTooltipPortal(), position: 'fixed'}),
      view.EditorView.updateListener.of(u => {
        const curId = ref.id;
        states.set(curId, u.state);
        if (u.docChanged) {
          const el = getCellEl(curId);
          if (el) {
            if (u.state.doc.toString() !== getCellText(el)) dirtyIds.add(curId);
            else { dirtyIds.delete(curId); failedSaves.delete(curId); }
            syncSaveState(curId);
          }
          if (u.view.hasFocus && u.state.selection.main.empty) scheduleGhost(curId, u.view);
          else cancelGhost(curId, u.view);
          let line1Changed = false;
          const l1End = u.startState.doc.line(1).to;
          u.changes.iterChangedRanges(fromA => { if (fromA <= l1End) line1Changed = true; });
          if (line1Changed) syncCellLanguage(curId, u.view);
        } else if (u.selectionSet) {
          clearTimeout(ghostTimers.get(curId));
          ghostTimers.delete(curId);
        }
        if (!u.view.hasFocus && ed.activeKey !== curId && !pendingSaves.has(curId) && !dirtyIds.has(curId) && !hasFolds(cm, u.state) && !CORE.optimistic?.isPending?.(curId)) {
          queueMicrotask(() => {
            const k = ref.id, cur = views.get(k);
            if (cur && !cur.view.hasFocus && ed.activeKey !== k && !pendingSaves.has(k) && !dirtyIds.has(k) && !hasFolds(cm, cur.view.state) && !CORE.optimistic?.isPending?.(k)) unmountCell(k);
          });
        }
      }),
    ];
  }

/* #0f3850db */
async function openCell(id, selSpec = null) {
    if (ed.destroyed) return;
    const cm = cmCache || await loadCM();
    cmCache = cm;
    if (ed.destroyed) return;
    const el = getCellEl(id), card = getCardIn(el);
    if (!el || !card || hasDiff(el) || card.classList.contains('collapsed')) return;
    if (autoEditGuard && autoEditGuard.id !== id) clearAutoEditGuard();
    const text = getCellText(el);
    ed.openView(id, {
      el, card, text, cm, selSpec,
      hostClass: 'craft-cm-host craft-c2-host',
      extraRec: {langKey: 'python'},
      themeExts: themeExtensions(cm),
      prepareState: ref => {
        const comps = {
          langComp: new cm.state.Compartment(), themeComp: new cm.state.Compartment(),
          readOnlyComp: new cm.state.Compartment(),
        };
        const prev = states.get(id);
        const reusePrev = Boolean(prev && prev.doc.toString() === text && prev._c2Comps?.langComp);
        const edState = reusePrev ? prev : cm.state.EditorState.create({doc: text, extensions: buildExtensions(cm, ref, comps)});
        const activeComps = reusePrev ? prev._c2Comps : comps;
        edState._c2Comps = activeComps;
        return {edState, activeComps, reusePrev};
      },
      onExisting: rec => syncCellLanguage(id, rec.view),
      onMounted: rec => { syncCellLanguage(id, rec.view); },
    });
  }


  const onKernelConnected = () => {
    for (const [id, rec] of views) syncCellLanguage(id, rec.view);
  };

  const ac = new AbortController(), sig = {signal: ac.signal};
  on(document.body, 'kernel-connected', onKernelConnected, sig);

  window.__hotkeyRegister?.({
    id: 'c2-new-code', combo: 'Alt+Shift+N', label: 'New code cell at bottom', group: 'Code',
    handler: () => { newCodeCell(); return true; },
  });

  window.craftC2 = {
    manages: id => isC2El(getCellEl(normId(id))),
    edit: (id, opts) => openCell(normId(id), opts),
    active: () => ed.activeKey,
    view: id => views.get(normId(id ?? ed.activeKey))?.view || null,
    exit: id => exitCell(normId(id ?? ed.activeKey)),
    run: (id, cmd = 'run') => saveAndRun(normId(id ?? ed.activeKey), cmd),
    newCodeCell,
    rekey: (oldId, newId, opts) => ed.rekey(normId(oldId), normId(newId), opts),
    abortOptimistic: id => { const nid = normId(id); dirtyIds.delete(nid); failedSaves.delete(nid); states.delete(nid); unmountCell(nid); },
    expectCodeInsertion: () => queueAutoEdit({forceCode: true}),
    guardNonCodeInsertion(existing) {
      nonCodeInsertion = existing;
      return () => { if (nonCodeInsertion === existing) { nonCodeInsertion = null; schedule(); } };
    },
    dirty: () => [...dirtyIds],
    source: () => cmCache?._source || 'pending',
    disable() {
      clearAutoEditGuard();
      ac.abort();
      for (const t of ghostTimers.values()) clearTimeout(t);
      ghostTimers.clear();
      for (const c of ghostAborts.values()) c.abort();
      ghostAborts.clear();
      for (const c of sigAborts.values()) c.abort();
      sigAborts.clear();
      pendingAutoEdits.length = 0;
      unsubCells();
      ed.disable();
      qsa('.editable.craft-c2, .editable[data-c2-save]').forEach(el => patch(el, {classes: {'craft-c2': false}, dataset: {c2Editing: null, c2Save: null}}));
      qsa('.card-out.craft-c2-traceback').forEach(el => el.classList.remove('craft-c2-traceback'));
      qsa('#craft-c2-tooltips').forEach(el => el.remove());
    },
  };
  sync();
})();

/* %% nbs/craft/11_markdown_editor.ipynb #6c51ec83 */
(() => {
  window.craftInlineNote?.disable?.();
  window.craftInlineText?.disable?.();
  if (!window.__craftCMCore?.features?.init?.('markdown-editor', 'Inline Markdown & Raw Editor', 'Obsidian-style Live Preview CM6 editor for note, prompt, and raw cells')) return;
  if (!document.querySelector(window.__craftCMCore.SOLVEIT.sel.dialog)) return;
  if (!document.querySelector('script[data-craft-md="1"]')) {
    const s = document.createElement('script');
    s.src = '/static/.craft-assets/craft_md.js';
    s.dataset.craftMd = '1';
    document.head.append(s);
  }
})();

/* %% nbs/craft/12_mobile.ipynb #83f4bb08 */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"mb_bar": "<nav id=\"craft-mbar\" aria-label=\"Mobile toolbar\" data-mode=\"idle\"><div class=\"craft-mbar-row\" data-row=\"idle\"><button type=\"button\" data-act=\"nav\" aria-label=\"Menu\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 6h16M4 12h16M4 18h16\"></path></svg><span>Menu</span></button><button type=\"button\" data-act=\"files\" aria-label=\"Files\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z\"></path></svg><span>Files</span></button></div><div class=\"craft-mbar-row\" data-row=\"edit\"><button type=\"button\" data-act=\"tab\" aria-label=\"Tab\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 12h13m-4-4 4 4-4 4M20 6v12\"></path></svg><span>Tab</span></button><span class=\"craft-mbar-spacer\"></span><button type=\"button\" data-act=\"run\" aria-label=\"Run\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M7 5v14l11-7z\"></path></svg><span>Run</span></button><button type=\"button\" data-act=\"done\" aria-label=\"Done\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 12.5l4.5 4.5L19 7.5\"></path></svg><span>Done</span></button></div></nav>", "mb_backdrop": "<div id=\"craft-mobile-backdrop\" class=\"craft-mobile-backdrop\"></div>", "mb_jump_btn": "<button id=\"craft-scroll-bottom\" type=\"button\" aria-label=\"Jump to bottom\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 5v14m-6-6 6 6 6-6\"></path></svg></button>", "mb_picker": "<div id=\"craft-edge-picker\" class=\"craft-type-picker\" popover=\"auto\" role=\"menu\" aria-label=\"Insert cell\"><div class=\"craft-type-picker-head craft-edge-picker-head\"></div><div class=\"craft-type-picker-opts craft-edge-picker-opts\"><button class=\"uk-btn uk-btn-default uk-btn-sm\" role=\"menuitem\" data-type=\"Code\" type=\"button\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"17\" height=\"17\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 6l-6 6 6 6m8-12 6 6-6 6M14 4l-4 16\"></path></svg><span>Code</span></button><button class=\"uk-btn uk-btn-default uk-btn-sm\" role=\"menuitem\" data-type=\"Note\" type=\"button\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"17\" height=\"17\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 3h10l4 4v14H5z M15 3v5h4M8 12h8m-8 4h8\"></path></svg><span>Note</span></button><button class=\"uk-btn uk-btn-default uk-btn-sm\" role=\"menuitem\" data-type=\"Prompt\" type=\"button\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"17\" height=\"17\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 4h18v12H9l-6 4z M7 10h.01m5 0h.01m5 0h.01\"></path></svg><span>Prompt</span></button><button class=\"uk-btn uk-btn-default uk-btn-sm\" role=\"menuitem\" data-type=\"Raw\" type=\"button\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"17\" height=\"17\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 5h18v14H3z M7 9v6\"></path></svg><span>Raw</span></button></div></div>", "mb_bulge_above": "<button type=\"button\" class=\"craft-edge-bulge\" data-edge=\"above\" aria-label=\"Insert cell above\"><svg aria-hidden=\"true\" viewbox=\"0 0 36 10\" width=\"36\" height=\"10\"><path class=\"craft-edge-stroke\" d=\"M0 9 C9 9 12 1.5 18 1.5 C24 1.5 27 9 36 9\"></path></svg></button>", "mb_bulge_below": "<button type=\"button\" class=\"craft-edge-bulge\" data-edge=\"below\" aria-label=\"Insert cell below\"><svg aria-hidden=\"true\" viewbox=\"0 0 36 10\" width=\"36\" height=\"10\"><path class=\"craft-edge-stroke\" d=\"M0 1 C9 1 12 8.5 18 8.5 C24 8.5 27 1 36 1\"></path></svg></button>"});

/* %% nbs/craft/12_mobile.ipynb #87343c83 */
(() => { /* iife:mobileBar */
/* #87343c83 */
window.craftMobileBar?.disable();
  const CORE = window.__craftCMCore;
  if (!CORE.features.init('mobile-bar', 'Mobile Bottom Toolbar', 'Mobile editing bar, cell-edge insertion bulges, and tap-to-select')) return;
  const root = document.documentElement;
  const {SOLVEIT, mountTpl, qs, qsa, on, htmxPost, patch, rafOnce, onDomChange, sleep, waitForNewCell, notify, kid} = CORE;
  const ac = new AbortController(), sig = {signal: ac.signal}, cap = {capture: true, signal: ac.signal}, pas = {passive: true, signal: ac.signal};
  const bar = mountTpl('mb_bar'), backdrop = mountTpl('mb_backdrop'), jumpBtn = mountTpl('mb_jump_btn');
  const picker = mountTpl('mb_picker'), bulgeAbove = mountTpl('mb_bulge_above'), bulgeBelow = mountTpl('mb_bulge_below');

  const dialog = () => qs(SOLVEIT.sel.dialog);
  const navEl = () => qs('.uk-container > nav.monster-navbar');

  /* Which inline editor (if any) owns the keyboard right now. */
  const editing = () => {
    const c2 = window.craftC2?.active?.();
    if (c2 && window.craftC2.view(c2)?.hasFocus) return {kind: 'code', id: c2, view: window.craftC2.view(c2)};
    const key = window.craftMd?.active?.(), v = key && window.craftMd.view(key);
    if (v?.hasFocus) {
      const [id, part] = key.split(':');
      return {kind: window.craftMd.kind(key), id, part, key, view: v};
    }
    return null;
  };
  const setBarHidden = hidden => {
    const hide = !!hidden && bar.dataset.mode === 'idle' &&
      !root.classList.contains('craft-nav-open') &&
      !window.solveitFileTree?.isOpen?.();
    bar.toggleAttribute('data-hidden', hide);
    jumpBtn.toggleAttribute('data-dock-hidden', hide);
  };
  const syncMode = () => {
    const ed = editing();
    bar.dataset.mode = ed ? 'edit' : 'idle';
    root.classList.toggle('craft-mobile-editing', !!ed);
    if (ed) setBarHidden(false);
    scheduleBulges();
    const run = qs('[data-act="run"]', bar);
    const runnable = ed && (ed.kind === 'code' || (ed.kind === 'prompt' && ed.part !== 'out'));
    run.hidden = !runnable;
    if (runnable) {
      const label = ed.kind === 'prompt' ? 'Send' : 'Run';
      qs('span', run).textContent = label; run.setAttribute('aria-label', label);
    }
    syncJump();
  };
  let modeTimer = null;
  const scheduleMode = () => { clearTimeout(modeTimer); modeTimer = setTimeout(syncMode, 60); };

  async function closeEditors() {
    if (window.craftC2?.active?.()) await window.craftC2.exit();
    if (window.craftMd?.active?.()) await window.craftMd.exit();
  }
  let adding = false;
  async function addCell(type, where = 'below', targetCell = null) {
    const container = dialog();
    if (!container || adding || window.craftInsertPreview?.isBusy?.()) return;
    adding = true;
    try {
      const editingCell = document.activeElement?.closest?.(SOLVEIT.sel.cell);
      await closeEditors();
      document.activeElement?.blur?.();
      const cells = qsa(SOLVEIT.sel.cellWithId).filter(el => el.getClientRects().length);
      const target = (targetCell?.isConnected && targetCell) || (editingCell?.isConnected && editingCell) || cells.find(el => el.dataset.sm === 'primary') || cells[cells.length - 1];
      if (!window.craftInsertPreview?.insert) return notify('Reload this dialog to enable inserting cells.', 'warning');
      await sleep(0);
      window.craftInsertPreview.insert(where === 'above' ? 'above' : 'below', {type, cell: target || null, force: true});
    } catch (err) {
      console.error('craftMobileBar: add cell failed', err);
      notify('Could not add the cell.', 'warning');
    } finally { adding = false; }
  }

/* #ffa3db5a */
/* ── Cell-edge bulges: attach to the editing cell or primary selected cell ── */
  let bulgeHost = null;
  const detachBulges = () => {
    bulgeAbove.remove(); bulgeBelow.remove();
    bulgeHost = null;
  };
  const activeEditingCell = cells => {
    const c2 = window.craftC2?.active?.();
    if (c2) {
      const el = document.getElementById('_' + String(c2).replace(/^_/, ''));
      if (el && cells.includes(el)) return el;
    }
    const mdKey = window.craftMd?.active?.();
    if (mdKey) {
      const el = document.getElementById('_' + String(mdKey).split(':')[0].replace(/^_/, ''));
      if (el && cells.includes(el)) return el;
    }
    return cells.find(el => el.dataset.c2Editing === 'true' || el.dataset.mdEditing === 'true') || null;
  };
  const syncBulges = () => {
    if (!mounted) return;
    const container = dialog();
    if (!container) { detachBulges(); return; }
    const cells = qsa(SOLVEIT.sel.cellWithId).filter(el => !el.hidden && el.getClientRects().length);
    if (!cells.length) { detachBulges(); return; }
    const target = activeEditingCell(cells) || cells.find(el => el.dataset.sm === 'primary') || null;
    if (target !== bulgeHost) {
      detachBulges();
      if (target) {
        target.append(bulgeAbove, bulgeBelow);
        bulgeHost = target;
      }
    }
  };
  const scheduleBulges = rafOnce(syncBulges);

  /* ── Bulge drag-to-insert + tap-to-pick interaction ── */
  let pickerState = null; // {edge, cell, pointerId, startX, startY, dragged, hotType, tapOpen}
  const setHot = type => {
    if (pickerState) pickerState.hotType = type;
    for (const b of qsa('button[data-type]', picker)) {
      b.toggleAttribute('data-hot', b.dataset.type === type);
    }
  };
  const closePicker = () => {
    bulgeAbove.removeAttribute('data-active');
    bulgeBelow.removeAttribute('data-active');
    if (picker.matches(':popover-open')) picker.hidePopover();
    setHot(null);
    pickerState = null;
  };
  const positionPicker = (anchorRect, edge) => {
    picker.dataset.edge = edge;
    if (!picker.matches(':popover-open')) picker.showPopover();
    qs('.craft-edge-picker-head', picker).textContent = edge === 'above' ? 'Insert above' : 'Insert below';
    const pw = picker.offsetWidth || 280;
    const ph = picker.offsetHeight || 76;
    const cx = anchorRect.left + anchorRect.width / 2;
    const left = Math.max(8, Math.min(cx - pw / 2, innerWidth - pw - 8));
    let top;
    if (edge === 'above') {
      const aboveTop = anchorRect.top - ph - 14;
      top = aboveTop >= 12 ? aboveTop : Math.min(anchorRect.bottom + 14, innerHeight - ph - 12);
    } else {
      const belowTop = anchorRect.bottom + 14;
      top = (belowTop + ph <= innerHeight - 12) ? belowTop : Math.max(12, anchorRect.top - ph - 14);
    }
    picker.style.left = Math.round(left) + 'px';
    picker.style.top = Math.round(top) + 'px';
  };
  const hitOption = (x, y) => {
    const PAD = 10;
    for (const b of qsa('button[data-type]', picker)) {
      const r = b.getBoundingClientRect();
      if (x >= r.left - PAD && x <= r.right + PAD && y >= r.top - PAD && y <= r.bottom + PAD) {
        return b.dataset.type;
      }
    }
    return null;
  };
  const selectCell = cell => {
    const container = dialog();
    if (!container || !cell?.isConnected) return;
    for (const el of qsa(`:scope > .editable:is(${SOLVEIT.sel.selectedCell})`, container)) {
      if (el !== cell) el.setAttribute('data-sm', 'unselected');
    }
    cell.setAttribute('data-sm', 'primary');
  };
  const onBulgePointerDown = e => {
    const handle = e.currentTarget;
    const cell = handle.closest(SOLVEIT.sel.cell);
    if (!cell) return;
    e.preventDefault(); e.stopPropagation();
    const edge = handle.dataset.edge;
    if (pickerState?.tapOpen && pickerState.edge === edge && pickerState.cell === cell) {
      closePicker();
      return;
    }
    closePicker();
    handle.dataset.active = 'true';
    handle.setPointerCapture?.(e.pointerId);
    pickerState = {edge, cell, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, dragged: false, hotType: null, tapOpen: false};
    positionPicker(handle.getBoundingClientRect(), edge);
    if (window.craftC2?.active?.() || window.craftMd?.active?.()) {
      selectCell(cell);
      closeEditors().then(() => {
        if (cell.isConnected) selectCell(cell);
        scheduleMode();
      }).catch(err => console.error('craftMobileBar: commit on bulge failed', err));
    }
  };
  const onBulgePointerMove = e => {
    if (!pickerState || e.pointerId !== pickerState.pointerId || pickerState.tapOpen) return;
    const dist = Math.hypot(e.clientX - pickerState.startX, e.clientY - pickerState.startY);
    if (dist > 8) pickerState.dragged = true;
    if (pickerState.dragged) setHot(hitOption(e.clientX, e.clientY));
  };
  const onBulgePointerUp = e => {
    if (!pickerState || e.pointerId !== pickerState.pointerId || pickerState.tapOpen) return;
    const {edge, cell, dragged, hotType} = pickerState;
    if (dragged) {
      closePicker();
      if (hotType) addCell(hotType, edge, cell);
    } else {
      pickerState.tapOpen = true;
      pickerState.pointerId = null;
    }
  };
  const onBulgePointerCancel = e => {
    if (pickerState && e.pointerId === pickerState.pointerId) closePicker();
  };
  const onBulgeClick = e => { e.preventDefault(); e.stopPropagation(); };
  const bulgeEvs = {pointerdown: onBulgePointerDown, pointermove: onBulgePointerMove, pointerup: onBulgePointerUp, pointercancel: onBulgePointerCancel, click: onBulgeClick};
  for (const b of [bulgeAbove, bulgeBelow]) on(b, bulgeEvs, sig);
  const onPickerClick = e => {
    const opt = e.target.closest('button[data-type]');
    if (!opt || !pickerState) return;
    e.preventDefault(); e.stopPropagation();
    const {edge, cell} = pickerState;
    closePicker();
    addCell(opt.dataset.type, edge, cell);
  };
  on(picker, 'click', onPickerClick, sig);
  on(picker, 'toggle', e => { if (e.newState === 'closed' && pickerState) closePicker(); }, sig);

/* #cc9a7fbd */
/* After Run/Send the output lands below the fold: keep the cell in view while it grows,
     until it has been still for ~10s or the user scrolls on their own. */
  let stopFollow = null;
  function followCell(id) {
    stopFollow?.();
    const el = document.getElementById('_' + String(id).replace(/^_/, ''));
    if (!el) return;
    let quietTimer = null, offStop = null;
    const stop = () => {
      ro.disconnect(); clearTimeout(quietTimer); clearTimeout(cap);
      offStop?.();
      if (stopFollow === stop) stopFollow = null;
    };
    const bump = () => {
      if (!el.isConnected) return stop();
      el.scrollIntoView({block: 'nearest'});
      clearTimeout(quietTimer);
      quietTimer = setTimeout(stop, 10000);
    };
    const ro = new ResizeObserver(bump);
    ro.observe(el);
    bump();
    const cap = setTimeout(stop, 120000);
    offStop = on(window, 'touchstart wheel', stop, {capture: true, passive: true});
    stopFollow = stop;
  }

  /* Run the editor's own Tab binding (accepts completions, indents); plain indent if nothing handled it. */
  function pressTab({view, kind}) {
    const ev = new KeyboardEvent('keydown', {key: 'Tab', code: 'Tab', keyCode: 9, bubbles: true, cancelable: true});
    view.contentDOM.dispatchEvent(ev);
    if (!ev.defaultPrevented) view.dispatch(view.state.replaceSelection(kind === 'code' ? '    ' : '  '));
    view.focus();
  }

  const toggleNav = force => {
    const open = root.classList.toggle('craft-nav-open', force);
    qs('[data-act="nav"]', bar).setAttribute('aria-pressed', String(open));
    if (open) setBarHidden(false);
  };

  const actions = {
    nav: () => toggleNav(),
    files: () => { toggleNav(false); setBarHidden(false); window.solveitFileTree?.toggle(false); },
    tab: () => { const ed = editing(); if (ed) pressTab(ed); },
    run: () => {
      const ed = editing();
      if (!ed) return;
      if (ed.kind === 'code') window.craftC2.run(ed.id, 'run');
      else if (ed.kind === 'prompt' && ed.part !== 'out') window.craftMd.run(ed.id, 'run');
      else return;
      followCell(ed.id);
    },
    done: () => {
      const ed = editing();
      if (!ed) return;
      if (ed.kind === 'code') window.craftC2.exit(ed.id); else window.craftMd.exit(ed.key);
    },
  };
  const onBarMouseDown = e => { if (e.target.closest('button')) e.preventDefault(); };  // keep the editor (and soft keyboard) focused
  const onBarClick = e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    Promise.resolve(actions[b.dataset.act]?.(b)).catch(err => console.error('craftMobileBar', err)).finally(scheduleMode);
  };
  on(bar, {mousedown: onBarMouseDown, click: onBarClick}, sig);
  on(backdrop, 'click', () => window.solveitFileTree?.close?.(), sig);

  /* ── Scroll-hiding floating dock & jump-to-bottom button ── */
  let scrollerEl = null, lastScrollY = 0;
  const scrollMetrics = () => {
    const sc = dialog();
    if (sc && sc.scrollHeight > sc.clientHeight + 4) {
      return {el: sc, top: sc.scrollTop, height: sc.scrollHeight, client: sc.clientHeight};
    }
    const doc = document.scrollingElement || document.documentElement;
    return {el: window, top: window.scrollY || doc.scrollTop, height: doc.scrollHeight, client: window.innerHeight};
  };
  const syncJump = () => {
    if (!mounted || bar.dataset.mode === 'edit' || !dialog()) { jumpBtn.classList.remove('visible'); return; }
    const m = scrollMetrics();
    const distFromBottom = m.height - m.top - m.client;
    jumpBtn.classList.toggle('visible', distFromBottom > 360);
  };
  const onScroll = () => {
    if (!mounted) return;
    if (pickerState?.tapOpen) closePicker();
    const m = scrollMetrics();
    const dy = m.top - lastScrollY;
    lastScrollY = m.top;
    const distFromBottom = m.height - m.top - m.client;
    if (m.top < 40 || distFromBottom < 40) setBarHidden(false);
    else if (dy > 14) setBarHidden(true);
    else if (dy < -10) setBarHidden(false);
    syncJump();
  };
  let offScroll = null;
  const bindScroller = () => {
    const next = dialog();
    if (next === scrollerEl) return;
    offScroll?.();
    scrollerEl = next;
    offScroll = on(scrollerEl, 'scroll', onScroll, {passive: true});
    lastScrollY = scrollMetrics().top;
    syncJump();
  };
  on(jumpBtn, 'click', e => {
    e.preventDefault(); e.stopPropagation();
    const m = scrollMetrics();
    (m.el === window ? window : m.el).scrollTo({top: m.height, behavior: 'smooth'});
  }, sig);

/* #730a733f */
/* ── Tap-to-select first on mobile ──
     Tapping an unselected cell (or a different cell while editing another) selects
     it first instead of immediately opening the inline editor and soft keyboard.
     A second tap into the already-selected cell opens the editor normally. */
  let guardedTapCell = null, guardClearTimer = null;
  const INTERACTIVE_SEL = 'button, a, input, textarea, select, summary, label, .craft-edge-bulge, .craft-action-trigger, .craft-table-copy, .craft-omit-marker, .craft-part-restore, .cm-editor';
  const isEditingOther = cell => {
    const c2 = window.craftC2?.active?.();
    if (c2 && ('_' + String(c2).replace(/^_/, '')) !== cell.id) return true;
    const md = window.craftMd?.active?.();
    if (md && ('_' + String(md).split(':')[0].replace(/^_/, '')) !== cell.id) return true;
    return false;
  };
  const onWinMouseDown = e => {
    if (!mounted || e.button !== 0) return;
    const t = e.target;
    if (!(t instanceof Element) || t.closest(INTERACTIVE_SEL)) return;
    const cell = t.closest(SOLVEIT.sel.cellWithId);
    if (!cell) return;
    const editingOther = isEditingOther(cell);
    if (cell.dataset.sm === 'primary' && !editingOther) return;
    guardedTapCell = cell;
    clearTimeout(guardClearTimer);
    guardClearTimer = setTimeout(() => { guardedTapCell = null; }, 800);
    e.stopPropagation();
    selectCell(cell);
    if (editingOther) {
      closeEditors().then(() => {
        if (cell.isConnected) selectCell(cell);
        scheduleMode();
      }).catch(err => console.error('craftMobileBar: close on cell switch failed', err));
    }
  };
  const onWinTapFinish = e => {
    if (!guardedTapCell) return;
    const t = e.target;
    if (t instanceof Element && guardedTapCell.contains(t) && !t.closest(INTERACTIVE_SEL)) {
      e.stopPropagation();
      if (e.type === 'click') {
        e.preventDefault();
        guardedTapCell = null;
      }
    } else if (e.type === 'click') {
      guardedTapCell = null;
    }
  };

  /* Tapping outside the revealed top nav (and outside its dropdowns) hides it again;
     tapping outside a tap-opened edge picker dismisses it. */
  const onDocPointerDown = e => {
    const t = e.target;
    if (!root.classList.contains('craft-nav-open')) return;
    if (bar.contains(t) || navEl()?.contains(t) || t.closest?.('#craft-mobile-toggle, .uk-drop, .uk-dropdown, .uk-modal, [role="dialog"]')) return;
    toggleNav(false);
  };
  on(document, 'pointerdown', onDocPointerDown, cap);

  /* Observe DOM updates for: temp editor auto-close, selected cell changes, scroller changes. */
  const onDomMut = () => {
    if (!mounted) return;
    if (window.craftMobile?.active() && qs('#solveit-temp-editor[open], #solveit-temp-editor.open') && window.solveitFileTree?.isOpen?.()) window.solveitFileTree.close();
    bindScroller();
    scheduleBulges();
  };

  /* Soft keyboard: lift the bar above it when the browser only shrinks the visual viewport. */
  /* Only while something editable has focus (the keyboard can't be up otherwise), so a zoomed or oddly sized
     layout viewport never strands the bar mid-screen. With interactive-widget=resizes-content this stays 0. */
  const vv = window.visualViewport;
  const place = () => {
    if (!vv) return;
    const a = document.activeElement;
    const typing = a && a !== document.body && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
    const kb = typing ? Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) : 0;
    root.style.setProperty('--craft-kb', (kb > 120 ? kb : 0) + 'px');
  };
  on(vv, 'resize scroll', place, sig);
  on(window, 'resize', place, sig);
  on(window, 'scroll', onScroll, pas);
  on(document, 'focusin focusout', place, cap);
  on(document, 'focusin focusout', scheduleMode, cap);
  const settleEvent = ['htmx', 'after', 'settle'].join(window.htmx?.config?.metaCharacter || ':');
  on(document, settleEvent, () => { scheduleMode(); bindScroller(); scheduleBulges(); }, sig);

  let mounted = false, offMount = null, offDom = null;
  const mount = active => {
    if (active && !mounted) {
      document.body.append(backdrop, bar, jumpBtn, picker);
      offMount = on(window, {mousedown: onWinMouseDown, mouseup: onWinTapFinish, click: onWinTapFinish}, true);
      offDom = onDomChange(onDomMut, {attrs: ['class', 'data-sm', 'data-c2-editing', 'data-md-editing', 'hidden'], delay: 0});
      mounted = true; bindScroller(); syncMode(); place(); syncBulges();
    } else if (!active && mounted) {
      guardedTapCell = null; clearTimeout(guardClearTimer);
      offMount?.(); offMount = null;
      offDom?.(); offDom = null;
      closePicker(); detachBulges();
      bar.remove(); backdrop.remove(); jumpBtn.remove(); picker.remove();
      toggleNav(false);
      offScroll?.(); offScroll = null; scrollerEl = null;
      root.classList.remove('craft-mobile-editing');
      mounted = false;
    }
  };
  const start = () => mount(!!window.craftMobile?.active());
  const offChange = window.craftMobile?.onChange(mount);
  if (document.body) start(); else on(document, 'DOMContentLoaded', start, {once: true, signal: ac.signal});

  window.craftMobileBar = {
    addCell,
    disable() {
      offChange?.(); mount(false); clearTimeout(modeTimer); scheduleBulges.cancel();
      ac.abort();
      root.style.removeProperty('--craft-kb');
      delete window.craftMobileBar;
    },
  };
})();

/* %% nbs/craft/13_context_control.ipynb #1dc6810b */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"ctx_staging_bar": "<div id=\"craft-ab-bar\" role=\"region\" aria-label=\"All-But context staging\"><span class=\"craft-ab-summary\" data-ref=\"summary\"></span><select class=\"uk-select craft-ab-preset\" aria-label=\"Context presets\" data-ref=\"preset\"><option value=\"\">Presets…</option></select><button class=\"uk-btn uk-btn-default uk-btn-xs craft-ab-save\" data-ref=\"save\" type=\"button\">Save preset</button><button class=\"uk-btn uk-btn-default uk-btn-xs craft-ab-perm\" data-ref=\"perm\" type=\"button\">Apply perm</button><button class=\"uk-btn uk-btn-primary uk-btn-xs craft-ab-run\" data-ref=\"run\" type=\"button\">Run prompt</button><button class=\"uk-btn uk-btn-default uk-btn-xs craft-ab-cancel\" data-ref=\"cancel\" type=\"button\">Cancel</button></div>", "ctx_recover_bar": "<div id=\"craft-ab-recover\" role=\"alert\"><span class=\"craft-ab-rec-msg\" data-ref=\"msg\">Pre-All-But cell visibility snapshot detected.</span><button class=\"uk-btn uk-btn-primary uk-btn-xs\" data-ref=\"restore\" type=\"button\">Restore pre-All-But visibility</button><button class=\"uk-btn uk-btn-default uk-btn-xs\" data-ref=\"dismiss\" type=\"button\">Dismiss</button></div>", "ctx_meter": "<button id=\"craft-ctx-meter\" type=\"button\" class=\"craft-ctx-meter\" title=\"Active AI context budget (click to preview what the AI sees)\" aria-label=\"Active AI context budget\"><span class=\"craft-ctx-meter-val\" data-ref=\"val\">0 tok</span></button>", "ctx_preview_modal": "<dialog class=\"craft-overlay\" id=\"craft-ai-preview\" aria-label=\"What the AI Sees preview\"><div class=\"uk-card craft-card craft-ctx-prev-card\"><div class=\"craft-modal-head\"><strong>What the AI Sees</strong><span class=\"craft-ctx-prev-total\" data-ref=\"total\"></span><button type=\"button\" class=\"craft-modal-x\" aria-label=\"Close\" data-ref=\"close\">×</button></div><div class=\"craft-ctx-prev-note\">Approximation of dialog cells sent to the AI. Server-side system prompts, tool schemas, and CRAFT.ipynb injections are not inspectable from the client.</div><div class=\"craft-ctx-prev-list\" data-ref=\"list\"></div><div class=\"craft-modal-foot\"><button class=\"uk-btn uk-btn-default uk-btn-xs\" data-ref=\"heat\" type=\"button\">Toggle heat strip</button><button class=\"uk-btn uk-btn-default uk-btn-xs\" data-ref=\"savePreset\" type=\"button\">Save as preset</button><button class=\"uk-btn uk-btn-primary uk-btn-xs\" data-ref=\"done\" type=\"button\">Close</button></div></div></dialog>", "ctx_tb_fix_btn": "<button type=\"button\" class=\"craft-tb-fix-btn\" title=\"Insert a prompt below and run All-But scoped to this failing cell and traceback\">Ask AI about this error</button>"});

/* %% nbs/craft/13_context_control.ipynb #8e750387 */
(() => { /* iife:craftContext */
/* #8e750387 */
window.craftContext?.disable?.();
if (!document.getElementById('dialog-container')) return;

const CORE = window.__craftCMCore;
if (!CORE || !CORE.features.init('context-control', 'Context Control', 'All-But scoping, Context Lenses, Presets, Budget Meter, Traceback Quick-Fix')) return;
const {
  el, qs, qsa, on, store, mountTpl, mountModal, htmxPost, onCells, onDomChange, SOLVEIT,
  notify, notifyErr, kid, normId, getCellEl, typingBlocked,
  allCells, selectedCells, primaryCell, cellMtype, dlgKey,
  waitForHtmxSettle, waitForNewCell, onCellHtmx, headingLevel, mountBar,
} = CORE;
const ac = new AbortController(), sig = {signal: ac.signal}, cap = {capture: true, signal: ac.signal};

const snapKey = () => `craft-allbut:${kid() || dlgKey()}`;
const presetKey = () => `craft-ctx-presets:${dlgKey()}`;
const HEAT_KEY = 'craft-ctx-heat';

const isHiddenFromAI = cell => !!cell?.querySelector(SOLVEIT.sel.skipActive);
const isPinned = cell => !!cell?.querySelector('button[hx-post="/toggle_pin_"] use[href="#lc-pin"]');
const hasTraceback = cell => {
  const out = cell?.querySelector(SOLVEIT.sel.cardOut);
  if (!out) return false;
  if (out.matches(`:has(${SOLVEIT.sel.ansiRed}, .ansi-red-intense-fg)`)) return true;
  return /Traceback \(most recent call last\)|Error:|Exception:/i.test(out.textContent || '');
};

const parseTokenNum = raw => {
  const s = String(raw || '').replace(/,/g, '').trim();
  const m = s.match(/(\d+(?:\.\d+)?)\s*([kKmM])?/);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  if (m[2]?.toLowerCase() === 'k') n *= 1000;
  else if (m[2]?.toLowerCase() === 'm') n *= 1e6;
  return Math.round(n);
};

const cellTokens = cell => {
  if (!cell) return 0;
  const attrs = qsa('[data-tokens]', cell);
  if (attrs.length) {
    let sum = 0;
    for (const a of attrs) sum += parseTokenNum(a.getAttribute('data-tokens'));
    if (sum > 0) return sum;
  }
  const hdrs = qsa(`:scope > .msg-card > ${SOLVEIT.sel.cardHeader} nav > div.grow`, cell);
  let sum = 0;
  for (const h of hdrs) {
    const m = (h.textContent || '').match(/(?:Code|Note|Prompt|Raw|Output|Assistant|You)\s*[:·]\s*([\d,]+)/i);
    if (m) sum += parseTokenNum(m[1]);
  }
  if (sum > 0) return sum;
  const txt = (cell.textContent || '').trim();
  return txt ? Math.max(1, Math.ceil(txt.length / 4)) : 0;
};

const fmtTok = n => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

async function setHiddenFromAI(cell, wantHidden) {
  if (!cell || !cell.isConnected) return false;
  if (isHiddenFromAI(cell) === wantHidden) return true;
  const btn = cell.querySelector(SOLVEIT.sel.skipBtn);
  if (btn) {
    btn.click();
  } else {
    try { await htmxPost(SOLVEIT.api.toggleSkip, {id_: cell.id, ids: cell.id}); }
    catch (err) { console.error('craftContext: toggle_skip failed', err); return false; }
  }
  return Boolean(await waitForHtmxSettle(() => {
    const cur = document.getElementById(cell.id);
    return cur && isHiddenFromAI(cur) === wantHidden;
  }, 1200));
}

const getHeadingLevel = cell => {
  const sh = cell?.getAttribute('data-sm-header');
  return (sh && /^[1-6]$/.test(sh)) ? +sh : headingLevel(cell);
};

const getSectionCells = startCell => {
  const all = allCells();
  const idx = all.indexOf(startCell);
  if (idx < 0) return [];
  let headIdx = idx, headLvl = getHeadingLevel(startCell);
  if (!headLvl) {
    for (let i = idx - 1; i >= 0; i--) {
      const l = getHeadingLevel(all[i]);
      if (l) { headIdx = i; headLvl = l; break; }
    }
  }
  if (!headLvl) return [startCell];
  const out = [all[headIdx]];
  for (let i = headIdx + 1; i < all.length; i++) {
    const l = getHeadingLevel(all[i]);
    if (l && l <= headLvl) break;
    out.push(all[i]);
  }
  return out;
};

/* ── Saved Context Presets (1.3) ───────────────────────────────────── */
const loadPresets = () => {
  const raw = store.json(presetKey(), {}) || {};
  const existing = new Set(allCells().map(c => normId(c.id)));
  const cleaned = {};
  let mutated = false;
  for (const [name, ids] of Object.entries(raw)) {
    if (!Array.isArray(ids)) continue;
    const valid = ids.map(normId).filter(id => !existing.size || existing.has(id));
    if (valid.length !== ids.length) mutated = true;
    cleaned[name] = valid;
  }
  if (mutated && existing.size) store.setJson(presetKey(), cleaned);
  return cleaned;
};

const savePreset = (name, ids) => {
  const n = String(name || '').trim();
  if (!n) return false;
  const presets = loadPresets();
  presets[n] = [...new Set(ids.map(normId))];
  store.setJson(presetKey(), presets);
  return true;
};

const deletePreset = name => {
  const presets = loadPresets();
  if (!(name in presets)) return false;
  delete presets[name];
  store.setJson(presetKey(), presets);
  return true;
};

/* #b57c3759 */
/* ── Staging & Transactional Apply/Restore (1.1) ───────────────────── */
let staging = null; // {scopeIds: Set<id>, preHiddenIds: Set<id>, label: string, applying: bool, running: bool}
const stagingBar = mountBar('ctx_staging_bar'), recoverBar = mountBar('ctx_recover_bar');
let stagingWired = false, recoverWired = false, restoreWatch = null;

const readSnapshot = () => store.json(snapKey(), null, sessionStorage);
const writeSnapshot = snap => snap ? store.setJson(snapKey(), snap, sessionStorage) : store.del(snapKey(), sessionStorage);

function clearStagingVisuals() {
  document.documentElement.classList.remove('craft-ab-staging');
  for (const c of allCells()) c.classList.remove('craft-ab-included');
}

function syncStagingUI() {
  if (!staging) {
    clearStagingVisuals();
    stagingBar.hide();
    return;
  }
  document.documentElement.classList.add('craft-ab-staging');
  const cells = allCells();
  let scopeTok = 0, totalTok = 0;
  for (const c of cells) {
    const id = normId(c.id);
    const inc = staging.scopeIds.has(id);
    c.classList.toggle('craft-ab-included', inc);
    const t = cellTokens(c);
    totalTok += t;
    if (inc) scopeTok += t;
  }
  const b = stagingBar.show();
  if (!stagingWired) {
    stagingWired = true;
    on(b.cancel, 'click', () => cancelStaging(), sig);
    on(b.run, 'click', () => applyAndRun(), sig);
    on(b.perm, 'click', () => applyPermanent(), sig);
    on(b.save, 'click', () => {
      const name = prompt('Save current context selection as preset:');
      if (name && savePreset(name, [...staging.scopeIds])) {
        refreshPresetDropdown();
        notify(`Saved preset "${name}".`, 'success');
      }
    }, sig);
    on(b.preset, 'change', () => {
      const name = b.preset.value;
      if (!name) return;
      const presets = loadPresets();
      if (presets[name]) {
        staging.scopeIds = new Set(presets[name]);
        staging.label = `Preset: ${name}`;
        syncStagingUI();
      }
      b.preset.value = '';
    }, sig);
  }
  b.summary.textContent = `${staging.label}: ${staging.scopeIds.size} ${staging.scopeIds.size === 1 ? 'cell' : 'cells'} · ~${fmtTok(scopeTok)} / ${fmtTok(totalTok)} tokens · Click cells to toggle · Esc to cancel`;
  refreshPresetDropdown();
}

function refreshPresetDropdown() {
  const b = stagingBar.current;
  if (!b?.preset) return;
  const presets = loadPresets();
  b.preset.replaceChildren(
    el('option', {value: ''}, 'Presets…'),
    ...Object.keys(presets).sort().map(n => el('option', {value: n}, `${n} (${presets[n].length})`))
  );
}

function enterStaging(ids, label = 'All-But') {
  const scopeIds = new Set(ids.map(normId).filter(Boolean));
  const preHiddenIds = new Set(allCells().filter(isHiddenFromAI).map(c => normId(c.id)));
  staging = {scopeIds, preHiddenIds, label, applying: false, running: false};
  writeSnapshot({
    kid: kid(),
    preHiddenIds: [...preHiddenIds],
    scopeIds: [...scopeIds],
    label,
    applied: false,
    ts: Date.now(),
  });
  syncStagingUI();
}

function cancelStaging() {
  if (!staging) return;
  staging = null;
  writeSnapshot(null);
  syncStagingUI();
}

async function applyPermanent(ids = null) {
  const scope = new Set((ids || (staging ? [...staging.scopeIds] : [])).map(normId));
  if (!scope.size) return;
  staging = null;
  writeSnapshot(null);
  syncStagingUI();
  for (const c of allCells()) {
    const wantHidden = !scope.has(normId(c.id));
    if (isHiddenFromAI(c) !== wantHidden) await setHiddenFromAI(c, wantHidden);
  }
  updateMeter();
}

async function restoreFromSnapshot(snap = null) {
  const s = snap || readSnapshot();
  if (!s) return;
  const preHidden = new Set((s.preHiddenIds || []).map(normId));
  for (const c of allCells()) {
    const wantHidden = preHidden.has(normId(c.id));
    if (isHiddenFromAI(c) !== wantHidden) await setHiddenFromAI(c, wantHidden);
  }
  writeSnapshot(null);
  recoverBar.hide();
  staging = null;
  syncStagingUI();
  updateMeter();
}

function watchRunCompletion(snap) {
  if (restoreWatch) { restoreWatch(); restoreWatch = null; }
  let sawBusy = false, idleTicks = 0, done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    clearInterval(timer);
    offStop?.();
    offReq?.();
    restoreWatch = null;
  };
  const finish = async () => {
    if (done) return;
    cleanup();
    await restoreFromSnapshot(snap);
  };
  const isRunning = () => !!qs(`${SOLVEIT.sel.running}, ${SOLVEIT.sel.dialog} .uk-spinner`);
  const offReq = on(document, 'htmx:beforeRequest', e => {
    const p = String(e.detail?.path || '');
    if (p.includes(SOLVEIT.api.addRunq) || p.includes('/run_')) sawBusy = true;
  }, sig);
  const timer = setInterval(() => {
    if (isRunning()) { sawBusy = true; idleTicks = 0; }
    else {
      idleTicks++;
      if (sawBusy && idleTicks >= 3) finish();
      else if (!sawBusy && idleTicks >= 25) { cleanup(); checkRecoveryBanner(); }
    }
  }, 400);
  const offStop = on(window, 'keydown', e => {
    if (e.shiftKey && e.key.toLowerCase() === 's' && !typingBlocked()) setTimeout(finish, 300);
  }, {capture: true, signal: ac.signal});
  restoreWatch = cleanup;
}

async function applyDiffForOneShot() {
  if (!staging || staging.applying) return null;
  staging.applying = true;
  const snap = {
    kid: kid(),
    preHiddenIds: [...staging.preHiddenIds],
    scopeIds: [...staging.scopeIds],
    label: staging.label,
    applied: true,
    ts: Date.now(),
  };
  writeSnapshot(snap);
  const scope = staging.scopeIds;
  for (const c of allCells()) {
    const wantHidden = !scope.has(normId(c.id));
    if (isHiddenFromAI(c) !== wantHidden) await setHiddenFromAI(c, wantHidden);
  }
  staging.running = true;
  clearStagingVisuals();
  stagingBar.hide();
  staging = null;
  updateMeter();
  return snap;
}

async function applyAndRun(promptCellId = null) {
  if (!staging) return;
  const targetId = normId(promptCellId) ||
    [...staging.scopeIds].reverse().find(id => cellMtype(getCellEl(id)) === 'prompt') ||
    [...staging.scopeIds].at(-1);
  const snap = await applyDiffForOneShot();
  if (!snap) return;
  if (targetId && getCellEl(targetId)) {
    await CORE.runCellCmd({id: targetId, cmd: 'run', tag: 'craftContext'});
  }
  watchRunCompletion(snap);
}

function checkRecoveryBanner() {
  const snap = readSnapshot();
  if (!snap || !snap.applied || staging) { recoverBar.hide(); return; }
  const b = recoverBar.show();
  if (!recoverWired) {
    recoverWired = true;
    on(b.restore, 'click', () => restoreFromSnapshot(), sig);
    on(b.dismiss, 'click', () => { writeSnapshot(null); recoverBar.hide(); }, sig);
  }
}

/* Intercept clicks in staging mode to toggle cell inclusion, and Esc to cancel */
on(document, 'click', e => {
  if (!staging) return;
  if (stagingBar?.root?.contains(e.target)) return;
  const cell = e.target.closest?.(SOLVEIT.sel.cellWithId);
  if (!cell) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const id = normId(cell.id);
  if (staging.scopeIds.has(id)) staging.scopeIds.delete(id);
  else staging.scopeIds.add(id);
  syncStagingUI();
}, cap);

on(window, 'keydown', e => {
  if (!staging) return;
  if (e.key === 'Escape' && !e.isComposing) {
    e.preventDefault();
    e.stopImmediatePropagation();
    cancelStaging();
  }
}, cap);

/* Intercept prompt run requests while staging so normal Mod+Enter / Send button triggers All-But */
onCellHtmx([SOLVEIT.api.addRunq, SOLVEIT.api.continuePrompt], ({id, event}) => {
  if (!staging || staging.applying) return;
  if (id && cellMtype(getCellEl(id)) === 'prompt') {
    event.preventDefault();
    staging.scopeIds.add(id);
    applyAndRun(id);
  }
}, sig);

/* ── Context Lenses (1.2) ──────────────────────────────────────────── */
const lensAllBut = (cell = primaryCell()) => {
  const sel = selectedCells();
  const targets = sel.length > 1 ? sel : (cell ? [cell] : []);
  if (!targets.length) return notifyErr('Select a cell first for All-But.', 'craftContext');
  enterStaging(targets.map(c => c.id), 'All-But');
};

const lensHeadingSection = (cell = primaryCell()) => {
  const target = cell || primaryCell();
  if (!target) return notifyErr('Select a cell first.', 'craftContext');
  const sec = getSectionCells(target);
  enterStaging(sec.map(c => c.id), 'Section Lens');
};

const lensPinnedPlus = (cell = primaryCell()) => {
  const ids = allCells().filter(isPinned).map(c => c.id);
  if (cell) ids.push(cell.id);
  if (!ids.length) return notifyErr('No pinned or selected cells found.', 'craftContext');
  enterStaging(ids, 'Pinned + Cell');
};

const lensCodeAndErrors = () => {
  const ids = allCells().filter(c => cellMtype(c) === 'code' || hasTraceback(c)).map(c => c.id);
  if (!ids.length) return notifyErr('No code or traceback cells found.', 'craftContext');
  enterStaging(ids, 'Code + Errors');
};

const lensLastN = (n = null) => {
  let count = n;
  if (count == null) {
    const raw = prompt('Include last N cells in context:', '5');
    if (raw == null) return;
    count = Math.max(1, parseInt(raw, 10) || 5);
  }
  const cells = allCells().slice(-count);
  if (!cells.length) return;
  enterStaging(cells.map(c => c.id), `Last ${cells.length}`);
};

/* #850ecdad */
/* ── Context Budget Meter (1.4) & Heat Strip ───────────────────────── */
let meter = null;
let heatEnabled = store.get(HEAT_KEY, '0') === '1';

function mountMeter() {
  if (!meter) {
    meter = mountTpl('ctx_meter', {refs: true});
    on(meter.root, 'click', e => { e.preventDefault(); e.stopPropagation(); openPreview(); }, sig);
  }
  const nav = qs('.uk-container > nav.monster-navbar');
  if (nav && !nav.contains(meter.root)) {
    const right = nav.querySelector('.uk-navbar-right, :scope > div:last-child') || nav;
    right.prepend(meter.root);
  } else if (!nav && !meter.root.isConnected && document.body) {
    document.body.append(meter.root);
  }
}

function updateMeter() {
  mountMeter();
  const cells = allCells();
  let activeTok = 0, hiddenTok = 0;
  const cellList = [];
  for (const c of cells) {
    const t = cellTokens(c);
    const hid = isHiddenFromAI(c);
    if (hid) hiddenTok += t;
    else activeTok += t;
    cellList.push({c, t, hid});
  }
  if (meter?.val) {
    const nextTxt = `~${fmtTok(activeTok)} tok`;
    if (meter.val.textContent !== nextTxt) meter.val.textContent = nextTxt;
    const lvl = activeTok >= 120000 ? 'high' : activeTok >= 50000 ? 'warn' : 'ok';
    if (meter.root.dataset.level !== lvl) meter.root.dataset.level = lvl;
    const nextTitle = `Active AI context: ~${activeTok.toLocaleString()} tokens (${hiddenTok.toLocaleString()} hidden) · Click to preview`;
    if (meter.root.title !== nextTitle) meter.root.title = nextTitle;
  }
  if (document.documentElement.classList.contains('craft-ctx-heat-on') !== heatEnabled) {
    document.documentElement.classList.toggle('craft-ctx-heat-on', heatEnabled);
  }
  for (const {c, t, hid} of cellList) {
    if (heatEnabled && !hid && activeTok > 0) {
      const share = Math.min(1, t / Math.max(activeTok, 1));
      const heatVal = (0.12 + share * 0.88).toFixed(2);
      if (c.style.getPropertyValue('--craft-heat') !== heatVal) c.style.setProperty('--craft-heat', heatVal);
      if (!c.classList.contains('craft-ctx-heat-cell')) c.classList.add('craft-ctx-heat-cell');
    } else {
      if (c.classList.contains('craft-ctx-heat-cell')) c.classList.remove('craft-ctx-heat-cell');
      if (c.style.getPropertyValue('--craft-heat')) c.style.removeProperty('--craft-heat');
    }
  }
}

/* ── "What the AI Sees" Preview Modal (1.5) ────────────────────────── */
let prevModal = null;

function renderPreview() {
  if (!prevModal) return;
  const cells = allCells();
  let activeTok = 0, includedCount = 0;
  const rows = cells.map((c, idx) => {
    const hid = isHiddenFromAI(c);
    const pin = isPinned(c);
    const tok = cellTokens(c);
    if (!hid) { activeTok += tok; includedCount++; }
    const mtype = cellMtype(c);
    const snippet = (c.querySelector(`${SOLVEIT.sel.cardIn} ${SOLVEIT.sel.msgContent}`)?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90) || '(empty)';
    return el('div', {cls: `craft-ctx-prev-row${hid ? ' is-hidden' : ''}${pin ? ' is-pinned' : ''}`},
      el('span', {cls: 'craft-ctx-prev-idx'}, `#${idx + 1}`),
      el('span', {cls: `craft-ctx-prev-type type-${mtype}`}, mtype),
      pin ? el('span', {cls: 'craft-ctx-prev-pin', title: 'Pinned'}, '📌') : null,
      el('span', {cls: 'craft-ctx-prev-snip'}, snippet),
      el('span', {cls: 'craft-ctx-prev-tok'}, `~${fmtTok(tok)}`),
      el('button', {
        type: 'button', cls: 'uk-btn uk-btn-default uk-btn-xs craft-ctx-prev-tog',
        onClick: async () => { await setHiddenFromAI(c, !hid); renderPreview(); updateMeter(); },
      }, hid ? 'Include' : 'Hide'),
    );
  });
  prevModal.total.textContent = `${includedCount}/${cells.length} cells · ~${activeTok.toLocaleString()} tokens`;
  prevModal.list.replaceChildren(...(rows.length ? rows : [el('div', {cls: 'craft-empty-state'}, 'No cells in dialog.')]));
}

function openPreview() {
  if (!prevModal) {
    prevModal = mountModal('ctx_preview_modal', {refs: true, signal: ac.signal});
    on(prevModal.done, 'click', () => prevModal.close(), sig);
    on(prevModal.heat, 'click', () => {
      heatEnabled = !heatEnabled;
      store.set(HEAT_KEY, heatEnabled ? '1' : '0');
      updateMeter();
    }, sig);
    on(prevModal.savePreset, 'click', () => {
      const ids = allCells().filter(c => !isHiddenFromAI(c)).map(c => c.id);
      const name = prompt('Save currently included cells as preset:');
      if (name && savePreset(name, ids)) notify(`Saved preset "${name}".`, 'success');
    }, sig);
  }
  renderPreview();
  prevModal.open();
}

/* ── Traceback Quick-Fix (1.6) ─────────────────────────────────────── */
async function askAiAboutTraceback(codeCell) {
  if (!codeCell) return;
  const codeId = normId(codeCell.id);
  const before = new Set(allCells().map(c => c.id));
  try {
    await htmxPost(SOLVEIT.api.addBelow, {id_: codeCell.id, after: ''});
  } catch (err) {
    notifyErr('Could not insert prompt cell below traceback.', 'craftContext');
    return;
  }
  const newCell = await waitForNewCell(before, 3000);
  if (!newCell) return;
  const newId = normId(newCell.id);
  await CORE.switchCellMtype({id: newId, mtyp: 'prompt', tag: 'craftContext'});
  const promptText = 'Explain and fix the traceback error in the code cell above.';
  await htmxPost(SOLVEIT.api.setContents, {id_: '_' + newId, ids: newId, contents: JSON.stringify({[newId]: promptText})});
  enterStaging([codeId, newId], 'Traceback Fix');
  newCell.scrollIntoView({block: 'nearest'});
}

function syncTracebackButtons(cells = allCells()) {
  const tbSel = `:has(${SOLVEIT.sel.ansiRed}, .ansi-red-intense-fg)`;
  for (const cell of cells) {
    const out = cell.querySelector(SOLVEIT.sel.cardOut);
    if (!out || !out.matches(tbSel) || out.querySelector(':scope > .craft-tb-fix-btn')) continue;
    const btn = mountTpl('ctx_tb_fix_btn');
    on(btn, 'click', e => {
      e.preventDefault(); e.stopPropagation();
      askAiAboutTraceback(cell);
    }, sig);
    out.prepend(btn);
  }
}

/* #d22c0165 */
/* ── Action Menu & Hotkey Registration ─────────────────────────────── */
const offMenu = window.craftActionMenus?.registerProvider?.(ctx => {
  if (ctx.isOutput || !ctx.cell) return [];
  return [
    {header: 'Context Control'},
    {label: 'All-But this cell (one-shot)', onClick: () => lensAllBut(ctx.cell)},
    {label: 'Lens: This heading section', onClick: () => lensHeadingSection(ctx.cell)},
    {label: 'Lens: Pinned + this cell', onClick: () => lensPinnedPlus(ctx.cell)},
    {label: 'Lens: Code + errors only', onClick: () => lensCodeAndErrors()},
    {label: 'What the AI sees…', onClick: () => openPreview()},
  ];
});

const reg = spec => window.__hotkeyRegister?.(spec);
reg({id: 'ctx-all-but', label: 'All-But this cell (one-shot minimal context)', group: 'CRAFT · Context', combo: '', handler: () => { lensAllBut(); return true; }});
reg({id: 'ctx-lens-section', label: 'Context Lens: This heading section only', group: 'CRAFT · Context', combo: '', handler: () => { lensHeadingSection(); return true; }});
reg({id: 'ctx-lens-pinned', label: 'Context Lens: Pinned cells + this cell', group: 'CRAFT · Context', combo: '', handler: () => { lensPinnedPlus(); return true; }});
reg({id: 'ctx-lens-code-err', label: 'Context Lens: Code cells + error outputs only', group: 'CRAFT · Context', combo: '', handler: () => { lensCodeAndErrors(); return true; }});
reg({id: 'ctx-lens-last-n', label: 'Context Lens: Last N cells', group: 'CRAFT · Context', combo: '', handler: () => { lensLastN(); return true; }});
reg({id: 'ctx-preview', label: 'What the AI sees (context preview)', group: 'CRAFT · Context', combo: '', handler: () => { openPreview(); return true; }});
reg({id: 'ctx-heat-toggle', label: 'Toggle context token heat strip', group: 'CRAFT · Context', combo: '', handler: () => { heatEnabled = !heatEnabled; store.set(HEAT_KEY, heatEnabled ? '1' : '0'); updateMeter(); return true; }});
reg({id: 'ctx-preset-save', label: 'Save context preset (visible cells)', group: 'CRAFT · Context', combo: '', handler: () => {
  const ids = (staging ? [...staging.scopeIds] : allCells().filter(c => !isHiddenFromAI(c)).map(c => c.id));
  const name = prompt('Preset name:');
  if (name && savePreset(name, ids)) notify(`Saved preset "${name}".`, 'success');
  return true;
}});
reg({id: 'ctx-preset-load', label: 'Load context preset (one-shot All-But)', group: 'CRAFT · Context', combo: '', handler: () => {
  const presets = loadPresets(), names = Object.keys(presets);
  if (!names.length) return (notifyErr('No saved presets for this dialog.', 'craftContext'), true);
  const pick = prompt(`Enter preset name to stage (${names.join(', ')}):`, names[0]);
  if (pick && presets[pick]) enterStaging(presets[pick], `Preset: ${pick}`);
  return true;
}});
reg({id: 'ctx-preset-apply', label: 'Apply context preset permanently', group: 'CRAFT · Context', combo: '', handler: () => {
  const presets = loadPresets(), names = Object.keys(presets);
  if (!names.length) return (notifyErr('No saved presets for this dialog.', 'craftContext'), true);
  const pick = prompt(`Enter preset name to apply permanently (${names.join(', ')}):`, names[0]);
  if (pick && presets[pick]) applyPermanent(presets[pick]);
  return true;
}});
reg({id: 'ctx-preset-del', label: 'Delete context preset', group: 'CRAFT · Context', combo: '', handler: () => {
  const presets = loadPresets(), names = Object.keys(presets);
  if (!names.length) return (notifyErr('No saved presets for this dialog.', 'craftContext'), true);
  const pick = prompt(`Delete preset (${names.join(', ')}):`, names[0]);
  if (pick && deletePreset(pick)) notify(`Deleted preset "${pick}".`, 'success');
  return true;
}});

const offCells = onCells(cells => {
  syncTracebackButtons(cells);
  if (staging) syncStagingUI();
}, {attrs: ['class']});
const offMeter = onDomChange(updateMeter, {inDialog: true, attrs: ['class'], delay: 200});

updateMeter();
syncTracebackButtons();
checkRecoveryBanner();

window.craftContext = {
  allCells, isHiddenFromAI, isPinned, cellTokens, setHiddenFromAI, getSectionCells,
  stageScope: enterStaging, cancelStaging, applyPermanent, restoreFromSnapshot,
  lensAllBut, lensHeadingSection, lensPinnedPlus, lensCodeAndErrors, lensLastN,
  loadPresets, savePreset, deletePreset, openPreview, updateMeter, askAiAboutTraceback,
  disable() {
    ac.abort();
    offCells?.();
    offMeter?.();
    offMenu?.();
    restoreWatch?.();
    clearStagingVisuals();
    stagingBar.destroy();
    recoverBar.destroy();
    meter?.root?.remove();
    prevModal?.destroy?.();
    qsa('.craft-tb-fix-btn').forEach(b => b.remove());
    qsa('.craft-ctx-heat-cell').forEach(c => { c.classList.remove('craft-ctx-heat-cell'); c.style.removeProperty('--craft-heat'); });
    delete window.craftContext;
  },
};
})();

/* %% nbs/craft/14_font_settings.ipynb #6c6c311e */
(() => {
  window.craftFonts?.disable?.();
  const CORE = window.__craftCMCore;
  if (!CORE || !CORE.features.init('font-settings', 'Font Settings', 'Per-cell-type font family, size, line-height, and weight')) return;
  const {store} = CORE;
  const STORE_KEY = 'craft-font-settings-v1';
  // Apply persisted font CSS variables immediately without loading modal code
  const saved = store.json(STORE_KEY, null);
  if (saved && typeof saved === 'object') {
    const root = document.documentElement.style;
    for (const k of ['prompt', 'response', 'note', 'code', 'raw']) {
      const c = saved[k];
      if (!c) continue;
      if (c.family) root.setProperty(`--craft-font-${k}-family`, c.family);
      if (c.size != null) root.setProperty(`--craft-font-${k}-size`, `${c.size}px`);
      if (c.lh != null) root.setProperty(`--craft-font-${k}-lh`, String(c.lh));
      if (c.weight != null) root.setProperty(`--craft-font-${k}-weight`, String(c.weight));
    }
    if (saved.code) {
      if (saved.code.size != null) root.setProperty('--craft-code', `${saved.code.size}px`);
      if (saved.code.lh != null) root.setProperty('--craft-code-lh', String(saved.code.lh));
      if (saved.code.family) root.setProperty('--craft-code-family', saved.code.family);
    }
  }
  let loading = null;
  const load = () => {
    if (window.craftFonts?.__loaded) return Promise.resolve(window.craftFonts);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      document.querySelector('script[data-craft-asset="craft_fonts.js"]')?.remove();
      const s = document.createElement('script');
      s.src = '/static/.craft-assets/craft_fonts.js';
      s.dataset.craftAsset = 'craft_fonts.js';
      s.onload = () => { loading = null; resolve(window.craftFonts); };
      s.onerror = err => { loading = null; reject(err); };
      document.head.append(s);
    });
    return loading;
  };
  window.__hotkeyRegister?.({id: 'craft-font-settings', label: 'Font settings (by cell type)', group: 'CRAFT · Appearance', combo: '', handler: () => { load().then(api => api?.open?.()); return true; }});
  window.__hotkeyRegister?.({id: 'craft-font-reset', label: 'Reset font settings to defaults', group: 'CRAFT · Appearance', combo: '', handler: () => { load().then(api => api?.reset?.()); return true; }});
  window.craftFonts = {
    open: () => load().then(api => api?.open?.()),
    reset: () => load().then(api => api?.reset?.()),
    get: () => load().then(api => api?.get?.()),
    apply: cfg => load().then(api => api?.apply?.(cfg)),
    snippet: () => load().then(api => api?.snippet?.()),
    disable() { delete window.craftFonts; },
  };
})();

/* %% nbs/craft/15_structural_ops.ipynb #c190c6dc */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"struct_batch_bar": "<div id=\"craft-batch-bar\" role=\"toolbar\" aria-label=\"Multi-cell batch actions\"><span class=\"craft-batch-count\" data-ref=\"count\">0 selected</span><button class=\"uk-btn uk-btn-default uk-btn-xs\" data-act=\"allbut\" type=\"button\">All-But</button><button class=\"uk-btn uk-btn-default uk-btn-xs\" data-act=\"omit\" type=\"button\">Omit</button><button class=\"uk-btn uk-btn-default uk-btn-xs\" data-act=\"hide\" type=\"button\">Hide AI</button><button class=\"uk-btn uk-btn-default uk-btn-xs\" data-act=\"partition\" type=\"button\">Partition</button><button class=\"uk-btn uk-btn-default uk-btn-xs\" data-act=\"merge\" data-ref=\"mergeBtn\" type=\"button\">Merge</button><button class=\"uk-btn uk-btn-default uk-btn-xs\" data-act=\"up\" aria-label=\"Move selection up\" title=\"Move up (Alt+Up)\" type=\"button\">↑</button><button class=\"uk-btn uk-btn-default uk-btn-xs\" data-act=\"down\" aria-label=\"Move selection down\" title=\"Move down (Alt+Down)\" type=\"button\">↓</button><button class=\"uk-btn uk-btn-default uk-btn-xs\" data-act=\"send\" type=\"button\">Send to…</button><button class=\"uk-btn uk-btn-default uk-btn-xs craft-btn-danger\" data-act=\"delete\" type=\"button\">Delete</button></div>", "struct_partition_modal": "<dialog class=\"craft-overlay\" id=\"craft-partition-modal\" aria-label=\"Partition Dialog\"><div class=\"uk-card craft-card craft-part-card\"><div class=\"craft-modal-head\"><strong>Partition Dialog</strong><button type=\"button\" class=\"craft-modal-x\" aria-label=\"Close\" data-ref=\"close\">×</button></div><div class=\"craft-part-body\"><div class=\"craft-ctx-prev-note\">Note: Each Solveit dialog owns its own kernel (kid). The newly created dialog will start with a fresh kernel state.</div><div class=\"craft-part-modes\" data-ref=\"modes\"><label class=\"craft-part-opt\"><input type=\"radio\" name=\"craft-part-mode\" value=\"split\" checked><span> Split here — keep cells above, move cut &amp; below to new dialog</span></label><label class=\"craft-part-opt\"><input type=\"radio\" name=\"craft-part-mode\" value=\"fork\"><span> Fork from here — duplicate dialog and drop everything below cut</span></label><label class=\"craft-part-opt\"><input type=\"radio\" name=\"craft-part-mode\" value=\"extract\"><span> Extract selection — copy or move selected cells to new dialog</span></label></div><div class=\"craft-part-field\"><label class=\"craft-part-lbl\">New dialog name</label><input class=\"uk-input\" placeholder=\"new_dialog.ipynb\" data-ref=\"name\" type=\"text\"></div><div class=\"craft-part-extra\" data-ref=\"extractOpts\"><label class=\"craft-part-opt\"><input type=\"checkbox\" data-ref=\"moveSel\"><span> Remove extracted cells from current dialog (move)</span></label><label class=\"craft-part-opt\"><input type=\"checkbox\" data-ref=\"leaveLink\" checked><span> Leave a note with a link to the new dialog</span></label></div></div><div class=\"craft-modal-foot\"><button class=\"uk-btn uk-btn-default uk-btn-xs\" data-ref=\"cancel\" type=\"button\">Cancel</button><button class=\"uk-btn uk-btn-primary uk-btn-xs\" data-ref=\"go\" type=\"button\">Create dialog</button></div></div></dialog>", "struct_send_modal": "<dialog class=\"craft-overlay\" id=\"craft-send-dialog-modal\" aria-label=\"Send cells to another dialog\"><div class=\"uk-card craft-card craft-part-card\"><div class=\"craft-modal-head\"><strong>Send Cell(s) to Another Dialog</strong><button type=\"button\" class=\"craft-modal-x\" aria-label=\"Close\" data-ref=\"close\">×</button></div><div class=\"craft-part-body\"><input class=\"uk-input\" placeholder=\"Filter dialogs…\" data-ref=\"filter\" type=\"text\"><label class=\"craft-part-opt\"><input type=\"checkbox\" data-ref=\"moveFlag\"><span> Move (delete from current dialog after copying)</span></label><div class=\"craft-send-list\" data-ref=\"list\"></div></div><div class=\"craft-modal-foot\"><button class=\"uk-btn uk-btn-default uk-btn-xs\" data-ref=\"cancel\" type=\"button\">Cancel</button></div></div></dialog>"});

/* %% nbs/craft/15_structural_ops.ipynb #f52d5c1c */
(() => { /* iife:craftStruct */
/* #f52d5c1c */
window.craftStruct?.disable?.();
if (!document.getElementById('dialog-container')) return;

const CORE = window.__craftCMCore;
if (!CORE || !CORE.features.init('structural-ops', 'Structural Ops', 'Batch bar, Merge, Partition, Send to Dialog, Reorder')) return;
const {
  el, qsa, on, store, mountTpl, mountModal, htmxPost, onCells, SOLVEIT,
  notify, notifyErr, normId, getCellEl, typingBlocked,
  allCells, selectedCells, primaryCell, cellMtype, deleteCellEl,
  waitForHtmxSettle, mountMenu, mountBar, getCellInputText, headingLevel,
} = CORE;
const ac = new AbortController(), sig = {signal: ac.signal}, cap = {capture: true, signal: ac.signal};
const DRAG_MOD_KEY = 'craft-reorder-mod'; // 'alt' (default) | 'hyper'

async function commitEditors() {
  if (window.craftC2?.active?.()) await window.craftC2.exit();
  if (window.craftMd?.active?.()) await window.craftMd.exit();
}

/* ── 2.2 Merge Cells ───────────────────────────────────────────────── */
function canMerge(cells = selectedCells()) {
  if (cells.length < 2) return false;
  const all = allCells();
  const idxs = cells.map(c => all.indexOf(c));
  if (idxs.some(i => i < 0)) return false;
  for (let i = 1; i < idxs.length; i++) if (idxs[i] !== idxs[i - 1] + 1) return false;
  const t0 = cellMtype(cells[0]);
  return cells.every(c => cellMtype(c) === t0);
}

async function loadDialogRawSources() {
  const nb = await fetchDialogNb(currentDlgPath());
  const map = new Map();
  for (const c of nb?.cells || []) {
    const cid = normId(c?.id || '');
    if (!cid) continue;
    map.set(cid, Array.isArray(c.source) ? c.source.join('') : String(c.source ?? ''));
  }
  return map;
}

async function mergeSelectedCells(cells = selectedCells()) {
  if (!canMerge(cells)) {
    notifyErr('Select 2 or more consecutive cells of the same type to merge.', 'craftStruct');
    return false;
  }
  await commitEditors();
  let rawMap = null;
  const parts = [];
  for (const c of cells) {
    let txt = getCellInputText(c, {rawOnly: true});
    if (txt === null) {
      if (!rawMap) rawMap = await loadDialogRawSources();
      const id = normId(c.id);
      if (rawMap.has(id)) txt = rawMap.get(id);
    }
    if (txt === null) {
      notifyErr('Could not read raw source for one or more cells; save or open them before merging.', 'craftStruct');
      return false;
    }
    parts.push(txt);
  }
  const combined = parts.join('\n\n');
  const firstId = normId(cells[0].id);
  try {
    await htmxPost(SOLVEIT.api.setContents, {id_: '_' + firstId, ids: firstId, contents: JSON.stringify({[firstId]: combined})});
    for (let i = cells.length - 1; i >= 1; i--) await deleteCellEl(cells[i], {tag: 'craftStruct'});
    notify(`Merged ${cells.length} cells.`, 'success');
    return true;
  } catch (err) {
    notifyErr('Could not merge cells.', 'craftStruct');
    console.error('craftStruct: merge failed', err);
    return false;
  }
}

/* ── .ipynb helpers for Partition (2.1) & Send-to-Dialog (2.6) ─────── */
function currentDlgPath() {
  const ctx = window.solveitFileTree?.getCurrentContext?.();
  if (ctx?.dlgPath) return ctx.dlgPath;
  const u = new URL(location.href);
  const name = u.searchParams.get('name');
  return name ? (name.endsWith('.ipynb') ? name : `${name}.ipynb`) : null;
}

function parentDirOf(p) {
  const parts = String(p || '').replace(/^\/+/, '').split('/').filter(Boolean);
  parts.pop();
  return parts.length ? parts.join('/') : '.';
}

function staticUrl(relPath) {
  return '/static/' + String(relPath || '').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
}

function domCellToNbCell(cell) {
  const mtype = cellMtype(cell);
  const src = getCellInputText(cell, {rawOnly: true}) ?? (cell.querySelector(`${SOLVEIT.sel.cardIn} ${SOLVEIT.sel.msgContent}`)?.textContent || '').trim();
  return {
    cell_type: mtype === 'code' ? 'code' : (mtype === 'raw' ? 'raw' : 'markdown'),
    id: normId(cell.id),
    metadata: {solveit_msg_type: mtype},
    source: src.split(/(?<=\n)/),
    ...(mtype === 'code' ? {execution_count: null, outputs: []} : {}),
  };
}

async function fetchDialogNb(relPath) {
  if (!relPath) return null;
  try {
    const r = await fetch(staticUrl(relPath), {credentials: 'same-origin'});
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function uploadDialogNb(folder, filename, nbObj) {
  const fname = filename.endsWith('.ipynb') ? filename : `${filename}.ipynb`;
  const fd = new FormData();
  const blob = new Blob([JSON.stringify(nbObj, null, 1)], {type: 'application/x-ipynb+json'});
  fd.append('files', new File([blob], fname, {type: 'application/x-ipynb+json'}));
  const r = await fetch(`/upload_file_?folder=${encodeURIComponent(folder || '.')}`, {
    method: 'POST', credentials: 'same-origin', headers: {'HX-Request': 'true'}, body: fd,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  window.solveitFileTree?.refresh?.();
  return folder && folder !== '.' ? `${folder}/${fname}` : fname;
}

/* #dbeba606 */
/* ── 2.1 Partition Dialog Modal ────────────────────────────────────── */
let partModal = null, partTargetCells = [];

async function executePartition({mode, name, moveSel, leaveLink}) {
  const cleanName = String(name || '').trim().replace(/\.ipynb$/i, '');
  if (!cleanName) return notifyErr('Enter a name for the new dialog.', 'craftStruct');
  await commitEditors();
  const dlgPath = currentDlgPath();
  const folder = parentDirOf(dlgPath);
  const baseNb = (await fetchDialogNb(dlgPath)) || {
    cells: allCells().map(domCellToNbCell),
    metadata: {}, nbformat: 4, nbformat_minor: 5,
  };
  const all = allCells();
  const cutCell = partTargetCells[0] || primaryCell() || all[0];
  const cutIdx = Math.max(0, all.indexOf(cutCell));
  const findNbCells = domList => {
    const ids = new Set(domList.map(c => normId(c.id)));
    const matched = (baseNb.cells || []).filter(c => ids.has(normId(c.id)));
    return matched.length ? matched : domList.map(domCellToNbCell);
  };

  let newCells = [], toDelete = [];
  if (mode === 'split') {
    const below = all.slice(cutIdx);
    newCells = findNbCells(below);
    toDelete = below;
  } else if (mode === 'fork') {
    const above = all.slice(0, cutIdx + 1);
    newCells = findNbCells(above);
  } else {
    const chosen = partTargetCells.length ? partTargetCells : [cutCell];
    newCells = findNbCells(chosen);
    if (moveSel) toDelete = chosen;
  }

  try {
    const newPath = await uploadDialogNb(folder, cleanName, {...baseNb, cells: newCells});
    if (toDelete.length) {
      for (let i = toDelete.length - 1; i >= 0; i--) await deleteCellEl(toDelete[i], {tag: 'craftStruct'});
    }
    if (mode === 'extract' && leaveLink) {
      const linkText = `> Extracted ${newCells.length} cell(s) to [${cleanName}](/dialog_?name=${encodeURIComponent(newPath.replace(/\.ipynb$/, ''))})`;
      await htmxPost(SOLVEIT.api.upsertMsg, {id_: '', msg_type: 'note', is_input: '1', content: linkText});
    }
    notify(`Created dialog "${cleanName}" (${newCells.length} cells).`, 'success');
    return newPath;
  } catch (err) {
    notifyErr(`Partition failed: ${err.message || err}`, 'craftStruct');
    console.error('craftStruct: partition failed', err);
    return null;
  }
}

function openPartitionModal(cells = null) {
  partTargetCells = cells?.length ? cells : (selectedCells().length ? selectedCells() : [primaryCell()].filter(Boolean));
  if (!partTargetCells.length) return notifyErr('Select a cell first.', 'craftStruct');
  if (!partModal) {
    partModal = mountModal('struct_partition_modal', {refs: true, signal: ac.signal});
    on(partModal.cancel, 'click', () => partModal.close(), sig);
    on(partModal.go, 'click', async () => {
      const mode = partModal.modes.querySelector('input:checked')?.value || 'split';
      const res = await executePartition({
        mode, name: partModal.name.value,
        moveSel: partModal.moveSel.checked, leaveLink: partModal.leaveLink.checked,
      });
      if (res) partModal.close();
    }, sig);
  }
  const base = (currentDlgPath() || 'dialog').split('/').pop().replace(/\.ipynb$/, '');
  partModal.name.value = `${base}_part`;
  if (partTargetCells.length > 1) {
    const rad = partModal.modes.querySelector('input[value="extract"]');
    if (rad) rad.checked = true;
  }
  partModal.open();
  partModal.name.focus(); partModal.name.select();
}

/* ── 2.6 Send Cell(s) to Another Dialog ────────────────────────────── */
let sendModal = null, sendCells = [], sendEntries = [];

async function sendCellsToTarget(targetNode, move) {
  await commitEditors();
  const srcPath = currentDlgPath();
  const srcNb = await fetchDialogNb(srcPath);
  const targetPath = targetNode.path.endsWith('.ipynb') ? targetNode.path : `${targetNode.path}.ipynb`;
  const targetNb = (await fetchDialogNb(targetPath)) || {cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5};
  const ids = new Set(sendCells.map(c => normId(c.id)));
  const nbCells = srcNb?.cells?.filter(c => ids.has(normId(c.id))) || [];
  const toAppend = nbCells.length ? nbCells : sendCells.map(domCellToNbCell);
  targetNb.cells = [...(targetNb.cells || []), ...toAppend];
  try {
    await uploadDialogNb(parentDirOf(targetPath), targetPath.split('/').pop(), targetNb);
    if (move) {
      for (let i = sendCells.length - 1; i >= 0; i--) await deleteCellEl(sendCells[i], {tag: 'craftStruct'});
    }
    notify(`${move ? 'Moved' : 'Copied'} ${toAppend.length} cell(s) to ${targetNode.name}.`, 'success');
  } catch (err) {
    notifyErr(`Could not send cells: ${err.message || err}`, 'craftStruct');
  }
}

function renderSendList() {
  if (!sendModal) return;
  const q = (sendModal.filter.value || '').trim().toLowerCase();
  const cur = currentDlgPath();
  const matches = sendEntries.filter(n => n.kind === 'dialog' && n.path !== cur && (!q || n.name.toLowerCase().includes(q) || n.path.toLowerCase().includes(q)));
  sendModal.list.replaceChildren(...(matches.length ? matches.slice(0, 50).map(n => el('button', {
    type: 'button', cls: 'craft-send-row',
    onClick: async () => {
      sendModal.close();
      await sendCellsToTarget(n, sendModal.moveFlag.checked);
    },
  }, el('strong', {}, n.name), el('span', {cls: 'craft-send-path'}, n.path))) : [el('div', {cls: 'craft-empty-state'}, 'No matching dialogs loaded.')]));
}

async function openSendModal(cells = null) {
  sendCells = cells?.length ? cells : (selectedCells().length ? selectedCells() : [primaryCell()].filter(Boolean));
  if (!sendCells.length) return notifyErr('Select a cell first.', 'craftStruct');
  if (!sendModal) {
    sendModal = mountModal('struct_send_modal', {refs: true, signal: ac.signal});
    on(sendModal.cancel, 'click', () => sendModal.close(), sig);
    on(sendModal.filter, 'input', renderSendList, sig);
  }
  sendModal.filter.value = '';
  sendModal.open();
  sendEntries = (await window.solveitFileTree?.entries?.()) || [];
  renderSendList();
  sendModal.filter.focus();
}

/* #b4c32199 */
/* ── 2.3 Keyboard & Drag-Modifier Cell Reordering ──────────────────── */
const fireKey = (key, target = document.body) => {
  target.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}));
};

async function cutAndPasteAfter(block, afterId) {
  const all = allCells();
  for (const c of all) c.setAttribute('data-sm', 'unselected');
  block.forEach((c, i) => c.setAttribute('data-sm', i === 0 ? 'primary' : 'secondary'));
  const cutIds = block.map(c => normId(c.id));
  fireKey('x');
  const cutOk = await waitForHtmxSettle(() => cutIds.every(id => !getCellEl(id)), 2500);
  if (!cutOk) return false;
  const target = getCellEl(afterId);
  if (!target) return false;
  window.selectMsg?.(window.$?.(target));
  await waitForHtmxSettle(() => target.getAttribute('data-sm') === 'primary', 400);
  fireKey('v');
  return Boolean(await waitForHtmxSettle(() => cutIds.every(id => !!getCellEl(id)), 2500));
}

async function moveCells(cells, delta) {
  const all = allCells();
  const ordered = cells.filter(c => all.includes(c)).sort((a, b) => all.indexOf(a) - all.indexOf(b));
  if (!ordered.length || !delta) return false;
  const firstIdx = all.indexOf(ordered[0]), lastIdx = all.indexOf(ordered.at(-1));
  const targetIdx = delta < 0 ? firstIdx + delta : lastIdx + delta;
  if (targetIdx < 0 || targetIdx >= all.length) return false;
  await commitEditors();

  try {
    if (delta < 0 && targetIdx === 0) {
      const firstId = normId(all[0].id);
      const lastBlockId = normId(ordered.at(-1).id);
      if (firstIdx === 1) {
        return await cutAndPasteAfter([all[0]], lastBlockId);
      }
      if (!await cutAndPasteAfter(ordered, firstId)) return false;
      const liveFirst = getCellEl(firstId);
      if (!liveFirst) return false;
      return await cutAndPasteAfter([liveFirst], lastBlockId);
    }
    const anchor = all[targetIdx];
    if (!anchor) return false;
    const afterCell = delta < 0 ? all[targetIdx - 1] : anchor;
    if (!afterCell) return false;
    return await cutAndPasteAfter(ordered, normId(afterCell.id));
  } catch (err) {
    console.error('craftStruct: reorder failed', err);
    return false;
  }
}

let dragState = null;
const dropLine = el('div', {cls: 'craft-drop-line', hidden: true});
document.body.append(dropLine);

const hasDragMod = e => {
  const mode = store.get(DRAG_MOD_KEY, 'alt');
  return mode === 'hyper' ? (e.ctrlKey && e.altKey && e.shiftKey && e.metaKey) : (e.altKey && !e.ctrlKey && !e.metaKey);
};

on(document, 'pointerdown', e => {
  if (window.craftMobile?.active?.() || e.button !== 0 || !hasDragMod(e) || typingBlocked()) return;
  const cell = e.target.closest?.(SOLVEIT.sel.cellWithId);
  if (!cell) return;
  e.preventDefault();
  dragState = {cell, startY: e.clientY, active: false, targetCell: null, before: true};
}, cap);

on(document, 'pointermove', e => {
  if (!dragState) return;
  if (!dragState.active && Math.abs(e.clientY - dragState.startY) > 6) {
    dragState.active = true;
    dragState.cell.classList.add('craft-dragging');
  }
  if (!dragState.active) return;
  const cells = allCells().filter(c => c !== dragState.cell && c.offsetParent !== null);
  let best = null, before = true, bestDist = Infinity;
  for (const c of cells) {
    const r = c.getBoundingClientRect();
    const dTop = Math.abs(e.clientY - r.top), dBot = Math.abs(e.clientY - r.bottom);
    if (dTop < bestDist) { bestDist = dTop; best = c; before = true; }
    if (dBot < bestDist) { bestDist = dBot; best = c; before = false; }
  }
  if (best) {
    dragState.targetCell = best; dragState.before = before;
    const r = best.getBoundingClientRect();
    dropLine.hidden = false;
    dropLine.style.left = r.left + 'px';
    dropLine.style.width = r.width + 'px';
    dropLine.style.top = (before ? r.top : r.bottom) + 'px';
  }
}, sig);

on(document, 'pointerup', async () => {
  if (!dragState) return;
  const st = dragState;
  dragState = null;
  st.cell.classList.remove('craft-dragging');
  dropLine.hidden = true;
  if (!st.active || !st.targetCell) return;
  const all = allCells();
  const fromIdx = all.indexOf(st.cell), toIdx = all.indexOf(st.targetCell);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
  const delta = (st.before ? toIdx : toIdx + 1) - fromIdx;
  const adj = delta > 0 ? delta - 1 : delta;
  if (adj !== 0) await moveCells([st.cell], adj);
}, sig);

/* #a170e981 */
/* ── 2.4 Contextual Multi-Cell Batch Bar ───────────────────────────── */
const batchBar = mountBar('struct_batch_bar');
let batchWired = false;

function syncBatchBar() {
  const sel = selectedCells();
  const show = sel.length >= 2 && !typingBlocked() && !document.documentElement.classList.contains('craft-ab-staging');
  if (!show) { batchBar.hide(); return; }
  const b = batchBar.show();
  if (!batchWired) {
    batchWired = true;
    on(b.root, 'click', async e => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();
      const cur = selectedCells();
      const act = btn.dataset.act;
      if (act === 'allbut') window.craftContext?.stageScope?.(cur.map(c => c.id), 'All-But');
      else if (act === 'omit') window.craftOmit?.toggle?.();
      else if (act === 'hide') {
        const anyVisible = cur.some(c => !window.craftContext?.isHiddenFromAI?.(c));
        for (const c of cur) await window.craftContext?.setHiddenFromAI?.(c, anyVisible);
        window.craftContext?.updateMeter?.();
      } else if (act === 'partition') openPartitionModal(cur);
      else if (act === 'merge') await mergeSelectedCells(cur);
      else if (act === 'up') await moveCells(cur, -1);
      else if (act === 'down') await moveCells(cur, 1);
      else if (act === 'send') openSendModal(cur);
      else if (act === 'delete') {
        if (confirm(`Delete ${cur.length} selected cells?`)) {
          for (let i = cur.length - 1; i >= 0; i--) await deleteCellEl(cur[i], {tag: 'craftStruct'});
        }
      }
    }, sig);
  }
  b.count.textContent = `${sel.length} selected`;
  if (b.mergeBtn) b.mergeBtn.disabled = !canMerge(sel);
}

/* Heading section actions (§) are hidden — to re-explore: planned for redesign and rebuild. */
qsa('.craft-sec-trigger').forEach(b => b.remove());

/* ── Action Menu & Hotkeys ─────────────────────────────────────────── */
const offMenu = window.craftActionMenus?.registerProvider?.(ctx => {
  if (ctx.isOutput || !ctx.cell) return [];
  const items = [
    {header: 'Structure'},
    {label: 'Partition dialog from here…', onClick: () => openPartitionModal([ctx.cell])},
    {label: 'Send cell to another dialog…', onClick: () => openSendModal([ctx.cell])},
    {label: 'Move cell up', onClick: () => moveCells([ctx.cell], -1)},
    {label: 'Move cell down', onClick: () => moveCells([ctx.cell], 1)},
  ];
  if (canMerge()) items.splice(1, 0, {label: 'Merge selected cells', onClick: () => mergeSelectedCells()});
  return items;
});

const reg = spec => window.__hotkeyRegister?.(spec);
reg({id: 'cell-merge', label: 'Merge selected consecutive cells', group: 'CRAFT · Structure', combo: '', handler: () => { mergeSelectedCells(); return true; }});
reg({id: 'cell-partition', label: 'Partition dialog (Split / Fork / Extract)', group: 'CRAFT · Structure', combo: '', handler: () => { openPartitionModal(); return true; }});
reg({id: 'cell-send-dialog', label: 'Send cell(s) to another dialog', group: 'CRAFT · Structure', combo: '', handler: () => { openSendModal(); return true; }});
reg({id: 'cell-move-up', label: 'Move cell(s) up', group: 'CRAFT · Structure', combo: 'Alt+ArrowUp', handler: () => { if (typingBlocked()) return false; const s = selectedCells(); if (!s.length) return false; moveCells(s, -1); return true; }});
reg({id: 'cell-move-down', label: 'Move cell(s) down', group: 'CRAFT · Structure', combo: 'Alt+ArrowDown', handler: () => { if (typingBlocked()) return false; const s = selectedCells(); if (!s.length) return false; moveCells(s, 1); return true; }});
reg({id: 'cell-drag-mod', label: 'Toggle drag-reorder modifier (Alt vs Hyper)', group: 'CRAFT · Structure', combo: '', handler: () => {
  const next = store.get(DRAG_MOD_KEY, 'alt') === 'alt' ? 'hyper' : 'alt';
  store.set(DRAG_MOD_KEY, next);
  notify(`Drag-reorder modifier set to ${next === 'hyper' ? 'Hyper (Ctrl+Alt+Shift+Cmd)' : 'Alt'}.`);
  return true;
}});

const offCells = onCells(() => syncBatchBar(), {attrs: ['data-sm', 'class']});
on(document, 'focusin focusout', () => setTimeout(syncBatchBar, 30), sig);

syncBatchBar();

window.craftStruct = {
  canMerge, mergeSelectedCells, openPartitionModal, openSendModal, moveCells, syncBatchBar,
  disable() {
    ac.abort(); offCells?.(); offMenu?.();
    batchBar.destroy(); partModal?.destroy?.(); sendModal?.destroy?.();
    dropLine.remove();
    qsa('.craft-sec-trigger').forEach(b => b.remove());
    delete window.craftStruct;
  },
};
})();

/* %% nbs/craft/16_navigation_reference.ipynb #6ff334b4 */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"nav_minimap": "<aside id=\"craft-minimap\" role=\"navigation\" aria-label=\"Dialog outline and minimap\"><div class=\"craft-rail-head\"><strong>Outline</strong><button type=\"button\" class=\"craft-modal-x\" aria-label=\"Close outline rail\" data-ref=\"close\">×</button></div><div class=\"craft-rail-list\" data-ref=\"list\"></div></aside>", "nav_ref_pane": "<aside id=\"craft-ref-pane\" role=\"complementary\" aria-label=\"Pinned reference cells\"><div class=\"craft-ref-resizer\" aria-hidden=\"true\" title=\"Drag to resize reference pane\" data-ref=\"resizer\"></div><div class=\"craft-rail-head\"><strong>Reference Pane</strong><button type=\"button\" class=\"craft-modal-x\" aria-label=\"Close reference pane\" data-ref=\"close\">×</button></div><div class=\"craft-ref-list\" data-ref=\"list\"></div></aside>"});

/* %% nbs/craft/16_navigation_reference.ipynb #79923e1b */
(() => { /* iife:craftNavRef */
/* #79923e1b */
window.craftNavRef?.disable?.();
if (!document.getElementById('dialog-container')) return;

const CORE = window.__craftCMCore;
if (!CORE || !CORE.features.init('nav-reference', 'Navigation & Reference', 'Minimap rail, Sticky Reference Pane, Stale-Output badges, Scratchpad flags')) return;
const {el, qsa, on, store, mountTpl, onCells, SOLVEIT, notify, notifyErr, normId, getCellEl, allCells, primaryCell, cellMtype, dlgKey, deleteCellEl, headingLevel, onCellHtmx} = CORE;
const ac = new AbortController(), sig = {signal: ac.signal};

const MAP_OPEN_KEY = 'craft-minimap-open';
const REF_W_KEY = 'craft-ref-width';
const SCRATCH_KEY = () => `craft-scratch:${dlgKey()}`;

/* ── 3.1 Minimap / Outline Rail ────────────────────────────────────── */
let mapEl = null;
let mapOpen = store.get(MAP_OPEN_KEY, '0') === '1';

function renderMinimap() {
  if (!mapOpen) { mapEl?.root?.classList.remove('open'); return; }
  if (!mapEl) {
    mapEl = mountTpl('nav_minimap', {refs: true});
    on(mapEl.close, 'click', () => setMinimapOpen(false), sig);
    document.body.append(mapEl.root);
  }
  mapEl.root.classList.add('open');
  const cells = allCells();
  const rows = cells.map((c, idx) => {
    const cellId = normId(c.id);
    const mtype = cellMtype(c);
    const lvl = headingLevel(c);
    const h = lvl ? c.querySelector(`:scope > ${SOLVEIT.sel.noteCard} ${SOLVEIT.sel.msgContent} :is(h1,h2,h3,h4,h5,h6)`) : null;
    const isErr = !!c.querySelector(`${SOLVEIT.sel.cardOut}:has(${SOLVEIT.sel.ansiRed}, .ansi-red-intense-fg)`);
    const isHid = !!window.craftContext?.isHiddenFromAI?.(c);
    const isOmit = c.classList.contains('craft-omitted');
    const isSel = c.dataset.sm === 'primary' || c.dataset.sm === 'secondary';
    const label = h ? h.textContent.trim() : ((c.querySelector(`${SOLVEIT.sel.cardIn} ${SOLVEIT.sel.msgContent}`)?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 36) || `${mtype} #${idx + 1}`);
    return el('button', {
      type: 'button',
      cls: `craft-map-item type-${mtype}${lvl ? ` is-h is-h${lvl}` : ''}${isErr ? ' is-err' : ''}${isHid ? ' is-hid' : ''}${isOmit ? ' is-omit' : ''}${isSel ? ' is-sel' : ''}`,
      title: `${mtype}${isErr ? ' (error)' : ''}${isHid ? ' (hidden from AI)' : ''}: ${label}`,
      onClick: () => {
        const live = getCellEl(cellId);
        if (!live) return;
        live.scrollIntoView({behavior: 'smooth', block: 'center'});
        window.selectMsg?.(window.$?.(live));
        if (window.craftMobile?.active?.()) setMinimapOpen(false);
      },
    },
      el('span', {cls: 'craft-map-tick'}),
      el('span', {cls: 'craft-map-lbl'}, label),
      isErr ? el('span', {cls: 'craft-map-err', title: 'Traceback error'}, '!') : null,
    );
  });
  mapEl.list.replaceChildren(...(rows.length ? rows : [el('div', {cls: 'craft-empty-state'}, 'Empty dialog')]));
}

function setMinimapOpen(open) {
  mapOpen = !!open;
  store.set(MAP_OPEN_KEY, mapOpen ? '1' : '0');
  document.documentElement.classList.toggle('craft-minimap-open', mapOpen);
  renderMinimap();
}

/* #91338d0c */
/* ── 3.2 Sticky Reference Pane (Pin Cell to Side) ──────────────────── */
const pinnedRefIds = []; // max 2 cells
let refPane = null;

function sanitizeRefClone(node) {
  const clone = node.cloneNode(true);
  for (const elNode of [clone, ...qsa('*', clone)]) {
    elNode.removeAttribute?.('id');
    for (const attr of [...(elNode.attributes || [])]) {
      if (attr.name.startsWith('hx-') || attr.name.startsWith('data-hx-')) elNode.removeAttribute(attr.name);
    }
  }
  return clone;
}

function renderRefPane() {
  const valid = pinnedRefIds.filter(id => getCellEl(id));
  pinnedRefIds.length = 0; pinnedRefIds.push(...valid);
  if (!pinnedRefIds.length) {
    refPane?.root?.classList.remove('open');
    document.documentElement.classList.remove('craft-ref-open');
    return;
  }
  if (!refPane) {
    refPane = mountTpl('nav_ref_pane', {refs: true});
    const savedW = parseInt(store.get(REF_W_KEY, '360'), 10);
    if (savedW >= 220 && savedW <= 760) refPane.root.style.width = savedW + 'px';
    on(refPane.close, 'click', () => { pinnedRefIds.length = 0; renderRefPane(); }, sig);
    let dragging = false, startX = 0, startW = 360, lastW = null;
    on(refPane.resizer, 'pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); dragging = true; startX = e.clientX; startW = refPane.root.offsetWidth; lastW = startW;
    }, sig);
    on(window, 'pointermove', e => {
      if (!dragging) return;
      lastW = Math.max(220, Math.min(760, startW + (startX - e.clientX)));
      refPane.root.style.width = lastW + 'px';
    }, sig);
    on(window, 'pointerup', () => {
      if (!dragging) return;
      dragging = false;
      if (lastW != null) store.set(REF_W_KEY, String(lastW));
    }, sig);
    document.body.append(refPane.root);
  }
  refPane.root.classList.add('open');
  document.documentElement.classList.add('craft-ref-open');
  refPane.list.replaceChildren(...pinnedRefIds.map(id => {
    const src = getCellEl(id);
    const body = el('div', {cls: 'craft-ref-clone'});
    for (const part of qsa(`:scope > .msg-card ${SOLVEIT.sel.msgContent}`, src)) body.append(sanitizeRefClone(part));
    return el('div', {cls: 'craft-ref-item'},
      el('div', {cls: 'craft-ref-item-head'},
        el('span', {cls: 'craft-ref-type'}, `${cellMtype(src)} #${id.slice(0, 6)}`),
        el('button', {type: 'button', cls: 'uk-btn uk-btn-default uk-btn-xs', onClick: () => getCellEl(id)?.scrollIntoView({behavior: 'smooth', block: 'center'})}, 'Jump'),
        el('button', {type: 'button', cls: 'uk-btn uk-btn-default uk-btn-xs', onClick: () => unpinRef(id)}, 'Unpin'),
      ),
      body,
    );
  }));
}

function pinRef(cell) {
  const id = normId(cell?.id);
  if (!id) return;
  const i = pinnedRefIds.indexOf(id);
  if (i >= 0) { pinnedRefIds.splice(i, 1); renderRefPane(); return; }
  if (pinnedRefIds.length >= 2) pinnedRefIds.shift();
  pinnedRefIds.push(id);
  renderRefPane();
}

function unpinRef(id) {
  const i = pinnedRefIds.indexOf(normId(id));
  if (i >= 0) pinnedRefIds.splice(i, 1);
  renderRefPane();
}

/* #7da86f17 */
/* ── 3.4 Stale-Output Badges (Session-Scoped) ──────────────────────── */
const lastEditTs = new Map();
const lastRunTs = new Map();

onCellHtmx([SOLVEIT.api.setContents, SOLVEIT.api.addRunq], ({path, ids, contents}) => {
  const now = Date.now();
  if (path.startsWith(SOLVEIT.api.setContents)) {
    const touched = new Set(ids);
    if (contents && typeof contents === 'object') Object.keys(contents).forEach(k => touched.add(normId(k)));
    let changed = false;
    for (const id of touched) {
      const cell = getCellEl(id);
      if (cell && cellMtype(cell) === 'code') { lastEditTs.set(id, now); changed = true; }
    }
    if (changed) syncStaleBadges();
  } else if (ids.length) {
    for (const id of ids) lastRunTs.set(id, now);
    syncStaleBadges();
  }
}, sig);

function syncStaleBadges(cells = allCells()) {
  for (const c of cells) {
    const id = normId(c.id);
    const isCode = cellMtype(c) === 'code';
    const hasOut = !!c.querySelector(`${SOLVEIT.sel.cardOut} ${SOLVEIT.sel.msgContent}`)?.textContent?.trim();
    const stale = isCode && hasOut && (lastEditTs.get(id) || 0) > (lastRunTs.get(id) || 0);
    c.classList.toggle('craft-is-stale', stale);
  }
}

/* ── 3.5 Scratchpad / Ephemeral Cell Flag ──────────────────────────── */
const loadScratch = () => new Set((store.json(SCRATCH_KEY(), []) || []).map(normId));
const saveScratch = set => store.setJson(SCRATCH_KEY(), [...set]);

async function toggleScratch(cell) {
  if (!cell) return;
  const id = normId(cell.id);
  const set = loadScratch();
  if (set.has(id)) {
    set.delete(id);
    saveScratch(set);
  } else {
    set.add(id);
    saveScratch(set);
    await window.craftContext?.setHiddenFromAI?.(cell, true);
  }
  syncScratchBadges();
}

async function clearAllScratch() {
  const set = loadScratch();
  const targets = allCells().filter(c => set.has(normId(c.id)));
  if (!targets.length) return notifyErr('No scratch cells in this dialog.', 'craftNavRef');
  if (!confirm(`Delete ${targets.length} scratch cell(s)?`)) return;
  for (let i = targets.length - 1; i >= 0; i--) await deleteCellEl(targets[i], {tag: 'craftNavRef'});
  saveScratch(new Set());
  syncScratchBadges();
  notify(`Cleared ${targets.length} scratch cell(s).`, 'success');
}

function syncScratchBadges(cells = allCells()) {
  const set = loadScratch();
  for (const c of cells) {
    const isScr = set.has(normId(c.id));
    c.classList.toggle('craft-scratch-cell', isScr);
  }
}

/* #398a4812 */
/* ── Action Menu, Hotkeys & Lifecycle ──────────────────────────────── */
const offMenu = window.craftActionMenus?.registerProvider?.(ctx => {
  if (ctx.isOutput || !ctx.cell) return [];
  const isPinnedSide = pinnedRefIds.includes(ctx.id);
  const isScr = loadScratch().has(ctx.id);
  return [
    {header: 'Reference & Flags'},
    {label: isPinnedSide ? 'Unpin from side pane' : 'Pin to side pane', onClick: () => pinRef(ctx.cell)},
    {label: isScr ? 'Unmark scratch cell' : 'Mark as scratch', onClick: () => toggleScratch(ctx.cell)},
  ];
});

const reg = spec => window.__hotkeyRegister?.(spec);
reg({id: 'craft-minimap-toggle', label: 'Toggle minimap / outline rail', group: 'CRAFT · Navigation', combo: '', handler: () => { setMinimapOpen(!mapOpen); return true; }});
reg({id: 'craft-ref-pin', label: 'Pin selected cell to side reference pane', group: 'CRAFT · Navigation', combo: '', handler: () => {
  const c = primaryCell();
  if (c) pinRef(c);
  return true;
}});
reg({id: 'craft-scratch-toggle', label: 'Toggle scratchpad flag on selected cell', group: 'CRAFT · Navigation', combo: '', handler: () => {
  const c = primaryCell();
  if (c) toggleScratch(c);
  return true;
}});
reg({id: 'craft-scratch-clear', label: 'Clear all scratch cells', group: 'CRAFT · Navigation', combo: '', handler: () => { clearAllScratch(); return true; }});

const offCells = onCells(cells => {
  if (mapOpen) renderMinimap();
  if (pinnedRefIds.length) renderRefPane();
  syncStaleBadges(cells);
  syncScratchBadges(cells);
}, {attrs: ['data-sm', 'class']});

if (mapOpen) setMinimapOpen(true);
syncStaleBadges();
syncScratchBadges();

window.craftNavRef = {
  setMinimapOpen, toggleMinimap: () => setMinimapOpen(!mapOpen),
  pinRef, unpinRef, toggleScratch, clearAllScratch,
  disable() {
    ac.abort(); offCells?.(); offMenu?.();
    document.documentElement.classList.remove('craft-minimap-open', 'craft-ref-open');
    mapEl?.root?.remove(); refPane?.root?.remove();
    qsa('.craft-is-stale, .craft-scratch-cell').forEach(c => c.classList.remove('craft-is-stale', 'craft-scratch-cell'));
    delete window.craftNavRef;
  },
};
})();

/* %% nbs/craft/17_cell_history.ipynb #d8270fe6 */
(() => {
  window.craftHistory?.disable?.();
  const CORE = window.__craftCMCore;
  if (!CORE || !CORE.qs(CORE.SOLVEIT.sel.dialog) || !CORE.features.init('cell-history', 'Cell History', 'Session cell version snapshots and AI edit diff review')) return;
  const {SOLVEIT, qs} = CORE;
  let loading = null;
  const load = () => {
    if (window.craftHistory?.__loaded) return Promise.resolve(window.craftHistory);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      document.querySelector('script[data-craft-asset="craft_history.js"]')?.remove();
      const s = document.createElement('script');
      s.src = '/static/.craft-assets/craft_history.js';
      s.dataset.craftAsset = 'craft_history.js';
      s.onload = () => { loading = null; resolve(window.craftHistory); };
      s.onerror = err => { loading = null; reject(err); };
      document.head.append(s);
    });
    return loading;
  };
  const offMenu = window.craftActionMenus?.registerProvider?.(ctx => {
    if (ctx.isOutput || !ctx.cell) return [];
    return [{label: 'Cell history…', onClick: () => load().then(api => api?.open?.(ctx.cell))}];
  });
  window.__hotkeyRegister?.({id: 'craft-cell-history', label: 'Cell version history (session)', group: 'CRAFT · History', combo: '', handler: () => { load().then(api => api?.open?.()); return true; }});
  window.craftHistory = {
    open: cell => load().then(api => api?.open?.(cell)),
    snapshots: () => [],
    recordSnapshot: (...args) => load().then(api => api?.recordSnapshot?.(...args)),
    restoreText: (...args) => load().then(api => api?.restoreText?.(...args)),
    disable() { offMenu?.(); delete window.craftHistory; },
  };
  if (qs(`${SOLVEIT.sel.cell}[data-diff]`)) load();
})();

/* %% nbs/craft/18_tts_reader.ipynb #cc0d8e58 */
(() => {
  window.craftTTS?.disable?.();
  const CORE = window.__craftCMCore;
  if (!CORE || !CORE.qs(CORE.SOLVEIT.sel.dialog) || !CORE.features.init('tts-reader', 'TTS Reader', 'Read notes and AI responses aloud with Web Speech API')) return;
  let loading = null;
  const load = () => {
    if (window.craftTTS?.__loaded) return Promise.resolve(window.craftTTS);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      document.querySelector('script[data-craft-asset="craft_tts.js"]')?.remove();
      const s = document.createElement('script');
      s.src = '/static/.craft-assets/craft_tts.js';
      s.dataset.craftAsset = 'craft_tts.js';
      s.onload = () => { loading = null; resolve(window.craftTTS); };
      s.onerror = err => { loading = null; reject(err); };
      document.head.append(s);
    });
    return loading;
  };
  const offMenu = window.craftActionMenus?.registerProvider?.(ctx => {
    if (!ctx.cell) return [];
    return [
      {header: 'Read Aloud'},
      {label: 'Read aloud', onClick: () => load().then(api => api?.readCell?.(ctx.cell, ctx.isOutput))},
      {label: 'Read from here', onClick: () => load().then(api => api?.readFromHere?.(ctx.cell))},
    ];
  });
  const reg = spec => window.__hotkeyRegister?.(spec);
  reg({id: 'craft-tts-cell', label: 'Read selected cell aloud (TTS)', group: 'CRAFT · Reading', combo: '', handler: () => { load().then(api => api?.readCell?.()); return true; }});
  reg({id: 'craft-tts-from', label: 'Read dialog from selected cell (TTS)', group: 'CRAFT · Reading', combo: '', handler: () => { load().then(api => api?.readFromHere?.()); return true; }});
  reg({id: 'craft-tts-stop', label: 'Stop text-to-speech reader', group: 'CRAFT · Reading', combo: '', handler: () => { if (window.craftTTS?.__loaded) window.craftTTS.stop(); return true; }});
  window.craftTTS = {
    readCell: (...args) => load().then(api => api?.readCell?.(...args)),
    readFromHere: (...args) => load().then(api => api?.readFromHere?.(...args)),
    togglePause: () => { if (window.craftTTS?.__loaded) window.craftTTS.togglePause(); },
    stop: () => { if (window.craftTTS?.__loaded) window.craftTTS.stop(); },
    disable() { offMenu?.(); delete window.craftTTS; },
  };
})();

/* %% nbs/craft/19_bug_capture.ipynb #35f3f088 */
(() => {
  window.craftBugCapture?.disable?.();
  const CORE = window.__craftCMCore;
  if (!CORE || !CORE.features.init('bug-capture', 'Bug Capture', 'In-app bug-report modal with sanitized DOM and console capture')) return;
  const {store} = CORE;
  const ENABLED_KEY = 'craft-bug-capture:enabled';
  const isEnabled = () => store.get(ENABLED_KEY) === '1';
  let loading = null;
  const load = () => {
    if (window.craftBugCapture?.__loaded) return Promise.resolve(window.craftBugCapture);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      document.querySelector('script[data-craft-asset="craft_bug_capture.js"]')?.remove();
      const s = document.createElement('script');
      s.src = '/static/.craft-assets/craft_bug_capture.js';
      s.dataset.craftAsset = 'craft_bug_capture.js';
      s.onload = () => { loading = null; resolve(window.craftBugCapture); };
      s.onerror = err => { loading = null; reject(err); };
      document.head.append(s);
    });
    return loading;
  };
  window.__hotkeyRegister?.({
    id: 'craft-bug-toggle-icon',
    label: 'Toggle bug-report help icon',
    group: 'CRAFT · Support',
    combo: '',
    handler: () => { load().then(api => api?.setEnabled?.(!api.isEnabled())); return true; },
  });
  window.__hotkeyRegister?.({
    id: 'craft-bug-open-form',
    label: 'Report a bug (open support form)',
    group: 'CRAFT · Support',
    combo: '',
    handler: () => { load().then(api => api?.open?.()); return true; },
  });
  window.craftBugCapture = {
    isEnabled,
    setEnabled: val => load().then(api => api?.setEnabled?.(val)),
    open: () => load().then(api => api?.open?.()),
    close: () => { if (window.craftBugCapture?.__loaded) window.craftBugCapture.close(); },
    getRecentErrors: () => [],
    disable() { delete window.craftBugCapture; },
  };
  if (isEnabled()) load();
})();
