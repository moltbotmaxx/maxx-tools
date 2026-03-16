from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path

import instaloader
import requests
from PIL import Image, ImageOps

from pipeline_utils import (
    AVATARS_DIR,
    PARTICIPANTS_DIR,
    build_instaloader,
    create_placeholder_avatar,
    ensure_directory,
    ensure_project_directories,
    filename_for_index,
    login_if_available,
    read_usernames,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download Instagram profile images for the participant list."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=PARTICIPANTS_DIR / "players.txt",
        help="Text file with one username per line.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=AVATARS_DIR,
        help="Directory where avatars will be written.",
    )
    parser.add_argument(
        "--metadata",
        type=Path,
        default=PARTICIPANTS_DIR / "commenters.json",
        help="Optional metadata JSON from browser extraction with direct avatar URLs.",
    )
    parser.add_argument(
        "--size",
        type=int,
        default=512,
        help="Square output size for each avatar.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Redownload avatars that already exist on disk.",
    )
    parser.add_argument(
        "--fail-on-missing",
        action="store_true",
        help="Abort instead of generating a placeholder when an avatar cannot be fetched.",
    )
    return parser.parse_args()


def download_and_normalize_image(url: str, destination: Path, size: int) -> None:
    response = requests.get(url, timeout=30)
    response.raise_for_status()

    image = Image.open(io.BytesIO(response.content)).convert("RGB")
    square = ImageOps.fit(image, (size, size), method=Image.Resampling.LANCZOS)
    ensure_directory(destination.parent)
    square.save(destination, format="JPEG", quality=92)


def load_avatar_metadata(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    payload = json.loads(path.read_text(encoding="utf-8"))
    participants = payload.get("participants")
    if not isinstance(participants, list):
        return {}

    avatar_map: dict[str, str] = {}
    for participant in participants:
        if not isinstance(participant, dict):
            continue
        username = participant.get("username")
        avatar_url = participant.get("avatar_url")
        if not isinstance(username, str) or not isinstance(avatar_url, str) or not avatar_url:
            continue
        avatar_map[username.casefold()] = avatar_url
    return avatar_map


def main() -> int:
    args = parse_args()
    ensure_project_directories()
    ensure_directory(args.output_dir)

    usernames = read_usernames(args.input)
    avatar_metadata = load_avatar_metadata(args.metadata)
    loader = build_instaloader()
    login_error: Exception | None = None

    try:
        login_if_available(loader)
    except Exception as exc:  # noqa: BLE001
        login_error = exc

    downloaded = 0
    placeholders = 0

    for index, username in enumerate(usernames):
        destination = args.output_dir / filename_for_index(index)

        if destination.exists() and not args.overwrite:
            continue

        try:
            avatar_url = avatar_metadata.get(username.casefold())
            if avatar_url:
                download_and_normalize_image(avatar_url, destination, args.size)
                downloaded += 1
                continue

            profile_obj = instaloader.Profile.from_username(loader.context, username)
            download_and_normalize_image(str(profile_obj.profile_pic_url), destination, args.size)
            downloaded += 1
        except Exception as exc:  # noqa: BLE001
            if login_error is not None and not avatar_metadata:
                print(f"Instagram login failed: {login_error}", file=sys.stderr)
                return 1
            if args.fail_on_missing:
                print(f"Failed to download avatar for @{username}: {exc}", file=sys.stderr)
                return 1
            create_placeholder_avatar(username, destination, size=args.size)
            placeholders += 1

    print(
        f"Processed {len(usernames)} avatars in {args.output_dir} "
        f"({downloaded} downloaded, {placeholders} placeholders)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
