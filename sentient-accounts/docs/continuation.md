# Continuation Guide

Last updated: 2026-03-22

This file is the handoff doc for future Codex sessions. Keep it current at the end of meaningful work so the next session can resume without reconstructing context from chat history.

## Non-negotiables

- Always commit and sync at the end of a completed change.
- In `daily-tracker`, always update the visible build tag on each committed UI iteration:
  - `daily-tracker/index.html` live build badge
  - `daily-tracker/index.html` clipper label
  - `daily-tracker/index.html` script cache-busters
  - `daily-tracker/extension/manifest.json` `version_name`
- Do not touch unrelated user files. In particular, `sentient-accounts/santiago.py` is a user-owned experimental script and should stay intact unless explicitly requested.
- Use `apply_patch` for manual edits.

## Current project map

There are two connected systems:

1. `sentient-accounts/`
   - Instagram data collection, aggregation, GitHub Actions refresh flow, and GitHub Pages data publishing.
2. `daily-tracker/`
   - Main planner app.
   - Consumes `sentient-accounts/data/global.json` to power the `Account` tab.

## Sentient Accounts: current architecture

### Data pipeline

- Collector:
  - `sentient-accounts/collector/collect.py`
- Aggregator:
  - `sentient-accounts/collector/aggregate.py`
- Local reel-views scraper:
  - `sentient-accounts/collector/scrape_reel_views.py`
- Dataset output:
  - per account in `sentient-accounts/data/*.json`
  - global aggregate in `sentient-accounts/data/global.json`
  - history in `sentient-accounts/data/history/`
- Local avatars:
  - `sentient-accounts/avatars/*.jpg`

### Deployment and refresh

- Public dashboard is static on GitHub Pages.
- Manual refresh goes:
  - dashboard button -> Render `refresh-service/` -> GitHub Actions `sentient-collect.yml`
- Pages deploy is handled by:
  - `.github/workflows/deploy-pages.yml`
- Scheduled collection currently runs every 6 hours:
  - `00:00`, `06:00`, `12:00`, `18:00` UTC
- The Pages workflow already publishes:
  - dashboard files
  - data JSON
  - avatars

### Authentication / scraping reality

- Browser-cookie import from Chrome was the reliable fix for Instagram auth/rate-limit issues.
- The important GitHub Actions secret is:
  - `INSTALOADER_SESSION_FILE_B64`
- Also required:
  - `INSTAGRAM_USERNAME`
  - `INSTAGRAM_PASSWORD`
- The current workflow can restore the persisted session and collect successfully.

### Reel views

- The original `santiago.py` was not integrated directly.
- Instead, its idea was reworked into:
  - `collector/scrape_reel_views.py`
- That scraper can read reel view counts from the Reels grid using Selenium and merge them into the collector flow.
- This enrichment is intended for the published dashboard data, not for the browser UI directly.

### Current dataset features

The system currently supports:

- profile avatars
- `30d` likes per account
- `30d` reel views per account
- global portfolio totals for:
  - likes `30d`
  - reel views `30d`
- top recent posts
- handling of hidden Instagram likes:
  - if likes are `3`, UI treats them as `Hidden`
  - sorting falls back to comments

## Daily Tracker: current architecture

### Managed accounts flow

- During login/onboarding, users choose which Sentient accounts they manage.
- That selection is stored with the rest of Daily Tracker user data.
- Entry points:
  - onboarding modal
  - `Manage Accounts` button inside the `Account` tab

Relevant files:

- `daily-tracker/app.js`
- `daily-tracker/index.html`
- `daily-tracker/styles.css`
- `daily-tracker/firestore.rules`

### Account tab

The `Account` tab currently uses this structure:

- left column:
  - stable `Managed Account Dashboard` summary
  - selected-account roster
- right column:
  - sub-tabs for managed accounts
  - one active account panel at a time
  - full metric panel for the active account
  - top 5 recent posts

Important implementation details:

- `topPosts` now keeps 5 posts, not 3
- active account state is handled with `activeManagedAccountTab`
- account switching is via `data-account-tab`
- current build tag is:
  - `account-subtabs`

Relevant implementation points:

