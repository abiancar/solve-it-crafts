from __future__ import annotations
import json, mimetypes, re, time
from urllib.parse import urljoin, urlparse
import httpx
from bs4 import BeautifulSoup

DASHBOARD_URL = 'https://solve.it.com/dashboard'
CRAFT_ASSET_FILES = (
    'CRAFT.css',
    'CRAFT.js',
    'craft_md.js',
    'hotkey_manager.js',
    'hotkey_builtins.js',
    'craft_fonts.js',
    'craft_history.js',
    'craft_tts.js',
    'craft_bug_capture.js',
)


def slugify_branch(tid: int, title: str) -> str:
    "Build a git-safe branch name `ticket-<id>-<slug>` from a ticket id and title."
    slug = re.sub(r'[^a-z0-9]+', '-', (title or '').lower()).strip('-')[:36].strip('-')
    return f'ticket-{tid}-{slug}' if slug else f'ticket-{tid}'


def parse_cookie_header(raw: str) -> str:
    "Accept a Cookie header string or a JSON cookie list (from .auth/solveit-state.json) and return a Cookie header."
    s = (raw or '').strip()
    if not s: return ''
    if s.startswith(('[', '{')):
        data = json.loads(s)
        items = data.get('cookies', []) if isinstance(data, dict) else data
        dicts = [c for c in items if isinstance(c, dict) and c.get('name')]
        scoped = [c for c in dicts if 'solve.it.com' in (c.get('domain') or '').lower()]
        chosen = scoped or dicts
        return '; '.join(f"{c['name']}={c['value']}" for c in chosen)
    return s


