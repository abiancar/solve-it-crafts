# Feature Roadmap (`solve-it-crafts`)

This document captures candidate cell-level and workflow features for `solve-it-crafts`. Each feature is written to be self-contained so an engineer or agent can pick up any item independently and wire it cleanly into the existing architecture.

---

## How Features Plug Into `solve-it-crafts`

Before implementing any feature below, follow these conventions:

- **Source of truth:** Author features in numbered notebooks under `nbs/craft/` (currently `00_architecture.ipynb` through `12_mobile.ipynb`). Add a new notebook (`13_<feature>.ipynb`) for standalone features, or extend an existing notebook when the feature directly modifies that subsystem.
- **Build directives:** Use `#| export_css CRAFT.css`, `#| export_js CRAFT.js`, `#| export_js_iife CRAFT.js <group>`, and `#| export_ft CRAFT.js` (for `TEMPLATES` / `CONFIG` using `craft_overlay`, `craft_card`, `craft_menu`, `craft_btn`, `craft_input`, and `svg_icon` helpers from `craft_dev/build.py`).
- **Build & verification:** Run `uv run craft-cdp build` (compiles `nbs/craft/*.ipynb` into `dist/` and runs `node --check`), `uv run nbdev-test nbs/craft`, and `uv run craft-cdp smoke`. Sync rebuilt files from `dist/` to the repo root before committing.
- **Shared runtime primitives (`window.__craftCMCore`):** Reuse `htmxPost`, `kid`, `normId`, `getCellEl`, `onDomChange`, `store` (`localStorage`/`sessionStorage`), `mountTpl`, `el`, `qs`, `qsa`, `on`, `notifyErr`, `typingBlocked`, `saveInputContents`, `splitCellAt`, `switchCellMtype`, and `runCellCmd`.
- **Discoverability (Hotkeys & Command Palette):** Register every user-facing action via `window.__hotkeyRegister({id, label, group, combo, handler})`. The existing command launcher (`#solveit-launcher`, `Mod+Shift+P`) automatically surfaces all registered actions—do not build a separate command palette.
- **Theming & Mobile:** Style with `--craft-*` CSS tokens from `01_theme_and_tokens.ipynb` so light/dark themes stay cohesive. Ensure touch ergonomics work under `html.craft-mobile` (`12_mobile.ipynb`), where hover and keyboard shortcuts are unavailable.
- **Client-side boundary:** `solve-it-crafts` is a client-side layer (`CRAFT.css` + `CRAFT.js`). Solveit's server owns LLM prompt assembly, kernel execution, and notebook persistence. Features that affect AI context or notebook contents must orchestrate Solveit's existing HTMX/fetch endpoints (such as `/set_contents_`, `/add_runq_`, `/split_at_`, `/set_mtyp_`, `/upsert_msg_`, and hide-from-AI toggles) rather than assuming server-side hooks.

---

## 1. Context Control & Scoping

These features share one core primitive: a **transactional visibility engine** that can snapshot, temporarily modify, and reliably restore Solveit's per-cell hide-from-AI flags.

### 1.1 All-But (One-Shot Minimal Context Prompt)
- **Goal:** Let a user trigger a one-time prompt that sends *only* the target cell (plus any extra cells they click to include) while hiding all other cells from the AI, then automatically restores the dialog's prior visibility state.
- **How it works:**
  1. Triggering All-But on a cell enters a staging mode. Snapshot the IDs of all cells that are *already* hidden from AI and persist that snapshot to `sessionStorage` keyed by dialog/kernel ID (`kid`).
  2. Visually dim excluded cells and show a compact floating staging bar (e.g., *"All-But: 2 cells · ~1.4k / 38k tokens · Click cells to toggle · Esc to cancel"*).
  3. Clicking any cell in staging mode toggles whether it is included in the one-shot scope.
  4. When the user submits the prompt, toggle Solveit's hide-from-AI flag on all excluded cells, run the prompt, and restore the exact pre-All-But hidden set once the run completes, is stopped (`Shift+S`), or is cancelled.
  5. If the page reloads or a run fails mid-flight while a `sessionStorage` snapshot is still active, show a one-click *"Restore pre-All-But visibility"* banner so cells are never left stranded as hidden.
- **Ecosystem integration:** Register via `window.__hotkeyRegister` and expose in the cell `…` action menu (`07_cell_presentation.ipynb`) and mobile bottom sheet (`12_mobile.ipynb`). Use `CORE.onDomChange` / HTMX request hooks to detect prompt start and completion.
- **Constraints:** Do not overwrite cells the user intentionally hid before entering All-But mode; restore only the diff from the snapshot.

