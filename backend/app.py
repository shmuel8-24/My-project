import os
import traceback as _tb

# Homebrew libs (Apple Silicon: /opt/homebrew, Intel: /usr/local) are not in the
# default dyld search path. Setting DYLD_LIBRARY_PATH here lets cffi/WeasyPrint
# find pango/gobject at dlopen time when the /export-pdf route first fires.
_hb = next(
    (p for p in ("/opt/homebrew/lib", "/usr/local/lib")
     if os.path.isfile(f"{p}/libgobject-2.0.0.dylib")),
    None,
)
if _hb and _hb not in os.environ.get("DYLD_LIBRARY_PATH", ""):
    os.environ["DYLD_LIBRARY_PATH"] = f"{_hb}:{os.environ.get('DYLD_LIBRARY_PATH', '')}".strip(":")

from flask import Flask, jsonify
from flask_cors import CORS

# Import extensions first (loads .env, initialises singletons)
from extensions import limiter  # noqa: E402  (after DYLD fix)

# Import models (creates DB engine, runs migrations — after extensions so .env is loaded)
import models  # noqa: F401, E402

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100 MB

CORS(
    app,
    origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    supports_credentials=True,
    max_age=86400,
)

limiter.init_app(app)


@app.errorhandler(Exception)
def handle_exception(e: Exception):
    """Catch ALL unhandled Python exceptions before Werkzeug can return its
    HTML debugger page. Logs the full traceback to the terminal so developers
    can see exactly what crashed, then returns clean JSON so the frontend's
    res.json() never throws a parse error and the app never 'hangs'."""
    from werkzeug.exceptions import HTTPException
    _tb.print_exc()  # full traceback to the Flask/start.py terminal
    if isinstance(e, HTTPException):
        # HTTP exceptions (404, 405, etc.) — use their built-in status code
        return jsonify({"error": e.description or e.name}), e.code
    # Unhandled Python exception → 500
    return jsonify({"error": str(e) or "Internal server error"}), 500


@app.errorhandler(429)
def ratelimit_error(_e: Exception):
    return jsonify({"error": "Too many requests — please wait a moment before trying again."}), 429


@app.errorhandler(404)
def not_found_error(_e: Exception):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def internal_error(e: Exception):
    _tb.print_exc()
    return jsonify({"error": "Internal server error"}), 500


# Register all route blueprints
from api import register_blueprints  # noqa: E402

register_blueprints(app)

# Support both FLASK_DEBUG=1 (set by start.py) and FLASK_ENV=development (legacy).
_debug_mode = os.getenv("FLASK_DEBUG") == "1" or os.getenv("FLASK_ENV") == "development"

# In debug mode Werkzeug forks two processes: a file-watcher parent (no WERKZEUG_RUN_MAIN)
# and the actual server worker (WERKZEUG_RUN_MAIN=true).  Background threads and the CFO
# scheduler must only start in the worker — not in the watcher — to avoid double-running
# migrations and duplicate APScheduler jobs.  In production there is no reloader so the
# guard condition is always False and both always start.
_is_reloader_parent = _debug_mode and os.getenv("WERKZEUG_RUN_MAIN") != "true"

from services.startup import start_background_threads  # noqa: E402
from api.admin import start_cfo_scheduler              # noqa: E402

if not _is_reloader_parent:
    start_background_threads()

# start_cfo_scheduler has its own WERKZEUG_RUN_MAIN guard but call it unconditionally
# so production (non-debug) mode still starts it here.
start_cfo_scheduler()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5003))
    # use_debugger=False: keep auto-reload but disable Werkzeug's interactive HTML
    # debugger so @app.errorhandler(Exception) fires and returns JSON instead of the
    # debugger page (which freezes the frontend's res.json() and looks like a hang).
    app.run(
        host="0.0.0.0",
        port=port,
        debug=_debug_mode,
        use_debugger=False,
        use_reloader=_debug_mode,
    )
