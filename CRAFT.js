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

/* ── Mobile mode detection ─────────────────────────────────────────────
   Phones and narrow windows get `html.craft-mobile`. Every mobile-only rule
   in CRAFT.css and every mobile branch below keys off this one class, so the
   desktop layout is untouched. The class follows the media query live
   (rotation, window resize). The viewport meta is ensured so Android renders
   at device width instead of a zoomed-out 980px desktop page. */
(() => {
  window.craftMobile?.disable?.();
  const mq = matchMedia('(max-width: 820px), (hover: none) and (pointer: coarse)');
  const root = document.documentElement, listeners = new Set();
  let meta = document.querySelector('meta[name="viewport"]'), addedMeta = false, prevMeta = meta?.content;
  const VIEWPORT = 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content';
  if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; document.head.append(meta); addedMeta = true; }
  if (!/width\s*=\s*device-width/.test(meta.content || '')) meta.content = VIEWPORT;
  else {
    if (!/viewport-fit/.test(meta.content)) meta.content += ', viewport-fit=cover';
    // Android: the soft keyboard shrinks the layout, so the caret and the toolbar stay above it.
    if (!/interactive-widget/.test(meta.content)) meta.content += ', interactive-widget=resizes-content';
  }
  const apply = () => {
    const on = mq.matches;
    if (root.classList.contains('craft-mobile') === on) return;
    root.classList.toggle('craft-mobile', on);
    listeners.forEach(fn => { try { fn(on); } catch (err) { console.error('craftMobile listener', err); } });
  };
  mq.addEventListener('change', apply);
  apply();
  window.craftMobile = {
    active: () => root.classList.contains('craft-mobile'),
    onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    disable() {
      mq.removeEventListener('change', apply);
      root.classList.remove('craft-mobile');
      if (addedMeta) meta.remove(); else if (prevMeta != null) meta.content = prevMeta;
      listeners.clear();
      delete window.craftMobile;
    },
  };
})();


