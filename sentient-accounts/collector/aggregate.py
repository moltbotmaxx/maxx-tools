from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"
HISTORY_DIR = DATA_DIR / "history"
GLOBAL_DATA_PATH = DATA_DIR / "global.json"
GLOBAL_HISTORY_PATH = HISTORY_DIR / "global.json"
SKIP_FILES = {"global.json", "errors.json"}
HIDDEN_LIKES_SENTINEL = 3


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

    latest_marker = max(record["snapshot_marker"] for record in records)
    current_records = [record for record in records if record["snapshot_marker"] == latest_marker]
    stale_records = [record for record in records if record["snapshot_marker"] != latest_marker]
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
    accounts = [record["payload"] for record in current_records]
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
