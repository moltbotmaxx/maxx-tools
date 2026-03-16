# Giveaway Battle Royale

This project turns Instagram giveaway participants into a vertical battle royale video.

## What it does

1. Extracts unique commenters from an Instagram post.
2. Downloads each participant's profile picture.
3. Builds `battle/players.json` for the renderer.
4. Runs a Phaser + Matter physics battle in a 1080 x 1920 arena.
5. Records the battle with Puppeteer and encodes `output/battle.mp4`.

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm install
```

If Instagram requires authentication, set one of these:

```bash
export IG_USERNAME="your_username"
export IG_PASSWORD="your_password"
```

Or load a saved Instaloader session:

```bash
export IG_USERNAME="your_username"
export IG_SESSIONFILE="/absolute/path/to/sessionfile"
```

## Run the full pipeline

```bash
python3 run_giveaway.py POST_SHORTCODE
```

Example:

```bash
python3 run_giveaway.py Cx4Ab12X
```

The final video is written to `output/battle.mp4`.

## Run with an existing participants file

```bash
python3 run_giveaway.py --skip-extract --players-file participants/players.txt
```

## Preview the battle without recording

```bash
npm run serve
```

Then open `http://127.0.0.1:3000/battle/index.html`.

## Notes

- Missing or inaccessible Instagram avatars fall back to generated placeholder images by default.
- Recording uses screenshot capture plus `ffmpeg-static`, so it prioritizes portability over speed.
- Temporary PNG frames are stored under `temp/` during recording and deleted afterwards unless `--keep-frames` is used.
- For a practical handoff on how to continue this project later, see `CONTINUATION.md`.
