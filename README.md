# solve-it-crafts

Personal [Solveit](https://solve.it.com) CRAFT customizations: a compact Tokyo Night Pure theme, document-style dialogs, a file tree, launcher, rebindable shortcuts, and presentation-only cell minimization.

## Install on a new instance

```bash
git clone https://github.com/abiancar/solve-it-crafts.git ~/.craft
bash ~/.craft/setup.sh
```

Reload the browser page. Solveit loads CRAFT CSS/JS at page load and discovers them by walking up from the dialog's folder. Installing at the data root (`$HOME`, normally `/app/data`) applies the customizations to dialogs below it; folder-specific CRAFTs can layer on top.

Optional terminal setup:

```bash
bash ~/.craft/zsh-setup.sh
```

Open a new terminal (Shift+T) afterward; existing terminals keep their current shell.

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
| `CRAFT.css` | Theme, document surfaces, cell chains, compact controls, omission and restore indicators |
| `CRAFT.js` | File tree, launcher, auto-hiding navigation, Monaco sizing, idle composer, cell chains, action menus, Omit, and three-state minimization |
| `hotkey_manager.js` | Rebindable action registry, shortcut dispatcher, and settings menu; overrides stored per browser |
| `hotkey_builtins.js` | Snapshot of Solveit's built-in shortcuts; update it when upstream bindings change |
| `quercus-treeview.js`, `quercus-treeview.css` | File-tree widget |
| `vscode-icons/` | File/folder icons and their license |
| `setup.sh` | Deploys the UI assets, with preservation or explicit backup-and-replace modes |
| `zsh-setup.sh` | Optional user-space zsh and oh-my-zsh installation |

## Document-style dialogs

- Page and prompt/response surfaces share `#1f2030`; notes have transparent backgrounds. Code retains its own surface.
- Consecutive visible prompts, code cells, and notes are grouped by type. Touching card corners are square; prompt/note chains are flush, while code chains retain 12px separation. Separate groups have 25px spacing.
- Prompt authorship is labeled **You** and **Assistant**. Token counts and timestamps appear on hover/focus, or remain available on touch devices. User prose is slightly brighter.
- Selection uses a square blue outline. The redundant green editing outline is suppressed.
- Bare `.` continuation prompts with responses hide their input card unless being edited; their responses remain visible.
- Input/output action toolbars become compact **…** menus, available on hover/focus and on touch devices. Menus invoke Solveit's existing actions and support keyboard navigation. Code input headers disappear when idle on pointer devices.
- The entire bottom composer hides when empty and idle, including its tabs and buttons. Existing edit/new-cell shortcuts reveal it, and nonempty drafts remain visible. Monaco and its form stay mounted; this is not an in-cell Monaco relocation implementation.

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

## File tree, dashboard access, and launcher

- **Mod+B** toggles the file tree. Its header contains the live editable dialog name, refresh, a home button for the Dialogs dashboard, and close.
- The dot-files toggle remembers its setting in localStorage.
- Right-click a file for Open, Duplicate, and Delete. Deletion asks for confirmation and uses the listing row's own action. Duplicate is currently dialog-only and still needs dedicated browser verification.
- Plain files open in a temporary editor overlay. Dialogs open through Solveit's normal dialog route.
- **Mod+Shift+P** opens the searchable command/file launcher by default. Arrow keys select, Enter runs/opens, and Escape closes. File results cover the root and folders already loaded by the tree, not a recursive disk-wide search.

`Mod` means Command on macOS and Control elsewhere. Your browser-local rebindings may differ from these defaults; browser-reserved combinations can take precedence. These are enhancements around Solveit's existing dashboard, not a replacement dashboard application.

## Hotkey manager

Open the shortcut settings from Solveit's shortcuts control or the configured **Show this shortcuts menu** binding (default **Mod+/**). Custom features register through `window.solveitHotkeys.register` or the queued `window.__hotkeyRegister` helper. Every action appears in the settings and can be rebound; conflicts are rejected and overrides are stored in localStorage.

Built-in actions normally redispatch their original keys so Solveit handles them. The I/O entries are deliberately replaced with the three-state handlers above. The disable-original control is available for rebound built-ins. Command-launcher actions retain their page/editor/selection requirements.

## Theme and fonts

Tokyo Night Pure colors include `#1f2030` for the reading canvas, `#16161e` for recessed/code surfaces, `#cfc9c2` text, `#7aa2f7` selection, and `#7dcfff` links. Prose is 11px and code 10px by default, controlled by `--craft-prose` and `--craft-code`; Monaco uses the code-size setting and compact line height.

Code blocks, inline code, and Monaco use Iosevka webfonts from `iosevka-webfonts.github.io`, with a system monospace fallback. Browser network access to that third-party host is required for the webfont; no font installation is needed.

## Working on it

The deployed files and git checkout are separate. Copy only reviewed changes back before committing; avoid staging dialog notebooks, personal settings, or unrelated files.

```bash
cp ~/CRAFT.css ~/CRAFT.js ~/.craft/
git -C ~/.craft diff --check
git -C ~/.craft diff --stat
```

Other deployed assets (hotkey files, tree widget, icons) must also be copied back if changed. Review, stage explicit files, commit, then push. Update README when behavior changes and setup.sh when the asset list or installation behavior changes.

Suggested checks before publishing:

```bash
node --check ~/.craft/CRAFT.js
bash -n ~/.craft/setup.sh
git -C ~/.craft diff --check
```

Test the installer with `--dest` pointing at a temporary directory: fresh install, repeat install, a locally modified file preserved under default mode, then `--replace` with the original file retained in backups. Never test replacement against an unbacked-up personal installation.

Browser checks: new/edit/save/Escape, prompt/note/code chains, action menus, omission grouping and keyboard restoration, both I/O cycles, input-only cells, active-edit protection, filtering, heading collapse, and HTMX/websocket updates. Long-dialog and failed-save recovery tests remain important. There is no comprehensive automated browser suite yet.

## Optional terminal setup

`zsh-setup.sh` installs user-space zsh from Debian packages into `~/opt/zsh`, plus oh-my-zsh, and configures new interactive shells to use the robbyrussell theme and git plugin. It needs no root access; existing terminals and noninteractive code-cell shell commands are unaffected. Files live on the persistent volume, and an installed system zsh is preferred if available.
