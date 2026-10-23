"""Run this agent on your own computer, with its own page: a chat page, a run page, or both.

    uv run python local_app.py            # then open http://127.0.0.1:<LOCAL_PORT>

Started and stopped by the agent pipeline (Deployment → "On your computer"); it also works on its own.
It only listens on this computer (127.0.0.1). The page's requests carry a token that only the page itself
gets, so other websites open in your browser can't make the agent do anything.

Background agents: the schedule set on the run page (local/schedule.json) runs while this computer is
awake. A run that was due while it slept happens once when it wakes up.

The page's Agent Helper (Create tab) relays change requests to the pipeline that built this agent
(PIPELINE_URL, PIPELINE_PROJECT, PIPELINE_KEY); without those, the helper says to open the pipeline.

Settings: LOCAL_PORT (default 8765), LOCAL_TOKEN (set by the pipeline; a random one otherwise).
"""

from __future__ import annotations

import asyncio
import json
import os
import secrets
import time
import urllib.error
import urllib.request
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
os.environ["AUTH_MODE"] = "machine-key"
# On this computer, state (conversations, run log) stays in this folder, never in an online database.
os.environ["DATABASE_URL"] = ""

from server import handle  # noqa: E402

# Only this computer can reach it, and the page token guards every request instead of a key.
os.environ.pop("AGENT_API_KEY", None)

