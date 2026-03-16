# Social Dashboard

Static Instagram analytics dashboard backed by JSON datasets committed to the repository.

## Repository layout

```text
collector/   Python scripts that collect and aggregate public metrics
dashboard/   Static frontend served by GitHub Pages
data/        Generated datasets consumed by the dashboard
```

## Local setup

1. Create a virtual environment.
2. Install dependencies from `collector/requirements.txt`.
3. Add Instagram handles to `collector/accounts.json`.
4. Run:

```bash
python collector/collect.py
python collector/aggregate.py
```

5. Serve the repo root with a static server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/dashboard/`.

## Authenticated scraping

Public scraping works without credentials, but Instagram rate limits aggressively. The recommended flow is to create and reuse a persisted Instaloader session.

Start by creating a local env file:

```bash
cp .env.example .env
```

Then add:

```bash
export INSTAGRAM_USERNAME="your_username"
export INSTAGRAM_PASSWORD="your_password"
```

Create the persisted session once:

```bash
.venv/bin/python collector/create_session.py
```

This writes a local session file under `.instaloader/` and future collector runs will load it before attempting any password login.

If password login is being rate limited, import cookies from a browser session instead:

```bash
.venv/bin/python collector/import_browser_session.py --browser chrome
```

You can also point to a specific cookie database if needed:

```bash
.venv/bin/python collector/import_browser_session.py --browser firefox --cookie-file /path/to/cookies.sqlite
```

Supported browsers match Instaloader's official browser-cookie flow: Brave, Chrome, Chromium, Edge, Firefox, LibreWolf, Opera, Opera GX, Safari and Vivaldi.

If you prefer env files instead of shell exports, `.env` and `.env.local` in the repository root are supported:

```bash
INSTAGRAM_USERNAME="your_username"
INSTAGRAM_PASSWORD="your_password"
INSTALOADER_SESSION_FILE=".instaloader/session-your_username"
INSTALOADER_BROWSER="chrome"
INSTALOADER_COOKIE_FILE="/path/to/browser/cookies.sqlite"
```

## GitHub Actions

- `.github/workflows/collect.yml` refreshes datasets on a schedule and commits changes to `data/`.
- `.github/workflows/pages.yml` publishes a Pages artifact that contains both the dashboard and generated data.
- `collect.yml` can optionally restore a persisted Instaloader session from a Base64-encoded secret named `INSTALOADER_SESSION_FILE_B64`.

## Continue improving

The project continuation guide is in `docs/continuation.md`.
