from __future__ import annotations

import argparse
import sys
from pathlib import Path

import instaloader

from pipeline_utils import (
    PARTICIPANTS_DIR,
    build_instaloader,
    ensure_project_directories,
    iter_unique_preserving_order,
    login_if_available,
    normalize_username,
    write_usernames,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract unique usernames from an Instagram post comment thread."
    )
    parser.add_argument("shortcode", help="Instagram post shortcode, for example Cx4Ab12X")
    parser.add_argument(
        "--output",
        type=Path,
        default=PARTICIPANTS_DIR / "players.txt",
        help="Destination text file for usernames.",
    )
    parser.add_argument(
        "--include-post-owner",
        action="store_true",
        help="Include comments written by the post owner.",
    )
    parser.add_argument(
        "--contains",
        help="Only include comments whose text contains this value, case-insensitive.",
    )
    return parser.parse_args()


def collect_comment_usernames(
    post: instaloader.Post,
    include_post_owner: bool = False,
    text_filter: str | None = None,
) -> list[str]:
    owner_username = normalize_username(post.owner_username)
    usernames: list[str] = []
    normalized_filter = text_filter.casefold() if text_filter else None

    for comment in post.get_comments():
        comment_text = (comment.text or "").casefold()
        include_comment = normalized_filter is None or normalized_filter in comment_text
        comment_owner = normalize_username(comment.owner.username)
        if include_comment and (
            include_post_owner or comment_owner.casefold() != owner_username.casefold()
        ):
            usernames.append(comment_owner)

        for answer in getattr(comment, "answers", []) or []:
            answer_text = (answer.text or "").casefold()
            include_answer = normalized_filter is None or normalized_filter in answer_text
            answer_owner = normalize_username(answer.owner.username)
            if include_answer and (
                include_post_owner or answer_owner.casefold() != owner_username.casefold()
            ):
                usernames.append(answer_owner)

    return iter_unique_preserving_order(usernames)


def main() -> int:
    args = parse_args()
    ensure_project_directories()

    loader = build_instaloader()

    try:
        login_if_available(loader)
        post = instaloader.Post.from_shortcode(loader.context, args.shortcode)
        usernames = collect_comment_usernames(
            post,
            include_post_owner=args.include_post_owner,
            text_filter=args.contains,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"Failed to extract participants: {exc}", file=sys.stderr)
        return 1

    if not usernames:
        print("No participants found in the comment thread.", file=sys.stderr)
        return 1

    write_usernames(args.output, usernames)
    print(f"Saved {len(usernames)} unique participants to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
