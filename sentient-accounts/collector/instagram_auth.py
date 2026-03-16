from __future__ import annotations

import os
from pathlib import Path
from typing import Callable

import instaloader
from instaloader.exceptions import InstaloaderException
try:
    import browser_cookie3
except ImportError:
    browser_cookie3 = None

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent
SESSION_DIR = REPO_ROOT / ".instaloader"


def load_local_env() -> None:
    env_paths = [
        REPO_ROOT / ".env",
        REPO_ROOT / ".env.local",
        BASE_DIR / ".env",
    ]

    for env_path in env_paths:
        if not env_path.exists():
            continue

        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[7:].strip()
            if "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("'").strip('"')
            if key and key not in os.environ:
                os.environ[key] = value


def build_loader() -> instaloader.Instaloader:
    return instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        compress_json=False,
        post_metadata_txt_pattern="",
        storyitem_metadata_txt_pattern="",
        quiet=False,
    )


def get_instagram_username() -> str:
    load_local_env()
    return os.getenv("INSTAGRAM_USERNAME", "").strip()


def get_instagram_password() -> str:
    load_local_env()
    return os.getenv("INSTAGRAM_PASSWORD", "").strip()


def get_instaloader_browser() -> str:
    load_local_env()
    return os.getenv("INSTALOADER_BROWSER", "").strip().lower().replace("-", "_")


def resolve_cookie_file_path(cookie_file: str | None = None) -> str:
    load_local_env()
    value = (cookie_file or os.getenv("INSTALOADER_COOKIE_FILE", "")).strip()
    if not value:
        return ""

    path = Path(value).expanduser()
    if not path.is_absolute():
        path = REPO_ROOT / path
    return str(path)


def supported_browser_cookie_loaders() -> dict[str, Callable[..., object]]:
    if browser_cookie3 is None:
        raise RuntimeError(
            "browser-cookie3 is required to import cookies from a browser. "
            "Install collector/requirements.txt in your virtual environment."
        )

    return {
        "brave": browser_cookie3.brave,
        "chrome": browser_cookie3.chrome,
        "chromium": browser_cookie3.chromium,
        "edge": browser_cookie3.edge,
        "firefox": browser_cookie3.firefox,
        "librewolf": browser_cookie3.librewolf,
        "opera": browser_cookie3.opera,
        "opera_gx": browser_cookie3.opera_gx,
        "safari": browser_cookie3.safari,
        "vivaldi": browser_cookie3.vivaldi,
    }


def supported_browser_names() -> list[str]:
    if browser_cookie3 is None:
        return [
            "brave",
            "chrome",
            "chromium",
            "edge",
            "firefox",
            "librewolf",
            "opera",
            "opera_gx",
            "safari",
            "vivaldi",
        ]
    return sorted(supported_browser_cookie_loaders())


def resolve_session_file(username: str | None = None) -> Path | None:
    load_local_env()
    explicit_path = os.getenv("INSTALOADER_SESSION_FILE", "").strip()
    if explicit_path:
        path = Path(explicit_path).expanduser()
        if not path.is_absolute():
            path = REPO_ROOT / path
        return path

    resolved_username = (username or get_instagram_username()).strip()
    if not resolved_username:
        return None

    return SESSION_DIR / f"session-{resolved_username}"


def load_persisted_session(
    loader: instaloader.Instaloader, username: str | None = None
) -> tuple[str | None, Path | None]:
    resolved_username = (username or get_instagram_username()).strip()
    session_file = resolve_session_file(resolved_username)
    if not resolved_username or session_file is None or not session_file.exists():
        return None, session_file

    loader.load_session_from_file(resolved_username, str(session_file))
    try:
        logged_in_as = loader.test_login()
    except InstaloaderException as exc:
        print(
            f"Loaded session file from {session_file}, but Instagram blocked immediate "
            f"verification: {exc}. Continuing with the persisted session."
        )
        return resolved_username, session_file

    if logged_in_as:
        print(f"Loaded persisted Instaloader session for @{logged_in_as} from {session_file}")
        return logged_in_as, session_file

    print(
        f"Loaded session file from {session_file}, but test_login() returned no username. "
        "Continuing with the persisted session."
    )
    return resolved_username, session_file


