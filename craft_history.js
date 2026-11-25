/* %% nbs/craft/17_cell_history.ipynb #b2c07f30 */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"hist_modal": "<dialog class=\"craft-overlay\" id=\"craft-history-modal\" aria-label=\"Cell Version History\"><div class=\"uk-card craft-card craft-hist-card\"><div class=\"craft-modal-head\"><strong>Cell History (Session)</strong><span class=\"craft-ctx-prev-total\" data-ref=\"cellLabel\"></span><button type=\"button\" class=\"craft-modal-x\" aria-label=\"Close\" data-ref=\"close\">×</button></div><div class=\"craft-hist-list\" data-ref=\"list\"></div><div class=\"craft-modal-foot\"><button class=\"uk-btn uk-btn-primary uk-btn-xs\" data-ref=\"done\" type=\"button\">Close</button></div></div></dialog>", "hist_diff_bar": "<div class=\"craft-diff-bar\"><span class=\"craft-diff-tag\" data-ref=\"tag\"></span><button class=\"uk-btn uk-btn-primary uk-btn-xs\" data-ref=\"accept\" type=\"button\">Accept</button><button class=\"uk-btn uk-btn-default uk-btn-xs craft-btn-danger\" data-ref=\"revert\" type=\"button\">Revert</button><details class=\"craft-diff-details\" data-ref=\"details\"><summary class=\"uk-btn uk-btn-default uk-btn-xs craft-diff-sum\">Toggle diff</summary><div class=\"craft-diff-box\" data-ref=\"diffBox\"></div></details></div>"});

