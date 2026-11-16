/* ── Hotkey manager bootstrap ──────────────────────────────────────
   The shared shortcut registry lives in hotkey_manager.js (served from
   ~ at /static/hotkey_manager.js). Load it first so the sections below
   can register their shortcuts; registrations made before it finishes
   loading are queued and replayed by the manager. */
(() => {
  window.__hotkeyQueue ||= [];
  window.__hotkeyRegister = spec => { if (window.solveitHotkeys) window.solveitHotkeys.register(spec); else window.__hotkeyQueue.push(spec); };
  for (const [src, tag] of [['/static/hotkey_manager.js', '1'], ['/static/hotkey_builtins.js', 'builtins']])
    if (!document.querySelector(`script[data-solveit-hotkeys="${tag}"]`)) {
      const s = document.createElement('script');
      s.src = src; s.dataset.solveitHotkeys = tag;
      document.head.append(s);
    }
})();


/* ── Lightweight file tree ─────────────────────────────────────────── */
(() => {
  const QUERCUS_JS = '/static/quercus-treeview.js', QUERCUS_CSS = '/static/quercus-treeview.css';
  let panel, tree, loaded = false, rootRows, filterText = '', restoring = false, previousFocus;
  let refreshTimer;
  const DOTS_KEY = 'solveit-file-tree:hide-dots';
  let hideDots = false;
  try { hideDots = localStorage.getItem(DOTS_KEY) === '1'; } catch {}
  window.__hotkeyRegister?.({id: 'file-tree-toggle', label: 'Toggle file tree', group: 'File tree', combo: 'Mod+B', handler: () => { toggle(); return true; }});
  const rowsByPath = new Map(), fetchedAtByPath = new Map(), expandedPaths = new Set(), loadingPaths = new Set();
  const CACHE_KEY = 'solveit-file-tree:v3', CACHE_MAX_AGE = 180000;
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
      return {id: path || href || link.textContent.trim(), name: link.textContent.trim(), kind: isDir ? 'directory' : href?.startsWith('/dialog_?') ? 'dialog' : 'file', href: href !== '#' ? href : null, path, delUrl: row.querySelector('a.file-del')?.getAttribute('hx-post') || null};
    }).filter(Boolean);
  }

  function nodesFor(path) {
    return (rowsByPath.get(path) || []).filter(n => !hideDots || !n.name.startsWith('.')).map(node => node.kind !== 'directory' ? node : ({...node, children: rowsByPath.has(node.path) ? nodesFor(node.path) : [{id: `loading:${node.path}`, name: 'Loading…', kind: 'loading', selectable: false}]}));
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
        if (window.solveitHotkeys?.dispatch(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
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

  /* Right-click menu: Open / Duplicate / Delete. Delete posts to the row's own
     /delete_file_ URL (scraped from the listing), after a confirm. Solveit only
     exposes duplication for dialogs, so Duplicate is disabled for other files. */
  let menu = null;
  function closeMenu() { if (!menu) return false; menu.remove(); menu = null; return true; }
  async function deleteNode(node) {
    if (!confirm(`Delete '${node.name}'? This cannot be undone.`)) return;
    try {
      const r = await fetch(new URL(node.delUrl, location.href), {method: 'POST', credentials: 'same-origin', headers: {'HX-Request': 'true'}});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (node.kind === 'directory') [...rowsByPath.keys()].filter(p => p === node.path || p.startsWith(node.path + '/')).forEach(p => { rowsByPath.delete(p); expandedPaths.delete(p); });
      await refreshTree();
    } catch (err) { panel.querySelector('.solveit-tree-status').textContent = `Could not delete: ${err.message || err}`; }
  }
  function duplicateNode(name) {
    window.open('/duplicate_curr_dialog_?name=' + encodeURIComponent(name), '_blank');
    setTimeout(refreshTree, 1500);
  }
  function showMenu(e) {
    const li = e.target.closest('li[data-node-data]');
    if (!li) return;
    const node = JSON.parse(li.dataset.nodeData);
    if (node.kind === 'loading') return;
    e.preventDefault(); e.stopPropagation(); closeMenu();
    const dlgName = node.kind === 'dialog' && node.href ? new URL(node.href, location.href).searchParams.get('name') : null;
    menu = document.createElement('div'); menu.className = 'solveit-tree-menu'; menu.setAttribute('role', 'menu');
    const item = (label, fn, {disabled = false, title = '', danger = false} = {}) => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = label;
      b.disabled = disabled; if (title) b.title = title; if (danger) b.className = 'danger';
      b.onclick = ev => { ev.stopPropagation(); closeMenu(); fn(); };
      menu.append(b);
    };
    if (node.kind !== 'directory') item('Open', () => openNode(node), {disabled: !node.href});
    item('Duplicate', () => duplicateNode(dlgName), {disabled: !dlgName, title: dlgName ? 'Duplicate dialog (opens the copy in a new tab)' : 'Solveit only offers duplication for dialogs'});
    item('Delete…', () => deleteNode(node), {disabled: !node.delUrl, danger: true});
    panel.append(menu);
    const at = (e.clientX || e.clientY) ? {x: e.clientX, y: e.clientY} : (b => ({x: b.left + 24, y: b.bottom}))(li.getBoundingClientRect());
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(at.x, innerWidth - r.width - 4) + 'px';
    menu.style.top = Math.min(at.y, innerHeight - r.height - 4) + 'px';
    menu.querySelector('button:not(:disabled)')?.focus();
  }

  function makePanel() {
    if (panel) return panel;
    panel = document.createElement('aside'); panel.id = 'solveit-file-tree-panel';
    panel.innerHTML = '<div class="solveit-tree-brand"><span class="solveit-tree-appname">solveit</span></div><header><strong>Files</strong><kbd class="solveit-tree-shortcut" data-hotkey="file-tree-toggle">⌘B</kbd><button class="solveit-tree-dots" type="button" aria-pressed="false" aria-label="Hide dot files" title="Hide dot files">.*</button><button class="solveit-tree-refresh" type="button" aria-label="Refresh files" title="Refresh files">↻</button><button class="solveit-tree-home" type="button" aria-label="Dialogs home" title="Dialogs home">⌂</button><button class="solveit-tree-close" type="button" aria-label="Close">×</button></header><input class="solveit-tree-filter" type="search" placeholder="Filter loaded files…" autocomplete="off"><div class="solveit-tree-status" role="status"></div><div id="solveit-file-tree" role="tree"></div>';
    const dlgName = document.querySelector('nav.monster-navbar h2#dlg-name');
    if (dlgName) panel.querySelector('.solveit-tree-brand').append(dlgName);
    panel.addEventListener('click', e => e.stopPropagation());
    panel.querySelector('.solveit-tree-close').onclick = closePanel;
    panel.querySelector('.solveit-tree-refresh').onclick = refreshTree;
    const dots = panel.querySelector('.solveit-tree-dots');
    dots.setAttribute('aria-pressed', String(hideDots));
    dots.onclick = () => { hideDots = !hideDots; dots.setAttribute('aria-pressed', String(hideDots)); try { localStorage.setItem(DOTS_KEY, hideDots ? '1' : '0'); } catch {} if (tree) renderTree(); };
    panel.querySelector('.solveit-tree-home').onclick = () => { location.href = '/?at=.'; };
    window.solveitHotkeys?.refreshChips();
    panel.querySelector('.solveit-tree-filter').addEventListener('input', e => { filterText = e.target.value; tree?.search(filterText); });
    panel.querySelector('#solveit-file-tree').addEventListener('contextmenu', showMenu);
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
    closeMenu(); panel.classList.remove('open'); panel.inert = true; previousFocus?.focus();
  }
  document.addEventListener('click', e => { if (panel?.classList.contains('open') && !panel.contains(e.target)) closePanel(); });
  document.addEventListener('pointerdown', e => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);

  window.addEventListener('keydown', e => {
    if (document.querySelector('#solveit-launcher.open')) return;
    const active = panel?.classList.contains('open') && panel.contains(document.activeElement);
    if (active && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.stopImmediatePropagation();
      if (!e.target.closest?.('.solveit-tree-filter')) handleTreeKeys(e);
      return;
    }
    if (e.key === 'Escape' && closeMenu()) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key === 'Escape' && panel?.classList.contains('open')) { e.preventDefault(); e.stopImmediatePropagation(); closePanel(); }
  }, true);

  window.solveitFileTree = {
    toggle, open: openNode,
    async entries() {  // every loaded dialog/file, for the launcher
      if (!rowsByPath.has('.')) { rowsByPath.set('.', await getRows('.')); fetchedAtByPath.set('.', Date.now()); saveCache(); }
      return [...rowsByPath.entries()].filter(([p]) => !hideDots || !p.split('/').some(part => part !== '.' && part.startsWith('.'))).flatMap(([, rows]) => rows).filter(n => n.kind !== 'directory' && (!hideDots || !n.name.startsWith('.')));
    },
  };
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
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-editing']});
  document.addEventListener('click', tabClick, true);
  document.addEventListener('htmx:afterSettle', schedule);
  window.craftIdleComposer = {
    reveal,
    disable() {
      observer.disconnect();
      document.removeEventListener('click', tabClick, true);
      document.removeEventListener('htmx:afterSettle', schedule);
      unbind();
      panel()?.classList.remove('craft-composer-idle');
      editor?.layout();
    }
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
