# Features (`solve-it-crafts`)

Reference for the cell-level and workflow features implemented in `nbs/craft/`.

## How Features Plug Into `solve-it-crafts`

- **Source of truth:** Features live in numbered notebooks under `nbs/craft/` (`00_architecture.ipynb` through `19_bug_capture.ipynb`). Numeric prefixes fix JavaScript initialization order and CSS cascade order.
- **Build directives:** Notebooks export assets via `#| export_css CRAFT.css`, `#| export_js CRAFT.js`, `#| export_js_iife <target> <group>`, and `#| export_ft <target>` (for `TEMPLATES` and `CONFIG` built with helpers in [`nbs/03_build.ipynb`](nbs/03_build.ipynb)).
- **Build and verification:** Run `uv run craft-cdp build --sync` (compiles `nbs/craft/*.ipynb` into `dist/`, checks JS with `node --check` and `tsc` when installed, syncs built files to the repo root, and rebuilds `chrome-ext/`), `uv run nbdev-test nbs/craft`, and `uv run craft-cdp smoke`.
- **Shared runtime primitives (`window.__craftCMCore`):** [`nbs/craft/04_cm_core.ipynb`](nbs/craft/04_cm_core.ipynb) provides `SOLVEIT` (DOM selectors and HTMX endpoints), `onCells`, `features`, `createInlineEditor` (with `pointerEdit` option), `htmxPost`, `kid`, `normId`, `getCellEl`, `onDomChange`, `store`, `mountTpl`, `mountModal`, `mountMenu`, `mountBar`, `el`, `qs`, `qsa`, `on`, `notifyErr`, `typingBlocked`, `saveInputContents`, `splitCellAt`, `switchCellMtype`, and `runCellCmd`. On-demand features export into lazy sub-assets (`craft_fonts.js`, `craft_history.js`, `craft_tts.js`, `craft_bug_capture.js`) loaded from `/static/.craft-assets/` on first trigger.
- **Hotkeys and launcher:** Register user-facing actions with `window.__hotkeyRegister({id, label, group, combo, handler})`. The command launcher (`#solveit-launcher`, `Mod+Shift+P`) lists registered actions automatically.
- **Theming and mobile:** Features use `--craft-*` CSS tokens from [`nbs/craft/01_theme_and_tokens.ipynb`](nbs/craft/01_theme_and_tokens.ipynb) (`@layer craft-theme, craft-components, craft-mobile;`) and keep feature-specific `html.craft-mobile` overrides in their owning notebook.
- **Client-side boundary:** Solveit's server owns LLM prompt assembly, kernel execution, and notebook persistence. Features that change AI context or notebook contents call Solveit's HTMX and fetch endpoints (`/set_contents_`, `/add_runq_`, `/split_at_`, `/set_mtyp_`, `/upsert_msg_`, `/upload_file_`, and hide-from-AI toggles).

---

## 1. Context Control & Scoping

Implemented in [`nbs/craft/13_context_control.ipynb`](nbs/craft/13_context_control.ipynb) around a transactional visibility engine that snapshots, temporarily modifies, and restores Solveit's per-cell hide-from-AI flags.

### 1.1 All-But (One-Shot Minimal Context Prompt)
Sends a single prompt with only selected cells visible to the AI, then restores the dialog's prior visibility state.

1. Triggering All-But enters staging mode and saves the IDs of cells already hidden from AI to `sessionStorage`, keyed by dialog/kernel ID (`kid`).
2. Excluded cells dim and a floating staging bar shows the included cell count and token estimate.
3. Clicking any cell during staging toggles whether it is included.
4. Submitting a prompt hides excluded cells, runs the prompt, and restores the pre-All-But hidden set when the run completes, stops, or cancels.
5. If the page reloads while a snapshot is still active in `sessionStorage`, a banner offers a one-click restore so cells are not left hidden.

Exposed via `window.__hotkeyRegister`, the cell `…` action menu, and the multi-cell batch bar ([`nbs/craft/15_structural_ops.ipynb`](nbs/craft/15_structural_ops.ipynb)).

### 1.2 Context Lens
Reuses the All-But staging engine for one-shot context slices:

- *All-But this cell*
- *This heading section only*
- *Pinned cells + this cell*
- *Code cells + error outputs only*
- *Last N cells*

All five register as launcher/hotkey commands via `window.__hotkeyRegister`. The first four also appear as flat items under a `Context Control` header in the cell `…` menu; *Last N cells* is available through the launcher or hotkey (`ctx-lens-last-n`).