class SolveitClient:
    "Pure-HTTP client for Solveit dashboard instance management, file uploads, and dialog cell execution."
    def __init__(self, cookie_raw: str, timeout: float = 45.0):
        self.cookie_header = parse_cookie_header(cookie_raw)
        if not self.cookie_header: raise ValueError('Solveit session cookie is not configured in Settings.')
        self.timeout = timeout

    def _client(self, follow_redirects: bool = True) -> httpx.Client:
        return httpx.Client(
            headers={'Cookie': self.cookie_header, 'User-Agent': 'craft-plash-ops/1.0'},
            timeout=self.timeout,
            follow_redirects=follow_redirects,
        )

    def list_instances(self) -> list[dict]:
        with self._client() as c:
            r = c.get(DASHBOARD_URL)
            if '/login' in str(r.url) or r.status_code in (401, 403):
                raise RuntimeError('Solveit session cookie expired; paste a fresh cookie in Settings.')
            r.raise_for_status()
            soup = BeautifulSoup(r.text, 'html.parser')
            out = []
            for el in soup.select('[id^="instance-"]'):
                inst_id = el['id'].removeprefix('instance-')
                if not inst_id.isdigit(): continue
                strong = el.select_one('strong')
                lines = [ln.strip() for ln in el.get_text('\n').splitlines() if ln.strip()]
                name = strong.get_text(strip=True) if strong else (lines[0] if lines else '')
                open_link = el.select_one('a[href*="get_app"]')
                power_btn = el.select_one('[hx-post^="/power"]')
                out.append(dict(
                    inst_id=inst_id,
                    name=name,
                    running=bool(open_link),
                    open_href=open_link.get('href') if open_link else None,
                    power_post=power_btn.get('hx-post') if power_btn else None,
                ))
            return out

    def find_instance(self, name_or_id: str) -> dict | None:
        key = str(name_or_id).strip()
        for inst in self.list_instances():
            if inst['name'] == key or str(inst['inst_id']) == key: return inst
        return None

    def power_instance(self, power_post: str) -> int:
        with self._client() as c:
            r = c.post(urljoin(DASHBOARD_URL, power_post))
            r.raise_for_status()
            return r.status_code

    def get_instance_origin(self, open_href: str) -> str:
        with self._client(follow_redirects=False) as c:
            r = c.get(urljoin(DASHBOARD_URL, open_href))
            if 300 <= r.status_code < 400 and r.headers.get('location'):
                target = urljoin(DASHBOARD_URL, r.headers['location'])
            else:
                r.raise_for_status()
                target = str(r.url)
            u = urlparse(target)
            return f'{u.scheme}://{u.netloc}'

    def ensure_running(self, name: str, create_if_missing: bool = False, wait_s: float = 180.0) -> dict:
        card = self.find_instance(name)
        if card is None:
            if not create_if_missing: raise RuntimeError(f'Solveit instance {name!r} not found.')
            with self._client() as c:
                r = c.post(urljoin(DASHBOARD_URL, '/create_instance'), data={'instance_name': name})
                if r.status_code >= 400: raise RuntimeError(f'create_instance failed: HTTP {r.status_code}')
        deadline, powered = time.monotonic() + wait_s, False
        while time.monotonic() < deadline:
            card = self.find_instance(name)
            if card and card['running'] and card['open_href']:
                origin = self.get_instance_origin(card['open_href'])
                return dict(inst_id=card['inst_id'], name=card['name'], origin=origin)
            if card and not powered and 'on=1' in (card.get('power_post') or ''):
                self.power_instance(card['power_post'])
                powered = True
            time.sleep(3.0)
        raise TimeoutError(f'Timed out waiting for Solveit instance {name!r} to start.')

    def delete_instance(self, inst_id: str, name: str = '') -> bool:
        card = self.find_instance(inst_id) or (self.find_instance(name) if name else None)
        if card is None: return True
        if card['running'] and 'on=0' in (card.get('power_post') or ''):
            self.power_instance(card['power_post'])
            time.sleep(2.0)
        with self._client() as c:
            r = c.post(
                urljoin(DASHBOARD_URL, f"/delete_instance?inst_id={card['inst_id']}"),
                data={'name': card['name']},
            )
            if r.status_code >= 400: raise RuntimeError(f'delete_instance failed: HTTP {r.status_code}')
        time.sleep(1.5)
        return self.find_instance(card['inst_id']) is None

    def _req_retry(self, c: httpx.Client, method: str, url: str, attempts: int = 3, delay: float = 2.0, **kwargs):
        for i in range(attempts):
            r = c.request(method, url, **kwargs)
            if r.status_code not in (502, 503, 504) or i == attempts - 1: return r
            time.sleep(delay)
        return r

    def upload_files(self, origin: str, files: dict[str, bytes]) -> list[str]:
        uploaded = []
        base = origin.rstrip('/')
        with self._client() as c:
            for fname, content in files.items():
                if '/' in fname: folder, leaf = fname.rsplit('/', 1)
                elif fname in ('CRAFT.css', 'CRAFT.js') or fname.endswith('.ipynb'): folder, leaf = '.', fname
                else: folder, leaf = '.craft-assets', fname
                rel = f'{folder}/{leaf}' if folder != '.' else leaf
                self._req_retry(c, 'POST', f'{base}/delete_file_', params={'filename': rel})
                ctype = mimetypes.guess_type(leaf)[0] or 'application/octet-stream'
                r = self._req_retry(c, 'POST', f'{base}/upload_file_', params={'folder': folder}, files={'files': (leaf, content, ctype)})
                r.raise_for_status()
                uploaded.append(rel)
        return uploaded

    def run_dialog_cell(self, origin: str, dialog_name: str, cell_id: str) -> str:
        "Connect to `dialog_name` on a running Solveit instance and queue `cell_id` for execution."
        base = origin.rstrip('/')
        with self._client() as c:
            r = self._req_retry(c, 'GET', f'{base}/connect_', params={'name': dialog_name})
            r.raise_for_status()
            m = re.search(r'kid=([A-Za-z0-9_-]+)', r.text)
            if not m: raise RuntimeError(f'Could not obtain Solveit kernel id for {dialog_name!r}.')
            kid = m.group(1)
            cid = cell_id if cell_id.startswith('_') else f'_{cell_id}'
            r2 = self._req_retry(c, 'POST', f'{base}/add_runq_', data={'kid': kid, 'id_': cid, 'ids': cid, 'cmd': 'run'})
            r2.raise_for_status()
            return kid


def create_github_branch(repo: str, gh_token: str, branch: str, base: str = 'main') -> str:
    "Create `branch` from `base` on GitHub (idempotent if it already exists) and return the branch URL."
    repo = (repo or '').strip().strip('/')
    gh_token = (gh_token or '').strip()
    if not repo or '/' not in repo: raise ValueError('Set github_repo (owner/repo) in Settings first.')
    if not gh_token: raise ValueError('Set github_token in Settings first.')
    hdrs = {
        'Authorization': f'Bearer {gh_token}',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'craft-plash-ops/1.0',
    }
    with httpx.Client(headers=hdrs, timeout=30.0) as c:
        r_ref = c.get(f'https://api.github.com/repos/{repo}/git/ref/heads/{base}')
        if r_ref.status_code >= 400:
            raise RuntimeError(f'Could not read base branch {base!r}: HTTP {r_ref.status_code} {r_ref.text[:200]}')
        sha = r_ref.json()['object']['sha']
        r_mk = c.post(
            f'https://api.github.com/repos/{repo}/git/refs',
            json={'ref': f'refs/heads/{branch}', 'sha': sha},
        )
        if r_mk.status_code not in (200, 201):
            if r_mk.status_code == 422 and 'already exists' in r_mk.text.lower():
                pass
            else:
                raise RuntimeError(f'Could not create branch {branch!r}: HTTP {r_mk.status_code} {r_mk.text[:200]}')
    return f'https://github.com/{repo}/tree/{branch}'


