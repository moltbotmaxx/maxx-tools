#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

INPUT_FILE="${1:-daily-tracker/data.json}"
TARGET_FILE="${2:-daily-tracker/data.json}"
WINDOW_HOURS="${WINDOW_HOURS:-48}"
ARTICLES_COUNT="${ARTICLES_COUNT:-30}"
X_PER_TOPIC="${X_PER_TOPIC:-10}"
REDDIT_COUNT="${REDDIT_COUNT:-10}"
IMAGE_COVERAGE="${IMAGE_COVERAGE:-0.60}"

mkdir -p logs
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

STAMP="$(date +%Y-%m-%d-%H%M)"
LOG_FILE="logs/scrape-${STAMP}.log"

RAW_FILE="$WORKDIR/raw.json"
ENRICHED_FILE="$WORKDIR/enriched.json"

echo "[run-all] start $(date -u +%FT%TZ)" | tee -a "$LOG_FILE"
echo "[run-all] input=${INPUT_FILE} target=${TARGET_FILE}" | tee -a "$LOG_FILE"

node scripts/scrape.mjs --in "$INPUT_FILE" --out "$RAW_FILE" | tee -a "$LOG_FILE"
node scripts/enrich.mjs --in "$RAW_FILE" --out "$ENRICHED_FILE" --window-hours "$WINDOW_HOURS" --articles "$ARTICLES_COUNT" | tee -a "$LOG_FILE"
node scripts/validate.mjs --in "$ENRICHED_FILE" --window-hours "$WINDOW_HOURS" --articles "$ARTICLES_COUNT" --x-per-topic "$X_PER_TOPIC" --reddit-count "$REDDIT_COUNT" --image-coverage "$IMAGE_COVERAGE" | tee -a "$LOG_FILE"

TMP_TARGET="${TARGET_FILE}.tmp"
cp "$ENRICHED_FILE" "$TMP_TARGET"
mv "$TMP_TARGET" "$TARGET_FILE"

echo "[run-all] atomic write completed: ${TARGET_FILE}" | tee -a "$LOG_FILE"
echo "[run-all] done $(date -u +%FT%TZ)" | tee -a "$LOG_FILE"
