# solve-it-crafts

Personal [Solveit](https://solve.it.com) CRAFT files: a borderless, compact
dark theme based on Tokyo Night Pure.

## Install on a new instance

```bash
git clone https://github.com/abiancar/solve-it-crafts.git ~/.craft 2>/dev/null || git -C ~/.craft pull --ff-only
bash ~/.craft/setup.sh
bash ~/.craft/zsh-setup.sh
```

Then **reload the page** — CSS and JS are injected at page load — and open a **new terminal** (⇧T) for zsh + oh-my-zsh. Existing terminals keep their old shell.

## What's here

| file | purpose |
|---|---|
| `CRAFT.css` | injected as `<style>`; the theme |
| `CRAFT.js`  | injected as `<script type="module">`; hides the body of bare `.` prompts, adds a file tree panel, an auto-hiding top nav, compact Monaco line height, and bootstraps the hotkey manager |
| `quercus-treeview.js`, `quercus-treeview.css` | tree widget used by the file tree panel |
| `hotkey_manager.js` | the hotkey manager: a registry + dispatcher for page-level shortcuts and a settings menu (press `?`, the ⌨ button in the file tree header, or solveit's shortcuts icon). Every shortcut — custom or built-in — can be viewed and rebound there; overrides are saved per browser |
| `hotkey_builtins.js` | snapshot of solveit's ~80 built-in shortcuts fed to the menu; a rebound built-in re-fires its original keys so solveit's own handler runs it, and ⊘ can additionally disable the original combo |
| `vscode-icons/` | file and folder icons for the file tree (with its `LICENSE`) |
| `setup.sh` | copies all of the above into `~` (= `/app/data`), keeping the same layout |
| `zsh-setup.sh` | idempotent user-space zsh + oh-my-zsh install for the solveit terminal; new interactive shells exec into zsh |

Solveit discovers `CRAFT.*` by walking up from a dialog's folder, so placing
them at the data root applies them to every dialog, with per-folder CRAFTs
still layering on top.

## Working on it

`setup.sh` copies the files into `~`. Editing `~/CRAFT.css` does not change the repo. Copy your edits back before you commit:

```bash
cp ~/CRAFT.css ~/CRAFT.js ~/quercus-treeview.css ~/quercus-treeview.js ~/hotkey_manager.js ~/hotkey_builtins.js ~/.craft/ && cp ~/vscode-icons/* ~/.craft/vscode-icons/ && cd ~/.craft && git add -A && git commit -m "..." && git push   # publish local edits
cd ~/.craft && git pull && bash setup.sh && bash zsh-setup.sh                                # update, then reload + new terminal
```

When `~` already holds a different copy of any installed file, `setup.sh` keeps it and writes the repo version to the first free numbered name: `CRAFT-1.css`, `quercus-treeview-1.js`, `vscode-icons/LICENSE-1`, and so on. Merge the two by hand, then delete the numbered file. Re-running `setup.sh` writes nothing when `~` already has copies identical to the repo versions.

## Hotkey manager

Press `?` (outside a text field), the ⌨ button in the file tree header, or solveit's own shortcuts icon to open the settings menu. Custom features register shortcuts there (`window.solveitHotkeys.register` from any injected script); every row can be rebound — click **Change**, press the new keys — and conflicts are rejected. Overrides are saved per browser (localStorage).

Solveit's built-in shortcuts are listed too, from a snapshot of the reference manual (`hotkey_builtins.js` — refresh it when solveit updates). A rebound built-in re-fires its original keys on the same target, so solveit's own handler does the work; the ⊘ button on a rebound row additionally disables the original combo. Plain keys are never intercepted while typing in an editor.

## Terminal: zsh + oh-my-zsh

`zsh-setup.sh` installs user-space zsh from the Debian pool (extracted to `~/opt/zsh` — no root needed) plus oh-my-zsh, and writes `~/.bashrc`, `~/.bash_profile` and `~/.zshrc`. Every new interactive shell execs into zsh with the robbyrussell theme and the git plugin; existing terminals and `!` commands in code cells (non-interactive bash) are unaffected. Everything lives on the persistent volume, so it survives instance rebuilds. To pick up a newer zsh, bump the `.deb` URLs in the script (or delete `~/opt/zsh` and re-run it). A system-installed zsh is preferred automatically by the `~/.bashrc` guard if one ever exists.


## Theme

Palette from `nishantg96/Tokyo-Night-Pure-VSCode`:
`#16161e` canvas · `#1a1b26` cards · `#222434` outputs · `#cfc9c2` text ·
`#7aa2f7` active · `#1779b2` links.

Prose 13px, code 12px, line-height 1.15 throughout.