/* ── Lightweight file tree ─────────────────────────────────────────── */
(() => {
  window.solveitFileTree?.disable?.();
  const QUERCUS_JS = '/static/.craft-assets/quercus-treeview.js', QUERCUS_CSS = '/static/.craft-assets/quercus-treeview.css';
  const DOTS_KEY = 'solveit-file-tree:hide-dots';
  const CACHE_KEY = 'solveit-file-tree:v4', CLIP_KEY = 'solveit-file-tree:clipboard', CACHE_MAX_AGE = 180000;
  let panel, tree, loaded = false, filterText = '', restoring = false, previousFocus;
  let refreshTimer, busy = false, menu = null, uploadPop = null, lastTreeDir = null;
  const UPLOAD_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
  const COLLAPSE_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="7 20 12 15 17 20"/><polyline points="7 4 12 9 17 4"/><line x1="4" y1="12" x2="20" y2="12"/></svg>';
  let workspaceRow = null, dlgNameNode = null, dlgNameOrigParent = null, dlgNameOrigNext = null;
  let draggedNode = null, dropHighlightEl = null, hoverExpandTimer = null, hoverExpandPath = null;

  let hideDots = true;
  try { const v = localStorage.getItem(DOTS_KEY); if (v !== null) hideDots = v === '1'; } catch {}

  const OPEN_KEY = 'solveit-file-tree:open';
  function saveOpen(open) { try { sessionStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch {} }
  window.__hotkeyRegister?.({id: 'file-tree-toggle', label: 'Toggle file tree', group: 'File tree', combo: 'Mod+B', handler: () => { toggle(); return true; }});

  const rowsByPath = new Map(), fetchedAtByPath = new Map(), expandedPaths = new Set(), loadingPaths = new Set();
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY));
    if (cached) {
      cached.rows.forEach(([path, rows]) => rowsByPath.set(path, rows));
      cached.fetchedAt.forEach(([path, time]) => fetchedAtByPath.set(path, time));
      cached.expanded.forEach(path => expandedPaths.add(path));
    }
  } catch {}
  function saveCache() {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({rows: [...rowsByPath], fetchedAt: [...fetchedAtByPath], expanded: [...expandedPaths]})); } catch {}
  }

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
  function getClipboard() {
    try { return JSON.parse(sessionStorage.getItem(CLIP_KEY)) || null; } catch { return null; }
  }
  function setClipboard(item) {
    try {
      if (item) sessionStorage.setItem(CLIP_KEY, JSON.stringify(item));
      else sessionStorage.removeItem(CLIP_KEY);
    } catch {}
  }
  function setStatus(msg) {
    const el = panel?.querySelector('.solveit-tree-status');
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
  function nodesFor(path, curAncestors) {
    return (rowsByPath.get(path) || [])
      .filter(n => {
        const fname = n.filename || n.name || '';
        if (!hideDots || !fname.startsWith('.')) return true;
        return n.kind === 'directory' && curAncestors.has(n.path);
      })
      .map(node => node.kind !== 'directory' ? node : ({
        ...node,
        children: rowsByPath.has(node.path)
          ? nodesFor(node.path, curAncestors)
          : [{id: `loading:${node.path}`, name: 'Loading…', kind: 'loading', selectable: false}],
      }));
  }

  function findNode(path) {
    return [...(panel?.querySelectorAll('#solveit-file-tree li[data-node-data]') || [])]
      .find(li => JSON.parse(li.dataset.nodeData).path === path);
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
      const img = document.createElement('img');
      img.className = 'solveit-tree-icon'; img.src = `/static/.craft-assets/vscode-icons/${icon}`; img.alt = '';
      content.append(img);
    }
    const label = document.createElement('span');
    label.className = 'treeview-node-text'; label.textContent = node.name;
    content.append(label);
    if (node.kind === 'directory') {
      const up = document.createElement('button');
      up.type = 'button'; up.className = 'solveit-tree-row-upload'; up.tabIndex = -1;
      up.title = `Upload into ${node.name}`; up.setAttribute('aria-label', `Upload into ${node.name}`);
      up.innerHTML = UPLOAD_SVG;
      content.append(up);
    }
    if (touch && node.kind !== 'loading') {
      const more = document.createElement('button');
      more.type = 'button'; more.className = 'solveit-tree-row-more'; more.tabIndex = -1;
      more.title = `Actions for ${node.name}`; more.setAttribute('aria-label', more.title);
      more.textContent = '⋯';
      content.append(more);
    }
  }

  function renderTree() {
    if (!panel) return;
    const focused = createDraft?.input;
    const draftFocus = focused && document.activeElement === focused ? [focused.selectionStart, focused.selectionEnd] : null;
    const {dir} = getCurrentContext();
    const curAncestors = new Set(ancestorsOf(dir));
    const data = nodesFor('.', curAncestors);
    if (!tree) tree = new Treeview({containerId: 'solveit-file-tree', data, initiallyExpanded: false, nodeSelectionEnabled: false, onRenderNode: renderNode});
    else tree.setData(data);
    restoring = true;
    [...expandedPaths].sort((a, b) => a.length - b.length).forEach(path => {
      const li = findNode(path), expander = li?.querySelector(':scope > .treeview-node-content > .treeview-expander');
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

  async function refreshTree() {
    const button = panel.querySelector('.solveit-tree-refresh');
    button.disabled = true; setStatus('Refreshing files…');
    try {
      const keys = rowsByPath.size ? [...rowsByPath.keys()] : ['.'];
      const results = await Promise.allSettled(keys.map(async p => [p, await getRows(p)]));
      results.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          const [p, rows] = res.value;
          rowsByPath.set(p, rows); fetchedAtByPath.set(p, Date.now());
        } else if (keys[i] !== '.') {
          rowsByPath.delete(keys[i]); fetchedAtByPath.delete(keys[i]); expandedPaths.delete(keys[i]);
        }
      });
      saveCache();
      renderTree(); setStatus('');
    } catch (err) { setStatus(`Could not refresh files: ${err.message || err}`); }
    finally { button.disabled = false; }
  }

  async function ensureCurrentDirLoaded() {
    const {dir} = getCurrentContext();
    const chain = ancestorsOf(dir);
    for (const p of chain) {
      if (p !== '.') expandedPaths.add(p);
      if (!rowsByPath.has(p)) {
        rowsByPath.set(p, await getRows(p));
        fetchedAtByPath.set(p, Date.now());
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
    let overlay = document.querySelector('#solveit-temp-editor');
    if (!overlay) {
      overlay = document.createElement('div'); overlay.id = 'solveit-temp-editor';
      overlay.innerHTML = '<div class="solveit-temp-editor-bar"><strong></strong><button type="button" aria-label="Close editor">×</button></div><iframe title="Temporary file editor"></iframe>';
      overlay.querySelector('button').onclick = () => { overlay.classList.remove('open'); overlay.querySelector('iframe').src = 'about:blank'; };
      document.body.append(overlay);
      const frame = overlay.querySelector('iframe');
      frame.addEventListener('load', () => frame.contentWindow.addEventListener('keydown', e => {
        if (window.solveitHotkeys?.dispatch(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, true));
    }
    overlay.querySelector('strong').textContent = url.searchParams.get('fp') || 'File editor';
    overlay.classList.add('open'); overlay.querySelector('iframe').src = url.href;
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
    const form = document.createElement('form');
    form.className = 'solveit-tree-create';
    form.innerHTML = '<input type="text" autocomplete="off" spellcheck="false" enterkeyhint="done" aria-describedby="solveit-tree-create-error"><div id="solveit-tree-create-error" role="alert"></div>';
    const input = form.querySelector('input'), error = form.querySelector('[role="alert"]');
    input.placeholder = label;
    input.setAttribute('aria-label', label);
    const setError = msg => { error.textContent = msg; input.setAttribute('aria-invalid', String(!!msg)); };
    const draft = createDraft = {dir, form, input};
    form.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); if (!input.readOnly) dismissCreate(true); }
    });
    input.addEventListener('input', () => setError(''));
    form.addEventListener('submit', async e => {
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
    const pop = uploadPop = document.createElement('div');
    pop.className = 'solveit-tree-upload-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', `Upload to ${dest === '.' ? '~/' : dest}`);
    const labelPath = dest === '.' ? '~/' : `~/${dest}/`;
    pop.innerHTML =
      `<div class="solveit-tree-upload-head"><span class="solveit-tree-upload-dest"></span>` +
      `<button type="button" class="solveit-tree-upload-x" aria-label="Close">×</button></div>` +
      `<div class="solveit-tree-upload-drop">Drop files or folders here</div>` +
      `<div class="solveit-tree-upload-actions">` +
      `<button type="button" class="solveit-tree-upload-pick-files">Files…</button>` +
      `<button type="button" class="solveit-tree-upload-pick-dir">Folder…</button>` +
      `</div>` +
      `<input type="file" class="solveit-tree-upload-input-files" multiple hidden>` +
      `<input type="file" class="solveit-tree-upload-input-dir" webkitdirectory multiple hidden>`;

    const destEl = pop.querySelector('.solveit-tree-upload-dest');
    destEl.textContent = `Upload to ${labelPath}`; destEl.title = labelPath;
    const filesInput = pop.querySelector('.solveit-tree-upload-input-files');
    const dirInput = pop.querySelector('.solveit-tree-upload-input-dir');
    const dropZone = pop.querySelector('.solveit-tree-upload-drop');

    pop.querySelector('.solveit-tree-upload-x').onclick = () => closeUploadPop();
    pop.querySelector('.solveit-tree-upload-pick-files').onclick = () => { filesInput.value = ''; filesInput.click(); };
    pop.querySelector('.solveit-tree-upload-pick-dir').onclick = () => { dirInput.value = ''; dirInput.click(); };

    const onPicked = input => () => {
      const items = collectFromFileList(input.files);
      closeUploadPop();
      if (items.length) uploadItemsTo(dest, items);
    };
    filesInput.addEventListener('change', onPicked(filesInput));
    dirInput.addEventListener('change', onPicked(dirInput));

    dropZone.addEventListener('dragover', e => {
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', e => {
      if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      dropZone.classList.remove('dragover');
      const snap = snapshotDataTransfer(e.dataTransfer);
      closeUploadPop();
      handleDroppedTransfer(dest, snap);
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
    menu = document.createElement('div');
    menu.className = 'solveit-tree-menu';
    menu.setAttribute('role', 'menu');
    const item = (label, fn, {disabled = false, title = '', danger = false} = {}) => {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = label;
      b.disabled = disabled; if (title) b.title = title; if (danger) b.className = 'danger';
      b.onclick = ev => { ev.stopPropagation(); closeMenu(); fn(); };
      menu.append(b);
    };
    const sep = () => {
      const hr = document.createElement('hr');
      hr.className = 'solveit-tree-menu-sep';
      menu.append(hr);
    };

    if (!node || node.kind === 'directory') {
      const targetDir = forcedDir ? normPath(forcedDir) : (node ? node.path : '.');
      item('New Dialog…', () => beginCreate(targetDir, 'dialog'));
      item('New File…', () => beginCreate(targetDir, 'file'));
      item('New Folder…', () => beginCreate(targetDir, 'directory'));
      item('Upload…', () => openUploadPop(targetDir, li || e.currentTarget));
      sep();
      if (node) {
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

    panel.addEventListener('dragover', onDragOver);
    panel.addEventListener('drop', onDrop);
    panel.addEventListener('dragleave', onDragLeave);
    treeEl.addEventListener('dragend', onDragEnd);
  }

  /* ── Panel construction & lifecycle ────────────────────────────────── */
  function updateDotsBtn() {
    const dots = panel?.querySelector('.solveit-tree-dots');
    if (!dots) return;
    dots.setAttribute('aria-pressed', String(hideDots));
    const lbl = hideDots ? 'Hidden files are hidden (click to show)' : 'Showing all files (click to hide dot files)';
    dots.title = lbl; dots.setAttribute('aria-label', lbl);
  }

  function makePanel() {
    if (panel) return panel;
    panel = document.createElement('aside'); panel.id = 'solveit-file-tree-panel';
    panel.innerHTML =
      '<div class="solveit-tree-brand"><span class="solveit-tree-appname">solveit</span></div>' +
      '<header><strong>Files</strong>' +
      '<kbd class="solveit-tree-shortcut" data-hotkey="file-tree-toggle">⌘B</kbd>' +
      '<button class="solveit-tree-upload" type="button" aria-label="Upload files or folders" title="Upload files or folders">' + UPLOAD_SVG + '</button>' +
      '<button class="solveit-tree-collapse" type="button" aria-label="Collapse all folders" title="Collapse all folders">' + COLLAPSE_SVG + '</button>' +
      '<button class="solveit-tree-dots" type="button" aria-pressed="true">.*</button>' +
      '<button class="solveit-tree-refresh" type="button" aria-label="Refresh files" title="Refresh files">↻</button>' +
      '<button class="solveit-tree-home" type="button" aria-label="Dialogs home" title="Dialogs home">⌂</button>' +
      '</header>' +
      '<input class="solveit-tree-filter" type="search" placeholder="Filter loaded files…" autocomplete="off">' +
      '<div class="solveit-tree-status" role="status"></div>' +
      '<div class="solveit-tree-rootbar" title="Right-click to create/paste/upload in root; drop here to move or upload to root"><span class="solveit-tree-rootbar-path">~/</span><span class="solveit-tree-rootbar-hint">root · drop / right-click</span><button class="solveit-tree-row-upload" type="button" aria-label="Upload into root" title="Upload into root">' + UPLOAD_SVG + '</button><button class="solveit-tree-row-more" type="button" aria-label="Actions for root" title="New dialog, file, folder…">⋯</button></div>' +
      '<div id="solveit-file-tree" role="tree"></div>';

    dlgNameNode = document.querySelector('nav.monster-navbar h2#dlg-name');
    if (dlgNameNode) {
      dlgNameOrigParent = dlgNameNode.parentNode;
      dlgNameOrigNext = dlgNameNode.nextSibling;
      panel.querySelector('.solveit-tree-brand').append(dlgNameNode);
    }
    panel.addEventListener('click', e => e.stopPropagation());
    panel.querySelector('.solveit-tree-upload').onclick = e => {
      const targetDir = lastTreeDir || getCurrentContext().dir;
      openUploadPop(targetDir, e.currentTarget);
    };
    panel.querySelector('.solveit-tree-collapse').onclick = collapseAllFolders;
    panel.querySelector('.solveit-tree-refresh').onclick = refreshTree;
    updateDotsBtn();
    panel.querySelector('.solveit-tree-dots').onclick = () => {
      hideDots = !hideDots;
      updateDotsBtn();
      try { localStorage.setItem(DOTS_KEY, hideDots ? '1' : '0'); } catch {}
      if (tree) renderTree();
    };
    panel.querySelector('.solveit-tree-home').onclick = () => { location.href = '/?at=.'; };
    window.solveitHotkeys?.refreshChips();
    panel.querySelector('.solveit-tree-filter').addEventListener('input', e => { filterText = e.target.value; tree?.search(filterText); });

    const treeEl = panel.querySelector('#solveit-file-tree');
    const rootbar = panel.querySelector('.solveit-tree-rootbar');
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

    panel.inert = true;
    const scroller = document.querySelector('.uk-container > .overflow-y-auto');
    if (scroller) {
      workspaceRow = document.createElement('div');
      workspaceRow.className = 'solveit-tree-workspace';
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
      if (panel?.classList.contains('open') && [...rowsByPath.keys()].some(path => Date.now() - (fetchedAtByPath.get(path) || 0) > CACHE_MAX_AGE)) refreshTree();
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
      if ([...rowsByPath.keys()].some(path => Date.now() - (fetchedAtByPath.get(path) || 0) > CACHE_MAX_AGE)) refreshTree();
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
    if (active && !menu && !e.target.closest?.('.solveit-tree-filter') && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'ContextMenu', 'F10'].includes(e.key)) {
      if (e.key === 'F10' && !e.shiftKey) return;
      e.stopImmediatePropagation();
      handleTreeKeys(e);
      return;
    }
  };
  document.addEventListener('pointerdown', onDocPointerDown, true);
  window.addEventListener('keydown', onWinKeyDown, true);

  function disable() {
    clearInterval(refreshTimer); refreshTimer = null;
    closeMenu(); closeUploadPop(); dismissCreate(); clearDropState();
    document.removeEventListener('DOMContentLoaded', restoreOpen);
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    window.removeEventListener('keydown', onWinKeyDown, true);
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
    try { if (sessionStorage.getItem(OPEN_KEY) === '1' && !panel?.classList.contains('open')) toggle(false); } catch {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restoreOpen, {once: true});
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

  new MutationObserver(markDotPrompts).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();

/* ── Auto-hiding top nav ──────────────────────────────────────────────
   The reveal trigger is decoupled from the bar. The band starts BELOW the
   browser's own top-edge hotspot so a hidden browser toolbar doesn't fight
   it, and the bar stays pinned while the pointer is over the nav or inside
   an open UIkit drop, fading only after a grace period. */
(() => {
  const TRIGGER_TOP = 28;      // px: clear of the browser's top-edge hotspot
  const TRIGGER_BOTTOM = 76;   // px: bottom of the reveal band
  const HIDE_DELAY = 700;      // ms grace period before fading out

  const SEL = '.uk-container > nav.monster-navbar';
  const PIN = '.uk-drop, .uk-dropdown, .uk-modal, [role="dialog"], [uk-drop], [uk-dropdown]';

  const nav = () => document.querySelector(SEL);
  let timer = null, last = null;

  function wantOpen() {
    if (!last) return false;
    if (last.y >= TRIGGER_TOP && last.y <= TRIGGER_BOTTOM) return true;
    const t = last.target;
    if (t instanceof Element) {
      if (nav()?.contains(t)) return true;
      if (t.closest(PIN)) return true;
    }
    return !!document.querySelector('.uk-drop.uk-open, .uk-dropdown.uk-open');
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

  document.addEventListener('mousemove', e => {
    // Phones: taps emit compat mousemoves, which would flash the bar at random. The mobile toolbar's ☰ drives it instead.
    if (window.craftMobile?.active()) return;
    last = { y: e.clientY, target: e.target };
    sync();
  }, { passive: true });

  document.addEventListener('focusin', e => {
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
        const fs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--craft-code')) || ed.getOption(mon.EditorOption.fontSize);
        ed.updateOptions({ fontSize: fs, lineHeight: fs, fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--craft-code-family').trim() || 'monospace'  });  // line height = font size: glyphs just touch
      } catch (e) {}
    };
    mon.onDidCreateEditor?.(compact);
    mon.getEditors().forEach(compact);
    try { mon.getDiffEditors().forEach(d => { const fs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--craft-code')) || 10; d.updateOptions({ fontSize: fs, lineHeight: fs, fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--craft-code-family').trim() || 'monospace'  }); }); } catch (e) {}
  };
  go();
})();

/* ── Launcher (⌘⇧P) ──────────────────────────────────────────────────
   One fuzzy box over commands (every hotkey-registry action, custom and
   Solveit built-in) and dialogs/files (whatever the file tree has loaded).
   Enter runs or opens the selection; Esc or a click outside closes. */
(() => {
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
    root = document.createElement('div'); root.id = 'solveit-launcher';
    root.innerHTML = '<div class="solveit-launcher-card" role="dialog" aria-label="Launcher"><input type="text" placeholder="Run a command or open a dialog/file…" autocomplete="off" spellcheck="false" aria-label="Search commands and files"><ul role="listbox"></ul></div>';
    input = root.querySelector('input'); list = root.querySelector('ul');
    root.addEventListener('mousedown', e => { if (e.target === root) close(); });
    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(results.length, 1); paint(); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); run(results[sel]); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });
    list.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) run(results[+li.dataset.i]); });
    document.body.append(root);
  }

  function render() {
    const q = input.value.trim().toLowerCase();
    results = pool.map(it => ({it, s: score(q, it.label + ' ' + it.detail)})).filter(r => r.s > 0).sort((a, b) => b.s - a.s).slice(0, 60).map(r => r.it);
    sel = Math.min(sel, Math.max(results.length - 1, 0));
    list.replaceChildren(...(results.length ? results.map((it, i) => {
      const li = document.createElement('li'); li.dataset.i = i; li.className = 'kind-' + it.kind; li.setAttribute('role', 'option');
      for (const [cls, text] of [['label', it.label], ['detail', it.detail], ['hint', it.hint]]) { const s = document.createElement('span'); s.className = cls; s.textContent = text; li.append(s); }
      return li;
    }) : [Object.assign(document.createElement('li'), {className: 'empty', textContent: 'No matches'})]));
    paint();
  }

  function paint() {
    list.querySelectorAll('li[data-i]').forEach(li => { const on = +li.dataset.i === sel; li.setAttribute('aria-selected', String(on)); if (on) li.scrollIntoView({block: 'nearest'}); });
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
    const editingCell = Boolean(editor?.getModel() && !temporary()) || Boolean(document.querySelector('.editable[data-editing="true"]'));
    const active = requested || (!insertionHolds.size && (editingCell || hasDraft()));
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
      if (!temporary() || hasDraft() || document.querySelector('.editable[data-editing="true"]')) return;
      requested = false;
      sync();
    }, 0);
  };
  window.addEventListener('keydown', dismissShortcut, true);
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-editing']});
  document.addEventListener('click', tabClick, true);
  const settleEvent = ['htmx', 'after', 'settle'].join(window.htmx?.config?.metaCharacter || ':');
  document.addEventListener(settleEvent, schedule);
  window.craftIdleComposer = {
    reveal,
    hide,
    show,
    holdForInsertion,
    disable() {
      observer.disconnect();
      document.removeEventListener('click', tabClick, true);
      document.removeEventListener(settleEvent, schedule);
      window.removeEventListener('keydown', dismissShortcut, true);
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

(() => {
  window.craftC2?.disable();
  const key = 'solveit-craft:c2:v1', DLG_KEY = 'solveit-craft:c2:dlgs:v1', ALL_KEY = 'solveit-craft:c2:all', LN_KEY = 'solveit-craft:c2:linenums';
  const requests = new WeakMap(), staticHlText = new WeakMap(), smartSelHist = new WeakMap();
  const ids = new Set(), states = new Map(), views = new Map(), pendingSaves = new Map(), dirtyIds = new Set(), failedSaves = new Set();
  const syncSaveState = id => {
    const el = document.getElementById('_' + id);
    if (!el) return;
    const st = failedSaves.has(id) ? 'error' : (pendingSaves.has(id) ? 'saving' : (dirtyIds.has(id) ? 'dirty' : ''));
    if (st) el.dataset.c2Save = st;
    else delete el.dataset.c2Save;
  };
  const ghostTimers = new Map(), ghostAborts = new Map(), sigAborts = new Map(), saveWaiters = new Map();
  const getTooltipPortal = () => {
    let p = document.getElementById('craft-c2-tooltips');
    if (!p) { p = document.createElement('div'); p.id = 'craft-c2-tooltips'; p.className = 'craft-c2-tooltips'; document.body.append(p); }
    return p;
  };
  try { for (const id of JSON.parse(localStorage.getItem(key) || '[]')) ids.add(id); } catch {}
  let dlgMap = (() => { try { return JSON.parse(localStorage.getItem(DLG_KEY) || '{}') || {}; } catch { return {}; } })();
  const currentDlgKey = () => new URLSearchParams(location.search).get('name') || location.pathname;
  const saveIds = () => {
    try { localStorage.setItem(key, JSON.stringify([...ids])); } catch {}
    try { localStorage.setItem(DLG_KEY, JSON.stringify(dlgMap)); } catch {}
  };
  const recordDlgId = id => {
    const dk = currentDlgKey();
    const list = dlgMap[dk] || (dlgMap[dk] = []);
    if (list.includes(id)) return false;
    list.push(id);
    return true;
  };
  const removeDlgId = id => {
    let changed = false;
    for (const [dk, list] of Object.entries(dlgMap)) {
      if (!Array.isArray(list)) continue;
      const i = list.indexOf(id);
      if (i >= 0) { list.splice(i, 1); changed = true; if (!list.length) delete dlgMap[dk]; }
    }
    return changed;
  };
  const pruneCurrentDlgIds = domIds => {
    const dk = currentDlgKey();
    const list = dlgMap[dk];
    if (!Array.isArray(list) || !list.length) return false;
    let changed = false;
    for (let i = list.length - 1; i >= 0; i--) {
      const id = list[i];
      if (!domIds.has(id)) {
        list.splice(i, 1);
        ids.delete(id);
        changed = true;
      }
    }
    if (!list.length) delete dlgMap[dk];
    return changed;
  };
  let allMode = (() => { try { const v = localStorage.getItem(ALL_KEY); return v == null ? true : v === '1'; } catch { return true; } })();
  let showLineNums = (() => { try { return localStorage.getItem(LN_KEY) === '1'; } catch { return false; } })();

  const isMac = navigator.userAgentData?.platform === 'macOS' || /Mac/.test(navigator.userAgent);
  let parsedServerPrefs = null;
  const getServerPrefs = () => {
    if (!parsedServerPrefs) {
      let enterComp = false, autoClose = false;
      try {
        const s = [...document.querySelectorAll('script')].map(n => n.textContent || '').find(t => t.includes('createMonacoEditor(')) || '';
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

  const LOCAL_CM_BASE = '/static/.craft-assets/cm6';
  const CM_DEPS = 'deps=@codemirror/state@6.5.2,@codemirror/view@6.36.5,@codemirror/language@6.11.0';
  const CM_URLS = {
    state: 'https://esm.sh/@codemirror/state@6.5.2',
    view: 'https://esm.sh/@codemirror/view@6.36.5?deps=@codemirror/state@6.5.2',
    lang: 'https://esm.sh/@codemirror/language@6.11.0?deps=@codemirror/state@6.5.2,@codemirror/view@6.36.5',
    python: `https://esm.sh/@codemirror/lang-python@6.1.7?${CM_DEPS}`,
    cmds: `https://esm.sh/@codemirror/commands@6.8.1?${CM_DEPS}`,
    ac: `https://esm.sh/@codemirror/autocomplete@6.18.6?${CM_DEPS}`,
    search: 'https://esm.sh/@codemirror/search@6.5.10?deps=@codemirror/state@6.5.2,@codemirror/view@6.36.5',
    hl: 'https://esm.sh/@lezer/highlight@1.2.1',
  };
  const LOCAL_LANG_LOADERS = {
    javascript: () => import(`${LOCAL_CM_BASE}/lang-javascript.js`).then(m => m.javascript({jsx: true})),
    typescript: () => import(`${LOCAL_CM_BASE}/lang-javascript.js`).then(m => m.javascript({typescript: true, jsx: true})),
    html: () => import(`${LOCAL_CM_BASE}/lang-html.js`).then(m => m.html()),
    css: () => import(`${LOCAL_CM_BASE}/lang-css.js`).then(m => m.css()),
    json: () => import(`${LOCAL_CM_BASE}/lang-json.js`).then(m => m.json()),
    sql: () => import(`${LOCAL_CM_BASE}/lang-sql.js`).then(m => m.sql()),
    markdown: () => import(`${LOCAL_CM_BASE}/lang-markdown.js`).then(m => m.markdown()),
    xml: () => import(`${LOCAL_CM_BASE}/lang-xml.js`).then(m => m.xml()),
    yaml: () => import(`${LOCAL_CM_BASE}/lang-yaml.js`).then(m => m.yaml()),
    rust: () => import(`${LOCAL_CM_BASE}/lang-rust.js`).then(m => m.rust()),
    cpp: () => import(`${LOCAL_CM_BASE}/lang-cpp.js`).then(m => m.cpp()),
    shell: () => import(`${LOCAL_CM_BASE}/mode-shell.js`).then(m => cmCache.lang.StreamLanguage.define(m.shell)),
  };
  const CDN_LANG_LOADERS = {
    javascript: () => import(`https://esm.sh/@codemirror/lang-javascript@6?${CM_DEPS}`).then(m => m.javascript({jsx: true})),
    typescript: () => import(`https://esm.sh/@codemirror/lang-javascript@6?${CM_DEPS}`).then(m => m.javascript({typescript: true, jsx: true})),
    html: () => import(`https://esm.sh/@codemirror/lang-html@6?${CM_DEPS}`).then(m => m.html()),
    css: () => import(`https://esm.sh/@codemirror/lang-css@6?${CM_DEPS}`).then(m => m.css()),
    json: () => import(`https://esm.sh/@codemirror/lang-json@6?${CM_DEPS}`).then(m => m.json()),
    sql: () => import(`https://esm.sh/@codemirror/lang-sql@6?${CM_DEPS}`).then(m => m.sql()),
    markdown: () => import(`https://esm.sh/@codemirror/lang-markdown@6?${CM_DEPS}`).then(m => m.markdown()),
    xml: () => import(`https://esm.sh/@codemirror/lang-xml@6?${CM_DEPS}`).then(m => m.xml()),
    yaml: () => import(`https://esm.sh/@codemirror/lang-yaml@6?${CM_DEPS}`).then(m => m.yaml()),
    rust: () => import(`https://esm.sh/@codemirror/lang-rust@6?${CM_DEPS}`).then(m => m.rust()),
    cpp: () => import(`https://esm.sh/@codemirror/lang-cpp@6?${CM_DEPS}`).then(m => m.cpp()),
    shell: () => import(`https://esm.sh/@codemirror/legacy-modes@6.5.1/mode/shell?${CM_DEPS}`).then(m => cmCache.lang.StreamLanguage.define(m.shell)),
  };
  const LANG_ALIASES = {
    py: 'python', py3: 'python', python3: 'python',
    js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    md: 'markdown', svg: 'xml', yml: 'yaml', rs: 'rust', c: 'cpp', 'c++': 'cpp', cxx: 'cpp',
    bash: 'shell', sh: 'shell', zsh: 'shell', shell: 'shell', script: 'shell',
  };
  const langCache = window.__craftCM6Langs ??= new Map();

  let cmCache = null, draft = null, frame = null, activeId = null, pendingPointer = null, bypassMonacoId = null, destroyed = false;

  const isDark = () => document.documentElement.classList.contains('dark');
  const kernelLang = () => (document.getElementById('kid')?.dataset.language || 'python').toLowerCase();
  const fimEnabled = () => kernelLang() === 'python';
  const dialogMode = () => document.querySelector('[name=mode]')?.value || '';
  const notifyErr = msg => {
    const d = document.createElement('div');
    d.textContent = String(msg || 'Request failed.');
    if (window.UIkit?.notification) window.UIkit.notification(d.innerHTML, {status: 'destructive', pos: 'bottom-right'});
    else console.error('craftC2:', msg);
  };

  const buildStyles = cm => {
    const t = cm.hl.tags;
    cm.ghDarkStyle = cm.lang.HighlightStyle.define([
      {tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#6a737d'},
      {tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.operator, t.compareOperator, t.logicOperator, t.arithmeticOperator, t.bitwiseOperator, t.updateOperator], color: '#f97583'},
      {tag: [t.string, t.special(t.string), t.docString], color: '#9ecbff'},
      {tag: [t.regexp], color: '#dbedff'},
      {tag: [t.self, t.escape, t.number, t.integer, t.float, t.bool, t.null, t.atom, t.constant(t.variableName), t.propertyName, t.attributeName, t.standard(t.variableName), t.special(t.variableName), t.link, t.url], color: '#79b8ff'},
      {tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName)), t.className, t.definition(t.className), t.typeName, t.meta, t.annotation], color: '#b392f0'},
      {tag: [t.tagName], color: '#85e89d'},
      {tag: [t.heading], color: '#79b8ff', fontWeight: 'bold'},
      {tag: [t.strong], fontWeight: 'bold', color: '#e1e4e8'},
      {tag: [t.emphasis], fontStyle: 'italic', color: '#e1e4e8'},
      {tag: [t.variableName, t.definition(t.variableName), t.punctuation, t.bracket, t.paren, t.squareBracket, t.brace], color: '#e1e4e8'},
      {tag: [t.invalid], color: '#fdaeb7', fontStyle: 'italic'},
    ]);
    cm.ghLightStyle = cm.lang.HighlightStyle.define([
      {tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#6a737d'},
      {tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.operator, t.compareOperator, t.logicOperator, t.arithmeticOperator, t.bitwiseOperator, t.updateOperator], color: '#d73a49'},
      {tag: [t.string, t.special(t.string), t.docString], color: '#032f62'},
      {tag: [t.regexp], color: '#032f62'},
      {tag: [t.self, t.escape, t.number, t.integer, t.float, t.bool, t.null, t.atom, t.constant(t.variableName), t.propertyName, t.attributeName, t.standard(t.variableName), t.special(t.variableName), t.link, t.url], color: '#005cc5'},
      {tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName)), t.className, t.definition(t.className), t.typeName, t.meta, t.annotation], color: '#6f42c1'},
      {tag: [t.tagName], color: '#22863a'},
      {tag: [t.heading], color: '#005cc5', fontWeight: 'bold'},
      {tag: [t.strong], fontWeight: 'bold', color: '#24292e'},
      {tag: [t.emphasis], fontStyle: 'italic', color: '#24292e'},
      {tag: [t.variableName, t.definition(t.variableName), t.punctuation, t.bracket, t.paren, t.squareBracket, t.brace], color: '#24292e'},
      {tag: [t.invalid], color: '#cb2431', fontStyle: 'italic'},
    ]);
    cm.darkTheme = cm.view.EditorView.theme({'&': {lineHeight: '1'}, '.cm-scroller': {lineHeight: '1'}}, {dark: true});
    cm.lightTheme = cm.view.EditorView.theme({'&': {lineHeight: '1'}, '.cm-scroller': {lineHeight: '1'}}, {dark: false});
    cm.theme = cm.darkTheme;
    return cm;
  };

  const loadCM = () => window.__craftCM6LocalPromise ??= (async () => {
    try {
      const mod = await import(`${LOCAL_CM_BASE}/index.js`);
      const cm = {...mod, _source: 'local'};
      return buildStyles(cm);
    } catch (localErr) {
      console.warn('craftC2: local CM6 bundle unavailable, falling back to esm.sh', localErr);
      const entries = await Promise.all(Object.entries(CM_URLS).map(async ([k, u]) => [k, await import(u)]));
      const cm = Object.fromEntries(entries);
      cm._source = 'cdn';
      return buildStyles(cm);
    }
  })().catch(err => {
    window.__craftCM6LocalPromise = null;
    console.error('craftC2: failed to load CodeMirror 6', err);
    throw err;
  });
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
        const span = document.createElement('span');
        span.className = 'craft-c2-ghost';
        span.textContent = this.text;
        return span;
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
        const dom = document.createElement('div');
        dom.className = 'craft-c2-sighelp';
        const render = cur => {
          dom.replaceChildren();
          const s = cur.values[cur.active] || cur.values[0];
          if (!s) return;
          const head = document.createElement('div');
          head.className = 'craft-c2-sig-head';
          const sigEl = document.createElement('span');
          sigEl.className = 'craft-c2-sig-label';
          const descs = (s.params || []).map(p => typeof p === 'string' ? p : String(p.desc || p.name || '').replace(/^param /, ''));
          const fullLabel = String(s.label || '');
          const openIdx = fullLabel.indexOf('('), closeIdx = fullLabel.lastIndexOf(')');
          const fnName = openIdx >= 0 ? fullLabel.slice(0, openIdx) : fullLabel;
          const tail = closeIdx >= 0 ? fullLabel.slice(closeIdx) : ')';
          sigEl.append(fnName + '(');
          descs.forEach((d, i) => {
            if (i > 0) sigEl.append(', ');
            if (i === s.idx) {
              const st = document.createElement('strong');
              st.className = 'craft-c2-sig-active';
              st.textContent = d;
              sigEl.append(st);
            } else sigEl.append(d);
          });
          sigEl.append(tail);
          head.append(sigEl);
          if (cur.values.length > 1) {
            const nav = document.createElement('span');
            nav.className = 'craft-c2-sig-nav';
            const mkBtn = (txt, delta) => {
              const b = document.createElement('button');
              b.type = 'button';
              b.textContent = txt;
              b.addEventListener('mousedown', e => {
                e.preventDefault();
                const n = cur.values.length;
                edView.dispatch({effects: setSigHelp.of({...cur, active: (cur.active + delta + n) % n})});
              });
              return b;
            };
            nav.append(mkBtn('▲', -1), ` ${cur.active + 1}/${cur.values.length} `, mkBtn('▼', 1));
            head.append(nav);
          }
          dom.append(head);
          if (s.typ || s.mod) {
            const meta = document.createElement('div');
            meta.className = 'craft-c2-sig-meta';
            if (s.typ) {
              const b = document.createElement('b'); b.textContent = 'Type: ';
              const k = document.createElement('kbd'); k.textContent = s.typ;
              meta.append(b, k, ' ');
            }
            if (s.mod) {
              const b = document.createElement('b'); b.textContent = 'Module: ';
              const k = document.createElement('kbd'); k.textContent = s.mod;
              meta.append(b, k);
            }
            dom.append(meta);
          }
          if (s.doc) {
            const pre = document.createElement('pre');
            pre.className = 'craft-c2-sig-doc';
            pre.textContent = s.doc;
            dom.append(pre);
          }
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
        const form = document.createElement('form');
        form.className = 'craft-c2-ai-form';
        const input = document.createElement('input');
        input.type = 'text';
        input.name = 'query';
        input.autocomplete = 'off';
        input.placeholder = 'Enter your query... (Enter to apply, Esc to cancel)';
        input.className = 'craft-c2-ai-input';
        form.append(input);
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
        const span = document.createElement('span');
        span.className = 'craft-c2-fold ' + (open ? 'is-open' : 'is-closed');
        span.textContent = open ? '▾' : '▸';
        return span;
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
    if (langKey === 'python') return cm.python.python();
    const cacheKey = `${cm._source || 'cdn'}:${langKey}`;
    if (langCache.has(cacheKey)) return langCache.get(cacheKey);
    const loaders = cm._source === 'local' ? LOCAL_LANG_LOADERS : CDN_LANG_LOADERS;
    const loader = loaders[langKey];
    if (!loader) return [];
    try {
      const ext = await loader();
      langCache.set(cacheKey, ext);
      return ext;
    } catch (err) {
      console.warn('craftC2: language fallback to plaintext for', langKey, err);
      return [];
    }
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
        const span = document.createElement('span');
        span.setAttribute('style', cls.trim().replace(/\s+/g, ';'));
        span.textContent = text.slice(from, to);
        frag.append(span);
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
      if (destroyed || !codeEl.isConnected) return;
      const curCard = codeEl.closest('.card-in');
      if (curCard?.classList.contains('craft-c2-mounted')) return;
      if ((codeEl.textContent || '') !== text) return;
      const p = ext?.language?.parser || ext?.parser;
      if (p) renderStaticHighlight(codeEl, text, p.parse(text), langKey);
    });
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
    const sel = v.state.selection.main;
    const selSpec = {anchor: sel.anchor, head: sel.head};
    cancelGhost(id, v);
    const saved = await saveCell(id, v.state.doc.toString());
    if (!saved) return;
    unmountCell(id);
    if (ids.delete(id) | removeDlgId(id)) saveIds();
    const el = getCellEl(id);
    if (el) window.selectMsg?.(window.$(el), {scroll: false});
    const kid = document.getElementById('kid')?.value || '';
    try {
      await window.htmx.ajax('POST', '/set_mtyp_', {
        source: '#kid',
        swap: 'none',
        values: {kid, id_: '_' + id, ids: '_' + id, mtyp},
      });
      if (window.craftMd) {
        for (let i = 0; i < 60; i++) {
          if (getCellEl(id)?.querySelector(':scope > .card-in')?.dataset.mtype === mtyp) {
            window.craftMd.edit(id, selSpec);
            break;
          }
          await new Promise(r => setTimeout(r, 40));
        }
      }
    } catch (err) {
      notifyErr('Could not change cell type.');
      console.error('craftC2: set_mtyp failed', err);
    }
  }

  async function jumpToLastCell(id) {
    await exitCell(id);
    const all = [...document.querySelectorAll('#dialog-container > .editable')].filter(e => !e.hidden && getComputedStyle(e).display !== 'none');
    const last = all[all.length - 1];
    if (!last) return;
    if (isC2El(last) && !getCardIn(last)?.classList.contains('collapsed')) {
      last.scrollIntoView({block: 'nearest'});
      openCell(last.id.replace(/^_/, ''), {toEnd: true});
    } else if (window.craftMd?.manages?.(last.id)) {
      last.scrollIntoView({block: 'nearest'});
      window.craftMd.edit(last.id, {toEnd: true});
    } else {
      last.querySelector('div[hx-post^="/editor_"]')?.click();
    }
  }

  const editorId = () => String(document.querySelector('#full_editor #id_')?.value || '').replace(/^_/, '');
  const model = () => window.editor?.getModel();
  const choice = () => draft && draft.id === editorId() && draft.model === model() ? draft.c2 : (allMode || ids.has(editorId()));
  const select = c2 => { draft = {id: editorId(), model: model(), c2}; };
  const getCellEl = id => document.getElementById('_' + id);
  const getCardIn = el => el?.querySelector('.card-in[data-mtype="code"]');
  const getCellText = el => el?.querySelector('form [name="content"]')?.value ?? '';
  const hasDiff = el => !!(el && (el.dataset.diff || el.querySelector('[data-diff]')));
  let nonCodeInsertion = null;
  const isNonCodeInsertion = id => nonCodeInsertion && !nonCodeInsertion.has(id);
  const isC2El = el => !!el && !isNonCodeInsertion(el.id) && !!getCardIn(el) && !hasDiff(el) && (allMode || ids.has(el.id.replace(/^_/, '')));
  const typingBlocked = () => !!document.activeElement?.closest('input,textarea,select,[contenteditable],.monaco-editor,#full_editor,.hk-overlay.open,#solveit-launcher.open,[role="dialog"],.uk-modal.uk-open');

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
    try { localStorage.setItem(LN_KEY, showLineNums ? '1' : '0'); } catch {}
    for (const [id, rec] of views) syncCellLineNumbers(id, rec);
  };
  const setAllMode = on => {
    allMode = Boolean(on);
    try { localStorage.setItem(ALL_KEY, allMode ? '1' : '0'); } catch {}
    if (!allMode) {
      for (const id of [...views.keys()]) if (!ids.has(id) && !dirtyIds.has(id)) unmountCell(id);
    }
    schedule();
  };
  async function openInMonaco(id) {
    autoEditGuard = null;
    const k = String(id).replace(/^_/, '');
    const rec = views.get(k);
    if (rec) {
      const ok = await saveCell(k, rec.view.state.doc.toString());
      if (!ok) return;
      unmountCell(k);
    }
    const btn = getCellEl(k)?.querySelector('.card-in [hx-post="/editor_"]');
    if (!btn) return;
    bypassMonacoId = k;
    window.craftIdleComposer?.reveal();
    btn.click();
    setTimeout(() => { if (bypassMonacoId === k) bypassMonacoId = null; }, 500);
  }

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

  const queueAutoEdit = ({tagC2 = false, forceCode = false, ttl = 6000} = {}) => {
    clearAutoEditGuard();
    const existing = new Set([...document.querySelectorAll('#dialog-container .editable[id]')].map(el => el.id));
    pendingAutoEdits.push({existing, tagC2, forceCode, expires: Date.now() + ttl});
  };

  const claimNewCell = (nid, {tagC2 = false, forceCode = false} = {}) => {
    clearAutoEditGuard();
    autoEditGuard = {
      id: nid, tagC2, forceCode, wantOpen: true, canceling: false, cancelAt: 0, converted: false,
      holdRelease: window.craftIdleComposer?.holdForInsertion?.() || null,
      expires: Date.now() + 4000,
    };
    if (tagC2) { ids.add(nid); recordDlgId(nid); saveIds(); }
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
    if (destroyed) return;
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
    if (destroyed) return;
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
    if (!allMode) return false;
    if (editorId()) return false;
    const uri = model()?.uri?.path || '';
    if (uri && !uri.endsWith('/temp')) return false;
    if (window.edValue?.().trim()) return false;
    if (document.querySelector('.editable[data-editing="true"]')) return false;
    return true;
  }

  async function newCodeCell() {
    if (destroyed) return false;
    if (activeId) await exitCell(activeId);
    const fullEd = document.getElementById('full_editor');
    if (fullEd?.contains(document.activeElement)) document.activeElement.blur();
    window.craftIdleComposer?.hide?.();
    const kid = document.getElementById('kid')?.value || '';
    if (!kid) return false;
    const allCells = [...document.querySelectorAll('#dialog-container > .editable[id]')];
    const last = allCells[allCells.length - 1];
    queueAutoEdit({tagC2: !allMode, forceCode: true});
    const unhide = window.craftIdleComposer?.holdForInsertion();
    try {
      if (last) {
        const lastId = last.id.replace(/^_/, '');
        const after = window.sectionTail ? window.sectionTail(last) : last.id;
        await window.htmx.ajax('POST', '/add_below_', {
          source: '#kid', swap: 'none',
          values: {kid, id_: lastId, after},
        });
      } else {
        await window.htmx.ajax('POST', '/upsert_msg_', {
          source: '#kid', swap: 'none',
          values: {kid, id_: '', msg_type: 'code', is_input: '1', content: ''},
        });
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
    if (v.state.selection.ranges.length !== 1 || !v.state.selection.main.empty) return false;
    if (cmCache.ac.completionStatus(v.state) || v.state.field(sigHelpField, false) || v.state.field(aiEditField, false)) return false;
    const head = v.state.selection.main.head;
    const doc = v.state.doc;
    const edgePos = up ? 0 : doc.length;
    const cHead = v.coordsAtPos(head), cEdge = v.coordsAtPos(edgePos);
    const atEdge = cHead && cEdge ? Math.abs(cHead.top - cEdge.top) <= 2 : doc.lineAt(head).number === (up ? 1 : doc.lines);
    if (!atEdge) return false;
    const el = getCellEl(id);
    const next = el && window.adjacentMsg?.(window.$(el), up);
    const nextEl = next?.[0];
    if (!nextEl || nextEl === el) return false;
    cancelGhost(id, v);
    const content = doc.toString();
    states.set(id, v.state);
    delete el.dataset.c2Editing;
    if (activeId === id) activeId = null;
    v.contentDOM.blur();
    saveCell(id, content).then(ok => {
      const cur = views.get(id);
      if (ok && cur && !cur.view.hasFocus && activeId !== id && !dirtyIds.has(id) && !(cmCache && hasFolds(cmCache, cur.view.state))) unmountCell(id);
    });
    if (isC2El(nextEl) && !getCardIn(nextEl)?.classList.contains('collapsed')) {
      nextEl.scrollIntoView({block: 'nearest'});
      openCell(nextEl.id.replace(/^_/, ''), up ? {toEnd: true} : {anchor: 0, head: 0});
    } else if (window.craftMd?.manages?.(nextEl.id)) {
      nextEl.scrollIntoView({block: 'nearest'});
      window.craftMd.edit(nextEl.id, up ? {toEnd: true} : {anchor: 0, head: 0});
    } else {
      window.selectMsg?.(next);
    }
    return true;
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
    if (destroyed || !cmCache || !fimEnabled()) return;
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
      sp = document.createElement('div');
      sp.className = 'craft-c2-spinner';
      sp.setAttribute('data-uk-spinner', 'ratio: 0.5');
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

  async function splitCell(id, v) {
    const kid = document.getElementById('kid')?.value || '';
    const content = v.state.doc.toString();
    const linenos = [...new Set(v.state.selection.ranges.map(r => v.state.doc.lineAt(r.from).number))];
    cancelGhost(id, v);
    try {
      await window.htmx.ajax('POST', '/split_at_', {
        source: '#kid',
        swap: 'none',
        values: {content, linenos: JSON.stringify(linenos), id_: id, kid, msg_type: 'code', is_input: '1'},
      });
      dirtyIds.delete(id);
      failedSaves.delete(id);
      syncSaveState(id);
      unmountCell(id);
    } catch (err) {
      notifyErr('Could not split cell.');
      console.error('craftC2: split failed', err);
    }
  }

  async function saveCell(id, content) {
    const el = getCellEl(id);
    if (!el) return true;
    const prev = getCellText(el);
    if (content === prev) {
      dirtyIds.delete(id);
      failedSaves.delete(id);
      syncSaveState(id);
      return pendingSaves.get(id) ? await pendingSaves.get(id) : true;
    }
    dirtyIds.add(id);
    failedSaves.delete(id);
    syncSaveState(id);
    const kid = document.getElementById('kid')?.value || '';
    const p = (async () => {
      let resolveReq;
      const statusP = new Promise(r => { resolveReq = r; });
      const waiters = saveWaiters.get(id) || [];
      waiters.push(resolveReq);
      saveWaiters.set(id, waiters);
      let ok = false;
      try {
        const ajaxP = window.htmx.ajax('POST', '/set_contents_', {
          source: '#kid',
          swap: 'none',
          values: {kid, id_: '_' + id, ids: id, contents: JSON.stringify({[id]: content})},
        }).then(() => statusP).catch(() => false);
        const timeoutP = new Promise(r => setTimeout(() => r(false), 8000));
        ok = Boolean(await Promise.race([ajaxP, timeoutP]));
      } catch (err) {
        console.error('craftC2: save failed', err);
        ok = false;
      } finally {
        const list = saveWaiters.get(id);
        if (list) {
          const i = list.indexOf(resolveReq);
          if (i >= 0) list.splice(i, 1);
          if (!list.length) saveWaiters.delete(id);
        }
        if (pendingSaves.get(id) === p) pendingSaves.delete(id);
      }
      if (ok) {
        failedSaves.delete(id);
        const curEl = getCellEl(id);
        const inp = curEl?.querySelector('form [name="content"]');
        if (inp && inp.value === prev) inp.value = content;
        const curView = views.get(id)?.view;
        if (!curView || curView.state.doc.toString() === content) dirtyIds.delete(id);
      } else {
        failedSaves.add(id);
        notifyErr('Could not save cell edit — changes kept in editor.');
      }
      syncSaveState(id);
      return ok;
    })();
    pendingSaves.set(id, p);
    syncSaveState(id);
    return await p;
  }

  function unmountCell(id) {
    cancelGhost(id);
    const ab = sigAborts.get(id);
    if (ab) { ab.abort(); sigAborts.delete(id); }
    const rec = views.get(id);
    if (!rec) return;
    const docText = rec.view.state.doc.toString();
    states.set(id, rec.view.state);
    const el = getCellEl(id);
    const card = getCardIn(el);
    const codeEl = card?.querySelector('.msg-body .msg-content pre code');
    if (codeEl) {
      if (cmCache && docText.trim()) {
        const tree = cmCache.lang.ensureSyntaxTree(rec.view.state, docText.length, 200) || cmCache.lang.syntaxTree(rec.view.state);
        renderStaticHighlight(codeEl, docText, tree, rec.langKey || detectLangKey(docText));
      } else {
        codeEl.textContent = docText;
        staticHlText.delete(codeEl);
      }
    }
    rec.view.destroy();
    rec.host.remove();
    views.delete(id);
    card?.classList.remove('craft-c2-mounted');
    if (el) delete el.dataset.c2Editing;
    if (activeId === id) activeId = null;
  }

  async function onCellBlur(id) {
    cancelGhost(id);
    const rec = views.get(id);
    if (!rec) return;
    const el = getCellEl(id);
    if (el) delete el.dataset.c2Editing;
    if (activeId === id) activeId = null;
    const content = rec.view.state.doc.toString();
    states.set(id, rec.view.state);
    const saved = await saveCell(id, content);
    const cur = views.get(id);
    if (!cur || cur.view.hasFocus || activeId === id) return;
    if (!saved || dirtyIds.has(id)) return;
    if (cmCache && hasFolds(cmCache, cur.view.state)) return;
    unmountCell(id);
  }

  async function exitCell(id) {
    cancelGhost(id);
    const rec = views.get(id);
    const el = getCellEl(id);
    if (rec) {
      rec.view.contentDOM.blur();
      if (el) window.selectMsg?.(window.$(el), {scroll: false});
      await onCellBlur(id);
    }
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }

  async function saveAndRun(id, cmd) {
    cancelGhost(id);
    const rec = views.get(id);
    const el = getCellEl(id);
    if (!rec || !el) return;
    const content = rec.view.state.doc.toString();
    const next = cmd === 'shift-run' ? window.adjacentMsg?.(window.$(el), false) : null;
    const after = cmd === 'alt-run' ? (window.sectionTail?.(el) || '') : '';
    states.set(id, rec.view.state);
    const saved = await saveCell(id, content);
    if (!saved) return;
    delete el.dataset.c2Editing;
    if (activeId === id) activeId = null;
    rec.view.contentDOM.blur();
    if (cmd === 'shift-run' && next?.length) window.selectMsg?.(next);
    else window.selectMsg?.(window.$(el), {scroll: false});
    const cur = views.get(id);
    if (cur && !cur.view.hasFocus && activeId !== id && !dirtyIds.has(id) && !(cmCache && hasFolds(cmCache, cur.view.state))) unmountCell(id);
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
    } catch (err) { console.error('craftC2: run failed', err); }
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
        if (!u.view.hasFocus && activeId !== id && !pendingSaves.has(id) && !dirtyIds.has(id) && !hasFolds(cm, u.state)) {
          queueMicrotask(() => {
            const cur = views.get(id);
            if (cur && !cur.view.hasFocus && activeId !== id && !pendingSaves.has(id) && !dirtyIds.has(id) && !hasFolds(cm, cur.view.state)) unmountCell(id);
          });
        }
      }),
    ];
  }

  function applySelection(v, selSpec) {
    const len = v.state.doc.length;
    const clamp = n => Math.max(0, Math.min(len, n));
    if (selSpec?.anchor != null) {
      const anchor = clamp(selSpec.anchor);
      const head = clamp(selSpec.head ?? anchor);
      v.dispatch({selection: {anchor, head}});
    } else if (selSpec?.coords) {
      const pos = v.posAtCoords(selSpec.coords);
      v.dispatch({selection: {anchor: pos != null ? clamp(pos) : len}});
    } else if (selSpec?.toEnd) {
      v.dispatch({selection: {anchor: len}});
    }
  }

  async function openCell(id, selSpec = null) {
    if (destroyed) return;
    const cm = cmCache || await loadCM();
    cmCache = cm;
    if (destroyed) return;
    const el = getCellEl(id), card = getCardIn(el);
    if (!el || !card || hasDiff(el) || card.classList.contains('collapsed')) return;
    const body = card.querySelector('.msg-body'), contentEl = body?.querySelector('.msg-content');
    if (!body || !contentEl) return;
    if (autoEditGuard && autoEditGuard.id !== id) clearAutoEditGuard();
    window.selectMsg?.(window.$(el), {scroll: false});
    const text = getCellText(el);
    let rec = views.get(id);
    if (rec) {
      if (!body.contains(rec.host)) { contentEl.after(rec.host); card.classList.add('craft-c2-mounted'); }
      if (rec.view.state.doc.toString() !== text && !pendingSaves.has(id) && !dirtyIds.has(id)) {
        rec.view.dispatch({changes: {from: 0, to: rec.view.state.doc.length, insert: text}});
      }
      if (selSpec) applySelection(rec.view, selSpec);
      activeId = id;
      el.dataset.c2Editing = 'true';
      syncFindBoxToView(rec.view);
      rec.view.focus();
      syncCellLanguage(id, rec.view);
      return;
    }
    const langComp = new cm.state.Compartment();
    const themeComp = new cm.state.Compartment();
    const readOnlyComp = new cm.state.Compartment();
    const lineNumComp = new cm.state.Compartment();
    const comps = {langComp, themeComp, readOnlyComp, lineNumComp};
    const prevState = states.get(id);
    const reusePrev = prevState && prevState.doc.toString() === text && prevState._c2Comps && prevState._c2Comps.lineNumComp;
    const edState = reusePrev
      ? prevState
      : cm.state.EditorState.create({doc: text, extensions: buildExtensions(cm, id, comps)});
    const activeComps = reusePrev ? prevState._c2Comps : comps;
    edState._c2Comps = activeComps;
    const host = document.createElement('div');
    host.className = 'craft-c2-host';
    contentEl.after(host);
    card.classList.add('craft-c2-mounted');
    el.dataset.c2Editing = 'true';
    const v = new cm.view.EditorView({state: edState, parent: host});
    host.addEventListener('keydown', e => { e.stopPropagation(); });
    host.addEventListener('focusin', () => {
      activeId = id;
      const curEl = getCellEl(id);
      if (curEl) curEl.dataset.c2Editing = 'true';
    });
    host.addEventListener('focusout', () => {
      const check = () => {
        if (destroyed) return;
        if (!host.isConnected) { sync(); return; }
        const ae = document.activeElement;
        if (host.contains(ae) || ae?.closest?.('.cm-tooltip')) return;
        onCellBlur(id);
      };
      queueMicrotask(() => {
        if (destroyed) return;
        if (!host.isConnected) { sync(); return; }
        requestAnimationFrame(check);
      });
    });
    rec = {view: v, host, ...activeComps, langKey: 'python', showLN: null};
    views.set(id, rec);
    activeId = id;
    el.dataset.c2Editing = 'true';
    if (reusePrev) v.dispatch({effects: activeComps.themeComp.reconfigure(themeExtensions(cm))});
    syncCellLineNumbers(id, rec);
    applySelection(v, selSpec || (reusePrev ? null : {toEnd: true}));
    syncFindBoxToView(v);
    v.focus();
    requestAnimationFrame(() => {
      if (!destroyed && activeId === id && views.get(id)?.view === v && !v.hasFocus && document.activeElement === document.body) v.focus();
    });
    syncCellLanguage(id, v);
  }

  const offsetIn = (root, node, offset) => {
    if (!root || !node || !root.contains(node)) return null;
    try {
      const r = document.createRange();
      r.selectNodeContents(root);
      r.setEnd(node, offset);
      return r.toString().length;
    } catch { return null; }
  };

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

  const onKeyDown = e => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (typingBlocked()) return;
    const el = document.querySelector('#dialog-container .editable[data-sm="primary"]');
    if (!isC2El(el)) return;
    const card = getCardIn(el);
    if (!card || card.classList.contains('collapsed')) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    openCell(el.id.replace(/^_/, ''));
  };

  const sync = () => {
    frame = null;
    const code = document.querySelector('#full_editor #tabh-code');
    if (allMode) {
      document.getElementById('tabh-craft-c2')?.remove();
    } else if (code && !document.getElementById('tabh-craft-c2')) {
      const tab = document.createElement('li');
      tab.className = 'tabh'; tab.id = 'tabh-craft-c2';
      const link = document.createElement('a');
      link.href = '#'; link.role = 'tab'; link.textContent = 'C2';
      tab.append(link); code.after(tab);
    }
    const c2 = document.getElementById('tabh-craft-c2');
    if (c2) {
      const active = document.querySelector('#full_editor #msg_type')?.value === 'code' && choice();
      c2.classList.toggle('uk-active', active);
      c2.firstElementChild.setAttribute('aria-selected', String(active));
      if (active) code?.classList.remove('uk-active');
    }
    bindMonacoWatcher();
    reconcileCreates();
    reconcileAutoEdits();
    driveAutoEdit();
    const domIds = new Set();
    let idsChanged = false;
    for (const card of document.querySelectorAll('#dialog-container .editable .card-in')) {
      const el = card.closest('.editable');
      const id = el.id.replace(/^_/, '');
      domIds.add(id);
      if (card.dataset.mtype !== 'code' && ids.has(id)) {
        ids.delete(id);
        removeDlgId(id);
        idsChanged = true;
      }
      const isC2 = isC2El(el);
      if (ids.has(id) && recordDlgId(id)) idsChanged = true;
      el.classList.toggle('craft-c2', isC2);
      syncSaveState(id);
      const outCard = el.querySelector(':scope > .card-out');
      if (outCard) outCard.classList.toggle('craft-c2-traceback', card.dataset.mtype === 'code' && hasTraceback(el));
      if (card.dataset.mtype === 'code' && !card.classList.contains('craft-c2-mounted') && !card.closest('[data-streaming]')) {
        ensureStaticHighlighted(card);
      }
      const header = card.querySelector('.uk-card-header [data-tokens]');
      const badge = header?.querySelector('.craft-c2-badge');
      if (!isC2 || allMode) { badge?.remove(); continue; }
      if (!header || badge) continue;
      const label = document.createElement('span');
      label.className = 'craft-c2-badge'; label.textContent = ' · C2'; header.append(label);
    }
    if (domIds.size && pruneCurrentDlgIds(domIds)) idsChanged = true;
    if (idsChanged) saveIds();
    for (const [id, rec] of [...views]) {
      const el = getCellEl(id), card = getCardIn(el);
      if (!el || !card || hasDiff(el) || !isC2El(el)) { rec.view.destroy(); views.delete(id); dirtyIds.delete(id); failedSaves.delete(id); syncSaveState(id); if (activeId === id) activeId = null; continue; }
      const body = card.querySelector('.msg-body'), contentEl = body?.querySelector('.msg-content');
      if (body && contentEl) {
        if (!body.contains(rec.host)) contentEl.after(rec.host);
        card.classList.add('craft-c2-mounted');
        if (activeId === id) {
          el.dataset.c2Editing = 'true';
          if (!rec.view.hasFocus || document.activeElement !== rec.view.contentDOM) rec.view.focus();
        }
      }
      syncCellLineNumbers(id, rec);
    }
  };
  const schedule = () => { if (frame == null) frame = requestAnimationFrame(sync); };

  const onClick = e => {
    const edit = e.target.closest?.('.card-in [hx-post="/editor_"]');
    const cell = edit?.closest('.editable');
    const cellId = cell?.id?.replace(/^_/, '');
    if (cellId && bypassMonacoId === cellId) { bypassMonacoId = null; return; }
    const codeCard = getCardIn(cell);
    if (cellId && codeCard && !hasDiff(cell) && !isNonCodeInsertion(cell.id) && !codeCard.classList.contains('collapsed')) {
      if (!allMode && !ids.has(cellId)) { ids.add(cellId); recordDlgId(cellId); saveIds(); }
      e.preventDefault(); e.stopImmediatePropagation();
      openCell(cellId);
      return;
    }
    const tab = e.target.closest?.('#full_editor .tabh');
    if (!tab) return;
    if (tab.id === 'tabh-code' && shouldInterceptCodeTab()) {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      newCodeCell();
      return;
    }
    if (tab.id === 'tabh-craft-c2') {
      e.preventDefault(); e.stopPropagation();
      if (!model() || typeof window.clickEdTab !== 'function') return;
      select(true); window.clickEdTab(tab.id, 'code'); schedule();
    } else { select(false); schedule(); }
  };

  const before = ({detail:{ctx} = {}}) => {
    const request = ctx?.request, body = request?.body;
    if (!body?.get || request.method !== 'POST') return;
    const pathname = new URL(request.action, location.href).pathname;
    if (pathname === '/set_contents_') {
      const id = String(body.get('ids') || '').replace(/^_/, '');
      if (id && saveWaiters.has(id)) requests.set(ctx, {kind: 'save', id});
      return;
    }
    if (pathname === '/rm_msg_') {
      const raw = String(body.get('ids') || body.get('id_') || '');
      let changed = false;
      for (const tok of raw.split(',')) {
        const rid = tok.trim().replace(/^_/, '');
        if (!rid) continue;
        if (ids.delete(rid)) changed = true;
        if (removeDlgId(rid)) changed = true;
      }
      if (changed) saveIds();
      return;
    }
    if (pathname === '/add_above_' || pathname === '/add_below_') {
      if (nonCodeInsertion) return;
      if (!pendingAutoEdits.some(r => r.forceCode && r.expires > Date.now())) {
        const prim = document.querySelector('#dialog-container .editable[data-sm="primary"]');
        if (allMode || isC2El(prim)) queueAutoEdit({tagC2: !allMode, forceCode: false});
      }
      return;
    }
    if (pathname === '/add_runq_') {
      if (body.get('cmd') === 'alt-run') {
        const rawId = String(body.get('id_') || '').replace(/^_/, '');
        const el = (rawId && getCellEl(rawId)) || document.querySelector('#dialog-container .editable[data-sm="primary"]');
        if (allMode || isC2El(el)) queueAutoEdit({tagC2: !allMode, forceCode: false, ttl: 30000});
      }
      return;
    }
    if (pathname !== '/upsert_msg_') return;
    const source = ctx.sourceElement, cmd = body.get('cmd');
    const composerButton = source?.matches('#full_editor #submit_btn, #full_editor #cancel_btn');
    const composerShortcut = source?.matches('#kid') && ['upsert-shift-run', 'upsert-alt-run'].includes(cmd);
    if ((!composerButton && !composerShortcut) || body.get('is_input') !== '1') return;
    const id = String(body.get('id_') || '').replace(/^_/, '');
    const c2 = body.get('msg_type') === 'code' && (allMode || choice());
    if (cmd === 'upsert-alt-run' && (allMode || c2)) queueAutoEdit({tagC2: !allMode, forceCode: false, ttl: 30000});
    if (!c2 && !ids.has(id)) return;
    const existing = id ? null : new Set([...document.querySelectorAll('#dialog-container .editable[id]')].map(el => el.id));
    const content = String(body.get('content') ?? '').replace(/\r\n/g, '\n');
    requests.set(ctx, {kind: 'upsert', id, c2, existing, draft, content, type: body.get('msg_type')});
  };

  const pendingCreates = new Set();
  const normalizeSource = text => text.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const finishTag = (save, id, kind) => {
    if (save.c2 && kind === 'code') ids.add(id); else ids.delete(id);
    if (draft === save.draft) draft = null;
    saveIds();
    schedule();
  };
  const reconcileCreates = () => {
    if (!pendingCreates.size) return;
    const cells = [...document.querySelectorAll('#dialog-container .editable[id]')];
    for (const save of pendingCreates) {
      const candidates = cells.filter(el => !save.existing.has(el.id) && getCardIn(el) && normalizeSource(getCellText(el)) === normalizeSource(save.content));
      if (candidates.length !== 1) continue;
      pendingCreates.delete(save);
      finishTag(save, candidates[0].id.replace(/^_/, ''), 'code');
    }
  };

  const after = ({detail:{ctx} = {}}) => {
    const save = ctx && requests.get(ctx);
    if (!save) return;
    const ok = Boolean(ctx.response && ctx.response.status >= 200 && ctx.response.status < 300);
    if (save.kind === 'save') {
      const waiters = saveWaiters.get(save.id);
      const fn = waiters?.shift();
      if (waiters && !waiters.length) saveWaiters.delete(save.id);
      fn?.(ok);
      return;
    }
    if (!ok) return;
    const found = new Map();
    const collect = root => {
      for (const card of root.querySelectorAll('.editable[id] .card-in[data-mtype]')) {
        const el = card.closest('.editable');
        if (save.id ? el.id.replace(/^_/, '') !== save.id : save.existing.has(el.id) || card.dataset.mtype !== 'code') continue;
        found.set(el.id.replace(/^_/, ''), {kind: card.dataset.mtype, content: el.querySelector('form [name="content"]')?.value});
      }
      for (const tpl of root.querySelectorAll('template')) collect(tpl.content);
    };
    if (ctx.text) collect(new DOMParser().parseFromString(ctx.text, 'text/html'));
    if (save.id) {
      const [[, {kind} = {}] = []] = [...found];
      finishTag(save, save.id, kind || save.type);
    } else if (!save.id) {
      const matches = [...found].filter(([, cell]) => cell.content != null && normalizeSource(cell.content) === normalizeSource(save.content));
      if (matches.length === 1) finishTag(save, matches[0][0], 'code');
      else {
        pendingCreates.add(save);
        setTimeout(() => pendingCreates.delete(save), 10000);
        schedule();
      }
    }
  };

  const onThemeChange = () => {
    if (!cmCache) return;
    const exts = themeExtensions(cmCache);
    for (const rec of views.values()) rec.view.dispatch({effects: rec.themeComp.reconfigure(exts)});
  };
  const onKernelConnected = () => {
    for (const [id, rec] of views) syncCellLanguage(id, rec.view);
  };
  const onBeforeUnload = e => {
    if (!dirtyIds.size) return;
    e.preventDefault();
    e.returnValue = '';
  };

  const origFollowRename = window.followRename;
  if (typeof origFollowRename === 'function') {
    window.followRename = async function(url) {
      for (const id of [...dirtyIds]) {
        const rec = views.get(id);
        const content = rec ? rec.view.state.doc.toString() : states.get(id)?.doc.toString();
        if (content != null && !(await saveCell(id, content))) {
          notifyErr('Could not save C2 edit before reopening renamed dialog.');
          return;
        }
      }
      return origFollowRename.call(this, url);
    };
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['value', 'data-diff']});
  document.addEventListener('click', onClick, true);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('uk-theme-switcher:change', onThemeChange);
  document.body.addEventListener('kernel-connected', onKernelConnected);
  window.addEventListener('beforeunload', onBeforeUnload);
  const sep = window.htmx?.config.metaCharacter || ':';
  const configEvent = ['htmx', 'config', 'request'].join(sep), afterEvent = ['htmx', 'after', 'request'].join(sep), settleEvent = ['htmx', 'after', 'settle'].join(sep);
  document.addEventListener(configEvent, before);
  document.addEventListener(afterEvent, after);
  document.addEventListener(settleEvent, onFullEditorSettle);

  window.__hotkeyRegister?.({
    id: 'c2-new-code', combo: 'Alt+Shift+N', label: 'C2: New code cell at bottom', group: 'C2',
    handler: () => { newCodeCell(); return true; },
  });
  window.__hotkeyRegister?.({
    id: 'c2-toggle-mode', combo: 'Alt+Shift+C', label: 'C2: Toggle inline CodeMirror for all code cells', group: 'C2',
    handler: () => { setAllMode(!allMode); return true; },
  });
  window.__hotkeyRegister?.({
    id: 'c2-line-numbers', combo: 'Alt+Shift+L', label: 'C2: Toggle line numbers', group: 'C2',
    handler: () => { setLineNums(!showLineNums); return true; },
  });

  window.craftC2 = {
    ids: () => [...ids],
    has: id => ids.has(String(id).replace(/^_/, '')),
    manages: id => { const el = getCellEl(String(id).replace(/^_/, '')); return isC2El(el); },
    add: id => { ids.add(String(id).replace(/^_/, '')); saveIds(); schedule(); },
    remove: id => { const k = String(id).replace(/^_/, ''); if (autoEditGuard?.id === k) autoEditGuard = null; ids.delete(k); unmountCell(k); saveIds(); schedule(); },
    edit: (id, opts) => openCell(String(id).replace(/^_/, ''), opts),
    active: () => activeId,
    view: id => views.get(String(id ?? activeId).replace(/^_/, ''))?.view || null,
    exit: id => exitCell(String(id ?? activeId).replace(/^_/, '')),
    run: (id, cmd = 'run') => saveAndRun(String(id ?? activeId).replace(/^_/, ''), cmd),
    newCodeCell,
    expectCodeInsertion: () => queueAutoEdit({tagC2: !allMode, forceCode: true}),
    guardNonCodeInsertion(existing) {
      nonCodeInsertion = existing;
      return () => { if (nonCodeInsertion === existing) { nonCodeInsertion = null; schedule(); } };
    },
    shouldInterceptCodeTab,
    openInMonaco,
    allMode: () => allMode,
    setAllMode,
    toggleAllMode: () => setAllMode(!allMode),
    lineNumbers: () => showLineNums,
    setLineNumbers: setLineNums,
    toggleLineNumbers: () => setLineNums(!showLineNums),
    dirty: () => [...dirtyIds],
    source: () => cmCache?._source || 'pending',
    disable() {
      destroyed = true;
      observer.disconnect(); cancelAnimationFrame(frame);
      monacoModelSub?.dispose?.();
      monacoModelSub = null;
      monacoBoundEditor = null;
      clearAutoEditGuard();
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('uk-theme-switcher:change', onThemeChange);
      document.body.removeEventListener('kernel-connected', onKernelConnected);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener(configEvent, before);
      document.removeEventListener(afterEvent, after);
      document.removeEventListener(settleEvent, onFullEditorSettle);
      if (typeof origFollowRename === 'function') window.followRename = origFollowRename;
      pendingCreates.clear();
      pendingAutoEdits.length = 0;
      dirtyIds.clear();
      failedSaves.clear();
      saveWaiters.clear();
      for (const id of [...views.keys()]) unmountCell(id);
      document.querySelectorAll('.editable.craft-c2, .editable[data-c2-save]').forEach(el => {
        el.classList.remove('craft-c2');
        delete el.dataset.c2Editing;
        delete el.dataset.c2Save;
      });
      document.querySelectorAll('.card-out.craft-c2-traceback').forEach(el => el.classList.remove('craft-c2-traceback'));
      document.querySelectorAll('#tabh-craft-c2, .craft-c2-badge, #craft-c2-tooltips').forEach(el => el.remove());
    },
  };
  sync();
})();

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
  const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-mtype']});
  window.craftCellChains = {
    sync,
    disable() {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.querySelectorAll('.craft-chain-prev,.craft-chain-next').forEach(e => e.classList.remove('craft-chain-prev', 'craft-chain-next'));
    }
  };
  sync();
})();

