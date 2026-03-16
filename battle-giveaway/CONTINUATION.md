# Continuation Guide

This file is the quickest way to resume work on the giveaway app later without relying on chat history.

## Fast Start

Install deps if needed:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm install
```

Run the local app:

```bash
export IG_USERNAME="your_username"
export IG_PASSWORD="your_password"
node serve.js --host=127.0.0.1 --port=3000
```

Open:

```text
http://127.0.0.1:3000/
```

The root page is the control room UI. It can extract participants and run the battle preview directly.

## Current Project Flow

1. `POST /api/extract` in `serve.js` reads the Instagram post.
2. `extract_participants_browser.js` writes:
   - `participants/players.txt`
   - `participants/commenters.json`
3. `download_avatars.py` refreshes `avatars/`
4. `generate_players_json.py` rebuilds `battle/players.json`
5. `Run battle` in the UI loads `battle/index.html` with query params from `app/app.js`

Important behavior already in place:

- Empty filter word means all comments participate
- Browser extractor supports authenticated full-thread extraction
- The battle supports audio in preview, but not in MP4 export
- The final winner is normalized to center with zero rotation

## Where To Edit

### UI and controls

- `app/index.html`
  - Add or remove sliders/toggles
- `app/app.js`
  - Connect controls to query params
  - Default values shown in the control room

### Battle logic

- `battle/game.js`
  - All movement, collisions, hit rules, sounds, FX, final duel transition, winner animation

Most sensitive sections inside `battle/game.js`:

- `activateFinalDuel()`
  - Transition from mass battle to the final 1v1
- `executeFinalDuelBeat()`
  - The aggressive/defensive beats during the duel
- `nudgeAllPlayers()`
  - Periodic velocity injections
- `forceEngagementBurst()`
  - Anti-stall logic when actors stop colliding
- `moveWinnerToCenter()` and `stabilizeWinnerSprite()`
  - Final winner placement and orientation

### Extraction and backend

- `serve.js`
  - Local API
  - Progress state
  - Extraction orchestration
- `extract_participants_browser.js`
  - Instagram login flow
  - Full comment + child comment extraction
- `run_giveaway.py`
  - CLI pipeline entry point
- `record.js`
  - MP4 render pipeline

## Current Battle Controls

The control room currently exposes:

- Show user name
- Show profile picture
- Sound
- Circle size
- Username font
- Hits to lose
- Final 1v1 hits
- Sound volume
- Screen shake
- Center pull
- Fight drive
- Chaos
- FX intensity

If a control does not seem to affect the preview, check:

1. `app/app.js` is adding the query param
2. `battle/game.js` is reading that param
3. The affected code path actually uses the value

## Current Final Duel Behavior

What it does now:

- When only 2 players remain, the battle enters `finalDuelTransitioning`
- Both finalists freeze where they are
- `FINAL BATTLE` appears in the center
- The finalists move smoothly from their frozen positions into final duel spots
- After the transition, `finalDuelTransitioning` becomes `false` and the 1v1 begins

If this transition feels wrong later, inspect:

- `FINAL_DUEL_HOLD_MS`
- `FINAL_DUEL_MOVE_MS`
- `FINAL_DUEL_TRANSITION_MS`
- `flashFinalDuelBanner()`
- `activateFinalDuel()`

## Current Known Limitations

- `record.js` produces silent MP4 files. Preview sound exists only in-browser for now.
- Instagram extraction depends on the current login flow and can break if Instagram changes it.
- `avatars.next/` may exist as leftover temp output from earlier work. It is not required by the current app flow.
- The local server must be restarted if you change `serve.js`. Frontend-only file changes usually just need a browser refresh.

## Good Next Steps Later

If work resumes later, the highest-value follow-ups are:

1. Add audio export to `record.js`
2. Polish the final 1v1 transition visually
3. Add a proper preset system for battle tuning values
4. Add explicit save/load of the current control room settings
5. Harden Instagram extraction retries and timeout handling

## Quick Sanity Checks

After changing UI or battle logic:

1. Refresh `http://127.0.0.1:3000/`
2. Run one preview from the control room
3. Confirm `window.__battleState` in the browser reflects the new params
4. Confirm the battle still reaches `remaining = 1`

After changing extraction:

1. Run a fresh extract from the control room
2. Check:
   - `participants/players.txt`
   - `participants/commenters.json`
   - `avatars/`
   - `battle/players.json`
