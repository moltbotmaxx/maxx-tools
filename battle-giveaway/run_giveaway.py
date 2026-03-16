from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

from pipeline_utils import OUTPUT_DIR, PARTICIPANTS_DIR, ROOT_DIR, ensure_project_directories


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the full Instagram giveaway battle royale pipeline."
    )
    parser.add_argument(
        "shortcode",
        nargs="?",
        help="Instagram post shortcode. Required unless --skip-extract is used.",
    )
    parser.add_argument(
        "--skip-extract",
        action="store_true",
        help="Use an existing participants file instead of reading Instagram comments.",
    )
    parser.add_argument(
        "--players-file",
        type=Path,
        default=PARTICIPANTS_DIR / "players.txt",
        help="Participants file used by the downstream steps.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_DIR / "battle.mp4",
        help="Final MP4 output path.",
    )
    parser.add_argument("--width", type=int, default=1080, help="Video width.")
    parser.add_argument("--height", type=int, default=1920, help="Video height.")
    parser.add_argument("--fps", type=int, default=30, help="Video frame rate.")
    parser.add_argument(
        "--seed",
        default="giveaway-battle",
        help="Seed used to make the simulation layout reproducible.",
    )
    parser.add_argument(
        "--fail-on-missing-avatars",
        action="store_true",
        help="Stop instead of generating placeholder avatars.",
    )
    parser.add_argument(
        "--contains",
        help="Only include comments whose text contains this value, case-insensitive.",
    )
    parser.add_argument(
        "--extractor",
        choices=("instaloader", "browser"),
        default="instaloader",
        help="Comment extractor implementation to use.",
    )
    parser.add_argument(
        "--keep-frames",
        action="store_true",
        help="Keep the temporary PNG frames generated during video recording.",
    )
    return parser.parse_args()


def run_step(command: list[str], env: dict[str, str]) -> None:
    printable = " ".join(command)
    print(f"$ {printable}", flush=True)
    subprocess.run(command, cwd=ROOT_DIR, env=env, check=True)


def main() -> int:
    args = parse_args()
    ensure_project_directories()

    if not args.skip_extract and not args.shortcode:
        print("shortcode is required unless --skip-extract is used.", file=sys.stderr)
        return 1

    if args.skip_extract and not args.players_file.exists():
        print(f"Participants file not found: {args.players_file}", file=sys.stderr)
        return 1

    env = os.environ.copy()
    python_bin = sys.executable

    try:
        if not args.skip_extract:
            if args.extractor == "browser":
                run_step(
                    [
                        "node",
                        "extract_participants_browser.js",
                        args.shortcode,
                        "--output",
                        str(args.players_file),
                        *(["--contains", args.contains] if args.contains else []),
                    ],
                    env,
                )
            else:
                run_step(
                    [
                        python_bin,
                        "extract_participants.py",
                        args.shortcode,
                        "--output",
                        str(args.players_file),
                        *(["--contains", args.contains] if args.contains else []),
                    ],
                    env,
                )

        avatar_command = [
            python_bin,
            "download_avatars.py",
            "--input",
            str(args.players_file),
        ]
        if args.fail_on_missing_avatars:
            avatar_command.append("--fail-on-missing")
        run_step(avatar_command, env)

        run_step(
            [
                python_bin,
                "generate_players_json.py",
                "--input",
                str(args.players_file),
            ],
            env,
        )

        record_command = [
            "node",
            "record.js",
            f"--output={args.output}",
            f"--width={args.width}",
            f"--height={args.height}",
            f"--fps={args.fps}",
            f"--seed={args.seed}",
        ]
        if args.keep_frames:
            record_command.append("--keep-frames")
        run_step(record_command, env)
    except subprocess.CalledProcessError as exc:
        print(f"Pipeline failed with exit code {exc.returncode}.", file=sys.stderr)
        return exc.returncode

    print(f"Giveaway video ready at {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
