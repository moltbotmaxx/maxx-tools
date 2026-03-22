from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path
from typing import Any

import instaloader
from instagram_auth import authenticate_loader, build_loader, load_local_env

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"
HISTORY_DIR = DATA_DIR / "history"
ACCOUNTS_PATH = BASE_DIR / "accounts.json"
DEFAULT_POST_LIMIT = 12


def load_accounts() -> list[str]:
    raw = json.loads(ACCOUNTS_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError("collector/accounts.json must contain a JSON array of usernames.")

    accounts = []
    for item in raw:
        if not isinstance(item, str):
            continue
        normalized = item.strip().lstrip("@")
        if normalized:
            accounts.append(normalized)
    return accounts

def get_post_limit() -> int:
    load_local_env()
    raw_value = str(os.getenv("RECENT_POST_LIMIT", str(DEFAULT_POST_LIMIT))).strip()
    try:
        value = int(raw_value)
    except ValueError:
        print(
            f"Invalid RECENT_POST_LIMIT value '{raw_value}'. "
            f"Falling back to {DEFAULT_POST_LIMIT}."
        )
        return DEFAULT_POST_LIMIT
    return max(1, value)


def build_failure(account: str, exc: Exception) -> dict[str, str]:
    return {
        "account": account,
        "error_type": type(exc).__name__,
        "error": str(exc),
    }


def get_nested_value(data: dict[str, Any], *keys: str) -> Any:
    current: Any = data
    for key in keys:
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def extract_post_metrics(post: Any) -> dict[str, Any]:
    node = getattr(post, "_node", {}) or {}
    caption_edges = get_nested_value(node, "edge_media_to_caption", "edges") or []
    caption = node.get("caption") or ""
    if not caption and caption_edges:
        caption = get_nested_value(caption_edges[0], "node", "text") or ""

    likes = (
        node.get("likes")
        or
        get_nested_value(node, "edge_media_preview_like", "count")
        or get_nested_value(node, "edge_liked_by", "count")
        or 0
    )
    comments = (
        node.get("comments")
        or
        get_nested_value(node, "edge_media_to_comment", "count")
        or get_nested_value(node, "edge_media_to_parent_comment", "count")
        or 0
    )

    return {
        "likes": int(likes or 0),
        "comments": int(comments or 0),
        "is_video": bool(node.get("is_video") or get_nested_value(node, "is_video")),
        "video_views": int(node.get("video_view_count") or get_nested_value(node, "video_view_count") or 0),
        "caption": str(caption).strip()[:180],
    }


def build_recent_post(post: Any) -> dict[str, Any]:
    metrics = extract_post_metrics(post)
    return {
        "shortcode": post.shortcode,
        "date": post.date_utc.date().isoformat(),
        "likes": metrics["likes"],
        "comments": metrics["comments"],
        "is_video": metrics["is_video"],
        "video_views": metrics["video_views"],
        "caption": metrics["caption"],
        "url": f"https://www.instagram.com/p/{post.shortcode}/",
    }


def collect_account(
    loader: instaloader.Instaloader,
    username: str,
    snapshot_date: str,
    run_started_at: str,
) -> dict[str, Any]:
    profile = instaloader.Profile.from_username(loader.context, username)

    recent_posts = []
    likes_total = 0
    comments_total = 0
    views_total = 0
    video_count = 0

    post_limit = get_post_limit()
    for index, post in enumerate(profile.get_posts()):
        if index >= post_limit:
            break

        post_data = build_recent_post(post)
        recent_posts.append(post_data)
        likes_total += post_data["likes"]
        comments_total += post_data["comments"]

        if post_data["is_video"]:
            views_total += post_data["video_views"]
            video_count += 1

    post_count = len(recent_posts)
    avg_likes = round(likes_total / post_count, 2) if post_count else 0
    avg_comments = round(comments_total / post_count, 2) if post_count else 0
    avg_video_views = round(views_total / video_count, 2) if video_count else 0
    avg_video_views_per_post = round(views_total / post_count, 2) if post_count else 0
    followers = profile.followers or 0
    engagement_rate = round(((avg_likes + avg_comments) / followers) * 100, 4) if followers else 0

    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "date": snapshot_date,
        "run_started_at": run_started_at,
        "account": username,
        "profile_url": f"https://www.instagram.com/{username}/",
        "full_name": profile.full_name,
        "biography": profile.biography,
        "external_url": profile.external_url,
        "is_verified": bool(profile.is_verified),
        "followers": followers,
        "following": profile.followees,
        "posts": profile.mediacount,
        "recent_post_count": post_count,
        "video_post_count": video_count,
        "avg_likes": avg_likes,
        "avg_comments": avg_comments,
        "avg_video_views": avg_video_views,
        "avg_video_views_per_video": avg_video_views,
        "avg_video_views_per_post": avg_video_views_per_post,
        "engagement_rate": engagement_rate,
        "recent_posts": recent_posts,
    }


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def update_history(history_path: Path, snapshot: dict[str, Any]) -> None:
    if history_path.exists():
        try:
            history = json.loads(history_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            history = []
    else:
        history = []

    if not isinstance(history, list):
        history = []

    snapshots_by_date: dict[str, dict[str, Any]] = {}
    for item in history:
        if isinstance(item, dict) and isinstance(item.get("date"), str):
            snapshots_by_date[item["date"]] = item

    snapshots_by_date[snapshot["date"]] = snapshot
    ordered_dates = sorted(snapshots_by_date)
    ordered_history = [snapshots_by_date[date] for date in ordered_dates]
    write_json(history_path, ordered_history)


def main() -> int:
    load_local_env()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    snapshot_date = dt.date.today().isoformat()
    run_started_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()

    accounts = load_accounts()
    if not accounts:
        print("No accounts configured in collector/accounts.json")
        return 0

    loader = build_loader()
    authenticate_loader(loader)
    failures = []
    collected = 0

    for username in accounts:
        print(f"Collecting {username}...")
        try:
            payload = collect_account(loader, username, snapshot_date, run_started_at)
            write_json(DATA_DIR / f"{username}.json", payload)
            update_history(
                HISTORY_DIR / f"{username}.json",
                {
                    "date": payload["date"],
                    "followers": payload["followers"],
                    "avg_likes": payload["avg_likes"],
                    "avg_comments": payload["avg_comments"],
                    "engagement_rate": payload["engagement_rate"],
                },
            )
        except Exception as exc:
            failures.append(build_failure(username, exc))
            print(f"Failed to collect {username}: {exc}")
            continue

        collected += 1

    errors_path = DATA_DIR / "errors.json"
    if failures:
        write_json(
            errors_path,
            {
                "generated_at": dt.datetime.now(dt.timezone.utc)
                .replace(microsecond=0)
                .isoformat(),
                "date": snapshot_date,
                "run_started_at": run_started_at,
                "failures": failures,
            },
        )
    elif errors_path.exists():
        errors_path.unlink()

    if collected == 0:
        print("No account data was collected successfully.")
        return 1

    print(f"Collected {collected} account dataset(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