- `daily-tracker/app.js`
  - `normalizeSentientDataset`
  - `buildAccountOverviewCard`
  - `buildAccountTabs`
  - `buildAccountDashboardCard`
  - `renderAccountDashboard`
  - `renderAccountView`
- `daily-tracker/styles.css`
  - account dashboard layout block
  - sub-tabs styling
  - active account detail panel

## Latest important commits

Recent relevant commits, newest first:

- `3e968cd` `refactor(daily-tracker): add account subtabs layout`
- `dc8da55` `refactor(daily-tracker): rebuild account bento dashboard`
- `de993e5` `feat(sentient-accounts): add 30d portfolio totals`
- `53cc912` `fix(pages): publish sentient account avatars`
- `dcb4a36` `fix(sentient-accounts): serve local profile avatars`
- `10cf096` `feat(sentient-accounts): enrich dashboard with reel views`
- `1dd7cbc` `fix(sentient-accounts): retry data push on main updates`
- `48e29be` `fix(pages): deploy after sentient collection`
- `a29f384` `feat(sentient-accounts): add dashboard-triggered refresh service`

## Current known state

### Sentient Accounts

- Refresh button and scheduled runs work.
- GitHub Pages publishing path is fixed.
- Avatars are served locally and should not depend on hotlinking Instagram.
- The collector is functional, but still operationally fragile because Instagram auth/rate limits can change.

### Daily Tracker

- `Account` is mid-iteration from a design perspective, but functional.
- The latest structural change is the sub-tab model for multiple managed accounts.
- No browser QA was done for the latest `account-subtabs` commit in this session; only code validation was run.

## Likely next improvements

If the next session continues the current thread, likely tasks are:

1. Further redesign `daily-tracker` `Account` tab visually.
2. Tighten density/spacing after real browser QA.
3. Improve metric hierarchy in the active account panel.
4. Add richer Sentient trend data into Daily Tracker if needed.

## Operational runbook

### Sentient Accounts local commands

Create virtualenv:

```bash
cd "/Users/tbnalfaro/Desktop/Sentient apps/maxx-tools/sentient-accounts"
python3 -m venv .venv
source .venv/bin/activate
pip install -r collector/requirements.txt
```

Import Instagram browser cookies from Chrome:

```bash
.venv/bin/python collector/import_browser_session.py --browser chrome
```

Run local collection:

```bash
.venv/bin/python collector/collect.py
.venv/bin/python collector/aggregate.py
```

Run local reel-views scrape:

```bash
.venv/bin/python collector/scrape_reel_views.py chatgptricks --max-reels 10
```

Serve static files locally:

```bash
cd "/Users/tbnalfaro/Desktop/Sentient apps/maxx-tools"
python3 -m http.server 8000
```

### Daily Tracker validation

From repo root:

```bash
node --check daily-tracker/app.js
git diff --check
```

### Sentient Accounts validation

From repo root:

```bash
python3 -m py_compile sentient-accounts/collector/*.py sentient-accounts/refresh-service/main.py
python3 sentient-accounts/collector/aggregate.py
git diff --check
```

## Files to inspect first in a new session

If continuing work on `Account` UI:

- `daily-tracker/app.js`
- `daily-tracker/styles.css`
- `daily-tracker/index.html`

If continuing work on Sentient collection/refresh:

- `sentient-accounts/collector/collect.py`
- `sentient-accounts/collector/aggregate.py`
- `.github/workflows/sentient-collect.yml`
- `.github/workflows/deploy-pages.yml`
- `sentient-accounts/refresh-service/main.py`

## End-of-session checklist

Before ending a substantial session:

1. Run the relevant validation commands.
2. Commit the work.
3. Push to `origin/main`.
4. Update this file with:
   - what changed
   - current build tag if `daily-tracker` changed
   - latest relevant commit hash
   - known follow-up work

## Notes for the next Codex

- Do not assume the `Account` tab is finished visually. The user is iterating aggressively on layout quality.
- When working on `daily-tracker`, preserve the current data wiring from `sentient-accounts/data/global.json`.
- If Instagram breaks again, refresh the browser-derived session before rewriting the collector.
- If Pages looks stale, check:
  - the data commit landed on `main`
  - `deploy-pages.yml` ran
  - the published asset path includes avatars/data
