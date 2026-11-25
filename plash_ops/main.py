from datetime import datetime, timezone
import json, os, secrets, threading
from pathlib import Path
from dotenv import load_dotenv
load_dotenv('plash.env')
from fasthtml.common import *
from fastlite import database
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

try:
    from solveit_ops import (
        SolveitClient, build_ticket_notebook, create_github_branch,
        deploy_branch_to_instance, slugify_branch,
    )
except ImportError:
    from plash_ops.solveit_ops import (
        SolveitClient, build_ticket_notebook, create_github_branch,
        deploy_branch_to_instance, slugify_branch,
    )

STATUSES = ('queued', 'in_progress', 'needs_approval', 'approved', 'deployed', 'rejected')
KINDS = ('bug', 'feature', 'task')
SOLVEIT_ORIGIN_RE = r'^https://([a-z0-9-]+\.)?solve\.it\.com$'
DEFAULT_GITHUB_REPO = 'abiancar/solve-it-crafts'

DATA_DIR = Path(os.environ.get('OPS_DATA_DIR', 'data'))
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _now(): return datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')


def _ops_token(): return os.environ.get('OPS_TOKEN', '').strip()


def _is_authed(req, sess):
    tok = _ops_token()
    if not tok: return False
    if sess.get('authed') is True: return True
    auth = req.headers.get('authorization', '')
    hdr = auth[7:].strip() if auth.lower().startswith('bearer ') else req.headers.get('x-ops-token', '').strip()
    return bool(hdr) and secrets.compare_digest(hdr, tok)


def auth_before(req, sess):
    if req.method == 'OPTIONS' or _is_authed(req, sess): return
    if req.url.path.startswith('/api/'): return JSONResponse({'error': 'unauthorized'}, status_code=401)
    return RedirectResponse('/login', status_code=303)


bware = Beforeware(auth_before, skip=[r'/login.*', r'/health', r'/favicon\.ico', r'/api/tickets/\d+/callback'])

CSS = Style("""
:root { --bg:#1a1b26; --card:#24283b; --line:#3b4261; --fg:#c0caf5; --muted:#7982a9;
        --blue:#7aa2f7; --green:#9ece6a; --amber:#e0af68; --red:#f7768e; --purple:#bb9af7; }
body { background:var(--bg); color:var(--fg); max-width:780px; margin:0 auto; padding:12px 14px 48px; font-family:system-ui,-apple-system,sans-serif; }
header { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:14px; border-bottom:1px solid var(--line); padding-bottom:10px; }
header nav { display:flex; gap:12px; font-size:.92rem; }
a { color:var(--blue); text-decoration:none; }
.card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin-bottom:12px; }
.row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.pills { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0 14px; }
.pill { padding:4px 10px; border-radius:999px; border:1px solid var(--line); font-size:.82rem; color:var(--fg); }
.pill.on { background:var(--blue); color:#1a1b26; border-color:var(--blue); font-weight:600; }
.badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:.75rem; font-weight:600; text-transform:uppercase; }
.st-queued { background:#3b4261; color:var(--fg); }
.st-in_progress { background:#2e3c64; color:var(--blue); }
.st-needs_approval { background:#4b3d24; color:var(--amber); }
.st-approved { background:#294132; color:var(--green); }
.st-deployed { background:#362d4f; color:var(--purple); }
.st-rejected { background:#4d2531; color:var(--red); }
.muted { color:var(--muted); font-size:.82rem; }
.err { color:var(--red); font-size:.85rem; margin-top:6px; }
.ok { color:var(--green); font-size:.85rem; margin-top:6px; }
input, textarea, select { width:100%; box-sizing:border-box; background:#16161e; color:var(--fg); border:1px solid var(--line); border-radius:8px; padding:8px 10px; margin:4px 0 10px; font:inherit; }
button, .btn { display:inline-block; background:#2f3549; color:var(--fg); border:1px solid var(--line); border-radius:8px; padding:6px 11px; font-size:.84rem; cursor:pointer; }
.btn-ok { background:#26422c; border-color:var(--green); color:var(--green); }
.btn-bad { background:#49242f; border-color:var(--red); color:var(--red); }
.btn-pri { background:#29395b; border-color:var(--blue); color:var(--blue); }
pre { background:#16161e; padding:8px; border-radius:8px; overflow-x:auto; font-size:.78rem; white-space:pre-wrap; }
""")

