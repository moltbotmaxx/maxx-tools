# Schedulr Clipper Extension

This Chrome Extension allows you to save any website directly to your Inspiration board in the Schedulr application.

## How to Install:

1. Open Chrome and go to `chrome://extensions/`
2. Enable **"Developer mode"** (top right switch).
3. Click **"Load unpacked"** (top left).
4. Select the `extension` folder inside your `daily-tracker` (Schedulr) project directory.
5. Pin the extension to your toolbar for easy access.

## Features:
- **Right-Click Capture**: Highlight text or right-click any link and choose **Save to Schedulr** to clip inspiration instantly.
- **Smart Popup**: Automatically grabs the page title and URL.
- **On-Page Modal**: Right-clicking opens a modal directly on the page so you don't have to leave your flow.
- **Custom Categories**: Select between Post, Reel, or Promo.
- **Profile Linking**: Open Schedulr, sign in with Google, and the extension will link future captures to that same profile.
- **Browser Queue Import**: Saves locally in the browser and imports into the signed-in Schedulr account when the app is open.
- **Store-Friendlier Permissions**: The app listener runs only on Schedulr URLs, and other pages are clipped on demand through the context menu.

## Packaging

Run `./package-extension.sh` inside this folder to generate:

- A Chrome Web Store upload ZIP
- A side-loadable CRX
- A PEM key you should keep for future CRX rebuilds
