import os
from pathlib import Path
from flask import Flask, abort, jsonify, send_from_directory
from flask_cors import CORS
from budget.database import db, init_db
from budget.extensions import limiter
from budget.routes import api_bp


BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"


def create_app(test_config=None):
    app = Flask(__name__)
    os.makedirs(app.instance_path, exist_ok=True)
    default_db_path = os.path.join(app.instance_path, "budget.db")
    app.config.from_mapping(
        SQLALCHEMY_DATABASE_URI=f"sqlite:///{default_db_path}",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        JSON_SORT_KEYS=False,
        API_KEY=os.environ.get("LUCIDFLOW_API_KEY", "").strip(),
        RATELIMIT_DEFAULT=os.environ.get("LUCIDFLOW_RATE_LIMIT", "60 per minute"),
        RATELIMIT_STORAGE_URI="memory://",
    )

    if test_config:
        app.config.update(test_config)

    if not app.config["API_KEY"]:
        app.logger.warning(
            "LUCIDFLOW_API_KEY is not set; the API is running without authentication. "
            "Set LUCIDFLOW_API_KEY before exposing this app beyond localhost."
        )

    db.init_app(app)
    with app.app_context():
        init_db()

    limiter.init_app(app)

    @app.errorhandler(429)
    def rate_limit_exceeded(_error):
        return jsonify({"error": "Too many requests, please slow down"}), 429

    allowed_origins_env = os.environ.get("LUCIDFLOW_ALLOWED_ORIGINS", "").strip()
    if allowed_origins_env:
        allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
    else:
        allowed_origins = "*"
        app.logger.warning(
            "LUCIDFLOW_ALLOWED_ORIGINS is not set; CORS is allowing all origins for /api/*. "
            "Set LUCIDFLOW_ALLOWED_ORIGINS (comma-separated) before exposing this app beyond localhost."
        )

    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})
    app.register_blueprint(api_bp, url_prefix="/api")

    @app.route("/")
    def serve_dashboard():
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.route("/<path:asset>")
    def serve_frontend_assets(asset: str):
        if asset.startswith("api/"):
            abort(404)
        target = FRONTEND_DIR / asset
        if target.is_file():
            return send_from_directory(FRONTEND_DIR, asset)
        abort(404)

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("LUCIDFLOW_DEBUG", "").strip().lower() in ("1", "true", "yes")
    if debug:
        app.logger.warning(
            "Running with LUCIDFLOW_DEBUG enabled: this exposes the Werkzeug interactive "
            "debugger, which allows arbitrary code execution. Never use this outside local development."
        )
    app.run(host="0.0.0.0", port=port, debug=debug)
