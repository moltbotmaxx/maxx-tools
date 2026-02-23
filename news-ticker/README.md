# news-ticker

AI/robotics news dashboard data pipeline.

## Canonical behavior (must follow)

This project must always generate `public/data.json` using:
1. **News (50 items)** with ranking (`ranking`, `virality`, `fit`)
2. **X posts** filtered to AI/robotics and ranked by real engagement (likes/reposts/replies/views)
3. **Reddit posts** from target subreddits ranked by engagement
4. **Top 10 news items** must include working `image_url` (feed image or fetched `og:image`)

## Source of truth
- Script: `scripts_generate_data.py`
- Output: `public/data.json` (single source of truth)
- Browser profile for automation: **`openclaw` only**
- Note: root `data.json` and build `assets/` are intentionally not used.

## Run
```bash
cd /Users/maxx/.openclaw/workspace/projects/maxx-tools/news-ticker
python3 scripts_generate_data.py
```

Expected minimum output:
- `articles 50`
- `top10 with image 10`
- `x >= 8` (depending on market activity)
- `reddit >= 10`

## X scraping policy
- Use x.com search queries for AI/robotics relevance and minimum engagement.
- Exclude weak/noisy posts when possible.
- Rank by weighted engagement score.
- Do not fallback to "big players only" lists.

## Git flow after run
From monorepo root:
```bash
git add news-ticker/public/data.json news-ticker/scripts_generate_data.py news-ticker/README.md
git commit -m "chore(news-ticker): refresh ranked data pipeline docs/data"
git pull --rebase
git push
```
