"""Generate a heavy, realistic Solveit dialog fixture (`performance_fixture.ipynb`).

Covers:
- 16 rich tables (8 Markdown tables + 8 HTML output tables)
- 28 runnable pure-Python code cells (~60s total compute across all cells) with pre-populated outputs
- 36 Markdown note cells (headings, prose, lists, task lists, fences, tables)
- 12 Solveit prompt cells (`%%prompt`) with short, medium, and long AI responses
- Mixed cell states: skipped (hidden from AI), i_collapsed, o_collapsed, both collapsed, pinned,
  nbdev export, heading_collapsed, raw cells, and an ANSI traceback output.
"""

import hashlib, json, math, random
from pathlib import Path
from fastcore.nbio import mk_cell, new_nb, validate_nb, write_nb


def _cid(tag: str) -> str:
    return hashlib.sha1(tag.encode()).hexdigest()[:8]


def _md_table(rows: int, cols: int, seed: int) -> str:
    rng = random.Random(seed)
    hdrs = ['ID', 'Component', 'Status', 'RSS_MB', 'Heap_MB', 'Nodes', 'Latency_ms', 'Delta_%', 'Owner', 'Region', 'Build', 'Notes'][:cols]
    comps = ['cm_core', 'file_tree', 'cell_chains', 'tables', 'code_c2', 'md_editor', 'context', 'nav_ref', 'history', 'mobile']
    stats = ['ok', 'warn', 'active', 'cached', 'idle']
    regions = ['us-east', 'eu-west', 'ap-south', 'sa-east']
    lines = ['| ' + ' | '.join(hdrs) + ' |', '| ' + ' | '.join(['---'] * len(hdrs)) + ' |']
    for r in range(rows):
        vals = [
            f'T{seed:02d}-{r+1:03d}',
            f'`{comps[(r + seed) % len(comps)]}`',
            stats[(r * 3 + seed) % len(stats)],
            f'{rng.uniform(12.0, 480.0):.1f}',
            f'{rng.uniform(1.5, 48.0):.2f}',
            f'{rng.randint(120, 45000):,}',
            f'{rng.uniform(0.4, 95.0):.2f}',
            f'{rng.uniform(-42.0, 28.0):+.1f}%',
            f'eng-{(r % 6) + 1}',
            regions[r % len(regions)],
            f'v0.{seed}.{r % 9}',
            f'sample row {r+1} metric check',
        ][:cols]
        lines.append('| ' + ' | '.join(vals) + ' |')
    return '\n'.join(lines)


def _html_table(rows: int, cols: int, seed: int) -> str:
    rng = random.Random(seed + 1000)
    hdrs = ['idx', 'metric', 'baseline_ms', 'craft_ms', 'rss_mb', 'heap_mb', 'dom_nodes', 'layouts', 'ratio', 'status'][:cols]
    metrics = ['boot', 'scroll', 'edit_code', 'edit_md', 'htmx_swap', 'table_sort', 'filter_tree', 'outline_jump', 'ctx_meter', 'diff_view']
    th = ''.join(f'<th>{h}</th>' for h in hdrs)
    trs = []
    for r in range(rows):
        b_ms = rng.uniform(2.0, 120.0)
        c_ms = b_ms * rng.uniform(0.55, 1.15)
        cells = [
            str(r),
            metrics[(r + seed) % len(metrics)],
            f'{b_ms:.2f}',
            f'{c_ms:.2f}',
            f'{rng.uniform(210.0, 410.0):.1f}',
            f'{rng.uniform(8.0, 34.0):.2f}',
            str(rng.randint(4000, 62000)),
            str(rng.randint(0, 24)),
            f'{c_ms / b_ms:.2f}x',
            'pass' if c_ms <= b_ms * 1.05 else 'watch',
        ][:cols]
        trs.append('<tr>' + ''.join(f'<td>{v}</td>' for v in cells) + '</tr>')
    return f'<table class="dataframe"><thead><tr>{th}</tr></thead><tbody>' + ''.join(trs) + '</tbody></table>'


def _stream_out(text: str) -> dict:
    return {'output_type': 'stream', 'name': 'stdout', 'text': text}


def _html_out(html: str, plain: str = '<HTML Table>') -> dict:
    return {'output_type': 'display_data', 'data': {'text/html': html, 'text/plain': plain}, 'metadata': {}}


