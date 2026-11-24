"""End-to-end cross-module workflow tests for craft_support.

Per-module unit checks live as inline lessons in `support/nbs/00..07`.
This file focuses on full multi-slice integration flows across FastHTML
ingestion, `fast5ever` sanitization, `LocalTicketStore`, `ReviewOrchestrator`,
`MemoryReviewAppProvisioner`, and the Textual `TriageApp`.
"""

from __future__ import annotations

import base64
import io
import subprocess
import zipfile
from pathlib import Path

import httpx
import pytest

from craft_support.drive import LocalTicketStore
from craft_support.orchestrator import FastGitAdapter, GhAdapter, PullRequestInfo, ReviewOrchestrator
from craft_support.server import create_app
from craft_support.solveit_cdp import MemoryReviewAppProvisioner, build_review_bundle_zip
from craft_support.tui import TriageApp

SAMPLE_RAW_HTML = """<!doctype html>
<html>
  <head>
    <title>Solveit Dialog</title>
    <script>window.__secret = "evil"; alert(1);</script>
    <meta name="csrf-token" content="supersecretcsrf123">
  </head>
  <body>
    <div id="dialog-container" onclick="steal()" data-auth-token="tok_xyz999">
      <p>Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123456</p>
      <input type="password" name="pw" value="hunter2">
      <p>Cell editor bug</p>
    </div>
  </body>
</html>"""


class FakeGhAdapter(GhAdapter):
    """In-memory GitHub PR double mirroring GhApiAdapter semantics."""

    def __init__(self) -> None:
        self.prs: dict[int, PullRequestInfo] = {}
        self.comments: dict[int, list[str]] = {}
        self._next_num = 100
        self.create_calls = 0

    async def find_open_pr(self, *, head_branch: str) -> PullRequestInfo | None:
        for pr in self.prs.values():
            if pr.branch == head_branch and pr.state == "open":
                return pr
        return None

    async def create_pr(self, *, title: str, body: str, head: str, base: str) -> PullRequestInfo:
        self.create_calls += 1
        self._next_num += 1
        pr = PullRequestInfo(
            number=self._next_num,
            url=f"https://github.com/abiancar/solve-it-crafts/pull/{self._next_num}",
            branch=head,
            base_branch=base,
            state="open",
        )
        self.prs[pr.number] = pr
        self.comments[pr.number] = [body]
        return pr

    async def comment_pr(self, pr_number: int, body: str) -> None:
        self.comments.setdefault(pr_number, []).append(body)

    async def merge_pr(self, pr_number: int, *, merge_method: str = "squash") -> PullRequestInfo:
        pr = self.prs[pr_number]
        pr.state = "closed"
        pr.merged = True
        return pr

    async def close_pr(self, pr_number: int) -> PullRequestInfo:
        pr = self.prs[pr_number]
        pr.state = "closed"
        pr.merged = False
        return pr


def _init_temp_git_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-b", "main"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "Test User"], cwd=repo, check=True)
    (repo / "README.md").write_text("# test\n", encoding="utf-8")
    subprocess.run(["git", "add", "README.md"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "initial"], cwd=repo, check=True, capture_output=True)
    return repo


