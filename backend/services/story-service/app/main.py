from fastapi import FastAPI

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
from app.core.config import settings
from app.services.activity_log import ActivityActorMiddleware, install_activity_log


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
)
# Recent activity: remember who is acting, and log organization changes as they are saved
install_activity_log()
app.add_middleware(ActivityActorMiddleware)

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