def fetch_github_craft_assets(repo: str, branch: str = 'main', token: str = '') -> dict[str, bytes]:
    "Download shipped CRAFT asset files from a GitHub repo branch."
    repo = (repo or '').strip().strip('/')
    if not repo or '/' not in repo: raise ValueError('Set github_repo (owner/repo) in Settings first.')
    branch = (branch or 'main').strip()
    hdrs = {'User-Agent': 'craft-plash-ops/1.0'}
    if token:
        hdrs['Authorization'] = f'Bearer {token.strip()}'
        hdrs['Accept'] = 'application/vnd.github.raw+json'
    assets = {}
    with httpx.Client(headers=hdrs, timeout=30.0, follow_redirects=True) as c:
        for fname in CRAFT_ASSET_FILES:
            url = (
                f'https://api.github.com/repos/{repo}/contents/{fname}?ref={branch}'
                if token else
                f'https://raw.githubusercontent.com/{repo}/{branch}/{fname}'
            )
            r = c.get(url)
            if r.status_code == 404: continue
            r.raise_for_status()
            assets[fname] = r.content
    if not assets: raise RuntimeError(f'No CRAFT asset files found on {repo}@{branch}.')
    return assets


def deploy_branch_to_instance(
    cookie_raw: str,
    repo: str,
    branch: str,
    instance_name: str,
    gh_token: str = '',
    create_if_missing: bool = False,
) -> dict:
    "Ensure a Solveit instance is running, fetch CRAFT assets from GitHub, and upload them."
    client = SolveitClient(cookie_raw)
    info = client.ensure_running(instance_name, create_if_missing=create_if_missing)
    assets = fetch_github_craft_assets(repo, branch=branch or 'main', token=gh_token)
    uploaded = client.upload_files(info['origin'], assets)
    return dict(**info, uploaded=uploaded, branch=branch or 'main')


