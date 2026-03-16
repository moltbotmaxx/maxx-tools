from __future__ import annotations

from instaloader.exceptions import InstaloaderException
from instagram_auth import (
    build_loader,
    get_instagram_username,
    login_and_persist_session,
    resolve_session_file,
)


def main() -> int:
    username = get_instagram_username()
    if not username:
        print("INSTAGRAM_USERNAME is required in .env or the shell environment.")
        return 1

    session_file = resolve_session_file(username)
    if session_file and session_file.exists():
        print(f"Refreshing existing session file at {session_file}")
    else:
        print(f"Creating persisted session file at {session_file}")

    loader = build_loader()
    try:
        logged_in_as, saved_session_file = login_and_persist_session(loader, interactive=True)
    except (InstaloaderException, ValueError) as exc:
        print(f"Failed to create persisted session: {exc}")
        return 1

    print(f"Session ready for @{logged_in_as}: {saved_session_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

