/* %% nbs/craft/01_cm_core.ipynb #1cf3dd3a */
window.__craftCfg = Object.assign(window.__craftCfg || {}, {"cm_dark_pal": {"kw": "#f97583", "str": "#9ecbff", "re": "#dbedff", "num": "#79b8ff", "fn": "#b392f0", "tag": "#85e89d", "fg": "#e1e4e8", "inv": "#fdaeb7"}, "cm_light_pal": {"kw": "#d73a49", "str": "#032f62", "re": "#032f62", "num": "#005cc5", "fn": "#6f42c1", "tag": "#22863a", "fg": "#24292e", "inv": "#cb2431"}});

/* %% nbs/craft/01_cm_core.ipynb #78a3ef9c */
(() => {
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
    shell: ['Shell', ['bash', 'sh', 'zsh', 'shell'], 'mode-shell.js', `https://esm.sh/@codemirror/legacy-modes@6.5.1/mode/shell?${CM_DEPS}`, (m, cm) => new cm.lang.LanguageSupport(cm.lang.StreamLanguage.define(m.shell))],
  };
  const LANG_ALIASES = {
    py: 'python', py3: 'python', python3: 'python',
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    md: 'markdown', svg: 'xml', yml: 'yaml', rs: 'rust', c: 'cpp', 'c++': 'cpp', cxx: 'cpp',
    bash: 'shell', sh: 'shell', zsh: 'shell', shell: 'shell', script: 'shell',
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

  function installDirtyGuards({dirtyIds, getContent, save, failMsg, tag = 'craft'}) {
    const onBeforeUnload = e => {
      if (!dirtyIds.size) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    const origFollowRename = window.followRename;
    if (typeof origFollowRename === 'function') {
      window.followRename = async function(url) {
        for (const k of [...dirtyIds]) {
          const content = getContent(k);
          if (content != null && !(await save(k, content))) {
            notifyErr(failMsg || 'Could not save edit before reopening renamed dialog.', tag);
            return;
          }
        }
        return origFollowRename.call(this, url);
      };
    }
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (typeof origFollowRename === 'function') window.followRename = origFollowRename;
    };
  }

  async function jumpToLastCell(exitFn) {
    await exitFn();
    const all = [...document.querySelectorAll('#dialog-container > .editable')].filter(e => !e.hidden && getComputedStyle(e).display !== 'none');
    const last = all[all.length - 1];
    if (!last) return;
    if (window.craftC2?.manages?.(last.id) && !last.querySelector(':scope > .card-in')?.classList.contains('collapsed')) {
      last.scrollIntoView({block: 'nearest'});
      window.craftC2.edit(last.id, {toEnd: true});
    } else if (window.craftMd?.manages?.(last.id)) {
      last.scrollIntoView({block: 'nearest'});
      window.craftMd.edit(last.id, {toEnd: true});
    } else {
      last.querySelector('div[hx-post^="/editor_"]')?.click();
    }
  }
  const BLOCKED_SEL = 'input,textarea,select,[contenteditable],.monaco-editor,#full_editor,.hk-overlay.open,#solveit-launcher.open,[role="dialog"],.uk-modal.uk-open';
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

  async function saveInputContents({id, content, waitersMap, key = id, tag = 'craft'}) {
    let resolveReq;
    const statusP = new Promise(r => { resolveReq = r; });
    const waiters = waitersMap.get(key) || [];
    waiters.push(resolveReq);
    waitersMap.set(key, waiters);
    try {
      const ajaxP = htmxPost('/set_contents_', {id_: '_' + id, ids: id, contents: JSON.stringify({[id]: content})})
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
      await htmxPost('/split_at_', {content, linenos: JSON.stringify(linenos), id_: id, msg_type: msgType, is_input: '1'});
      onSuccess?.();
    } catch (err) {
      notifyErr('Could not split cell.', tag);
      console.error(`${tag}: split failed`, err);
    }
  }

  async function switchCellMtype({id, mtyp, onMatch, tag = 'craft'}) {
    try {
      await htmxPost('/set_mtyp_', {id_: '_' + id, ids: '_' + id, mtyp});
      if (!onMatch) return;
      for (let i = 0; i < 60; i++) {
        if (getCellEl(id)?.querySelector(':scope > .card-in')?.dataset.mtype === mtyp) {
          onMatch();
          return;
        }
        await new Promise(r => setTimeout(r, 40));
      }
    } catch (err) {
      notifyErr('Could not change cell type.', tag);
      console.error(`${tag}: set_mtyp failed`, err);
    }
  }

  async function runCellCmd({id, cmd, after = '', tag = 'craft', failMsg = ''}) {
    const runCmd = cmd === 'continue' ? 'run' : cmd;
    try {
      await htmxPost('/add_runq_', {id_: '_' + id, ids: '_' + id, cmd: runCmd, after});
      if (cmd === 'continue') await htmxPost('/continue_prompt_', {id_: '_' + id, ids: '_' + id});
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
  const _DOM_ATTRS = ['class', 'style', 'hidden', 'data-mtype', 'data-editing', 'data-sm', 'data-sm-header', 'data-c2-editing', 'data-md-editing', 'data-diff', 'data-wait', 'value'];
  let _domObs = null, _domObserving = false;
  const _ensureDomObs = () => {
    if (_domObserving || !_domSubs.size || !document.body) return;
    if (!_domObs) {
      _domObs = new MutationObserver(records => {
        for (const sub of [..._domSubs]) {
          if (sub.inDialog && !records.some(r => r.target.id === 'dialog-container' || r.target.closest?.('#dialog-container'))) continue;
          const hit = records.some(r => r.type === 'childList' || (sub.charData && r.type === 'characterData') || (sub.attrs && sub.attrs.has(r.attributeName)));
          if (!hit) continue;
          if (sub.delay === 0) sub.fn(records);
          else if (sub.delay === 'micro') { if (!sub.pend) { sub.pend = true; queueMicrotask(() => { sub.pend = false; if (_domSubs.has(sub)) sub.fn(); }); } }
          else if (sub.delay === 'raf') { if (!sub.pend) sub.pend = requestAnimationFrame(() => { sub.pend = 0; if (_domSubs.has(sub)) sub.fn(); }); }
          else if (typeof sub.delay === 'number') { if (!sub.pend) sub.pend = setTimeout(() => { sub.pend = 0; if (_domSubs.has(sub)) sub.fn(); }, sub.delay); }
        }
      });
    }
    _domObs.observe(document.body, {childList: true, subtree: true, attributes: true, characterData: true, attributeFilter: _DOM_ATTRS});
    _domObserving = true;
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
      if (!_domSubs.size && _domObs) { _domObs.disconnect(); _domObserving = false; }
    };
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
    let activeKey = null, frame = null, destroyed = false;

    const syncSaveState = key => {
      const st = failedSaves.has(key) ? 'error' : (pendingSaves.has(key) ? 'saving' : (dirtyIds.has(key) ? 'dirty' : ''));
      cfg.applySaveState(key, st);
    };

    async function saveCell(key, content) {
      const id = keyToId(key), el = getCellEl(id);
      if (!el) return true;
      const prev = cfg.getText(el, key);
      if (content === prev) {
        dirtyIds.delete(key);
        failedSaves.delete(key);
        syncSaveState(key);
        return pendingSaves.get(key) ? await pendingSaves.get(key) : true;
      }
      dirtyIds.add(key);
      failedSaves.delete(key);
      syncSaveState(key);
      const p = (async () => {
        let ok = false;
        try {
          ok = cfg.persistSave
            ? await cfg.persistSave(key, content, saveWaiters)
            : await saveInputContents({id, content, waitersMap: saveWaiters, key, tag});
        } finally {
          if (pendingSaves.get(key) === p) pendingSaves.delete(key);
        }
        if (ok) {
          failedSaves.delete(key);
          const curEl = getCellEl(id);
          const inp = cfg.getInput(curEl, key);
          if (inp && normValue(inp.value) === prev) inp.value = content;
          const curView = views.get(key)?.view;
          if (!curView || curView.state.doc.toString() === content) dirtyIds.delete(key);
        } else {
          failedSaves.add(key);
          notifyErr(cfg.saveFailMsg ? cfg.saveFailMsg(key) : 'Could not save cell edit — changes kept in editor.', tag);
        }
        syncSaveState(key);
        return ok;
      })();
      pendingSaves.set(key, p);
      syncSaveState(key);
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
      const el = getCellEl(keyToId(key)), card = cfg.getCard(el, key);
      cfg.setEditing(key, false, el, card);
      if (activeKey === key) activeKey = null;
      const content = rec.view.state.doc.toString();
      saveState(states, key, rec);
      const saved = await saveCell(key, content);
      const cur = views.get(key);
      if (!cur || cur.view.hasFocus || activeKey === key) return;
      if (!saved || dirtyIds.has(key) || cfg.keepMounted?.(key, cur)) return;
      unmountCell(key);
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
      const id = keyToId(key), rec = views.get(key), el = getCellEl(id);
      cfg.beforeRun?.(key, rec);
      if (!rec || !el) return;
      const content = rec.view.state.doc.toString();
      const next = cmd === 'shift-run' ? window.adjacentMsg?.(window.$(el), false) : null;
      const after = cmd === 'alt-run' ? (window.sectionTail?.(el) || '') : '';
      saveState(states, key, rec);
      const saved = await saveCell(key, content);
      if (!saved) return;
      cfg.setEditing(key, false, el, cfg.getCard(el, key));
      if (activeKey === key) activeKey = null;
      rec.view.contentDOM.blur();
      if (cmd === 'shift-run' && next?.length) window.selectMsg?.(next);
      else window.selectMsg?.(window.$(el), {scroll: false});
      const cur = views.get(key);
      if (cur && !cur.view.hasFocus && activeKey !== key && !dirtyIds.has(key) && !cfg.keepMounted?.(key, cur)) unmountCell(key);
      if (await runCellCmd({id, cmd, after, tag, failMsg: cfg.runFailMsg || ''})) schedule();
    }

    async function splitCell(key, v, msgType) {
      cfg.beforeSplit?.(key, v);
      await splitCellAt({
        id: keyToId(key), view: v, msgType, tag,
        onSuccess: () => { dirtyIds.delete(key); failedSaves.delete(key); syncSaveState(key); unmountCell(key); },
      });
    }

    async function switchCellType(key, v, mtyp, {clearState = false, onMatch} = {}) {
      const id = keyToId(key);
      const sel = v.state.selection.main;
      const selSpec = {anchor: sel.anchor, head: sel.head};
      cfg.beforeSwitch?.(key, v);
      const saved = await saveCell(key, v.state.doc.toString());
      if (!saved) return;
      unmountCell(key);
      if (clearState) states.delete(key);
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
      const rec = views.get(key);
      if (rec) saveState(states, key, {...rec, view: v});
      cfg.setEditing(key, false, el, cfg.getCard(el, key));
      if (activeKey === key) activeKey = null;
      v.contentDOM.blur();
      saveCell(key, v.state.doc.toString()).then(ok => {
        const cur = views.get(key);
        if (ok && cur && !cur.view.hasFocus && activeKey !== key && !dirtyIds.has(key) && !cfg.keepMounted?.(key, cur)) unmountCell(key);
      });
      const nextId = normId(nextEl.id);
      const edgeSel = up ? {toEnd: true} : {anchor: 0, head: 0};
      const codeCard = nextEl.querySelector('.card-in[data-mtype="code"]');
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
      const body = card?.querySelector('.msg-body'), contentEl = body?.querySelector('.msg-content');
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
      const {edState, activeComps, reusePrev} = prepareState();
      const host = document.createElement('div');
      host.className = hostClass;
      contentEl.after(host);
      card.classList.add(cfg.mountedCls);
      cfg.setEditing(key, true, el, card);
      const v = new cm.view.EditorView({state: edState, parent: host});
      attachHost(key, host);
      rec = {view: v, host, ...activeComps, ...extraRec};
      views.set(key, rec);
      activeKey = key;
      cfg.setEditing(key, true, el, card);
      if (reusePrev && themeExts && activeComps.themeComp) v.dispatch({effects: activeComps.themeComp.reconfigure(themeExts)});
      onMounted?.(rec);
      applySelection(v, selSpec || (reusePrev ? null : {toEnd: true}), resolveHint);
      syncFindBoxToView(v, cm);
      v.focus();
      requestAnimationFrame(() => {
        if (!destroyed && activeKey === key && views.get(key)?.view === v && !v.hasFocus && document.activeElement === document.body) v.focus();
      });
      return true;
    }

    function attachHost(key, host) {
      host.addEventListener('keydown', e => { e.stopPropagation(); });
      host.addEventListener('focusin', () => {
        activeKey = key;
        const curEl = getCellEl(keyToId(key));
        cfg.setEditing(key, true, curEl, cfg.getCard(curEl, key));
      });
      host.addEventListener('focusout', () => {
        const check = () => {
          if (destroyed) return;
          if (!host.isConnected) { sync(); return; }
          const ae = document.activeElement;
          if (host.contains(ae) || ae?.closest?.('.cm-tooltip')) return;
          onCellBlur(key);
        };
        queueMicrotask(() => {
          if (destroyed) return;
          if (!host.isConnected) { sync(); return; }
          requestAnimationFrame(check);
        });
      });
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
        const body = card.querySelector('.msg-body'), contentEl = body?.querySelector('.msg-content');
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
    };
    const schedule = rafOnce(sync);

    const before = ({detail: {ctx} = {}}) => {
      const request = ctx?.request, body = request?.body;
      if (!body?.get || request.method !== 'POST') return;
      const pathname = new URL(request.action, location.href).pathname;
      if (pathname === '/set_contents_') {
        const id = normId(body.get('ids'));
        const key = id ? idToInputKey(id) : '';
        if (key && saveWaiters.has(key)) requests.set(ctx, {kind: 'save', key});
        return;
      }
      cfg.onBeforeRequest?.(ctx, pathname, body);
    };

    const after = ({detail: {ctx} = {}}) => {
      const rec = ctx && requests.get(ctx);
      if (rec?.kind === 'save') {
        const ok = Boolean(ctx.response && ctx.response.status >= 200 && ctx.response.status < 300);
        const waiters = saveWaiters.get(rec.key);
        const fn = waiters?.shift();
        if (waiters && !waiters.length) saveWaiters.delete(rec.key);
        fn?.(ok);
        return;
      }
      cfg.onAfterRequest?.(ctx);
    };

    const onKeyDown = e => {
      if (!cfg.openPrimaryOnEnter) return;
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (typingBlocked(cfg.typingBlockedExtra || '')) return;
      const el = document.querySelector('#dialog-container > .editable[data-sm="primary"]');
      if (!el || !cfg.openPrimaryOnEnter(el, false)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      cfg.openPrimaryOnEnter(el, true);
    };

    const onClick = e => {
      if (cfg.onEditClick) {
        const edit = e.target.closest?.(cfg.editClickSel || '.card-in [hx-post="/editor_"]');
        if (edit && !edit.dataset.craftAllowMonaco) {
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

    return {
      states, views, pendingSaves, dirtyIds, failedSaves, saveWaiters,
      get activeKey() { return activeKey; },
      set activeKey(v) { activeKey = v; },
      get destroyed() { return destroyed; },
      syncSaveState, saveCell, unmountCell, onCellBlur, exitCell, saveAndRun, splitCell,
      switchCellType, stepBoundary, openView, attachHost, sync, schedule,
      disable() {
        destroyed = true;
        unsubDom();
        schedule.cancel();
        removeDirtyGuards();
        ac.abort();
        for (const key of [...views.keys()]) unmountCell(key);
        views.clear(); states.clear(); pendingSaves.clear(); dirtyIds.clear(); failedSaves.clear(); saveWaiters.clear();
      },
    };
  }

  window.__craftCMCore = {
    LOCAL_CM_BASE, CM_DEPS, CM_URLS, LANG_SPECS, LANG_ALIASES, langCache,
    isMac, isDark, normId, getCellEl, normalizeText, notifyErr,
    buildStyles, loadCoreCM, loadLang, codeLanguages, syncFindBoxToView, applySelection,
    installDirtyGuards, jumpToLastCell,
    kid, typingBlocked, htmxPost, patch, el, qs, qsa, on, rafOnce, store, mountTpl, offsetIn,
    saveInputContents, splitCellAt, switchCellMtype, runCellCmd, isAtVerticalEdge,
    onDomChange, createInlineEditor,
  };
})();

/* %% nbs/craft/02_core_ui.ipynb #ca03a923 */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"mobile_phone_icon": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"7\" y=\"2\" width=\"10\" height=\"20\" rx=\"2\"></rect><path d=\"M11 18h2\"></path></svg>", "mobile_desk_icon": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"2\" y=\"3\" width=\"20\" height=\"14\" rx=\"2\"></rect><path d=\"M8 21h8M12 17v4\"></path></svg>", "mobile_toggle_btn": "<button id=\"craft-mobile-toggle\" type=\"button\"></button>", "launcher_root": "<div id=\"solveit-launcher\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Command palette\"><div class=\"solveit-launcher-card\"><input type=\"text\" placeholder=\"Run a command or open a dialog/file…\" autocomplete=\"off\" spellcheck=\"false\" aria-label=\"Search commands and files\"><ul role=\"listbox\"></ul></div></div>", "action_menu": "<div id=\"craft-cell-action-menu\" class=\"craft-action-menu\" popover=\"auto\" role=\"menu\"></div>", "insert_trigger": "<button id=\"craft-insert-preview\" type=\"button\" hidden popovertarget=\"craft-insert-preview-menu\"></button>", "insert_menu": "<div id=\"craft-insert-preview-menu\" popover=\"auto\"><small>New cell type</small><button type=\"button\" data-kind=\"Code\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 6l-6 6 6 6m8-12 6 6-6 6M14 4l-4 16\"></path></svg>Code</button><button type=\"button\" data-kind=\"Note\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 3h10l4 4v14H5z M15 3v5h4M8 12h8m-8 4h8\"></path></svg>Note</button><button type=\"button\" data-kind=\"Raw\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 5h18v14H3z M7 9v6\"></path></svg>Raw</button><button type=\"button\" data-kind=\"Prompt\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 4h18v12H9l-6 4z M7 10h.01m5 0h.01m5 0h.01\"></path></svg>Prompt</button></div>", "desk_edge_below": "<button type=\"button\" class=\"craft-desk-edge\" data-edge=\"below\" aria-label=\"Insert cell below (drag to pick type)\"><span class=\"craft-desk-edge-pill\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"12\" height=\"12\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 6v12M6 12h12\"></path></svg><span class=\"craft-desk-edge-kind\"></span></span></button>", "desk_picker": "<div id=\"craft-desk-picker\" role=\"menu\"><div class=\"craft-desk-picker-head\"></div><div class=\"craft-desk-picker-opts\"><button type=\"button\" role=\"menuitem\" data-type=\"Code\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 6l-6 6 6 6m8-12 6 6-6 6M14 4l-4 16\"></path></svg><span>Code</span><kbd>C</kbd></button><button type=\"button\" role=\"menuitem\" data-type=\"Note\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 3h10l4 4v14H5z M15 3v5h4M8 12h8m-8 4h8\"></path></svg><span>Note</span><kbd>N</kbd></button><button type=\"button\" role=\"menuitem\" data-type=\"Prompt\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 4h18v12H9l-6 4z M7 10h.01m5 0h.01m5 0h.01\"></path></svg><span>Prompt</span><kbd>P</kbd></button><button type=\"button\" role=\"menuitem\" data-type=\"Raw\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 5h18v14H3z M7 9v6\"></path></svg><span>Raw</span><kbd>R</kbd></button></div></div>", "action_trigger": "<button type=\"button\" class=\"craft-action-trigger\" aria-haspopup=\"menu\" aria-expanded=\"false\" aria-controls=\"craft-cell-action-menu\">…</button>", "omit_marker": "<button type=\"button\" class=\"craft-omit-marker\"></button>", "insert_placeholder": "<div class=\"craft-insert-placeholder\"></div>", "table_wrap": "<div class=\"craft-table-wrap\" tabindex=\"0\" role=\"region\" aria-label=\"Scrollable table\"></div>", "table_copy_btn": "<button type=\"button\" class=\"craft-table-copy\" aria-label=\"Copy table as TSV\">Copy TSV</button>", "cell_icon_Code": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 6l-6 6 6 6m8-12 6 6-6 6M14 4l-4 16\"></path></svg>", "cell_icon_Note": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 3h10l4 4v14H5z M15 3v5h4M8 12h8m-8 4h8\"></path></svg>", "cell_icon_Raw": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 5h18v14H3z M7 9v6\"></path></svg>", "cell_icon_Prompt": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 4h18v12H9l-6 4z M7 10h.01m5 0h.01m5 0h.01\"></path></svg>", "desk_icon_Code": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"11\" height=\"11\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 6l-6 6 6 6m8-12 6 6-6 6M14 4l-4 16\"></path></svg>", "desk_icon_Note": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"11\" height=\"11\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 3h10l4 4v14H5z M15 3v5h4M8 12h8m-8 4h8\"></path></svg>", "desk_icon_Raw": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"11\" height=\"11\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 5h18v14H3z M7 9v6\"></path></svg>", "desk_icon_Prompt": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"11\" height=\"11\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 4h18v12H9l-6 4z M7 10h.01m5 0h.01m5 0h.01\"></path></svg>"});
window.__craftCfg = Object.assign(window.__craftCfg || {}, {"cell_types": ["Code", "Note", "Prompt", "Raw"], "key_to_type": {"c": "Code", "n": "Note", "p": "Prompt", "r": "Raw"}, "slash_map": {"c": "Code", "code": "Code", "n": "Note", "note": "Note", "p": "Prompt", "prompt": "Prompt", "r": "Raw", "raw": "Raw"}});

/* %% nbs/craft/02_core_ui.ipynb #255a46c8 */
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

/* %% nbs/craft/02_core_ui.ipynb #44718d99 */
/* ── Mobile mode detection & view toggle ───────────────────────────────
   Auto-enables `html.craft-mobile` only on touch/mobile devices (`(hover: none)
   and (pointer: coarse)`), so shrinking a desktop window stays in desktop view.
   Users can explicitly switch between Desktop and Mobile at any time via the
   navbar toggle button (#craft-mobile-toggle), the launcher, or
   `window.craftMobile.setMode('auto'|'mobile'|'desktop')`. */
(() => {
  window.craftMobile?.disable?.();
  const {mountTpl, qs, on, store, patch, onDomChange} = window.__craftCMCore;
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

  const TPL = window.__craftTpl || {};
  const PHONE_SVG = TPL.mobile_phone_icon || '', DESK_SVG = TPL.mobile_desk_icon || '';

  const toggleBtn = mountTpl('mobile_toggle_btn');

  const syncToggleBtn = () => {
    const isMob = root.classList.contains('craft-mobile');
    const key = `${isMob ? 'm' : 'd'}:${pref}`;
    if (toggleBtn.dataset.state === key) return;
    const title = isMob
      ? `Switch to desktop view (current: ${pref === 'auto' ? 'auto mobile' : 'mobile'})`
      : `Switch to mobile view (current: ${pref === 'auto' ? 'auto desktop' : 'desktop'})`;
    patch(toggleBtn, {dataset: {state: key}, innerHTML: isMob ? DESK_SVG : PHONE_SVG, title, 'aria-label': title, 'aria-pressed': String(isMob)});
  };

  const positionToggleBtn = () => {
    if (root.classList.contains('craft-mobile')) return;
    Object.assign(toggleBtn.style, { left: 'auto', right: '10px', top: '6px' });
  };

  const mountToggleBtn = () => {
    if (!toggleBtn.isConnected && document.body) document.body.append(toggleBtn);
    syncToggleBtn();
    positionToggleBtn();
  };

  const apply = () => {
    const on = computeActive();
    const changed = root.classList.contains('craft-mobile') !== on;
    if (changed) {
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
  let offDom = null;
  on(window, 'resize', positionToggleBtn, {passive: true, signal: ac.signal});
  const start = () => {
    mountToggleBtn();
    offDom = onDomChange(mountToggleBtn, {delay: 0});
  };
  apply();
  if (document.body) start(); else on(document, 'DOMContentLoaded', start, {once: true, signal: ac.signal});

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
    reposition: positionToggleBtn,
    disable() {
      ac.abort();
      offDom?.();
      toggleBtn.remove();
      root.classList.remove('craft-mobile');
      if (addedMeta) meta.remove(); else if (prevMeta != null) meta.content = prevMeta;
      listeners.clear();
      delete window.craftMobile;
    },
  };
})();

/* %% nbs/craft/02_core_ui.ipynb #57c379b5 */
/* ── Auto-hiding top nav ──────────────────────────────────────────────
   The reveal trigger is decoupled from the bar. The band starts BELOW the
   browser's own top-edge hotspot so a hidden browser toolbar doesn't fight
   it, and the bar stays pinned while the pointer is over the nav or inside
   an open UIkit drop, fading only after a grace period. */
(() => {
  const {qs, on} = window.__craftCMCore;
  const TRIGGER_TOP = 28;      // px: clear of the browser's top-edge hotspot
  const TRIGGER_BOTTOM = 76;   // px: bottom of the reveal band
  const HIDE_DELAY = 700;      // ms grace period before fading out

  const SEL = '.uk-container > nav.monster-navbar';
  const PIN = '.uk-drop, .uk-dropdown, [uk-drop], [uk-dropdown]';
  const MODAL_OPEN = '.uk-modal.uk-open, .hk-overlay.open, #solveit-launcher.open';

  const nav = () => qs(SEL);
  let timer = null, last = null;

  function wantOpen() {
    if (qs(MODAL_OPEN)) return false;
    if (!last) return false;
    if (last.y >= TRIGGER_TOP && last.y <= TRIGGER_BOTTOM) return true;
    const t = last.target;
    if (t instanceof Element) {
      if (nav()?.contains(t)) return true;
      if (t.closest(PIN)) return true;
    }
    return !!qs('.uk-drop.uk-open, .uk-dropdown.uk-open');
  }

  function sync() {
    const n = nav();
    if (!n) return;
    if (wantOpen()) {
      clearTimeout(timer);
      timer = null;
      n.classList.add('nav-shown');
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        if (!wantOpen()) nav()?.classList.remove('nav-shown');
      }, HIDE_DELAY);
    }
  }

  on(document, 'mousemove', e => {
    // Phones: taps emit compat mousemoves, which would flash the bar at random. The mobile toolbar's ☰ drives it instead.
    if (window.craftMobile?.active()) return;
    last = { y: e.clientY, target: e.target };
    sync();
  }, { passive: true });

  on(document, 'focusin', e => {
    last = { y: -1, target: e.target };
    sync();
  });
})();

/* ── Compact Monaco line height ──────────────────────────────────── */
/* Code size and family come from CRAFT.css. Monaco line-height matches the
   code size; remeasure after webfonts load to keep cursor columns aligned. */
(() => {
  let tries = 0;
  const go = () => {
    const mon = window.monaco?.editor;
    if (!mon) return ++tries < 40 && setTimeout(go, 250);
    // Recompute character widths after the webfonts replace the fallback.
    if (document.fonts) Promise.all([
      document.fonts.load('10px "Craft Iosevka"'),
      document.fonts.load('italic 10px "Craft Iosevka"'),
      document.fonts.load('bold 10px "Craft Iosevka"'),
      document.fonts.load('italic bold 10px "Craft Iosevka"')
    ]).then(() => { mon.remeasureFonts(); mon.getEditors().forEach(ed => ed.layout()); })
      .catch(err => console.warn('Iosevka could not load; using monospace fallback.', err));
    const compact = ed => {
      try {
        const cs = getComputedStyle(document.documentElement);
        const fs = parseFloat(cs.getPropertyValue('--craft-code')) || ed.getOption(mon.EditorOption.fontSize);
        const lh = Math.round(fs * (parseFloat(cs.getPropertyValue('--craft-code-lh')) || 1.2));
        ed.updateOptions({ fontSize: fs, lineHeight: lh, fontFamily: cs.getPropertyValue('--craft-code-family').trim() || 'monospace' });
      } catch (e) {}
    };
    mon.onDidCreateEditor?.(compact);
    mon.getEditors().forEach(compact);
    try { mon.getDiffEditors().forEach(d => { const cs = getComputedStyle(document.documentElement); const fs = parseFloat(cs.getPropertyValue('--craft-code')) || 10; const lh = Math.round(fs * (parseFloat(cs.getPropertyValue('--craft-code-lh')) || 1.2)); d.updateOptions({ fontSize: fs, lineHeight: lh, fontFamily: cs.getPropertyValue('--craft-code-family').trim() || 'monospace' }); }); } catch (e) {}
  };
  go();
})();

/* ── Launcher (⌘⇧P) ──────────────────────────────────────────────────
   One fuzzy box over commands (every hotkey-registry action, custom and
   Solveit built-in) and dialogs/files (whatever the file tree has loaded).
   Enter runs or opens the selection; Esc or a click outside closes. */
(() => {
  const {el, mountTpl, qsa, on} = window.__craftCMCore;
  let root, input, list, results = [], sel = 0, pool = [], prevFocus;

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
    ({root, input, list} = mountTpl('launcher_root', {refs: {input: 'input', list: 'ul'}}));
    on(root, 'mousedown', e => { if (e.target === root) close(); });
    on(input, {
      input: () => { sel = 0; render(); },
      keydown: e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(results.length, 1); paint(); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); run(results[sel]); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      },
    });
    on(list, 'click', e => { const li = e.target.closest('li[data-i]'); if (li) run(results[+li.dataset.i]); });
    document.body.append(root);
  }

  function render() {
    const q = input.value.trim().toLowerCase();
    results = pool.map(it => ({it, s: score(q, it.label + ' ' + it.detail)})).filter(r => r.s > 0).sort((a, b) => b.s - a.s).slice(0, 60).map(r => r.it);
    sel = Math.min(sel, Math.max(results.length - 1, 0));
    list.replaceChildren(...(results.length ? results.map((it, i) =>
      el('li', {cls: 'kind-' + it.kind, role: 'option', dataset: {i}},
        el('span', {cls: 'label'}, it.label), el('span', {cls: 'detail'}, it.detail), el('span', {cls: 'hint'}, it.hint))
    ) : [el('li', {cls: 'empty'}, 'No matches')]));
    paint();
  }

  function paint() {
    qsa('li[data-i]', list).forEach(li => { const on = +li.dataset.i === sel; li.setAttribute('aria-selected', String(on)); if (on) li.scrollIntoView({block: 'nearest'}); });
  }

  async function open() {
    if (!root) build();
    prevFocus = document.activeElement;
    const hk = window.solveitHotkeys;
    const cmds = (hk?.list?.() || []).filter(a => a.id !== 'launcher').map(a => ({kind: 'command', label: a.label, detail: a.group || '', hint: a.combo ? hk.formatCombo(a.combo) : '', go: () => hk.run(a.id)}));
    pool = cmds; root.classList.add('open'); input.value = ''; sel = 0; render(); input.focus();
    try {
      const entries = await window.solveitFileTree?.entries?.() || [];
      pool = cmds.concat(entries.map(n => ({kind: n.kind, label: n.name, detail: where(n), hint: n.kind, go: () => window.solveitFileTree.open(n)})));
      if (root.classList.contains('open')) render();
    } catch {}
  }

  function close() { if (!root?.classList.contains('open')) return; root.classList.remove('open'); prevFocus?.focus?.(); }
  function run(item) { if (!item) return; close(); setTimeout(() => Promise.resolve().then(item.go).catch(err => { console.error('Launcher action failed', err); alert('Action failed: ' + (err.message || err)); }), 0); }

  window.__hotkeyRegister?.({id: 'launcher', label: 'Open launcher', group: 'Launcher', combo: 'Mod+Shift+P', handler: () => { if (root?.classList.contains('open')) close(); else open(); return true; }});
})();
(() => {
  window.craftIdleComposer?.disable();
  if (window.CRAFT_IDLE_COMPOSER === false) return;
  const {qs, on, onDomChange} = window.__craftCMCore;
  let editor, originalFocus, subscriptions = [], requested = false, pending = false;
  const panel = () => document.getElementById('full_editor');
  const temporary = () => editor?.getModel()?.uri.path.endsWith('/temp');
  const hasDraft = () => !!window.edValue?.();
  const reveal = () => {
    requested = true;
    panel()?.classList.remove('craft-composer-idle');
    editor?.layout();
  };
  const unbind = () => {
    subscriptions.forEach(s => s.dispose());
    subscriptions = [];
    if (editor && originalFocus) editor.focus = originalFocus;
  };
  const sync = () => {
    pending = false;
    if (window.editor !== editor) {
      unbind();
      editor = window.editor;
      if (editor) {
        subscriptions.push(editor.onDidChangeModel(schedule));
        subscriptions.push(editor.onDidChangeModelContent(schedule));
      }
    }
    const root = panel();
    if (!root) return;
    const editingCell = Boolean(editor?.getModel() && !temporary()) || Boolean(qs('.editable[data-editing="true"]'));
    const emptyDialog = !qs('#dialog-container > .editable');
    const active = requested || (!insertionHolds.size && (emptyDialog || editingCell || hasDraft()));
    const idle = !active;
    if (root.classList.contains('craft-composer-idle') === idle) return;
    root.classList.toggle('craft-composer-idle', idle);
    if (active && editor) editor.layout();
  };
  const schedule = () => { if (!pending) { pending = true; queueMicrotask(sync); } };
  const tabClick = e => {
    const tab = e.target.closest('#full_editor .tabh');
    if (!tab) return;
    if (tab.id === 'tabh-code' && window.craftC2?.shouldInterceptCodeTab?.()) return;
    reveal();
  };
  let shortcutOpened = false, dismissTimer;
  const insertionHolds = new Set(), rootEl = document.documentElement;
  const clearInsertionHolds = () => { insertionHolds.clear(); rootEl.removeAttribute('data-craft-inserting'); };
  const holdForInsertion = () => {
    const token = Symbol();
    insertionHolds.add(token); rootEl.setAttribute('data-craft-inserting', '');
    return () => {
      if (!insertionHolds.delete(token) || insertionHolds.size) return;
      if (!hasDraft() && temporary()) hide();
      rootEl.removeAttribute('data-craft-inserting');
    };
  };
  const hide = () => {
    clearTimeout(dismissTimer);
    shortcutOpened = false;
    requested = false;
    sync();
  };
  const show = () => {
    if (window.editor !== editor) sync();
    const root = panel();
    if (!root || !editor?.getModel()) return false;
    clearTimeout(dismissTimer);
    clearInsertionHolds();
    shortcutOpened ||= root.classList.contains('craft-composer-idle');
    reveal();
    editor.focus();
    return true;
  };
  const dismissShortcut = e => {
    if (!shortcutOpened || e.key !== 'Escape' || e.isComposing || !panel()?.contains(e.target)) return;
    clearTimeout(dismissTimer);
    dismissTimer = setTimeout(() => {
      shortcutOpened = false;
      if (!temporary() || hasDraft() || qs('.editable[data-editing="true"]')) return;
      requested = false;
      sync();
    }, 0);
  };
  const ac = new AbortController(), sig = {signal: ac.signal}, cap = {capture: true, signal: ac.signal};
  const offDom = onDomChange(schedule, {attrs: ['data-editing'], delay: 0});
  const settleEvent = ['htmx', 'after', 'settle'].join(window.htmx?.config?.metaCharacter || ':');
  on(window, 'keydown', dismissShortcut, cap);
  on(document, 'click', tabClick, cap);
  on(document, settleEvent, schedule, sig);
  window.craftIdleComposer = {
    reveal,
    hide,
    show,
    holdForInsertion,
    disable() {
      offDom();
      ac.abort();
      clearTimeout(dismissTimer);
      clearInsertionHolds();
      if (window.craftIdleComposer?.show === show) delete window.craftIdleComposer;
      unbind();
      panel()?.classList.remove('craft-composer-idle');
      editor?.layout();
    }
  };
  sync();
  window.__hotkeyRegister?.({id: 'composer-show', label: 'Show cell editor', group: 'Editor', combo: 'Shift+I', handler: e => {
    if (e?.isComposing || e?.target?.closest?.('#solveit-file-tree-panel, #solveit-temp-editor, [role="dialog"], .uk-modal.uk-open, .hk-overlay.open, #solveit-launcher.open')) return false;
    return window.craftIdleComposer?.show() === true;
  }});
})();

