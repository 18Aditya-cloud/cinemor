from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.routes.model_routes import router as model_router
from app.api.routes.story_routes import router as story_router
from app.api.routes.auth_routes import router as auth_router
from app.api.routes.organization_dashboard_routes import (
    router as organization_dashboard_router,
)
from app.api.routes.team_leader_dashboard_routes import (
    router as team_leader_dashboard_router,
)
from app.api.routes.storyboard_routes import router as storyboard_router
from app.api.routes.individual_routes import router as individual_router
from app.api.routes.employee_routes import router as employee_router
from app.api.routes.activity_routes import router as activity_router
from app.api.routes.content_delete_routes import router as content_delete_router
from app.api.routes.client_portal_routes import router as client_portal_router
from app.api.routes.quick_create_routes import router as quick_create_router
from app.api.routes.one_click_routes import router as one_click_router
from app.api.routes.account_routes import router as account_router
from app.core.config import settings
from app.core.security_headers import SecurityHeadersMiddleware
from app.services.activity_log import ActivityActorMiddleware, install_activity_log


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
    # Interactive API docs and the OpenAPI schema are exposed only in debug.
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
)

# Recent activity: remember who is acting, and log organization changes as they are saved
install_activity_log()
@app.exception_handler(ValueError)
async def not_found_as_404(request: Request, exc: ValueError):
    """
    Safety net: a service that cannot find what was asked for (a project, a story, ...) raises
    ValueError("... not found."). A route that forgot to turn that into a 404 would answer 500 and print a
    traceback; answer 404 with the message instead. Any other ValueError is still a real error (500).
    """
    message = str(exc)
    if "not found" in message.lower():
        return JSONResponse(status_code=404, content={"detail": message})
    raise exc


app.add_middleware(ActivityActorMiddleware)

# nosniff, frame denial, referrer policy; HSTS + strict CSP outside debug
app.add_middleware(SecurityHeadersMiddleware)


# ---------------------------------------------------------
# API Routers
# ---------------------------------------------------------

app.include_router(auth_router)
app.include_router(model_router)
app.include_router(story_router)
app.include_router(organization_dashboard_router)
app.include_router(team_leader_dashboard_router)
app.include_router(individual_router)
app.include_router(employee_router)
app.include_router(storyboard_router)
app.include_router(activity_router)
app.include_router(content_delete_router)
app.include_router(client_portal_router)
app.include_router(quick_create_router)
app.include_router(one_click_router)
app.include_router(account_router)


# ---------------------------------------------------------
# Health Check
# ---------------------------------------------------------

@app.get(
    "/health",
    tags=["Health"],
)
async def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }