from fastapi import APIRouter
from app.api.v1 import auth, members, payments, checkins, dashboard, classes, machines, notifications, reports, member_plans, memberships, settings, users

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(members.router)
router.include_router(payments.router)
router.include_router(checkins.router)
router.include_router(dashboard.router)
router.include_router(classes.router)
router.include_router(machines.router)
router.include_router(notifications.router)
router.include_router(reports.router)
router.include_router(member_plans.router)
router.include_router(memberships.router)
router.include_router(settings.router)
router.include_router(users.router)