(() => {
  window.craftActionMenus?.disable();
  if (window.CRAFT_ACTION_MENUS === false) return;
  let current = null, frame = null;
  const menu = document.createElement('div');
  menu.className = 'craft-action-menu';
  menu.id = 'craft-cell-action-menu';
  menu.setAttribute('popover', 'auto');
  menu.setAttribute('role', 'menu');
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
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.textContent = label;
      item.disabled = source.disabled;
      if (/^Delete/i.test(label)) item.dataset.danger = '';
      item.addEventListener('click', e => {
        e.stopPropagation();
        close();
        if (source.isConnected) source.click();
        queueMicrotask(() => { if (document.activeElement === document.body && trigger.isConnected) trigger.focus({preventScroll: true}); });
      });
      menu.append(item);
    }
    if (card.matches('.card-in[data-mtype="code"]') && window.craftC2) {
      const cellEl = card.closest('.editable');
      const cid = cellEl?.id?.replace(/^_/, '');
      if (cid) {
        const sep = document.createElement('hr');
        sep.className = 'craft-action-sep';
        menu.append(sep);
        const addAction = (text, fn) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.setAttribute('role', 'menuitem');
          item.textContent = text;
          item.addEventListener('click', e => { e.stopPropagation(); close(); fn(); });
          menu.append(item);
        };
        if (window.craftC2.manages?.(cid)) addAction('Edit in Monaco', () => window.craftC2.openInMonaco(cid));
        else addAction('Edit in C2 (inline)', () => { window.craftC2.add(cid); window.craftC2.edit(cid); });
        addAction(`Line numbers (C2): ${window.craftC2.lineNumbers?.() ? 'On' : 'Off'}`, () => window.craftC2.toggleLineNumbers?.());
        addAction(`C2 for all code cells: ${window.craftC2.allMode?.() ? 'On' : 'Off'}`, () => window.craftC2.toggleAllMode?.());
      }
    } else if (card.matches('.card-in:is([data-mtype="note"],[data-mtype="prompt"],[data-mtype="raw"]), .card-out[data-mtype="prompt"]') && window.craftMd) {
      const cellEl = card.closest('.editable');
      const cid = cellEl?.id?.replace(/^_/, '');
      const part = card.classList.contains('card-out') ? 'out' : 'in';
      if (cid) {
        const sep = document.createElement('hr');
        sep.className = 'craft-action-sep';
        menu.append(sep);
        const item = document.createElement('button');
        item.type = 'button';
        item.setAttribute('role', 'menuitem');
        item.textContent = 'Edit in Monaco';
        item.addEventListener('click', e => { e.stopPropagation(); close(); window.craftMd.openInMonaco(cid, part); });
        menu.append(item);
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
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'craft-action-trigger';
      trigger.textContent = '…';
      trigger.setAttribute('aria-haspopup', 'menu');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', menu.id);
      const card = nav.closest('.msg-card');
      trigger.setAttribute('aria-label', card.classList.contains('card-out') ? 'Output actions' : 'Input actions');
      trigger.addEventListener('click', e => { e.stopPropagation(); open(trigger); });
      trigger.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); open(trigger); } });
      nav.append(trigger);
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
  const keys = e => {
    if (!current) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(true); return; }
    if (!menu.contains(e.target)) return;
    e.stopImmediatePropagation();
    const items = [...menu.querySelectorAll('button:not(:disabled)')];
    const i = items.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? items.length-1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[j]?.focus();
    }
  };
  const focus = e => { if (current && !menu.contains(e.target) && e.target !== current) close(); };
  const toggled = () => { if (!menu.matches(':popover-open') && current) close(); };
  const observer = new MutationObserver(schedule);
  observer.observe(document.getElementById('dialog-container') || document.body, {childList: true, subtree: true});
  document.addEventListener('keydown', keys, true);
  document.addEventListener('focusin', focus);
  document.addEventListener('htmx:beforeSwap', closeForSwap);
  function closeForSwap() { close(); }
  menu.addEventListener('toggle', toggled);
  window.craftActionMenus = {
    sync,
    close,
    disable() {
      observer.disconnect();
      cancelAnimationFrame(frame);
      close();
      document.removeEventListener('keydown', keys, true);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('htmx:beforeSwap', closeForSwap);
      document.querySelectorAll('.craft-action-trigger').forEach(e => e.remove());
      document.querySelectorAll('.craft-action-source,.craft-old-action-toggle').forEach(e => e.classList.remove('craft-action-source', 'craft-old-action-toggle'));
      menu.remove();
    }
  };
  sync();
})();