cors = Middleware(
    CORSMiddleware,
    allow_origin_regex=SOLVEIT_ORIGIN_RE,
    allow_methods=['GET', 'POST', 'OPTIONS'],
    allow_headers=['Authorization', 'Content-Type', 'X-Ops-Token'],
)

app, rt = fast_app(
    pico=False,
    before=bware,
    middleware=(cors,),
    hdrs=(Meta(name='viewport', content='width=device-width, initial-scale=1'), CSS),
    title='CRAFT Ops',
)

db = database(DATA_DIR / 'ops.db')
tickets = db.t.tickets
settings_tbl = db.t.settings

if tickets not in db.t:
    tickets.create(
        id=int, title=str, body=str, kind=str, status=str,
        dialog_name=str, cell_id=str, console_errors=str, page_url=str, screenshot_data_url=str, branch=str,
        review_url=str, review_inst_id=str, review_inst_name=str,
        pr_url=str, summary=str, callback_token=str, test_output=str,
        created_at=str, updated_at=str, pk='id',
    )
else:
    existing_cols = {c.name for c in tickets.columns}
    for col in ('callback_token', 'test_output'):
        if col not in existing_cols:
            db.execute(f"ALTER TABLE tickets ADD COLUMN {col} TEXT DEFAULT ''")

if settings_tbl not in db.t:
    settings_tbl.create(key=str, value=str, pk='key')

Ticket = tickets.dataclass()


def get_setting(key: str, default: str = '') -> str:
    try: val = settings_tbl[key]['value']
    except Exception: val = ''
    return val or os.environ.get(key.upper(), default) or default


def set_setting(key: str, value: str):
    settings_tbl.upsert({'key': key, 'value': (value or '').strip()}, pk='key')


for _k, _d in (('prod_instance', ''), ('github_repo', DEFAULT_GITHUB_REPO), ('github_token', ''), ('solveit_cookie', '')):
    try: settings_tbl[_k]
    except Exception: set_setting(_k, os.environ.get(_k.upper(), _d))


def _ticket_dict(t):
    d = dict(t.__dict__ if hasattr(t, '__dict__') else t)
    d.pop('callback_token', None)
    return d


def _public_base_url(req) -> str:
    base = str(req.base_url).rstrip('/')
    proto = (req.headers.get('x-forwarded-proto') or '').split(',')[0].strip().lower()
    if (proto == 'https' or '.pla.sh' in base) and base.startswith('http://'):
        base = 'https://' + base[7:]
    return base


def _provision_ticket_worker(tid: int, branch: str, rev_name: str, callback_url: str, cb_tok: str):
    t = tickets[tid]
    repo = get_setting('github_repo', DEFAULT_GITHUB_REPO)
    gh_token = get_setting('github_token')
    cookie = get_setting('solveit_cookie')
    try:
        if repo and gh_token:
            create_github_branch(repo, gh_token, branch)
            tickets.update({'id': tid, 'summary': f'Branch {branch} ready; starting {rev_name}...', 'updated_at': _now()})
        else:
            tickets.update({'id': tid, 'summary': f'Starting {rev_name} (set github_token in Settings to auto-create branch {branch})...', 'updated_at': _now()})

        client = SolveitClient(cookie)
        info = client.ensure_running(rev_name, create_if_missing=True)
        origin = info['origin']
        tickets.update({
            'id': tid, 'review_url': origin, 'review_inst_id': str(info['inst_id']),
            'review_inst_name': info['name'],
            'summary': f'Instance {rev_name} running; uploading dev notebook and running build + nbdev-test...',
            'updated_at': _now(),
        })

        dlg_fname = f'ticket_{tid}_dev.ipynb'
        nb_bytes = build_ticket_notebook(
            ticket_id=tid, title=t.title, body=t.body or '', repo=repo,
            branch=branch, callback_url=callback_url, callback_token=cb_tok,
        )
        client.upload_files(origin, {dlg_fname: nb_bytes})
        client.run_dialog_cell(origin, dlg_fname, 'setup001')
        tickets.update({
            'id': tid,
            'summary': f'Running craft-cdp build and nbdev-test inside {rev_name}...',
            'updated_at': _now(),
        })
    except Exception as e:
        tickets.update({
            'id': tid, 'status': 'approved',
            'summary': f'Provisioning error: {e}',
            'updated_at': _now(),
        })