### 1.3 Saved Context Presets
Stores named cell selections (`{presetName: [msgId, ...]}`) per dialog in `localStorage` via `CORE.store`. Presets can be applied one-shot through All-But staging or permanently to hide-from-AI flags, pruning deleted message IDs on load. Accessible from `#solveit-launcher` and the All-But staging bar.

### 1.4 Context Budget Meter
Sums token counts across non-hidden cells and displays a running total in the navbar, with optional left-edge heat strips on cells. Per-cell counts check `[data-tokens]` attributes first, then rendered card-header token text, falling back to `Math.ceil(text.length / 4)`. Updates via throttled `CORE.onDomChange`.

### 1.5 "What the AI Sees" Preview
Opens a modal listing non-hidden and pinned cells in document order with per-cell and total token counts plus direct hide/unhide toggles. This preview approximates dialog cells only because client-side CRAFT cannot inspect server-side system prompts, tool schemas, or `CRAFT.ipynb` injections.

### 1.6 Traceback Quick-Fix
Runs via `CORE.onCells` in [`nbs/craft/13_context_control.ipynb`](nbs/craft/13_context_control.ipynb). Detects failing code outputs using `SOLVEIT.sel.ansiRed`, `.ansi-red-intense-fg`, or traceback/error text patterns, and adds an inline button that inserts a prompt below the failing cell and stages All-But scoped to that cell.

---

## 2. Structural Cell Operations

Implemented in [`nbs/craft/15_structural_ops.ipynb`](nbs/craft/15_structural_ops.ipynb).

### 2.1 Partition (Split, Fork, or Extract Dialog)
Splits or copies cells into a new dialog in three modes:

- **Split here:** Keeps cells above the cut in the current dialog and moves the cut cell and everything below to a new dialog.
- **Fork from here:** Duplicates the dialog and drops everything below the cut.
- **Extract selection:** Copies or moves selected cells to a new dialog, optionally leaving a note linking to it.

Partition fetches `/static/<relPath>` notebook JSON (falling back to DOM serialization if unavailable), slices `cells`, uploads the new `.ipynb` via `POST /upload_file_?folder=...`, deletes moved cells from the source dialog when required, and refreshes the file tree. Each Solveit dialog has its own kernel (`kid`), so the new dialog starts with a fresh kernel state.

### 2.2 Merge Cells
Combines two or more consecutive selected cells of the same type into the first cell via `/set_contents_` (committing active inline editors first) and deletes the remaining cells. Exposed via `window.__hotkeyRegister` and the multi-cell batch bar.

### 2.3 Keyboard and Drag-Modifier Cell Reordering
- **Keyboard:** `Alt+ArrowUp` and `Alt+ArrowDown` (rebindable via `hotkey_manager.js`) move the selected cell or multi-cell block up or down by orchestrating Solveit's cut (`x`) and paste (`v`) keyboard events.
- **Pointer (desktop):** Holding `Alt` (or `Ctrl+Alt+Shift+Cmd` when configured for Hyper mode) while dragging a cell shows a drop-line indicator and moves the cell on drop.
- **Menus:** Move up/down actions are also in the cell `…` menu and the multi-cell batch bar.

### 2.4 Contextual Multi-Cell Batch Bar
When two or more cells are selected, floats a bottom toolbar with *All-But*, *Omit*, *Hide AI*, *Partition*, *Merge*, *Move up/down*, *Send to…*, and *Delete*. Hides while `CORE.typingBlocked()` is true or All-But staging (`html.craft-ab-staging`) is active.

### 2.5 Send Cell(s) to Another Dialog
Opens a filterable dialog picker populated from the file tree ([`nbs/craft/06_file_tree.ipynb`](nbs/craft/06_file_tree.ipynb)) and appends selected cells to the target dialog, with an option to remove them from the source dialog.

### 2.6 Section-Level Actions (Deferred)
Heading section actions (the `§` trigger button and section menu) are currently hidden from the UI while awaiting redesign.

---

## 3. Navigation, Reference & History

### 3.1 Minimap / Outline Rail
Implemented in [`nbs/craft/16_navigation_reference.ipynb`](nbs/craft/16_navigation_reference.ipynb). Renders a collapsible rail beside `#dialog-container` (or a slide-over drawer on `html.craft-mobile`) showing Markdown headings, cell-type markers, hidden/omitted indicators, and error markers. Clicking an entry scrolls to and selects that cell.

