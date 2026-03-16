from __future__ import annotations

import argparse

from instaloader.exceptions import InstaloaderException
from instagram_auth import (
    build_loader,
    import_session_from_browser,
    supported_browser_names,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import Instagram cookies from a browser and persist them as an Instaloader session."
    )
    parser.add_argument(
        "--browser",
        help=f"Browser to read cookies from. Supported: {', '.join(supported_browser_names())}.",
    )
    parser.add_argument(
        "--cookie-file",
        help="Optional browser cookie database path. Useful for copied Firefox/Chromium cookie stores.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    loader = build_loader()

    try:
        username, session_file = import_session_from_browser(
            loader,
            browser=args.browser,
            cookie_file=args.cookie_file,
        )
    except (InstaloaderException, RuntimeError, ValueError) as exc:
        print(f"Failed to import browser cookies: {exc}")
        return 1

    print(f"Browser session ready for @{username}: {session_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