### 1.2 Context Lens (Generalized One-Shot Scopes)
- **Goal:** Reuse the All-But transactional visibility engine to offer common context slices in one click.
- **Scopes to support:**
  - *All-But this cell*
  - *This heading section only*
  - *Pinned cells + this cell*
  - *Code cells + error outputs only*
  - *Last N cells*
- **Ecosystem integration:** Register each lens as a launcher command (`window.__hotkeyRegister`) and group them under a submenu in the cell action menu.

### 1.3 Saved Context Presets
- **Goal:** Let users save named cell selections (e.g., *"API cells"*, *"Schema + tests"*) and re-apply them across prompts.
- **How it works:** Store `{presetName: [msgId, ...]}` in `localStorage` keyed by dialog path via `CORE.store`. Applying a preset either runs through the All-But staging flow (one-shot) or permanently updates hide-from-AI flags on request. Prune deleted message IDs gracefully when loading a preset.
- **Ecosystem integration:** Expose via `#solveit-launcher` and a lightweight preset picker in the All-But staging bar.

### 1.4 Context Budget Meter
- **Goal:** Make token consumption visible at a glance so context-pruning features (All-But, hide-from-AI, presets) have immediate feedback.
- **How it works:** Parse the per-cell token counts Solveit already renders in card headers, sum all currently non-hidden cells, and display a compact running total in the navbar. Optionally render a thin left-edge heat strip on cells proportional to their share of the active context.
- **Ecosystem integration:** Update via a throttled `CORE.onDomChange` observer scoped to `#dialog-container`. Keep styling minimal using `--craft-muted`, `--craft-amber`, and `--craft-red`.

### 1.5 "What the AI Sees" Preview
- **Goal:** Give users a one-click modal showing the exact ordered list of non-hidden and pinned cells that will be sent on the next prompt, along with per-cell and total token counts.
- **How it works:** Build a read-only `craft_overlay` + `craft_card` modal listing included cells in document order with quick toggle buttons to hide/unhide directly from the preview.
- **Constraints:** Label the view clearly as an approximation of dialog cells—client-side CRAFT cannot inspect hidden server-side system prompts, tool schemas, or `CRAFT.ipynb` injections unless Solveit exposes an endpoint for them.

### 1.6 Traceback Quick-Fix ("Ask AI About This Error")
- **Goal:** Eliminate manual context pruning when debugging a failing code cell.
- **How it works:** `craftC2` (`10_code_editor_c2.ipynb`) already detects tracebacks in code outputs to auto-enable line numbers. Add a small inline action button on traceback outputs that inserts a prompt below the cell and activates All-But scoped to *only* the failing code cell and its traceback.
- **Ecosystem integration:** Depends on **1.1 All-But** and hooks into `10_code_editor_c2.ipynb` / `07_cell_presentation.ipynb`.

---

## 2. Structural Cell Operations

### 2.1 Partition (Split, Fork, or Extract Dialog)
- **Goal:** Split a growing dialog into two dialogs based on the current cell or multi-cell selection.
- **Modes:**
  - **Split here:** Keep cells above the cut in the current dialog; move the selected cell and everything below to a new dialog.
  - **Fork from here:** Duplicate the dialog and drop everything below the cut (useful for branching an exploration).
  - **Extract selection:** Copy or move non-contiguous selected cells into a new dialog, optionally leaving a note with a link to the new dialog.
