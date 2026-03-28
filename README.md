# Maxx Tools 🦞

A monorepo of internal mini-apps and productivity tools.

## 🛠️ Included Tools

### [Daily Tracker](./daily-tracker/)
**Content Scheduler & Planner**
- Plan and organize weekly content.
- Includes a dedicated Chrome/Edge extension ([Daily Tracker Clipper](./daily-tracker/extension/)) for quick data collection.
- Automated data sourcing pipeline for articles, X (Twitter), and Reddit.

### [FX Tracker](./fx-tracker/)
**Currency Exchange Dashboard**
- Real-time tracking of **USD/CRC** and **EUR/CRC**.
- Official data sourced from the BCCR (Banco Central de Costa Rica).
- Visualizes trends and highlights official economic announcements.

### [Tweet Visualizer](./tweet-visualizer/)
**Mockup Generator**
- High-fidelity preview of tweets in **Dark Mode**.
- Configurable width for perfect integration into design mockups and presentations.

### [Chart Animator](./chart-animator/)
**Instagram Chart Generator**
- Creates animated charts in **1080 x 1440** format for Instagram.
- Supports single-array snapshots, multi-series compare mode, and timeline-style year-over-year animation.
- Exports stills as PNG and motion as WebM directly from the browser.

### [Battle Giveaway](./battle-giveaway/)
**Instagram Giveaway Battle Royale**
- Extracts commenters from an Instagram post.
- Downloads profile pictures and generates an animated battle royale.
- Requires `IG_USERNAME` and `IG_PASSWORD` in a `.env` file (see [`battle-giveaway/.env.example`](./battle-giveaway/.env.example)).
- Run with `cd battle-giveaway && npm install && node serve.js`.

---

## 🚀 Getting Started

1. Open [index.html](./index.html) in your browser to access the central hub.
2. Navigate to any tool by clicking its respective card.

## 🤝 Contributing

Please refer to [CONTRIBUTING.md](./CONTRIBUTING.md) for folder conventions, commit styles, and the mandatory data pipeline for the `daily-tracker`.
