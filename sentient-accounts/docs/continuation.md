# Continuation Guide

This document is the handoff for the next iteration of the project.

## Current state

- Public metrics are collected with Instaloader and stored as JSON in `data/`.
- Authentication now supports:
  - password login,
  - persisted session files in `.instaloader/`,
  - browser cookie import through `collector/import_browser_session.py`.
- The dashboard reads committed JSON only. It does not call Instagram directly.
- GitHub Pages is deployed through `.github/workflows/pages.yml`.
- Scheduled collection is handled by `.github/workflows/collect.yml`.

## What is already working

- `collector/collect.py` generates per-account datasets.
- `collector/aggregate.py` generates `data/global.json`.
- Historical snapshots are written to `data/history/`.
- Browser cookie import from Chrome worked locally and unblocked scraping.
- The local dashboard serves correctly from `http://127.0.0.1:8000/dashboard/`.

## Known limitations

### Collector

- `video_view_count` is often missing in the lightweight post node returned by Instagram, so `avg_video_views` may stay at `0`.
- The collector currently depends on private Instaloader post internals through `post._node`. It is pragmatic, but fragile against upstream changes.
- A slow or blocked Instagram request can still delay a full run because there is no per-account timeout layer in our code.
- We only store the latest account snapshot plus daily history. We do not keep raw source payloads for debugging schema changes.

### Dashboard

- The UI shows core metrics, but there is no filter by date range, no anomaly highlighting, and no dedicated error panel for failed collections.
- Historical charts are minimal and only use the stored daily snapshots.
- There is no loading skeleton or empty-state distinction between "no data yet" and "collection failed".

### Operations

- There are no automated tests yet.
- There is no schema validation for generated JSON.
- GitHub Actions can restore a saved session file, but there is no documented rotation process for refreshing that secret.

## Recommended order of improvements

1. Stabilize the collector.
2. Add validation and tests around generated datasets.
3. Expand history and derived metrics.
4. Improve dashboard analysis UX.
5. Harden GitHub Actions and secret rotation.

## Improvement backlog

### 1. Collector hardening

Goal: make daily collection predictable and debuggable.

Suggested changes:

- Add a small retry wrapper around account collection with bounded retries and explicit backoff.
- Add per-account timing logs so slow profiles are easy to identify.
- Persist a lightweight collection report to `data/run-report.json` with:
  - start time,
  - end time,
  - accounts attempted,
  - accounts succeeded,
  - accounts failed,
  - auth method used.
- Save raw Instagram node samples for the first post of each account in a debug folder such as `data/debug/` when `DEBUG_COLLECTOR=1`.
- Isolate fragile field extraction into one module, so future Instagram schema changes only touch one file.

Validation checklist:

- Run `python3 -m py_compile collector/*.py`.
- Run `.venv/bin/python collector/collect.py`.
- Confirm `data/errors.json` is absent on a fully successful run.
- Confirm `data/run-report.json` matches the actual account count.

### 2. Dataset validation

Goal: prevent broken JSON from reaching the dashboard.

Suggested changes:

- Add a schema validation script, for example `collector/validate_data.py`.
- Define required keys for:
  - per-account files,
  - `data/global.json`,
  - history files.
- Fail CI if generated JSON is malformed or missing required fields.
- Add a check that history files are date-sorted and deduplicated.

Validation checklist:

- Run the validator after `collect.py` and `aggregate.py`.
- Make the validator part of `.github/workflows/collect.yml`.
- Intentionally break a local JSON file once to confirm the validator fails loudly.

### 3. Better historical analytics

Goal: make the project feel more like a private SocialBlade.

Suggested changes:

- Extend per-day history with:
  - following,
  - posts,
  - avg likes,
  - avg comments,
  - engagement rate.
- Add derived metrics in aggregation:
  - follower delta day over day,
  - follower growth percentage,
  - engagement trend,
  - account rank movement.
- Add `data/global-history.json` or continue using `data/history/global.json` with more fields.
- Consider keeping weekly and monthly rollups if daily history grows too large.

Validation checklist:

- Confirm history appends once per date and overwrites the same date cleanly on reruns.
- Confirm aggregated deltas do not break when only one day of history exists.

### 4. Dashboard improvements

Goal: move from a metrics viewer to a usable analysis tool.

Suggested changes:

- Add an error banner fed from `data/errors.json`.
- Add date-range selectors using the history files.
- Add follower growth charts and engagement trend charts.
- Add comparison tables:
  - top growth,
  - top engagement,
  - biggest drop.
- Add a drilldown section for recent post performance ranking within each account.
- Show clearly when a metric is unavailable instead of silently rendering `0`.

Validation checklist:

- Test with:
  - full data,
  - empty `accounts`,
  - one failed account,
  - all failed accounts.
- Confirm the dashboard still loads if `errors.json` is missing.

### 5. GitHub Actions and secret hygiene

Goal: make automation maintainable.

Suggested changes:

- Document how to refresh `INSTALOADER_SESSION_FILE_B64`.
- Add a helper script that prints the exact Base64 payload for the session file.
- Consider splitting collection and deployment into separate environments if you want approvals or different secrets later.
- Add a manual workflow input to force a run for selected accounts only.

Validation checklist:

- Trigger `collect-instagram-data` manually.
- Confirm `data/` is committed only when files change.
- Confirm `deploy-dashboard` publishes the new artifact after data changes.

## Immediate next steps

If continuing right now, this is the best sequence:

1. Add JSON validation for generated datasets.
2. Add a run report file for each collection.
3. Add dashboard handling for `data/errors.json`.
4. Add follower growth and engagement trend charts from `data/history/`.
5. Add a helper for rotating the persisted session secret in GitHub Actions.

## Useful commands

Create or refresh a session file:

```bash
.venv/bin/python collector/create_session.py
```

Import browser cookies into a persisted session:

```bash
.venv/bin/python collector/import_browser_session.py --browser chrome
```

Run a full collection locally:

```bash
.venv/bin/python collector/collect.py
.venv/bin/python collector/aggregate.py
```

Serve the dashboard locally:

```bash
python3 -m http.server 8000
```

## Notes for the next developer

- If Instagram starts returning `401` again, try browser cookie import before changing the collector logic.
- If the dashboard looks empty, check `data/global.json` first, then `data/errors.json`.
- If a metric suddenly becomes `0` for many posts, inspect the post node shape before blaming the aggregation formulas.
- Avoid moving `data/` inside `dashboard/`; the current Pages workflow already assembles the deploy artifact correctly.
