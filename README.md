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
| `CRAFT.ipynb` | notes prepended to AI context; code cells run on kernel start |
| `setup.sh` | symlinks the three CRAFT files into `~` (= `/app/data`) |

Solveit discovers `CRAFT.*` by walking up from a dialog's folder, so placing
them at the data root applies them to every dialog, with per-folder CRAFTs
still layering on top.

## Working on it

`setup.sh` symlinks rather than copies, so editing `~/CRAFT.css` edits the
repo directly:

```bash
cd ~/.craft && git commit -am "..." && git push   # publish local edits
cd ~/.craft && git pull                           # update, then reload
```

## Theme

Palette from `nishantg96/Tokyo-Night-Pure-VSCode`:
`#16161e` canvas · `#1a1b26` cards · `#222434` outputs · `#cfc9c2` text ·
`#7aa2f7` active · `#1779b2` links.

Prose 13px, code 12px, line-height 1.15 throughout.
