/* ── Lightweight file tree ─────────────────────────────────────────── */
(() => {
  const QUERCUS_JS = '/static/quercus-treeview.js', QUERCUS_CSS = '/static/quercus-treeview.css';
  let panel, tree, loaded = false, rootRows, filterText = '', restoring = false, previousFocus;
  let refreshTimer;
  const rowsByPath = new Map(), fetchedAtByPath = new Map(), expandedPaths = new Set(), loadingPaths = new Set();
  const CACHE_KEY = 'solveit-file-tree:v2', CACHE_MAX_AGE = 180000;
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY));
    if (cached) { cached.rows.forEach(([path, rows]) => rowsByPath.set(path, rows)); cached.fetchedAt.forEach(([path, time]) => fetchedAtByPath.set(path, time)); cached.expanded.forEach(path => expandedPaths.add(path)); }
  } catch {}
  function saveCache() {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({rows: [...rowsByPath], fetchedAt: [...fetchedAtByPath], expanded: [...expandedPaths]})); } catch {}
  }

  function loadAssets() {
    if (loaded) return Promise.resolve();
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = QUERCUS_CSS; css.dataset.solveitTree = '1'; document.head.append(css);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = QUERCUS_JS; script.dataset.solveitTree = '1';
      script.onload = () => { loaded = true; resolve(); };
      script.onerror = () => reject(new Error('Could not load Quercus assets'));
      document.head.append(script);
    });
  }

  async function getRows(path) {
    const response = await fetch(`/?at=${encodeURIComponent(path)}`, {method: 'POST', credentials: 'same-origin', headers: {'HX-Request': 'true'}});
    if (!response.ok) throw new Error(`File listing failed: ${response.status}`);
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    return [...doc.querySelectorAll('.tbl-row')].map(row => {
      const link = row.querySelector('a.file-link');
      if (!link) return null;
      const href = link.getAttribute('href'), hxPost = link.getAttribute('hx-post'), isDir = !!hxPost;
      const path = isDir ? new URL(hxPost, location.href).searchParams.get('at') : null;
      return {id: path || href || link.textContent.trim(), name: link.textContent.trim(), kind: isDir ? 'directory' : href?.startsWith('/dialog_?') ? 'dialog' : 'file', href: href !== '#' ? href : null, path};
    }).filter(Boolean);
  }

  function nodesFor(path) {
    return (rowsByPath.get(path) || []).map(node => node.kind !== 'directory' ? node : ({...node, children: rowsByPath.has(node.path) ? nodesFor(node.path) : [{id: `loading:${node.path}`, name: 'Loading…', kind: 'loading', selectable: false}]}));
  }

  function findNode(path) {
    return [...panel.querySelectorAll('#solveit-file-tree li[data-node-data]')].find(li => JSON.parse(li.dataset.nodeData).path === path);
  }

  function renderNode(node, content) {
    content.classList.add('solveit-tree-' + node.kind); content.tabIndex = 0; content.setAttribute('role', 'treeitem');
    if (node.kind === 'directory') content.setAttribute('aria-expanded', String(expandedPaths.has(node.path)));
    if (node.kind !== 'loading') {
      const ext = node.name.includes('.') ? node.name.split('.').pop().toLowerCase() : '';
      const icons = {js: 'file_type_js.svg', css: 'file_type_css.svg', json: 'file_type_json.svg'};
      const icon = node.kind === 'directory' ? expandedPaths.has(node.path) ? 'default_folder_opened.svg' : 'default_folder.svg' : node.kind === 'dialog' ? 'file_type_ipynb.svg' : icons[ext] || 'default_file.svg';
      const img = document.createElement('img'); img.className = 'solveit-tree-icon'; img.src = `/static/vscode-icons/${icon}`; img.alt = ''; content.append(img);
    }
    const label = document.createElement('span'); label.className = 'treeview-node-text'; label.textContent = node.name; content.append(label);
  }

  function renderTree() {
    if (!tree) tree = new Treeview({containerId: 'solveit-file-tree', data: nodesFor('.'), initiallyExpanded: false, nodeSelectionEnabled: false, onRenderNode: renderNode});
    else tree.setData(nodesFor('.'));
    restoring = true;
    [...expandedPaths].sort((a, b) => a.length - b.length).forEach(path => {
      const li = findNode(path), expander = li?.querySelector('.treeview-expander');
      if (expander && !li.classList.contains('expanded')) expander.click();
    });
    restoring = false;
    if (filterText) tree.search(filterText);
  }

  async function loadFolder(path) {
    if (rowsByPath.has(path) || loadingPaths.has(path)) return;
    loadingPaths.add(path);
    try { rowsByPath.set(path, await getRows(path)); fetchedAtByPath.set(path, Date.now()); saveCache(); renderTree(); }
    catch (err) { panel.querySelector('.solveit-tree-status').textContent = `Could not load folder: ${err.message || err}`; }
    finally { loadingPaths.delete(path); }
  }
  async function refreshTree() {
    const status = panel.querySelector('.solveit-tree-status'), button = panel.querySelector('.solveit-tree-refresh');
    button.disabled = true; status.textContent = 'Refreshing files…';
    try {
      const fresh = await Promise.all([...rowsByPath.keys()].map(async path => [path, await getRows(path)]));
      fresh.forEach(([path, rows]) => { rowsByPath.set(path, rows); fetchedAtByPath.set(path, Date.now()); });
      saveCache();
      renderTree(); status.textContent = '';
    } catch (err) { status.textContent = `Could not refresh files: ${err.message || err}`; }
    finally { button.disabled = false; }
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
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); e.stopImmediatePropagation(); toggle(); }
      }, true));
    }
    overlay.querySelector('strong').textContent = url.searchParams.get('fp') || 'File editor';
    overlay.classList.add('open'); overlay.querySelector('iframe').src = url.href;
  }

  function handleTreeClick(e) {
    if (restoring) return;
    const li = e.target.closest('li[data-node-data]');
    if (!li) return;
    const node = JSON.parse(li.dataset.nodeData), expander = e.target.closest('.treeview-expander');
    if (node.kind === 'directory' && !expander) {
      e.preventDefault(); e.stopPropagation(); li.querySelector('.treeview-expander')?.click(); return;
    }
    if (node.kind === 'directory' && expander) queueMicrotask(() => {
      if (!li.isConnected) return;
      const open = li.classList.contains('expanded'), icon = li.querySelector('img.solveit-tree-icon');
      if (open) { expandedPaths.add(node.path); if (icon) icon.src = '/static/vscode-icons/default_folder_opened.svg'; loadFolder(node.path); }
      else { expandedPaths.delete(node.path); if (icon) icon.src = '/static/vscode-icons/default_folder.svg'; }
      saveCache();
    });
    else if (node.href) openNode(node);
  }

  function makePanel() {
    if (panel) return panel;
    panel = document.createElement('aside'); panel.id = 'solveit-file-tree-panel';
    panel.innerHTML = '<header><strong>Files</strong><kbd class="solveit-tree-shortcut">⌘B</kbd><button class="solveit-tree-refresh" type="button" aria-label="Refresh files" title="Refresh files">↻</button><button class="solveit-tree-close" type="button" aria-label="Close">×</button></header><input class="solveit-tree-filter" type="search" placeholder="Filter loaded files…" autocomplete="off"><div class="solveit-tree-status" role="status"></div><div id="solveit-file-tree" role="tree"></div>';
    panel.addEventListener('click', e => e.stopPropagation());
    panel.querySelector('.solveit-tree-close').onclick = closePanel;
    panel.querySelector('.solveit-tree-refresh').onclick = refreshTree;
    panel.querySelector('.solveit-tree-filter').addEventListener('input', e => { filterText = e.target.value; tree?.search(filterText); });
    panel.querySelector('#solveit-file-tree').addEventListener('click', handleTreeClick, true);
    panel.querySelector('#solveit-file-tree').addEventListener('keydown', e => {
      const current = e.target.closest('.treeview-node-content');
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
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(0, Math.min(items.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus(); }
      else if (e.key === 'ArrowRight' && node.kind === 'directory') { e.preventDefault(); if (li.classList.contains('expanded')) li.querySelector('ul li[data-node-data] > .treeview-node-content')?.focus(); else li.querySelector('.treeview-expander')?.click(); }
      else if (e.key === 'ArrowLeft' && node.kind === 'directory') { e.preventDefault(); if (li.classList.contains('expanded')) li.querySelector('.treeview-expander')?.click(); else li.parentElement.closest('li[data-node-data]')?.querySelector(':scope > .treeview-node-content')?.focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (node.kind === 'directory') li.querySelector('.treeview-expander')?.click(); else if (node.href) openNode(node); }
    });
    panel.inert = true;
    const scroller = document.querySelector('.uk-container > .overflow-y-auto');
    if (scroller) {
      const row = document.createElement('div');
      row.className = 'solveit-tree-workspace';
      scroller.before(row);
      row.append(panel, scroller);
    } else document.body.append(panel);
    return panel;
  }

  async function toggle() {
    const p = makePanel(), opening = !p.classList.contains('open');
    if (!opening) { closePanel(); return; }
    previousFocus = document.activeElement; p.inert = false; p.classList.add('open');
    if (!refreshTimer) refreshTimer = setInterval(() => { if (panel?.classList.contains('open') && [...rowsByPath.keys()].some(path => Date.now() - (fetchedAtByPath.get(path) || 0) > CACHE_MAX_AGE)) refreshTree(); }, CACHE_MAX_AGE);
    try {
      await loadAssets();
      if (!rowsByPath.has('.')) { p.querySelector('.solveit-tree-status').textContent = 'Loading files…'; rowsByPath.set('.', await getRows('.')); fetchedAtByPath.set('.', Date.now()); saveCache(); }
      renderTree(); p.querySelector('.solveit-tree-status').textContent = '';
      panel.querySelector('#solveit-file-tree .treeview-node-content')?.focus();
      if ([...rowsByPath.keys()].some(path => Date.now() - (fetchedAtByPath.get(path) || 0) > CACHE_MAX_AGE)) refreshTree();
    } catch (err) { p.querySelector('.solveit-tree-status').textContent = 'Unable to load files: ' + (err.message || err); }
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
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(0, Math.min(items.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus(); }
    else if (e.key === 'ArrowRight' && node.kind === 'directory') { e.preventDefault(); if (li.classList.contains('expanded')) li.querySelector('ul li[data-node-data] > .treeview-node-content')?.focus(); else li.querySelector('.treeview-expander')?.click(); }
    else if (e.key === 'ArrowLeft' && node.kind === 'directory') { e.preventDefault(); if (li.classList.contains('expanded')) li.querySelector('.treeview-expander')?.click(); else li.parentElement.closest('li[data-node-data]')?.querySelector(':scope > .treeview-node-content')?.focus(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (node.kind === 'directory') li.querySelector('.treeview-expander')?.click(); else if (node.href) openNode(node); }
  }

  function closePanel() {
    if (!panel) return;
    panel.classList.remove('open'); panel.inert = true; previousFocus?.focus();
  }
  document.addEventListener('click', e => { if (panel?.classList.contains('open') && !panel.contains(e.target)) closePanel(); });

  window.addEventListener('keydown', e => {
    const active = panel?.classList.contains('open') && panel.contains(document.activeElement);
    if (active && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.stopImmediatePropagation();
      if (!e.target.closest?.('.solveit-tree-filter')) handleTreeKeys(e);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); e.stopImmediatePropagation(); toggle(); return; }
    if (e.key === 'Escape' && panel?.classList.contains('open')) { e.preventDefault(); e.stopImmediatePropagation(); closePanel(); }
  }, true);
})();

