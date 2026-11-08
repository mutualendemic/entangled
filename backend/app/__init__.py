from flask import Flask, jsonify
from pymongo.errors import PyMongoError

from backend.app.config import Config
from backend.app.routes.auth import auth_blueprint
from backend.app.routes.health import health_blueprint
from backend.app.routes.profiles import profiles_blueprint
from backend.app.routes.world import world_blueprint


def create_app(config_class: type[Config] = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_class)
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024
    app.register_blueprint(health_blueprint, url_prefix="/api")
    app.register_blueprint(auth_blueprint, url_prefix="/api")
    app.register_blueprint(profiles_blueprint, url_prefix="/api")
    app.register_blueprint(world_blueprint, url_prefix="/api")

    @app.errorhandler(PyMongoError)
    def handle_database_error(error: PyMongoError):
        app.logger.warning("MongoDB unavailable (%s)", type(error).__name__)
        return jsonify({"error": "Banco indisponivel. Verifique a conexao e a configuracao DNS."}), 503

    return app