/* %% nbs/craft/02_core_ui.ipynb #bedbb7e5 */
(() => {
  window.craftCellChains?.disable();
  let frame;
  const sync = () => {
    frame = null;
    const all = [...document.querySelectorAll('#dialog-container > .editable')];
    const cells = all.filter(e => !e.hidden && getComputedStyle(e).display !== 'none');
    const type = e => e?.querySelector(':scope > .card-in')?.dataset.mtype;
    const joins = (a, b) => ['prompt', 'code', 'note'].includes(type(a)) && type(a) === type(b);
    const prev = new Set(cells.filter((e, i) => i > 0 && joins(cells[i-1], e)));
    const next = new Set(cells.filter((e, i) => i < cells.length-1 && joins(e, cells[i+1])));
    for (const e of all) {
      if (e.classList.contains('craft-chain-prev') !== prev.has(e)) e.classList.toggle('craft-chain-prev', prev.has(e));
      if (e.classList.contains('craft-chain-next') !== next.has(e)) e.classList.toggle('craft-chain-next', next.has(e));
    }
  };
  const offDom = window.__craftCMCore.onDomChange(sync, {attrs: ['class', 'style', 'hidden', 'data-mtype'], delay: 'raf'});
  window.craftCellChains = {
    sync,
    disable() {
      offDom();
      document.querySelectorAll('.craft-chain-prev,.craft-chain-next').forEach(e => e.classList.remove('craft-chain-prev', 'craft-chain-next'));
    }
  };
  sync();
})();