ROOT = Path(__file__).resolve().parent
PORT = int(os.getenv("LOCAL_PORT", "8765"))
TOKEN = os.getenv("LOCAL_TOKEN") or secrets.token_urlsafe(24)
PAGE = ROOT / "local" / "index.html"
CONFIG = ROOT / "local" / "page.json"
SCHEDULE = ROOT / "local" / "schedule.json"
PENDING = ROOT / "local" / "pending.json"
SETTINGS = ROOT / "local" / "settings.json"
PIPELINE_URL = os.getenv("PIPELINE_URL", "").rstrip("/")
PIPELINE_PROJECT = os.getenv("PIPELINE_PROJECT", "")
PIPELINE_KEY = os.getenv("PIPELINE_KEY", "")
RUNS = ROOT / ".results" / "runs.jsonl"
HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _read(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def _write(path: Path, value) -> None:
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")


def run_message(inputs: dict) -> str:
    """The message a Run sends: the job is built into the agent, so only the inputs (if any) are added."""
    filled = {k: v for k, v in (inputs or {}).items() if str(v).strip()}
    if not filled:
        return "Run your job now."
    return "Run your job now with these inputs:\n" + "\n".join(f"- {k}: {v}" for k, v in filled.items())


def call(body: dict) -> tuple[int, dict]:
    """Run (or resume) through the agent's own handler, and remember what's waiting for an approval."""
    code, out = handle(body, {})
    conversation = out.get("conversation_id") if isinstance(out, dict) else None
    if conversation:
        pending = _read(PENDING, {})
        if out.get("status") == "needs_approval":
            pending[conversation] = out.get("pending", [])
        else:
            pending.pop(conversation, None)
        _write(PENDING, pending)
    return code, out


def start_run(inputs: dict, source: str) -> dict:
    """One background run. Its conversation id starts with "run-" so the run page can list it."""
    conversation = f"run-{source}-{int(time.time())}-{secrets.token_hex(3)}"
    return call({"message": run_message(inputs), "conversation_id": conversation})[1]


def recent_runs(limit: int = 30) -> list[dict]:
    """Newest first: background runs, plus anything still waiting for an approval."""
    try:
        lines = RUNS.read_text(encoding="utf-8").splitlines()[-500:]
    except OSError:
        return []
    out, seen = [], set()
    pending = _read(PENDING, {})
    for line in reversed(lines):
        try:
            row = json.loads(line)
        except ValueError:
            continue
        conversation = str(row.get("thread_id", "")).split(":", 1)[-1]
        # One entry per run, at its latest state (an approval adds a second row to the same run).
        if not conversation.startswith("run-") or conversation in seen:
            continue
        seen.add(conversation)
        out.append({
            "at": row.get("at"),
            "conversation_id": conversation,
            "source": conversation.split("-")[1] if conversation.count("-") >= 2 else "run",
            "status": row.get("status"),
            "ok": row.get("ok"),
            "output": row.get("output"),
            "error": row.get("error"),
            "tool_calls": row.get("tool_calls", 0),
            "latency_s": row.get("latency_s"),
            "pending": pending.get(conversation, []),
        })
        if len(out) >= limit:
            break
    return out


def page_config() -> dict:
    """What the page shows: the pipeline's page.json, with the owner's own starter prompts if they edited them."""
    config = _read(CONFIG, {})
    starters = _read(SETTINGS, {}).get("starters")
    if isinstance(starters, list):
        config["starters"] = [str(x) for x in starters if str(x).strip()][:8]
    return config


def helper(method: str, body: dict | None = None) -> tuple[int, dict]:
    """Relay to the pipeline's Agent Helper (the same AI that changes the agent in Agent Design)."""
    if not (PIPELINE_URL and PIPELINE_PROJECT and PIPELINE_KEY):
        return 503, {"error": "Start this agent from the pipeline to use the Agent Helper."}
    req = urllib.request.Request(
        f"{PIPELINE_URL}/api/projects/{PIPELINE_PROJECT}/deploy/local/helper",
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Content-Type": "application/json", "X-Bridge-Key": PIPELINE_KEY},
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {"error": "The pipeline couldn't make that change."}
    except (urllib.error.URLError, TimeoutError, OSError):
        return 502, {"error": "Couldn't reach the pipeline. Is it still running?"}


# ---------------- schedule ----------------

def next_due(s: dict, after: datetime) -> datetime | None:
    """The first scheduled time after `after`, or None when the schedule is off."""
    if not s.get("enabled"):
        return None
    every = s.get("every", "day")
    if every == "minutes":
        return after + timedelta(minutes=max(5, int(s.get("minutes", 15))))
    if every == "hours":
        return after + timedelta(hours=max(1, int(s.get("hours", 1))))
    hh, mm = (int(x) for x in str(s.get("time", "09:00")).split(":")[:2])
    candidate = after.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if every == "week":
        target = WEEKDAYS.index(s.get("weekday", "monday"))
        candidate += timedelta(days=(target - candidate.weekday()) % 7)
        if candidate <= after:
            candidate += timedelta(days=7)
    else:
        if candidate <= after:
            candidate += timedelta(days=1)
        while every == "weekdays" and candidate.weekday() >= 5:
            candidate += timedelta(days=1)
    return candidate


async def scheduler() -> None:
    """Every 30 seconds: run once if a scheduled time has passed since the last scheduled run."""
    while True:
        await asyncio.sleep(30)
        s = _read(SCHEDULE, {})
        if not s.get("enabled"):
            continue
        last = datetime.fromtimestamp(s.get("last_run") or s.get("since") or time.time())
        due = next_due(s, last)
        if due and due <= datetime.now():
            s["last_run"] = time.time()
            _write(SCHEDULE, s)
            await asyncio.to_thread(start_run, s.get("inputs", {}), "schedule")


# ---------------- the app ----------------

def make_app():
    from starlette.applications import Starlette
    from starlette.requests import Request
    from starlette.responses import HTMLResponse, JSONResponse
    from starlette.routing import Route

    def guard(request: Request, api: bool = True) -> JSONResponse | None:
        # Blocks DNS-rebinding (wrong Host) and other sites' requests (no token: they can't read the page).
        if request.headers.get("host", "") not in HOSTS:
            return JSONResponse({"error": "Open this page at 127.0.0.1 on this computer."}, status_code=403)
        if api and not secrets.compare_digest(request.headers.get("x-local-token", ""), TOKEN):
            return JSONResponse({"error": "Reload the page."}, status_code=403)
        return None

    async def page(request: Request):
        if (bad := guard(request, api=False)) is not None:
            return bad
        html = PAGE.read_text(encoding="utf-8")
        config = {**page_config(), "token": TOKEN}
        # "<" escaped so nothing in the config can close the page's script tag.
        return HTMLResponse(html.replace("/*__CONFIG__*/null", json.dumps(config).replace("<", "\\u003c")))

    async def ping(_: Request):
        return JSONResponse({"status": "Healthy"})

    async def invoke(request: Request):
        if (bad := guard(request)) is not None:
            return bad
        body = await request.json()
        allowed = {k: body[k] for k in ("message", "decisions", "conversation_id") if k in body}
        code, out = await asyncio.to_thread(call, allowed)
        return JSONResponse(json.loads(json.dumps(out, default=str)), status_code=code)

    async def run(request: Request):
        if (bad := guard(request)) is not None:
            return bad
        body = await request.json()
        out = await asyncio.to_thread(start_run, body.get("inputs") or {}, "button")
        return JSONResponse(json.loads(json.dumps(out, default=str)))

    async def runs(request: Request):
        if (bad := guard(request)) is not None:
            return bad
        return JSONResponse(json.loads(json.dumps(recent_runs(), default=str)))

    async def schedule(request: Request):
        if (bad := guard(request)) is not None:
            return bad
        s = _read(SCHEDULE, {})
        if request.method == "POST":
            body = await request.json()
            keep = {k: body[k] for k in ("enabled", "every", "time", "weekday", "hours", "minutes", "inputs") if k in body}
            # Turning it on (or changing it) counts from now, so it doesn't fire for times already past.
            s = {**s, **keep, "since": time.time(), "last_run": None}
            _write(SCHEDULE, s)
        nxt = next_due(s, datetime.fromtimestamp(s.get("last_run") or s.get("since") or time.time()))
        return JSONResponse({**s, "next": nxt.isoformat(timespec="minutes") if nxt else None})

    async def config(request: Request):
        if (bad := guard(request)) is not None:
            return bad
        if request.method == "POST":
            body = await request.json()
            starters = body.get("starters")
            if isinstance(starters, list):
                _write(SETTINGS, {**_read(SETTINGS, {}), "starters": [str(x).strip()[:200] for x in starters if str(x).strip()][:8]})
        return JSONResponse(page_config())

    async def helper_route(request: Request):
        if (bad := guard(request)) is not None:
            return bad
        if request.method == "POST":
            body = await request.json()
            code, out = await asyncio.to_thread(helper, "POST", {"message": str(body.get("message", ""))[:4000]})
        else:
            code, out = await asyncio.to_thread(helper, "GET")
        return JSONResponse(out, status_code=code)

    @asynccontextmanager
    async def lifespan(_app):
        task = asyncio.create_task(scheduler())
        yield
        task.cancel()

    return Starlette(
        routes=[
            Route("/", page),
            Route("/ping", ping),
            Route("/api/invoke", invoke, methods=["POST"]),
            Route("/api/run", run, methods=["POST"]),
            Route("/api/runs", runs),
            Route("/api/schedule", schedule, methods=["GET", "POST"]),
            Route("/api/config", config, methods=["GET", "POST"]),
            Route("/api/helper", helper_route, methods=["GET", "POST"]),
        ],
        lifespan=lifespan,
    )


if __name__ == "__main__":
    import uvicorn

    print(f"Your agent is running at http://127.0.0.1:{PORT}", flush=True)
    uvicorn.run(make_app(), host="127.0.0.1", port=PORT, log_level="warning")