(() => {
  const preserved = [...document.querySelectorAll('.editable.craft-omitted')].map(e => e.id);
  window.craftOmit?.disable();
  const omitted = new Set(preserved), markers = new Map();
  let frame, approach = 1;
  const root = () => document.getElementById('dialog-container');
  const cells = () => [...(root()?.querySelectorAll(':scope > .editable') || [])];
  const eligible = e => !e.hidden && !e.matches('.filter-hidden,.heading-hidden,.hidden');
  const marker = () => document.activeElement?.closest('.craft-omit-marker');
  const blocked = () => !!document.activeElement?.closest('input,textarea,select,[contenteditable],.monaco-editor,#full_editor,.hk-overlay.open,#solveit-launcher.open,[role="dialog"],.uk-modal.uk-open');
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
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'craft-omit-marker';
        button.addEventListener('click', () => restore(button));
        button.addEventListener('focus', clearSelection);
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
  const schedule = records => {
    if (records && !records.some(r => r.target === root() || r.target.closest?.('#dialog-container'))) return;
    if (!frame) frame = requestAnimationFrame(sync);
  };
  const pointer = e => { if (marker() && !e.target.closest('.craft-omit-marker')) marker().blur(); };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['class','hidden','data-sm-header']});
  document.addEventListener('keydown', keys, true);
  document.addEventListener('pointerdown', pointer, true);
  window.__hotkeyRegister?.({id: 'cell-omit', label: 'Toggle omit cells', group: 'Dialog · Presentation', combo: 'u', handler: () => window.craftOmit?.toggle() === true});
  window.craftOmit = {
    toggle, sync,
    disable() {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', keys, true);
      document.removeEventListener('pointerdown', pointer, true);
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
  const cells = () => [...document.querySelectorAll('#dialog-container > .editable')];
  const card = (e, side) => e.querySelector(side === 'input' ? ':scope > .card-in' : ':scope > .card-out');
  const button = (e, side) => card(e, side)?.querySelector('[hx-post="/collapse_"]');
  const present = (e, side) => side === 'input' ? !!card(e, side) : !!card(e, side)?.querySelector('.msg-body');
  const blocked = () => !!document.activeElement?.closest('input,textarea,select,[contenteditable],.monaco-editor,#full_editor,[role="dialog"],.uk-modal.uk-open');
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
          b = document.createElement('button');
          b.type = 'button';
          b.className = 'craft-part-restore';
          b.textContent = side === 'input' ? '⌃' : '⌄';
          b.setAttribute('aria-label', `Restore ${side}`);
          b.title = `Restore ${side}`;
          b.addEventListener('click', () => restore(e.id, side));
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
  const schedule = records => {
    if (!records.some(r => r.target.id === 'dialog-container' || r.target.closest?.('#dialog-container'))) return;
    if (!frame) frame = requestAnimationFrame(sync);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['class']});
  document.addEventListener('click', click, true);
  document.addEventListener('htmx:afterRequest', finished);
  window.__hotkeyRegister?.({id: 'si-i', label: 'Cycle input: expanded / collapsed / hidden', group: 'Solveit · Dialog (selection mode)', combo: 'i', handler: () => cycle('input')});
  window.__hotkeyRegister?.({id: 'si-o', label: 'Cycle output: expanded / collapsed / hidden', group: 'Solveit · Dialog (selection mode)', combo: 'o', handler: () => cycle('output')});
  window.craftParts = {
    cycle, sync, fullyHidden, restoreCell,
    disable() {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener('click', click, true);
      document.removeEventListener('htmx:afterRequest', finished);
      controls.forEach(b => b.remove());
      states.clear();
      document.querySelectorAll('.craft-part-hidden').forEach(c => c.classList.remove('craft-part-hidden'));
      originals.forEach(s => window.__hotkeyRegister?.({...s, handler: () => true}));
      window.craftOmit?.sync();
    }
  };
  sync();
})();