(() => {
  window.craftActionMenus?.disable();
  if (window.CRAFT_ACTION_MENUS === false) return;
  let current = null, frame = null;
  const {mountTpl, qsa, on, onDomChange} = window.__craftCMCore;
  const menu = mountTpl('action_menu');
  document.body.append(menu);
  const close = (restore = false) => {
    const trigger = current;
    current = null;
    trigger?.setAttribute('aria-expanded', 'false');
    if (menu.matches(':popover-open')) menu.hidePopover();
    if (restore && trigger?.isConnected) trigger.focus({preventScroll: true});
  };
  const open = trigger => {
    if (current === trigger) return close(true);
    close();
    const card = trigger.closest('.msg-card');
    const group = card.querySelector('.uk-card-header .uk-btn-group');
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
    if (card.matches('.card-in[data-mtype="code"]') && window.craftC2) {
      const cellEl = card.closest('.editable');
      const cid = cellEl?.id?.replace(/^_/, '');
      if (cid) {
        menu.append(
          window.__craftCMCore.el('hr', {cls: 'craft-action-sep'}),
          window.__craftCMCore.el('button', {
            type: 'button', role: 'menuitem',
            onClick: e => { e.stopPropagation(); close(); window.craftC2.toggleLineNumbers?.(); },
          }, `Line numbers: ${window.craftC2.lineNumbers?.() ? 'On' : 'Off'}`),
        );
      }
    }
    current = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    menu.setAttribute('aria-label', trigger.getAttribute('aria-label'));
    menu.showPopover();
    const r = trigger.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8)) + 'px';
    menu.querySelector('button:not(:disabled)')?.focus({preventScroll: true});
  };
  const sync = () => {
    frame = null;
    if (current && !current.isConnected) close();
    for (const group of document.querySelectorAll('#dialog-container .msg-card > .uk-card-header .uk-btn-group')) {
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
  const keys = e => {
    if (!current) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(true); return; }
    if (!menu.contains(e.target)) return;
    e.stopImmediatePropagation();
    const items = qsa('button:not(:disabled)', menu);
    const i = items.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? items.length-1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[j]?.focus();
    }
  };
  const focus = e => { if (current && !menu.contains(e.target) && e.target !== current) close(); };
  const toggled = () => { if (!menu.matches(':popover-open') && current) close(); };
  const ac = new AbortController(), sig = {signal: ac.signal}, cap = {capture: true, signal: ac.signal};
  const offDom = onDomChange(sync, {delay: 'raf', inDialog: true});
  on(document, 'keydown', keys, cap);
  on(document, {focusin: focus, 'htmx:beforeSwap': () => close()}, sig);
  on(menu, 'toggle', toggled, sig);
  window.craftActionMenus = {
    sync,
    close,
    disable() {
      offDom();
      close();
      ac.abort();
      qsa('.craft-action-trigger').forEach(e => e.remove());
      qsa('.craft-action-source,.craft-old-action-toggle').forEach(e => e.classList.remove('craft-action-source', 'craft-old-action-toggle'));
      menu.remove();
    }
  };
  sync();
})();


