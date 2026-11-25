/* %% nbs/craft/18_tts_reader.ipynb #eaf85955 */
window.__craftTpl = Object.assign(window.__craftTpl || {}, {"tts_bar": "<div id=\"craft-tts-bar\" role=\"region\" aria-label=\"Text-to-speech player\"><button type=\"button\" class=\"craft-tts-btn\" aria-label=\"Previous cell\" title=\"Previous cell\" data-ref=\"prev\">⏮</button><button type=\"button\" class=\"craft-tts-btn\" aria-label=\"Play or pause\" title=\"Play / Pause\" data-ref=\"play\">⏸</button><button type=\"button\" class=\"craft-tts-btn\" aria-label=\"Next cell\" title=\"Next cell\" data-ref=\"next\">⏭</button><select class=\"uk-select craft-tts-rate\" aria-label=\"Reading speed\" data-ref=\"rate\"><option value=\"1\">1.0×</option><option value=\"1.25\">1.25×</option><option value=\"1.5\">1.5×</option><option value=\"1.75\">1.75×</option><option value=\"2\">2.0×</option></select><span class=\"craft-tts-status\" data-ref=\"status\"></span><button type=\"button\" class=\"craft-tts-btn\" aria-label=\"Stop reading\" title=\"Stop\" data-ref=\"stop\">×</button></div>"});

