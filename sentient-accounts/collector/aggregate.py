from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"
HISTORY_DIR = DATA_DIR / "history"
GLOBAL_DATA_PATH = DATA_DIR / "global.json"
GLOBAL_HISTORY_PATH = HISTORY_DIR / "global.json"
TRACKED_ACCOUNTS_PATH = BASE_DIR / "accounts.json"
MANUAL_METRICS_PATH = BASE_DIR / "manual_account_metrics.json"
SKIP_FILES = {"global.json", "errors.json"}
HIDDEN_LIKES_SENTINEL = 3
DEFAULT_RECENT_POSTS_WINDOW_DAYS = 14
DEFAULT_COLLECTION_WINDOW_DAYS = 30


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def extract_snapshot_date(payload: dict[str, Any]) -> str | None:
    raw_date = payload.get("date")
    if isinstance(raw_date, str):
        try:
            return dt.date.fromisoformat(raw_date).isoformat()
        except ValueError:
            pass

    raw_generated_at = payload.get("generated_at")
    if isinstance(raw_generated_at, str):
        try:
            return dt.datetime.fromisoformat(raw_generated_at).date().isoformat()
        except ValueError:
            return None
    return None


def extract_snapshot_marker(payload: dict[str, Any]) -> str | None:
    raw_run_started_at = payload.get("run_started_at")
    if isinstance(raw_run_started_at, str):
        try:
            marker = dt.datetime.fromisoformat(raw_run_started_at)
        except ValueError:
            marker = None
        if marker is not None:
            if marker.tzinfo is None:
                marker = marker.replace(tzinfo=dt.timezone.utc)
            else:
                marker = marker.astimezone(dt.timezone.utc)
            return marker.replace(microsecond=0).isoformat()

    snapshot_date = extract_snapshot_date(payload)
    if snapshot_date is None:
        return None
    return dt.datetime.fromisoformat(f"{snapshot_date}T00:00:00+00:00").isoformat()


