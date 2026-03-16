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


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def load_account_payloads() -> list[dict[str, Any]]:
    accounts = []
    for path in sorted(DATA_DIR.glob("*.json")):
        if path.name in SKIP_FILES:
            continue

        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, dict) and payload.get("account"):
            accounts.append(payload)

    accounts.sort(key=lambda item: item.get("followers", 0), reverse=True)
    return accounts


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


def main() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)

    accounts = load_account_payloads()
    total_followers = sum(int(account.get("followers", 0)) for account in accounts)
    total_posts = sum(int(account.get("posts", 0)) for account in accounts)
    total_avg_likes = sum(float(account.get("avg_likes", 0)) for account in accounts)
    total_avg_comments = sum(float(account.get("avg_comments", 0)) for account in accounts)
    avg_engagement_rate = round(((total_avg_likes + total_avg_comments) / total_followers) * 100, 4) if total_followers else 0

    global_data = {
        "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "date": dt.date.today().isoformat(),
        "total_accounts": len(accounts),
        "total_followers": total_followers,
        "total_posts": total_posts,
        "avg_engagement_rate": avg_engagement_rate,
        "accounts": accounts,
    }
    write_json(GLOBAL_DATA_PATH, global_data)

    update_history(
        GLOBAL_HISTORY_PATH,
        {
            "date": global_data["date"],
            "total_accounts": global_data["total_accounts"],
            "total_followers": global_data["total_followers"],
            "avg_engagement_rate": global_data["avg_engagement_rate"],
        },
    )

    print(f"Aggregated {len(accounts)} account dataset(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