def _md_reply(md: str) -> dict:
    return {'output_type': 'display_data', 'data': {'text/markdown': md}, 'metadata': {}}


def _traceback_out() -> dict:
    return {
        'output_type': 'error',
        'ename': 'ValueError',
        'evalue': 'budget threshold exceeded: 142850 tokens > 120000 limit',
        'traceback': [
            '\x1b[0;31m---------------------------------------------------------------------------\x1b[0m',
            '\x1b[0;31mValueError\x1b[0m                                Traceback (most recent call last)',
            'Cell \x1b[0;32mIn[19], line 8\x1b[0m',
            '\x1b[1;32m      5\x1b[0m \x1b[38;5;28;01mdef\x1b[39;00m \x1b[38;5;21mcheck_budget\x1b[39;00m(tokens, limit=\x1b[38;5;241m120000\x1b[39;00m):',
            '\x1b[1;32m      6\x1b[0m     \x1b[38;5;28;01mif\x1b[39;00m tokens > limit:',
            '\x1b[1;32m----> 8\x1b[0m         \x1b[38;5;28;01mraise\x1b[39;00m \x1b[38;5;167;01mValueError\x1b[39;00m(\x1b[38;5;124mf"budget threshold exceeded: {tokens} tokens > {limit} limit"\x1b[39;00m)',
            '\x1b[0;31mValueError\x1b[0m: budget threshold exceeded: 142850 tokens > 120000 limit',
        ],
    }


def _note(tag: str, src: str, **meta):
    return mk_cell(src, cell_type='markdown', id=_cid(tag), metadata=meta)


def _code(tag: str, src: str, outputs=None, **meta):
    return mk_cell(src, cell_type='code', id=_cid(tag), metadata=meta, outputs=outputs or [])


def _prompt(tag: str, prompt_txt: str, reply_md: str, **meta):
    m = {'solveit_ai': True, **meta}
    return mk_cell(f'%%prompt\n{prompt_txt}', cell_type='code', id=_cid(tag), metadata=m, outputs=[_md_reply(reply_md)])


def _raw(tag: str, src: str, **meta):
    return mk_cell(src, cell_type='raw', id=_cid(tag), metadata=meta)


def _timed_workload_code(idx: int, label: str, target_sec: float, extra_body: str = '') -> str:
    return (
        f"# Workload {idx:02d}: {label} (calibrated to ~{target_sec:.1f}s)\n"
        f"import hashlib, math, time\n"
        f"t0 = time.perf_counter()\n"
        f"acc, iters = 0.0, 0\n"
        f"while time.perf_counter() - t0 < {target_sec:.2f}:\n"
        f"    h = hashlib.sha256(f'bench-{idx}-{{iters}}'.encode()).digest()\n"
        f"    acc += math.sin(h[0] + iters * 0.001) * math.cos(h[1])\n"
        f"    iters += 1\n"
        f"dt = time.perf_counter() - t0\n"
        f"print(f'[{idx:02d}] {label}: {{iters:,}} iters in {{dt:.2f}}s (checksum={{acc:.4f}})')\n"
        + (extra_body + '\n' if extra_body else '')
    )