/* %% nbs/craft/18_tts_reader.ipynb #ffd7c180 */
(() => { /* iife:craftTTS */
/* #ffd7c180 */
window.craftTTS?.disable?.();
const CORE = window.__craftCMCore;
if (!CORE || !CORE.qs(CORE.SOLVEIT.sel.dialog) || !CORE.features.isEnabled('tts-reader')) return;
const {SOLVEIT, qs, qsa, on, store, mountBar, notifyErr, normId, getCellEl, allCells, primaryCell, cellMtype} = CORE;
const ac = new AbortController(), sig = {signal: ac.signal};
const RATE_KEY = 'craft-tts-rate';

/* Clean rendered DOM or text into speakable prose */
function extractSpeakableText(cell, preferOutput = false) {
  if (!cell) return '';
  const mtype = cellMtype(cell);
  if (mtype === 'code' && !preferOutput) {
    const code = cell.querySelector(`${SOLVEIT.sel.cardIn} ${SOLVEIT.sel.msgContent} pre`)?.textContent || '';
    const lines = code.trim() ? code.trim().split('\n').length : 0;
    return lines ? `Python code block, ${lines} ${lines === 1 ? 'line' : 'lines'}.` : '';
  }
  const targetCard = (preferOutput && cell.querySelector(`${SOLVEIT.sel.cardOut} ${SOLVEIT.sel.msgContent}`)) ||
                     (mtype === 'prompt' && cell.querySelector(`${SOLVEIT.sel.cardOut} ${SOLVEIT.sel.msgContent}`)) ||
                     cell.querySelector(`${SOLVEIT.sel.cardIn} ${SOLVEIT.sel.msgContent}`);
  if (!targetCard) return '';
  const clone = targetCard.cloneNode(true);
  for (const pre of qsa('pre', clone)) {
    const cls = pre.querySelector('code')?.className || '';
    const langM = cls.match(/language-(\w+)/);
    const lang = langM ? langM[1] : 'Code';
    const lines = (pre.textContent || '').trim().split('\n').length;
    pre.replaceWith(document.createTextNode(` ${lang} code block, ${lines} ${lines === 1 ? 'line' : 'lines'}. `));
  }
  for (const tbl of qsa('table', clone)) {
    const cols = tbl.querySelector('tr')?.children?.length || 0;
    tbl.replaceWith(document.createTextNode(` Table, ${cols} ${cols === 1 ? 'column' : 'columns'}. `));
  }
  let text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
  // Strip bare URLs, inline hex hashes, and long filesystem paths
  text = text
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/\b0x[0-9a-f]{6,}\b/gi, '')
    .replace(/(?:\/[\w.-]+){3,}/g, 'file path')
    .replace(/[#*_`~>\[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

/* Chunk long text by sentence to avoid Chrome's ~15s speechSynthesis stall bug */
function splitLongSegment(seg, maxLen) {
  const s = seg.trim();
  if (!s) return [];
  if (s.length <= maxLen) return [s];
  const out = [];
  let cur = '';
  for (const part of s.split(/(?<=[,;:])\s+|\s+/)) {
    if (!part) continue;
    if (part.length > maxLen) {
      if (cur) { out.push(cur); cur = ''; }
      for (let i = 0; i < part.length; i += maxLen) out.push(part.slice(i, i + maxLen));
    } else if (cur && cur.length + 1 + part.length > maxLen) {
      out.push(cur);
      cur = part;
    } else {
      cur = cur ? `${cur} ${part}` : part;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const ABBREV_RE = /\b(?:e\.g|i\.e|dr|mr|mrs|ms|prof|sr|jr|vs|etc|fig|no|st)\.$/i;

function chunkSentences(text, maxLen = 220) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const sentences = [];
  let buf = '';
  for (const tok of raw.split(' ')) {
    buf = buf ? `${buf} ${tok}` : tok;
    if (/[.!?]+['")\]]*$/.test(tok) && !ABBREV_RE.test(tok) && !/\d+\.\d+/.test(tok)) {
      sentences.push(buf);
      buf = '';
    }
  }
  if (buf) sentences.push(buf);
  const chunks = [];
  let cur = '';
  for (const sent of sentences) {
    for (const piece of splitLongSegment(sent, maxLen)) {
      if (cur && cur.length + 1 + piece.length > maxLen) {
        chunks.push(cur);
        cur = piece;
      } else {
        cur = cur ? `${cur} ${piece}` : piece;
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/* #e1492c9d */
/* Speech Queue, Player Bar & Playback Controls */
const bar = mountBar('tts_bar');
let barWired = false, queue = [], cellIdx = 0, chunkIdx = 0, chunks = [], playing = false, paused = false;
let activeCellId = null;
let rate = parseFloat(store.get(RATE_KEY, '1')) || 1;

function clearHighlight() {
  if (activeCellId) getCellEl(activeCellId)?.classList.remove('craft-tts-active');
  qsa(`${SOLVEIT.sel.cell}.craft-tts-active`).forEach(c => c.classList.remove('craft-tts-active'));
  activeCellId = null;
}

function syncBar() {
  if (!playing && !paused) { bar.hide(); clearHighlight(); return; }
  const b = bar.show();
  if (!barWired) {
    barWired = true;
    b.rate.value = String(rate);
    on(b.play, 'click', () => togglePause(), sig);
    on(b.prev, 'click', () => jumpCell(-1), sig);
    on(b.next, 'click', () => jumpCell(1), sig);
    on(b.stop, 'click', () => stop(), sig);
    on(b.rate, 'change', () => {
      rate = parseFloat(b.rate.value) || 1;
      store.set(RATE_KEY, String(rate));
      if (playing && !paused) speakCurrentChunk();
    }, sig);
  }
  b.play.textContent = paused ? '▶' : '⏸';
  b.status.textContent = `Cell ${cellIdx + 1}/${queue.length}`;
}

function speakCurrentChunk() {
  const synth = window.speechSynthesis;
  if (!synth) return notifyErr('Web Speech API is not supported in this browser.', 'craftTTS');
  synth.cancel();
  while (cellIdx < queue.length && !getCellEl(queue[cellIdx].id)) {
    cellIdx++; chunks = []; chunkIdx = 0;
  }
  if (cellIdx >= queue.length) { stop(); return; }
  const {id, preferOutput} = queue[cellIdx];
  const cell = getCellEl(id);
  clearHighlight();
  activeCellId = id;
  cell.classList.add('craft-tts-active');
  cell.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  if (!chunks.length) {
    chunks = chunkSentences(extractSpeakableText(cell, preferOutput));
    chunkIdx = 0;
  }
  if (chunkIdx >= chunks.length) {
    cellIdx++; chunks = []; chunkIdx = 0;
    if (cellIdx < queue.length) speakCurrentChunk();
    else stop();
    return;
  }
  const utt = new SpeechSynthesisUtterance(chunks[chunkIdx]);
  utt.rate = rate;
  utt.onend = () => {
    if (!playing || paused) return;
    chunkIdx++;
    speakCurrentChunk();
  };
  utt.onerror = e => {
    if (e.error === 'interrupted' || e.error === 'canceled') return;
    console.warn('craftTTS utterance error', e.error);
    chunkIdx++;
    if (playing && !paused) speakCurrentChunk();
  };
  syncBar();
  synth.speak(utt);
}

function readCells(cells, preferOutput = false) {
  if (!window.speechSynthesis) return notifyErr('Text-to-speech is not available in this browser.', 'craftTTS');
  const list = cells.filter(Boolean).map(c => ({id: normId(c.id), preferOutput})).filter(item => item.id);
  if (!list.length) return notifyErr('No readable cell selected.', 'craftTTS');
  queue = list; cellIdx = 0; chunks = []; chunkIdx = 0; playing = true; paused = false;
  // Initiate speech synchronously inside the user-gesture handler (required for mobile Safari)
  speakCurrentChunk();
}

function readCell(cell = primaryCell(), preferOutput = false) {
  if (cell) readCells([cell], preferOutput);
}

function readFromHere(cell = primaryCell()) {
  const all = allCells({visible: true});
  const idx = cell ? all.indexOf(cell) : -1;
  if (idx < 0) return notifyErr('Select a cell first to read from here.', 'craftTTS');
  readCells(all.slice(idx), false);
}

function togglePause() {
  const synth = window.speechSynthesis;
  if (!synth || !playing) return;
  if (paused) { paused = false; synth.resume(); }
  else { paused = true; synth.pause(); }
  syncBar();
}

function jumpCell(delta) {
  if (!playing) return;
  cellIdx = Math.max(0, Math.min(queue.length - 1, cellIdx + delta));
  chunks = []; chunkIdx = 0; paused = false;
  speakCurrentChunk();
}

function stop() {
  playing = false; paused = false; queue = []; chunks = [];
  try { window.speechSynthesis?.cancel(); } catch {}
  syncBar();
}

/* #a422a2d9 */
/* Lifecycle, Action Menu & Hotkeys */
on(window, 'beforeunload', stop, sig);
on(window, 'pagehide', stop, sig);

const offMenu = window.craftActionMenus?.registerProvider?.(ctx => {
  if (!ctx.cell) return [];
  return [
    {header: 'Read Aloud'},
    {label: 'Read aloud', onClick: () => readCell(ctx.cell, ctx.isOutput)},
    {label: 'Read from here', onClick: () => readFromHere(ctx.cell)},
  ];
});

const reg = spec => window.__hotkeyRegister?.(spec);
reg({id: 'craft-tts-cell', label: 'Read selected cell aloud (TTS)', group: 'CRAFT · Reading', combo: '', handler: () => { readCell(); return true; }});
reg({id: 'craft-tts-from', label: 'Read dialog from selected cell (TTS)', group: 'CRAFT · Reading', combo: '', handler: () => { readFromHere(); return true; }});
reg({id: 'craft-tts-stop', label: 'Stop text-to-speech reader', group: 'CRAFT · Reading', combo: '', handler: () => { stop(); return true; }});

window.craftTTS = {
  __loaded: true,
  readCell, readFromHere, togglePause, stop, extractSpeakableText, chunkSentences,
  disable() {
    stop();
    ac.abort(); offMenu?.();
    bar.destroy();
    delete window.craftTTS;
  },
};
})();
