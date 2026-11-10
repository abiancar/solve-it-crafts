# solve-it-crafts

Personal [Solveit](https://solve.it.com) CRAFT files: a borderless, compact
dark theme based on Tokyo Night Pure.

## Install on a new instance

```bash
git clone https://github.com/abiancar/solve-it-crafts.git ~/.craft
bash ~/.craft/setup.sh
```

Then **reload the page** — CSS and JS are injected at page load.

## What's here

| file | purpose |
|---|---|
| `CRAFT.css` | injected as `<style>`; the theme |
| `CRAFT.js`  | injected as `<script type="module">`; hides the body of bare `.` prompts, adds a file tree panel (⌘B / Ctrl+B), an auto-hiding top nav, and compact Monaco line height |
| `quercus-treeview.js`, `quercus-treeview.css` | tree widget used by the file tree panel |
| `vscode-icons/` | file and folder icons for the file tree (with its `LICENSE`) |
| `setup.sh` | copies all of the above into `~` (= `/app/data`), keeping the same layout |

Solveit discovers `CRAFT.*` by walking up from a dialog's folder, so placing
them at the data root applies them to every dialog, with per-folder CRAFTs
still layering on top.

## Working on it

`setup.sh` copies the files into `~`. Editing `~/CRAFT.css` does not change the repo. Copy your edits back before you commit:

```bash
cp ~/CRAFT.css ~/CRAFT.js ~/quercus-treeview.css ~/quercus-treeview.js ~/.craft/ && cp ~/vscode-icons/* ~/.craft/vscode-icons/ && cd ~/.craft && git add -A && git commit -m "..." && git push   # publish local edits
cd ~/.craft && git pull && bash setup.sh                                                  # update, then reload
```

When `~` already holds a different copy of any installed file, `setup.sh` keeps it and writes the repo version to the first free numbered name: `CRAFT-1.css`, `quercus-treeview-1.js`, `vscode-icons/LICENSE-1`, and so on. Merge the two by hand, then delete the numbered file. Re-running `setup.sh` writes nothing when `~` already has copies identical to the repo versions.

## Theme

Palette from `nishantg96/Tokyo-Night-Pure-VSCode`:
`#16161e` canvas · `#1a1b26` cards · `#222434` outputs · `#cfc9c2` text ·
`#7aa2f7` active · `#1779b2` links.

Prose 13px, code 12px, line-height 1.15 throughout.
