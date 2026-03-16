from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from pipeline_utils import (
    AVATARS_DIR,
    BATTLE_DIR,
    PARTICIPANTS_DIR,
    color_pair_for_username,
    create_placeholder_avatar,
    ensure_project_directories,
    filename_for_index,
    read_usernames,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate battle/players.json from usernames and local avatar files."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=PARTICIPANTS_DIR / "players.txt",
        help="Text file with one username per line.",
    )
    parser.add_argument(
        "--avatars-dir",
        type=Path,
        default=AVATARS_DIR,
        help="Directory containing numbered avatar images.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=BATTLE_DIR / "players.json",
        help="Output JSON consumed by the battle scene.",
    )
    return parser.parse_args()


def relative_browser_path(from_path: Path, to_path: Path) -> str:
    relative = os.path.relpath(to_path, from_path.parent)
    return relative.replace(os.sep, "/")


def rgb_to_hex(color: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*color)


def main() -> int:
    args = parse_args()
    ensure_project_directories()

    usernames = read_usernames(args.input)
    players: list[dict[str, object]] = []

    for index, username in enumerate(usernames):
        avatar_path = args.avatars_dir / filename_for_index(index)
        if not avatar_path.exists():
            create_placeholder_avatar(username, avatar_path)

        primary, secondary = color_pair_for_username(username)
        players.append(
            {
                "id": index,
                "name": username,
                "avatar": relative_browser_path(args.output, avatar_path),
                "health": 3,
                "colors": {
                    "primary": rgb_to_hex(primary),
                    "secondary": rgb_to_hex(secondary),
                },
            }
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(players, indent=2), encoding="utf-8")
    print(f"Generated {args.output} for {len(players)} players.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
