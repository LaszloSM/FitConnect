import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from apscheduler.triggers.interval import IntervalTrigger

from app.core.timeutil import BOGOTA
from app.services.jobs import (
    expire_memberships_job, reconcile_payments_job, process_outbox_job, train_models_job, sync_access_devices_job,
    advance_subscriptions_job, process_plan_jobs_job,
)

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone=BOGOTA)


def start_scheduler() -> None:
    scheduler.add_job(
        expire_memberships_job,
        CronTrigger(hour=0, minute=10, timezone=BOGOTA),
        id="expire_memberships",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        reconcile_payments_job,
        IntervalTrigger(minutes=30),
        id="reconcile_payments",
        replace_existing=True,
        misfire_grace_time=600,
    )
    scheduler.add_job(
        process_outbox_job,
        IntervalTrigger(seconds=60),
        id="process_outbox",
        replace_existing=True,
        misfire_grace_time=120,
    )
    scheduler.add_job(
        train_models_job,
        CronTrigger(hour=3, minute=30, timezone=BOGOTA),
        id="train_models",
        replace_existing=True,
        misfire_grace_time=7200,
    )
    scheduler.add_job(
        advance_subscriptions_job,
        CronTrigger(hour=0, minute=20, timezone=BOGOTA),
        id="advance_subscriptions",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        sync_access_devices_job,
        IntervalTrigger(minutes=5),
        id="sync_access_devices",
        replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.add_job(
        process_plan_jobs_job,
        IntervalTrigger(seconds=20),
        id="process_plan_jobs",
        replace_existing=True,
        misfire_grace_time=60,
        max_instances=1,
    )
    scheduler.start()
    logger.info("Scheduler iniciado (%d jobs)", len(scheduler.get_jobs()))


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
