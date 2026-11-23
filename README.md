# solve-it-crafts

Personal [Solveit](https://solve.it.com) customizations: inline CodeMirror editors, a compact Tokyo Night theme, desktop and mobile cell-insertion controls, a resizable file tree and command launcher, progressive tables, rebindable shortcuts, and cell presentation controls.

## Install on a new instance

```bash
git clone https://github.com/abiancar/solve-it-crafts.git ~/.craft
bash ~/.craft/setup.sh
```

Reload the browser page. `setup.sh` installs only the runtime UI assets: it places `CRAFT.css` and `CRAFT.js` at the data root and all supporting scripts, styles, and icons inside `.craft-assets/` to keep the root directory uncluttered (none of the development notebooks or debugging tools in `nbs/`, `craft_dev/`, or `dev/` are copied into Solveit). Solveit loads CRAFT CSS/JS at page load and discovers them by walking up from the dialog's folder. Installing at the data root (`$HOME`, normally `/app/data`) applies the customizations to dialogs below it; folder-specific CRAFTs can layer on top.

For the optional shell installer, see [Optional terminal setup](#optional-terminal-setup).

## Update an existing installation

```bash
git -C ~/.craft pull --ff-only
bash ~/.craft/setup.sh --replace
```

Reload after updating. `--replace` activates the repository versions and first backs up every different installed file under `~/.craft-backups/install-XXXXXXXX/`, retaining its relative path. Matching files are skipped. Local browser shortcut overrides are not changed.

Without `--replace`, the installer preserves existing files and writes differing repository versions to numbered names such as `CRAFT-1.css`. Numbered copies are not activated automatically: merge them manually or rerun with `--replace`. Identical existing or numbered copies are reused, so repeated installs do not create duplicates.

Use `--dest DIR` to install into a different data root or a disposable test directory; the default is `$HOME`. `--help` lists the options. Required source assets are checked before copying, and the source checkout cannot be its own destination. Installation copies files rather than linking them.

## What's included

| File | Purpose |
|---|---|
| `CRAFT.css` | Theme, dialog layout, desktop/mobile responsive styles, tables, and styles for both inline editors |
| `CRAFT.js` | Shared `__craftCMCore` helpers, C2 code editor, insertion picker, desktop/mobile controls, progressive tables, file tree, launcher, navigation and composer controls, cell presentation, and image drop |
| `craft_md.js` | Inline note, prompt, prompt-response, and raw editors |
| `hotkey_manager.js` | Rebindable action registry, shortcut dispatcher, and settings menu; overrides stored per browser |
| `hotkey_builtins.js` | Snapshot of Solveit's built-in shortcuts; update it when upstream bindings change |
| `quercus-treeview.js`, `quercus-treeview.css` | File-tree widget |
| `vscode-icons/` | File/folder icons and their license |
| `setup.sh` | Deploys `CRAFT.css`/`CRAFT.js` to `$HOME` and support assets into `$HOME/.craft-assets/`, with preservation or backup-and-replace modes |
| `zsh-setup.sh` | Optional user-space zsh and oh-my-zsh installation |

## Document-style dialogs

- Page and prompt/response surfaces share `#1f2030`; notes have transparent backgrounds. Code retains its own surface.
- Consecutive visible prompts, code cells, and notes are grouped by type. Touching card corners are square; prompt/note chains are flush, while code chains retain 12px separation. Separate groups have 25px spacing.
- Prompt authorship is labeled **You** and **Assistant**. Token counts and timestamps appear on hover/focus, or remain available on touch devices. User prose is slightly brighter.
- Selection uses a square blue outline. The redundant green editing outline is suppressed.
- Bare `.` continuation prompts with responses hide their input card unless being edited; their responses remain visible.
- Input/output action toolbars become compact **…** menus, available on hover/focus and on touch devices. Menus invoke Solveit's existing actions and support keyboard navigation. On hover-capable devices, code input headers float beside the copy button without shifting the layout. Long lines in expanded code cells can wrap.
- The bottom Monaco composer stays mounted but hides when empty and idle. **Shift+I** reveals it; nonempty drafts remain visible.

The idle-composer feature can be disabled for the current page with `window.craftIdleComposer.disable()`. Set `window.CRAFT_IDLE_COMPOSER = false` before its initialization to prevent it from enabling.

## Omit: whole-cell presentation toggle

**U** in cell-selection mode toggles **Omit** for selected cells, including outputs. It is a separate action from hiding a cell from AI or collapsing a heading/input/output.

- Adjacent omitted cells share one compact indicator, such as **▸ 2**, at their original document position.
- Click the indicator to restore the group. Up/Down (or J/K) navigation stops on it; Right, Enter, Space, or U restores it. Approaching from below and expanding selects the last restored cell.
- Active edits are protected: finish editing before omitting a cell.
- The action is registered as **Toggle omit cells** in the hotkey manager and command launcher and can be rebound.

Omission is local to the current page and resets on reload. It does not alter notebook contents, execution order, or AI-context inclusion. Stable message IDs preserve omission through ordinary DOM updates within the page.

## Three-state input/output minimization

**I** cycles input and **O** cycles output:

1. Expanded -> Solveit's normal collapsed view.
2. Normally collapsed -> fully hidden.
3. Fully hidden -> restored and expanded.

The existing collapse buttons use the same cycle. The hotkey-manager entries retain their `si-i` and `si-o` IDs so browser rebindings continue to apply. Plain keys do not operate while typing in editors.

A fully hidden input has a small **⌃** restore button immediately above the remaining output. A fully hidden output has a **⌄** restore button below the remaining input. If no other portion exists, or both portions are fully hidden, the whole cell uses the Omit indicator. Restoring that indicator restores the portion that made the cell disappear; the other hidden portion retains its own restore control. A normal collapsed portion still counts as visible.

Normal collapse uses Solveit's existing server-backed behavior. The fully hidden third state is page-local presentation state and resets on reload. It neither deletes content nor changes AI inclusion; U remains an independent whole-cell toggle.

## Inline cell editors

| Cell | Editor | Features |
|---|---|---|
| Code | `craftC2` in `CRAFT.js` | Syntax highlighting for the kernel and supported `%%magic` languages, folding, line numbers, completions, signature help, ghost text, and inline AI edits |
| Note, prompt, and prompt response | `craftMd` in `craft_md.js` | Markdown Live Preview, formatting shortcuts, and click-to-caret placement |
| Raw | `craftMd` in `craft_md.js` | Monospace plain-text editing without Markdown Live Preview |

- Click a cell's contents or press `Enter` on a selected cell to edit. `Escape` returns to selection mode once editor popups are closed. Use **Edit in Monaco** in the action menu for the native editor.
- The right-edge picker sets which type `a` and `b` insert. With **Code** selected, either key creates and focuses a C2 cell. **Alt+Shift+N** creates one at the bottom. **Alt+Enter** in C2 runs the cell and opens a new one; in a note or raw editor it saves and inserts below using the picker type without running code.
- C2 is enabled for all code cells by default. Toggle it with **Alt+Shift+C** or the action menu. **Alt+Shift+L** toggles line numbers; tracebacks also show line numbers automatically. Empty code and raw cells hide their placeholder while focused, keeping the caret visible.
- Paste an image directly into an inline note or prompt. Dropping an image onto a code, note, or prompt input instead uses Solveit's native Monaco attachment flow.

- Both editors share CodeMirror 6. The installer does not ship the optional local bundle in `~/.craft-assets/cm6/`; without it the editors load modules from `esm.sh`, which requires browser network access.

## Desktop quick-insert, slash-morph, and tables

- **Hover-edge drag-to-insert:** Hover near the bottom center of a cell to reveal an insertion handle. Click it to insert the active picker type below, or press and drag into the four-option fan picker (**Code**, **Note**, **Prompt**, **Raw**).
- **Seam quick-picker (`Shift+A` / `Shift+B`):** In cell-selection mode, press `Shift+A` or `Shift+B` to open the inline seam picker above or below the selected cell, then press `C`, `N`, `P`, or `R` to insert.
- **Slash-morph on empty cells:** Typing `/c` (`/code`), `/n` (`/note`), `/p` (`/prompt`), or `/r` (`/raw`) followed by Space or Enter in an empty inline cell switches its type in place.
- **Click-margin escape:** Clicking blank dialog margin or non-control card header space commits and exits active inline editors.
- **Progressive tables:** Markdown, pandas, polars, and DuckDB tables receive a horizontal scroll wrapper, automatic right-aligned numeric columns, click-to-sort flat headers, and a **Copy TSV** button.

## Mobile layout and bottom toolbar

Mobile mode (`html.craft-mobile`) activates automatically on touch devices (`(hover: none) and (pointer: coarse)`). Switch explicitly at any time with the navbar view-toggle button, the **Toggle mobile / desktop view** launcher action, or `window.craftMobile.setMode('auto' | 'mobile' | 'desktop')`.

- **Idle dock & jump button:** When not editing, a floating pill dock (**Menu · Files**) hides on scroll-down and reappears on scroll-up; a floating jump-to-bottom button appears when scrolled well above the end of a dialog.
- **Editing toolbar:** While an inline editor has focus, a full-width bar sits above the soft keyboard with **Tab**, **Run / Send**, and **Done** controls.
- **Tap-to-select first:** Tapping an unselected cell selects it without opening the soft keyboard; a second tap enters edit mode.
- **Edge-bulge insertion:** Selected cells show top/bottom brace-style bulges for drag-to-insert or tap-to-pick cell creation; empty dialogs show an inline starter row.
- **Responsive drawers & sheets:** The file tree opens as a slide-over drawer and cell action menus open as bottom sheets.

## File tree, dashboard access, and launcher

- **Mod+B** (rebindable as `file-tree-toggle`) opens or hides the explorer. It stays open on outside clicks and Escape, and its state is restored on reload or dialog navigation in the same tab via `sessionStorage['solveit-file-tree:open']`. Drag the right edge on desktop to resize the panel (persisted in `localStorage`); double-click the edge to reset.
- The tree stays rooted at `~/` and expands the active dialog's folder. Dotfiles are hidden by default; the `.*` toggle remembers your preference in `localStorage`.
- Right-click a folder or the root bar for **New Dialog**, **New File**, and **New Folder**. Double-click blank explorer space to create in the current folder, or double-click the `~/` bar to create at root. In this quick-create flow, `notes` and `notes.ipynb` create dialogs; `notes.txt` creates a plain file.
- The inline name field submits on Enter and cancels on Escape or a click outside it. Canceling clears the draft, not the explorer. Errors stay inline; successful creation refreshes the folder without opening the new item.
- Rows offer Copy and Delete; paste into a destination folder or the root bar. Drag and drop moves items. Folder copy, move, and delete include descendants; moves copy first, then remove the source. Delete asks for confirmation.
- Upload files or folders from the explorer toolbar or a destination folder. The upload panel supports file and folder pickers as well as drag and drop. Use the toolbar collapse button to close all expanded folders.
- Plain files open in a temporary editor overlay. Dialogs open through Solveit's normal dialog route.
- Maintainers: `CRAFT.js` owns the panel, draft, and gestures; Quercus renders the rows. `renderTree()` remounts the draft after row replacement. `CRAFT.css` styles the inline field. Reload after changing the live assets in `~`; the repository copies in `~/.craft` are separate.
- **Mod+Shift+P** opens the searchable command/file launcher by default. Arrow keys select, Enter runs/opens, and Escape closes. File results cover the root and folders already loaded by the tree, not a recursive disk-wide search.

`Mod` means Command on macOS and Control elsewhere. Your browser-local rebindings may differ from these defaults; browser-reserved combinations can take precedence. These are enhancements around Solveit's existing dashboard, not a replacement dashboard application.

## Hotkey manager

Open shortcut settings from Solveit's shortcuts control or press `?` (the default). Overrides are stored per browser. Custom features register through `window.__hotkeyRegister` so they can register before the manager loads.

Built-in actions normally redispatch their original keys so Solveit handles them. The I/O entries are deliberately replaced with the three-state handlers above. The disable-original control is available for rebound built-ins. Command-launcher actions retain their page/editor/selection requirements.

## Theme and fonts

Tokyo Night Pure colors include `#1f2030` for the reading canvas, `#16161e` for recessed/code surfaces, `#cfc9c2` text, `#7aa2f7` selection, and `#7dcfff` links. Prose is 11px with an 11px line height (`--craft-prose`, `--craft-prose-lh`) and code is 10px with a 10px line height (`--craft-code`); Monaco uses the code-size setting and compact line height.

All non-code UI and prose use Encode Sans variable webfonts from jsDelivr (`google/fonts`, `75%` width, weight `360`/`650`, `"c2sc" 1, "onum" 1`), with a system sans-serif fallback (`--craft-prose-family`). Code blocks, inline code, and Monaco use Iosevka webfonts from `iosevka-webfonts.github.io`, with a system monospace fallback (`--craft-code-family`), keeping `font-stretch: normal` and `font-feature-settings: normal`. Browser network access to those hosts is required for the webfonts; no OS font installation is needed.

## Working on it

Source notebooks live in `nbs/craft/` and compile into `dist/` via `craft_dev` (`uv run craft-cdp build`). The top-level shipped files (`CRAFT.css`, `CRAFT.js`, `craft_md.js`, `hotkey_manager.js`, `hotkey_builtins.js`) are kept in sync with `dist/` so `setup.sh` works on any Solveit instance without requiring Python, `uv`, or Node.

```bash
uv run craft-cdp build                                              # compile nbs/craft/*.ipynb -> dist/ + node --check
uv run nbdev-test nbs/craft                                         # offline notebook tests
uv run craft-cdp smoke                                              # live CDP UI smoke checks against local assets
uv run craft-cdp deploy                                             # build dist/ and deploy to your live Solveit instance
```

Before committing shipped UI changes, copy the rebuilt runtime files from `dist/` to the repo root (and never commit `.auth/`, `.craft-debug/`, or personal dialog notebooks):

```bash
cp dist/CRAFT.css dist/CRAFT.js dist/craft_md.js dist/hotkey_manager.js dist/hotkey_builtins.js .
bash -n setup.sh && bash -n zsh-setup.sh
git diff --check
```

For full `craft_dev` CLI and authentication setup, see [`dev/README.md`](dev/README.md) and [`nbs/index.ipynb`](nbs/index.ipynb). Test the installer with `--dest` pointing at a temporary directory: fresh install, repeat install, a locally modified file preserved under default mode, then `--replace` with the original file retained in backups. Never test replacement against an unbacked-up personal installation.

For editor changes, test `a` and `b` with each picker type and `Alt+Enter` from a disposable code cell. Verify that typing works without a click after the WebSocket card refresh, and that focused empty code and raw cells show the caret but not the placeholder. Also check click, `Enter`, save, and `Escape`. For presentation changes, check both input/output cycles, Omit and restore, cell chains, and action menus.

## Optional terminal setup

`zsh-setup.sh` installs an amd64 Debian build of zsh into `~/.craft-assets/zsh` and clones oh-my-zsh. New interactive terminals prefer system zsh when available. The script rewrites `~/.bashrc`, `~/.bash_profile`, and `~/.zshrc` on each run; it backs up existing files only once (`*.solveit-bak`). Review those files before running `bash ~/.craft/zsh-setup.sh`, then open a new terminal with **Shift+T**.