### 3.2 Sticky Reference Pane
Implemented in [`nbs/craft/16_navigation_reference.ipynb`](nbs/craft/16_navigation_reference.ipynb). Pins up to 2 cells via the cell `…` menu into a resizable docked right-hand pane that refreshes when the source cell changes.

### 3.3 Per-Cell Version History & AI Edit Review
Implemented in [`nbs/craft/17_cell_history.ipynb`](nbs/craft/17_cell_history.ipynb) and lazy-loaded from `/static/.craft-assets/craft_history.js` (or loaded on startup when `data-diff` cells are present).

- Hooks `onCellHtmx([SOLVEIT.api.setContents, SOLVEIT.api.addRunq])` to record up to 25 input snapshots per cell in `sessionStorage` once loaded.
- Adds inline Diff, Accept, and Revert controls on AI-modified cells (`data-diff`).
- Provides a *Cell history* modal (`mountModal('hist_modal')`) in the cell `…` menu to restore prior snapshots via `/set_contents_`.

### 3.4 Stale-Output Badges
Implemented in [`nbs/craft/16_navigation_reference.ipynb`](nbs/craft/16_navigation_reference.ipynb). Marks code cells edited since their last run in the current session with an amber stale badge. Tracks per-cell edit vs. run timestamps only and does not analyze cross-cell Python variable dependencies.

### 3.5 Scratchpad / Ephemeral Cell Flag
Implemented in [`nbs/craft/16_navigation_reference.ipynb`](nbs/craft/16_navigation_reference.ipynb). Toggles a scratch flag that hides the cell from AI, stores its ID per dialog in `localStorage`, and adds a recessed dashed badge. A *Clear all scratch cells* launcher command deletes all tagged cells.

---

## 4. Reading Comfort, Typography, Accessibility & Bug Capture

### 4.1 Font Settings by Cell Type
Implemented in [`nbs/craft/14_font_settings.ipynb`](nbs/craft/14_font_settings.ipynb) and lazy-loaded from `/static/.craft-assets/craft_fonts.js`. A small stub in `CRAFT.js` applies saved settings immediately on page load.

- Configures font family, size, line height, and weight independently for **Prompt**, **Assistant response**, **Note**, **Code**, and **Raw** cells via `--craft-font-*` and `--craft-code*` CSS custom properties on `:root`.
- Includes live preview inside the modal, per-browser persistence via `CORE.store`, a **Copy as CRAFT.css snippet** export, and a reset-to-defaults action.

### 4.2 Text-to-Speech (TTS) Reader
Implemented in [`nbs/craft/18_tts_reader.ipynb`](nbs/craft/18_tts_reader.ipynb) and lazy-loaded from `/static/.craft-assets/craft_tts.js`. Uses the browser's Web Speech API (`window.speechSynthesis`).

- Triggered from the cell `…` menu (*Read aloud*, *Read from here*) or via launcher/hotkeys.
- Strips Markdown syntax and bare URLs, replaces code blocks and tables with brief spoken placeholders, chunks long cells by sentence, and highlights the active cell (`.craft-tts-active`).
- Displays a floating player bar with Prev, Play/Pause, Next, speed (`1.0×`–`2.0×`), status, and Stop.

### 4.3 Accessibility
`window.craftA11y` in [`nbs/craft/05_dialog_chrome.ipynb`](nbs/craft/05_dialog_chrome.ipynb) adds `aria-label` attributes to icon-only navbar buttons. CSS rules across `01_theme_and_tokens.ipynb`, `06_file_tree.ipynb`, `07_cell_presentation.ipynb`, `08_tables.ipynb`, and `09_cell_insertion.ipynb` add `:focus-visible` focus rings and keyboard access to hover-only controls.

### 4.4 In-App Bug Capture
Implemented in [`nbs/craft/19_bug_capture.ipynb`](nbs/craft/19_bug_capture.ipynb) and lazy-loaded from `/static/.craft-assets/craft_bug_capture.js`. Disabled by default; enable via the launcher's *Toggle bug-report help icon* or `window.craftBugCapture.setEnabled(true)`.

Captures title, description, URL, viewport, dialog ID, recent console errors, client-sanitized DOM HTML, and an optional screenshot, then submits `POST /api/tickets` to `window.CRAFT_SUPPORT_ENDPOINT || 'http://127.0.0.1:8791/api/tickets'`.
