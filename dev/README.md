# `craft_dev`: nbdev `fastcdp` Auth & Debugging Toolkit

`craft_dev` is an `nbdev` package in this repository that exports Solveit authentication, CDP `Fetch` local asset interception, `dist/` and `chrome-ext/` builders, and `fastcdp` testing helpers for notebooks and scripts without modifying your installed `CRAFT.js` or `CRAFT.css`.

## Layout

- `nbs/index.ipynb`: overview and quickstart
- `nbs/00_auth.ipynb` -> `craft_dev/auth.py`: one-step Chrome/Vivaldi login (`login`/`alogin`, `ensure_auth`, `.auth/` config, `cookies_for_cdp`)
- `nbs/01_cdp.ipynb` -> `craft_dev/cdp.py`: `open_solveit()` async context manager, CDP `Fetch` CRAFT route interception, `inspect_dialog()`, `smoke_dialog()`
- `nbs/02_cli.ipynb` -> `craft_dev/cli.py`: `craft-cdp` (and `craft-pw`) CLI entry point (also shimmed by `dev/craft_pw.py`)
- `nbs/03_build.ipynb` -> `craft_dev/build.py`: `#| export_js` / `export_js_iife` / `export_css` / `export_ft` notebook extractor, `build_dist()`, and `sync_dist_to_root()`
- `nbs/04_tunnel.ipynb` -> `craft_dev/tunnel.py`: private Tailscale + `rustygate` tunnel setup and atomic `deploy_dist()`
- `nbs/05_chrome_ext.ipynb` -> `craft_dev/chrome_ext.py`: unpacked Manifest V3 Chrome/Vivaldi extension generator (`chrome-ext/`)
- `nbs/craft/*.ipynb`: modular CRAFT feature notebooks (`00_architecture` through `19_bug_capture`)
- `pyproject.toml` (`[tool.nbdev]`): `nbdev` v3 configuration and editable install (`craft-dev`)

After editing any notebook in `nbs/`, export updated Python modules with:

```bash
uv run nbdev-export
```

## 1. One-command login (Chrome/Vivaldi + Google OAuth)

```bash
uv run craft-cdp auth --url "https://your-instance.solve.it.com/dialog_?name=CRAFT"
```

This launches Chrome (or Vivaldi with `--browser vivaldi`) using a dedicated persistent profile at `.auth/chrome-solveit-profile`, captures your session cookies via CDP into `.auth/solveit-state.json` (`0600`, gitignored), saves the default URL in `.auth/config.json`, and closes the temporary window.

To refresh an expired session later, run `uv run craft-cdp auth` with no flags. You can also import cookies with `uv run craft-cdp auth-cookie` or `uv run craft-cdp auth-import --cookies <file>`.

## 2. Use from a notebook or async Python script

```python
from craft_dev.cdp import open_solveit, inspect_dialog

# Uses .auth/solveit-state.json and intercepts local CRAFT.js, CRAFT.css, and .craft-assets/*
async with open_solveit(mode="local", auto_auth=True) as (page, intercepted, page_errors):
    print(await page.eval("document.title"), len(intercepted), page_errors)
```

## 3. CLI commands & `nbdev-test`

```bash
uv run craft-cdp build                                              # compile nbs/craft/*.ipynb -> dist/
uv run craft-cdp build --sync                                       # build dist/, sync root assets, rebuild chrome-ext/
uv run craft-cdp build-ext                                          # rebuild chrome-ext/ only
uv run craft-cdp auth-status                                        # verify saved session headlessly
uv run craft-cdp inspect --screenshot .craft-debug/dialog.png --json
uv run craft-cdp inspect --mode vanilla                             # compare against base Solveit
uv run craft-cdp inspect --assets-dir dist                          # test a built dist/ folder
uv run craft-cdp smoke                                              # live CDP UI smoke checks
uv run craft-cdp tunnel                                             # bring up Tailscale + rustygate tunnel (--down to stop)
uv run craft-cdp deploy                                             # build dist/ and deploy atomically over the tunnel

# Offline notebook tests (no browser)
uv run nbdev-test

# Offline + live fastcdp UI tests (uses saved .auth/config.json URL or SOLVEIT_TEST_URL)
uv run nbdev-test --flags live
```