def shell(title, *body, nav=True):
    bar = Header(
        Strong('CRAFT Ops'),
        Nav(A('Tickets', href=index), A('Settings', href=settings_page), A('Logout', href=logout)) if nav else '',
    )
    return Title(title), Main(bar, *body)


def ticket_card(t, notice='', is_err=False):
    meta_parts = [f'#{t.id}', t.kind or 'task', t.updated_at or t.created_at]
    if t.dialog_name: meta_parts.append(f'dialog:{t.dialog_name}')
    if t.cell_id: meta_parts.append(f'cell:{t.cell_id}')
    if t.branch: meta_parts.append(f'branch:{t.branch}')
    links = []
    if t.review_url:
        links.append(A('Open Dev Dialog', href=f"{t.review_url.rstrip('/')}/dialog_?name=ticket_{t.id}_dev", target='_blank', cls='btn btn-pri'))
        links.append(A('Review Instance', href=t.review_url, target='_blank', cls='btn'))
    if t.pr_url: links.append(A('GitHub PR', href=t.pr_url, target='_blank', cls='btn'))
    repo = get_setting('github_repo', DEFAULT_GITHUB_REPO)
    if t.branch and repo: links.append(A('GitHub Branch', href=f'https://github.com/{repo}/tree/{t.branch}', target='_blank', cls='btn'))
    prod_name = get_setting('prod_instance', '')
    actions = [
        Button('Provisioning...' if t.status == 'in_progress' else 'Approve', cls='btn-ok', disabled=(t.status == 'in_progress'), hx_post=approve_ticket.to(tid=t.id), hx_target=f'#t-{t.id}', hx_swap='outerHTML'),
        Button('Reject', cls='btn-bad', hx_post=set_status.to(tid=t.id, status='rejected'), hx_target=f'#t-{t.id}', hx_swap='outerHTML'),
        Button('Spin Up Review App', cls='btn-pri', hx_post=spin_review.to(tid=t.id), hx_target=f'#t-{t.id}', hx_swap='outerHTML'),
        Button(f'Deploy -> {prod_name}', cls='btn-ok', hx_post=deploy_prod.to(tid=t.id), hx_target=f'#t-{t.id}', hx_swap='outerHTML'),
    ]
    if t.review_inst_id or t.review_inst_name:
        actions.append(Button('Tear Down Review', cls='btn-bad', hx_post=teardown_review.to(tid=t.id), hx_target=f'#t-{t.id}', hx_swap='outerHTML'))
    poll_attrs = (
        dict(hx_get=ticket_card_route.to(tid=t.id), hx_trigger='every 5s', hx_swap='outerHTML')
        if t.status == 'in_progress' else {}
    )
    return Article(
        Div(Strong(t.title), Span(t.status, cls=f'badge st-{t.status}'), cls='row', style='justify-content:space-between;'),
        P(' · '.join(meta_parts), cls='muted', style='margin:4px 0 8px;'),
        P(t.body, style='white-space:pre-wrap; margin:0 0 8px;') if t.body else '',
        Div(Strong('Status: '), Span(t.summary), style='margin:0 0 8px;') if t.summary else '',
        Details(Summary('Build & nbdev-test output'), Pre(t.test_output)) if getattr(t, 'test_output', '') else '',
        Details(Summary('Console errors'), Pre(t.console_errors)) if t.console_errors else '',
        Details(Summary('Screenshot'), Img(src=t.screenshot_data_url, style='max-width:100%; border-radius:8px; margin-top:6px;')) if getattr(t, 'screenshot_data_url', '') else '',
        Div(*([A('Source Page', href=t.page_url, target='_blank', cls='btn')] if getattr(t, 'page_url', '') else []), *links, cls='row', style='margin:8px 0;') if (links or getattr(t, 'page_url', '')) else '',
        Div(*actions, cls='row', style='margin-top:8px;'),
        P(notice, cls='err' if is_err else 'ok') if notice else '',
        id=f't-{t.id}',
        cls='card',
        **poll_attrs,
    )


