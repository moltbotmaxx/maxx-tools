# NewsTicker Operations (Canonical)

## Objective
At 06:00 AM (America/Costa_Rica), run a full NewsTicker refresh and leave it live on:
- `https://maxxbot.cloud/news-ticker`

## Required output per run
- News from last **48 hours**
- At least **40 articles**
- **10 X posts** (AI/robotics, engagement-ranked)
- **10 Reddit posts** (engagement-ranked)
- Source of truth file: `news-ticker/public/data.json`

## Non-negotiable rules
1. Browser tasks use `profile="openclaw"` only.
2. Never use Nitter for X extraction.
3. Routine refresh commits/pushes **only**:
   - `news-ticker/public/data.json`
4. After push, run deploy:
   - `npm --prefix news-ticker run deploy`
5. Completion notification must be sent via **Aster** to WhatsApp:
   - `+50660048606`
   - Text: `News ticker fue actualizado`

## Manual run checklist
1. Refresh and write `news-ticker/public/data.json`
2. Validate counts and quality gates
3. `git add news-ticker/public/data.json`
4. `git commit -m "chore(news-ticker): daily refresh"`
5. `git pull --rebase && git push`
6. `npm --prefix news-ticker run deploy`
7. Send WhatsApp notification via Aster

## Recovery
- Restore point tag exists before major cache/process edits:
  - `restore-20260223-040501-before-cache-fix`