@pytest.mark.asyncio
async def test_end_to_end_ingest_assign_stack_and_cleanup(tmp_path: Path) -> None:
    repo = _init_temp_git_repo(tmp_path)
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "CRAFT.js").write_text("// craft\n", encoding="utf-8")
    (dist / "CRAFT.css").write_text("/* craft */\n", encoding="utf-8")

    store = LocalTicketStore(tmp_path / "tickets")
    app = create_app(store)
    png_bytes = b"\x89PNG\r\n\x1a\nfake-png-bytes"
    data_url = "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        r1 = await client.post("/api/tickets", json={
            "title": "Fix focus ring", "description": "Ring offset off by 2px",
            "url": "https://solve.it.com/dialog/42", "viewport": {"width": 1280, "height": 720},
            "dom_html": SAMPLE_RAW_HTML, "screenshot_data_url": data_url,
        })
        assert r1.status_code == 201
        tid1 = r1.json()["id"]

        r2 = await client.post("/api/tickets/form", data={"title": "Fix code wrap", "description": "Long lines overflow"})
        assert r2.status_code == 201
        tid2 = r2.json()["id"]

    dom = await store.get_dom(tid1)
    assert "<script" not in dom.lower() and "hunter2" not in dom and "Cell editor bug" in dom
    assert await store.get_screenshot(tid1) == png_bytes

    git = FastGitAdapter(repo, push_enabled=False)
    gh = FakeGhAdapter()
    prov = MemoryReviewAppProvisioner()
    orch = ReviewOrchestrator(store=store, git=git, gh=gh, provisioner=prov, assets_dir=dist)

    res1 = await orch.assign_tickets([tid1, tid2])
    assert not res1.reused
    assert await git.branch_exists(res1.branch)
    assert res1.pr.number == 101
    assert res1.review_app.review_app_id in prov.instances

    zbytes, _ = build_review_bundle_zip(res1.manifest, assets_dir=dist)
    with zipfile.ZipFile(io.BytesIO(zbytes)) as zf:
        assert {"review_manifest.json", "inspect_tickets.py", "review_tickets.ipynb", "CRAFT.js", "CRAFT.css"}.issubset(zf.namelist())

    # Idempotent retry reuses branch, PR, and review app
    res_retry = await orch.assign_tickets([tid1, tid2])
    assert res_retry.reused and res_retry.pr.number == res1.pr.number and gh.create_calls == 1 and prov.provision_calls == 1

    # Stack a dependent ticket onto res1.branch
    t3, _ = await store.create_ticket(title="Stacked theme tweak", description="Depends on focus ring fix")
    res_stack = await orch.assign_tickets([t3.id], base_branch=res1.branch)
    assert res_stack.base_branch == res1.branch and res_stack.pr.base_branch == res1.branch

    # Merge & cleanup group 1; close & cleanup stacked PR
    merged = await orch.complete_review([tid1, tid2], action="merge")
    assert merged["status"] == "merged" and res1.review_app.review_app_id not in prov.instances
    assert not await git.branch_exists(res1.branch)
    assert (await store.get_ticket(tid1)).status == "merged" and (await store.get_ticket(tid2)).status == "merged"

    closed = await orch.complete_review([t3.id], action="close")
    assert closed["status"] == "closed" and res_stack.review_app.review_app_id not in prov.instances
    assert (await store.get_ticket(t3.id)).status == "closed"


@pytest.mark.asyncio
async def test_end_to_end_textual_tui_workflow(tmp_path: Path) -> None:
    repo = _init_temp_git_repo(tmp_path)
    store = LocalTicketStore(tmp_path / "tickets")
    git = FastGitAdapter(repo, push_enabled=False)
    gh = FakeGhAdapter()
    prov = MemoryReviewAppProvisioner()
    orch = ReviewOrchestrator(store=store, git=git, gh=gh, provisioner=prov)

    t1, _ = await store.create_ticket(title="TUI test ticket 1", description="First bug")
    t2, _ = await store.create_ticket(title="TUI test ticket 2", description="Second bug")

    app = TriageApp(store=store, orchestrator=orch)
    async with app.run_test() as pilot:
        await pilot.pause()
        assert len(app.tickets) == 2

        await pilot.press("a")
        assert app.selected_ids == {t1.id, t2.id}

        await pilot.press("n")
        await pilot.pause()
        await pilot.press(*list("Grouped for sprint"), "enter")
        await pilot.pause()
        assert (await store.get_ticket(t1.id)).status == "triaged"
        assert (await store.get_ticket(t2.id)).triage_notes[0].text == "Grouped for sprint"

        await pilot.press("a")
        await pilot.press("g")
        await pilot.pause()
        await pilot.click("#confirm")
        await pilot.pause()
        t1_after, t2_after = await store.get_ticket(t1.id), await store.get_ticket(t2.id)
        assert t1_after.status == "in_review" and t1_after.pr_number == t2_after.pr_number
        assert t1_after.review_app_id in prov.instances

        await pilot.press("a")
        await pilot.press("m")
        await pilot.pause()
        assert (await store.get_ticket(t1.id)).status == "merged"
        assert t1_after.review_app_id not in prov.instances