@rt('/health')
def health(): return JSONResponse({'ok': True, 'prod_instance': get_setting('prod_instance', '')})


@rt('/login')
def get(msg: str = ''):
    setup_note = P('OPS_TOKEN is not set in plash.env yet.', cls='err') if not _ops_token() else ''
    return shell(
        'CRAFT Ops Login',
        Div(
            H2('Sign in'),
            setup_note,
            P(msg, cls='err') if msg else '',
            Form(
                Label('Ops Token', Input(name='token', type='password', required=True, autofocus=True)),
                Button('Sign in', type='submit', cls='btn-pri'),
                method='post', action='/login',
            ),
            cls='card',
        ),
        nav=False,
    )


@rt('/login')
def post(token: str, sess):
    tok = _ops_token()
    if tok and secrets.compare_digest((token or '').strip(), tok):
        sess['authed'] = True
        return RedirectResponse('/', status_code=303)
    return RedirectResponse('/login?msg=Invalid+token', status_code=303)


@rt
def logout(sess):
    sess.pop('authed', None)
    return RedirectResponse('/login', status_code=303)


@rt('/')
def index(status: str = 'all'):
    rows = tickets(order_by='id desc') if status == 'all' else tickets(where='status = ?', where_args=[status], order_by='id desc')
    pills = [A('All', href=index.to(status='all'), cls='pill on' if status == 'all' else 'pill')]
    pills += [A(s.replace('_', ' ').title(), href=index.to(status=s), cls='pill on' if status == s else 'pill') for s in STATUSES]
    new_form = Details(
        Summary(Strong('+ New Ticket')),
        Form(
            Input(name='title', placeholder='Short title', required=True),
            Textarea(name='body', placeholder='What should be fixed or built?', rows=3),
            Div(
                Select(*[Option(k, value=k) for k in KINDS], name='kind', style='flex:1;'),
                Input(name='branch', placeholder='Git branch (auto-generated on Approve)', style='flex:1;'),
                cls='row',
            ),
            Button('Queue Ticket', type='submit', cls='btn-pri'),
            hx_post=create_ticket_ui, hx_target='#ticket-list', hx_swap='afterbegin',
            hx_on__after_request='this.reset()',
            style='margin-top:8px;',
        ),
        cls='card',
    )
    cards = [ticket_card(t) for t in rows] or [P('No tickets yet.', cls='muted', id='empty-msg')]
    return shell('CRAFT Ops', new_form, Div(*pills, cls='pills'), Div(*cards, id='ticket-list'))


@rt
def create_ticket_ui(title: str, body: str = '', kind: str = 'task', branch: str = ''):
    now = _now()
    t = tickets.insert(Ticket(
        title=title.strip(), body=body.strip(), kind=kind if kind in KINDS else 'task',
        status='queued', dialog_name='', cell_id='', console_errors='', page_url='', screenshot_data_url='',
        branch=branch.strip(), review_url='', review_inst_id='', review_inst_name='',
        pr_url='', summary='', callback_token='', test_output='',
        created_at=now, updated_at=now,
    ))
    return ticket_card(t, notice='Ticket queued.')


@rt('/tickets/{tid}/card')
def ticket_card_route(tid: int):
    return ticket_card(tickets[tid])


@rt('/tickets/{tid}/status/{status}')
def set_status(tid: int, status: str):
    if status not in STATUSES: return P('Invalid status', cls='err')
    patch = {'id': tid, 'status': status, 'updated_at': _now()}
    if status == 'rejected': patch['callback_token'] = ''
    t = tickets.update(patch)
    return ticket_card(t, notice=f'Status updated to {status}.')