def login_and_persist_session(
    loader: instaloader.Instaloader, interactive: bool = False
) -> tuple[str, Path]:
    username = get_instagram_username()
    if not username:
        raise ValueError("INSTAGRAM_USERNAME is required to create a persisted session.")

    session_file = resolve_session_file(username)
    if session_file is None:
        raise ValueError("Could not resolve a session file path.")

    password = get_instagram_password()
    if password:
        print(f"Logging into Instagram as @{username} to refresh the session file...")
        loader.login(username, password)
    elif interactive:
        print(f"Starting interactive Instaloader login for @{username}...")
        loader.interactive_login(username)
    else:
        raise ValueError(
            "INSTAGRAM_PASSWORD is required unless interactive login is explicitly enabled."
        )

    session_file.parent.mkdir(parents=True, exist_ok=True)
    loader.save_session_to_file(str(session_file))
    try:
        logged_in_as = loader.test_login()
    except InstaloaderException as exc:
        print(
            f"Saved session to {session_file}, but Instagram blocked immediate verification: "
            f"{exc}. Continuing with the persisted session."
        )
        return username, session_file

    if logged_in_as:
        print(f"Saved persisted Instaloader session for @{logged_in_as} to {session_file}")
        return logged_in_as, session_file

    print(
        f"Saved session to {session_file}, but test_login() returned no username. "
        "Continuing with the persisted session."
    )
    return username, session_file


def import_session_from_browser(
    loader: instaloader.Instaloader,
    browser: str | None = None,
    cookie_file: str | None = None,
) -> tuple[str, Path]:
    normalized_browser = (browser or get_instaloader_browser()).strip().lower().replace("-", "_")
    if not normalized_browser:
        raise ValueError(
            "A browser is required. Pass --browser or set INSTALOADER_BROWSER in .env."
        )

    browser_loaders = supported_browser_cookie_loaders()
    if normalized_browser not in browser_loaders:
        raise ValueError(
            f"Unsupported browser '{normalized_browser}'. "
            f"Supported browsers: {', '.join(supported_browser_names())}."
        )

    resolved_cookie_file = resolve_cookie_file_path(cookie_file)
    browser_cookies = list(browser_loaders[normalized_browser](cookie_file=resolved_cookie_file))

    cookies = {}
    for cookie in browser_cookies:
        if "instagram" in cookie.domain:
            cookies[cookie.name] = cookie.value

    if not cookies:
        raise InstaloaderException(
            f"No Instagram cookies were found in {normalized_browser}. "
            "Make sure you are logged into instagram.com in that browser first."
        )

    loader.context.update_cookies(cookies)

    detected_username = loader.test_login()
    configured_username = get_instagram_username()
    resolved_username = detected_username or configured_username
    if not resolved_username:
        raise ValueError(
            "Could not determine the Instagram username from the imported cookies. "
            "Set INSTAGRAM_USERNAME in .env to choose the session filename."
        )

    if detected_username and configured_username and detected_username != configured_username:
        print(
            f"Imported cookies belong to @{detected_username}, "
            f"not @{configured_username}. Using @{detected_username}."
        )

    session_file = resolve_session_file(resolved_username)
    if session_file is None:
        raise ValueError("Could not resolve a session file path for the imported browser session.")

    loader.context.username = resolved_username
    session_file.parent.mkdir(parents=True, exist_ok=True)
    loader.save_session_to_file(str(session_file))

    source = f"{normalized_browser}"
    if resolved_cookie_file:
        source = f"{source} ({resolved_cookie_file})"
    print(f"Imported Instagram cookies from {source} into {session_file}")
    return resolved_username, session_file


def authenticate_loader(
    loader: instaloader.Instaloader, allow_password_fallback: bool = True
) -> str | None:
    username = get_instagram_username()
    session_file = resolve_session_file(username) if username else None

    if username and session_file and session_file.exists():
        try:
            logged_in_as, _ = load_persisted_session(loader, username)
            if logged_in_as:
                return logged_in_as
            print(
                f"Session file {session_file} was found but did not validate. "
                "Falling back to password login."
            )
        except (InstaloaderException, OSError, FileNotFoundError) as exc:
            print(f"Could not load persisted session from {session_file}: {exc}")

    if allow_password_fallback and username and get_instagram_password():
        logged_in_as, _ = login_and_persist_session(loader, interactive=False)
        return logged_in_as

    if username and session_file and not session_file.exists():
        print(
            f"No persisted Instaloader session found at {session_file}. "
            "Run collector/create_session.py once to create it."
        )

    return None
