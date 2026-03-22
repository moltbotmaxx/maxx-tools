# Social Dashboard

Static Instagram analytics dashboard backed by JSON datasets committed to the repository.

## Repository layout

```text
collector/   Python scripts that collect and aggregate public metrics
dashboard/   Static frontend served by GitHub Pages
data/        Generated datasets consumed by the dashboard
refresh-service/  FastAPI webhook that queues collector runs from the UI
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

Then open `http://localhost:8000/sentient-accounts/dashboard/`.

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

## Local reel view prototype

The main collector still does not reliably populate `video_view_count`, so there is now a separate local prototype that reads the visible view counts from the Instagram Reels grid in Chrome.

Install dependencies if needed:

```bash
.venv/bin/pip install -r collector/requirements.txt
```

Run it for one account:

```bash
.venv/bin/python collector/scrape_reel_views.py chatgptricks
```

What to expect:

1. A dedicated Chrome profile opens from `sentient-accounts/.chrome-reels-profile/`.
2. On the first run, log into Instagram in that Chrome window.
3. The script opens `https://www.instagram.com/<username>/reels/`, scrolls the grid, and saves JSON to `sentient-accounts/.tmp/reel-views/<username>.json`.

Useful options:

```bash
.venv/bin/python collector/scrape_reel_views.py chatgptricks --max-reels 80
.venv/bin/python collector/scrape_reel_views.py chatgptricks --output ./chatgptricks-reel-views.json
```

This script is intentionally local-only for now. It does not run in GitHub Actions and it does not modify the main dashboard datasets yet.

If you prefer env files instead of shell exports, `.env` and `.env.local` in the repository root are supported:

```bash
INSTAGRAM_USERNAME="your_username"
INSTAGRAM_PASSWORD="your_password"
INSTALOADER_SESSION_FILE=".instaloader/session-your_username"
INSTALOADER_BROWSER="chrome"
INSTALOADER_COOKIE_FILE="/path/to/browser/cookies.sqlite"
```

## GitHub Actions

- `.github/workflows/sentient-collect.yml` refreshes datasets on a schedule and commits changes to `sentient-accounts/data/`.
- `.github/workflows/deploy-pages.yml` publishes a Pages artifact that contains both the dashboard and generated data.
- `sentient-collect.yml` can optionally restore a persisted Instaloader session from a Base64-encoded secret named `INSTALOADER_SESSION_FILE_B64`.

## Manual refresh from the dashboard

GitHub Pages stays static. The refresh button uses a tiny Python API to trigger the existing `sentient-collect.yml` workflow securely.

Architecture:

1. User clicks `Refresh data` in `sentient-accounts/dashboard/`.
2. The frontend calls the FastAPI service in `sentient-accounts/refresh-service/`.
3. The FastAPI service verifies a shared secret and dispatches `sentient-collect.yml` through the GitHub Actions REST API.
4. The workflow runs the existing Python collector, commits JSON changes, and `deploy-pages.yml` republishes Pages automatically on push.

### Deploy the refresh API on Render

This repo now includes a root `render.yaml` blueprint for a `sentient-accounts-refresh` service.

1. In Render, create the service from this repository blueprint.
2. Set the secrets defined in `sentient-accounts/refresh-service/.env.example`:
   - `GITHUB_TOKEN`
   - `REFRESH_SHARED_SECRET`
   - `REFRESH_ALLOWED_ORIGINS`
3. Use a fine-grained GitHub token with repository access to `maxx-tools` and `Actions: Read and write`.
4. Keep `GITHUB_WORKFLOW_ID=sentient-collect.yml` and `GITHUB_REF=main`.

### Configure the dashboard button

You have two options:

1. Edit `sentient-accounts/dashboard/config.js` and set `refreshApiBaseUrl` to your Render URL.
2. Or leave it blank and configure the API URL and admin key directly from the UI with the `Configure` button. The values are stored only in that browser's local storage.

The `Refresh data` button is intentionally admin-only. The frontend never stores the GitHub token; it only sends the shared secret to the FastAPI service, which then talks to GitHub.

## Continue improving

The project continuation guide is in `docs/continuation.md`.