@rt('/tickets/{tid}/approve')
def approve_ticket(tid: int, req):
    t = tickets[tid]
    if t.status == 'in_progress':
        return ticket_card(t, notice='Provisioning is already in progress.')
    branch = t.branch or slugify_branch(tid, t.title)
    rev_name = t.review_inst_name or f'craft-rev-{tid}'
    if not get_setting('solveit_cookie'):
        t = tickets.update({'id': tid, 'status': 'approved', 'branch': branch, 'review_inst_name': rev_name, 'updated_at': _now()})
        return ticket_card(t, notice='Approved, but set your Solveit session cookie in Settings to spin up the review instance.', is_err=True)
    cb_tok = secrets.token_urlsafe(24)
    callback_url = f'{_public_base_url(req)}/api/tickets/{tid}/callback'
    t = tickets.update({
        'id': tid, 'status': 'in_progress', 'branch': branch, 'review_inst_name': rev_name,
        'callback_token': cb_tok, 'test_output': '',
        'summary': f'Creating branch {branch} and starting {rev_name}...',
        'updated_at': _now(),
    })
    threading.Thread(
        target=_provision_ticket_worker,
        args=(tid, branch, rev_name, callback_url, cb_tok),
        daemon=True,
    ).start()
    return ticket_card(t, notice=f'Provisioning {rev_name} on {branch} and running nbdev-test...')


@rt('/tickets/{tid}/review')
def spin_review(tid: int):
    t = tickets[tid]
    rev_name = t.review_inst_name or f'craft-rev-{tid}'
    try:
        res = deploy_branch_to_instance(
            cookie_raw=get_setting('solveit_cookie'),
            repo=get_setting('github_repo'),
            branch=t.branch or 'main',
            instance_name=rev_name,
            gh_token=get_setting('github_token'),
            create_if_missing=True,
        )
        t = tickets.update({
            'id': tid, 'review_url': res['origin'], 'review_inst_id': str(res['inst_id']),
            'review_inst_name': res['name'], 'status': 'needs_approval', 'updated_at': _now(),
        })
        return ticket_card(t, notice=f"Review app ready ({len(res['uploaded'])} files uploaded from {res['branch']}).")
    except Exception as e:
        return ticket_card(t, notice=f'Review app error: {e}', is_err=True)


@rt('/tickets/{tid}/deploy')
def deploy_prod(tid: int):
    t = tickets[tid]
    prod = get_setting('prod_instance', '')
    try:
        res = deploy_branch_to_instance(
            cookie_raw=get_setting('solveit_cookie'),
            repo=get_setting('github_repo'),
            branch=t.branch or 'main',
            instance_name=prod,
            gh_token=get_setting('github_token'),
            create_if_missing=False,
        )
        t = tickets.update({'id': tid, 'status': 'deployed', 'callback_token': '', 'updated_at': _now()})
        return ticket_card(t, notice=f"Deployed {len(res['uploaded'])} files ({res['branch']}) to {prod}.")
    except Exception as e:
        return ticket_card(t, notice=f'Deploy error: {e}', is_err=True)


@rt('/tickets/{tid}/teardown')
def teardown_review(tid: int):
    t = tickets[tid]
    try:
        client = SolveitClient(get_setting('solveit_cookie'))
        ok = client.delete_instance(t.review_inst_id, t.review_inst_name)
        t = tickets.update({
            'id': tid, 'review_url': '', 'review_inst_id': '', 'review_inst_name': '',
            'callback_token': '', 'updated_at': _now(),
        })
        return ticket_card(t, notice='Review instance deleted.' if ok else 'Delete requested; verify on dashboard.')
    except Exception as e:
        return ticket_card(t, notice=f'Teardown error: {e}', is_err=True)


@rt('/settings')
def settings_page(saved: str = ''):
    has_cookie = 'configured' if get_setting('solveit_cookie') else 'not set'
    has_gh = 'configured' if get_setting('github_token') else 'not set (public repo only)'
    return shell(
        'CRAFT Ops Settings',
        Div(
            H2('Ops Settings'),
            P('Settings saved.', cls='ok') if saved else '',
            Form(
                Label('Production Solveit instance', Input(name='prod_instance', value=get_setting('prod_instance', ''))),
                Label('GitHub repo (owner/repo)', Input(name='github_repo', value=get_setting('github_repo', DEFAULT_GITHUB_REPO), placeholder=DEFAULT_GITHUB_REPO)),
                Label(f'GitHub token ({has_gh})', Input(name='github_token', type='password', placeholder='Fine-grained PAT with Contents: Read & write (leave blank to keep current)')),
                Label(f'Solveit session cookie ({has_cookie})', Textarea(name='solveit_cookie', rows=3, placeholder='Paste Cookie header or .auth/solveit-state.json cookies; leave blank to keep current')),
                Button('Save Settings', type='submit', cls='btn-pri'),
                method='post', action=save_settings,
            ),
            cls='card',
        ),
    )


