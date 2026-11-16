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