(() => {
  window.craftInsertPreview?.disable();
  if (!document.getElementById('dialog-container')) return;
  const types = {
    Code: 'M8 6l-6 6 6 6m8-12 6 6-6 6M14 4l-4 16',
    Note: 'M5 3h10l4 4v14H5z M15 3v5h4M8 12h8m-8 4h8',
    Raw: 'M3 5h18v14H3z M7 9v6',
    Prompt: 'M3 4h18v12H9l-6 4z M7 10h.01m5 0h.01m5 0h.01',
  };
  const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${types[name]}"/></svg>`;
  const key = 'craft-insert-preview:v1:' + (new URLSearchParams(location.search).get('name') || location.pathname);
  const style = document.createElement('style');
  style.textContent = `
    #dialog-container.craft-insert-preview {box-sizing:border-box; margin-right:28px!important; min-width:0}
    #craft-insert-preview {position:fixed; z-index:20; width:28px; height:26px; display:grid; place-items:center; border:0; background:transparent; color:#9b9cab; padding:0; cursor:pointer}
    #craft-insert-preview[hidden] {display:none}
    #craft-insert-preview:hover,#craft-insert-preview:focus-visible {color:#e0e0e8}
    #craft-insert-preview-menu {position:fixed; inset:auto; margin:0; padding:5px; border:1px solid #414251; border-radius:4px; background:#1f2030; color:#cfc9c2; font:12px system-ui}
    #craft-insert-preview-menu button {display:flex; align-items:center; gap:8px; width:100%; padding:5px 10px; border:0; background:transparent; color:inherit; cursor:pointer}
    #craft-insert-preview-menu button:hover,#craft-insert-preview-menu button[aria-pressed=true] {background:#343649}
    #craft-insert-preview-menu small {display:block; padding:4px 10px; color:#9b9cab}`;
  const trigger = document.createElement('button'), menu = document.createElement('div');
  trigger.id = 'craft-insert-preview'; trigger.type = 'button'; trigger.hidden = true;
  menu.id = 'craft-insert-preview-menu'; menu.setAttribute('popover', 'auto');
  menu.innerHTML = `<small>New cell type</small>${Object.keys(types).map(name => `<button type="button" data-kind="${name}">${icon(name)}${name}</button>`).join('')}`;
  trigger.setAttribute('popovertarget', menu.id);
  let current;
  const select = name => {
    current = name;
    trigger.innerHTML = icon(name);
    trigger.title = `A/B inserts: ${name}`;
    trigger.setAttribute('aria-label', trigger.title);
    for (const option of menu.querySelectorAll('button')) option.setAttribute('aria-pressed', String(option.dataset.kind === name));
  };
  let saved;
  try { saved = localStorage.getItem(key); } catch {}
  select(Object.hasOwn(types, saved) ? saved : document.getElementById('default_code')?.checked ? 'Code' : 'Prompt');
  let scroller;
  const position = () => {
    if (!scroller) return;
    const width = document.documentElement.clientWidth;
    const rect = scroller.getBoundingClientRect(), top = Math.max(0, rect.top) + 24;
    trigger.hidden = !rect.width || !rect.height;
    Object.assign(trigger.style, {left:`${rect.right}px`, top:`${top}px`});
    Object.assign(menu.style, {right:`${Math.max(0, width - rect.right - 28)}px`, top:`${top + 28}px`});
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
    try { localStorage.setItem(key, name); } catch {}
  };
  const activeCells = () => [...(scroller?.querySelectorAll('.editable:is([data-sm="primary"],[data-sm="secondary"])') || [])].filter(el => el.getClientRects().length);
  const cellType = el => el?.querySelector('.card-in[data-mtype]')?.dataset.mtype;
  const editorCell = () => (document.querySelector('#full_editor #id_')?.value || '').replace(/^_/, '');
  const notify = error => {
    console.error('CRAFT insertion:', error);
    window.UIkit?.notification?.({message: error.message, status: 'danger'});
  };
  const waitFor = async check => {
    for (let i = 0; i < 100; i++) {
      const result = check();
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return null;
  };
  const setType = async (id, type) => {
    if (cellType(document.getElementById(id)) !== type) {
      const kid = document.getElementById('kid')?.value;
      await window.htmx.ajax('POST', '/set_mtyp_', {source:'#kid', swap:'none', values:{kid, id_:id, ids:id, mtyp:type}});
      if (!(await waitFor(() => cellType(document.getElementById(id)) === type))) throw new Error(`Could not switch cell to ${type}.`);
    }
    if (type === 'code') window.craftC2?.add(id);
    else if (window.craftC2?.has(id)) window.craftC2.remove(id);
  };
  const blocked = () => document.activeElement?.closest('input,textarea,select,[contenteditable],.monaco-editor,.cm-editor,#full_editor,.hk-overlay.open,#solveit-launcher.open,[role="dialog"],.uk-modal.uk-open,#craft-insert-preview-menu');
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
    const cells = activeCells();
    if (!cells.length) { if (!busy) choose(name); return true; }
    if (cells.length !== 1) return true;
    return execute(async () => { await setType(cells[0].id, name.toLowerCase()); choose(name); });
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
      } finally { release?.(); unhide?.(); }
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
  const builtins = document.querySelector('script[data-solveit-hotkeys="builtins"]');
  builtins?.addEventListener('load', registerBindings, {once:true});
  registerBindings();
  menu.addEventListener('click', e => {
    const option = e.target.closest('button[data-kind]');
    if (!option) return;
    choose(option.dataset.kind);
    menu.hidePopover(); trigger.focus();
  });
  document.head.append(style); document.body.append(trigger, menu);
  const observer = new MutationObserver(sync);
  observer.observe(document.body, {childList:true, subtree:true});
  window.addEventListener('resize', position);
  window.craftInsertPreview = {
    insert: (where, opts) => insert(where, opts),
    type: () => current,
    isBusy: () => busy,
    disable() {
    observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', position);
    builtins?.removeEventListener('load', registerBindings);
    defs.forEach(spec => window.__hotkeyRegister?.({...spec, builtin:true, handler:() => true}));
    scroller?.classList.remove('craft-insert-preview');
    trigger.remove(); menu.remove(); style.remove(); delete window.craftInsertPreview;
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
  const target = e => {
    if (e.target.closest?.('.monaco-editor')) return;
    return e.target.closest?.('#dialog-container > .editable > .card-in:is([data-mtype="code"],[data-mtype="note"],[data-mtype="prompt"])');
  };
  const field = id => document.querySelector(`#full_editor #${id}`)?.value;
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
        if (kind === 'code' && window.craftC2?.manages(id)) await window.craftC2.openInMonaco(id);
        else if (window.craftMd?.manages(id)) window.craftMd.openInMonaco(id);
        else card.querySelector('[hx-post="/editor_"]')?.click();
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
  window.addEventListener('dragover', dragover, true);
  window.addEventListener('drop', drop, true);
  window.craftImageDrop = {disable() {
    disabled = true;
    window.removeEventListener('dragover', dragover, true);
    window.removeEventListener('drop', drop, true);
    delete window.craftImageDrop;
  }};
})();

/* ── Mobile toolbar ────────────────────────────────────────────────────
   Only rendered under `html.craft-mobile` (see "Mobile mode detection").
   Phones have no hover, no Escape, no Shift+Enter and no Tab, so this bar
   stands in for them:
     idle:    ☰ top nav · Files · +Code · +Note · +Prompt · +Raw · composer
     editing: Tab · Run (code) / Send (prompt) · Done
   New cells go below the cell being edited, else below the selected cell,
   else at the bottom; an empty dialog gets its first cell. Buttons keep the
   editor focused (mousedown is cancelled), so Run/Done/Tab act on the cell
   the user is typing in instead of on a blurred, already-saved one. The bar
   follows the Android soft keyboard via visualViewport. */
(() => {
  window.craftMobileBar?.disable();
  const root = document.documentElement;
  const P = {
    menu: 'M4 6h16M4 12h16M4 18h16',
    files: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
    Code: 'M8 6l-6 6 6 6m8-12 6 6-6 6M14 4l-4 16',
    Note: 'M5 3h10l4 4v14H5z M15 3v5h4M8 12h8m-8 4h8',
    Prompt: 'M3 4h18v12H9l-6 4z M7 10h.01m5 0h.01m5 0h.01',
    Raw: 'M3 5h18v14H3z M7 9v6',
    composer: 'M3 7h18v10H3z M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10',
    tab: 'M3 12h13m-4-4 4 4-4 4M20 6v12',
    run: 'M7 5v14l11-7z',
    done: 'M5 12.5l4.5 4.5L19 7.5',
  };
  const svg = d => `<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  const btn = (act, icon, label, extra = '') => `<button type="button" data-act="${act}" ${extra} aria-label="${label}">${svg(icon)}<span>${label}</span></button>`;
  const bar = document.createElement('nav');
  bar.id = 'craft-mbar'; bar.setAttribute('aria-label', 'Mobile toolbar'); bar.dataset.mode = 'idle';
  bar.innerHTML =
    '<div class="craft-mbar-row" data-row="idle">' +
      btn('nav', P.menu, 'Menu') + btn('files', P.files, 'Files') +
      ['Code', 'Note', 'Prompt', 'Raw'].map(t => btn('add', P[t], t, `data-type="${t}" data-needs-dialog`)).join('') +
      btn('composer', P.composer, 'Chat', 'data-needs-dialog') +
    '</div>' +
    '<div class="craft-mbar-row" data-row="edit">' +
      btn('tab', P.tab, 'Tab') + '<span class="craft-mbar-spacer"></span>' +
      btn('run', P.run, 'Run') + btn('done', P.done, 'Done') +
    '</div>';
  const backdrop = document.createElement('div');
  backdrop.id = 'craft-mobile-backdrop';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const notify = message => window.UIkit?.notification?.({message, status: 'warning'});
  const dialog = () => document.getElementById('dialog-container');
  const navEl = () => document.querySelector('.uk-container > nav.monster-navbar');

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
  const syncMode = () => {
    const ed = editing();
    bar.dataset.mode = ed ? 'edit' : 'idle';
    const run = bar.querySelector('[data-act="run"]');
    const runnable = ed && (ed.kind === 'code' || (ed.kind === 'prompt' && ed.part !== 'out'));
    run.hidden = !runnable;
    if (runnable) {
      const label = ed.kind === 'prompt' ? 'Send' : 'Run';
      run.querySelector('span').textContent = label; run.setAttribute('aria-label', label);
    }
    const hasDialog = !!dialog();
    bar.querySelectorAll('[data-needs-dialog]').forEach(b => { b.hidden = !hasDialog; });
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
    const before = new Set([...dialog().querySelectorAll('.editable[id]')].map(el => el.id));
    await window.htmx.ajax('POST', '/upsert_msg_', {source: '#kid', swap: 'none', values: {kid, id_: '', msg_type: type.toLowerCase(), is_input: '1', content: ''}});
    for (let i = 0; i < 100; i++) {
      const el = [...dialog().querySelectorAll('.editable[id]')].find(x => !before.has(x.id));
      if (el) { el.scrollIntoView({block: 'nearest'}); window.craftMd?.edit?.(el.id.slice(1), {toEnd: true}); return; }
      await sleep(50);
    }
  }

  let adding = false;
  async function addCell(type) {
    const container = dialog();
    if (!container || adding || window.craftInsertPreview?.isBusy?.()) return;
    adding = true;
    try {
      const editingCell = document.activeElement?.closest?.('#dialog-container > .editable');
      await closeEditors();
      document.activeElement?.blur?.();
      const cells = [...container.querySelectorAll(':scope > .editable[id]')].filter(el => el.getClientRects().length);
      const target = (editingCell?.isConnected && editingCell) || cells.find(el => el.dataset.sm === 'primary') || cells[cells.length - 1];
      if (!target) { await createFirst(type); return; }
      if (!window.craftInsertPreview?.insert) return notify('Reload this dialog to enable inserting cells.');
      await sleep(0);
      window.craftInsertPreview.insert('below', {type, cell: target, force: true});
    } catch (err) {
      console.error('craftMobileBar: add cell failed', err);
      notify('Could not add the cell.');
    } finally { adding = false; }
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
    bar.querySelector('[data-act="nav"]').setAttribute('aria-pressed', String(open));
  };

  const actions = {
    nav: () => toggleNav(),
    files: () => { toggleNav(false); window.solveitFileTree?.toggle(false); },
    add: b => { toggleNav(false); window.solveitFileTree?.isOpen?.() && window.solveitFileTree.close(); addCell(b.dataset.type); },
    composer: async () => {
      toggleNav(false);
      await closeEditors();
      if (!window.craftIdleComposer?.show?.()) {
        const fe = document.getElementById('full_editor');
        fe?.scrollIntoView({block: 'end'});
        fe?.querySelector('textarea, [contenteditable="true"]')?.focus();
      }
    },
    tab: () => { const ed = editing(); if (ed) pressTab(ed); },
    run: () => {
      const ed = editing();
      if (!ed) return;
      if (ed.kind === 'code') window.craftC2.run(ed.id, 'run');
      else if (ed.kind === 'prompt' && ed.part !== 'out') window.craftMd.run(ed.id, 'run');
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
  bar.addEventListener('mousedown', onBarMouseDown);
  bar.addEventListener('click', onBarClick);
  backdrop.addEventListener('click', () => window.solveitFileTree?.close?.());

  /* Tapping outside the revealed top nav (and outside its dropdowns) hides it again. */
  const onDocPointerDown = e => {
    if (!root.classList.contains('craft-nav-open')) return;
    const t = e.target;
    if (bar.contains(t) || navEl()?.contains(t) || t.closest?.('.uk-drop, .uk-dropdown, .uk-modal, [role="dialog"]')) return;
    toggleNav(false);
  };
  document.addEventListener('pointerdown', onDocPointerDown, true);

  /* Opening a plain file from the drawer: the editor overlay takes over the screen. */
  const onTempEditor = new MutationObserver(() => {
    if (window.craftMobile?.active() && document.querySelector('#solveit-temp-editor.open') && window.solveitFileTree?.isOpen?.()) window.solveitFileTree.close();
  });

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
  vv?.addEventListener('resize', place);
  vv?.addEventListener('scroll', place);
  window.addEventListener('resize', place);
  document.addEventListener('focusin', place, true);
  document.addEventListener('focusout', place, true);

  document.addEventListener('focusin', scheduleMode, true);
  document.addEventListener('focusout', scheduleMode, true);
  const settleEvent = ['htmx', 'after', 'settle'].join(window.htmx?.config?.metaCharacter || ':');
  document.addEventListener(settleEvent, scheduleMode);

  let mounted = false;
  const mount = on => {
    if (on && !mounted) {
      document.body.append(backdrop, bar);
      onTempEditor.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['class']});
      mounted = true; syncMode(); place();
    } else if (!on && mounted) {
      bar.remove(); backdrop.remove(); onTempEditor.disconnect(); toggleNav(false);
      mounted = false;
    }
  };
  const start = () => mount(!!window.craftMobile?.active());
  const offChange = window.craftMobile?.onChange(mount);
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, {once: true});

  window.craftMobileBar = {
    addCell,
    disable() {
      offChange?.(); mount(false); clearTimeout(modeTimer);
      bar.removeEventListener('mousedown', onBarMouseDown);
      bar.removeEventListener('click', onBarClick);
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      document.removeEventListener('focusin', scheduleMode, true);
      document.removeEventListener('focusout', scheduleMode, true);
      document.removeEventListener(settleEvent, scheduleMode);
      vv?.removeEventListener('resize', place);
      vv?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
      document.removeEventListener('focusin', place, true);
      document.removeEventListener('focusout', place, true);
      root.style.removeProperty('--craft-kb');
      delete window.craftMobileBar;
    },
  };
})();