@rt
def save_settings(prod_instance: str = '', github_repo: str = '', github_token: str = '', solveit_cookie: str = ''):
    if prod_instance.strip(): set_setting('prod_instance', prod_instance)
    set_setting('github_repo', github_repo)
    if github_token.strip(): set_setting('github_token', github_token)
    if solveit_cookie.strip(): set_setting('solveit_cookie', solveit_cookie)
    return RedirectResponse('/settings?saved=1', status_code=303)


@rt('/api/tickets')
def get(status: str = ''):
    rows = tickets(where='status = ?', where_args=[status], order_by='id desc') if status else tickets(order_by='id desc')
    return JSONResponse({'tickets': [_ticket_dict(t) for t in rows]})


@rt('/api/tickets')
async def post(req):
    data = await req.json()
    title = (data.get('title') or '').strip()
    if not title: return JSONResponse({'error': 'title is required'}, status_code=400)
    parts = [p for p in ((data.get('body') or '').strip(), (data.get('description') or '').strip(), (data.get('reporter_notes') or '').strip()) if p]
    errs = data.get('console_errors')
    err_str = errs.strip() if isinstance(errs, str) else (json.dumps(errs, indent=2) if errs else '')
    now = _now()
    t = tickets.insert(Ticket(
        title=title,
        body='\n\n'.join(parts),
        kind=data.get('kind') if data.get('kind') in KINDS else 'bug',
        status='queued',
        dialog_name=(data.get('dialog_name') or data.get('dialog_id') or '').strip(),
        cell_id=(data.get('cell_id') or '').strip(),
        console_errors=err_str,
        page_url=(data.get('url') or data.get('page_url') or '').strip(),
        screenshot_data_url=(data.get('screenshot_data_url') or '').strip(),
        branch=(data.get('branch') or '').strip(),
        review_url='', review_inst_id='', review_inst_name='', pr_url='', summary='',
        callback_token='', test_output='',
        created_at=now, updated_at=now,
    ))
    ticket_url = f"{_public_base_url(req)}/#t-{t.id}"
    return JSONResponse({'ok': True, 'id': t.id, 'url': ticket_url, 'ticket': _ticket_dict(t)}, status_code=201)


@rt('/api/tickets/{tid}/update')
async def post(tid: int, req):
    data = await req.json()
    allowed = ('status', 'summary', 'branch', 'pr_url', 'review_url', 'review_inst_id', 'review_inst_name', 'body', 'title', 'test_output')
    patch = {k: str(data[k]) for k in allowed if k in data and data[k] is not None}
    if 'status' in patch and patch['status'] not in STATUSES:
        return JSONResponse({'error': 'invalid status'}, status_code=400)
    patch['id'] = tid
    patch['updated_at'] = _now()
    t = tickets.update(patch)
    return JSONResponse({'ok': True, 'ticket': _ticket_dict(t)})


@rt('/api/tickets/{tid}/callback')
async def post(tid: int, req):
    data = await req.json()
    tok = str(data.get('token') or '').strip()
    try: t = tickets[tid]
    except Exception: return JSONResponse({'error': 'not found'}, status_code=404)
    expected = str(getattr(t, 'callback_token', '') or '')
    if not expected or not tok or not secrets.compare_digest(tok, expected):
        return JSONResponse({'error': 'unauthorized'}, status_code=401)
    status = str(data.get('status') or 'needs_approval')
    if status not in ('in_progress', 'needs_approval'): status = 'needs_approval'
    patch = {
        'id': tid,
        'status': status,
        'summary': str(data.get('summary') or t.summary or ''),
        'test_output': str(data.get('test_output') or ''),
        'updated_at': _now(),
    }
    t = tickets.update(patch)
    return JSONResponse({'ok': True, 'ticket': _ticket_dict(t)})


serve()