def build_ticket_notebook(
    ticket_id: int,
    title: str,
    body: str,
    repo: str,
    branch: str,
    callback_url: str,
    callback_token: str,
) -> bytes:
    "Build a Solveit dev/test notebook whose `setup001` cell clones `branch`, builds CRAFT, runs `nbdev-test`, and posts results back."
    repo_url = f'https://github.com/{repo}.git'
    branch_url = f'https://github.com/{repo}/tree/{branch}'
    md_src = (
        f'# Ticket #{ticket_id}: {title}\n\n'
        f'- **Branch:** [`{branch}`]({branch_url})\n'
        f'- **Repo:** `{repo}`\n\n'
        f'{body or "(no description)"}\n\n'
        'Cell `setup001` below runs automatically when this instance boots: it clones the branch, '
        'builds CRAFT assets into this instance, runs `nbdev-test`, and posts the result back to CRAFT Ops.'
    )
    setup_src = f"""import json, os, shutil, subprocess, urllib.request
from pathlib import Path

REPO_URL = {repo_url!r}
BRANCH = {branch!r}
CALLBACK_URL = {callback_url!r}
CALLBACK_TOKEN = {callback_token!r}
ROOT = Path.cwd()
REPO_DIR = ROOT / 'solve-it-crafts'

def post_result(status, summary, test_output=''):
    payload = json.dumps({{
        'token': CALLBACK_TOKEN,
        'status': status,
        'summary': summary,
        'test_output': test_output[-4000:],
    }}).encode('utf-8')
    req = urllib.request.Request(
        CALLBACK_URL, data=payload,
        headers={{'Content-Type': 'application/json', 'User-Agent': 'craft-solveit-runner/1.0'}},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status

def run_cmd(cmd, cwd=None, env=None):
    p = subprocess.run(cmd, cwd=cwd, env=env, text=True, capture_output=True)
    out = (p.stdout or '') + (('\\n' + p.stderr) if p.stderr else '')
    return p.returncode, out.strip()

logs = []
try:
    env = os.environ.copy()
    env['NO_COLOR'] = '1'
    local_bin = str(Path.home() / '.local' / 'bin')
    if local_bin not in env.get('PATH', ''): env['PATH'] = local_bin + ':' + env.get('PATH', '')

    if not (REPO_DIR / '.git').exists():
        rc, out = run_cmd(['git', 'clone', REPO_URL, str(REPO_DIR)], env=env)
        logs.append(f'$ git clone -> rc={{rc}}\\n{{out}}')
        if rc != 0: raise RuntimeError(f'git clone failed (rc={{rc}})')

    rc, out = run_cmd(['git', 'fetch', 'origin'], cwd=REPO_DIR, env=env)
    logs.append(f'$ git fetch origin -> rc={{rc}}\\n{{out}}')
    rc, out = run_cmd(['git', 'checkout', '-B', BRANCH, f'origin/{{BRANCH}}'], cwd=REPO_DIR, env=env)
    if rc != 0:
        rc, out = run_cmd(['git', 'checkout', '-B', BRANCH, 'origin/main'], cwd=REPO_DIR, env=env)
    logs.append(f'$ git checkout {{BRANCH}} -> rc={{rc}}\\n{{out}}')
    if rc != 0: raise RuntimeError(f'git checkout failed (rc={{rc}})')

    if not shutil.which('uv', path=env['PATH']):
        rc, out = run_cmd(['bash', '-lc', 'curl -LsSf https://astral.sh/uv/install.sh | sh'], env=env)
        logs.append(f'$ install uv -> rc={{rc}}\\n{{out}}')
        if rc != 0: raise RuntimeError(f'uv install failed (rc={{rc}})')

    rc, out = run_cmd(['uv', 'sync'], cwd=REPO_DIR, env=env)
    logs.append(f'$ uv sync -> rc={{rc}}\\n{{out}}')
    if rc != 0: raise RuntimeError(f'uv sync failed (rc={{rc}})')

    build_cmd = ['uv', 'run', 'craft-cdp', 'build']
    if not shutil.which('node', path=env['PATH']): build_cmd.append('--no-check')
    rc, out = run_cmd(build_cmd, cwd=REPO_DIR, env=env)
    logs.append(f'$ {{" ".join(build_cmd)}} -> rc={{rc}}\\n{{out}}')
    if rc != 0: raise RuntimeError(f'craft-cdp build failed (rc={{rc}})')

    dist_dir = REPO_DIR / 'dist'
    assets_dir = ROOT / '.craft-assets'
    assets_dir.mkdir(exist_ok=True)
    for f in dist_dir.iterdir():
        if not f.is_file(): continue
        dst = (ROOT / f.name) if f.name in ('CRAFT.css', 'CRAFT.js') else (assets_dir / f.name)
        shutil.copy2(f, dst)

    rc, out = run_cmd(['uv', 'run', 'nbdev-test'], cwd=REPO_DIR, env=env)
    logs.append(f'$ uv run nbdev-test -> rc={{rc}}\\n{{out}}')
    full_log = '\\n\\n'.join(logs)
    if rc == 0:
        summary = f'Build + nbdev-test passed on {{BRANCH}}. Reload this Solveit tab to use freshly built CRAFT assets.'
    else:
        summary = f'Build succeeded, but nbdev-test failed (rc={{rc}}) on {{BRANCH}}.'
    post_result('needs_approval', summary, full_log)
    print(summary)
except Exception as e:
    full_log = '\\n\\n'.join(logs) + f'\\n\\nERROR: {{e}}'
    try: post_result('needs_approval', f'Setup/test failed on {{BRANCH}}: {{e}}', full_log)
    except Exception as cb_err: print('Callback failed:', cb_err)
    raise
"""
    manual_src = (
        f"%%bash\n"
        f"cd solve-it-crafts\n"
        f"uv run craft-cdp build --sync\n"
        f"cp dist/CRAFT.css dist/CRAFT.js ..\n"
        f"mkdir -p ../.craft-assets && cp dist/*.js ../.craft-assets/ && rm -f ../.craft-assets/CRAFT.js\n"
        f"uv run nbdev-test\n"
        f"git status -s\n"
    )

    def _lines(s: str) -> list[str]:
        return [ln + '\n' for ln in s.splitlines()]

    nb = {
        'nbformat': 4,
        'nbformat_minor': 5,
        'metadata': {'kernelspec': {'display_name': 'Python 3', 'language': 'python', 'name': 'python3'}},
        'cells': [
            {'id': 'info0001', 'cell_type': 'markdown', 'metadata': {}, 'source': _lines(md_src)},
            {'id': 'setup001', 'cell_type': 'code', 'metadata': {}, 'outputs': [], 'execution_count': None, 'source': _lines(setup_src)},
            {'id': 'manual01', 'cell_type': 'code', 'metadata': {}, 'outputs': [], 'execution_count': None, 'source': _lines(manual_src)},
        ],
    }
    return json.dumps(nb, indent=1).encode('utf-8')
