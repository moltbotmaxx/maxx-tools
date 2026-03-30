#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BUILD_DIR="$SCRIPT_DIR/.build"
MANIFEST_PATH="$SCRIPT_DIR/manifest.json"

if [[ ! -x "$CHROME_BIN" ]]; then
  echo "Chrome binary not found at: $CHROME_BIN" >&2
  exit 1
fi

VERSION="$(node -e "console.log(require(process.argv[1]).version)" "$MANIFEST_PATH")"
PACKAGE_BASENAME="schedulr-clipper-v${VERSION}"
LATEST_BASENAME="schedulr-clipper-latest"
STAGE_DIR="$BUILD_DIR/$PACKAGE_BASENAME"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/icons"

cp "$SCRIPT_DIR/manifest.json" "$STAGE_DIR/"
cp "$SCRIPT_DIR/background.js" "$STAGE_DIR/"
cp "$SCRIPT_DIR/content-script.js" "$STAGE_DIR/"
cp "$SCRIPT_DIR/popup.html" "$STAGE_DIR/"
cp "$SCRIPT_DIR/popup.js" "$STAGE_DIR/"
cp "$SCRIPT_DIR/icons/icon16.png" "$STAGE_DIR/icons/"
cp "$SCRIPT_DIR/icons/icon32.png" "$STAGE_DIR/icons/"
cp "$SCRIPT_DIR/icons/icon48.png" "$STAGE_DIR/icons/"
cp "$SCRIPT_DIR/icons/icon128.png" "$STAGE_DIR/icons/"

rm -f "$SCRIPT_DIR/$PACKAGE_BASENAME.zip" "$SCRIPT_DIR/$LATEST_BASENAME.zip"
(
  cd "$STAGE_DIR"
  zip -qr "$SCRIPT_DIR/$PACKAGE_BASENAME.zip" .
)
cp "$SCRIPT_DIR/$PACKAGE_BASENAME.zip" "$SCRIPT_DIR/$LATEST_BASENAME.zip"

rm -f "$STAGE_DIR.crx" "$STAGE_DIR.pem"
"$CHROME_BIN" --pack-extension="$STAGE_DIR" >/dev/null 2>&1

mv "$STAGE_DIR.crx" "$SCRIPT_DIR/$PACKAGE_BASENAME.crx"
mv "$STAGE_DIR.pem" "$SCRIPT_DIR/$PACKAGE_BASENAME.pem"
cp "$SCRIPT_DIR/$PACKAGE_BASENAME.crx" "$SCRIPT_DIR/$LATEST_BASENAME.crx"

rm -rf "$STAGE_DIR"

echo "Created:"
echo "  $SCRIPT_DIR/$PACKAGE_BASENAME.zip"
echo "  $SCRIPT_DIR/$PACKAGE_BASENAME.crx"
echo "  $SCRIPT_DIR/$PACKAGE_BASENAME.pem"
echo "  $SCRIPT_DIR/$LATEST_BASENAME.zip"
echo "  $SCRIPT_DIR/$LATEST_BASENAME.crx"