(() => {
  const {mountTpl, qsa, on, onDomChange} = window.__craftCMCore;
  const preserved = qsa('.editable.craft-omitted').map(e => e.id);
  window.craftOmit?.disable();
  const omitted = new Set(preserved), markers = new Map();
  let frame, approach = 1;
  const root = () => document.getElementById('dialog-container');
  const cells = () => qsa(':scope > .editable', root());
  const eligible = e => !e.hidden && !e.matches('.filter-hidden,.heading-hidden,.hidden');
  const marker = () => document.activeElement?.closest('.craft-omit-marker');
  const blocked = () => window.__craftCMCore.typingBlocked();
  const selected = () => cells().filter(e => e.matches('[data-sm="primary"],[data-sm="secondary"]') && e.offsetParent !== null);
  const clearSelection = () => document.querySelectorAll('[data-sm="primary"],[data-sm="secondary"]').forEach(e => e.setAttribute('data-sm', 'unselected'));
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
    frame = null;
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
    const editing = document.getElementById('id_')?.value;
    if (targets.some(e => e.dataset.editing === 'true' || e.id === '_' + editing)) {
      window.UIkit?.notification('Finish editing the cell before omitting it.', {status: 'warning'});
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
        const active = current || document.querySelector('#dialog-container > [data-sm="primary"]');
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
  const offDom = onDomChange(sync, {attrs: ['class', 'hidden', 'data-sm-header'], delay: 'raf', inDialog: true});
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


(() => {
  window.craftParts?.disable();
  const states = new Map(), controls = new Map(), pending = new Map();
  const originals = window.solveitHotkeys?.list().filter(s => ['si-i','si-o'].includes(s.id)) || [];
  let bypass = false, frame;
  const {qsa, on, onDomChange} = window.__craftCMCore;
  const cells = () => qsa('#dialog-container > .editable');
  const card = (e, side) => e.querySelector(side === 'input' ? ':scope > .card-in' : ':scope > .card-out');
  const button = (e, side) => card(e, side)?.querySelector('[hx-post="/collapse_"]');
  const present = (e, side) => side === 'input' ? !!card(e, side) : !!card(e, side)?.querySelector('.msg-body');
  const blocked = () => window.__craftCMCore.typingBlocked();
  const busy = e => e.dataset.editing === 'true' || e.id === '_' + document.getElementById('id_')?.value;
  const waiting = (e, side) => {
    const key = e.id + side, p = pending.get(key);
    if (p && (p.collapsed !== !!card(e, side)?.classList.contains('collapsed') || performance.now() > p.until)) pending.delete(key);
    return pending.has(key);
  };
  const native = (e, side) => {
    const b = button(e, side);
    if (!b || waiting(e, side)) return;
    const selection = cells().map(n => [n, n.getAttribute('data-sm')]);
    window.selectMsg($(e), {scroll: false});
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
    window.selectMsg($(e), {scroll: false});
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
    frame = null;
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
      window.UIkit?.notification('Finish editing before minimizing this cell.', {status: 'warning'});
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
    const selected = cells().filter(e => e.matches('[data-sm="primary"],[data-sm="secondary"]') && e.offsetParent !== null);
    selected.forEach(e => cycleOne(e, side));
    return !!selected.length;
  };
  const click = event => {
    if (bypass) return;
    const b = event.target.closest('[hx-post="/collapse_"]');
    const c = b?.closest('.msg-card'), e = c?.closest('.editable');
    if (!e) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cycleOne(e, c.classList.contains('card-in') ? 'input' : 'output');
  };
  const finished = event => {
    const b = event.detail?.elt?.closest?.('[hx-post="/collapse_"]');
    const c = b?.closest('.msg-card'), e = c?.closest('.editable');
    if (e) pending.delete(e.id + (c.classList.contains('card-in') ? 'input' : 'output'));
  };
  const ac = new AbortController();
  const offDom = onDomChange(sync, {attrs: ['class'], delay: 'raf', inDialog: true});
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


(() => {
  window.craftInsertPreview?.disable();
  if (!document.getElementById('dialog-container')) return;
  const types = {Code: 1, Note: 1, Raw: 1, Prompt: 1};
  const icon = name => window.__craftTpl?.[`cell_icon_${name}`] || '';
  const key = 'craft-insert-preview:v1:' + (new URLSearchParams(location.search).get('name') || location.pathname);
  const {mountTpl, qs, qsa, on, store, patch, onDomChange} = window.__craftCMCore;
  const ac = new AbortController(), sig = {signal: ac.signal}, cap = {capture: true, signal: ac.signal};
  const trigger = mountTpl('insert_trigger'), menu = mountTpl('insert_menu');
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
  const position = () => {
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    trigger.hidden = !rect.width || !rect.height;
    Object.assign(trigger.style, {left: 'auto', right: '42px', top: '6px'});
    Object.assign(menu.style, {right: '10px', top: '36px'});
    window.craftMobile?.reposition?.();
  };
  const resize = new ResizeObserver(position);
  const sync = () => {
    const next = document.getElementById('dialog-container');
    if (scroller === next) return;
    if (scroller) {
      resize.unobserve(scroller);
      scroller.classList.remove('craft-insert-preview');
    }
    scroller = next;
    if (!scroller) { trigger.hidden = true; return; }
    scroller.classList.add('craft-insert-preview');
    resize.observe(scroller); position();
  };
  const choose = name => {
    select(name);
    store.set(key, name);
  };
  const activeCells = () => qsa('.editable:is([data-sm="primary"],[data-sm="secondary"])', scroller).filter(el => el.getClientRects().length);
  const cellType = el => el?.querySelector('.card-in[data-mtype]')?.dataset.mtype;
  const editorCell = () => (document.querySelector('#full_editor #id_')?.value || '').replace(/^_/, '');
  const notify = error => {
    console.error('CRAFT insertion:', error);
    window.UIkit?.notification?.({message: error.message, status: 'danger'});
  };
  const waitFor = (check, timeout = 5000) => {
    const immediate = check();
    if (immediate) return Promise.resolve(immediate);
    return new Promise(resolve => {
      let done = false;
      const finish = val => {
        if (done) return;
        done = true;
        offDomWait();
        clearInterval(tick);
        clearTimeout(cap);
        resolve(val);
      };
      const probe = () => { const r = check(); if (r) finish(r); };
      const offDomWait = onDomChange(probe, {attrs: ['data-mtype', 'class', 'hidden', 'data-editing'], delay: 0});
      const tick = setInterval(probe, 100);
      const cap = setTimeout(() => finish(null), timeout);
    });
  };
  const setType = async (id, type) => {
    if (cellType(document.getElementById(id)) !== type) {
      await window.__craftCMCore.htmxPost('/set_mtyp_', {id_: id, ids: id, mtyp: type});
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
    return execute(async () => { await setType(cells[0].id, name.toLowerCase()); });
  };
  // opts.type ('Code'|'Note'|'Prompt'|'Raw') overrides the picker; opts.cell targets a cell other than the
  // selection; opts.force skips the focus guard (the mobile toolbar has already closed any editor).
  const insert = (where, opts = {}) => {
    if (!opts.force && blocked()) return false;
    const primary = opts.cell || activeCells().find(el => el.dataset.sm === 'primary');
    const button = primary?.querySelector(`[hx-post="/add_${where}_"]`);
    if (!button) return true;
    const name = Object.hasOwn(types, opts.type || '') ? opts.type : current;
    return execute(async () => {
      const type = name.toLowerCase(), old = new Set([...scroller.querySelectorAll('.editable[id]')].map(el => el.id));
      if (!window.craftC2?.guardNonCodeInsertion) throw new Error('Reload this dialog to enable typed insertion.');
      if (type === 'code') {
        if (!window.craftC2?.expectCodeInsertion) throw new Error('Reload this dialog to enable C2 insertion.');
        window.craftC2.expectCodeInsertion();
      }
      const release = type !== 'code' ? window.craftC2.guardNonCodeInsertion(old) : null;
      const unhide = window.craftIdleComposer?.holdForInsertion();
      const ph = window.__craftCMCore.mountTpl('insert_placeholder');
      if (where === 'above') primary.before(ph); else primary.after(ph);
      let id = null;
      try {
        button.dispatchEvent(new MouseEvent('click', {bubbles:false}));
        id = await waitFor(() => {
          const editing = editorCell(), id = '_' + editing;
          if (editing && !old.has(id) && document.getElementById(id)) return id;
          if (type === 'code') return [...scroller.querySelectorAll('.editable[id]')].find(el => !old.has(el.id) && window.craftC2?.manages(el.id))?.id;
        });
        if (!id) throw new Error(`Could not confirm ${name} insertion.`);
        if (type === 'code') {
          if (!(await waitFor(() => cellType(document.getElementById(id)) === 'code' && editorCell() !== id.slice(1) && Boolean(document.getElementById(id)?.querySelector('.craft-c2-host'))))) throw new Error('Could not confirm C2 handoff.');
        } else {
          await setType(id, type);
          const cancel = await waitFor(() => {
            if (editorCell() !== id.slice(1) || window.edValue?.()) return true;
            const btn = document.getElementById('cancel_btn');
            return btn && !btn.disabled ? btn : null;
          });
          if (!cancel) throw new Error('Could not close the insertion composer.');
          if (cancel && cancel !== true) {
            const field = document.querySelector('#full_editor #msg_type');
            if (field) field.value = type;
            cancel.click();
            if (!(await waitFor(() => editorCell() !== id.slice(1)))) throw new Error('Could not close the insertion composer.');
            if (cellType(document.getElementById(id)) !== type) throw new Error(`New cell did not retain type ${type}.`);
          }
        }
      } finally { ph.remove(); release?.(); unhide?.(); }
      if (id) {
        document.getElementById(id)?.scrollIntoView({block: 'nearest'});
        if (type === 'code') {
          if (!document.activeElement?.closest?.(`#${id} .craft-c2-host`)) window.craftC2?.edit?.(id, {anchor: 0, head: 0});
        } else if (!document.activeElement?.closest?.(`#${id} .craft-md-host`)) {
          window.craftMd?.edit?.(id, {toEnd: true});
        }
      }
    });
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
  const KIND_MAP = {code: 'Code', note: 'Note', prompt: 'Prompt', raw: 'Raw'};
  const onHtmxConfig = e => {
    const path = e.detail?.path || '';
    const mtyp = e.detail?.parameters?.mtyp || e.detail?.parameters?.msg_type;
    if ((path.includes('set_mtyp') || path.includes('upsert_msg')) && mtyp && KIND_MAP[String(mtyp).toLowerCase()]) {
      choose(KIND_MAP[String(mtyp).toLowerCase()]);
    }
  };
  const onTabClick = e => {
    const tab = e.target?.closest?.('#full_editor [role="tab"], #full_editor button');
    const name = tab && KIND_MAP[(tab.textContent || '').trim().toLowerCase()];
    if (name) choose(name);
  };
  on(document, 'htmx:configRequest', onHtmxConfig, sig);
  on(document, 'click', onTabClick, cap);
  const offDom = onDomChange(sync, {delay: 0});
  on(window, 'resize', position, sig);
  window.craftInsertPreview = {
    insert: (where, opts) => insert(where, opts),
    choose,
    setType,
    type: () => current,
    isBusy: () => busy,
    disable() {
    ac.abort();
    offDom(); resize.disconnect();
    defs.forEach(spec => window.__hotkeyRegister?.({...spec, builtin:true, handler:() => true}));
    scroller?.classList.remove('craft-insert-preview');
    trigger.remove(); menu.remove(); delete window.craftInsertPreview;
  }};
  sync();
})();


(() => {
  window.craftInlineNote?.disable?.();
  window.craftInlineText?.disable?.();
  if (!document.getElementById('dialog-container')) return;
  if (!document.querySelector('script[data-craft-md="1"]')) {
    const s = document.createElement('script');
    s.src = '/static/.craft-assets/craft_md.js';
    s.dataset.craftMd = '1';
    document.head.append(s);
  }
})();

(() => {
  window.craftImageDrop?.disable();
  const {qs, on} = window.__craftCMCore;
  const target = e => {
    if (e.target.closest?.('.monaco-editor')) return;
    return e.target.closest?.('#dialog-container > .editable > .card-in:is([data-mtype="code"],[data-mtype="note"],[data-mtype="prompt"])');
  };
  const field = id => qs(`#full_editor #${id}`)?.value;
  const editorId = () => (field('id_') || '').replace(/^_/, '');
  const model = () => window.editor?.getModel();
  const notify = message => window.UIkit?.notification?.({message, status: 'warning'});
  let busy = false, disabled = false;
  const dragover = e => {
    if (!target(e)) return;
    const items = [...(e.dataTransfer?.items || [])];
    if (!items.some(i => i.kind === 'file' && (!i.type || i.type.startsWith('image/'))) && (items.length || !e.dataTransfer?.types.includes('Files'))) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const attach = async (e, card, file) => {
    if (typeof window.handleBlob !== 'function') return;
    e.preventDefault();
    e.stopPropagation();
    if (busy) return notify('Wait for the current image upload to finish.');
    const cell = card.parentElement, id = cell.id.slice(1), kind = card.dataset.mtype;
    const priorModel = model();
    const ready = () => editorId() === id && field('is_input') === '1' && field('msg_type') === kind && model() && !model().uri.path.endsWith('/temp');
    busy = true;
    try {
      if (!ready()) {
        if (editorId() || window.edValue?.()) return notify('Finish editing the open cell before attaching an image to another cell.');
        if (window.craftC2?.active?.() === id) await window.craftC2.exit(id);
        if (window.craftMd?.active?.() === `${id}:in`) await window.craftMd.exit(id, 'in');
        const btn = card.querySelector('[hx-post="/editor_"]');
        if (btn) { btn.dataset.craftAllowMonaco = '1'; btn.click(); delete btn.dataset.craftAllowMonaco; }
        for (let i = 0; i < 100 && !disabled && !(ready() && model() !== priorModel); i++) await new Promise(resolve => setTimeout(resolve, 50));
        if (disabled) return;
        if (!ready() || model() === priorModel) return notify('Could not open the cell to attach the image.');
      }
      window.craftIdleComposer?.reveal();
      window.editor.focus();
      const ext = file.name.match(/\.([^.]+)$/)?.[1] || file.type.split('/')[1] || 'png';
      await window.handleBlob(file, ext, true, file.name);
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

/* ── Progressive table enhancer (wrap, numeric align, flat-table sort, copy TSV) ── */
(() => {
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

    // 1. Wrap in a keyboard-scrollable container if not already wrapped
    let wrap = tbl.parentElement;
    if (!wrap?.classList.contains('craft-table-wrap')) {
      wrap = window.__craftCMCore.mountTpl('table_wrap');
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
      const btn = window.__craftCMCore.mountTpl('table_copy_btn');
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

  const enhanceAll = () => {
    for (const tbl of document.querySelectorAll('#dialog-container .msg-content table:not([data-craft-table])')) {
      enhanceTable(tbl);
    }
  };
  const start = () => {
    window.__craftCMCore.onDomChange(enhanceAll, {delay: 80, inDialog: true});
    enhanceAll();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  window.craftTables = { enhance: enhanceAll, disable() { mo.disconnect(); clearTimeout(timer); } };
})();

/* ── Accessibility: mirror uk-tooltip & fallback aria-labels on icon controls ── */
(() => {
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
    const fb = root.getElementById ? root.getElementById('find-box') : root.querySelector?.('#find-box');
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
    }
  };
  let offDom = null;
  const start = () => {
    labelControls(document);
    offDom = window.__craftCMCore.onDomChange(() => labelControls(document), {delay: 120});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  window.craftA11y = { refresh: () => labelControls(document), disable() { offDom?.(); } };
})();

/* ── Desktop UX: hover-edge drag-to-insert, click-margin escape, Shift+A/B seam picker & slash-morph ── */
(() => {
  window.craftDesktopUX?.disable?.();
  if (!document.getElementById('dialog-container')) return;
  const {mountTpl, on} = window.__craftCMCore;
  const ac = new AbortController(), sig = {signal: ac.signal}, cap = {capture: true, signal: ac.signal};
  const isMobile = () => !!window.craftMobile?.active?.();
  const dialog = () => document.getElementById('dialog-container');
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
    hBelow.removeAttribute('data-near');
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
    picker.classList.remove('open');
    setHot(null);
    pState = null;
  };
  const positionPicker = (anchorRect, edge, hint) => {
    picker.querySelector('.craft-desk-picker-head').textContent = hint || (edge === 'above' ? 'Insert above' : 'Insert below');
    picker.classList.add('open');
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
    const cell = handle.closest('#dialog-container > .editable[id]');
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

  /* Track cursor proximity to the bottom-center target area of a cell on desktop */
  const onMouseMove = e => {
    if (isMobile() || pState) return;
    const t = e.target;
    if (t instanceof Element && hBelow.contains(t)) {
      hBelow.dataset.near = 'true';
      return;
    }
    const cell = t instanceof Element ? t.closest('#dialog-container > .editable[id]') : null;
    if (cell) {
      attachHandles(cell);
      if (hostCell === cell) {
        const r = cell.getBoundingClientRect();
        const nearY = Math.abs(e.clientY - r.bottom) <= 26;
        const nearX = Math.abs(e.clientX - (r.left + r.width / 2)) <= 140;
        hBelow.toggleAttribute('data-near', nearY && nearX);
      }
    } else if (hostCell) {
      const r = hostCell.getBoundingClientRect();
      const nearY = Math.abs(e.clientY - r.bottom) <= 26;
      const nearX = Math.abs(e.clientX - (r.left + r.width / 2)) <= 140;
      if (nearY && nearX) hBelow.dataset.near = 'true';
      else hBelow.removeAttribute('data-near');
    }
  };
  const onDialogLeave = () => { if (!pState) detachHandles(); };
  on(document, 'mousemove', onMouseMove, {passive: true, signal: ac.signal});
  on(dialog(), 'mouseleave', onDialogLeave, sig);

  /* Click-margin / click-header to escape active inline editors on desktop */
  const onDocMouseDown = e => {
    if (isMobile()) return;
    if (pState?.keyMode && !picker.contains(e.target)) closePicker();
    if (e.button !== 0) return;
    const hasEd = !!(window.craftC2?.active?.() || window.craftMd?.active?.());
    if (!hasEd) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest('#solveit-file-tree-panel, #solveit-temp-editor, #solveit-launcher, .craft-action-menu, #craft-desk-picker, .craft-desk-edge, .cm-editor, .cm-tooltip, .uk-modal, .uk-dropdown, .uk-drop, nav.monster-navbar')) return;
    const inDialog = t.closest('#dialog-container');
    if (!inDialog) return;
    const inCell = t.closest('#dialog-container > .editable[id]');
    const onHeaderBlank = inCell && t.closest('.uk-card-header') && !t.closest('button, a, input, select');
    if (!inCell || onHeaderBlank) {
      commitEditors();
    }
  };
  on(document, 'mousedown', onDocMouseDown, cap);

  /* Shift+A / Shift+B inline seam quick-picker in selection mode */
  const blocked = () => document.activeElement?.closest?.('input,textarea,select,[contenteditable],.monaco-editor,.cm-editor,#full_editor,.hk-overlay.open,#solveit-launcher.open,[role="dialog"],.uk-modal.uk-open');
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
      const cell = dialog()?.querySelector(':scope > .editable[data-sm="primary"]');
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
    let id = null, view = null, isCode = false;
    const c2Id = window.craftC2?.active?.();
    if (c2Id) {
      view = window.craftC2.view(c2Id);
      if (view?.hasFocus) { id = '_' + String(c2Id).replace(/^_/, ''); isCode = true; }
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
    const curType = el?.querySelector('.card-in[data-mtype]')?.dataset.mtype;
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
  const onSlashInput = () => { queueMicrotask(checkSlashMorph); };
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

/* %% nbs/craft/03_file_tree.ipynb #654a40d5 */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"ft_upload_icon": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path><polyline points=\"17 8 12 3 7 8\"></polyline><line x1=\"12\" y1=\"3\" x2=\"12\" y2=\"15\"></line></svg>", "ft_collapse_icon": "<svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"7 20 12 15 17 20\"></polyline><polyline points=\"7 4 12 9 17 4\"></polyline><line x1=\"4\" y1=\"12\" x2=\"20\" y2=\"12\"></line></svg>", "ft_temp_editor": "<div id=\"solveit-temp-editor\"><div class=\"solveit-temp-editor-bar\"><strong></strong><button type=\"button\" aria-label=\"Close editor\">×</button></div><iframe title=\"Temporary file editor\"></iframe></div>", "ft_create_form": "<form class=\"solveit-tree-create\"><input type=\"text\" autocomplete=\"off\" spellcheck=\"false\" enterkeyhint=\"done\" aria-describedby=\"solveit-tree-create-error\"><div id=\"solveit-tree-create-error\" role=\"alert\"></div></form>", "ft_upload_pop": "<div class=\"solveit-tree-upload-pop\" role=\"dialog\"><div class=\"solveit-tree-upload-head\"><span class=\"solveit-tree-upload-dest\"></span><button type=\"button\" class=\"solveit-tree-upload-x\" aria-label=\"Close\">×</button></div><div class=\"solveit-tree-upload-drop\">Drop files or folders here</div><div class=\"solveit-tree-upload-actions\"><button type=\"button\" class=\"solveit-tree-upload-pick-files\">Files…</button><button type=\"button\" class=\"solveit-tree-upload-pick-dir\">Folder…</button></div><input type=\"file\" class=\"solveit-tree-upload-input-files\" multiple hidden><input type=\"file\" class=\"solveit-tree-upload-input-dir\" webkitdirectory multiple hidden></div>", "ft_panel": "<aside id=\"solveit-file-tree-panel\" role=\"complementary\" aria-label=\"Files\"><div class=\"solveit-tree-brand\"><span class=\"solveit-tree-appname\">solveit</span></div><header><strong>Files</strong><kbd class=\"solveit-tree-shortcut\" data-hotkey=\"file-tree-toggle\">⌘B</kbd><button class=\"solveit-tree-new\" type=\"button\" aria-label=\"New dialog, file, or folder\" title=\"New dialog, file, or folder (name/ for folder)\">+</button><button class=\"solveit-tree-upload\" type=\"button\" aria-label=\"Upload files or folders\" title=\"Upload files or folders\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path><polyline points=\"17 8 12 3 7 8\"></polyline><line x1=\"12\" y1=\"3\" x2=\"12\" y2=\"15\"></line></svg></button><button class=\"solveit-tree-collapse\" type=\"button\" aria-label=\"Collapse all folders\" title=\"Collapse all folders\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"7 20 12 15 17 20\"></polyline><polyline points=\"7 4 12 9 17 4\"></polyline><line x1=\"4\" y1=\"12\" x2=\"20\" y2=\"12\"></line></svg></button><button class=\"solveit-tree-dots\" type=\"button\" aria-pressed=\"true\">.*</button><button class=\"solveit-tree-refresh\" type=\"button\" aria-label=\"Refresh files\" title=\"Refresh files\">↻</button><button class=\"solveit-tree-home\" type=\"button\" aria-label=\"Dialogs home\" title=\"Dialogs home\">⌂</button></header><input class=\"solveit-tree-filter\" type=\"search\" placeholder=\"Filter loaded files…\" autocomplete=\"off\"><div class=\"solveit-tree-status\" role=\"status\"></div><div class=\"solveit-tree-rootbar\" title=\"Right-click to create/paste/upload in root; drop here to move or upload to root\"><span class=\"solveit-tree-rootbar-path\">~/</span><span class=\"solveit-tree-rootbar-hint\">root · drop / right-click</span><button class=\"solveit-tree-row-upload\" type=\"button\" aria-label=\"Upload into root\" title=\"Upload into root\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path><polyline points=\"17 8 12 3 7 8\"></polyline><line x1=\"12\" y1=\"3\" x2=\"12\" y2=\"15\"></line></svg></button><button class=\"solveit-tree-row-more\" type=\"button\" aria-label=\"Actions for root\" title=\"New dialog, file, folder…\">⋯</button></div><div id=\"solveit-file-tree\" role=\"tree\"></div><div class=\"solveit-tree-resizer\" aria-hidden=\"true\" title=\"Drag to resize · Double-click to reset\"></div></aside>", "ft_menu": "<div class=\"solveit-tree-menu\" role=\"menu\"></div>", "ft_workspace": "<div class=\"solveit-tree-workspace\"></div>"});

/* %% nbs/craft/03_file_tree.ipynb #2cac7d02 */
/* ── Lightweight file tree ─────────────────────────────────────────── */
(() => {
  window.solveitFileTree?.disable?.();
  const {mountTpl, qs, on, store, patch} = window.__craftCMCore;
  const QUERCUS_JS = '/static/.craft-assets/quercus-treeview.js', QUERCUS_CSS = '/static/.craft-assets/quercus-treeview.css';
  const DOTS_KEY = 'solveit-file-tree:hide-dots';
  const CACHE_KEY = 'solveit-file-tree:v4', CLIP_KEY = 'solveit-file-tree:clipboard', CACHE_MAX_AGE = 180000;
  let panel, tree, loaded = false, filterText = '', restoring = false, previousFocus;
  let refreshTimer, busy = false, menu = null, uploadPop = null, lastTreeDir = null;
  const UPLOAD_SVG = window.__craftTpl?.ft_upload_icon || '', COLLAPSE_SVG = window.__craftTpl?.ft_collapse_icon || '';
  let workspaceRow = null, dlgNameNode = null, dlgNameOrigParent = null, dlgNameOrigNext = null;
  let draggedNode = null, dropHighlightEl = null, hoverExpandTimer = null, hoverExpandPath = null;

  let hideDots = store.get(DOTS_KEY, '1') === '1';

  const OPEN_KEY = 'solveit-file-tree:open';
  const saveOpen = open => store.set(OPEN_KEY, open ? '1' : '0', sessionStorage);
  window.__hotkeyRegister?.({id: 'file-tree-toggle', label: 'Toggle file tree', group: 'File tree', combo: 'Mod+B', handler: () => { toggle(); return true; }});

  const rowsByPath = new Map(), fetchedAtByPath = new Map(), expandedPaths = new Set(), loadingPaths = new Set();
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
  function loadAssets() {
    if (loaded || typeof window.Treeview === 'function') { loaded = true; return Promise.resolve(); }
    if (!document.querySelector('link[data-solveit-tree="1"]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = QUERCUS_CSS; css.dataset.solveitTree = '1'; document.head.append(css);
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = QUERCUS_JS; script.dataset.solveitTree = '1';
      script.onload = () => { loaded = true; resolve(); };
      script.onerror = () => reject(new Error('Could not load Quercus assets'));
      document.head.append(script);
    });
  }

  async function getRows(dirPath) {
    const cleanDir = normPath(dirPath);
    const response = await fetch(`/?at=${encodeURIComponent(cleanDir)}`, {method: 'POST', credentials: 'same-origin', headers: {'HX-Request': 'true'}});
    if (!response.ok) throw new Error(`File listing failed: ${response.status}`);
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    return [...doc.querySelectorAll('.tbl-row')].map(row => {
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

  function findNode(path) {
    if (!panel) return null;
    const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(path) : path.replace(/["\\]/g, '\\$&');
    const direct = panel.querySelector(`#solveit-file-tree li[data-path="${esc}"]`);
    if (direct) return direct;
    return [...panel.querySelectorAll('#solveit-file-tree li[data-node-data]')]
      .find(li => JSON.parse(li.dataset.nodeData).path === path) || null;
  }

  function focusPath(path) {
    const li = findNode(path);
    const content = li?.querySelector(':scope > .treeview-node-content');
    if (content) {
      content.scrollIntoView({block: 'nearest'});
      content.focus();
      return true;
    }
    return false;
  }

  function renderNode(node, content) {
    const {dir, dlgPath} = getCurrentContext();
    content.classList.add('solveit-tree-' + node.kind);
    content.tabIndex = 0;
    content.setAttribute('role', 'treeitem');
    // Touch: no drag (long-press would start a drag instead of the context menu); rows get a ⋯ menu button below.
    const touch = window.craftMobile?.active();
    if (node.kind !== 'loading' && !touch) content.draggable = true;
    if (node.kind === 'directory') content.setAttribute('aria-expanded', String(expandedPaths.has(node.path)));
    if ((dlgPath && node.path === dlgPath) || (!dlgPath && dir !== '.' && node.path === dir)) {
      content.classList.add('solveit-tree-current');
    }
    if (node.kind !== 'loading') {
      const fname = node.filename || node.name || '';
      const ext = fname.includes('.') ? fname.split('.').pop().toLowerCase() : '';
      const icons = {js: 'file_type_js.svg', css: 'file_type_css.svg', json: 'file_type_json.svg'};
      const icon = node.kind === 'directory'
        ? (expandedPaths.has(node.path) ? 'default_folder_opened.svg' : 'default_folder.svg')
        : node.kind === 'dialog' ? 'file_type_ipynb.svg' : (icons[ext] || 'default_file.svg');
      content.append(window.__craftCMCore.el('img', {cls: 'solveit-tree-icon', src: `/static/.craft-assets/vscode-icons/${icon}`, alt: ''}));
    }
    content.append(window.__craftCMCore.el('span', {cls: 'treeview-node-text'}, node.name));
    if (node.kind === 'directory') {
      const up = window.__craftCMCore.el('button', {
        type: 'button', cls: 'solveit-tree-row-upload', tabIndex: -1,
        title: `Upload into ${node.name}`, 'aria-label': `Upload into ${node.name}`,
      });
      up.innerHTML = UPLOAD_SVG;
      content.append(up);
    }
    if (touch && node.kind !== 'loading') {
      const t = `Actions for ${node.name}`;
      content.append(window.__craftCMCore.el('button', {
        type: 'button', cls: 'solveit-tree-row-more', tabIndex: -1, title: t, 'aria-label': t,
      }, '⋯'));
    }
  }

  function renderTree() {
    if (!panel) return;
    const treeEl = panel.querySelector('#solveit-file-tree');
    const prevScroll = treeEl ? treeEl.scrollTop : 0;
    const focused = createDraft?.input;
    const draftFocus = focused && document.activeElement === focused ? [focused.selectionStart, focused.selectionEnd] : null;
    const {dir} = getCurrentContext();
    const curAncestors = new Set(ancestorsOf(dir));
    const data = nodesFor('.', curAncestors);
    if (!tree) tree = new Treeview({containerId: 'solveit-file-tree', data, initiallyExpanded: false, nodeSelectionEnabled: false, onRenderNode: renderNode});
    else tree.setData(data);
    const nodeIndex = new Map();
    for (const li of panel.querySelectorAll('#solveit-file-tree li[data-node-data]')) {
      try {
        const p = JSON.parse(li.dataset.nodeData).path;
        if (p) { li.dataset.path = p; nodeIndex.set(p, li); }
      } catch {}
    }
    restoring = true;
    [...expandedPaths].sort((a, b) => a.length - b.length).forEach(path => {
      const li = nodeIndex.get(path), expander = li?.querySelector(':scope > .treeview-node-content > .treeview-expander');
      if (expander && !li.classList.contains('expanded')) expander.click();
    });
    restoring = false;
    if (filterText) tree.search(filterText);
    mountCreate();
    if (draftFocus && createDraft?.input.isConnected) {
      const input = createDraft.input;
      input.focus({preventScroll: true});
      input.setSelectionRange(...draftFocus);
    }
    const rootLabel = panel.querySelector('.solveit-tree-rootbar-path');
    if (rootLabel) rootLabel.textContent = dir === '.' ? '~/' : `~/${dir}`;
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
      if (changed || !tree) renderTree();
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
    let overlay = qs('#solveit-temp-editor');
    if (!overlay) {
      const {root: ov, close, frame} = mountTpl('ft_temp_editor', {refs: {close: 'button', frame: 'iframe'}});
      overlay = ov;
      close.onclick = () => { overlay.classList.remove('open'); frame.src = 'about:blank'; };
      document.body.append(overlay);
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
    qs('strong', overlay).textContent = url.searchParams.get('fp') || 'File editor';
    overlay.classList.add('open'); qs('iframe', overlay).src = url.href;
  }

  function handleTreeClick(e) {
    if (restoring || e.target.closest('.solveit-tree-create')) return;
    const li = e.target.closest('li[data-node-data]');
    if (!li) return;
    const node = JSON.parse(li.dataset.nodeData), expander = e.target.closest('.treeview-expander');
    const moreBtn = e.target.closest('.solveit-tree-row-more');
    if (moreBtn) {
      e.preventDefault(); e.stopPropagation();
      const content = moreBtn.closest('.treeview-node-content');
      showMenu({target: content, currentTarget: moreBtn, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {}});
      return;
    }
    const upBtn = e.target.closest('.solveit-tree-row-upload');
    if (upBtn && node.kind === 'directory') {
      e.preventDefault(); e.stopPropagation();
      openUploadPop(node.path, upBtn);
      return;
    }
    if (node.kind === 'directory' && !expander) {
      e.preventDefault(); e.stopPropagation(); li.querySelector(':scope > .treeview-node-content > .treeview-expander')?.click(); return;
    }
    if (node.kind === 'directory' && expander) queueMicrotask(() => {
      if (!li.isConnected) return;
      const open = li.classList.contains('expanded'), icon = li.querySelector(':scope > .treeview-node-content > img.solveit-tree-icon');
      li.querySelector(':scope > .treeview-node-content')?.setAttribute('aria-expanded', String(open));
      if (open) { expandedPaths.add(node.path); if (icon) icon.src = '/static/.craft-assets/vscode-icons/default_folder_opened.svg'; loadFolder(node.path); }
      else { expandedPaths.delete(node.path); if (icon) icon.src = '/static/.craft-assets/vscode-icons/default_folder.svg'; }
      saveCache();
    });
    else if (node.href) openNode(node);
  }

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
    else findNode(dir)?.querySelector(':scope > .treeview-node-content')?.after(form);
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
    if (folder && !folder.classList.contains('expanded')) folder.querySelector(':scope > .treeview-node-content > .treeview-expander')?.click();
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

  async function moveNode(src, destDir) {
    const targetDir = normPath(destDir);
    if (!canDrop(src, targetDir)) return;
    const {dlgPath} = getCurrentContext();
    const affectsActive = dlgPath && (dlgPath === src.path || (src.kind === 'directory' && dlgPath.startsWith(src.path + '/')));
    if (affectsActive && !confirm(`'${src.filename}' includes the currently open dialog. Moving it will reload at the new location. Continue?`)) return;

    await withBusy(`Moving '${src.filename}' to ${targetDir === '.' ? '~/' : targetDir + '/'}…`, async () => {
      const destBefore = await getRows(targetDir);
      if (destBefore.some(r => r.filename === src.filename)) {
        throw new Error(`Cannot move: '${src.filename}' already exists in ${targetDir === '.' ? '~/' : targetDir}`);
      }
      const bytes = await downloadBytes(src);
      if (src.kind === 'directory') {
        await uploadBlob(targetDir, `${src.filename}.zip`, new Blob([bytes], {type: 'application/zip'}), true);
      } else {
        await uploadBlob(targetDir, src.filename, new Blob([bytes]), false);
      }
      // Verify destination before deleting source
      const destAfter = await getRows(targetDir);
      const created = destAfter.find(r => r.filename === src.filename && r.kind === src.kind);
      if (!created) throw new Error(`Move aborted: '${src.filename}' did not appear at destination`);

      await deleteRecursive(src);
      const wasExpanded = src.kind === 'directory' && expandedPaths.has(src.path);
      if (src.kind === 'directory') purgeDirCache(src.path);
      const newPath = joinPath(targetDir, src.filename);
      if (wasExpanded) expandedPaths.add(newPath);
      if (targetDir !== '.') expandedPaths.add(targetDir);

      const clip = getClipboard();
      if (clip && (clip.path === src.path || (src.kind === 'directory' && clip.path.startsWith(src.path + '/')))) {
        setClipboard(null);
      }
      rowsByPath.set(targetDir, destAfter); fetchedAtByPath.set(targetDir, Date.now());
      await refreshDirs(src.parentPath || '.', ...(wasExpanded ? [newPath] : []));
      focusPath(newPath);
      setStatus(`Moved '${src.filename}' to ${targetDir === '.' ? '~/' : targetDir + '/'}`);

      if (affectsActive) {
        const nextDlg = dlgPath === src.path ? newPath : newPath + dlgPath.slice(src.path.length);
        location.href = `/dialog_?name=${encodeURIComponent(nextDlg)}`;
      }
    });
  }

  async function renameNode(node) {
    if (!node || node.kind === 'loading') return;
    const oldName = node.filename || baseOf(node.path);
    const dir = node.parentPath || parentOf(node.path);
    const raw = prompt(`Rename '${oldName}' to:`, oldName);
    if (raw === null) return;
    const newName = raw.trim();
    if (!newName || newName === oldName) return;
    if (newName.includes('/') || newName.includes('\\') || newName === '.' || newName === '..') {
      setStatus('Invalid name: cannot contain slashes or be "." / "..".');
      return;
    }
    const {dlgPath} = getCurrentContext();
    const affectsActive = dlgPath && (dlgPath === node.path || (node.kind === 'directory' && dlgPath.startsWith(node.path + '/')));
    if (affectsActive && !confirm(`'${oldName}' includes the currently open dialog. Renaming it will reload at the new path. Continue?`)) return;

    await withBusy(`Renaming '${oldName}' to '${newName}'…`, async () => {
      const siblings = await getRows(dir);
      if (siblings.some(r => r.filename === newName)) {
        throw new Error(`'${newName}' already exists in ${dir === '.' ? '~/' : dir}`);
      }
      const bytes = await downloadBytes(node);
      if (node.kind === 'directory') {
        const zipBlob = renameZipTopDir(bytes, oldName, newName);
        await uploadBlob(dir, `${newName}.zip`, zipBlob, true);
      } else {
        await uploadBlob(dir, newName, new Blob([bytes]), false);
      }
      const after = await getRows(dir);
      const created = after.find(r => r.filename === newName);
      if (!created) throw new Error(`Rename aborted: '${newName}' did not appear`);

      await deleteRecursive(node);
      const wasExpanded = node.kind === 'directory' && expandedPaths.has(node.path);
      if (node.kind === 'directory') purgeDirCache(node.path);
      const newPath = joinPath(dir, newName);
      if (wasExpanded) expandedPaths.add(newPath);

      const clip = getClipboard();
      if (clip && (clip.path === node.path || (node.kind === 'directory' && clip.path.startsWith(node.path + '/')))) {
        setClipboard(null);
      }
      rowsByPath.set(dir, after); fetchedAtByPath.set(dir, Date.now());
      await refreshDirs(dir, ...(wasExpanded ? [newPath] : []));
      focusPath(newPath);
      setStatus(`Renamed '${oldName}' to '${newName}'`);

      if (affectsActive) {
        const nextDlg = dlgPath === node.path ? newPath : newPath + dlgPath.slice(node.path.length);
        location.href = `/dialog_?name=${encodeURIComponent(nextDlg)}`;
      }
    });
  }

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
    uploadPop.remove(); uploadPop = null;
    return true;
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

    panel.append(pop);
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
    if (tree) renderTree();
    setStatus('Collapsed all folders');
  }

  /* ── Context menu ──────────────────────────────────────────────────── */
  function closeMenu() { if (!menu) return false; menu.remove(); menu = null; return true; }

  async function copyNodePath(node) {
    const path = `/app/data/${node.path}`;
    try {
      await navigator.clipboard.writeText(path);
      setStatus(`Copied path: ${path}`);
    } catch (err) { setStatus(`Could not copy path: ${err.message}`); }
  }

  function showMenu(e, forcedDir = null) {
    if (e.target.closest('.solveit-tree-create')) return;
    const li = forcedDir ? null : e.target.closest('li[data-node-data]');
    const node = li ? JSON.parse(li.dataset.nodeData) : null;
    if (node?.kind === 'loading') return;
    e.preventDefault(); e.stopPropagation(); closeMenu();

    const clip = getClipboard();
    menu = window.__craftCMCore.mountTpl('ft_menu');
    const item = (label, fn, {disabled = false, title = '', danger = false} = {}) => {
      menu.append(window.__craftCMCore.el('button', {
        type: 'button', role: 'menuitem', disabled, title: title || null, cls: danger ? 'danger' : null,
        onClick: ev => { ev.stopPropagation(); closeMenu(); fn(); },
      }, label));
    };
    const sep = () => { menu.append(window.__craftCMCore.el('hr', {cls: 'solveit-tree-menu-sep'})); };

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

    menu.addEventListener('keydown', ev => {
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      ev.preventDefault(); ev.stopPropagation();
      const btns = [...menu.querySelectorAll('button:not(:disabled)')];
      if (!btns.length) return;
      const i = btns.indexOf(document.activeElement);
      btns[(i + (ev.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length].focus();
    });

    panel.append(menu);
    const anchor = li || e.currentTarget;
    const at = (e.clientX || e.clientY) ? {x: e.clientX, y: e.clientY} : (b => ({x: b.left + 24, y: b.bottom}))(anchor.getBoundingClientRect());
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(4, Math.min(at.x, innerWidth - r.width - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(at.y, innerHeight - r.height - 4)) + 'px';
    menu.querySelector('button:not(:disabled)')?.focus();
  }

  /* ── Drag and drop ─────────────────────────────────────────────────── */
  function clearDropState() {
    if (dropHighlightEl) { dropHighlightEl.classList.remove('solveit-tree-drop-target'); dropHighlightEl = null; }
    clearTimeout(hoverExpandTimer); hoverExpandTimer = null; hoverExpandPath = null;
  }

  function resolveDropTarget(targetEl) {
    const rootbar = panel?.querySelector('.solveit-tree-rootbar');
    if (targetEl.closest?.('.solveit-tree-rootbar')) return {destDir: '.', highlightEl: rootbar, dirLi: null};
    const li = targetEl.closest?.('li[data-node-data]');
    if (!li) return {destDir: '.', highlightEl: rootbar, dirLi: null};
    const node = JSON.parse(li.dataset.nodeData);
    if (node.kind === 'loading') return null;
    if (node.kind === 'directory') {
      return {destDir: node.path, highlightEl: li.querySelector(':scope > .treeview-node-content'), dirLi: li};
    }
    const destDir = node.parentPath || '.';
    const parentLi = destDir === '.' ? null : findNode(destDir);
    return {
      destDir,
      highlightEl: parentLi ? parentLi.querySelector(':scope > .treeview-node-content') : rootbar,
      dirLi: parentLi,
    };
  }

  function wireDragAndDrop(treeEl, rootbar) {
    treeEl.addEventListener('dragstart', e => {
      const li = e.target.closest('li[data-node-data]');
      if (!li) return;
      const node = JSON.parse(li.dataset.nodeData);
      if (node.kind === 'loading') { e.preventDefault(); return; }
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
      if (target.dirLi && !target.dirLi.classList.contains('expanded') && target.destDir !== '.') {
        if (hoverExpandPath !== target.destDir) {
          clearTimeout(hoverExpandTimer);
          hoverExpandPath = target.destDir;
          const dirLi = target.dirLi;
          hoverExpandTimer = setTimeout(() => {
            if (dirLi.isConnected && !dirLi.classList.contains('expanded')) {
              dirLi.querySelector(':scope > .treeview-node-content > .treeview-expander')?.click();
            }
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

  /* ── Panel construction & lifecycle ────────────────────────────────── */
  function updateDotsBtn() {
    const dots = qs('.solveit-tree-dots', panel);
    if (!dots) return;
    const lbl = hideDots ? 'Hidden files are hidden (click to show)' : 'Showing all files (click to hide dot files)';
    patch(dots, {'aria-pressed': String(hideDots), title: lbl, 'aria-label': lbl});
  }

  function makePanel() {
    if (panel) return panel;
    const r = mountTpl('ft_panel', {refs: {
      brand: '.solveit-tree-brand', btnNew: '.solveit-tree-new', btnUpload: '.solveit-tree-upload',
      btnCollapse: '.solveit-tree-collapse', btnRefresh: '.solveit-tree-refresh', btnDots: '.solveit-tree-dots',
      btnHome: '.solveit-tree-home', filter: '.solveit-tree-filter', treeEl: '#solveit-file-tree',
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
      if (tree) renderTree();
    };
    r.btnHome.onclick = () => { location.href = '/?at=.'; };
    window.solveitHotkeys?.refreshChips();
    let filterTimer = null;
    on(r.filter, 'input', e => {
      filterText = e.target.value;
      clearTimeout(filterTimer);
      if (!filterText) { tree?.search(''); return; }
      filterTimer = setTimeout(() => { tree?.search(filterText); }, 80);
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
      const li = e.target.closest?.('li[data-node-data]');
      if (!li) return;
      const node = JSON.parse(li.dataset.nodeData);
      if (node.kind === 'loading') return;
      lastTreeDir = node.kind === 'directory' ? node.path : (node.parentPath || '.');
    });
    treeEl.addEventListener('contextmenu', e => showMenu(e));
    rootbar.addEventListener('contextmenu', e => showMenu(e, '.'));
    panel.addEventListener('contextmenu', e => {
      if (e.target === panel || e.target.matches('.solveit-tree-status')) showMenu(e, '.');
    });
    /* iOS Safari never fires contextmenu for a touch hold, so hold-to-open is done by hand.
       Android fires both: whichever comes first wins and the other is swallowed. */
    let lpTimer = null, lpStart = null, lpFiredAt = 0;
    const lpCancel = () => { clearTimeout(lpTimer); lpTimer = null; };
    panel.addEventListener('touchstart', e => {
      lpCancel();
      if (e.touches.length !== 1) return;
      const t = e.target, onRoot = rootbar.contains(t);
      if (t.closest('button, input, .solveit-tree-create') || !(onRoot || t.closest('li[data-node-data]'))) return;
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
    panel.addEventListener('dblclick', e => {
      if (e.target.closest('.solveit-tree-row-upload, .solveit-tree-upload-pop')) return;
      const atRoot = rootbar.contains(e.target);
      const onBlank = e.target === panel || e.target.matches('.solveit-tree-status') || (treeEl.contains(e.target) && !e.target.closest('li[data-node-data], .solveit-tree-create'));
      if (!atRoot && !onBlank) return;
      e.preventDefault(); e.stopPropagation();
      closeMenu();
      beginCreate(atRoot ? '.' : getCurrentContext().dir, 'auto');
    });
    treeEl.addEventListener('click', handleTreeClick, true);
    wireDragAndDrop(treeEl, rootbar);
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

    panel.inert = true;
    const scroller = qs('.uk-container > .overflow-y-auto');
    if (scroller) {
      workspaceRow = mountTpl('ft_workspace');
      scroller.before(workspaceRow);
      workspaceRow.append(panel, scroller);
    } else document.body.append(panel);
    return panel;
  }

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
      await loadAssets();
      await ensureCurrentDirLoaded();
      renderTree(); setStatus('');
      if (focus && p.classList.contains('open')) {
        const {dir, dlgPath} = getCurrentContext();
        if (!(dlgPath && focusPath(dlgPath)) && !(dir !== '.' && focusPath(dir))) p.querySelector('#solveit-file-tree .treeview-node-content')?.focus();
      }
      if (activeRefreshPaths().some(path => Date.now() - (fetchedAtByPath.get(path) || 0) > CACHE_MAX_AGE)) refreshTree();
    } catch (err) { setStatus('Unable to load files: ' + (err.message || err)); }
  }

  function handleTreeKeys(e) {
    const current = e.target.closest?.('.treeview-node-content');
    if (!current) return;
    const li = current.closest('li[data-node-data]'), node = JSON.parse(li.dataset.nodeData);
    const items = [...panel.querySelectorAll('#solveit-file-tree li[data-node-data] > .treeview-node-content')].filter(item => {
      const itemLi = item.closest('li[data-node-data]');
      if (itemLi.closest('li.hidden')) return false;
      let parent = itemLi.parentElement.closest('li[data-node-data]');
      while (parent) { if (!parent.classList.contains('expanded')) return false; parent = parent.parentElement.closest('li[data-node-data]'); }
      return true;
    });
    const index = items.indexOf(current);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[Math.max(0, Math.min(items.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    } else if (e.key === 'ArrowRight' && node.kind === 'directory') {
      e.preventDefault();
      if (li.classList.contains('expanded')) li.querySelector('ul li[data-node-data] > .treeview-node-content')?.focus();
      else li.querySelector(':scope > .treeview-node-content > .treeview-expander')?.click();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (node.kind === 'directory' && li.classList.contains('expanded')) li.querySelector(':scope > .treeview-node-content > .treeview-expander')?.click();
      else li.parentElement.closest('li[data-node-data]')?.querySelector(':scope > .treeview-node-content')?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (node.kind === 'directory') li.querySelector(':scope > .treeview-node-content > .treeview-expander')?.click();
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
    if (menu && !menu.contains(e.target)) closeMenu();
    if (uploadPop && !uploadPop.contains(e.target) && !e.target.closest?.('.solveit-tree-upload, .solveit-tree-row-upload')) closeUploadPop();
    if (createDraft && !createDraft.input.readOnly && !createDraft.form.contains(e.target)) dismissCreate();
  };
  const onWinKeyDown = e => {
    if (document.querySelector('#solveit-launcher.open')) return;
    if (e.target.closest?.('.solveit-tree-create')) return;
    if (e.key === 'Escape' && (closeUploadPop() || closeMenu())) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    const active = panel?.classList.contains('open') && panel.contains(document.activeElement);
    const isTreeMod = (e.metaKey || e.ctrlKey) && !e.altKey && ['c', 'v'].includes(e.key.toLowerCase());
    if (active && !menu && !e.target.closest?.('.solveit-tree-filter') && (isTreeMod || ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'ContextMenu', 'F10', 'F2', 'Delete', 'Backspace'].includes(e.key))) {
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
    closeMenu(); closeUploadPop(); dismissCreate(); clearDropState();
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
    panel = null; tree = null;
  }

  const offMobile = window.craftMobile?.onChange(() => { if (tree) renderTree(); });
  window.solveitFileTree = {
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

(() => {
  function markDotPrompts() {
    document.querySelectorAll('.editable').forEach(editable => {
      const prompt = editable.querySelector(
        '.msg-card.card-in[data-mtype="prompt"]'
      );
      const body = prompt?.querySelector('.msg-body');
      const isDot = !!body && ['', '.'].includes(body.textContent.trim()) && !body.querySelector('img,video,audio,iframe,canvas,svg');

      editable.classList.toggle('dot-prompt', isDot);
      const response = editable.querySelector(':scope > .card-out .msg-content');
      const hasResponse = !!response && (!!response.textContent.trim() || !!response.querySelector('img,video,audio,iframe,canvas,svg'));
      editable.classList.toggle('dot-prompt-response', isDot && hasResponse);
    });
  }

  markDotPrompts();
  window.__craftCMCore.onDomChange(markDotPrompts, {delay: 'raf', inDialog: true, charData: true});
})();

/* %% nbs/craft/04_craft_c2.ipynb #e2023303 */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"c2_tooltip_portal": "<div id=\"craft-c2-tooltips\" class=\"craft-c2-tooltips\"></div>", "c2_ai_form": "<form class=\"craft-c2-ai-form\"><input type=\"text\" name=\"query\" autocomplete=\"off\" class=\"craft-c2-ai-input\" placeholder=\"Enter your query... (Enter to apply, Esc to cancel)\"></form>", "c2_spinner": "<div class=\"craft-c2-spinner\" data-uk-spinner=\"ratio: 0.5\"></div>"});

/* %% nbs/craft/04_craft_c2.ipynb #cb2ed5a6 */
(() => {
  window.craftC2?.disable();
  const {mountTpl, qsa, on, store, patch} = window.__craftCMCore;
  const LN_KEY = 'solveit-craft:c2:linenums';
  const staticHlText = new WeakMap(), smartSelHist = new WeakMap();
  const ghostTimers = new Map(), ghostAborts = new Map(), sigAborts = new Map();
  const getTooltipPortal = () => {
    let p = document.getElementById('craft-c2-tooltips');
    if (!p) { p = mountTpl('c2_tooltip_portal'); document.body.append(p); }
    return p;
  };
  let showLineNums = store.get(LN_KEY) === '1';

  const isMac = navigator.userAgentData?.platform === 'macOS' || /Mac/.test(navigator.userAgent);
  let parsedServerPrefs = null;
  const getServerPrefs = () => {
    if (!parsedServerPrefs) {
      let enterComp = false, autoClose = false;
      try {
        const s = qsa('script').map(n => n.textContent || '').find(t => t.includes('createMonacoEditor(')) || '';
        const m = s.match(/createMonacoEditor\([\s\S]*?,\s*(true|false)\s*,\s*(true|false)\s*,\s*['"][^'"]*['"]\s*,\s*(true|false)\s*,\s*(true|false)\s*\)/);
        if (m) enterComp = m[2] === 'true';
        const acm = s.match(/['"]autoClosingBrackets['"]\s*:\s*(true|false|['"][^'"]+['"])/);
        if (acm) autoClose = acm[1] !== 'false' && acm[1] !== "'never'" && acm[1] !== '"never"';
      } catch {}
      parsedServerPrefs = {enterComp, autoClose};
    }
    const rawAc = window.editor?.getRawOptions?.()?.autoClosingBrackets;
    const autoClose = rawAc != null ? (rawAc !== 'never' && rawAc !== false) : parsedServerPrefs.autoClose;
    return {enterComp: parsedServerPrefs.enterComp, autoClose};
  };

    const CORE = window.__craftCMCore, {normId} = CORE;
  const {LOCAL_CM_BASE, CM_DEPS, CM_URLS, LANG_ALIASES, langCache, isDark, buildStyles} = CORE;
  let cmCache = null, pendingPointer = null;

  const kernelLang = () => (document.getElementById('kid')?.dataset.language || 'python').toLowerCase();
  const fimEnabled = () => kernelLang() === 'python';
  const dialogMode = () => document.querySelector('[name=mode]')?.value || '';
  const notifyErr = msg => CORE.notifyErr(msg, 'craftC2');
  const loadCM = CORE.loadCoreCM;
  loadCM().then(cm => { cmCache = cm; schedule(); }).catch(() => {});

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
        const {el} = CORE;
        const dom = el('div', {cls: 'craft-c2-sighelp'});
        const render = cur => {
          dom.replaceChildren();
          const s = cur.values[cur.active] || cur.values[0];
          if (!s) return;
          const descs = (s.params || []).map(p => typeof p === 'string' ? p : String(p.desc || p.name || '').replace(/^param /, ''));
          const fullLabel = String(s.label || ''), openIdx = fullLabel.indexOf('('), closeIdx = fullLabel.lastIndexOf(')');
          const sigEl = el('span', {cls: 'craft-c2-sig-label'},
            (openIdx >= 0 ? fullLabel.slice(0, openIdx) : fullLabel) + '(',
            ...descs.flatMap((d, i) => [i > 0 ? ', ' : null, i === s.idx ? el('strong', {cls: 'craft-c2-sig-active'}, d) : d]),
            closeIdx >= 0 ? fullLabel.slice(closeIdx) : ')');
          const mkBtn = (txt, delta) => el('button', {type: 'button', onMousedown: e => {
            e.preventDefault();
            const n = cur.values.length;
            edView.dispatch({effects: setSigHelp.of({...cur, active: (cur.active + delta + n) % n})});
          }}, txt);
          const nav = cur.values.length > 1 ? el('span', {cls: 'craft-c2-sig-nav'}, mkBtn('▲', -1), ` ${cur.active + 1}/${cur.values.length} `, mkBtn('▼', 1)) : null;
          dom.append(el('div', {cls: 'craft-c2-sig-head'}, sigEl, nav));
          if (s.typ || s.mod) dom.append(el('div', {cls: 'craft-c2-sig-meta'},
            s.typ && [el('b', {}, 'Type: '), el('kbd', {}, s.typ), ' '],
            s.mod && [el('b', {}, 'Module: '), el('kbd', {}, s.mod)]));
          if (s.doc) dom.append(el('pre', {cls: 'craft-c2-sig-doc'}, s.doc));
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

    const hoverFoldGutter = cm.lang.foldGutter({
      markerDOM(open) {
        return CORE.el('span', {cls: 'craft-c2-fold ' + (open ? 'is-open' : 'is-closed')}, open ? '▾' : '▸');
      },
    });

    cmExtras = {setGhost, ghostField, setSigHelp, sigHelpField, setAiEdit, aiEditField, staticHighlighter, indentGuidesExt, rainbowBracketsExt, hoverFoldGutter};
    return cmExtras;
  };

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
    const codeEl = card.querySelector('.msg-body .msg-content pre code');
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
      const curCard = codeEl.closest('.card-in');
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

  const jumpToLastCell = id => CORE.jumpToLastCell(() => exitCell(id));

  const editorId = () => String(document.querySelector('#full_editor #id_')?.value || '').replace(/^_/, '');
  const model = () => window.editor?.getModel();
  const getCellEl = id => document.getElementById('_' + id);
  const getCardIn = el => el?.querySelector('.card-in[data-mtype="code"]');
  const getCellText = el => el?.querySelector('form [name="content"]')?.value ?? '';
  const hasDiff = el => !!(el && (el.dataset.diff || el.querySelector('[data-diff]')));
  let nonCodeInsertion = null;
  const isNonCodeInsertion = id => nonCodeInsertion && !nonCodeInsertion.has(id);
  const isC2El = el => !!el && !isNonCodeInsertion(el.id) && !!getCardIn(el) && !hasDiff(el);
  const typingBlocked = () => CORE.typingBlocked();

  const hasTraceback = el => {
    const out = el?.querySelector('.card-out');
    if (!out) return false;
    const txt = out.textContent || '';
    return /Traceback \(most recent call last\)|^\s*File ".*", line \d+/m.test(txt) || Boolean(out.querySelector('.ansi-red-fg, .ansi-red-intense-fg'));
  };
  const wantsLineNumbers = id => showLineNums || hasTraceback(getCellEl(id));
  const syncCellLineNumbers = (id, rec) => {
    if (!rec || !cmCache || !rec.lineNumComp) return;
    const want = wantsLineNumbers(id);
    if (rec.showLN === want) return;
    rec.showLN = want;
    rec.view.dispatch({effects: rec.lineNumComp.reconfigure(want ? cmCache.view.lineNumbers() : [])});
    rec.host.classList.toggle('craft-c2-has-ln', want);
  };
  const setLineNums = on => {
    showLineNums = Boolean(on);
    store.set(LN_KEY, showLineNums ? '1' : '0');
    for (const [id, rec] of views) syncCellLineNumbers(id, rec);
  };
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
      const codeEl = getCardIn(getCellEl(id))?.querySelector('.msg-body .msg-content pre code');
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
    keepMounted: (_id, rec) => Boolean(cmCache && hasFolds(cmCache, rec.view.state)),
    isViewValid: (_id, _rec, el) => !hasDiff(el) && isC2El(el),
    onViewSynced: (id, rec) => syncCellLineNumbers(id, rec),
    onSync: () => {
      bindMonacoWatcher();
      reconcileAutoEdits();
      driveAutoEdit();
      for (const card of document.querySelectorAll('#dialog-container .editable .card-in')) {
        const el = card.closest('.editable');
        const id = el.id.replace(/^_/, '');
        el.classList.toggle('craft-c2', isC2El(el));
        syncSaveState(id);
        const outCard = el.querySelector(':scope > .card-out');
        if (outCard) outCard.classList.toggle('craft-c2-traceback', card.dataset.mtype === 'code' && hasTraceback(el));
        if (card.dataset.mtype === 'code' && !card.classList.contains('craft-c2-mounted') && !card.closest('[data-streaming]')) {
          ensureStaticHighlighted(card);
        }
      }
    },
    onBeforeRequest: (ctx, pathname, body) => {
      if (pathname === '/add_above_' || pathname === '/add_below_') {
        if (nonCodeInsertion) return;
        if (!pendingAutoEdits.some(r => r.forceCode && r.expires > Date.now())) queueAutoEdit({forceCode: false});
        return;
      }
      if (pathname === '/add_runq_') {
        if (body.get('cmd') === 'alt-run') queueAutoEdit({forceCode: false, ttl: 30000});
        return;
      }
      if (pathname !== '/upsert_msg_') return;
      const source = ctx.sourceElement, cmd = body.get('cmd');
      const composerButton = source?.matches('#full_editor #submit_btn, #full_editor #cancel_btn');
      const composerShortcut = source?.matches('#kid') && ['upsert-shift-run', 'upsert-alt-run'].includes(cmd);
      if ((!composerButton && !composerShortcut) || body.get('is_input') !== '1') return;
      if (cmd === 'upsert-alt-run') queueAutoEdit({forceCode: false, ttl: 30000});
    },
    openPrimaryOnEnter: (el, run) => {
      if (!isC2El(el)) return false;
      const card = getCardIn(el);
      if (!card || card.classList.contains('collapsed')) return false;
      if (run) openCell(el.id.replace(/^_/, ''));
      return true;
    },
    onEditClick: (edit, e) => {
      const cell = edit.closest('.editable'), cellId = cell?.id?.replace(/^_/, ''), codeCard = getCardIn(cell);
      if (!cellId || !codeCard || hasDiff(cell) || isNonCodeInsertion(cell.id) || codeCard.classList.contains('collapsed')) return false;
      e.preventDefault(); e.stopImmediatePropagation();
      openCell(cellId);
      return true;
    },
    onExtraClick: e => {
      const tab = e.target.closest?.('#full_editor .tabh');
      if (tab?.id === 'tabh-code' && shouldInterceptCodeTab()) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        newCodeCell();
      }
    },
    getThemeExts: () => (cmCache ? themeExtensions(cmCache) : null),
    beforeSwitch: (id, v) => cancelGhost(id, v),
    failRenameMsg: 'Could not save code edit before reopening renamed dialog.',
    domAttrs: ['value', 'data-diff'],
    inDialog: false,
  });
  const {states, views, pendingSaves, dirtyIds, failedSaves, syncSaveState, saveCell, unmountCell, exitCell, saveAndRun, sync, schedule} = ed;
  const splitCell = (id, v) => ed.splitCell(id, v, 'code');

  const pendingAutoEdits = [];
  let autoEditGuard = null, cancelRetryTimer = null, monacoBoundEditor = null, monacoModelSub = null;

  const clearAutoEditGuard = () => {
    clearTimeout(cancelRetryTimer);
    cancelRetryTimer = null;
    autoEditGuard?.holdRelease?.();
    autoEditGuard = null;
  };

  const monacoHoldsCell = id => {
    if (!id) return false;
    if (editorId() === id) return true;
    const p = model()?.uri?.path || '';
    if (p.endsWith('/' + id) || p.endsWith('/_' + id) || p.endsWith('/' + id + '-1') || p.endsWith('/_' + id + '-1')) return true;
    return getCellEl(id)?.dataset.editing === 'true';
  };

  const queueAutoEdit = ({forceCode = false, ttl = 6000} = {}) => {
    clearAutoEditGuard();
    const existing = new Set([...document.querySelectorAll('#dialog-container .editable[id]')].map(el => el.id));
    pendingAutoEdits.push({existing, forceCode, expires: Date.now() + ttl});
  };

  const claimNewCell = (nid, {forceCode = false} = {}) => {
    clearAutoEditGuard();
    autoEditGuard = {
      id: nid, forceCode, wantOpen: true, canceling: false, cancelAt: 0, converted: false,
      holdRelease: window.craftIdleComposer?.holdForInsertion?.() || null,
      expires: Date.now() + 4000,
    };
    driveAutoEdit();
  };

  const releaseMonacoFor = g => {
    if (editorId() !== g.id) return;
    if (g.canceling && Date.now() - g.cancelAt < 1500) return;
    const cancelBtn = document.getElementById('cancel_btn');
    if (!cancelBtn || cancelBtn.disabled) {
      clearTimeout(cancelRetryTimer);
      cancelRetryTimer = setTimeout(driveAutoEdit, 60);
      return;
    }
    const rec = views.get(g.id);
    if (rec) {
      const curDoc = rec.view.state.doc.toString();
      const m = model();
      if (curDoc && m && m.getValue() !== curDoc) m.setValue(curDoc);
    }
    g.canceling = true;
    g.cancelAt = Date.now();
    cancelBtn.click();
  };

  const driveAutoEdit = () => {
    if (!autoEditGuard) return;
    const g = autoEditGuard;
    if (Date.now() > g.expires) { clearAutoEditGuard(); return; }
    const el = getCellEl(g.id);
    const card = el?.querySelector('.card-in');
    const isCode = card?.dataset.mtype === 'code';
    if (el && card && !isCode) {
      if (g.forceCode) {
        if (monacoHoldsCell(g.id)) { releaseMonacoFor(g); return; }
        if (!g.converted) {
          g.converted = true;
          const kid = document.getElementById('kid')?.value || '';
          window.htmx?.ajax('POST', '/set_mtyp_', {
            source: '#kid', swap: 'none',
            values: {kid, id_: '_' + g.id, ids: '_' + g.id, mtyp: 'code'},
          }).catch(err => console.error('craftC2: set_mtyp failed', err));
        }
        return;
      }
      clearAutoEditGuard();
      return;
    }
    if (monacoHoldsCell(g.id)) {
      releaseMonacoFor(g);
      return;
    }
    if (el && isCode && !hasDiff(el) && g.wantOpen) {
      g.wantOpen = false;
      g.holdRelease?.(); g.holdRelease = null;
      window.craftIdleComposer?.hide?.();
      el.scrollIntoView({block: 'nearest'});
      openCell(g.id, {anchor: 0, head: 0});
    }
  };

  const checkMonacoHandover = () => {
    if (ed.destroyed) return;
    const edId = editorId();
    if (edId) {
      if (isNonCodeInsertion('_' + edId)) return;
      if (autoEditGuard && autoEditGuard.id === edId && Date.now() < autoEditGuard.expires) {
        if (!autoEditGuard.holdRelease) autoEditGuard.holdRelease = window.craftIdleComposer?.holdForInsertion?.() || null;
        autoEditGuard.wantOpen = true;
        if (autoEditGuard.canceling && Date.now() - autoEditGuard.cancelAt >= 1500) autoEditGuard.canceling = false;
        driveAutoEdit();
        return;
      }
      if (!autoEditGuard && pendingAutoEdits.length) {
        const now = Date.now();
        for (let i = pendingAutoEdits.length - 1; i >= 0; i--) {
          if (pendingAutoEdits[i].expires < now) pendingAutoEdits.splice(i, 1);
        }
        const mtype = document.querySelector('#full_editor #msg_type')?.value;
        for (let i = 0; i < pendingAutoEdits.length; i++) {
          const req = pendingAutoEdits[i];
          if (req.existing.has('_' + edId)) continue;
          if (!req.forceCode && mtype !== 'code') continue;
          pendingAutoEdits.splice(i, 1);
          claimNewCell(edId, req);
          return;
        }
      }
    } else if (autoEditGuard && autoEditGuard.canceling) {
      autoEditGuard.canceling = false;
      autoEditGuard.cancelAt = 0;
      autoEditGuard.wantOpen = true;
      window.craftIdleComposer?.hide?.();
      driveAutoEdit();
    }
  };

  const onFullEditorSettle = e => {
    if (ed.destroyed) return;
    const tgt = e.target;
    if (tgt?.id === 'full_editor' || e.detail?.target?.id === 'full_editor') checkMonacoHandover();
  };

  const bindMonacoWatcher = () => {
    const ed = window.editor;
    if (!ed || ed === monacoBoundEditor) return;
    monacoModelSub?.dispose?.();
    monacoBoundEditor = ed;
    monacoModelSub = ed.onDidChangeModel?.(() => { queueMicrotask(checkMonacoHandover); }) || null;
  };

  const reconcileAutoEdits = () => {
    if (!pendingAutoEdits.length) return;
    const now = Date.now();
    for (let i = pendingAutoEdits.length - 1; i >= 0; i--) {
      if (pendingAutoEdits[i].expires < now) pendingAutoEdits.splice(i, 1);
    }
    if (!pendingAutoEdits.length) return;
    const cells = [...document.querySelectorAll('#dialog-container .editable[id]')];
    for (let i = 0; i < pendingAutoEdits.length; i++) {
      const req = pendingAutoEdits[i];
      const added = cells.filter(el => !isNonCodeInsertion(el.id) && !req.existing.has(el.id) && (req.forceCode ? Boolean(el.querySelector('.card-in')) : Boolean(getCardIn(el))));
      if (!added.length) continue;
      pendingAutoEdits.splice(i, 1);
      claimNewCell(added[0].id.replace(/^_/, ''), req);
      break;
    }
  };

  function shouldInterceptCodeTab() {
    if (editorId()) return false;
    const uri = model()?.uri?.path || '';
    if (uri && !uri.endsWith('/temp')) return false;
    if (window.edValue?.().trim()) return false;
    if (document.querySelector('.editable[data-editing="true"]')) return false;
    return true;
  }

  async function newCodeCell() {
    if (ed.destroyed) return false;
    if (ed.activeKey) await exitCell(ed.activeKey);
    const fullEd = document.getElementById('full_editor');
    if (fullEd?.contains(document.activeElement)) document.activeElement.blur();
    window.craftIdleComposer?.hide?.();
    const kid = document.getElementById('kid')?.value || '';
    if (!kid) return false;
    const allCells = [...document.querySelectorAll('#dialog-container > .editable[id]')];
    const last = allCells[allCells.length - 1];
    queueAutoEdit({forceCode: true});
    const unhide = window.craftIdleComposer?.holdForInsertion();
    try {
      if (last) {
        const lastId = last.id.replace(/^_/, '');
        const after = window.sectionTail ? window.sectionTail(last) : last.id;
        await CORE.htmxPost('/add_below_', {id_: lastId, after});
      } else {
        await CORE.htmxPost('/upsert_msg_', {id_: '', msg_type: 'code', is_input: '1', content: ''});
      }
      schedule();
      const existing = new Set(allCells.map(el => el.id)), deadline = Date.now() + 6000;
      let addedId = null;
      while (Date.now() < deadline) {
        const added = [...document.querySelectorAll('#dialog-container > .editable[id]')].find(el => !existing.has(el.id) && isC2El(el));
        if (added && !monacoHoldsCell(added.id.slice(1)) && added.querySelector('.craft-c2-host')) { addedId = added.id.slice(1); break; }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (addedId && !document.activeElement?.closest?.(`#_${addedId} .craft-c2-host`)) openCell(addedId, {anchor: 0, head: 0});
      return true;
    } catch (err) {
      pendingAutoEdits.pop();
      notifyErr('Could not create code cell.');
      console.error('craftC2: newCodeCell failed', err);
      return false;
    } finally { unhide?.(); }
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
      const r = await fetch('/complete_', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({code, line_no: line.number, col_no: context.pos - line.from + 1, kid}),
        signal: ctrl.signal,
        priority: 'low',
      });
      if (!r.ok || context.aborted) return null;
      const {completions} = await r.json();
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
      const r = await fetch('/ghost_', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id_: id, mtype: 'code', output: false, pfx, sfx, req_id, kid}),
        signal: ctrl.signal,
        priority: 'low',
      });
      if (!r.ok || ctrl.signal.aborted) return;
      const {completions} = await r.json();
      if (!Array.isArray(completions) || !completions.length || ctrl.signal.aborted) return;
      const cur = views.get(id);
      if (!cur || cur.view !== v || !v.hasFocus || v.state.doc.toString() !== origText || v.state.selection.main.head !== pos || !v.state.selection.main.empty) return;
      const first = completions[0].text;
      if (!first) return;
      if (/^\s*$/.test(first) && copts?.acceptichars && !sfx.length && !/^\s*$/.test(prevLine)) {
        v.dispatch({changes: {from: pos, to: pos, insert: first}, selection: {anchor: pos + first.length}});
        if (fimEnabled() && copts?.triggeronaccept && dialogMode() !== 'learning') {
          setTimeout(() => requestGhost(id, v, false), 50);
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
      setTimeout(() => {
        const cur = views.get(id);
        if (cur && cur.view === v && v.hasFocus) requestGhost(id, v, false);
      }, 50);
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
      const res = await fetch('/sig_help_', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({code: origText, line_no: line.number, col_no: pos - line.from, kid}),
        signal: ctrl.signal,
      });
      if (!res.ok || ctrl.signal.aborted) return false;
      const {values} = await res.json();
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
      const r = await fetch(hl ? '/supere_' : '/superc_', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id_: id, mtype: 'code', output: false, pfx, sfx, hl, instr, kid}),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(result.error || 'Completion request failed.');
      const {completions} = result;
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


  function buildExtensions(cm, id, comps) {
    const {state, view, lang, python, cmds, ac, search} = cm;
    const {ghostField, sigHelpField, setSigHelp, aiEditField, indentGuidesExt, rainbowBracketsExt, hoverFoldGutter} = ensureCMExtras(cm);
    const {langComp, themeComp, readOnlyComp, lineNumComp} = comps;

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
      {key: 'Shift-Enter', run: () => { saveAndRun(id, 'shift-run'); return true; }},
      {key: 'Mod-Enter', run: () => { saveAndRun(id, 'run'); return true; }},
      {key: 'Alt-Enter', run: () => { saveAndRun(id, 'alt-run'); return true; }},
      {key: 'Mod-Shift-Enter', run: () => { saveAndRun(id, 'continue'); return true; }},
      {key: 'Alt-.', run: v => { requestGhost(id, v, true); return true; }},
      {key: 'ArrowRight', run: v => !getServerPrefs().enterComp && acceptGhost(id, v)},
      {key: 'ArrowUp', run: v => stepBoundary(id, v, true)},
      {key: 'ArrowDown', run: v => stepBoundary(id, v, false)},
      {key: 'Mod-Shift-.', run: v => triggerSuperComplete(id, v)},
      {key: 'Mod-Shift->', run: v => triggerSuperComplete(id, v)},
      {key: 'Ctrl-Shift--', run: v => { splitCell(id, v); return true; }},
      {key: 'Ctrl-Shift-_', run: v => { splitCell(id, v); return true; }},
      {key: 'Mod-Shift-j', run: () => true},
      {key: 'Mod-Shift-k', run: v => { switchCellType(id, v, 'note'); return true; }},
      {key: 'Mod-Shift-l', run: v => { switchCellType(id, v, 'prompt'); return true; }},
      {key: 'Mod-Shift-;', run: v => { switchCellType(id, v, 'raw'); return true; }},
      {key: 'Mod-Shift-d', run: () => { document.getElementById('brain-btn')?.click(); return true; }},
      {key: smartExpandKey, run: v => smartExpandSelection(v)},
      {key: smartShrinkKey, run: v => smartShrinkSelection(v)},
      {key: jumpLastKey, run: () => { jumpToLastCell(id); return true; }},
      {key: 'Alt-Shift-n', run: () => { newCodeCell(); return true; }},
      {key: 'Shift-Escape', run: () => { exitCell(id); return true; }},
      {key: 'Enter', run: v => {
        if (ac.completionStatus(v.state) !== 'active') return false;
        if (ac.selectedCompletionIndex(v.state) != null) return ac.acceptCompletion(v);
        return getServerPrefs().enterComp ? acceptOrPickFirst(v) : false;
      }},
      {key: 'Escape', run: v => {
        if (v.state.field(sigHelpField, false)) { v.dispatch({effects: setSigHelp.of(null)}); return true; }
        if (ac.completionStatus(v.state)) return ac.closeCompletion(v);
        if (v.state.field(ghostField, false)) { cancelGhost(id, v); return true; }
        if (search.searchPanelOpen(v.state)) return search.closeSearchPanel(v);
        if (v.state.selection.ranges.length > 1) return cmds.simplifySelection(v);
        exitCell(id);
        return true;
      }},
      {key: 'Tab', run: v => {
        if (getServerPrefs().enterComp) {
          if (acceptGhost(id, v)) return true;
          return cmds.indentWithTab.run(v);
        }
        if (acceptOrPickFirst(v)) return true;
        return cmds.indentWithTab.run(v);
      }, shift: v => {
        if (v.state.selection.main.empty && fimEnabled() && !v.state.field(sigHelpField, false)) {
          triggerSigHelp(id, v);
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
      {key: 'Mod-Shift-k', run: cmds.deleteLine},
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
      lineNumComp.of(wantsLineNumbers(id) ? view.lineNumbers() : []),
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
      hoverFoldGutter,
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
        states.set(id, u.state);
        if (u.docChanged) {
          const el = getCellEl(id);
          if (el) {
            if (u.state.doc.toString() !== getCellText(el)) dirtyIds.add(id);
            else { dirtyIds.delete(id); failedSaves.delete(id); }
            syncSaveState(id);
          }
          if (u.view.hasFocus && u.state.selection.main.empty) scheduleGhost(id, u.view);
          else cancelGhost(id, u.view);
          let line1Changed = false;
          const l1End = u.startState.doc.line(1).to;
          u.changes.iterChangedRanges(fromA => { if (fromA <= l1End) line1Changed = true; });
          if (line1Changed) syncCellLanguage(id, u.view);
        } else if (u.selectionSet) {
          clearTimeout(ghostTimers.get(id));
          ghostTimers.delete(id);
        }
        if (!u.view.hasFocus && ed.activeKey !== id && !pendingSaves.has(id) && !dirtyIds.has(id) && !hasFolds(cm, u.state)) {
          queueMicrotask(() => {
            const cur = views.get(id);
            if (cur && !cur.view.hasFocus && ed.activeKey !== id && !pendingSaves.has(id) && !dirtyIds.has(id) && !hasFolds(cm, cur.view.state)) unmountCell(id);
          });
        }
      }),
    ];
  }

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
      hostClass: 'craft-c2-host',
      extraRec: {langKey: 'python', showLN: null},
      themeExts: themeExtensions(cm),
      prepareState: () => {
        const comps = {
          langComp: new cm.state.Compartment(), themeComp: new cm.state.Compartment(),
          readOnlyComp: new cm.state.Compartment(), lineNumComp: new cm.state.Compartment(),
        };
        const prev = states.get(id);
        const reusePrev = Boolean(prev && prev.doc.toString() === text && prev._c2Comps?.lineNumComp);
        const edState = reusePrev ? prev : cm.state.EditorState.create({doc: text, extensions: buildExtensions(cm, id, comps)});
        const activeComps = reusePrev ? prev._c2Comps : comps;
        edState._c2Comps = activeComps;
        return {edState, activeComps, reusePrev};
      },
      onExisting: rec => syncCellLanguage(id, rec.view),
      onMounted: rec => { syncCellLineNumbers(id, rec); syncCellLanguage(id, rec.view); },
    });
  }

  const {offsetIn} = CORE;

  const onMouseDown = e => {
    if (e.button !== 0 || e.target.closest?.('button, a, .craft-c2-host')) return;
    const content = e.target.closest?.('.editable.craft-c2 .card-in[data-mtype="code"] .msg-content');
    if (!content) return;
    const el = content.closest('.editable');
    if (!isC2El(el)) return;
    pendingPointer = {
      id: el.id.replace(/^_/, ''),
      codeEl: content.querySelector('pre code'),
      x: e.clientX,
      y: e.clientY,
    };
  };

  const onMouseUp = e => {
    if (!pendingPointer) return;
    const p = pendingPointer;
    pendingPointer = null;
    const sel = window.getSelection();
    const anchor = offsetIn(p.codeEl, sel?.anchorNode, sel?.anchorOffset);
    const head = offsetIn(p.codeEl, sel?.focusNode, sel?.focusOffset);
    if (anchor != null) sel?.removeAllRanges();
    openCell(p.id, anchor != null ? {anchor, head: head ?? anchor} : {coords: {x: e.clientX, y: e.clientY}});
  };

  const onKernelConnected = () => {
    for (const [id, rec] of views) syncCellLanguage(id, rec.view);
  };

  const ac = new AbortController(), sig = {signal: ac.signal};
  const sep = window.htmx?.config.metaCharacter || ':';
  const settleEvent = ['htmx', 'after', 'settle'].join(sep);
  on(document, {mousedown: onMouseDown, mouseup: onMouseUp, [settleEvent]: onFullEditorSettle}, sig);
  on(document.body, 'kernel-connected', onKernelConnected, sig);

  window.__hotkeyRegister?.({
    id: 'c2-new-code', combo: 'Alt+Shift+N', label: 'New code cell at bottom', group: 'Code',
    handler: () => { newCodeCell(); return true; },
  });
  window.__hotkeyRegister?.({
    id: 'c2-line-numbers', combo: 'Alt+Shift+L', label: 'Toggle code line numbers', group: 'Code',
    handler: () => { setLineNums(!showLineNums); return true; },
  });

  window.craftC2 = {
    manages: id => isC2El(getCellEl(normId(id))),
    edit: (id, opts) => openCell(normId(id), opts),
    active: () => ed.activeKey,
    view: id => views.get(normId(id ?? ed.activeKey))?.view || null,
    exit: id => exitCell(normId(id ?? ed.activeKey)),
    run: (id, cmd = 'run') => saveAndRun(normId(id ?? ed.activeKey), cmd),
    newCodeCell,
    expectCodeInsertion: () => queueAutoEdit({forceCode: true}),
    guardNonCodeInsertion(existing) {
      nonCodeInsertion = existing;
      return () => { if (nonCodeInsertion === existing) { nonCodeInsertion = null; schedule(); } };
    },
    shouldInterceptCodeTab,
    lineNumbers: () => showLineNums,
    setLineNumbers: setLineNums,
    toggleLineNumbers: () => setLineNums(!showLineNums),
    dirty: () => [...dirtyIds],
    source: () => cmCache?._source || 'pending',
    disable() {
      monacoModelSub?.dispose?.();
      monacoModelSub = null;
      monacoBoundEditor = null;
      clearAutoEditGuard();
      ac.abort();
      pendingAutoEdits.length = 0;
      ed.disable();
      qsa('.editable.craft-c2, .editable[data-c2-save]').forEach(el => patch(el, {classes: {'craft-c2': false}, dataset: {c2Editing: null, c2Save: null}}));
      qsa('.card-out.craft-c2-traceback').forEach(el => el.classList.remove('craft-c2-traceback'));
      qsa('#craft-c2-tooltips').forEach(el => el.remove());
    },
  };
  sync();
})();

/* %% nbs/craft/06_mobile.ipynb #83f4bb08 */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"mb_bar": "<nav id=\"craft-mbar\" aria-label=\"Mobile toolbar\" data-mode=\"idle\"><div class=\"craft-mbar-row\" data-row=\"idle\"><button type=\"button\" data-act=\"nav\" aria-label=\"Menu\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 6h16M4 12h16M4 18h16\"></path></svg><span>Menu</span></button><button type=\"button\" data-act=\"files\" aria-label=\"Files\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z\"></path></svg><span>Files</span></button></div><div class=\"craft-mbar-row\" data-row=\"edit\"><button type=\"button\" data-act=\"tab\" aria-label=\"Tab\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 12h13m-4-4 4 4-4 4M20 6v12\"></path></svg><span>Tab</span></button><span class=\"craft-mbar-spacer\"></span><button type=\"button\" data-act=\"run\" aria-label=\"Run\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M7 5v14l11-7z\"></path></svg><span>Run</span></button><button type=\"button\" data-act=\"done\" aria-label=\"Done\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 12.5l4.5 4.5L19 7.5\"></path></svg><span>Done</span></button></div></nav>", "mb_backdrop": "<div id=\"craft-mobile-backdrop\"></div>", "mb_jump_btn": "<button id=\"craft-scroll-bottom\" type=\"button\" aria-label=\"Jump to bottom\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 5v14m-6-6 6 6 6-6\"></path></svg></button>", "mb_picker": "<div id=\"craft-edge-picker\" role=\"menu\" aria-label=\"Insert cell\"><div class=\"craft-edge-picker-head\"></div><div class=\"craft-edge-picker-opts\"><button type=\"button\" role=\"menuitem\" data-type=\"Code\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"17\" height=\"17\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 6l-6 6 6 6m8-12 6 6-6 6M14 4l-4 16\"></path></svg><span>Code</span></button><button type=\"button\" role=\"menuitem\" data-type=\"Note\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"17\" height=\"17\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 3h10l4 4v14H5z M15 3v5h4M8 12h8m-8 4h8\"></path></svg><span>Note</span></button><button type=\"button\" role=\"menuitem\" data-type=\"Prompt\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"17\" height=\"17\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 4h18v12H9l-6 4z M7 10h.01m5 0h.01m5 0h.01\"></path></svg><span>Prompt</span></button><button type=\"button\" role=\"menuitem\" data-type=\"Raw\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"17\" height=\"17\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 5h18v14H3z M7 9v6\"></path></svg><span>Raw</span></button></div></div>", "mb_bulge_above": "<button type=\"button\" class=\"craft-edge-bulge\" data-edge=\"above\" aria-label=\"Insert cell above\"><svg aria-hidden=\"true\" viewbox=\"0 0 36 10\" width=\"36\" height=\"10\"><path class=\"craft-edge-stroke\" d=\"M0 9 C9 9 12 1.5 18 1.5 C24 1.5 27 9 36 9\"></path></svg></button>", "mb_bulge_below": "<button type=\"button\" class=\"craft-edge-bulge\" data-edge=\"below\" aria-label=\"Insert cell below\"><svg aria-hidden=\"true\" viewbox=\"0 0 36 10\" width=\"36\" height=\"10\"><path class=\"craft-edge-stroke\" d=\"M0 1 C9 1 12 8.5 18 8.5 C24 8.5 27 1 36 1\"></path></svg></button>", "mb_empty_add": "<div id=\"craft-empty-add\"><span class=\"craft-empty-add-label\">Add first cell</span><div class=\"craft-empty-add-btns\"><button type=\"button\" data-type=\"Code\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 6l-6 6 6 6m8-12 6 6-6 6M14 4l-4 16\"></path></svg><span>Code</span></button><button type=\"button\" data-type=\"Note\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 3h10l4 4v14H5z M15 3v5h4M8 12h8m-8 4h8\"></path></svg><span>Note</span></button><button type=\"button\" data-type=\"Prompt\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 4h18v12H9l-6 4z M7 10h.01m5 0h.01m5 0h.01\"></path></svg><span>Prompt</span></button><button type=\"button\" data-type=\"Raw\"><svg aria-hidden=\"true\" viewbox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 5h18v14H3z M7 9v6\"></path></svg><span>Raw</span></button></div></div>"});

/* %% nbs/craft/06_mobile.ipynb #271473a5 */
/* ── Mobile toolbar, edge-bulge cell insertion & scroll chrome ───────────
   Only rendered under `html.craft-mobile` (see "Mobile mode detection").
   Phones have no hover, no Escape, no Shift+Enter and no Tab, so this module
   provides:
     - idle:    floating pill dock (Menu · Files) that hides on scroll-down
     - editing: full-width bar above the soft keyboard (Tab · Run/Send · Done)
     - cell insertion: top/bottom brace-style bulges on the selected cell;
       press-and-drag (or tap) into Code / Note / Prompt / Raw to prepend or
       append relative to that cell (plus an inline starter row on empty dialogs)
     - jump-to-bottom button when scrolled well above the end of a dialog. */
(() => {
  window.craftMobileBar?.disable();
  const root = document.documentElement;
  const {mountTpl, qs, qsa, on, htmxPost, patch, rafOnce, onDomChange} = window.__craftCMCore;
  const ac = new AbortController(), sig = {signal: ac.signal}, cap = {capture: true, signal: ac.signal}, pas = {passive: true, signal: ac.signal};
  const bar = mountTpl('mb_bar'), backdrop = mountTpl('mb_backdrop'), jumpBtn = mountTpl('mb_jump_btn');
  const picker = mountTpl('mb_picker'), bulgeAbove = mountTpl('mb_bulge_above'), bulgeBelow = mountTpl('mb_bulge_below');
  const emptyAdd = mountTpl('mb_empty_add');

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const notify = message => window.UIkit?.notification?.({message, status: 'warning'});
  const dialog = () => document.getElementById('dialog-container');
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

  async function createFirst(type) {
    if (type === 'Code') return window.craftC2?.newCodeCell?.();
    const kid = document.getElementById('kid')?.value;
    if (!kid || !window.htmx) return notify('Reload the dialog and try again.');
    const before = new Set(qsa('.editable[id]', dialog()).map(el => el.id));
    await htmxPost('/upsert_msg_', {id_: '', msg_type: type.toLowerCase(), is_input: '1', content: ''});
    for (let i = 0; i < 100; i++) {
      const el = qsa('.editable[id]', dialog()).find(x => !before.has(x.id));
      if (el) { el.scrollIntoView({block: 'nearest'}); window.craftMd?.edit?.(el.id.slice(1), {toEnd: true}); return; }
      await sleep(50);
    }
  }

  let adding = false;
  async function addCell(type, where = 'below', targetCell = null) {
    const container = dialog();
    if (!container || adding || window.craftInsertPreview?.isBusy?.()) return;
    adding = true;
    try {
      const editingCell = document.activeElement?.closest?.('#dialog-container > .editable');
      await closeEditors();
      document.activeElement?.blur?.();
      const cells = qsa(':scope > .editable[id]', container).filter(el => el.getClientRects().length);
      const target = (targetCell?.isConnected && targetCell) || (editingCell?.isConnected && editingCell) || cells.find(el => el.dataset.sm === 'primary') || cells[cells.length - 1];
      if (!target) { await createFirst(type); return; }
      if (!window.craftInsertPreview?.insert) return notify('Reload this dialog to enable inserting cells.');
      await sleep(0);
      window.craftInsertPreview.insert(where === 'above' ? 'above' : 'below', {type, cell: target, force: true});
    } catch (err) {
      console.error('craftMobileBar: add cell failed', err);
      notify('Could not add the cell.');
    } finally { adding = false; }
  }

  /* ── Cell-edge bulges: attach to the editing cell or primary selected cell ── */
  let bulgeHost = null;
  const detachBulges = () => {
    bulgeHost?.classList.remove('craft-bulge-host');
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
    if (!container) { detachBulges(); emptyAdd.remove(); return; }
    const cells = qsa(':scope > .editable[id]', container).filter(el => !el.hidden && el.getClientRects().length);
    if (!cells.length) {
      detachBulges();
      if (!emptyAdd.isConnected) container.append(emptyAdd);
      return;
    }
    emptyAdd.remove();
    const target = activeEditingCell(cells) || cells.find(el => el.dataset.sm === 'primary') || null;
    if (target !== bulgeHost) {
      detachBulges();
      if (target) {
        target.classList.add('craft-bulge-host');
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
    picker.classList.remove('open');
    setHot(null);
    pickerState = null;
  };
  const positionPicker = (anchorRect, edge) => {
    patch(picker, {dataset: {edge}, classes: {open: true}});
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
    for (const el of qsa(':scope > .editable[data-sm="primary"], :scope > .editable[data-sm="secondary"]', container)) {
      if (el !== cell) el.setAttribute('data-sm', 'unselected');
    }
    cell.setAttribute('data-sm', 'primary');
  };
  const onBulgePointerDown = e => {
    const handle = e.currentTarget;
    const cell = handle.closest('#dialog-container > .editable');
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
  on(emptyAdd, 'click', e => {
    const opt = e.target.closest('button[data-type]');
    if (!opt) return;
    e.preventDefault(); e.stopPropagation();
    addCell(opt.dataset.type, 'below', null);
  }, sig);

  /* After Run/Send the output lands below the fold: keep the cell in view while it grows,
     until it has been still for ~10s or the user scrolls on their own. */
  let stopFollow = null;
  function followCell(id) {
    stopFollow?.();
    const elId = '_' + String(id).replace(/^_/, '');
    let lastH = -1, quiet = 0;
    let offStop = null;
    const stop = () => {
      clearInterval(timer); clearTimeout(cap);
      offStop?.();
      if (stopFollow === stop) stopFollow = null;
    };
    const tick = () => {
      const el = document.getElementById(elId);
      if (!el) return stop();
      const h = Math.round(el.getBoundingClientRect().height);
      if (h !== lastH) { lastH = h; quiet = 0; el.scrollIntoView({block: 'nearest'}); }
      else if (++quiet > 40) stop();
    };
    const timer = setInterval(tick, 250), cap = setTimeout(stop, 120000);
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
    const cell = t.closest('#dialog-container > .editable[id]');
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
    if (pickerState?.tapOpen && !picker.contains(t) && !t.closest?.('.craft-edge-bulge')) closePicker();
    if (!root.classList.contains('craft-nav-open')) return;
    if (bar.contains(t) || navEl()?.contains(t) || t.closest?.('#craft-mobile-toggle, .uk-drop, .uk-dropdown, .uk-modal, [role="dialog"]')) return;
    toggleNav(false);
  };
  on(document, 'pointerdown', onDocPointerDown, cap);

  /* Observe DOM updates for: temp editor auto-close, selected cell changes, scroller changes. */
  const onDomMut = () => {
    if (!mounted) return;
    if (window.craftMobile?.active() && qs('#solveit-temp-editor.open') && window.solveitFileTree?.isOpen?.()) window.solveitFileTree.close();
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
      closePicker(); detachBulges(); emptyAdd.remove();
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
