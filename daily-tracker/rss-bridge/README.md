# RSS-Bridge for Daily Tracker

This folder wires `daily-tracker` to a self-hosted `RSS-Bridge` instance for the `X` sidebar feed.

## What this setup does

- Runs the official `rssbridge/rss-bridge` Docker image
- Enables `TwitterV2Bridge`
- Lets `daily-tracker` read a JSON feed from `/rss-bridge/`
- Uses an `artificial intelligence` query by default in [x-feed-config.js](/Users/tbnalfaro/Desktop/Sentient%20apps/maxx-tools/daily-tracker/x-feed-config.js)

## Requirements

- Docker and Docker Compose
- An X Developer bearer token with read access

## Configure

1. Edit [config.ini.php](/Users/tbnalfaro/Desktop/Sentient%20apps/maxx-tools/daily-tracker/rss-bridge/config/config.ini.php)
2. Replace `REPLACE_WITH_X_BEARER_TOKEN`
3. Start the bridge:

```bash
cd /Users/tbnalfaro/Desktop/Sentient\ apps/maxx-tools/daily-tracker/rss-bridge
docker compose up -d
```

The container listens on `127.0.0.1:3001`.

## Recommended reverse proxy

Serve the bridge on the same origin as `daily-tracker`, under `/rss-bridge/`, so the browser does not hit CORS problems.

Example Nginx location:

```nginx
location /rss-bridge/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Feed target

The current frontend config targets AI-related posts through `TwitterV2Bridge` using:

```text
"artificial intelligence" OR AI OR ChatGPT OR OpenAI OR Anthropic OR Claude OR Gemini OR robotics
```

You can change the query, switch to `By username`, or `By list ID` in [x-feed-config.js](/Users/tbnalfaro/Desktop/Sentient%20apps/maxx-tools/daily-tracker/x-feed-config.js).

## Current bridge limitation

The stock `TwitterV2Bridge` feed shape includes tweet text, author, date and media, but not public engagement counters like likes, views or reposts. The `daily-tracker` `X` cards are therefore rendered from author, recency and media presence instead of engagement metrics.
