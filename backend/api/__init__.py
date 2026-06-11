def register_blueprints(app):
    from api.auth import auth_bp
    from api.documents import documents_bp
    from api.admin import admin_bp
    from api.export import export_bp
    from api.professor import professor_bp
    from api.courses import courses_bp
    from api.presentation_agent import presentation_agent_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(documents_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(export_bp)
    app.register_blueprint(professor_bp)
    app.register_blueprint(courses_bp)
    app.register_blueprint(presentation_agent_bp)