def build_performance_fixture(out_path: Path) -> dict:
    cells = []

    # ── Header & Overview (pinned + normal notes) ──
    cells.append(_note(
        'hdr-0',
        "# Performance Stress Fixture (`performance_fixture`)\n\n"
        "Heavy Solveit dialog designed to stress-test browser RAM, DOM rendering, table sorting, syntax highlighting, "
        "outline navigation, collapsed/skipped/pinned states, and live cell execution (~60s total compute across all code cells).\n\n"
        "- [x] 16 rich tables (8 Markdown + 8 HTML DataFrame outputs)\n"
        "- [x] 28 runnable Python code cells calibrated to ~60s total compute\n"
        "- [x] 36 Markdown cells across nested heading levels\n"
        "- [x] 12 prompt cells with short, medium, and long AI responses\n"
        "- [x] Mixed visual states: `skipped`, `i_collapsed`, `o_collapsed`, both collapsed, `pinned`, `#| export`, `heading_collapsed`, `raw`, and ANSI traceback",
        pinned=True,
    ))

    cells.append(_code(
        'setup-pinned',
        "# Pinned benchmark helper\nimport time\nBENCH_RESULTS = []\n\ndef record(name, dt, rows=0):\n    BENCH_RESULTS.append({'name': name, 'sec': round(dt, 3), 'rows': rows})\n    return BENCH_RESULTS[-1]\n\nprint('Benchmark harness ready')",
        outputs=[_stream_out("Benchmark harness ready\n")],
        pinned=True,
    ))

    cells.append(_raw(
        'raw-0',
        "fixture: performance_fixture\ntarget_compute_seconds: 60\ntables: 16\ncode_cells: 28\nmarkdown_cells: 36\nprompt_cells: 12\n",
    ))

    # ── 6 Major Sections, each with headings, notes, tables, code cells, prompts, and mixed states ──
    section_specs = [
        ("1. Ingestion & Parsing Benchmarks", 2.2, 18, 8),
        ("2. Table Layout & Sorting Stress", 2.1, 24, 10),
        ("3. Syntax Highlighting & Editor State", 2.2, 16, 9),
        ("4. Context Control & Visibility States", 2.0, 20, 10),
        ("5. Streaming Outputs & Prompt Replies", 2.3, 22, 8),
        ("6. Long-Session Memory & Layout Stability", 2.1, 26, 10),
    ]

    code_idx = 1
    md_tbl_idx = 0
    html_tbl_idx = 0
    prompt_idx = 0

    for s_idx, (sec_title, base_sec, tbl_rows, tbl_cols) in enumerate(section_specs, 1):
        # Section H2 (make section 4 heading_collapsed to test collapsed heading state)
        h_meta = {'heading_collapsed': True} if s_idx == 4 else {}
        cells.append(_note(f'sec-{s_idx}-h2', f"## {sec_title}", **h_meta))

        # Intro prose note
        cells.append(_note(
            f'sec-{s_idx}-intro',
            f"This section exercises **{sec_title.lower()}** with realistic prose, code fences, and multi-column tables. "
            f"Each code block below is calibrated to run for roughly `{base_sec:.1f}s` of pure Python hashing and floating-point work "
            f"so executing the full dialog takes about one minute without requiring external packages.\n\n"
            f"> Key invariant for section {s_idx}: DOM updates must remain bounded and idle frames must stay at zero layouts per second.\n\n"
            f"```python\n"
            f"def section_{s_idx}_summary(items):\n"
            f"    return {{k: round(sum(v)/len(v), 3) for k, v in items.items() if v}}\n"
            f"```",
        ))

        # Markdown table cell (1 or 2 per section -> 8 total)
        n_md_tbls = 2 if s_idx in (2, 6) else 1
        for t in range(n_md_tbls):
            md_tbl_idx += 1
            r_cnt = tbl_rows if t == 0 else max(12, tbl_rows - 6)
            t_meta = {'skipped': True} if (s_idx == 4 and t == 0) else {}
            cells.append(_note(
                f'sec-{s_idx}-mdtbl-{t}',
                f"### Markdown Table {md_tbl_idx} ({r_cnt} rows x {tbl_cols} cols)\n\n" + _md_table(r_cnt, tbl_cols, md_tbl_idx),
                **t_meta,
            ))

        # Extra narrative / checklist markdown notes (3-4 per section -> 36 total)
        cells.append(_note(
            f'sec-{s_idx}-notes-a',
            f"### Subsection {s_idx}.1 — Operational Notes\n\n"
            f"1. Measure OS renderer RSS separately from V8 heap to catch font, image, and compositor memory.\n"
            f"2. Verify that collapsing inputs (`i_collapsed`) and outputs (`o_collapsed`) preserves cell chain borders.\n"
            f"3. Check sticky reference pane and outline rail scrolling across `{tbl_rows}`-row tables.\n\n"
            f"- [x] Baseline captured on vanilla Solveit\n"
            f"- [x] Re-measured with CRAFT deployed\n"
            f"- [ ] Compare with Chrome MV3 Monaco blocker active",
            **({'i_collapsed': 1} if s_idx == 3 else {}),
        ))

        cells.append(_note(
            f'sec-{s_idx}-notes-b',
            f"#### Deep Detail {s_idx}.1.a\n\n"
            + ' '.join([
                f"Paragraph {p} in section {s_idx} simulates realistic technical documentation inside a Solveit dialog, "
                f"mixing inline code like `window.__craftCMCore.onCells`, selectors like `.editable[data-mtype]`, and numeric metrics ({p * 17.4:.1f} ms)."
                for p in range(1, 5)
            ]),
            **({'skipped': True} if s_idx in (2, 5) else {}),
        ))

        if s_idx in (1, 3, 5, 6):
            cells.append(_note(
                f'sec-{s_idx}-notes-c',
                f"### Subsection {s_idx}.2 — Edge-Case Matrix\n\n"
                f"- Nested code block inside list:\n"
                f"  ```js\n"
                f"  const cells = document.querySelectorAll('#dialog-container > .editable');\n"
                f"  console.log('section {s_idx} cells:', cells.length);\n"
                f"  ```\n"
                f"- Secondary bullet with `inline_identifier_{s_idx}` and **emphasis**.",
            ))

        # 4-5 Code cells per section (~27 + 1 pinned setup = 28 total, ~60s total compute)
        n_code = 5 if s_idx in (1, 2, 5) else 4
        for j in range(n_code):
            c_idx = code_idx
            code_idx += 1
            sec_dur = round(base_sec + (j % 3) * 0.15, 2)
            meta = {}
            outs = [_stream_out(f"[{c_idx:02d}] {sec_title} step {j+1}: 48,200 iters in {sec_dur:.2f}s (checksum={math.sin(c_idx):.4f})\n")]

            # Attach HTML output tables to 8 code cells across the fixture
            if (j == 0) or (s_idx in (2, 6) and j == 2):
                html_tbl_idx += 1
                h_rows = 28 if s_idx in (2, 6) else 16
                h_cols = 10 if s_idx in (2, 6) else 8
                extra = (
                    f"from IPython.display import HTML, display\n"
                    f"display(HTML('<table><thead><tr><th>k</th><th>v</th></tr></thead>"
                    f"<tbody><tr><td>step</td><td>{c_idx}</td></tr></tbody></table>'))"
                )
                src = _timed_workload_code(c_idx, f"{sec_title} / HTML table {html_tbl_idx}", sec_dur, extra)
                outs.append(_html_out(_html_table(h_rows, h_cols, html_tbl_idx), f"HTML Table {html_tbl_idx} ({h_rows}x{h_cols})"))
            elif s_idx == 4 and j == 2:
                # One realistic ANSI traceback cell
                src = (
                    f"# Workload {c_idx:02d}: Simulated budget guard check (~{sec_dur:.1f}s before guard)\n"
                    f"import time\ntime.sleep({sec_dur:.2f})\n"
                    f"def check_budget(tokens, limit=120000):\n"
                    f"    if tokens > limit:\n"
                    f"        raise ValueError(f'budget threshold exceeded: {{tokens}} tokens > {{limit}} limit')\n"
                    f"check_budget(142850)\n"
                )
                outs = [_traceback_out()]
            else:
                src = _timed_workload_code(c_idx, f"{sec_title} step {j+1}", sec_dur)

            # Mix visual/metadata states across code cells
            if j == 1 and s_idx in (1, 4):
                meta = {'i_collapsed': 1, 'o_collapsed': 0}
            elif j == 2 and s_idx in (1, 5):
                meta = {'i_collapsed': 0, 'o_collapsed': 1}
            elif j == 3 and s_idx in (2, 5):
                meta = {'collapsed': True, 'i_collapsed': 1, 'o_collapsed': 1}
            elif j == 1 and s_idx in (2, 6):
                meta = {'skipped': 1}
            elif j == 3 and s_idx in (1, 3):
                meta = {'nbdev': {'export': 'true'}}
                src = "#| export\n" + src
            elif j == 2 and s_idx == 3:
                meta = {'pinned': True}

            # Add longer stdout log on a couple of cells
            if j == 3 and s_idx in (4, 6):
                log_lines = ''.join(f"2026-11-25 00:{s_idx:02d}:{k:02d} INFO  chunk={k:03d} nodes={1200 + k*37} heap_mb={14.2 + k*0.08:.2f}\n" for k in range(35))
                outs.append(_stream_out(log_lines))

            cells.append(_code(f'code-{c_idx:02d}', src, outputs=outs, **meta))

        # 2 Prompt cells per section -> 12 total (short, medium, long outputs)
        for p in range(2):
            prompt_idx += 1
            p_meta = {}
            if prompt_idx in (3, 9): p_meta = {'skipped': True}
            elif prompt_idx == 5: p_meta = {'i_collapsed': 0, 'o_collapsed': 1}
            elif prompt_idx == 8: p_meta = {'pinned': True}
            elif prompt_idx == 11: p_meta = {'collapsed': True, 'i_collapsed': 1, 'o_collapsed': 1}

            if prompt_idx % 3 == 1:
                # Short output
                p_txt = f"Quick check #{prompt_idx}: summarize section {s_idx} status in two lines."
                r_md = f"Section {s_idx} completed cleanly with `{tbl_rows}` table rows and zero idle layout churn.\n\nNo regressions detected in inline editing."
            elif prompt_idx % 3 == 2:
                # Medium output
                p_txt = f"Analyze the trade-offs in section {s_idx} and suggest one concrete optimization."
                r_md = (
                    f"### Findings for Section {s_idx}\n\n"
                    f"Measuring renderer RSS alongside V8 heap isolates font and DOM costs from JavaScript allocations:\n\n"
                    f"- **Observer scope:** Guarding unchanged attribute writes prevents `MutationObserver` feedback loops.\n"
                    f"- **Table wrappers:** Wrapping wide `{tbl_cols}`-column tables avoids horizontal page overflow.\n"
                    f"- **Code snippet:**\n"
                    f"  ```python\n"
                    f"  def ratio(after_mb, before_mb):\n"
                    f"      return round((1 - after_mb / before_mb) * 100, 1)\n"
                    f"  print(ratio(279.2, 472.0))\n"
                    f"  ```\n"
                )
            else:
                # Long multi-section output with embedded table + multiple code blocks
                p_txt = f"Give a detailed performance breakdown for section {s_idx} including a comparison table and verification steps."
                r_md = (
                    f"### Detailed Performance Breakdown (Prompt #{prompt_idx})\n\n"
                    f"When a Solveit dialog grows past 80 cells with mixed tables and collapsed states, three subsystems dominate browser cost: "
                    f"initial webfont decoding, Blink layout trees for wide tables, and script initialization.\n\n"
                    + _md_table(8, 6, 50 + prompt_idx) + "\n\n"
                    f"#### Recommended Verification\n\n"
                    f"1. Load `performance_fixture` in vanilla Solveit and record renderer RSS after 15 seconds idle.\n"
                    f"2. Load with CRAFT enabled and confirm idle layouts stay at `0`.\n"
                    f"3. Load with the MV3 Monaco blocker and verify `monacoEditors === 0` and zero console errors.\n\n"
                    f"```js\n"
                    f"const stats = {{\n"
                    f"  cells: document.querySelectorAll('#dialog-container > .editable').length,\n"
                    f"  tables: document.querySelectorAll('#dialog-container table').length,\n"
                    f"  fullEditor: Boolean(document.getElementById('full_editor')),\n"
                    f"}};\n"
                    f"console.table(stats);\n"
                    f"```\n\n"
                    f"All checks above are non-destructive and safe to run on live dialogs."
                )
            cells.append(_prompt(f'prompt-{prompt_idx:02d}', p_txt, r_md, **p_meta))

    # Closing raw + summary note
    cells.append(_raw('raw-1', "[benchmark]\nname = \"performance_fixture\"\nexpected_runtime_s = 60\n"))
    cells.append(_note(
        'footer-note',
        "## Benchmark Summary\n\n"
        "Use `craft-cdp` or Chrome Task Manager to compare this dialog between vanilla Solveit, deployed CRAFT, and CRAFT + the `chrome-ext/` Monaco blocker.",
    ))

    nb = new_nb(cells=cells, meta={'solveit': {'mode': 'learning', 'use_tools': True}})
    validate_nb(nb)
    write_nb(nb, out_path)
    return {
        'path': str(out_path),
        'total_cells': len(cells),
        'code_cells': sum(1 for c in cells if c.cell_type == 'code' and not c.metadata.get('solveit_ai')),
        'prompt_cells': sum(1 for c in cells if c.metadata.get('solveit_ai')),
        'markdown_cells': sum(1 for c in cells if c.cell_type == 'markdown'),
        'raw_cells': sum(1 for c in cells if c.cell_type == 'raw'),
        'md_tables': md_tbl_idx,
        'html_tables': html_tbl_idx,
        'size_kb': round(out_path.stat().st_size / 1024, 1),
    }


if __name__ == '__main__':
    out = Path(__file__).resolve().parent / 'performance_fixture.ipynb'
    print(json.dumps(build_performance_fixture(out), indent=2))
