"""Local preview server for the canonical static application in ./docs.

The old repository contained a second Flask/SQLite implementation that duplicated
business logic from the GitHub Pages version. This file intentionally makes
./docs the single source of truth while keeping `python app.py` convenient.
"""

from pathlib import Path

from flask import Flask, abort, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
DOCS_DIR = (BASE_DIR / "docs").resolve()

app = Flask(__name__, static_folder=None)


@app.after_request
def disable_dev_cache(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/")
def index():
    return send_from_directory(DOCS_DIR, "index.html")


@app.get("/<path:requested_path>")
def docs_file(requested_path: str):
    candidate = (DOCS_DIR / requested_path).resolve()
    if candidate != DOCS_DIR and DOCS_DIR not in candidate.parents:
        abort(404)

    if candidate.is_file():
        return send_from_directory(DOCS_DIR, requested_path)

    if not Path(requested_path).suffix:
        html_candidate = (DOCS_DIR / f"{requested_path}.html").resolve()
        if html_candidate.is_file() and DOCS_DIR in html_candidate.parents:
            return send_from_directory(DOCS_DIR, f"{requested_path}.html")

    not_found = DOCS_DIR / "404.html"
    if not_found.is_file():
        return send_from_directory(DOCS_DIR, "404.html"), 404
    abort(404)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
