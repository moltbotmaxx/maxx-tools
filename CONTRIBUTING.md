# Contributing to maxx-tools

Lightweight rules to keep the monorepo clean and predictable.

## 1) Folder conventions
- Use **kebab-case** for all app/tool folders.
- Current apps:
  - `daily-tracker`
  - `fx-tracker`
  - `insta-claws`
  - `mission-control`
  - `smart-frame`

## 2) Source of truth
- Canonical local path:
  - `/Users/maxx/.openclaw/workspace/projects/maxx-tools`
- Do not create standalone duplicate repos for these apps.
- Keep experiments in workspace `scratch/`, not in app roots.

## 3) Frontend hub
- Root `index.html` is the apps hub.
- Add/update links when adding apps.
- Backend-only tools (no UI) should appear as non-clickable cards.

## 4) Paths in scripts
- Avoid hardcoded legacy paths.
- If absolute paths are needed, use monorepo-based paths under:
  - `/Users/maxx/.openclaw/workspace/projects/maxx-tools/...`
- Prefer relative paths + env vars where possible.

## 5) Artifacts and binaries
- Do not commit temporary screenshots, debug images, cache, or `__pycache__`.
- Keep generated runtime files out of git unless intentionally versioned.

## 6) Commit style
- Use clear, scoped messages:
  - `feat(app): ...`
  - `fix(app): ...`
  - `chore(repo): ...`
  - `docs(repo): ...`

## 7) Release/sync checklist
Before pushing:
1. `git status` clean except intended changes
2. verify app paths and hub links
3. run app build/deploy command (if applicable)
4. commit + push to `main`

## 8) Daily-Tracker news runbook (mandatory)
For `daily-tracker`, enforce this pipeline for Sourcing data:
1. Refresh data into `daily-tracker/data.json` (target: >=40 articles in last 48h, 10 X, 10 Reddit).
2. For X posts: **never use Nitter**. Use browser automation on x.com with `profile="openclaw"` and rank by engagement.
3. Validate output:
   - article list is populated
   - news window respects 48h maximum age
   - `x_viral.items` and `reddit_viral.items` populated and ranked
4. Run `node scripts/sanitize-news-images.mjs` before push to remove broken image URLs.
5. For routine refreshes, commit/push the updated `daily-tracker/data.json`.
6. Daily automation target: 06:00 AM (America/Costa_Rica) + WhatsApp confirmation via Aster.

---
If in doubt: prefer consistency over cleverness.