def load_tracked_accounts() -> list[str]:
    try:
        payload = json.loads(TRACKED_ACCOUNTS_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return []

    if not isinstance(payload, list):
        return []

    return [
        account.strip()
        for account in payload
        if isinstance(account, str) and account.strip()
    ]


def load_manual_metrics() -> dict[str, dict[str, Any]]:
    try:
        payload = json.loads(MANUAL_METRICS_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

    if not isinstance(payload, dict):
        return {}

    raw_accounts = payload.get("accounts")
    if not isinstance(raw_accounts, dict):
        return {}

    default_window_days = payload.get("view_window_days")
    default_updated_at = payload.get("updated_at")
    default_note = payload.get("note")
    normalized: dict[str, dict[str, Any]] = {}

    for account, metrics in raw_accounts.items():
        if not isinstance(account, str) or not account.strip() or not isinstance(metrics, dict):
            continue

        manual_total = metrics.get("manual_total_video_views_recent_window")
        if not isinstance(manual_total, (int, float)) or manual_total < 0:
            continue

        normalized_metrics = dict(metrics)
        normalized_metrics["manual_total_video_views_recent_window"] = int(manual_total)

        window_days = normalized_metrics.get("view_window_days", default_window_days)
        if isinstance(window_days, (int, float)) and window_days > 0:
            normalized_metrics["view_window_days"] = int(window_days)
        else:
            normalized_metrics["view_window_days"] = DEFAULT_COLLECTION_WINDOW_DAYS

        if "updated_at" not in normalized_metrics and isinstance(default_updated_at, str) and default_updated_at.strip():
            normalized_metrics["updated_at"] = default_updated_at.strip()

        if "note" not in normalized_metrics and isinstance(default_note, str) and default_note.strip():
            normalized_metrics["note"] = default_note.strip()

        normalized[account.strip()] = normalized_metrics

    return normalized


def build_profile_url(account: str) -> str:
    return f"https://www.instagram.com/{account}/"


def prettify_account_label(account: str) -> str:
    cleaned = re.sub(r"[._]+", " ", account).strip()
    return cleaned or account


def build_placeholder_payload(
    account: str,
    snapshot_date: str,
    generated_at: str,
    run_started_at: str | None,
) -> dict[str, Any]:
    return {
        "generated_at": generated_at,
        "date": snapshot_date,
        "run_started_at": run_started_at,
        "account": account,
        "profile_url": build_profile_url(account),
        "full_name": prettify_account_label(account),
        "biography": "",
        "external_url": "",
        "is_verified": False,
        "followers": 0,
        "following": 0,
        "posts": 0,
        "recent_post_count": 0,
        "video_post_count": 0,
        "video_posts_with_view_data": 0,
        "video_posts_with_view_data_recent_window": 0,
        "reel_view_enriched_posts": 0,
        "recent_posts_window_days": DEFAULT_RECENT_POSTS_WINDOW_DAYS,
        "recent_posts_collection_window_days": DEFAULT_COLLECTION_WINDOW_DAYS,
        "recent_posts_target_limit": 24,
        "recent_posts_hard_limit": 0,
        "recent_posts_collection_stop_reason": "manual_placeholder",
        "recent_posts_window_covered": True,
        "recent_posts_collection_window_covered": True,
        "avg_likes": 0,
        "avg_comments": 0,
        "avg_video_views": 0,
        "avg_video_views_per_video": 0,
        "avg_video_views_per_post": 0,
        "total_likes_recent_window": 0,
        "total_video_views_recent_window": 0,
        "engagement_rate": 0,
        "recent_posts": [],
        "data_status": "placeholder_pending_collection",
    }


def apply_manual_metrics(account_payload: dict[str, Any], manual_metrics: dict[str, dict[str, Any]]) -> dict[str, Any]:
    account_name = account_payload.get("account")
    if not isinstance(account_name, str):
        return account_payload

    metrics = manual_metrics.get(account_name)
    if not metrics:
        return account_payload

    merged = dict(account_payload)
    collector_total = merged.get("total_video_views_recent_window")
    if isinstance(collector_total, (int, float)):
        merged["collector_total_video_views_recent_window"] = int(collector_total)

    manual_total = int(metrics["manual_total_video_views_recent_window"])
    merged["manual_total_video_views_recent_window"] = manual_total
    merged["total_video_views_recent_window"] = manual_total
    merged["video_views_recent_window_source"] = "manual_override"
    merged["video_views_recent_window_days"] = int(metrics.get("view_window_days") or DEFAULT_COLLECTION_WINDOW_DAYS)

    updated_at = metrics.get("updated_at")
    if isinstance(updated_at, str) and updated_at.strip():
        merged["manual_metrics_updated_at"] = updated_at.strip()

    note = metrics.get("note")
    if isinstance(note, str) and note.strip():
        merged["manual_metrics_note"] = note.strip()

    return merged


def load_account_records() -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    records = []
    load_failures = []
    for path in sorted(DATA_DIR.glob("*.json")):
        if path.name in SKIP_FILES:
            continue

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            load_failures.append(
                {
                    "file": path.name,
                    "error_type": type(exc).__name__,
                    "error": str(exc),
                }
            )
            continue

        account_name = payload.get("account") if isinstance(payload, dict) else None
        if not isinstance(payload, dict) or not isinstance(account_name, str) or not account_name.strip():
            load_failures.append(
                {
                    "file": path.name,
                    "error_type": "InvalidPayload",
                    "error": "Account payload must be a JSON object with a non-empty 'account'.",
                }
            )
            continue

        snapshot_date = extract_snapshot_date(payload)
        snapshot_marker = extract_snapshot_marker(payload)
        if snapshot_date is None or snapshot_marker is None:
            load_failures.append(
                {
                    "file": path.name,
                    "account": account_name.strip(),
                    "error_type": "InvalidSnapshotMetadata",
                    "error": "Payload is missing a valid 'date', 'generated_at', or 'run_started_at'.",
                }
            )
            continue

        records.append(
            {
                "file": path.name,
                "account": account_name.strip(),
                "snapshot_date": snapshot_date,
                "snapshot_marker": snapshot_marker,
                "payload": payload,
            }
        )

    return records, load_failures


def split_current_snapshot(
    records: list[dict[str, Any]],
) -> tuple[str, list[dict[str, Any]], list[dict[str, str]]]:
    if not records:
        return dt.date.today().isoformat(), [], []

    latest_date = max(record["snapshot_date"] for record in records)
    # Among records on the latest date, keep the most recent snapshot per account.
    latest_date_records: dict[str, dict[str, Any]] = {}
    for record in records:
        if record["snapshot_date"] != latest_date:
            continue
        account = record["account"]
        existing = latest_date_records.get(account)
        if existing is None or record["snapshot_marker"] > existing["snapshot_marker"]:
            latest_date_records[account] = record
    current_records = list(latest_date_records.values())
    stale_records = [record for record in records if record["snapshot_date"] != latest_date]
    current_records.sort(
        key=lambda item: int(item["payload"].get("followers", 0) or 0),
        reverse=True,
    )
    stale_accounts = [
        {
            "account": record["account"],
            "file": record["file"],
            "date": record["snapshot_date"],
        }
        for record in sorted(stale_records, key=lambda item: (item["snapshot_date"], item["account"]))
    ]
    return current_records[0]["snapshot_date"], current_records, stale_accounts


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

    snapshots_by_date = {
        item["date"]: item
        for item in history
        if isinstance(item, dict) and isinstance(item.get("date"), str)
    }
    snapshots_by_date[snapshot["date"]] = snapshot
    write_json(history_path, [snapshots_by_date[date] for date in sorted(snapshots_by_date)])


def resolve_collection_window_days(account: dict[str, Any]) -> int:
    for key in ("recent_posts_collection_window_days", "recent_posts_window_days"):
        raw_value = account.get(key)
        if isinstance(raw_value, (int, float)) and raw_value > 0:
            return int(raw_value)
    return 30


def extract_recent_posts(account: dict[str, Any]) -> list[dict[str, Any]]:
    posts = account.get("recent_posts")
    return posts if isinstance(posts, list) else []


def parse_snapshot_date(account: dict[str, Any]) -> dt.date | None:
    for key in ("date", "snapshot_date"):
        value = account.get(key)
        if isinstance(value, str):
            try:
                return dt.date.fromisoformat(value)
            except ValueError:
                continue
    return None


def is_post_within_window(post: dict[str, Any], snapshot_date: dt.date | None, window_days: int) -> bool:
    if snapshot_date is None or window_days < 0:
        return False

    raw_date = post.get("date")
    if not isinstance(raw_date, str):
        return False

    try:
        post_date = dt.date.fromisoformat(raw_date)
    except ValueError:
        return False

    age_in_days = (snapshot_date - post_date).days
    return 0 <= age_in_days <= window_days


def effective_like_count(post: dict[str, Any]) -> int:
    likes = int(post.get("likes") or 0)
    return 0 if likes == HIDDEN_LIKES_SENTINEL else likes


def resolve_recent_window_posts(account: dict[str, Any]) -> list[dict[str, Any]]:
    snapshot_date = parse_snapshot_date(account)
    window_days = resolve_collection_window_days(account)
    return [
        post
        for post in extract_recent_posts(account)
        if isinstance(post, dict) and is_post_within_window(post, snapshot_date, window_days)
    ]


def total_likes_recent_window(account: dict[str, Any]) -> int:
    explicit_total = account.get("total_likes_recent_window")
    if isinstance(explicit_total, (int, float)) and explicit_total > 0:
        return int(explicit_total)
    return sum(effective_like_count(post) for post in resolve_recent_window_posts(account))


def total_video_views_recent_window(account: dict[str, Any]) -> int:
    manual_total = account.get("manual_total_video_views_recent_window")
    if isinstance(manual_total, (int, float)) and manual_total >= 0:
        return int(manual_total)

    explicit_total = account.get("total_video_views_recent_window")
    if isinstance(explicit_total, (int, float)) and explicit_total > 0:
        return int(explicit_total)
    return sum(
        int(post.get("video_views") or 0)
        for post in resolve_recent_window_posts(account)
        if post.get("is_video")
    )


def main() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)

    records, load_failures = load_account_records()
    snapshot_date, current_records, stale_accounts = split_current_snapshot(records)
    tracked_accounts = load_tracked_accounts()
    manual_metrics = load_manual_metrics()

    generated_at = (
        current_records[0]["payload"].get("generated_at")
        if current_records
        else dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    )
    run_started_at = current_records[0]["payload"].get("run_started_at") if current_records else None

    current_payloads = {
        record["account"]: dict(record["payload"])
        for record in current_records
    }

    account_names: list[str] = []
    for source in (tracked_accounts, sorted(current_payloads), sorted(manual_metrics)):
        for account in source:
            if account not in account_names:
                account_names.append(account)

    accounts = []
    for account_name in account_names:
        payload = current_payloads.get(account_name)
        if payload is None:
            payload = build_placeholder_payload(account_name, snapshot_date, generated_at, run_started_at)
        accounts.append(apply_manual_metrics(payload, manual_metrics))

    accounts.sort(key=lambda item: int(item.get("followers", 0) or 0), reverse=True)
    total_followers = sum(int(account.get("followers", 0)) for account in accounts)
    total_posts = sum(int(account.get("posts", 0)) for account in accounts)
    total_avg_likes = sum(float(account.get("avg_likes", 0)) for account in accounts)
    total_avg_comments = sum(float(account.get("avg_comments", 0)) for account in accounts)
    total_likes_30d = sum(total_likes_recent_window(account) for account in accounts)
    total_video_views_30d = sum(total_video_views_recent_window(account) for account in accounts)
    recent_window_days = max((resolve_collection_window_days(account) for account in accounts), default=30)
    recent_window_covered = all(account.get("recent_posts_collection_window_covered") is not False for account in accounts)
    avg_engagement_rate = round(((total_avg_likes + total_avg_comments) / total_followers) * 100, 4) if total_followers else 0

    global_data = {
        "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "date": snapshot_date,
        "snapshot_date": snapshot_date,
        "run_started_at": current_records[0]["payload"].get("run_started_at") if current_records else None,
        "total_accounts": len(accounts),
        "total_followers": total_followers,
        "total_posts": total_posts,
        "recent_window_days": recent_window_days,
        "recent_window_covered": recent_window_covered,
        "total_likes_recent_window": total_likes_30d,
        "total_video_views_recent_window": total_video_views_30d,
        "avg_engagement_rate": avg_engagement_rate,
        "stale_accounts_excluded": stale_accounts,
        "load_failures": load_failures,
        "accounts": accounts,
    }
    write_json(GLOBAL_DATA_PATH, global_data)

    update_history(
        GLOBAL_HISTORY_PATH,
        {
            "date": global_data["date"],
            "total_accounts": global_data["total_accounts"],
            "total_followers": global_data["total_followers"],
            "recent_window_days": global_data["recent_window_days"],
            "total_likes_recent_window": global_data["total_likes_recent_window"],
            "total_video_views_recent_window": global_data["total_video_views_recent_window"],
            "avg_engagement_rate": global_data["avg_engagement_rate"],
        },
    )

    print(
        f"Aggregated {len(accounts)} account dataset(s) for snapshot {snapshot_date}."
    )
    if stale_accounts:
        print(f"Excluded {len(stale_accounts)} stale account dataset(s).")
    if load_failures:
        print(f"Skipped {len(load_failures)} invalid account dataset(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
