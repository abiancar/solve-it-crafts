/* %% nbs/craft/11_markdown_editor.ipynb #65ff7306 */
(() => { /* iife:craftMd */
/* #65ff7306 */
window.craftInlineNote?.disable?.();
  window.craftInlineText?.disable?.();
  window.craftMd?.disable?.();
  const CORE = window.__craftCMCore;
  if (!CORE?.features?.isEnabled?.('markdown-editor')) return;
  const {SOLVEIT, LOCAL_CM_BASE, CM_DEPS, isMac, isDark, normId, getCellEl, normalizeText} = CORE;
  if (!document.querySelector(SOLVEIT.sel.dialog)) return;
  const CARD_IN_SEL = `${SOLVEIT.sel.cardIn}:is([data-mtype="note"],[data-mtype="prompt"],[data-mtype="raw"])`;
  const CARD_OUT_SEL = `${SOLVEIT.sel.cardOut}[data-mtype="prompt"]`;
  const TEXT_TYPES = new Set(['note', 'prompt', 'raw']);
  const SURROUND_PAIRS = {'(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`', '*': '*', '_': '_', '~': '~'};

  let cmCache = null, mdCache = null;

  const partOf = p => p === 'out' ? 'out' : 'in';
  const makeKey = (id, part = 'in') => `${normId(id)}:${partOf(part)}`;
  const parseKey = k => {
    const s = String(k || '');
    const i = s.lastIndexOf(':');
    return i >= 0 ? {id: normId(s.slice(0, i)), part: partOf(s.slice(i + 1))} : {id: normId(s), part: 'in'};
  };
  const getCard = (el, part = 'in') => el?.querySelector(part === 'out' ? CARD_OUT_SEL : CARD_IN_SEL) || null;
  const getKind = (el, part = 'in') => {
    if (part === 'out') return getCard(el, 'out') ? 'output' : null;
    const k = getCard(el, 'in')?.dataset.mtype;
    return TEXT_TYPES.has(k) ? k : null;
  };
  const hasDiff = el => Boolean(el?.dataset.diff && el.dataset.diff !== 'added');
  const isWaiting = card => Boolean(card?.dataset.wait === 'true' || card?.querySelector('[data-wait="true"]'));
  const getCellText = (el, part = 'in') => normalizeText(el?.querySelector(part === 'out' ? 'form [name="output"]' : 'form [name="content"]')?.value ?? '');

  const managesPart = (el, part = 'in') => {
    const card = getCard(el, part);
    return Boolean(el && card && !hasDiff(el) && !card.classList.contains('collapsed') && !(part === 'out' && isWaiting(card)));
  };

  const typingBlocked = () => CORE.typingBlocked('.cm-editor,#craft-insert-preview-menu');

    const notifyErr = msg => CORE.notifyErr(msg, 'craftMd');

  const ed = CORE.createInlineEditor({
    tag: 'craftMd',
    mountedCls: 'craft-md-mounted',
    keyToId: k => parseKey(k).id,
    idToInputKey: id => makeKey(id, 'in'),
    normValue: normalizeText,
    getCard: (el, key) => getCard(el, parseKey(key).part),
    getText: (el, key) => getCellText(el, parseKey(key).part),
    getInput: (el, key) => el?.querySelector(parseKey(key).part === 'out' ? 'form [name="output"]' : 'form [name="content"]'),
    saveState: (m, k, rec) => m.set(k, {state: rec.view.state, kind: rec.kind}),
    getStateDoc: st => st.state.doc.toString(),
    applySaveState: (key, st) => {
      const {id, part} = parseKey(key);
      const card = getCard(getCellEl(id), part);
      if (!card) return;
      if (st) card.dataset.mdSave = st;
      else delete card.dataset.mdSave;
    },
    setEditing: (key, on, el, card) => {
      const {part} = parseKey(key);
      if (card) { if (on) card.dataset.mdEditing = 'true'; else delete card.dataset.mdEditing; }
      if (part === 'in' && el) { if (on) el.dataset.mdEditing = 'true'; else delete el.dataset.mdEditing; }
    },
    persistSave: async (key, content, waitersMap) => {
      const {id, part} = parseKey(key);
      if (part !== 'out') return CORE.saveInputContents({id, content, waitersMap, key, tag: 'craftMd'});
      try {
        await CORE.htmxPost(SOLVEIT.api.upsertMsg, {id_: id, msg_type: 'prompt', is_input: '0', content, cancel: 'true'});
        return true;
      } catch (err) {
        console.error('craftMd: output save failed', err);
        return false;
      }
    },
    saveFailMsg: key => parseKey(key).part === 'out'
      ? 'Could not save assistant response — changes kept in editor.'
      : 'Could not save cell edit — changes kept in editor.',
    beforeUnmount: (_key, rec) => {
      if (!rec || rec.part !== 'in' || rec.kind !== 'raw') return;
      const docText = rec.view.state.doc.toString();
      const codeEl = getCard(getCellEl(rec.id), 'in')?.querySelector(`${SOLVEIT.sel.msgBody} ${SOLVEIT.sel.msgContent} pre code`);
      if (codeEl && codeEl.textContent !== docText) codeEl.textContent = docText;
    },
    isViewValid: (_key, rec, el, card) => {
      const kind = getKind(el, rec.part);
      return Boolean(kind && kind === rec.kind && !hasDiff(el) && !(rec.part === 'out' && isWaiting(card)));
    },
    onViewSynced: key => syncSaveState(key),
    onRekey: (_oldKey, newKey, rec) => { rec.id = parseKey(newKey).id; },
    typingBlockedExtra: '.cm-editor,#craft-insert-preview-menu',
    openPrimaryOnEnter: (el, run) => {
      if (!managesPart(el, 'in')) return false;
      if (run) openCell(normId(el.id), null, 'in');
      return true;
    },
    editClickSel: `.card-in:is([data-mtype="note"],[data-mtype="prompt"],[data-mtype="raw"]) [hx-post="${SOLVEIT.api.editor}"], .card-out[data-mtype="prompt"] [hx-post="${SOLVEIT.api.editor}"]`,
    onEditClick: (edit, e) => {
      const card = edit.closest('.msg-card'), part = card?.classList.contains('card-out') ? 'out' : 'in';
      const el = edit.closest(SOLVEIT.sel.cellWithId), id = normId(el?.id);
      if (!id || !managesPart(el, part)) return false;
      e.preventDefault(); e.stopImmediatePropagation();
      openCell(id, null, part);
      return true;
    },
    getThemeExts: rec => (mdCache ? themeExtensions(mdCache, rec.kind) : null),
    runFailMsg: 'Prompt saved, but could not start the run.',
    domAttrs: ['data-diff', 'data-mtype', 'data-wait'],
    inDialog: true,
    pointerEdit: {
      ignoreMods: true,
      ignoreSel: 'a, button, summary, input, select, textarea, label, [role="button"], .craft-md-host, .craft-c2-host, .copy-wrap > button',
      resolveTarget: e => {
        const body = e.target.closest?.(`${SOLVEIT.sel.cell} > .card-in:is([data-mtype="note"],[data-mtype="prompt"],[data-mtype="raw"]) > ${SOLVEIT.sel.msgBody}`);
        const content = body?.querySelector(SOLVEIT.sel.msgContent);
        if (!content) return null;
        const el = body.closest(SOLVEIT.sel.cell);
        if (!managesPart(el, 'in')) return null;
        const kind = getKind(el, 'in');
        return {
          id: normId(el.id),
          kind,
          dragSelectGuard: kind !== 'raw',
          codeEl: kind === 'raw' ? content.querySelector('pre code') : null,
          caretHint: kind !== 'raw' ? captureCaretHint(content, e.clientX, e.clientY) : null,
        };
      },
      onOpen: (p, selSpec) => openCell(p.id, selSpec, 'in'),
    },
  });
  const {states, views, pendingSaves, dirtyIds, failedSaves, syncSaveState, saveCell, unmountCell, exitCell, sync, schedule} = ed;

    /* ── CM6 & Markdown bundle loader (shares single CM6 core via __craftCMCore) ── */
  const loadMdCM = () => window.__craftCM6MdPromise ??= (async () => {
    const cm = CORE.buildStyles(await CORE.loadCoreCM());
    const local = cm._source === 'local';
    const [lm, lezerMd] = local
      ? await Promise.all([import(`${LOCAL_CM_BASE}/lang-markdown.js`), import(`${LOCAL_CM_BASE}/markdown.js`)])
      : await Promise.all([
          import(`https://esm.sh/@codemirror/lang-markdown@6.3.2?${CM_DEPS}`),
          import(`https://esm.sh/@lezer/markdown@1.8.1`),
        ]);
    const mdLangExt = lm.markdown({base: lm.markdownLanguage, codeLanguages: CORE.codeLanguages(cm)});
    const livePreviewExt = buildLivePreview(cm);
    return {cm, lm, lezerMd, mdLangExt, mdCodeDarkStyle: cm.mdCodeDarkStyle, mdCodeLightStyle: cm.mdCodeLightStyle, livePreviewExt};
  })().catch(err => {
    window.__craftCM6MdPromise = null;
    console.error('craftMd: failed to load CodeMirror 6 markdown modules', err);
    throw err;
  });

  loadMdCM().then(b => { mdCache = b; cmCache = b.cm; }).catch(() => {});

/* #4d4b0f47 */
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
        return CORE.el('span', {cls: 'craft-md-bullet'}, '•');
      }
      ignoreEvent() { return false; }
    }
    const bulletDeco = Decoration.replace({widget: new BulletWidget()});

    class HrWidget extends WidgetType {
      eq() { return true; }
      toDOM() {
        return CORE.el('span', {cls: 'craft-md-hr'});
      }
      ignoreEvent() { return false; }
    }
    const hrDeco = Decoration.replace({widget: new HrWidget()});

    class FenceLabelWidget extends WidgetType {
      constructor(label) { super(); this.label = label; }
      eq(o) { return o.label === this.label; }
      toDOM() {
        return CORE.el('span', {cls: 'craft-md-fence-label'}, this.label || '');
      }
      ignoreEvent() { return false; }
    }

    class CheckboxWidget extends WidgetType {
      constructor(checked, from, to) { super(); this.checked = checked; this.from = from; this.to = to; }
      eq(o) { return o.checked === this.checked && o.from === this.from && o.to === this.to; }
      toDOM(edView) {
        return CORE.el('input', {
          type: 'checkbox', cls: 'craft-md-task', checked: this.checked, tabIndex: -1,
          onMousedown: e => {
            e.preventDefault();
            e.stopPropagation();
            const cur = edView.state.doc.sliceString(this.from, this.to);
            if (!/^\[[ xX]\]$/.test(cur)) return;
            edView.dispatch({changes: {from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]'}});
          },
        });
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
      const multiSpaceRe = /(?<=\S) {2,}(?=\S)/g;
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
          if (!tableLines.has(l)) {
            multiSpaceRe.lastIndex = 0;
            while ((m = multiSpaceRe.exec(line.text))) {
              const sf = line.from + m.index, st = sf + m[0].length;
              if (!inCode(sf, st) && !selOverlaps(sf, st)) addReplace(sf + 1, st, hideDeco);
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

/* #9c08569a */
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

  function buildExtensions(bundle, keyOrRef, id, part, kind, comps) {
    const ref = typeof keyOrRef === 'string' ? {key: keyOrRef, id} : keyOrRef;
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
        if (isOut) exitCell(ref.key);
        else if (kind === 'prompt') saveAndRun(ref.id, 'shift-run');
        else saveAndAdvance(ref.key);
        return true;
      }},
      {key: 'Mod-Enter', run: () => {
        if (!isOut && kind === 'prompt') saveAndRun(ref.id, 'run');
        else exitCell(ref.key);
        return true;
      }},
      {key: 'Alt-Enter', run: () => {
        if (isOut) return false;
        if (kind === 'prompt') saveAndRun(ref.id, 'alt-run');
        else saveAndInsertBelow(ref.key);
        return true;
      }},
      {key: 'Mod-Shift-Enter', run: () => {
        if (!isOut && kind === 'prompt') { saveAndRun(ref.id, 'continue'); return true; }
        return false;
      }},
      {key: 'ArrowUp', run: v => !isOut && stepBoundary(ref.id, v, true)},
      {key: 'ArrowDown', run: v => !isOut && stepBoundary(ref.id, v, false)},
      {key: 'Ctrl-Shift--', run: v => { if (!isOut) splitCell(ref.id, v, kind); return true; }},
      {key: 'Ctrl-Shift-_', run: v => { if (!isOut) splitCell(ref.id, v, kind); return true; }},
      {key: 'Mod-Shift-j', run: v => { if (!isOut) switchCellType(ref.id, v, 'code'); return true; }},
      {key: 'Mod-Shift-k', run: v => { if (!isOut && kind !== 'note') switchCellType(ref.id, v, 'note'); return true; }},
      {key: 'Mod-Shift-l', run: v => { if (!isOut && kind !== 'prompt') switchCellType(ref.id, v, 'prompt'); return true; }},
      {key: 'Mod-Shift-;', run: v => { if (!isOut && kind !== 'raw') switchCellType(ref.id, v, 'raw'); return true; }},
      {key: 'Mod-Shift-d', run: () => { document.getElementById('brain-btn')?.click(); return true; }},
      {key: jumpLastKey, run: () => { jumpToLastCell(ref.key); return true; }},
      {key: 'Shift-Escape', run: () => { exitCell(ref.key); return true; }},
      {key: 'Escape', run: v => {
        if (search.searchPanelOpen(v.state)) return search.closeSearchPanel(v);
        if (v.state.selection.ranges.length > 1) return cmds.simplifySelection(v);
        exitCell(ref.key);
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

    let imageInsert = null;
    const imagePaste = view.EditorView.domEventHandlers({paste(e, v) {
      if (v.state.readOnly || !['note', 'prompt'].includes(kind)) return false;
      const file = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
      if (!file) return false;
      e.preventDefault();
      if (imageInsert !== null) return true;
      imageInsert = v.state.selection.main.head;
      const upload = async () => {
        try {
          let uploadId = ref.id;
          if (CORE.optimistic?.isOptimistic?.(uploadId)) {
            uploadId = await CORE.optimistic.waitForReal(uploadId);
            if (!uploadId) return;
          }
          const imageId = crypto.randomUUID();
          const ext = file.name.match(/\.([a-z0-9]+)$/i)?.[1] || (file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1].split('+')[0]);
          const form = new FormData();
          form.append('id_', uploadId);
          form.append('msg_type', kind);
          form.append('kid', document.getElementById('kid')?.value || '');
          form.append('file', file, `pasted_file_${imageId}.${ext}`);
          const response = await fetch('/upload_attachment_', {method: 'POST', body: form});
          if (!response.ok) throw new Error(`Attachment upload returned ${response.status}`);
          const data = await response.json();
          if (views.get(ref.key)?.view !== v) return;
          const url = data.saved_file || `attachment:${imageId}`;
          const text = `\n![Pasted image](${url})\n`;
          v.dispatch({changes: {from: imageInsert, insert: text}, userEvent: 'input.paste'});
        } catch (err) {
          console.error('CRAFT inline image paste:', err);
          CORE.notify('Could not attach the pasted image.', 'warning');
        } finally { imageInsert = null; }
      };
      void upload();
      return true;
    }});

    const updateWatcher = view.EditorView.updateListener.of(u => {
      if (!u.docChanged) return;
      if (imageInsert !== null) imageInsert = u.changes.mapPos(imageInsert, 1);
      const curId = ref.id, curKey = ref.key;
      const el = getCellEl(curId);
      const savedText = getCellText(el, part);
      if (u.state.doc.toString() !== savedText) dirtyIds.add(curKey);
      else dirtyIds.delete(curKey);
      syncSaveState(curKey);
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
      imagePaste,
    ];

    if (isMd) {
      exts.push(mdLangExt, ...livePreviewExt);
    } else {
      exts.push(view.highlightActiveLine());
    }
    return exts;
  }

/* #b69b94e8 */
/* ── Save, unmount, blur, run, split, type-switch ─────────────────────── */

  async function saveAndAdvance(key) {
    const ref = views.get(key)?.ref;
    await exitCell(key);
    const {id} = parseKey(ref?.key || key);
    const el = getCellEl(id);
    const next = el ? window.adjacentMsg?.(window.$(el), false) : null;
    if (next?.length) window.selectMsg?.(next);
  }

  async function saveAndInsertBelow(key) {
    const ref = views.get(key)?.ref;
    await exitCell(key);
    const {id} = parseKey(ref?.key || key);
    const el = getCellEl(id);
    if (el) {
      window.selectMsg?.(window.$(el), {scroll: false});
      window.solveitHotkeys?.run?.('si-b');
    }
  }

  const saveAndRun = (id, cmd) => ed.saveAndRun(makeKey(id, 'in'), cmd);
  const splitCell = (id, v, kind) => ed.splitCell(makeKey(id, 'in'), v, kind);

  const switchCellType = (id, v, mtyp) => ed.switchCellType(makeKey(id, 'in'), v, mtyp, {
    clearState: true,
    onMatch: (cid, selSpec) => (mtyp === 'code' ? window.craftC2?.edit?.(cid, selSpec) : openCell(cid, selSpec, 'in')),
  });

  const stepBoundary = (id, v, up) => Boolean(cmCache && ed.stepBoundary(makeKey(id, 'in'), v, up, {tol: 3}));

  const jumpToLastCell = key => CORE.jumpToLastCell(() => exitCell(key));


  /* ── Click-to-caret placement (exact for raw, smart anchor for rendered prose) ── */
  const {offsetIn} = CORE;

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

  /* ── Mount & open cell ────────────────────────────────────────────────── */
  async function openCell(rawId, selSpec = null, rawPart = 'in') {
    const id = normId(rawId), part = partOf(rawPart), key = makeKey(id, part);
    if (ed.destroyed || !id) return false;
    const bundle = mdCache || await loadMdCM();
    mdCache = bundle; cmCache = bundle.cm;
    if (ed.destroyed) return false;
    const el = getCellEl(id), card = getCard(el, part), kind = getKind(el, part);
    if (!el || !card || !kind || !managesPart(el, part)) return false;
    const text = getCellText(el, part);
    return ed.openView(key, {
      el, card, text, cm: bundle.cm, selSpec, resolveHint: resolveCaretHint,
      canReuseRec: rec => rec.kind === kind,
      hostClass: `craft-cm-host craft-md-host craft-md-${kind} ${kind === 'raw' ? 'craft-md-mono' : 'craft-md-prose'}`,
      extraRec: {id, part, kind},
      themeExts: themeExtensions(bundle, kind),
      prepareState: ref => {
        const comps = {themeComp: new bundle.cm.state.Compartment()};
        const prev = states.get(key);
        const reusePrev = Boolean(prev && prev.kind === kind && prev.state.doc.toString() === text && prev.state._mdComps);
        const edState = reusePrev ? prev.state : bundle.cm.state.EditorState.create({doc: text, extensions: buildExtensions(bundle, ref, id, part, kind, comps)});
        const activeComps = reusePrev ? prev.state._mdComps : comps;
        edState._mdComps = activeComps;
        return {edState, activeComps, reusePrev};
      },
    });
  }

/* #64e072f8 */
/* ── Preserve single newlines in rendered markdown (notes & prompts) ──── */
  const SOFT_BR_CARD_IN = `${SOLVEIT.sel.cardIn}:is([data-mtype="note"],[data-mtype="prompt"])`;
  const BLOCK_TAGS = new Set(['P', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'TABLE', 'DIV', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'FIGURE', 'DETAILS']);
  const SKIP_TAGS = new Set(['PRE', 'SCRIPT', 'STYLE', 'SVG', 'MATH', 'TEXTAREA']);

  function maskCodeFences(raw) {
    const lines = raw.split('\n');
    let fence = null;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^[ \t]{0,3}(`{3,}|~{3,})/);
      if (!fence) {
        if (m) { fence = {ch: m[1][0], len: m[1].length}; lines[i] = ' '.repeat(lines[i].length); }
      } else {
        if (new RegExp(`^[ \\t]{0,3}${fence.ch}{${fence.len},}[ \\t]*$`).test(lines[i])) fence = null;
        lines[i] = ' '.repeat(lines[i].length);
      }
    }
    return lines.join('\n');
  }

  function skipLinkDest(raw, pos) {
    if (raw[pos] !== ']') return pos;
    const nxt = raw[pos + 1];
    if (nxt === '(') {
      let i = pos + 2, depth = 1;
      while (i < raw.length && depth > 0) {
        if (raw[i] === '\\') { i += 2; continue; }
        if (raw[i] === '(') depth++;
        else if (raw[i] === ')') depth--;
        i++;
      }
      return i;
    }
    if (nxt === '[') {
      const close = raw.indexOf(']', pos + 2);
      return close >= 0 ? close + 1 : pos + 1;
    }
    return pos + 1;
  }

  function findWordInRaw(raw, word, from, limit) {
    const end = Math.min(raw.length, limit);
    const idx = raw.indexOf(word, from);
    if (idx >= 0 && idx + word.length <= end) return {start: idx, end: idx + word.length};
    if (word.length <= 80 && /[\\*_~`\[\]()#+\-.!&<>"]/.test(word)) {
      const pat = [...word].map(ch => {
        if (ch === '&') return '(?:&amp;|&)';
        if (ch === '<') return '(?:&lt;|<)';
        if (ch === '>') return '(?:&gt;|>)';
        if (ch === '"') return '(?:&quot;|")';
        return '\\?' + ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('');
      const m = new RegExp(pat).exec(raw.slice(from, end));
      if (m) return {start: from + m.index, end: from + m.index + m[0].length};
    }
    return null;
  }

  function collectInlineItems(root, stopAtBlocks) {
    const items = [];
    const walk = node => {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.TEXT_NODE) {
          const s = child.nodeValue || '';
          const re = /(\S+)|(\s+)/g;
          let m;
          while ((m = re.exec(s))) {
            if (m[1]) items.push({type: 'word', text: m[1]});
            else items.push({type: 'space', text: m[2], node: child, offset: m.index, len: m[2].length});
          }
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName;
          if (stopAtBlocks && BLOCK_TAGS.has(tag)) continue;
          if (SKIP_TAGS.has(tag) || child.classList?.contains('katex') || child.classList?.contains('mjx-container')) continue;
          if (tag === 'BR') { items.push({type: 'br'}); continue; }
          if (tag === 'IMG') { items.push({type: 'img'}); continue; }
          if (tag === 'CODE') {
            const t = (child.textContent || '').trim();
            if (t) items.push({type: 'code', text: t});
            continue;
          }
          walk(child);
          if (tag === 'A') items.push({type: 'link-end'});
        }
      }
    };
    walk(root);
    return items;
  }

  function applySoftBreaksToCard(card) {
    if (!card || card.dataset.mdEditing === 'true') return;
    const mc = card.querySelector(`:scope > ${SOLVEIT.sel.msgBody} > ${SOLVEIT.sel.msgContent}`);
    if (!mc || mc.dataset.craftBreaks === '1') return;
    const el = card.closest(SOLVEIT.sel.cell);
    const raw = getCellText(el, 'in');
    if (!raw || !/[^\n]\n[^\n]/.test(raw)) { mc.dataset.craftBreaks = '1'; return; }

    const prose = mc.querySelector(':scope > .prose') || mc;
    const masked = maskCodeFences(raw);
    let rawPos = 0;

    for (const blk of prose.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li')) {
      if (blk.closest('pre, table, .craft-md-host, .katex, .mjx-container')) continue;
      const tag = blk.tagName;
      const isHeading = tag[0] === 'H' && tag.length === 2;
      const items = collectInlineItems(blk, tag === 'LI');
      if (!items.some(it => it.type === 'word' || it.type === 'code')) continue;

      if (isHeading) {
        for (const it of items) {
          if (it.type !== 'word' && it.type !== 'code') continue;
          const hit = findWordInRaw(masked, it.text, rawPos, masked.length);
          if (hit) rawPos = hit.end;
        }
        continue;
      }

      const firstWordIdx = items.findIndex(it => it.type === 'word' || it.type === 'code');
      if (firstWordIdx < 0) continue;
      const firstWord = items[firstWordIdx].text;
      let startHit = null;
      if (firstWord.length <= 2) {
        const secondWord = items.slice(firstWordIdx + 1).find(it => it.type === 'word' || it.type === 'code')?.text;
        if (secondWord) {
          let searchFrom = rawPos;
          while (searchFrom < masked.length) {
            const h1 = findWordInRaw(masked, firstWord, searchFrom, masked.length);
            if (!h1) break;
            const h2 = findWordInRaw(masked, secondWord, h1.end, Math.min(masked.length, h1.end + 120));
            if (h2 && !/\n[ \t>]*\n/.test(masked.slice(h1.end, h2.start))) { startHit = h1; break; }
            searchFrom = h1.start + 1;
          }
        }
      }
      if (!startHit) startHit = findWordInRaw(masked, firstWord, rawPos, masked.length);
      if (!startHit) continue;
      rawPos = startHit.end;

      const breaksToInsert = [];
      let pendingSpace = null;
      let prevMatched = true;
      let sawBr = false;

      for (let i = firstWordIdx + 1; i < items.length; i++) {
        const it = items[i];
        if (it.type === 'space') {
          if (!sawBr && it.text === ' ') pendingSpace = it;
          continue;
        }
        if (it.type === 'br') {
          pendingSpace = null;
          sawBr = true;
          const nl = masked.indexOf('\n', rawPos);
          if (nl >= 0) rawPos = nl + 1;
          continue;
        }
        if (it.type === 'link-end') {
          const closeBracket = masked.indexOf(']', rawPos);
          if (closeBracket >= 0 && closeBracket - rawPos <= 8) rawPos = skipLinkDest(masked, closeBracket);
          continue;
        }
        if (it.type === 'img') {
          const imgStart = masked.indexOf('![', rawPos);
          if (imgStart >= 0 && imgStart - rawPos <= 40) {
            const closeBracket = masked.indexOf(']', imgStart + 2);
            if (closeBracket >= 0) rawPos = skipLinkDest(masked, closeBracket);
          }
          continue;
        }

        const blankRe = /\n[ \t>]*\n/g;
        blankRe.lastIndex = rawPos;
        const blankMatch = blankRe.exec(masked);
        const paraEnd = blankMatch ? blankMatch.index : masked.length;

        const hit = findWordInRaw(masked, it.text, rawPos, paraEnd);
        if (hit) {
          if (prevMatched && pendingSpace && !sawBr) {
            if (masked.slice(rawPos, hit.start).includes('\n')) breaksToInsert.push(pendingSpace);
          }
          rawPos = hit.end;
          if (it.type === 'code') {
            while (rawPos < paraEnd && masked[rawPos] === '`') rawPos++;
          }
          prevMatched = true;
        } else {
          prevMatched = false;
        }
        pendingSpace = null;
        sawBr = false;
      }

      for (let j = breaksToInsert.length - 1; j >= 0; j--) {
        const sp = breaksToInsert[j];
        const after = sp.node.splitText(sp.offset);
        after.deleteData(0, sp.len);
        const br = document.createElement('br');
        br.className = 'craft-soft-br';
        sp.node.parentNode.insertBefore(br, after);
      }
    }

    mc.dataset.craftBreaks = '1';
  }

  const applySoftBreaksToCells = cells => {
    for (const el of cells) {
      const card = el.querySelector(SOFT_BR_CARD_IN);
      if (card) applySoftBreaksToCard(card);
    }
  };
  const unsubSoftBreaks = CORE.onCells(applySoftBreaksToCells, {attrs: ['data-mtype', 'data-md-editing'], initial: true});

  window.craftMd = {
    manages: (id, part = 'in') => managesPart(getCellEl(id), partOf(part)),
    edit: (id, opts, part = 'in') => openCell(id, opts, part),
    editOutput: (id, opts) => openCell(id, opts, 'out'),
    exit: (id, part) => exitCell(id ? (String(id).includes(':') ? String(id) : makeKey(id, part || 'in')) : ed.activeKey),
    active: () => ed.activeKey,
    view: key => views.get(key ?? ed.activeKey)?.view || null,
    kind: key => views.get(key ?? ed.activeKey)?.kind || null,
    run: (id, cmd = 'run') => saveAndRun(normId(id), cmd),
    rekey: (oldId, newId, opts) => ed.rekey(makeKey(oldId, 'in'), makeKey(newId, 'in'), opts),
    abortOptimistic: id => { const k = makeKey(id, 'in'); dirtyIds.delete(k); failedSaves.delete(k); states.delete(k); unmountCell(k); },
    dirty: () => [...dirtyIds],
    source: () => cmCache?._source || 'pending',
    disable() {
      unsubSoftBreaks();
      ed.disable();
      delete window.craftMd;
    },
  };
})();