- **How it works:** Prefer **Duplicate + prune** (or creating a new `.ipynb` via the file tree's dialog-creation endpoints in `06_file_tree.ipynb` and transferring cells) over rebuilding cells one-by-one so outputs, attachments, and metadata are preserved.
- **Ecosystem integration:** Register in `window.__hotkeyRegister`, cell action menu, and multi-cell batch bar (**2.4**). Refresh the file tree (`06_file_tree.ipynb`) after creating the new dialog.
- **Constraints:** In Solveit, each dialog owns its own kernel (`kid`), so partitioned dialogs cannot share live kernel state. Communicate this clearly in the UI.

### 2.2 Merge Cells
- **Goal:** Provide the inverse of cell splitting (`splitCellAt` in [CRAFT.js](file:///Users/abiancar-nrh/projects/solve-it-crafts/CRAFT.js#L340-L350)) to clean up fragmented prose or iterative code cells.
- **How it works:** When two or more consecutive cells of the same type are selected, concatenate their inputs (separated by a blank line), save into the first cell via `/set_contents_`, and delete the remaining cells. Protect active inline editors by committing/exiting them first.
- **Ecosystem integration:** Register via `window.__hotkeyRegister`, add to the multi-cell batch bar (**2.4**), and reuse `CORE.saveInputContents`.

### 2.3 Drag + Modifier and Keyboard Cell Reordering
- **Goal:** Let users reorder cells fluidly without manual cut-and-paste.
- **How it works:**
  - **Keyboard (primary, accessible):** `Alt+Up` / `Alt+Down` (rebindable in `hotkey_manager.js`) moves the selected cell or multi-cell block up/down by one position.
  - **Pointer (desktop):** Holding a configurable modifier (defaulting to a non-colliding chord, with Hyper `Ctrl+Alt+Shift+Cmd` supported as an option) and dragging a cell shows a drop-line indicator between cells and moves the cell on drop.
  - **Mobile:** Offer *Move up* / *Move down* in the mobile bottom sheet and multi-cell batch bar.
- **Ecosystem integration:** Register bindings in `hotkey_manager.js` so users can avoid macOS Hyper-key collisions with window managers.
- **Constraints:** Verify whether Solveit exposes a direct cell-reorder endpoint; if not, orchestrate Solveit's existing cut/paste endpoints while preserving multi-cell order.

### 2.4 Contextual Multi-Cell Batch Bar (Desktop & Mobile)
- **Goal:** Surface batch cell actions whenever 2+ cells are selected, especially on mobile where keyboard shortcuts are unavailable.
- **How it works:** Watch selection state (`[data-sm="primary"]` / selected cells via `CORE.onDomChange`). When multiple cells are selected, float a compact pill bar at the bottom of the viewport with one-tap actions: *All-But*, *Omit*, *Hide from AI*, *Partition*, *Merge*, *Move*, and *Delete*.
- **Ecosystem integration:** Reuse the floating dock styling from `12_mobile.ipynb` and hide the bar when an inline editor or modal is open (`BLOCKED_SEL`).

### 2.5 Section-Level Actions on Markdown Headings
- **Goal:** Turn heading-structured dialogs into manipulable sections.
- **How it works:** Detect heading cells (`h1`–`h6` or Solveit's section headers) and add a compact section menu on hover/focus/tap: *Run all code in section*, *All-But this section*, *Omit section*, *Partition section to new dialog*, and *Copy section as Markdown*.
- **Ecosystem integration:** Builds on `07_cell_presentation.ipynb` (Omit) and **1.1 All-But** / **2.1 Partition**.

### 2.6 Send Cell(s) to Another Dialog
- **Goal:** Move or copy selected cells directly into another dialog without opening both tabs.
- **How it works:** Triggered from the cell menu or launcher, open a filterable dialog picker populated from the file tree's known dialogs (`06_file_tree.ipynb`), then append the selected cells to the target dialog (and optionally delete them from the source).

---

## 3. Navigation, Reference & History

### 3.1 Minimap / Outline Rail
- **Goal:** Make long dialogs fast to scan and jump through.
- **How it works:** Render a slim, collapsible rail beside `#dialog-container` (or a slide-over drawer on `html.craft-mobile`) displaying Markdown headings, cell-type color ticks, hidden/omitted indicators, and red error markers. Clicking any entry scrolls smoothly to that cell and selects it.
- **Ecosystem integration:** Toggle via `window.__hotkeyRegister`, persist open/closed state in `CORE.store`, and update via throttled `CORE.onDomChange`.

### 3.2 Sticky Reference Pane (Pin Cell to Side)
- **Goal:** Keep 1–2 reference cells (a schema, spec note, or DataFrame output) visible while scrolling and editing elsewhere in a long dialog.
- **How it works:** Add a *"Pin to side pane"* action in the cell `…` menu. Clone/mirror the cell's rendered content into a resizable docked right-hand pane (reusing the resizer pattern from `06_file_tree.ipynb`) and refresh it when the source cell changes.

### 3.3 Per-Cell Version History & AI Edit Review
- **Goal:** Make edits—especially silent AI rewrites of earlier cells—transparent and one-click reversible.
- **How it works:**
  - Snapshot cell input text in memory (or `sessionStorage`) on every local save and immediately before `/add_runq_` executes.
  - When a cell's content changes after an AI run (Solveit already marks cells with `data-diff="changed"` / `"deleted"`, styled in [CRAFT.css](file:///Users/abiancar-nrh/projects/solve-it-crafts/CRAFT.css#L144-L145)), show an inline diff toggle with **Accept** and **Revert** buttons.
  - Provide a *"Cell history"* popover in the cell `…` menu listing prior snapshots for that cell in the current session, with one-click restore via `/set_contents_`.
- **Ecosystem integration:** Hook into `createInlineEditor`'s save lifecycle in `04_cm_core.ipynb` and `CORE.onDomChange`.

### 3.4 Stale-Output Badges (Session-Scoped)
- **Goal:** Flag code cells whose source has been edited since they last ran.
- **How it works:** Track the timestamp of each code cell's last `/set_contents_` save versus its last output DOM mutation or `/add_runq_` completion during the session. When edited after the last run, display a subtle amber *"stale"* badge in the cell header.
- **Constraints:** Keep this scoped to *"edited since last run."* Full cross-cell variable-dependency tracking requires Python AST parsing and kernel state inspection and is out of scope for a pure client-side layer.

### 3.5 Scratchpad / Ephemeral Cell Flag
- **Goal:** Keep exploratory `print()` / `df.head()` cells from polluting AI context or final exports.
- **How it works:** Add a *"Mark as scratch"* toggle that sets Solveit's hide-from-AI flag, tags the cell ID in `localStorage` (per dialog), and applies a subtle recessed dashed badge. Provide a single launcher command—*Clear all scratch cells*—to delete all tagged cells when wrapping up.

---

## 4. Reading Comfort, Typography & Accessibility

### 4.1 Font Settings by Cell Type (Live Preview & Persistence)
- **Goal:** Let users customize font family, size, line height, and weight independently per cell type without hand-editing CSS.
- **How it works:**
  - Split the existing `--craft-prose` / `--craft-code` variables in [CRAFT.css](file:///Users/abiancar-nrh/projects/solve-it-crafts/CRAFT.css#L11-L19) into per-cell-type CSS custom properties: **Prompt**, **Assistant response**, **Note**, **Code**, and **Raw** (falling back to `--craft-prose` / `--craft-code` when unset).
  - Build a settings modal (`craft_overlay` + `craft_card`, matching `hotkey_manager.js`) with live-rendered example cards inside the modal and instant live-reload on the active dialog before saving.
  - Persist settings per browser via `CORE.store` (`localStorage`), apply them early on load (including syncing Monaco's code font size), and include a **"Copy as CRAFT.css snippet"** button for users who want folder-scoped overrides.
- **Ecosystem integration:** Register *"Font settings"* via `window.__hotkeyRegister` and add a reset-to-defaults action.

### 4.2 Text-to-Speech (TTS) Reader
- **Goal:** Listen to prose notes and AI responses hands-free.
- **How it works:**
  - Use the browser's Web Speech API (`window.speechSynthesis`) as the zero-setup default.
  - Before speaking, strip Markdown syntax, bare URLs, and inline hex/path literals, and either skip or replace code blocks and tables with a brief spoken placeholder (e.g., *"Python code block, 18 lines"* or *"Table, 5 columns"*).
  - Highlight the active sentence/paragraph as it reads and show a compact floating player bar (play/pause, speed 1x–2x, previous/next cell, and *Read from here*).
- **Ecosystem integration:** Add *"Read aloud"* and *"Read from here"* to the cell `…` menu and `window.__hotkeyRegister`.
- **Constraints:** Chunk long cells by sentence to avoid Chrome's long-utterance stall bug, and initiate playback directly inside a click/tap handler to satisfy mobile Safari's user-gesture requirement.

### 4.3 Accessibility Pass
- **Goal:** Close existing keyboard, screen-reader, and contrast gaps across the UI.
- **Checklist:**
  - Add descriptive `aria-label` attributes to icon-only navbar buttons.
  - Ensure hover-only controls (such as the cell `…` action menu trigger) also reveal on `:focus-visible`.
  - Provide clear, consistent focus rings using `--craft-accent` across interactive controls and modals.
  - Raise contrast on DataFrame/progressive table headers and muted metadata to meet WCAG AA (at least 4.5:1 for normal text).
- **Ecosystem integration:** Primarily CSS updates in `01_theme_and_tokens.ipynb`, `07_cell_presentation.ipynb`, and `08_tables.ipynb`, plus small DOM attribute additions in `05_dialog_chrome.ipynb`.

---

## Suggested Implementation Order

1. **Foundation — Transactional Visibility Engine:** Unlocks **All-But (1.1)**, **Context Lens (1.2)**, **Saved Presets (1.3)**, **Context Budget Meter (1.4)**, and **Traceback Quick-Fix (1.6)** on one shared primitive.
2. **Self-Contained Quick Wins:** **Font Settings (4.1)** and **Accessibility Pass (4.3)**—no backend orchestration required.
3. **Structural Cell Editing:** **Multi-Cell Batch Bar (2.4)**, **Merge Cells (2.2)**, and **Partition (2.1)**.
4. **Independent Power Features:** **Minimap (3.1)**, **Section Actions (2.5)**, **Cell History / AI Edit Review (3.3)**, **TTS (4.2)**, **Sticky Reference Pane (3.2)**, and **Drag/Keyboard Reordering (2.3)**.
