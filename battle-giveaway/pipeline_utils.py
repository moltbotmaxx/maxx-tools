from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Iterable, Sequence

import instaloader
from PIL import Image, ImageDraw, ImageFont


ROOT_DIR = Path(__file__).resolve().parent
PARTICIPANTS_DIR = ROOT_DIR / "participants"
AVATARS_DIR = ROOT_DIR / "avatars"
BATTLE_DIR = ROOT_DIR / "battle"
OUTPUT_DIR = ROOT_DIR / "output"
TEMP_DIR = ROOT_DIR / "temp"


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def ensure_project_directories() -> None:
    for path in (PARTICIPANTS_DIR, AVATARS_DIR, BATTLE_DIR, OUTPUT_DIR, TEMP_DIR):
        ensure_directory(path)


def normalize_username(username: str) -> str:
    return username.strip().lstrip("@")


def read_usernames(path: Path) -> list[str]:
    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {path}")

    usernames: list[str] = []
    seen: set[str] = set()

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        username = normalize_username(raw_line)
        if not username:
            continue
        lowered = username.casefold()
        if lowered in seen:
            continue
        seen.add(lowered)
        usernames.append(username)

    return usernames


def write_usernames(path: Path, usernames: Sequence[str]) -> None:
    ensure_directory(path.parent)
    content = "\n".join(usernames)
    if content:
        content += "\n"
    path.write_text(content, encoding="utf-8")


def build_instaloader() -> instaloader.Instaloader:
    loader = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        compress_json=False,
        quiet=True,
    )
    loader.context.max_connection_attempts = 1
    return loader


def login_if_available(loader: instaloader.Instaloader) -> None:
    username = os.getenv("IG_USERNAME")
    password = os.getenv("IG_PASSWORD")
    session_file = os.getenv("IG_SESSIONFILE") or os.getenv("INSTALOADER_SESSIONFILE")

    if session_file:
        if not username:
            raise RuntimeError(
                "IG_USERNAME is required when using IG_SESSIONFILE or INSTALOADER_SESSIONFILE."
            )
        loader.load_session_from_file(username, session_file)
        return

    if username and password:
        loader.login(username, password)


def filename_for_index(index: int, extension: str = ".jpg") -> str:
    return f"{index:04d}{extension}"


def color_pair_for_username(username: str) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    digest = hashlib.sha256(username.encode("utf-8")).hexdigest()
    primary = tuple(int(digest[offset : offset + 2], 16) for offset in (0, 2, 4))
    secondary = tuple(int(digest[offset : offset + 2], 16) for offset in (6, 8, 10))
    return primary, secondary


def create_placeholder_avatar(username: str, destination: Path, size: int = 512) -> None:
    ensure_directory(destination.parent)

    primary, secondary = color_pair_for_username(username)
    image = Image.new("RGB", (size, size), primary)
    draw = ImageDraw.Draw(image)

    stripe_height = max(32, size // 5)
    for index in range(0, size, stripe_height):
        blend = index / max(1, size - 1)
        color = tuple(int(primary[channel] * (1 - blend) + secondary[channel] * blend) for channel in range(3))
        draw.rectangle((0, index, size, min(size, index + stripe_height)), fill=color)

    initials = "".join(part[0].upper() for part in username.split("_") if part)[:2] or "IG"
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", size=max(72, size // 3))
    except OSError:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), initials, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    text_position = ((size - text_width) / 2, (size - text_height) / 2 - size * 0.04)

    shadow_offset = max(3, size // 80)
    draw.text(
        (text_position[0] + shadow_offset, text_position[1] + shadow_offset),
        initials,
        font=font,
        fill=(0, 0, 0),
    )
    draw.text(text_position, initials, font=font, fill=(255, 255, 255))

    image.save(destination, format="JPEG", quality=92)


def iter_unique_preserving_order(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = value.casefold()
        if normalized in seen:
            continue
        seen.add(normalized)
        result.append(value)
    return result
