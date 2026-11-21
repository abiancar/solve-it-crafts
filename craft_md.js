/* ── Craft Inline Markdown & Raw Editor (CM6 + Obsidian-style Live Preview) ──
   Replaces the plain-textarea craftInlineText editor for `note`, `prompt`, and
   `raw` cells. Shares CodeMirror 6 core modules with craftC2 via
   `window.__craftCM6LocalPromise` and loads vendored @codemirror/lang-markdown
   and @lezer/markdown from /static/.craft-assets/cm6/. */
(() => {
  window.craftInlineNote?.disable?.();
  window.craftInlineText?.disable?.();
  window.craftMd?.disable?.();
  if (!document.getElementById('dialog-container')) return;

  const LOCAL_CM_BASE = '/static/.craft-assets/cm6';
  const CM_DEPS = 'deps=@codemirror/state@6.5.2,@codemirror/view@6.36.5,@codemirror/language@6.11.0';
  const CARD_IN_SEL = ':scope > .card-in:is([data-mtype="note"],[data-mtype="prompt"],[data-mtype="raw"])';
  const CARD_OUT_SEL = ':scope > .card-out[data-mtype="prompt"]';
  const TEXT_TYPES = new Set(['note', 'prompt', 'raw']);
  const SURROUND_PAIRS = {'(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`', '*': '*', '_': '_', '~': '~'};
  const isMac = navigator.userAgentData?.platform === 'macOS' || /Mac/.test(navigator.userAgent);

  const states = new Map(), views = new Map(), pendingSaves = new Map();
  const dirtyIds = new Set(), failedSaves = new Set(), saveWaiters = new Map();
  const requests = new WeakMap();
  let cmCache = null, mdCache = null, activeKey = null, pendingPointer = null;
  let bypassMonacoKey = null, frame = null, destroyed = false;

  const isDark = () => document.documentElement.classList.contains('dark');
  const normId = id => String(id || '').replace(/^_/, '');
  const partOf = p => p === 'out' ? 'out' : 'in';
  const makeKey = (id, part = 'in') => `${normId(id)}:${partOf(part)}`;
  const parseKey = k => {
    const s = String(k || '');
    const i = s.lastIndexOf(':');
    return i >= 0 ? {id: normId(s.slice(0, i)), part: partOf(s.slice(i + 1))} : {id: normId(s), part: 'in'};
  };
  const getCellEl = id => document.getElementById('_' + normId(id));
  const getCard = (el, part = 'in') => el?.querySelector(part === 'out' ? CARD_OUT_SEL : CARD_IN_SEL) || null;
  const getKind = (el, part = 'in') => {
    if (part === 'out') return getCard(el, 'out') ? 'output' : null;
    const k = getCard(el, 'in')?.dataset.mtype;
    return TEXT_TYPES.has(k) ? k : null;
  };
  const hasDiff = el => Boolean(el?.dataset.diff && el.dataset.diff !== 'added');
  const isWaiting = card => Boolean(card?.dataset.wait === 'true' || card?.querySelector('[data-wait="true"]'));
  const normalizeText = s => String(s ?? '').replace(/\r\n?/g, '\n');
  const getCellText = (el, part = 'in') => normalizeText(el?.querySelector(part === 'out' ? 'form [name="output"]' : 'form [name="content"]')?.value ?? '');

  const managesPart = (el, part = 'in') => {
    const card = getCard(el, part);
    return Boolean(el && card && !hasDiff(el) && !card.classList.contains('collapsed') && !(part === 'out' && isWaiting(card)));
  };

  const typingBlocked = () => Boolean(document.activeElement?.closest(
    'input,textarea,select,[contenteditable],.monaco-editor,.cm-editor,#full_editor,.hk-overlay.open,#solveit-launcher.open,[role="dialog"],.uk-modal.uk-open,#craft-insert-preview-menu'
  ));

  const notifyErr = msg => {
    const d = document.createElement('div');
    d.textContent = String(msg || 'Request failed.');
    if (window.UIkit?.notification) window.UIkit.notification(d.innerHTML, {status: 'destructive', pos: 'bottom-right'});
    else console.error('craftMd:', msg);
  };

  const syncSaveState = key => {
    const {id, part} = parseKey(key);
    const card = getCard(getCellEl(id), part);
    if (!card) return;
    const st = failedSaves.has(key) ? 'error' : (pendingSaves.has(key) ? 'saving' : (dirtyIds.has(key) ? 'dirty' : ''));
    if (st) card.dataset.mdSave = st;
    else delete card.dataset.mdSave;
  };

  /* ── CM6 & Markdown bundle loader (shares single CM6 core with craftC2) ── */
  const buildFallbackStyles = cm => {
    if (cm.ghDarkStyle && cm.ghLightStyle) return cm;
    const t = cm.hl.tags;
    cm.ghDarkStyle = cm.lang.HighlightStyle.define([
      {tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#6a737d'},
      {tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.operator], color: '#f97583'},
      {tag: [t.string, t.special(t.string), t.docString], color: '#9ecbff'},
      {tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom, t.propertyName, t.attributeName, t.link, t.url], color: '#79b8ff'},
      {tag: [t.function(t.variableName), t.className, t.typeName, t.meta], color: '#b392f0'},
      {tag: [t.tagName], color: '#85e89d'},
      {tag: [t.invalid], color: '#fdaeb7', fontStyle: 'italic'},
    ]);
    cm.ghLightStyle = cm.lang.HighlightStyle.define([
      {tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#6a737d'},
      {tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.operator], color: '#d73a49'},
      {tag: [t.string, t.special(t.string), t.docString], color: '#032f62'},
      {tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom, t.propertyName, t.attributeName, t.link, t.url], color: '#005cc5'},
      {tag: [t.function(t.variableName), t.className, t.typeName, t.meta], color: '#6f42c1'},
      {tag: [t.tagName], color: '#22863a'},
      {tag: [t.invalid], color: '#cb2431', fontStyle: 'italic'},
    ]);
    cm.darkTheme = cm.view.EditorView.theme({}, {dark: true});
    cm.lightTheme = cm.view.EditorView.theme({}, {dark: false});
    return cm;
  };

  const loadCoreCM = () => window.__craftCM6LocalPromise ??= (async () => {
    const mod = await import(`${LOCAL_CM_BASE}/index.js`);
    return buildFallbackStyles({...mod, _source: 'local'});
  })();

  const loadMdCM = () => window.__craftCM6MdPromise ??= (async () => {
    const cm = buildFallbackStyles(await loadCoreCM());
    const local = cm._source === 'local';
    const [lm, lezerMd] = local
      ? await Promise.all([import(`${LOCAL_CM_BASE}/lang-markdown.js`), import(`${LOCAL_CM_BASE}/markdown.js`)])
      : await Promise.all([
          import(`https://esm.sh/@codemirror/lang-markdown@6.3.2?${CM_DEPS}`),
          import(`https://esm.sh/@lezer/markdown@1.8.1`),
        ]);
    const langCache = window.__craftCM6Langs ??= new Map();
    const mkLoader = (key, localPath, cdnUrl, mapFn) => async () => {
      const ck = `${cm._source || 'local'}:${key}`;
      if (langCache.has(ck)) return langCache.get(ck);
      const m = await import(local ? `${LOCAL_CM_BASE}/${localPath}` : cdnUrl);
      const ext = mapFn(m);
      langCache.set(ck, ext);
      return ext;
    };
    const LD = cm.lang.LanguageDescription;
    const codeLanguages = [
      LD.of({name: 'Python', alias: ['py', 'py3', 'python3'], load: async () => cm.python.python()}),
      LD.of({name: 'JavaScript', alias: ['js', 'jsx'], load: mkLoader('javascript', 'lang-javascript.js', `https://esm.sh/@codemirror/lang-javascript@6?${CM_DEPS}`, m => m.javascript({jsx: true}))}),
      LD.of({name: 'TypeScript', alias: ['ts', 'tsx'], load: mkLoader('typescript', 'lang-javascript.js', `https://esm.sh/@codemirror/lang-javascript@6?${CM_DEPS}`, m => m.javascript({typescript: true, jsx: true}))}),
      LD.of({name: 'HTML', alias: ['htm'], load: mkLoader('html', 'lang-html.js', `https://esm.sh/@codemirror/lang-html@6?${CM_DEPS}`, m => m.html())}),
      LD.of({name: 'CSS', alias: ['scss'], load: mkLoader('css', 'lang-css.js', `https://esm.sh/@codemirror/lang-css@6?${CM_DEPS}`, m => m.css())}),
      LD.of({name: 'JSON', alias: ['jsonc'], load: mkLoader('json', 'lang-json.js', `https://esm.sh/@codemirror/lang-json@6?${CM_DEPS}`, m => m.json())}),
      LD.of({name: 'SQL', alias: ['sqlite', 'postgres', 'postgresql', 'duckdb'], load: mkLoader('sql', 'lang-sql.js', `https://esm.sh/@codemirror/lang-sql@6?${CM_DEPS}`, m => m.sql())}),
      LD.of({name: 'XML', alias: ['svg'], load: mkLoader('xml', 'lang-xml.js', `https://esm.sh/@codemirror/lang-xml@6?${CM_DEPS}`, m => m.xml())}),
      LD.of({name: 'YAML', alias: ['yml'], load: mkLoader('yaml', 'lang-yaml.js', `https://esm.sh/@codemirror/lang-yaml@6?${CM_DEPS}`, m => m.yaml())}),
      LD.of({name: 'Rust', alias: ['rs'], load: mkLoader('rust', 'lang-rust.js', `https://esm.sh/@codemirror/lang-rust@6?${CM_DEPS}`, m => m.rust())}),
      LD.of({name: 'C++', alias: ['c', 'cpp', 'c++', 'cxx', 'h'], load: mkLoader('cpp', 'lang-cpp.js', `https://esm.sh/@codemirror/lang-cpp@6?${CM_DEPS}`, m => m.cpp())}),
      LD.of({name: 'Shell', alias: ['bash', 'sh', 'zsh', 'shell'], load: mkLoader('shell', 'mode-shell.js', `https://esm.sh/@codemirror/legacy-modes@6.5.1/mode/shell?${CM_DEPS}`, m => new cm.lang.LanguageSupport(cm.lang.StreamLanguage.define(m.shell)))}),
    ];
    const mdLangExt = lm.markdown({base: lm.markdownLanguage, codeLanguages});
    // Code-only highlight style so markdown prose tokens stay governed by our live-preview classes
    // while fenced code blocks still receive full GitHub Dark/Light syntax colors.
    const t = cm.hl.tags;
    const mdCodeDarkStyle = cm.lang.HighlightStyle.define([
      {tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#6a737d'},
      {tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.operator, t.compareOperator, t.logicOperator, t.arithmeticOperator, t.bitwiseOperator, t.updateOperator], color: '#f97583'},
      {tag: [t.string, t.special(t.string), t.docString], color: '#9ecbff'},
      {tag: [t.regexp], color: '#dbedff'},
      {tag: [t.self, t.escape, t.number, t.integer, t.float, t.bool, t.null, t.atom, t.constant(t.variableName), t.propertyName, t.attributeName, t.standard(t.variableName), t.special(t.variableName)], color: '#79b8ff'},
      {tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName)), t.className, t.definition(t.className), t.typeName, t.meta, t.annotation], color: '#b392f0'},
      {tag: [t.tagName], color: '#85e89d'},
      {tag: [t.invalid], color: '#fdaeb7', fontStyle: 'italic'},
    ]);
    const mdCodeLightStyle = cm.lang.HighlightStyle.define([
      {tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#6a737d'},
      {tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.operator, t.compareOperator, t.logicOperator, t.arithmeticOperator, t.bitwiseOperator, t.updateOperator], color: '#d73a49'},
      {tag: [t.string, t.special(t.string), t.docString], color: '#032f62'},
      {tag: [t.regexp], color: '#032f62'},
      {tag: [t.self, t.escape, t.number, t.integer, t.float, t.bool, t.null, t.atom, t.constant(t.variableName), t.propertyName, t.attributeName, t.standard(t.variableName), t.special(t.variableName)], color: '#005cc5'},
      {tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName)), t.className, t.definition(t.className), t.typeName, t.meta, t.annotation], color: '#6f42c1'},
      {tag: [t.tagName], color: '#22863a'},
      {tag: [t.invalid], color: '#cb2431', fontStyle: 'italic'},
    ]);
    const livePreviewExt = buildLivePreview(cm);
    return {cm, lm, lezerMd, mdLangExt, mdCodeDarkStyle, mdCodeLightStyle, livePreviewExt};
  })().catch(err => {
    window.__craftCM6MdPromise = null;
    console.error('craftMd: failed to load CodeMirror 6 markdown modules', err);
    throw err;
  });

  loadMdCM().then(b => { mdCache = b; cmCache = b.cm; }).catch(() => {});

  /* ── Obsidian-style Live Preview ViewPlugin ───────────────────────────── */
  function buildLivePreview(cm) {
    const {view, lang} = cm;
    const {Decoration, ViewPlugin, WidgetType} = view;

    const hideDeco = Decoration.replace({});
    const syntaxDimDeco = Decoration.mark({class: 'craft-md-syntax'});
    const urlDimDeco = Decoration.mark({class: 'craft-md-url'});
    const strongDeco = Decoration.mark({class: 'craft-md-strong'});
    const emDeco = Decoration.mark({class: 'craft-md-em'});
    const strikeDeco = Decoration.mark({class: 'craft-md-strike'});
    const inlineCodeDeco = Decoration.mark({class: 'craft-md-inline-code'});
    const solveitVarDeco = Decoration.mark({class: 'craft-md-var'});
    const solveitToolDeco = Decoration.mark({class: 'craft-md-tool'});
    const listNumDeco = Decoration.mark({class: 'craft-md-list-num'});
    const tableHeadDeco = Decoration.mark({class: 'craft-md-table-head'});
    const tableDelimDeco = Decoration.mark({class: 'craft-md-table-delim'});
    const quoteLineDeco = Decoration.line({class: 'craft-md-quote-line'});
    const taskDoneLineDeco = Decoration.line({class: 'craft-md-task-done'});
    const tableLineDeco = Decoration.line({class: 'craft-md-table-line'});
    const mathDeco = Decoration.mark({class: 'craft-md-math'});
    const headingLineDecos = [1, 2, 3, 4, 5, 6].map(n => Decoration.line({class: `craft-md-h craft-md-h${n}`}));

    class BulletWidget extends WidgetType {
      eq() { return true; }
      toDOM() {
        const s = document.createElement('span');
        s.className = 'craft-md-bullet';
        s.textContent = '•';
        return s;
      }
      ignoreEvent() { return false; }
    }
    const bulletDeco = Decoration.replace({widget: new BulletWidget()});

    class HrWidget extends WidgetType {
      eq() { return true; }
      toDOM() {
        const s = document.createElement('span');
        s.className = 'craft-md-hr';
        return s;
      }
      ignoreEvent() { return false; }
    }
    const hrDeco = Decoration.replace({widget: new HrWidget()});

    class FenceLabelWidget extends WidgetType {
      constructor(label) { super(); this.label = label; }
      eq(o) { return o.label === this.label; }
      toDOM() {
        const s = document.createElement('span');
        s.className = 'craft-md-fence-label';
        s.textContent = this.label || '';
        return s;
      }
      ignoreEvent() { return false; }
    }

    class CheckboxWidget extends WidgetType {
      constructor(checked, from, to) { super(); this.checked = checked; this.from = from; this.to = to; }
      eq(o) { return o.checked === this.checked && o.from === this.from && o.to === this.to; }
      toDOM(edView) {
        const inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.className = 'craft-md-task';
        inp.checked = this.checked;
        inp.tabIndex = -1;
        inp.addEventListener('mousedown', e => {
          e.preventDefault();
          e.stopPropagation();
          const cur = edView.state.doc.sliceString(this.from, this.to);
          if (!/^\[[ xX]\]$/.test(cur)) return;
          edView.dispatch({changes: {from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]'}});
        });
        return inp;
      }
      ignoreEvent() { return true; }
    }

    const buildDecos = edView => {
      const st = edView.state;
      const doc = st.doc;
      const sel = st.selection;
      const activeLines = new Set();
      for (const r of sel.ranges) {
        const l1 = doc.lineAt(r.from).number, l2 = doc.lineAt(r.to).number;
        for (let l = l1; l <= l2; l++) activeLines.add(l);
      }
      const selOverlaps = (from, to) => {
        for (const r of sel.ranges) if (r.from <= to && r.to >= from) return true;
        return false;
      };

      const decos = [];
      const replaced = [];
      const codeRanges = [];
      const quoteLines = new Set();
      const tableLines = new Set();
      const fenceLines = new Set();

      const canReplace = (from, to) => {
        if (from >= to || from < 0 || to > doc.length) return false;
        if (doc.lineAt(from).number !== doc.lineAt(to).number) return false;
        for (const [a, b] of replaced) if (from < b && to > a) return false;
        return true;
      };
      const addReplace = (from, to, deco) => {
        if (!canReplace(from, to)) return false;
        replaced.push([from, to]);
        decos.push(deco.range(from, to));
        return true;
      };
      const addMark = (from, to, deco) => {
        if (from < to && from >= 0 && to <= doc.length) decos.push(deco.range(from, to));
      };

      const tree = lang.syntaxTree(st);

      for (const {from: vFrom, to: vTo} of edView.visibleRanges) {
        const vLine1 = doc.lineAt(vFrom).number, vLine2 = doc.lineAt(vTo).number;
        tree.iterate({
          from: vFrom,
          to: vTo,
          enter(ref) {
            const name = ref.name;

            /* Headings */
            if (name.startsWith('ATXHeading')) {
              const lvl = Number(name.slice(10)) || 1;
              const line = doc.lineAt(ref.from);
              decos.push(headingLineDecos[Math.min(6, Math.max(1, lvl)) - 1].range(line.from));
              const mark = ref.node.getChild('HeaderMark');
              if (mark) {
                let end = mark.to;
                if (end < line.to && doc.sliceString(end, end + 1) === ' ') end++;
                if (!activeLines.has(line.number)) addReplace(mark.from, end, hideDeco);
                else addMark(mark.from, end, syntaxDimDeco);
              }
              return;
            }
            if (name === 'SetextHeading1' || name === 'SetextHeading2') {
              const lvl = name === 'SetextHeading1' ? 1 : 2;
              const mark = ref.node.getChild('HeaderMark');
              const endLine = mark ? doc.lineAt(mark.from).number - 1 : doc.lineAt(ref.to).number;
              const startLine = doc.lineAt(ref.from).number;
              for (let l = startLine; l <= endLine; l++) {
                decos.push(headingLineDecos[lvl - 1].range(doc.line(l).from));
              }
              if (mark) addMark(mark.from, mark.to, syntaxDimDeco);
              return;
            }

            /* Fenced code blocks */
            if (name === 'FencedCode') {
              codeRanges.push([ref.from, ref.to]);
              const firstLine = doc.lineAt(ref.from).number;
              const lastLine = doc.lineAt(ref.to).number;
              const infoNode = ref.node.getChild('CodeInfo');
              const langLabel = infoNode ? doc.sliceString(infoNode.from, infoNode.to).trim() : '';
              const lStart = Math.max(firstLine, vLine1), lEnd = Math.min(lastLine, vLine2);
              for (let l = lStart; l <= lEnd; l++) {
                const line = doc.line(l);
                const isFirst = l === firstLine;
                const isLast = l === lastLine && lastLine > firstLine && /^\s*(?:```+|~~~+)\s*$/.test(line.text);
                const hideFence = (isFirst || isLast) && !activeLines.has(l);
                let cls = 'craft-md-codeblock-line';
                if (isFirst) cls += ' craft-md-codeblock-first';
                if (l === lastLine) cls += ' craft-md-codeblock-last';
                if (hideFence) cls += ' craft-md-fence-hidden';
                decos.push(Decoration.line({class: cls}).range(line.from));
                if (isFirst || isLast) fenceLines.add(l);
                if (hideFence && line.from < line.to) {
                  addReplace(line.from, line.to, Decoration.replace({widget: new FenceLabelWidget(isFirst ? langLabel : '')}));
                } else if (isFirst || isLast) {
                  addMark(line.from, line.to, syntaxDimDeco);
                }
              }
              return;
            }

            /* Blockquotes */
            if (name === 'Blockquote') {
              const l1 = Math.max(doc.lineAt(ref.from).number, vLine1), l2 = Math.min(doc.lineAt(ref.to).number, vLine2);
              for (let l = l1; l <= l2; l++) {
                if (!quoteLines.has(l)) {
                  quoteLines.add(l);
                  decos.push(quoteLineDeco.range(doc.line(l).from));
                }
              }
              return;
            }
            if (name === 'QuoteMark') {
              const line = doc.lineAt(ref.from);
              let end = ref.to;
              if (end < line.to && doc.sliceString(end, end + 1) === ' ') end++;
              if (!activeLines.has(line.number)) addReplace(ref.from, end, hideDeco);
              else addMark(ref.from, end, syntaxDimDeco);
              return;
            }

            /* Horizontal rule */
            if (name === 'HorizontalRule') {
              const line = doc.lineAt(ref.from);
              if (!activeLines.has(line.number)) addReplace(ref.from, ref.to, hrDeco);
              else addMark(ref.from, ref.to, syntaxDimDeco);
              return;
            }

            /* Lists & Tasks */
            if (name === 'ListMark') {
              const line = doc.lineAt(ref.from);
              const parent = ref.node.parent;
              const task = parent?.getChild('Task');
              const taskMarker = task?.getChild('TaskMarker');
              if (taskMarker && doc.lineAt(taskMarker.from).number === line.number) {
                const txt = doc.sliceString(taskMarker.from, taskMarker.to);
                const checked = /^\[[xX]\]$/.test(txt);
                if (checked) decos.push(taskDoneLineDeco.range(line.from));
                if (!selOverlaps(ref.from, taskMarker.to)) {
                  addReplace(ref.from, taskMarker.to, Decoration.replace({widget: new CheckboxWidget(checked, taskMarker.from, taskMarker.to)}));
                } else {
                  addMark(ref.from, taskMarker.to, syntaxDimDeco);
                }
                return;
              }
              const markText = doc.sliceString(ref.from, ref.to);
              if (markText === '-' || markText === '*' || markText === '+') {
                if (!activeLines.has(line.number)) addReplace(ref.from, ref.to, bulletDeco);
                else addMark(ref.from, ref.to, syntaxDimDeco);
              } else {
                addMark(ref.from, ref.to, listNumDeco);
              }
              return;
            }

            /* Tables */
            if (name === 'Table') {
              const l1 = Math.max(doc.lineAt(ref.from).number, vLine1), l2 = Math.min(doc.lineAt(ref.to).number, vLine2);
              for (let l = l1; l <= l2; l++) {
                if (!tableLines.has(l)) {
                  tableLines.add(l);
                  decos.push(tableLineDeco.range(doc.line(l).from));
                }
              }
              return;
            }
            if (name === 'TableHeader') { addMark(ref.from, ref.to, tableHeadDeco); return; }
            if (name === 'TableDelimiter') { addMark(ref.from, ref.to, tableDelimDeco); return; }

            /* Inline emphasis & strikethrough */
            if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough') {
              const deco = name === 'StrongEmphasis' ? strongDeco : name === 'Emphasis' ? emDeco : strikeDeco;
              const markName = name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark';
              const active = selOverlaps(ref.from, ref.to);
              addMark(ref.from, ref.to, deco);
              for (let ch = ref.node.firstChild; ch; ch = ch.nextSibling) {
                if (ch.name === markName) {
                  if (!active) addReplace(ch.from, ch.to, hideDeco);
                  else addMark(ch.from, ch.to, syntaxDimDeco);
                }
              }
              return;
            }

            /* Inline code & Solveit $`var` / &`tool` tokens */
            if (name === 'InlineCode') {
              codeRanges.push([ref.from, ref.to]);
              const prevCh = ref.from > 0 ? doc.sliceString(ref.from - 1, ref.from) : '';
              const prev2 = ref.from > 1 ? doc.sliceString(ref.from - 2, ref.from - 1) : '';
              const isVar = prevCh === '$' && prev2 !== '$' && prev2 !== '\\';
              const isTool = prevCh === '&' && prev2 !== '\\';
              const spanFrom = (isVar || isTool) ? ref.from - 1 : ref.from;
              const active = selOverlaps(spanFrom, ref.to);
              const deco = isVar ? solveitVarDeco : isTool ? solveitToolDeco : inlineCodeDeco;
              addMark(spanFrom, ref.to, deco);
              for (let ch = ref.node.firstChild; ch; ch = ch.nextSibling) {
                if (ch.name === 'CodeMark') {
                  if (!active) addReplace(ch.from, ch.to, hideDeco);
                  else addMark(ch.from, ch.to, syntaxDimDeco);
                }
              }
              return;
            }

            /* Links: [label](url) */
            if (name === 'Link') {
              const marks = [];
              let urlNode = null;
              for (let ch = ref.node.firstChild; ch; ch = ch.nextSibling) {
                if (ch.name === 'LinkMark') marks.push(ch);
                else if (ch.name === 'URL') urlNode = ch;
              }
              const openBr = marks.find(m => doc.sliceString(m.from, m.to) === '[');
              const closeBr = marks.find(m => doc.sliceString(m.from, m.to) === ']');
              const url = urlNode ? doc.sliceString(urlNode.from, urlNode.to).trim() : '';
              const active = selOverlaps(ref.from, ref.to);
              if (openBr && closeBr) {
                const labelFrom = openBr.to, labelTo = closeBr.from;
                const linkAttrs = url ? {'data-href': url, title: `${url} (${isMac ? '⌘' : 'Ctrl'}+Click to open)`} : {};
                if (labelFrom < labelTo) addMark(labelFrom, labelTo, Decoration.mark({class: 'craft-md-link', attributes: linkAttrs}));
                if (!active) {
                  addReplace(openBr.from, openBr.to, hideDeco);
                  if (closeBr.from < ref.to) addReplace(closeBr.from, ref.to, hideDeco);
                } else {
                  addMark(openBr.from, openBr.to, syntaxDimDeco);
                  addMark(closeBr.from, closeBr.to, syntaxDimDeco);
                  if (urlNode) addMark(urlNode.from, urlNode.to, urlDimDeco);
                  for (const m of marks) if (m !== openBr && m !== closeBr) addMark(m.from, m.to, syntaxDimDeco);
                }
              }
              return;
            }

            /* Images: ![alt](url) */
            if (name === 'Image') {
              const active = selOverlaps(ref.from, ref.to);
              const marks = [];
              let urlNode = null;
              for (let ch = ref.node.firstChild; ch; ch = ch.nextSibling) {
                if (ch.name === 'LinkMark') marks.push(ch);
                else if (ch.name === 'URL') urlNode = ch;
              }
              const openBr = marks[0], closeBr = marks.find(m => doc.sliceString(m.from, m.to) === ']');
              const url = urlNode ? doc.sliceString(urlNode.from, urlNode.to).trim() : '';
              if (openBr && closeBr) {
                const labelFrom = openBr.to, labelTo = closeBr.from;
                if (labelFrom < labelTo) addMark(labelFrom, labelTo, Decoration.mark({class: 'craft-md-img-label', attributes: url ? {'data-href': url} : {}}));
                if (!active) {
                  addReplace(openBr.from, openBr.to, hideDeco);
                  if (closeBr.from < ref.to) addReplace(closeBr.from, ref.to, hideDeco);
                } else {
                  addMark(openBr.from, openBr.to, syntaxDimDeco);
                  if (urlNode) addMark(urlNode.from, urlNode.to, urlDimDeco);
                }
              }
              return;
            }

            /* Bare autolinks */
            if (name === 'URL' && ref.node.parent?.name !== 'Link' && ref.node.parent?.name !== 'Image') {
              const url = doc.sliceString(ref.from, ref.to).trim();
              addMark(ref.from, ref.to, Decoration.mark({class: 'craft-md-link', attributes: {'data-href': url, title: `${url} (${isMac ? '⌘' : 'Ctrl'}+Click to open)`}}));
              return;
            }
          },
        });
      }

      /* Secondary pass on visible non-code lines for Solveit #_msgid refs and LaTeX math */
      const inCode = (a, b) => codeRanges.some(([cf, ct]) => a < ct && b > cf);
      const tokenRe = /(#_[0-9a-f]{6,12})\b|(\$\$[^$\n]+\$\$|\\\[[^\n]+\\\]|\\\([^\n]+\\\))/g;
      for (const {from: vFrom, to: vTo} of edView.visibleRanges) {
        const l1 = doc.lineAt(vFrom).number, l2 = doc.lineAt(vTo).number;
        for (let l = l1; l <= l2; l++) {
          if (fenceLines.has(l)) continue;
          const line = doc.line(l);
          tokenRe.lastIndex = 0;
          let m;
          while ((m = tokenRe.exec(line.text))) {
            const mf = line.from + m.index, mt = mf + m[0].length;
            if (inCode(mf, mt)) continue;
            if (m[1]) {
              addMark(mf, mt, Decoration.mark({class: 'craft-md-msgref', attributes: {'data-href': m[1], title: `Jump to ${m[1]} (${isMac ? '⌘' : 'Ctrl'}+Click)`}}));
            } else if (m[2]) {
              addMark(mf, mt, mathDeco);
            }
          }
        }
      }

      return Decoration.set(decos, true);
    };

    const plugin = ViewPlugin.fromClass(class {
      constructor(edView) { this.decorations = buildDecos(edView); }
      update(u) {
        if (u.docChanged || u.selectionSet || u.viewportChanged || lang.syntaxTree(u.startState) !== lang.syntaxTree(u.state)) {
          this.decorations = buildDecos(u.view);
        }
      }
    }, {decorations: p => p.decorations});

    const linkClickExt = view.EditorView.domEventHandlers({
      mousedown(e) {
        if (!(isMac ? e.metaKey : e.ctrlKey) || e.button !== 0) return false;
        const target = e.target?.closest?.('[data-href]');
        const href = target?.getAttribute('data-href');
        if (!href) return false;
        e.preventDefault();
        e.stopPropagation();
        if (href.startsWith('#_')) {
          const dest = document.getElementById(href.slice(1));
          if (dest) {
            dest.scrollIntoView({behavior: 'smooth', block: 'center'});
            window.selectMsg?.(window.$(dest), {scroll: false});
          }
        } else if (/^(https?:\/\/|\/)/i.test(href)) {
          window.open(href, '_blank', 'noopener,noreferrer');
        }
        return true;
      },
    });

    return [plugin, linkClickExt];
  }

  /* ── Markdown formatting commands ─────────────────────────────────────── */
  function toggleWrap(v, mark) {
    const ml = mark.length;
    const doc = v.state.doc;
    const tr = v.state.changeByRange(r => {
      const before = r.from >= ml ? doc.sliceString(r.from - ml, r.from) : '';
      const after = r.to + ml <= doc.length ? doc.sliceString(r.to, r.to + ml) : '';
      if (before === mark && after === mark) {
        return {
          changes: [{from: r.from - ml, to: r.from, insert: ''}, {from: r.to, to: r.to + ml, insert: ''}],
          range: cmCache.state.EditorSelection.range(r.from - ml, r.to - ml),
        };
      }
      const inner = doc.sliceString(r.from, r.to);
      if (inner.length >= ml * 2 && inner.startsWith(mark) && inner.endsWith(mark)) {
        return {
          changes: {from: r.from, to: r.to, insert: inner.slice(ml, -ml)},
          range: cmCache.state.EditorSelection.range(r.from, r.to - ml * 2),
        };
      }
      return {
        changes: {from: r.from, to: r.to, insert: mark + inner + mark},
        range: cmCache.state.EditorSelection.range(r.from + ml, r.to + ml),
      };
    });
    v.dispatch(tr);
    return true;
  }

  function wrapLink(v) {
    const doc = v.state.doc;
    const tr = v.state.changeByRange(r => {
      const inner = doc.sliceString(r.from, r.to);
      if (/^https?:\/\/\S+$/.test(inner)) {
        const ins = `[](${inner})`;
        return {changes: {from: r.from, to: r.to, insert: ins}, range: cmCache.state.EditorSelection.cursor(r.from + 1)};
      }
      const ins = `[${inner}](url)`;
      return {
        changes: {from: r.from, to: r.to, insert: ins},
        range: cmCache.state.EditorSelection.range(r.from + inner.length + 3, r.from + inner.length + 6),
      };
    });
    v.dispatch(tr);
    return true;
  }

  /* ── Theme & extensions per cell kind ─────────────────────────────────── */
  function themeExtensions(bundle, kind) {
    const {cm, mdCodeDarkStyle, mdCodeLightStyle} = bundle;
    const dark = isDark();
    if (kind === 'raw') return [dark ? cm.darkTheme : cm.lightTheme];
    return [
      cm.lang.syntaxHighlighting(dark ? mdCodeDarkStyle : mdCodeLightStyle),
      dark ? cm.darkTheme : cm.lightTheme,
    ];
  }

  function buildExtensions(bundle, key, id, part, kind, comps) {
    const {cm, lm, mdLangExt, livePreviewExt} = bundle;
    const {state, view, lang, cmds, search} = cm;
    const {themeComp} = comps;
    const isOut = part === 'out';
    const isMd = kind !== 'raw';

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

    const jumpLastKey = isMac ? 'Ctrl-Shift-ArrowUp' : 'Mod-Shift-ArrowUp';
    const solveitKeys = state.Prec.high(view.keymap.of([
      {key: 'Shift-Enter', run: () => {
        if (isOut) exitCell(key);
        else if (kind === 'prompt') saveAndRun(id, 'shift-run');
        else saveAndAdvance(key);
        return true;
      }},
      {key: 'Mod-Enter', run: () => {
        if (!isOut && kind === 'prompt') saveAndRun(id, 'run');
        else exitCell(key);
        return true;
      }},
      {key: 'Alt-Enter', run: () => {
        if (isOut) return false;
        if (kind === 'prompt') saveAndRun(id, 'alt-run');
        else saveAndInsertBelow(key);
        return true;
      }},
      {key: 'Mod-Shift-Enter', run: () => {
        if (!isOut && kind === 'prompt') { saveAndRun(id, 'continue'); return true; }
        return false;
      }},
      {key: 'ArrowUp', run: v => !isOut && stepBoundary(id, v, true)},
      {key: 'ArrowDown', run: v => !isOut && stepBoundary(id, v, false)},
      {key: 'Ctrl-Shift--', run: v => { if (!isOut) splitCell(id, v, kind); return true; }},
      {key: 'Ctrl-Shift-_', run: v => { if (!isOut) splitCell(id, v, kind); return true; }},
      {key: 'Mod-Shift-j', run: v => { if (!isOut) switchCellType(id, v, 'code'); return true; }},
      {key: 'Mod-Shift-k', run: v => { if (!isOut && kind !== 'note') switchCellType(id, v, 'note'); return true; }},
      {key: 'Mod-Shift-l', run: v => { if (!isOut && kind !== 'prompt') switchCellType(id, v, 'prompt'); return true; }},
      {key: 'Mod-Shift-;', run: v => { if (!isOut && kind !== 'raw') switchCellType(id, v, 'raw'); return true; }},
      {key: 'Mod-Shift-d', run: () => { document.getElementById('brain-btn')?.click(); return true; }},
      {key: jumpLastKey, run: () => { jumpToLastCell(key); return true; }},
      {key: 'Shift-Escape', run: () => { exitCell(key); return true; }},
      {key: 'Escape', run: v => {
        if (search.searchPanelOpen(v.state)) return search.closeSearchPanel(v);
        if (v.state.selection.ranges.length > 1) return cmds.simplifySelection(v);
        exitCell(key);
        return true;
      }},
      ...(isMd ? [
        {key: 'Mod-b', run: v => toggleWrap(v, '**')},
        {key: 'Mod-i', run: v => toggleWrap(v, '*')},
        {key: 'Mod-e', run: v => toggleWrap(v, '`')},
        {key: 'Mod-k', run: v => wrapLink(v)},
        {key: 'Mod-Shift-x', run: v => toggleWrap(v, '~~')},
      ] : []),
    ]));

    const editorKeys = view.keymap.of([
      {key: 'Tab', run: cmds.indentWithTab.run, shift: cmds.indentWithTab.shift},
      {key: 'Mod-d', run: search.selectNextOccurrence, preventDefault: true},
      {key: 'Mod-Shift-b', run: search.selectSelectionMatches},
      {key: 'Alt-ArrowUp', run: cmds.moveLineUp},
      {key: 'Alt-ArrowDown', run: cmds.moveLineDown},
      {key: 'Shift-Alt-ArrowUp', run: cmds.copyLineUp},
      {key: 'Shift-Alt-ArrowDown', run: cmds.copyLineDown},
      {key: 'Mod-]', run: cmds.indentMore},
      {key: 'Mod-[', run: cmds.indentLess},
      {key: 'Mod-f', run: search.openSearchPanel},
      {key: 'Mod-h', run: search.openSearchPanel},
      {key: 'Mod-g', run: search.findNext},
      {key: 'Mod-Shift-g', run: search.findPrevious},
      {key: 'F3', run: search.findNext},
      {key: 'Shift-F3', run: search.findPrevious},
      ...(isMd ? lm.markdownKeymap : []),
      ...search.searchKeymap,
      ...cmds.historyKeymap,
      ...cmds.defaultKeymap,
    ]);

    const placeholderText = kind === 'raw' ? 'Raw text…' : (kind === 'output' ? 'Assistant response…' : (kind === 'prompt' ? 'Prompt…' : 'Note…'));

    const updateWatcher = view.EditorView.updateListener.of(u => {
      if (!u.docChanged) return;
      const el = getCellEl(id);
      const savedText = getCellText(el, part);
      if (u.state.doc.toString() !== savedText) dirtyIds.add(key);
      else dirtyIds.delete(key);
      syncSaveState(key);
    });

    const exts = [
      solveitKeys,
      editorKeys,
      themeComp.of(themeExtensions(bundle, kind)),
      autoSurroundExt,
      cmds.history(),
      state.EditorState.allowMultipleSelections.of(true),
      view.drawSelection(),
      view.dropCursor(),
      view.rectangularSelection(),
      view.crosshairCursor(),
      view.placeholder(placeholderText),
      view.EditorView.lineWrapping,
      lang.indentUnit.of('  '),
      search.search({top: false}),
      search.highlightSelectionMatches(),
      updateWatcher,
    ];

    if (isMd) {
      exts.push(mdLangExt, ...livePreviewExt);
    } else {
      exts.push(view.highlightActiveLine());
    }
    return exts;
  }

  /* ── Save, unmount, blur, run, split, type-switch ─────────────────────── */
  async function saveCell(key, content) {
    const {id, part} = parseKey(key);
    const el = getCellEl(id);
    if (!el) return true;
    const prev = getCellText(el, part);
    if (content === prev) {
      dirtyIds.delete(key);
      failedSaves.delete(key);
      syncSaveState(key);
      return pendingSaves.get(key) ? await pendingSaves.get(key) : true;
    }
    dirtyIds.add(key);
    failedSaves.delete(key);
    syncSaveState(key);
    const kid = document.getElementById('kid')?.value || '';
    const p = (async () => {
      let ok = false;
      if (part === 'out') {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        try {
          const resp = await fetch('/upsert_msg_', {
            method: 'POST',
            headers: {'HX-Request': 'true'},
            body: new URLSearchParams({kid, id_: id, msg_type: 'prompt', is_input: '0', content, cancel: 'true'}),
            signal: ctrl.signal,
          });
          ok = resp.ok;
        } catch (err) {
          console.error('craftMd: output save failed', err);
          ok = false;
        } finally {
          clearTimeout(timer);
          if (pendingSaves.get(key) === p) pendingSaves.delete(key);
        }
      } else {
        let resolveReq;
        const statusP = new Promise(r => { resolveReq = r; });
        const waiters = saveWaiters.get(key) || [];
        waiters.push(resolveReq);
        saveWaiters.set(key, waiters);
        try {
          const ajaxP = window.htmx.ajax('POST', '/set_contents_', {
            source: '#kid',
            swap: 'none',
            values: {kid, id_: '_' + id, ids: id, contents: JSON.stringify({[id]: content})},
          }).then(() => statusP).catch(() => false);
          const timeoutP = new Promise(r => setTimeout(() => r(false), 8000));
          ok = Boolean(await Promise.race([ajaxP, timeoutP]));
        } catch (err) {
          console.error('craftMd: save failed', err);
          ok = false;
        } finally {
          const list = saveWaiters.get(key);
          if (list) {
            const i = list.indexOf(resolveReq);
            if (i >= 0) list.splice(i, 1);
            if (!list.length) saveWaiters.delete(key);
          }
          if (pendingSaves.get(key) === p) pendingSaves.delete(key);
        }
      }
      if (ok) {
        failedSaves.delete(key);
        const curEl = getCellEl(id);
        const inp = curEl?.querySelector(part === 'out' ? 'form [name="output"]' : 'form [name="content"]');
        if (inp && normalizeText(inp.value) === prev) inp.value = content;
        const curView = views.get(key)?.view;
        if (!curView || curView.state.doc.toString() === content) dirtyIds.delete(key);
      } else {
        failedSaves.add(key);
        notifyErr(part === 'out' ? 'Could not save assistant response — changes kept in editor.' : 'Could not save cell edit — changes kept in editor.');
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
    if (!rec) return;
    const {id, part} = rec;
    const docText = rec.view.state.doc.toString();
    states.set(key, {state: rec.view.state, kind: rec.kind});
    const el = getCellEl(id);
    const card = getCard(el, part);
    if (part === 'in' && rec.kind === 'raw') {
      const codeEl = card?.querySelector('.msg-body .msg-content pre code');
      if (codeEl && codeEl.textContent !== docText) codeEl.textContent = docText;
    }
    rec.view.destroy();
    rec.host.remove();
    views.delete(key);
    card?.classList.remove('craft-md-mounted');
    if (card) delete card.dataset.mdEditing;
    if (part === 'in' && el) delete el.dataset.mdEditing;
    if (activeKey === key) activeKey = null;
  }

  async function onCellBlur(key) {
    const rec = views.get(key);
    if (!rec) return;
    const {id, part} = rec;
    const el = getCellEl(id), card = getCard(el, part);
    if (card) delete card.dataset.mdEditing;
    if (part === 'in' && el) delete el.dataset.mdEditing;
    if (activeKey === key) activeKey = null;
    const content = rec.view.state.doc.toString();
    states.set(key, {state: rec.view.state, kind: rec.kind});
    const saved = await saveCell(key, content);
    const cur = views.get(key);
    if (!cur || cur.view.hasFocus || activeKey === key) return;
    if (!saved || dirtyIds.has(key)) return;
    unmountCell(key);
  }

  async function exitCell(key) {
    if (!key) return;
    const rec = views.get(key);
    const {id} = parseKey(key);
    const el = getCellEl(id);
    if (rec) {
      rec.view.contentDOM.blur();
      if (el) window.selectMsg?.(window.$(el), {scroll: false});
      await onCellBlur(key);
    }
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }

  async function saveAndAdvance(key) {
    const {id} = parseKey(key);
    const el = getCellEl(id);
    const next = el ? window.adjacentMsg?.(window.$(el), false) : null;
    await exitCell(key);
    if (next?.length) window.selectMsg?.(next);
  }

  async function saveAndInsertBelow(key) {
    const {id} = parseKey(key);
    const el = getCellEl(id);
    await exitCell(key);
    if (el) {
      window.selectMsg?.(window.$(el), {scroll: false});
      window.solveitHotkeys?.run?.('si-b');
    }
  }

  async function saveAndRun(id, cmd) {
    const key = makeKey(id, 'in');
    const rec = views.get(key);
    const el = getCellEl(id);
    if (!rec || !el) return;
    const content = rec.view.state.doc.toString();
    const next = cmd === 'shift-run' ? window.adjacentMsg?.(window.$(el), false) : null;
    const after = cmd === 'alt-run' ? (window.sectionTail?.(el) || '') : '';
    states.set(key, {state: rec.view.state, kind: rec.kind});
    const saved = await saveCell(key, content);
    if (!saved) return;
    const card = getCard(el, 'in');
    if (card) delete card.dataset.mdEditing;
    delete el.dataset.mdEditing;
    if (activeKey === key) activeKey = null;
    rec.view.contentDOM.blur();
    if (cmd === 'shift-run' && next?.length) window.selectMsg?.(next);
    else window.selectMsg?.(window.$(el), {scroll: false});
    const cur = views.get(key);
    if (cur && !cur.view.hasFocus && activeKey !== key && !dirtyIds.has(key)) unmountCell(key);
    const kid = document.getElementById('kid')?.value || '';
    const runCmd = cmd === 'continue' ? 'run' : cmd;
    try {
      await window.htmx.ajax('POST', '/add_runq_', {
        source: '#kid',
        swap: 'none',
        values: {kid, id_: '_' + id, ids: '_' + id, cmd: runCmd, after},
      });
      if (cmd === 'continue') {
        await window.htmx.ajax('POST', '/continue_prompt_', {
          source: '#kid',
          swap: 'none',
          values: {kid, id_: '_' + id, ids: '_' + id},
        });
      }
      schedule();
    } catch (err) {
      console.error('craftMd: run failed', err);
      notifyErr('Prompt saved, but could not start the run.');
    }
  }

  async function splitCell(id, v, kind) {
    const key = makeKey(id, 'in');
    const kid = document.getElementById('kid')?.value || '';
    const content = v.state.doc.toString();
    const linenos = [...new Set(v.state.selection.ranges.map(r => v.state.doc.lineAt(r.from).number))];
    try {
      await window.htmx.ajax('POST', '/split_at_', {
        source: '#kid',
        swap: 'none',
        values: {content, linenos: JSON.stringify(linenos), id_: id, kid, msg_type: kind, is_input: '1'},
      });
      dirtyIds.delete(key);
      failedSaves.delete(key);
      syncSaveState(key);
      unmountCell(key);
    } catch (err) {
      notifyErr('Could not split cell.');
      console.error('craftMd: split failed', err);
    }
  }

  async function switchCellType(id, v, mtyp) {
    const key = makeKey(id, 'in');
    const content = v.state.doc.toString();
    const sel = v.state.selection.main;
    const selSpec = {anchor: sel.anchor, head: sel.head};
    const saved = await saveCell(key, content);
    if (!saved) return;
    unmountCell(key);
    states.delete(key);
    const el = getCellEl(id);
    if (el) window.selectMsg?.(window.$(el), {scroll: false});
    const kid = document.getElementById('kid')?.value || '';
    try {
      await window.htmx.ajax('POST', '/set_mtyp_', {
        source: '#kid',
        swap: 'none',
        values: {kid, id_: '_' + id, ids: '_' + id, mtyp},
      });
      for (let i = 0; i < 60; i++) {
        const curEl = getCellEl(id);
        const curType = curEl?.querySelector(':scope > .card-in')?.dataset.mtype;
        if (curType === mtyp) {
          if (mtyp === 'code') {
            window.craftC2?.add?.(id);
            window.craftC2?.edit?.(id, selSpec);
          } else {
            openCell(id, selSpec, 'in');
          }
          return;
        }
        await new Promise(r => setTimeout(r, 40));
      }
    } catch (err) {
      notifyErr('Could not change cell type.');
      console.error('craftMd: set_mtyp failed', err);
    }
  }

  function stepBoundary(id, v, up) {
    if (!cmCache) return false;
    if (v.state.selection.ranges.length !== 1 || !v.state.selection.main.empty) return false;
    const head = v.state.selection.main.head;
    const doc = v.state.doc;
    const edgePos = up ? 0 : doc.length;
    const cHead = v.coordsAtPos(head), cEdge = v.coordsAtPos(edgePos);
    const atEdge = cHead && cEdge ? Math.abs(cHead.top - cEdge.top) <= 3 : doc.lineAt(head).number === (up ? 1 : doc.lines);
    if (!atEdge) return false;
    const el = getCellEl(id);
    const next = el && window.adjacentMsg?.(window.$(el), up);
    const nextEl = next?.[0];
    if (!nextEl || nextEl === el) return false;
    const key = makeKey(id, 'in');
    const content = doc.toString();
    const rec = views.get(key);
    if (rec) states.set(key, {state: v.state, kind: rec.kind});
    const card = getCard(el, 'in');
    if (card) delete card.dataset.mdEditing;
    delete el.dataset.mdEditing;
    if (activeKey === key) activeKey = null;
    v.contentDOM.blur();
    saveCell(key, content).then(ok => {
      const cur = views.get(key);
      if (ok && cur && !cur.view.hasFocus && activeKey !== key && !dirtyIds.has(key)) unmountCell(key);
    });
    const nextId = normId(nextEl.id);
    const edgeSel = up ? {toEnd: true} : {anchor: 0, head: 0};
    if (managesPart(nextEl, 'in')) {
      nextEl.scrollIntoView({block: 'nearest'});
      openCell(nextId, edgeSel, 'in');
    } else if (window.craftC2?.manages?.(nextId)) {
      nextEl.scrollIntoView({block: 'nearest'});
      window.craftC2.edit(nextId, edgeSel);
    } else {
      window.selectMsg?.(next);
    }
    return true;
  }

  async function jumpToLastCell(key) {
    await exitCell(key);
    const all = [...document.querySelectorAll('#dialog-container > .editable')].filter(e => !e.hidden && getComputedStyle(e).display !== 'none');
    const last = all[all.length - 1];
    if (!last) return;
    const lastId = normId(last.id);
    if (managesPart(last, 'in')) {
      last.scrollIntoView({block: 'nearest'});
      openCell(lastId, {toEnd: true}, 'in');
    } else if (window.craftC2?.manages?.(lastId)) {
      last.scrollIntoView({block: 'nearest'});
      window.craftC2.edit(lastId, {toEnd: true});
    } else {
      last.querySelector('div[hx-post^="/editor_"]')?.click();
    }
  }

  function openInMonaco(id, rawPart = 'in') {
    const cid = normId(id);
    const part = partOf(rawPart);
    const key = makeKey(cid, part);
    const el = getCellEl(cid);
    const rec = views.get(key);
    const sel = part === 'out' ? ':scope > .card-out [hx-post="/editor_"]' : ':scope > .card-in [hx-post="/editor_"]';
    const proceed = () => {
      bypassMonacoKey = key;
      el?.querySelector(sel)?.click();
      setTimeout(() => { if (bypassMonacoKey === key) bypassMonacoKey = null; }, 500);
    };
    if (rec) {
      saveCell(key, rec.view.state.doc.toString()).then(ok => {
        if (!ok) return;
        unmountCell(key);
        proceed();
      });
    } else {
      proceed();
    }
  }

  /* ── Click-to-caret placement (exact for raw, smart anchor for rendered prose) ── */
  const offsetIn = (root, node, offset) => {
    if (!root || !node || !root.contains(node)) return null;
    try {
      const r = document.createRange();
      r.selectNodeContents(root);
      r.setEnd(node, offset);
      return r.toString().length;
    } catch { return null; }
  };

  function captureCaretHint(contentEl, x, y) {
    let node = null, offset = 0;
    try {
      if (document.caretPositionFromPoint) {
        const cp = document.caretPositionFromPoint(x, y);
        if (cp) { node = cp.offsetNode; offset = cp.offset; }
      } else if (document.caretRangeFromPoint) {
        const cr = document.caretRangeFromPoint(x, y);
        if (cr) { node = cr.startContainer; offset = cr.startOffset; }
      }
    } catch {}
    if (!node || !contentEl.contains(node) || node.nodeType !== Node.TEXT_NODE) return null;
    const txt = node.nodeValue || '';
    const before = txt.slice(Math.max(0, offset - 28), offset);
    const after = txt.slice(offset, Math.min(txt.length, offset + 28));
    const plainOffset = offsetIn(contentEl, node, offset);
    const plainTotal = (contentEl.textContent || '').length || 1;
    return {before, after, ratio: plainOffset != null ? plainOffset / plainTotal : null};
  }

  function resolveCaretHint(docText, hint) {
    if (!hint || !docText) return null;
    const est = hint.ratio != null ? Math.round(hint.ratio * docText.length) : 0;
    const bestIndex = (needle, addOffset) => {
      if (!needle || needle.length < 2) return null;
      let idx = docText.indexOf(needle), best = -1, bestDist = Infinity;
      while (idx >= 0) {
        const pos = idx + addOffset;
        const d = Math.abs(pos - est);
        if (d < bestDist) { bestDist = d; best = pos; }
        idx = docText.indexOf(needle, idx + 1);
      }
      return best >= 0 ? best : null;
    };
    const both = (hint.before + hint.after).trim();
    if (both.length >= 4) {
      const leadTrim = (hint.before + hint.after).length - (hint.before + hint.after).trimStart().length;
      const hit = bestIndex(both, Math.max(0, hint.before.length - leadTrim));
      if (hit != null) return hit;
    }
    const bTrim = hint.before.trimStart();
    if (bTrim.length >= 3) {
      const hit = bestIndex(bTrim, bTrim.length);
      if (hit != null) return hit;
    }
    const aTrim = hint.after.trimEnd();
    if (aTrim.length >= 3) {
      const hit = bestIndex(aTrim, 0);
      if (hit != null) return hit;
    }
    return null;
  }

  function applySelection(v, selSpec) {
    const len = v.state.doc.length;
    const clamp = n => Math.max(0, Math.min(len, n));
    if (selSpec?.anchor != null) {
      const anchor = clamp(selSpec.anchor);
      const head = clamp(selSpec.head ?? anchor);
      v.dispatch({selection: {anchor, head}});
    } else if (selSpec?.caretHint) {
      const matched = resolveCaretHint(v.state.doc.toString(), selSpec.caretHint);
      if (matched != null) {
        v.dispatch({selection: {anchor: clamp(matched)}});
      } else if (selSpec.coords) {
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

  function syncFindBoxToView(v) {
    if (!cmCache) return;
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
      const sq = new cmCache.search.SearchQuery({search: q, regexp: isRegex, caseSensitive, replace});
      v.dispatch({effects: cmCache.search.setSearchQuery.of(sq)});
      cmCache.search.openSearchPanel(v);
    } catch {}
  }

  /* ── Mount & open cell ────────────────────────────────────────────────── */
  async function openCell(rawId, selSpec = null, rawPart = 'in') {
    const id = normId(rawId);
    const part = partOf(rawPart);
    const key = makeKey(id, part);
    if (destroyed || !id) return false;
    const bundle = mdCache || await loadMdCM();
    mdCache = bundle; cmCache = bundle.cm;
    if (destroyed) return false;
    const el = getCellEl(id), card = getCard(el, part), kind = getKind(el, part);
    if (!el || !card || !kind || !managesPart(el, part)) return false;
    const body = card.querySelector('.msg-body'), contentEl = body?.querySelector('.msg-content');
    if (!body || !contentEl) return false;

    window.selectMsg?.(window.$(el), {scroll: false});
    const text = getCellText(el, part);
    let rec = views.get(key);
    if (rec && rec.kind === kind) {
      if (!body.contains(rec.host)) { contentEl.after(rec.host); card.classList.add('craft-md-mounted'); }
      if (rec.view.state.doc.toString() !== text && !pendingSaves.has(key) && !dirtyIds.has(key)) {
        rec.view.dispatch({changes: {from: 0, to: rec.view.state.doc.length, insert: text}});
      }
      if (selSpec) applySelection(rec.view, selSpec);
      activeKey = key;
      card.dataset.mdEditing = 'true';
      if (part === 'in') el.dataset.mdEditing = 'true';
      syncFindBoxToView(rec.view);
      rec.view.contentDOM.focus({preventScroll: true});
      return true;
    }
    if (rec) unmountCell(key);

    const themeComp = new bundle.cm.state.Compartment();
    const comps = {themeComp};
    const prev = states.get(key);
    const reusePrev = prev && prev.kind === kind && prev.state.doc.toString() === text && prev.state._mdComps;
    const edState = reusePrev
      ? prev.state
      : bundle.cm.state.EditorState.create({doc: text, extensions: buildExtensions(bundle, key, id, part, kind, comps)});
    const activeComps = reusePrev ? prev.state._mdComps : comps;
    edState._mdComps = activeComps;

    const host = document.createElement('div');
    host.className = `craft-md-host craft-md-${kind} ${kind === 'raw' ? 'craft-md-mono' : 'craft-md-prose'}`;
    contentEl.after(host);
    card.classList.add('craft-md-mounted');
    card.dataset.mdEditing = 'true';
    if (part === 'in') el.dataset.mdEditing = 'true';

    const v = new bundle.cm.view.EditorView({state: edState, parent: host});
    host.addEventListener('keydown', e => { e.stopPropagation(); });
    host.addEventListener('focusin', () => {
      activeKey = key;
      const curEl = getCellEl(id), curCard = getCard(curEl, part);
      if (curCard) curCard.dataset.mdEditing = 'true';
      if (part === 'in' && curEl) curEl.dataset.mdEditing = 'true';
    });
    host.addEventListener('focusout', () => {
      requestAnimationFrame(() => {
        if (destroyed) return;
        const ae = document.activeElement;
        if (host.contains(ae) || ae?.closest?.('.cm-tooltip')) return;
        onCellBlur(key);
      });
    });

    rec = {view: v, host, id, part, kind, ...activeComps};
    views.set(key, rec);
    activeKey = key;
    if (reusePrev) v.dispatch({effects: activeComps.themeComp.reconfigure(themeExtensions(bundle, kind))});
    applySelection(v, selSpec || (reusePrev ? null : {toEnd: true}));
    syncFindBoxToView(v);
    v.contentDOM.focus({preventScroll: true});
    return true;
  }

  /* ── DOM event handlers ───────────────────────────────────────────────── */
  const onMouseDown = e => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('a, button, summary, input, select, textarea, label, [role="button"], .craft-md-host, .craft-c2-host, .copy-wrap > button')) return;
    const body = e.target.closest?.('#dialog-container > .editable > .card-in:is([data-mtype="note"],[data-mtype="prompt"],[data-mtype="raw"]) > .msg-body');
    const content = body?.querySelector('.msg-content');
    if (!content) return;
    const el = body.closest('.editable');
    if (!managesPart(el, 'in')) return;
    const kind = getKind(el, 'in');
    pendingPointer = {
      id: normId(el.id),
      kind,
      x: e.clientX,
      y: e.clientY,
      codeEl: kind === 'raw' ? content.querySelector('pre code') : null,
      caretHint: kind !== 'raw' ? captureCaretHint(content, e.clientX, e.clientY) : null,
    };
  };

  const onMouseUp = e => {
    if (!pendingPointer) return;
    const p = pendingPointer;
    pendingPointer = null;
    const sel = window.getSelection();
    if (p.kind === 'raw') {
      const anchor = offsetIn(p.codeEl, sel?.anchorNode, sel?.anchorOffset);
      const head = offsetIn(p.codeEl, sel?.focusNode, sel?.focusOffset);
      if (anchor != null) sel?.removeAllRanges();
      openCell(p.id, anchor != null ? {anchor, head: head ?? anchor} : {coords: {x: e.clientX, y: e.clientY}}, 'in');
      return;
    }
    const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (moved > 5 && sel && !sel.isCollapsed) return;
    openCell(p.id, {caretHint: p.caretHint, coords: {x: e.clientX, y: e.clientY}}, 'in');
  };

  const onClick = e => {
    const edit = e.target.closest?.('.card-in:is([data-mtype="note"],[data-mtype="prompt"],[data-mtype="raw"]) [hx-post="/editor_"], .card-out[data-mtype="prompt"] [hx-post="/editor_"]');
    if (!edit) return;
    const card = edit.closest('.msg-card');
    const part = card?.classList.contains('card-out') ? 'out' : 'in';
    const el = edit.closest('#dialog-container > .editable[id]');
    const id = normId(el?.id);
    if (!id) return;
    const key = makeKey(id, part);
    if (bypassMonacoKey === key) { bypassMonacoKey = null; return; }
    if (!managesPart(el, part)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openCell(id, null, part);
  };

  const onKeyDown = e => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (typingBlocked()) return;
    const el = document.querySelector('#dialog-container > .editable[data-sm="primary"]');
    if (!managesPart(el, 'in')) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    openCell(normId(el.id), null, 'in');
  };

  const sync = () => {
    frame = null;
    for (const [key, rec] of [...views]) {
      const el = getCellEl(rec.id), card = getCard(el, rec.part), kind = getKind(el, rec.part);
      if (!el || !card || !kind || kind !== rec.kind || hasDiff(el) || (rec.part === 'out' && isWaiting(card))) {
        rec.view.destroy();
        views.delete(key);
        dirtyIds.delete(key);
        failedSaves.delete(key);
        syncSaveState(key);
        if (activeKey === key) activeKey = null;
        continue;
      }
      const body = card.querySelector('.msg-body'), contentEl = body?.querySelector('.msg-content');
      if (body && contentEl && !body.contains(rec.host)) {
        contentEl.after(rec.host);
        card.classList.add('craft-md-mounted');
        if (activeKey === key) {
          card.dataset.mdEditing = 'true';
          if (rec.part === 'in') el.dataset.mdEditing = 'true';
          rec.view.contentDOM.focus({preventScroll: true});
        }
      }
      syncSaveState(key);
    }
  };
  const schedule = () => { if (frame == null) frame = requestAnimationFrame(sync); };

  const before = ({detail: {ctx} = {}}) => {
    const request = ctx?.request, body = request?.body;
    if (!body?.get || request.method !== 'POST') return;
    const pathname = new URL(request.action, location.href).pathname;
    if (pathname === '/set_contents_') {
      const id = normId(body.get('ids'));
      const key = id ? makeKey(id, 'in') : '';
      if (key && saveWaiters.has(key)) requests.set(ctx, {kind: 'save', key});
    }
  };

  const after = ({detail: {ctx} = {}}) => {
    const rec = ctx && requests.get(ctx);
    if (!rec || rec.kind !== 'save') return;
    const ok = Boolean(ctx.response && ctx.response.status >= 200 && ctx.response.status < 300);
    const waiters = saveWaiters.get(rec.key);
    const fn = waiters?.shift();
    if (waiters && !waiters.length) saveWaiters.delete(rec.key);
    fn?.(ok);
  };

  const onThemeChange = () => {
    if (!mdCache) return;
    for (const rec of views.values()) {
      rec.view.dispatch({effects: rec.themeComp.reconfigure(themeExtensions(mdCache, rec.kind))});
    }
  };

  const onBeforeUnload = e => {
    if (!dirtyIds.size) return;
    e.preventDefault();
    e.returnValue = '';
  };

  const origFollowRename = window.followRename;
  if (typeof origFollowRename === 'function') {
    window.followRename = async function(url) {
      for (const key of [...dirtyIds]) {
        const rec = views.get(key);
        const content = rec ? rec.view.state.doc.toString() : states.get(key)?.state.doc.toString();
        if (content != null && !(await saveCell(key, content))) {
          notifyErr('Could not save edit before reopening renamed dialog.');
          return;
        }
      }
      return origFollowRename.call(this, url);
    };
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.getElementById('dialog-container'), {childList: true, subtree: true, attributes: true, attributeFilter: ['data-diff', 'data-mtype', 'data-wait']});
  document.addEventListener('click', onClick, true);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('uk-theme-switcher:change', onThemeChange);
  window.addEventListener('beforeunload', onBeforeUnload);
  const sep = window.htmx?.config.metaCharacter || ':';
  const configEvent = ['htmx', 'config', 'request'].join(sep), afterEvent = ['htmx', 'after', 'request'].join(sep);
  document.addEventListener(configEvent, before);
  document.addEventListener(afterEvent, after);

  window.craftMd = {
    manages: (id, part = 'in') => managesPart(getCellEl(id), partOf(part)),
    edit: (id, opts, part = 'in') => openCell(id, opts, part),
    editOutput: (id, opts) => openCell(id, opts, 'out'),
    exit: (id, part) => exitCell(id ? (String(id).includes(':') ? String(id) : makeKey(id, part || 'in')) : activeKey),
    openInMonaco,
    active: () => activeKey,
    dirty: () => [...dirtyIds],
    source: () => cmCache?._source || 'pending',
    disable() {
      destroyed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('uk-theme-switcher:change', onThemeChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener(configEvent, before);
      document.removeEventListener(afterEvent, after);
      if (typeof origFollowRename === 'function') window.followRename = origFollowRename;
      for (const key of [...views.keys()]) unmountCell(key);
      views.clear(); states.clear(); pendingSaves.clear(); dirtyIds.clear(); failedSaves.clear(); saveWaiters.clear();
      delete window.craftMd;
    },
  };
})();
