# `craft_dev`: nbdev `fastcdp` Auth & Debugging Toolkit

`craft_dev` is an `nbdev` project inside this repository that exports reusable Solveit authentication, CDP `Fetch` local asset interception, and `fastcdp` testing helpers for any notebook, script, or test in the repo — without modifying your existing `CRAFT.js` / `CRAFT.css` files.

## Layout

- `nbs/index.ipynb` — overview and quickstart
- `nbs/00_auth.ipynb` -> `craft_dev/auth.py` — seamless one-step Chrome/Vivaldi login (`login`/`alogin`, `ensure_auth`, `.auth/` config, `cookies_for_cdp`)
- `nbs/01_cdp.ipynb` -> `craft_dev/cdp.py` — `open_solveit()` async context manager, CDP `Fetch` CRAFT route interception, `inspect_dialog()`, `smoke_dialog()`
- `nbs/02_cli.ipynb` -> `craft_dev/cli.py` — `craft-cdp` (and `craft-pw`) CLI entry point (also shimmed by `dev/craft_pw.py`)
- `nbs/03_build.ipynb` -> `craft_dev/build.py` — `#| export_js` / `export_js_iife` / `export_css` / `export_ft` notebook extractor and `build_dist()`
- `nbs/04_tunnel.ipynb` -> `craft_dev/tunnel.py` — private Tailscale + rustygate tunnel setup and atomic `deploy_dist()`
- `nbs/craft/*.ipynb` — modular CRAFT feature notebooks (`00_architecture`, `01_theme_and_tokens`, `02_hotkey_builtins`, `03_hotkey_manager`, `04_cm_core`, `05_dialog_chrome`, `06_file_tree`, `07_cell_presentation`, `08_tables`, `09_cell_insertion`, `10_code_editor_c2`, `11_markdown_editor`, `12_mobile`, `13_context_control`, `14_font_settings`, `15_structural_ops`, `16_navigation_reference`, `17_cell_history`, `18_tts_reader`, `19_bug_capture`)
- `pyproject.toml` (`[tool.nbdev]`) — `nbdev` v3 configuration and editable install (`craft-dev`)

After editing any notebook in `nbs/`, export updated modules with:

```bash
.venv/bin/nbdev-export
```

## 1. One-command login (Chrome/Vivaldi + Google OAuth)

```bash
.venv/bin/craft-cdp auth --url "https://your-instance.solve.it.com/dialog_?name=CRAFT"
```

This launches your real **Chrome** (or Vivaldi) browser using a dedicated persistent profile at `.auth/chrome-solveit-profile`, captures your session cookies via CDP into `.auth/solveit-state.json` (`0600`, gitignored), remembers the default URL in `.auth/config.json`, and closes the temporary window.

To refresh an expired session later, just run `.venv/bin/craft-cdp auth` with no flags.

## 2. Use from any notebook or async Python script in this repo

```python
from craft_dev.cdp import open_solveit, inspect_dialog

# Automatically uses .auth/solveit-state.json and intercepts local CRAFT.js/CSS/.craft-assets/*
async with open_solveit(mode="local", auto_auth=True) as (page, intercepted, page_errors):
    print(await page.eval("document.title"), len(intercepted), page_errors)
```

## 3. CLI debugging & `nbdev-test`

```bash
.venv/bin/craft-cdp auth-status
.venv/bin/craft-cdp inspect --screenshot .craft-debug/dialog.png --json
.venv/bin/craft-cdp inspect --mode vanilla   # compare against base Solveit
.venv/bin/craft-cdp inspect --assets-dir dist # test a built dist/ folder
.venv/bin/craft-cdp smoke

# Offline notebook tests (fast, no browser)
.venv/bin/nbdev-test

# Offline + live fastcdp UI tests (uses saved .auth/config.json URL or SOLVEIT_TEST_URL)
.venv/bin/nbdev-test --flags live
```
