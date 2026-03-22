from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

import instaloader
from instagram_auth import authenticate_loader, build_loader, load_local_env

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"
HISTORY_DIR = DATA_DIR / "history"
AVATARS_DIR = BASE_DIR.parent / "avatars"
ACCOUNTS_PATH = BASE_DIR / "accounts.json"
DEFAULT_POST_LIMIT = 24
DEFAULT_POST_WINDOW_DAYS = 14
DEFAULT_POST_COLLECTION_WINDOW_DAYS = 30
DEFAULT_POST_HARD_LIMIT = 120
HIDDEN_LIKES_SENTINEL = 3


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

def get_int_setting(env_name: str, default_value: int, minimum: int = 1) -> int:
    load_local_env()
    raw_value = str(os.getenv(env_name, str(default_value))).strip()
    try:
        value = int(raw_value)
    except ValueError:
        print(
            f"Invalid {env_name} value '{raw_value}'. "
            f"Falling back to {default_value}."
        )
        return default_value
    return max(minimum, value)


def get_post_limit() -> int:
    return get_int_setting("RECENT_POST_LIMIT", DEFAULT_POST_LIMIT)


def get_post_window_days() -> int:
    return get_int_setting("RECENT_POST_WINDOW_DAYS", DEFAULT_POST_WINDOW_DAYS, minimum=0)


def get_post_collection_window_days(display_window_days: int) -> int:
    configured = get_int_setting(
        "RECENT_POST_COLLECTION_WINDOW_DAYS",
        DEFAULT_POST_COLLECTION_WINDOW_DAYS,
        minimum=0,
    )
    return max(display_window_days, configured)


def get_post_hard_limit(soft_limit: int) -> int:
    return max(soft_limit, get_int_setting("RECENT_POST_HARD_LIMIT", DEFAULT_POST_HARD_LIMIT))


