# maxx-tools

Monorepo for Maxx small tools/apps.

## Apps
- `daily-tracker`
- `fx-tracker`
- `insta-claws` (no frontend)
- `mission-control`
- `smart-frame`

## Conventions
- Folder names: kebab-case
- Hub index: `index.html`
- Shared ops/docs live in OpenClaw workspace docs.

## Local path
`/Users/maxx/.openclaw/workspace/projects/maxx-tools`

## Daily-Tracker News Pipeline
- Entry point: `./scripts/run-all.sh daily-tracker/data.json daily-tracker/data.json`
- Stages:
  - `scripts/scrape.mjs`
  - `scripts/enrich.mjs`
  - `scripts/validate.mjs`
- Logs: `logs/scrape-YYYY-MM-DD-HHMM.log`
