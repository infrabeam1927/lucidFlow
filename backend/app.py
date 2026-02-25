import os
from pathlib import Path
from flask import Flask, abort, send_from_directory
from flask_cors import CORS
from budget.database import db, init_db
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
    )

    if test_config:
        app.config.update(test_config)

    db.init_app(app)
    with app.app_context():
        init_db()

    CORS(app, resources={r"/api/*": {"origins": "*"}})
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
    app.run(host="0.0.0.0", port=port, debug=True)
