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
    if (node.kind !== 'loading') content.draggable = true;
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
      '<div class="solveit-tree-rootbar" title="Right-click to create/paste/upload in root; drop here to move or upload to root"><span class="solveit-tree-rootbar-path">~/</span><span class="solveit-tree-rootbar-hint">root · drop / right-click</span><button class="solveit-tree-row-upload" type="button" aria-label="Upload into root" title="Upload into root">' + UPLOAD_SVG + '</button></div>' +
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

  window.solveitFileTree = {
    toggle, open: openNode, disable,
    async entries() {  // every loaded dialog/file, for the launcher
      if (!rowsByPath.has('.')) { rowsByPath.set('.', await getRows('.')); fetchedAtByPath.set('.', Date.now()); saveCache(); }
      return [...rowsByPath.entries()]
        .filter(([p]) => !hideDots || !p.split('/').some(part => part !== '.' && part.startsWith('.')))
        .flatMap(([, rows]) => rows)
        .filter(n => n.kind !== 'directory' && (!hideDots || !(n.filename || n.name).startsWith('.')));
    },
  };
  function restoreOpen() {
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
      requested = false;
      if (editor) {
        originalFocus = editor.focus;
        editor.focus = function(...args) { reveal(); return originalFocus.apply(this, args); };
        subscriptions.push(editor.onDidChangeModel(() => {
          requested = !temporary() || hasDraft();
          schedule();
        }), editor.onDidChangeModelContent(schedule));
      }
    }
    const root = panel();
    if (!root || !editor?.getModel()) return;
    const active = requested || !temporary() || hasDraft() || !!document.querySelector('.editable[data-editing="true"]');
    const idle = !active;
    if (root.classList.contains('craft-composer-idle') === idle) return;
    root.classList.toggle('craft-composer-idle', idle);
    if (active) editor.layout();
  };
  const schedule = () => { if (!pending) { pending = true; queueMicrotask(sync); } };
  const tabClick = e => { if (e.target.closest('#full_editor .tabh')) reveal(); };
  let shortcutOpened = false, dismissTimer;
  const show = () => {
    if (window.editor !== editor) sync();
    const root = panel();
    if (!root || !editor?.getModel()) return false;
    clearTimeout(dismissTimer);
    shortcutOpened ||= root.classList.contains('craft-composer-idle');
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
  document.addEventListener('htmx:afterSettle', schedule);
  window.craftIdleComposer = {
    reveal,
    show,
    disable() {
      observer.disconnect();
      document.removeEventListener('click', tabClick, true);
      document.removeEventListener('htmx:afterSettle', schedule);
      window.removeEventListener('keydown', dismissShortcut, true);
      clearTimeout(dismissTimer);
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
  const key = 'solveit-craft:c2:v1', requests = new WeakMap();
  const ids = new Set(), states = new Map(), views = new Map(), pendingSaves = new Map();
  try { for (const id of JSON.parse(localStorage.getItem(key) || '[]')) ids.add(id); } catch {}
  const saveIds = () => { try { localStorage.setItem(key, JSON.stringify([...ids])); } catch {} };

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

  let cmCache = null, draft = null, frame = null, activeId = null, pendingPointer = null, destroyed = false;

  const loadCM = () => window.__craftCM6Promise ??= Promise.all(
    Object.entries(CM_URLS).map(async ([k, u]) => [k, await import(u)])
  ).then(entries => {
    const cm = Object.fromEntries(entries);
    const t = cm.hl.tags;
    cm.ghDarkStyle = cm.lang.HighlightStyle.define([
      {tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#6a737d'},
      {tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.self, t.operator, t.compareOperator, t.logicOperator, t.arithmeticOperator, t.bitwiseOperator, t.updateOperator], color: '#f97583'},
      {tag: [t.string, t.special(t.string), t.docString], color: '#9ecbff'},
      {tag: [t.regexp], color: '#dbedff'},
      {tag: [t.escape, t.number, t.integer, t.float, t.bool, t.null, t.atom, t.constant(t.variableName), t.propertyName, t.attributeName, t.standard(t.variableName), t.special(t.variableName)], color: '#79b8ff'},
      {tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName)), t.className, t.definition(t.className), t.typeName, t.meta, t.annotation], color: '#b392f0'},
      {tag: [t.variableName, t.definition(t.variableName), t.punctuation, t.bracket, t.paren, t.squareBracket, t.brace], color: '#e1e4e8'},
      {tag: [t.invalid], color: '#fdaeb7', fontStyle: 'italic'},
    ]);
    cm.theme = cm.view.EditorView.theme({'&': {lineHeight: '1'}, '.cm-scroller': {lineHeight: '1'}}, {dark: true});
    return cm;
  }).catch(err => {
    window.__craftCM6Promise = null;
    console.error('craftC2: failed to load CodeMirror 6', err);
    throw err;
  });
  loadCM().then(cm => { cmCache = cm; }).catch(() => {});

  const editorId = () => String(document.querySelector('#full_editor #id_')?.value || '').replace(/^_/, '');
  const model = () => window.editor?.getModel();
  const choice = () => draft && draft.id === editorId() && draft.model === model() ? draft.c2 : ids.has(editorId());
  const select = c2 => { draft = {id: editorId(), model: model(), c2}; };
  const getCellEl = id => document.getElementById('_' + id);
  const getCardIn = el => el?.querySelector('.card-in[data-mtype="code"]');
  const getCellText = el => el?.querySelector('form [name="content"]')?.value ?? '';
  const isC2El = el => !!el && ids.has(el.id.replace(/^_/, '')) && !!getCardIn(el);
  const typingBlocked = () => !!document.activeElement?.closest('input,textarea,select,[contenteditable],.monaco-editor,#full_editor,.hk-overlay.open,#solveit-launcher.open,[role="dialog"],.uk-modal.uk-open');

  const hasFolds = (cm, state) => {
    let any = false;
    cm.lang.foldedRanges(state).between(0, state.doc.length, () => { any = true; return false; });
    return any;
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
    const word = context.matchBefore(/[\w./]+/);
    if (!context.explicit && !word) return null;
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
      const options = completions.map(c => ({
        label: c.text,
        apply: c.text,
        detail: c.detail || undefined,
        type: kindMap[c.kind] || 'variable',
        boost: -(Number(c.rank) || 0),
      }));
      return {from, to, options, validFor: /^\w*$/};
    } catch { return null; }
  }

  async function saveCell(id, content) {
    const el = getCellEl(id);
    if (!el) return false;
    const prev = getCellText(el);
    if (content === prev) return pendingSaves.get(id) || false;
    const inp = el.querySelector('form [name="content"]');
    if (inp) inp.value = content;
    const kid = document.getElementById('kid')?.value || '';
    const p = (async () => {
      try {
        await Promise.race([
          window.htmx.ajax('POST', '/set_contents_', {
            source: '#kid',
            swap: 'none',
            values: {kid, id_: '_' + id, ids: id, contents: JSON.stringify({[id]: content})},
          }),
          new Promise(r => setTimeout(r, 3000)),
        ]);
      } catch (err) {
        console.error('craftC2: save failed', err);
      } finally {
        if (pendingSaves.get(id) === p) pendingSaves.delete(id);
      }
    })();
    pendingSaves.set(id, p);
    await p;
    return true;
  }

  function unmountCell(id) {
    const rec = views.get(id);
    if (!rec) return;
    states.set(id, rec.view.state);
    rec.view.destroy();
    rec.host.remove();
    views.delete(id);
    const el = getCellEl(id);
    getCardIn(el)?.classList.remove('craft-c2-mounted');
    if (el) delete el.dataset.c2Editing;
    if (activeId === id) activeId = null;
  }

  async function onCellBlur(id) {
    const rec = views.get(id);
    if (!rec) return;
    const el = getCellEl(id);
    if (el) delete el.dataset.c2Editing;
    if (activeId === id) activeId = null;
    const content = rec.view.state.doc.toString();
    states.set(id, rec.view.state);
    await saveCell(id, content);
    const cur = views.get(id);
    if (!cur || cur.view.hasFocus || activeId === id) return;
    if (cmCache && hasFolds(cmCache, cur.view.state)) return;
    unmountCell(id);
  }

  async function exitCell(id) {
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
    const rec = views.get(id);
    const el = getCellEl(id);
    if (!rec || !el) return;
    const content = rec.view.state.doc.toString();
    const next = cmd === 'shift-run' ? window.adjacentMsg?.(window.$(el), false) : null;
    const after = cmd === 'alt-run' ? (window.sectionTail?.(el) || '') : '';
    const existing = cmd === 'alt-run' ? new Set([...document.querySelectorAll('#dialog-container .editable[id]')].map(n => n.id)) : null;
    states.set(id, rec.view.state);
    delete el.dataset.c2Editing;
    if (activeId === id) activeId = null;
    rec.view.contentDOM.blur();
    if (cmd === 'shift-run' && next?.length) window.selectMsg?.(next);
    else window.selectMsg?.(window.$(el), {scroll: false});
    await saveCell(id, content);
    const cur = views.get(id);
    if (cur && !cur.view.hasFocus && activeId !== id && !(cmCache && hasFolds(cmCache, cur.view.state))) unmountCell(id);
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
      if (existing) {
        for (const node of document.querySelectorAll('#dialog-container .editable[id]')) {
          if (!existing.has(node.id) && getCardIn(node)) {
            ids.add(node.id.replace(/^_/, ''));
            saveIds();
            schedule();
            break;
          }
        }
      }
    } catch (err) { console.error('craftC2: run failed', err); }
  }

  function buildExtensions(cm, id) {
    const {state, view, lang, python, cmds, ac, search} = cm;
    const solveitKeys = state.Prec.high(view.keymap.of([
      {key: 'Shift-Enter', run: () => { saveAndRun(id, 'shift-run'); return true; }},
      {key: 'Mod-Enter', run: () => { saveAndRun(id, 'run'); return true; }},
      {key: 'Alt-Enter', run: () => { saveAndRun(id, 'alt-run'); return true; }},
      {key: 'Mod-Shift-Enter', run: () => { saveAndRun(id, 'continue'); return true; }},
      {key: 'Escape', run: v => {
        if (ac.completionStatus(v.state)) return ac.closeCompletion(v);
        if (search.searchPanelOpen(v.state)) return search.closeSearchPanel(v);
        if (v.state.selection.ranges.length > 1) return cmds.simplifySelection(v);
        exitCell(id);
        return true;
      }},
      {key: 'Tab', run: v => ac.completionStatus(v.state) ? ac.acceptCompletion(v) : cmds.indentWithTab.run(v), shift: v => cmds.indentWithTab.shift(v)},
    ]));
    const vscodeKeys = view.keymap.of([
      {key: 'Mod-/', run: cmds.toggleLineComment},
      {key: 'Mod-d', run: search.selectNextOccurrence, preventDefault: true},
      {key: 'Mod-Shift-l', run: search.selectSelectionMatches},
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
      ...ac.completionKeymap,
      ...search.searchKeymap,
      ...cmds.historyKeymap,
      ...cmds.defaultKeymap,
      ...lang.foldKeymap,
    ]);
    return [
      solveitKeys,
      vscodeKeys,
      python.python(),
      cmds.history(),
      state.EditorState.allowMultipleSelections.of(true),
      view.drawSelection(),
      view.dropCursor(),
      view.rectangularSelection(),
      view.crosshairCursor(),
      view.EditorView.lineWrapping,
      lang.indentUnit.of('    '),
      lang.indentOnInput(),
      lang.bracketMatching(),
      lang.codeFolding(),
      lang.syntaxHighlighting(cm.ghDarkStyle),
      cm.theme,
      search.search({top: false}),
      search.highlightSelectionMatches(),
      ac.autocompletion({override: [kernelComplete], activateOnTyping: true, defaultKeymap: false}),
      view.EditorView.updateListener.of(u => {
        states.set(id, u.state);
        if (!u.view.hasFocus && activeId !== id && !pendingSaves.has(id) && !hasFolds(cm, u.state)) {
          queueMicrotask(() => {
            const cur = views.get(id);
            if (cur && !cur.view.hasFocus && activeId !== id && !pendingSaves.has(id) && !hasFolds(cm, cur.view.state)) unmountCell(id);
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
    if (!el || !card || card.classList.contains('collapsed')) return;
    const body = card.querySelector('.msg-body'), contentEl = body?.querySelector('.msg-content');
    if (!body || !contentEl) return;
    window.selectMsg?.(window.$(el), {scroll: false});
    const text = getCellText(el);
    let rec = views.get(id);
    if (rec) {
      if (!body.contains(rec.host)) { contentEl.after(rec.host); card.classList.add('craft-c2-mounted'); }
      if (rec.view.state.doc.toString() !== text && !pendingSaves.has(id)) {
        rec.view.dispatch({changes: {from: 0, to: rec.view.state.doc.length, insert: text}});
      }
      if (selSpec) applySelection(rec.view, selSpec);
      activeId = id;
      el.dataset.c2Editing = 'true';
      rec.view.contentDOM.focus({preventScroll: true});
      return;
    }
    const prevState = states.get(id);
    const edState = prevState && prevState.doc.toString() === text
      ? prevState
      : cm.state.EditorState.create({doc: text, extensions: buildExtensions(cm, id)});
    const host = document.createElement('div');
    host.className = 'craft-c2-host';
    contentEl.after(host);
    card.classList.add('craft-c2-mounted');
    const v = new cm.view.EditorView({state: edState, parent: host});
    host.addEventListener('keydown', e => { e.stopPropagation(); });
    host.addEventListener('focusin', () => {
      activeId = id;
      const curEl = getCellEl(id);
      if (curEl) curEl.dataset.c2Editing = 'true';
    });
    host.addEventListener('focusout', () => {
      requestAnimationFrame(() => {
        if (destroyed) return;
        const ae = document.activeElement;
        if (host.contains(ae) || ae?.closest?.('.cm-tooltip')) return;
        onCellBlur(id);
      });
    });
    rec = {view: v, host};
    views.set(id, rec);
    activeId = id;
    el.dataset.c2Editing = 'true';
    applySelection(v, selSpec || (prevState ? null : {toEnd: true}));
    v.contentDOM.focus({preventScroll: true});
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
    if (code && !document.getElementById('tabh-craft-c2')) {
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
    reconcileCreates();
    for (const card of document.querySelectorAll('#dialog-container .editable .card-in')) {
      const el = card.closest('.editable');
      const id = el.id.replace(/^_/, '');
      const isC2 = card.dataset.mtype === 'code' && ids.has(id);
      el.classList.toggle('craft-c2', isC2);
      const header = card.querySelector('.uk-card-header [data-tokens]');
      const badge = header?.querySelector('.craft-c2-badge');
      if (!isC2) { badge?.remove(); continue; }
      if (!header || badge) continue;
      const label = document.createElement('span');
      label.className = 'craft-c2-badge'; label.textContent = ' · C2'; header.append(label);
    }
    for (const [id, rec] of [...views]) {
      const el = getCellEl(id), card = getCardIn(el);
      if (!el || !card) { rec.view.destroy(); views.delete(id); continue; }
      const body = card.querySelector('.msg-body'), contentEl = body?.querySelector('.msg-content');
      if (body && contentEl && !body.contains(rec.host)) {
        contentEl.after(rec.host);
        card.classList.add('craft-c2-mounted');
        if (activeId === id) {
          el.dataset.c2Editing = 'true';
          rec.view.contentDOM.focus({preventScroll: true});
        }
      }
    }
  };
  const schedule = () => { if (frame == null) frame = requestAnimationFrame(sync); };

  const onClick = e => {
    const edit = e.target.closest?.('.card-in [hx-post="/editor_"]');
    const cell = edit?.closest('.editable');
    if (isC2El(cell) && !getCardIn(cell).classList.contains('collapsed')) {
      e.preventDefault(); e.stopImmediatePropagation();
      openCell(cell.id.replace(/^_/, ''));
      return;
    }
    const tab = e.target.closest?.('#full_editor .tabh');
    if (!tab) return;
    if (tab.id === 'tabh-craft-c2') {
      e.preventDefault(); e.stopPropagation();
      if (!model() || typeof window.clickEdTab !== 'function') return;
      select(true); window.clickEdTab(tab.id, 'code'); schedule();
    } else { select(false); schedule(); }
  };

  const before = ({detail:{ctx} = {}}) => {
    const request = ctx?.request, body = request?.body;
    if (!body?.get || request.method !== 'POST' || new URL(request.action, location.href).pathname !== '/upsert_msg_') return;
    const source = ctx.sourceElement, cmd = body.get('cmd');
    const composerButton = source?.matches('#full_editor #submit_btn, #full_editor #cancel_btn');
    const composerShortcut = source?.matches('#kid') && ['upsert-shift-run', 'upsert-alt-run'].includes(cmd);
    if ((!composerButton && !composerShortcut) || body.get('is_input') !== '1') return;
    const id = String(body.get('id_') || '').replace(/^_/, '');
    const c2 = body.get('msg_type') === 'code' && choice();
    if (!c2 && !ids.has(id)) return;
    const existing = id ? null : new Set([...document.querySelectorAll('#dialog-container .editable[id]')].map(el => el.id));
    const content = String(body.get('content') ?? '').replace(/\r\n/g, '\n');
    requests.set(ctx, {id, c2, existing, draft, content, type: body.get('msg_type')});
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
    if (!save || !ctx.response || ctx.response.status < 200 || ctx.response.status >= 300) return;
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

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['value']});
  document.addEventListener('click', onClick, true);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown, true);
  const sep = window.htmx?.config.metaCharacter || ':';
  const configEvent = ['htmx', 'config', 'request'].join(sep), afterEvent = ['htmx', 'after', 'request'].join(sep);
  document.addEventListener(configEvent, before);
  document.addEventListener(afterEvent, after);

  window.craftC2 = {
    ids: () => [...ids],
    has: id => ids.has(String(id).replace(/^_/, '')),
    add: id => { ids.add(String(id).replace(/^_/, '')); saveIds(); schedule(); },
    remove: id => { const k = String(id).replace(/^_/, ''); ids.delete(k); unmountCell(k); saveIds(); schedule(); },
    edit: (id, opts) => openCell(String(id).replace(/^_/, ''), opts),
    disable() {
      destroyed = true;
      observer.disconnect(); cancelAnimationFrame(frame);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener(configEvent, before);
      document.removeEventListener(afterEvent, after);
      pendingCreates.clear();
      for (const id of [...views.keys()]) unmountCell(id);
      document.querySelectorAll('.editable.craft-c2').forEach(el => { el.classList.remove('craft-c2'); delete el.dataset.c2Editing; });
      document.querySelectorAll('#tabh-craft-c2, .craft-c2-badge').forEach(el => el.remove());
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
