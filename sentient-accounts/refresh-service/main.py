from __future__ import annotations

import asyncio
import os
import secrets
from functools import lru_cache
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

ACTIVE_RUN_STATUSES = {"queued", "in_progress", "requested", "waiting", "pending"}


class Settings(BaseModel):
    github_owner: str
    github_repo: str
    github_workflow_id: str = "sentient-collect.yml"
    github_ref: str = "main"
    github_token: str
    refresh_shared_secret: str
    github_api_base: str = "https://api.github.com"


class RefreshRequest(BaseModel):
    requested_by: str = "dashboard-ui"
    source_url: str | None = None


def parse_allowed_origins(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    try:
        return Settings(
            github_owner=os.environ["GITHUB_OWNER"].strip(),
            github_repo=os.environ["GITHUB_REPO"].strip(),
            github_workflow_id=os.getenv("GITHUB_WORKFLOW_ID", "sentient-collect.yml").strip(),
            github_ref=os.getenv("GITHUB_REF", "main").strip(),
            github_token=os.environ["GITHUB_TOKEN"].strip(),
            refresh_shared_secret=os.environ["REFRESH_SHARED_SECRET"].strip(),
            github_api_base=os.getenv("GITHUB_API_BASE", "https://api.github.com").rstrip("/"),
        )
    except KeyError as exc:
        missing_key = str(exc).strip("'")
        raise RuntimeError(f"Missing required environment variable: {missing_key}") from exc


def build_app() -> FastAPI:
    app = FastAPI(title="Sentient Accounts Refresh API", version="1.0.0")
    allowed_origins = parse_allowed_origins(os.getenv("REFRESH_ALLOWED_ORIGINS", ""))
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins or ["*"],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
    return app


app = build_app()


def require_settings() -> Settings:
    try:
        return get_settings()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


def verify_refresh_secret(authorization: str | None, settings: Settings) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
        )

    presented = authorization[7:].strip()
    if not presented or not secrets.compare_digest(presented, settings.refresh_shared_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token.",
        )


def normalize_run(run: dict[str, Any] | None) -> dict[str, Any] | None:
    if not run:
        return None

    actor = run.get("actor") or {}
    return {
        "id": run.get("id"),
        "name": run.get("name"),
        "status": run.get("status"),
        "conclusion": run.get("conclusion"),
        "html_url": run.get("html_url"),
        "created_at": run.get("created_at"),
        "updated_at": run.get("updated_at"),
        "run_number": run.get("run_number"),
        "event": run.get("event"),
        "head_branch": run.get("head_branch"),
        "actor": actor.get("login"),
    }


def pick_active_run(runs: list[dict[str, Any]]) -> dict[str, Any] | None:
    for run in runs:
        if run.get("status") in ACTIVE_RUN_STATUSES:
            return run
    return None


async def github_request(
    settings: Settings,
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json_payload: dict[str, Any] | None = None,
) -> httpx.Response:
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {settings.github_token}",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.request(
            method,
            f"{settings.github_api_base}{path}",
            params=params,
            json=json_payload,
            headers=headers,
        )
    return response


async def list_workflow_runs(settings: Settings, *, per_page: int = 10) -> list[dict[str, Any]]:
    response = await github_request(
        settings,
        "GET",
        f"/repos/{settings.github_owner}/{settings.github_repo}/actions/workflows/{settings.github_workflow_id}/runs",
        params={
            "branch": settings.github_ref,
            "per_page": per_page,
        },
    )
    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"GitHub workflow status request failed ({response.status_code}).",
        )
    payload = response.json()
    workflow_runs = payload.get("workflow_runs")
    return workflow_runs if isinstance(workflow_runs, list) else []


async def dispatch_refresh(settings: Settings, request: RefreshRequest) -> None:
    response = await github_request(
        settings,
        "POST",
        f"/repos/{settings.github_owner}/{settings.github_repo}/actions/workflows/{settings.github_workflow_id}/dispatches",
        json_payload={
            "ref": settings.github_ref,
            "inputs": {
                "trigger_source": "dashboard-ui",
                "requested_by": request.requested_by[:120],
                "source_url": (request.source_url or "")[:240],
            },
        },
    )
    if response.status_code != status.HTTP_204_NO_CONTENT:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"GitHub workflow dispatch failed ({response.status_code}).",
        )


@app.get("/healthz")
async def healthcheck() -> dict[str, str]:
    require_settings()
    return {"status": "ok"}


@app.get("/api/status")
async def get_refresh_status() -> dict[str, Any]:
    settings = require_settings()
    runs = await list_workflow_runs(settings)
    active_run = pick_active_run(runs)
    latest_run = runs[0] if runs else None
    run = active_run or latest_run
    return {
        "ok": True,
        "workflow_id": settings.github_workflow_id,
        "has_active_run": active_run is not None,
        "run": normalize_run(run),
        "note": "This endpoint tracks the collector workflow. GitHub Pages deploy runs after the data commit lands on main.",
    }


@app.post("/api/refresh")
async def queue_refresh(
    request: RefreshRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    settings = require_settings()
    verify_refresh_secret(authorization, settings)

    runs = await list_workflow_runs(settings)
    active_run = pick_active_run(runs)
    if active_run:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "ok": False,
                "message": "A refresh workflow is already queued or running.",
                "run": normalize_run(active_run),
            },
        )

    await dispatch_refresh(settings, request)
    await asyncio.sleep(2)

    refreshed_runs = await list_workflow_runs(settings)
    latest_run = pick_active_run(refreshed_runs) or (refreshed_runs[0] if refreshed_runs else None)
    return {
        "ok": True,
        "message": "Refresh workflow queued.",
        "run": normalize_run(latest_run),
        "note": "GitHub Pages will republish the dashboard automatically after the collector workflow commits updated JSON.",
    }
