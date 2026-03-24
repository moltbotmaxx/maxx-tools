# Daily Tracker Mobile

Mobile-first alternative for `daily-tracker`, built as a separate Expo app instead of a responsive port of the desktop SPA.

## Current scope

- Bottom tabs for `Today`, `Inbox`, `Plan`, and `Account`
- Shared data contract compatible with the current Firestore document
- Local preview mode so the product can be designed without blocking on mobile auth
- Firebase and React Native persistence wired for the real backend path

## Run locally

```bash
npm install
npx expo start
```

## Auth and config

Create `.env.local` from `.env.example`.

- Firebase public config can point to the existing `daily-tracker` project.
- Mobile Google Sign-In still needs native OAuth client IDs for iOS and Android.
- Until those IDs are added, the app runs in preview mode with local persistence.

## Next implementation slice

- Wire native Google Sign-In credentials
- Add share-sheet capture
- Expand week planning interactions
