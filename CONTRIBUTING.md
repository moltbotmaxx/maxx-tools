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
1. Run `python3 news-ticker/scripts_generate_data.py`
2. Validate output in `news-ticker/public/data.json`:
   - `articles` = 50
   - top 10 articles with non-empty `image_url`
   - `x_viral.items` populated with AI/robotics + engagement-ranked posts
   - `reddit_viral.items` populated and ranked
3. Browser automation must use `profile="openclaw"`.
4. Commit data/script/docs together when behavior changes.

---
If in doubt: prefer consistency over cleverness.
