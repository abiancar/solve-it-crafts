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
| `CRAFT.js`  | injected as `<script type="module">`; hides the body of bare `.` prompts |
| `setup.sh` | copies the CRAFT files into `~` (= `/app/data`) |

Solveit discovers `CRAFT.*` by walking up from a dialog's folder, so placing
them at the data root applies them to every dialog, with per-folder CRAFTs
still layering on top.

## Working on it

`setup.sh` copies the files into `~`. Editing `~/CRAFT.css` does not change the repo. Copy your edits back before you commit:

```bash
cp ~/CRAFT.css ~/CRAFT.js ~/.craft/ && cd ~/.craft && git commit -am "..." && git push   # publish local edits
cd ~/.craft && git pull && bash setup.sh                                                  # update, then reload
```

When `~` already holds a different `CRAFT.css` or `CRAFT.js`, `setup.sh` keeps it and writes the repo version to the first free name: `CRAFT-1.css`, `CRAFT-2.css`, and so on. Merge the two by hand, then delete the numbered file. Re-running `setup.sh` writes nothing when `~` already has a copy identical to the repo version.

## Theme

Palette from `nishantg96/Tokyo-Night-Pure-VSCode`:
`#16161e` canvas · `#1a1b26` cards · `#222434` outputs · `#cfc9c2` text ·
`#7aa2f7` active · `#1779b2` links.

Prose 13px, code 12px, line-height 1.15 throughout.