def should_scrape_reel_views() -> bool:
    load_local_env()
    return str(os.getenv("ENABLE_REEL_VIEW_SCRAPE", "")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def build_reel_view_scraper() -> Any | None:
    if not should_scrape_reel_views():
        return None

    try:
        from instagram_auth import get_instagram_username, resolve_session_file
        from scrape_reel_views import ReelViewScraper
    except ModuleNotFoundError as exc:
        print(f"Reel view scraping disabled because Selenium dependencies are unavailable: {exc}")
        return None

    session_username = get_instagram_username()
    session_file = resolve_session_file(session_username) if session_username else None
    if session_file is None or not session_file.exists():
        print("Reel view scraping disabled because no persisted Instagram session file is available.")
        return None

    scraper = None
    try:
        scraper = ReelViewScraper(
            headless=True,
            session_file=session_file,
            skip_login_prompt=True,
        )
        scraper.open()
    except Exception as exc:
        print(f"Reel view scraping disabled because the headless browser could not start: {exc}")
        try:
            scraper.close()
        except Exception:
            pass
        return None

    print(f"Enabled reel view scraping via Selenium using {session_file}.")
    return scraper


def build_reel_view_lookup(scraper: Any | None, username: str, max_reels: int) -> dict[str, int]:
    if scraper is None:
        return {}

    try:
        scraped_reels = scraper.scrape_account(username, max_reels=max_reels)
    except Exception as exc:
        print(f"Failed to scrape reel views for @{username}: {exc}")
        return {}

    lookup: dict[str, int] = {}
    for item in scraped_reels:
        shortcode = str(item.get("shortcode") or "").strip()
        views = item.get("views")
        if shortcode and isinstance(views, int) and views > 0:
            lookup[shortcode] = views

    if lookup:
        print(f"Captured headless reel view counts for @{username}: {len(lookup)}")
    return lookup


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


def enrich_recent_posts_with_reel_views(
    recent_posts: list[dict[str, Any]],
    reel_view_lookup: dict[str, int] | None = None,
) -> int:
    if not reel_view_lookup:
        return 0

    enriched = 0
    for post in recent_posts:
        shortcode = str(post.get("shortcode") or "").strip()
        if not shortcode:
            continue

        view_count = reel_view_lookup.get(shortcode)
        if not isinstance(view_count, int) or view_count <= 0:
            continue

        post["video_views"] = view_count
        post["video_views_source"] = "selenium_reels_grid"
        enriched += 1

    return enriched


def is_post_within_window(post_date: str, snapshot_date: str, window_days: int) -> bool:
    if not post_date:
        return False
    try:
        post_day = dt.date.fromisoformat(post_date)
        snapshot_day = dt.date.fromisoformat(snapshot_date)
    except ValueError:
        return False

    age_in_days = (snapshot_day - post_day).days
    return 0 <= age_in_days <= window_days


def effective_like_count(post: dict[str, Any]) -> int:
    likes = int(post.get("likes") or 0)
    return 0 if likes == HIDDEN_LIKES_SENTINEL else likes


def avatar_relative_path(username: str) -> str:
    return f"../avatars/{username}.jpg"


def persist_profile_avatar(profile: instaloader.Profile, username: str) -> str:
    avatar_url = str(getattr(profile, "profile_pic_url", "") or "").strip()
    destination = AVATARS_DIR / f"{username}.jpg"

    if not avatar_url:
        return avatar_relative_path(username) if destination.exists() else ""

    try:
        request = Request(avatar_url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=30) as response:
            payload = response.read()
        if payload:
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(payload)
    except Exception as exc:
        print(f"Failed to save avatar for @{username}: {exc}")

    return avatar_relative_path(username) if destination.exists() else ""


def collect_account(
    loader: instaloader.Instaloader,
    username: str,
    snapshot_date: str,
    run_started_at: str,
    reel_view_lookup: dict[str, int] | None = None,
) -> dict[str, Any]:
    profile = instaloader.Profile.from_username(loader.context, username)

    recent_posts = []
    likes_total = 0
    comments_total = 0
    video_count = 0

    post_limit = get_post_limit()
    post_window_days = get_post_window_days()
    collection_window_days = get_post_collection_window_days(post_window_days)
    post_hard_limit = get_post_hard_limit(post_limit)
    snapshot_day = dt.date.fromisoformat(snapshot_date)
    collection_cutoff_date = snapshot_day - dt.timedelta(days=collection_window_days)
    display_cutoff_date = snapshot_day - dt.timedelta(days=post_window_days)
    stop_reason = "exhausted"

    # Keep scanning until we have both a reasonable sample size and coverage of the collection window.
    for post in profile.get_posts():
        if len(recent_posts) >= post_hard_limit:
            stop_reason = "hard_limit"
            break

        if len(recent_posts) >= post_limit and post.date_utc.date() < collection_cutoff_date:
            stop_reason = "window_reached"
            break

        post_data = build_recent_post(post)
        recent_posts.append(post_data)
        likes_total += post_data["likes"]
        comments_total += post_data["comments"]

        if post_data["is_video"]:
            video_count += 1

    post_count = len(recent_posts)
    enriched_view_posts = enrich_recent_posts_with_reel_views(recent_posts, reel_view_lookup)
    oldest_recent_post_date = recent_posts[-1]["date"] if recent_posts else None
    recent_window_posts = [
        post
        for post in recent_posts
        if is_post_within_window(
            str(post.get("date") or ""),
            snapshot_date,
            collection_window_days,
        )
    ]
    total_likes_recent_window = sum(effective_like_count(post) for post in recent_window_posts)
    videos_with_view_data = [
        post
        for post in recent_window_posts
        if post.get("is_video") and int(post.get("video_views") or 0) > 0
    ]
    views_total = sum(int(post.get("video_views") or 0) for post in videos_with_view_data)
    videos_with_view_data_count = len(videos_with_view_data)
    avg_likes = round(likes_total / post_count, 2) if post_count else 0
    avg_comments = round(comments_total / post_count, 2) if post_count else 0
    avg_video_views = round(views_total / videos_with_view_data_count, 2) if videos_with_view_data_count else 0
    avg_video_views_per_post = round(views_total / post_count, 2) if post_count else 0
    followers = profile.followers or 0
    engagement_rate = round(((avg_likes + avg_comments) / followers) * 100, 4) if followers else 0
    avatar_path = persist_profile_avatar(profile, username)
    display_window_covered = stop_reason != "hard_limit" or (
        oldest_recent_post_date is not None and oldest_recent_post_date <= display_cutoff_date.isoformat()
    )
    collection_window_covered = stop_reason != "hard_limit" or (
        oldest_recent_post_date is not None and oldest_recent_post_date <= collection_cutoff_date.isoformat()
    )

    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "date": snapshot_date,
        "run_started_at": run_started_at,
        "account": username,
        "profile_url": f"https://www.instagram.com/{username}/",
        "avatar_path": avatar_path,
        "profile_pic_url": str(getattr(profile, "profile_pic_url", "") or ""),
        "full_name": profile.full_name,
        "biography": profile.biography,
        "external_url": profile.external_url,
        "is_verified": bool(profile.is_verified),
        "followers": followers,
        "following": profile.followees,
        "posts": profile.mediacount,
        "recent_post_count": post_count,
        "video_post_count": video_count,
        "video_posts_with_view_data": videos_with_view_data_count,
        "video_posts_with_view_data_recent_window": videos_with_view_data_count,
        "reel_view_enriched_posts": enriched_view_posts,
        "recent_posts_window_days": post_window_days,
        "recent_posts_collection_window_days": collection_window_days,
        "recent_posts_target_limit": post_limit,
        "recent_posts_hard_limit": post_hard_limit,
        "recent_posts_collection_stop_reason": stop_reason,
        "recent_posts_window_covered": display_window_covered,
        "recent_posts_collection_window_covered": collection_window_covered,
        "oldest_recent_post_date": oldest_recent_post_date,
        "avg_likes": avg_likes,
        "avg_comments": avg_comments,
        "avg_video_views": avg_video_views,
        "avg_video_views_per_video": avg_video_views,
        "avg_video_views_per_post": avg_video_views_per_post,
        "total_likes_recent_window": total_likes_recent_window,
        "total_video_views_recent_window": views_total,
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
    AVATARS_DIR.mkdir(parents=True, exist_ok=True)
    snapshot_date = dt.date.today().isoformat()
    run_started_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()

    accounts = load_accounts()
    if not accounts:
        print("No accounts configured in collector/accounts.json")
        return 0

    loader = build_loader()
    authenticate_loader(loader)
    reel_view_scraper = build_reel_view_scraper()
    failures = []
    collected = 0

    try:
        for username in accounts:
            print(f"Collecting {username}...")
            try:
                reel_view_lookup = build_reel_view_lookup(
                    reel_view_scraper,
                    username=username,
                    max_reels=get_post_hard_limit(get_post_limit()),
                )
                payload = collect_account(
                    loader,
                    username,
                    snapshot_date,
                    run_started_at,
                    reel_view_lookup=reel_view_lookup,
                )
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
    finally:
        if reel_view_scraper is not None:
            try:
                reel_view_scraper.close()
            except Exception:
                pass

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
