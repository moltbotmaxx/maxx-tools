# Contributing to maxx-tools

Lightweight rules to keep the monorepo clean and predictable.

## 1) Folder conventions
- Use **kebab-case** for all app/tool folders.
- Current apps:
  - `fx-tracker`
  - `insta-claws`
  - `news-ticker`
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

## 8) NewsTicker runbook (mandatory)
For `news-ticker`, always enforce this pipeline:
1. Refresh data into `news-ticker/public/data.json` (current target: 40 articles, 10 X, 10 Reddit).
2. For X posts: **never use Nitter**. Use browser automation on x.com with `profile="openclaw"` and rank by engagement.
3. Validate output:
   - all articles have non-empty `image_url`
   - news window respects 48h maximum age
   - `x_viral.items` and `reddit_viral.items` populated and ranked
4. For routine refreshes, commit/push **ONLY** `news-ticker/public/data.json`.
5. After push, run `npm --prefix news-ticker run deploy` so data is live on `maxxbot.cloud/news-ticker`.

---
If in doubt: prefer consistency over cleverness.
