import os

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


@app.errorhandler(429)
def ratelimit_error(_e: Exception):
    return jsonify({"error": "Too many requests — please wait a moment before trying again."}), 429


@app.errorhandler(404)
def not_found_error(_e: Exception):
    # Without this, Werkzeug returns its default HTML page — the frontend's
    # `res.json()` then throws "Unexpected token '<' ... is not valid JSON".
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def internal_error(_e: Exception):
    # Same reasoning as the 404 handler — keep every error response JSON so
    # the frontend can always parse it and show a real message.
    return jsonify({"error": "Internal server error"}), 500


# Register all route blueprints
from api import register_blueprints  # noqa: E402

register_blueprints(app)

# Start background startup tasks (backfill threads + orphan session migration)
from services.startup import start_background_threads  # noqa: E402

start_background_threads()

# Start proactive CFO alerts scheduler (APScheduler — daily + startup run)
from api.admin import start_cfo_scheduler  # noqa: E402
start_cfo_scheduler()

if __name__ == "__main__":
    port  = int(os.getenv("PORT", 5003))
    debug = os.getenv("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