/* %% nbs/craft/17_cell_history.ipynb #4625dbf6 */
(() => { /* iife:craftHistory */
/* #4625dbf6 */
window.craftHistory?.disable?.();
const CORE = window.__craftCMCore;
if (!CORE || !CORE.qs(CORE.SOLVEIT.sel.dialog) || !CORE.features.isEnabled('cell-history')) return;
const {SOLVEIT, el, qs, qsa, on, store, mountTpl, mountModal, htmxPost, onCells, notify, notifyErr, kid, normId, getCellEl, allCells, primaryCell, cellMtype, getCellInputText, onCellHtmx} = CORE;
const ac = new AbortController(), sig = {signal: ac.signal};

const HIST_KEY = () => `craft-cell-hist:${kid() || location.pathname}`;
const MAX_PER_CELL = 25;

const historyMap = new Map(Object.entries(store.json(HIST_KEY(), {}, sessionStorage) || {}));
const persistHistory = () => {
  for (const limit of [MAX_PER_CELL, 12, 6, 3, 1]) {
    const obj = {};
    for (const [k, v] of historyMap) obj[k] = v.slice(-limit);
    try {
      sessionStorage.setItem(HIST_KEY(), JSON.stringify(obj));
      return;
    } catch {}
  }
};

function recordSnapshot(id, text, source = 'save') {
  const k = normId(id);
  if (!k || typeof text !== 'string') return;
  const list = historyMap.get(k) || [];
  if (list.length && list.at(-1).text === text) return;
  list.push({ts: Date.now(), source, text});
  if (list.length > MAX_PER_CELL) list.splice(0, list.length - MAX_PER_CELL);
  historyMap.set(k, list);
  persistHistory();
}

function snapshotAll(source = 'baseline') {
  for (const c of allCells()) {
    const txt = getCellInputText(c, {rawOnly: true});
    if (typeof txt === 'string') recordSnapshot(c.id, txt, source);
  }
}

/* Pure line-level diff for inline AI Edit Review */
function renderLineDiff(oldText, newText) {
  const a = String(oldText || '').split('\n');
  const b = String(newText || '').split('\n');
  const ops = [];
  if (a.length * b.length <= 160000) {
    const m = a.length, n = b.length;
    const dp = Array.from({length: m + 1}, () => new Uint32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < m && j < n) {
      if (a[i] === b[j]) { ops.push(['eq', a[i++]]); j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push(['del', a[i++]]);
      else ops.push(['add', b[j++]]);
    }
    while (i < m) ops.push(['del', a[i++]]);
    while (j < n) ops.push(['add', b[j++]]);
  } else {
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) ops.push(['eq', a[p++]]);
    let ea = a.length - 1, eb = b.length - 1;
    const tail = [];
    while (ea >= p && eb >= p && a[ea] === b[eb]) { tail.push(['eq', a[ea--]]); eb--; }
    for (let i = p; i <= ea; i++) ops.push(['del', a[i]]);
    for (let j = p; j <= eb; j++) ops.push(['add', b[j]]);
    ops.push(...tail.reverse());
  }
  const prefix = {eq: '  ', del: '- ', add: '+ '};
  return el('pre', {cls: 'craft-diff-pre'}, ...ops.map(([k, line]) => el('div', {cls: `craft-diff-${k}`}, prefix[k] + line)));
}

async function restoreText(id, text) {
  const k = normId(id);
  try {
    await htmxPost(SOLVEIT.api.setContents, {id_: '_' + k, ids: k, contents: JSON.stringify({[k]: text})});
    recordSnapshot(k, text, 'restore');
    const c = getCellEl(k);
    if (c) c.removeAttribute('data-diff');
    notify('Cell content restored.', 'success');
    return true;
  } catch (err) {
    notifyErr('Could not restore cell snapshot.', 'craftHistory');
    return false;
  }
}

/* #d292a245 */
/* Hook /set_contents_ and /add_runq_ to capture snapshots */
onCellHtmx([SOLVEIT.api.setContents, SOLVEIT.api.addRunq], ({path, contents}) => {
  if (path.startsWith(SOLVEIT.api.setContents)) {
    if (contents && typeof contents === 'object') {
      for (const [id, txt] of Object.entries(contents)) recordSnapshot(id, String(txt ?? ''), 'save');
    }
  } else {
    snapshotAll('pre-run');
  }
}, sig);

/* Inline AI Edit Review bars for data-diff="changed" | "deleted" */
const diffBaselines = new Map();

function syncDiffBars(cells = allCells()) {
  for (const c of cells) {
    const id = normId(c.id);
    const diff = c.getAttribute('data-diff');
    const isReview = diff === 'changed' || diff === 'deleted';
    const existing = c.querySelector(':scope > .craft-diff-bar');
    if (!isReview) {
      existing?.remove();
      diffBaselines.delete(id);
      continue;
    }
    if (existing) continue;
    const snaps = historyMap.get(id) || [];
    if (!diffBaselines.has(id)) {
      const preAi = [...snaps].reverse().find(s => s.source !== 'current' && s.source !== 'accept-ai') || snaps.at(-1);
      if (preAi) diffBaselines.set(id, preAi.text);
    }
    const hasBaseline = diffBaselines.has(id);
    const prevText = hasBaseline ? diffBaselines.get(id) : '';
    const bar = mountTpl('hist_diff_bar', {refs: true});
    bar.tag.textContent = diff === 'deleted' ? 'AI deleted cell' : 'AI modified cell';
    if (!hasBaseline) bar.revert.remove();
    else on(bar.revert, 'click', async () => { if (await restoreText(id, prevText)) diffBaselines.delete(id); }, sig);
    on(bar.accept, 'click', () => {
      const curRaw = getCellInputText(c, {rawOnly: true});
      if (typeof curRaw === 'string') recordSnapshot(id, curRaw, 'accept-ai');
      diffBaselines.delete(id);
      c.removeAttribute('data-diff');
      bar.root.remove();
    }, sig);
    on(bar.details, 'toggle', () => {
      if (!bar.details.open) return;
      const curRaw = getCellInputText(c, {rawOnly: true});
      bar.diffBox.replaceChildren(
        typeof curRaw === 'string'
          ? renderLineDiff(prevText, curRaw)
          : el('div', {cls: 'craft-empty-state'}, 'Open this cell to diff raw source.')
      );
    }, sig);
    c.prepend(bar.root);
  }
}

/* #36a1b637 */
/* Cell History Modal, Menu, Hotkey & Lifecycle */
let modal = null;

function openHistory(cell) {
  const target = cell || primaryCell();
  if (!target) return notifyErr('Select a cell first to view its history.', 'craftHistory');
  const id = normId(target.id);
  const curTxt = getCellInputText(target, {rawOnly: true});
  if (typeof curTxt === 'string') recordSnapshot(id, curTxt, 'current');
  const snaps = [...(historyMap.get(id) || [])].reverse();
  if (!modal) {
    modal = mountModal('hist_modal', {signal: ac.signal});
    on(modal.done, 'click', modal.close, sig);
  }
  modal.cellLabel.textContent = `#${id.slice(0, 8)} · ${snaps.length} snapshot(s)`;
  modal.list.replaceChildren(...(snaps.length ? snaps.map((s, i) => {
    const tStr = new Date(s.ts).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'});
    return el('div', {cls: 'craft-hist-entry'},
      el('div', {cls: 'craft-hist-meta'},
        el('span', {cls: 'craft-hist-time'}, `${tStr} · ${s.source}`),
        i > 0 ? el('button', {
          type: 'button', cls: 'uk-btn uk-btn-default uk-btn-xs',
          onClick: async () => { if (await restoreText(id, s.text)) modal.close(); },
        }, 'Restore') : el('span', {cls: 'craft-hist-cur'}, 'latest'),
      ),
      el('pre', {cls: 'craft-hist-snip'}, s.text.slice(0, 400) || '(empty)'),
    );
  }) : [el('div', {cls: 'craft-empty-state'}, 'No snapshots recorded yet in this session.')]));
  modal.open();
}

const offMenu = window.craftActionMenus?.registerProvider?.(ctx => {
  if (ctx.isOutput || !ctx.cell) return [];
  return [{label: 'Cell history…', onClick: () => openHistory(ctx.cell)}];
});

window.__hotkeyRegister?.({id: 'craft-cell-history', label: 'Cell version history (session)', group: 'CRAFT · History', combo: '', handler: () => { openHistory(); return true; }});

const offDom = onCells(syncDiffBars, {attrs: ['data-diff'], initial: true});
snapshotAll('initial');

window.craftHistory = {
  __loaded: true,
  open: openHistory,
  snapshots: id => [...(historyMap.get(normId(id)) || [])],
  recordSnapshot,
  restoreText,
  disable() {
    ac.abort(); offDom?.(); offMenu?.();
    modal?.destroy();
    qsa('.craft-diff-bar').forEach(b => b.remove());
    delete window.craftHistory;
  },
};
})();
