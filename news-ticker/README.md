# news-ticker

AI/robotics news dashboard data pipeline.

## Canonical behavior (must follow)

This project must always generate `public/data.json` using:
1. **News (>=40 items, last 48h)** with ranking (`ranking`, `virality`, `fit`)
2. **10 X posts** filtered to AI/robotics and ranked by real engagement (likes/reposts/replies/views)
3. **10 Reddit posts** from target subreddits ranked by engagement
4. **All news items** must include a non-empty `image_url`

## Source of truth
- Script: `scripts_generate_data.py`
- Output: `public/data.json` (single source of truth)
- App fetch path: **`/news-ticker/public/data.json` only**
- Browser profile for automation: **`openclaw` only**
- Note: root `data.json` is deprecated/forbidden and must not be recreated.

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
- **Do not use Nitter**.
- Use **x.com via browser automation** with `profile="openclaw"` only.
- Pull AI/robotics posts with strong engagement (likes/views/reposts), then rank by weighted engagement score.
- Exclude weak/noisy posts when possible.
- Do not fallback to "big players only" lists.

## Git flow after run (refresh command behavior)
From monorepo root:
```bash
# commit/push ONLY data.json
git add news-ticker/public/data.json
git commit -m "chore(news-ticker): refresh live data snapshot"
git pull --rebase
git push

# then publish live
npm --prefix news-ticker run deploy
```