(() => {
  function markDotPrompts() {
    document.querySelectorAll('.editable').forEach(editable => {
      const prompt = editable.querySelector(
        '.msg-card.card-in[data-mtype="prompt"]'
      );
      const body = prompt?.querySelector('.msg-body');
      const isDot = body?.textContent.trim() === '.';

      editable.classList.toggle('dot-prompt', isDot);
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
/* Monaco derives line height from an editor option (not CSS) and the
   app leaves it at the default (~1.35em). Tighten every editor — the
   composer, diff panes, and any editor created later — to fontSize+2px,
   scaled from each editor's own font size. Monaco heights are uniform,
   so blank lines share the same compact height; the extra gap for blank
   lines lives in rendered markdown's paragraph margins instead. */
(() => {
  let tries = 0;
  const go = () => {
    const mon = window.monaco?.editor;
    if (!mon) return ++tries < 40 && setTimeout(go, 250);
    const compact = ed => {
      try {
        const fs = ed.getOption(mon.EditorOption.fontSize);
        ed.updateOptions({ lineHeight: fs + 2 });
      } catch (e) {}
    };
    mon.onDidCreateEditor?.(compact);
    mon.getEditors().forEach(compact);
    try { mon.getDiffEditors().forEach(d => d.updateOptions({ lineHeight: 16 })); } catch (e) {}
  };
  go();
})();
