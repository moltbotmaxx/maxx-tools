import { useState, useEffect } from 'react';
import './App.css';

interface DashboardItem {
  headline: string;
  link: string;
  image_url: string;
  ranking: number;
  virality: number;
  fit: number;
  reason: string;
  date: string;
  source: string;
}

interface XItem {
  headline: string;
  link: string;
  author: string;
  likes: number;
  views: number;
  reposts: number;
  score: number;
}

interface RedditItem {
  headline: string;
  link: string;
  subreddit: string;
  score: number;
  comments: number;
  viral_score: number;
}

interface DashboardData {
  articles: DashboardItem[];
  x_viral?: {
    generated_at: string;
    note: string;
    items: XItem[];
  };
  reddit_viral?: {
    generated_at: string;
    subreddits: string[];
    items: RedditItem[];
  };
}

/* ── Decode HTML entities from RSS feeds ── */
function decodeEntities(text: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

/* ── Score color system ── */
function getScoreColor(ranking: number): string {
  if (ranking >= 85) return '#FF3B3B';
  if (ranking >= 70) return '#FF6B35';
  if (ranking >= 55) return '#FFB800';
  if (ranking >= 40) return '#007AFF';
  return '#8E8E93';
}

function getScoreClass(ranking: number): string {
  if (ranking >= 85) return 'score-fire';
  if (ranking >= 70) return 'score-orange';
  if (ranking >= 55) return 'score-amber';
  if (ranking >= 40) return 'score-blue';
  return 'score-muted';
}

function getScoreIcon(ranking: number): string | null {
  if (ranking >= 85) return '🔥';
  return null;
}

/* ── Featured Card (Top 5) ── */
function FeaturedCard({ item, index, isDone, onDone }: { item: DashboardItem; index: number; isDone: boolean; onDone: (headline: string) => void }) {
  const hasImage = item.image_url && !item.image_url.includes('placeholder');
  const imageStyle = hasImage
    ? { backgroundImage: `url(${item.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;
  const scoreIcon = getScoreIcon(item.ranking);

  return (
    <div className={`card-wrapper ${isDone ? 'card-wrapper--done' : ''}`}>
      <a
        className="featured-card"
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
      >
        <div className="featured-card__image" style={imageStyle}>
          {!hasImage && (
            <span className="featured-card__image-icon">
              {['🔥', '⚡', '💔', '📢', '⚙️'][index] || '📰'}
            </span>
          )}
          <span className="featured-card__source-badge">{item.source}</span>
          <div className={`score-badge score-badge--featured ${getScoreClass(item.ranking)}`}>
            {scoreIcon && <span className="score-badge__icon">{scoreIcon}</span>}
            <span className="score-badge__value">{item.ranking}</span>
            <div className="score-badge__internal">
              <span>Fit: {item.fit}</span>
              <span>Viral: {item.virality}</span>
            </div>
          </div>
        </div>
        <div className="featured-card__body">
          <h3 className="featured-card__title">{decodeEntities(item.headline)}</h3>
          <p className="featured-card__reason">{item.reason}</p>
          <div className="featured-card__meta">
            <span>{new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <span className="featured-card__arrow">→</span>
          </div>
        </div>
      </a>
      {!isDone && (
        <button
          className="done-button done-button--featured"
          onClick={(e) => { e.preventDefault(); onDone(item.headline); }}
          title="Mark as Done"
        >
          ✓
        </button>
      )}
    </div>
  );
}

/* ── Simple Card (Rank 6-10) ── */
function SimpleCard({ item, index, isDone, onDone }: { item: DashboardItem; index: number; isDone: boolean; onDone: (headline: string) => void }) {
  const scoreIcon = getScoreIcon(item.ranking);

  return (
    <div className={`card-wrapper ${isDone ? 'card-wrapper--done' : ''}`}>
      <a
        className="simple-card"
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
      >
        <div className="simple-card__number">{index + 1}</div>
        <div className="simple-card__content">
          <div className="simple-card__title">{decodeEntities(item.headline)}</div>
          <p className="simple-card__reason">{item.reason}</p>
          <div className="simple-card__meta">
            <span>{item.source} • {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
        <div className={`score-pill ${getScoreClass(item.ranking)}`}>
          {scoreIcon && <span className="score-pill__icon">{scoreIcon}</span>}
          <span>{item.ranking}</span>
          <div className="score-badge__internal">
            <span>F: {item.fit}</span>
            <span>V: {item.virality}</span>
          </div>
        </div>
        <span className="simple-card__arrow">→</span>
      </a>
      {!isDone && (
        <button
          className="done-button"
          onClick={(e) => { e.preventDefault(); onDone(item.headline); }}
          title="Mark as Done"
        >
          ✓
        </button>
      )}
    </div>
  );
}

/* ── Pool Item (Remaining articles) ── */
function PoolItem({ item, isDone, onDone }: { item: DashboardItem; isDone: boolean; onDone: (headline: string) => void }) {
  return (
    <div className={`card-wrapper pool-wrapper ${isDone ? 'card-wrapper--done' : ''}`}>
      <a
        className="pool-item"
        href={item.link !== '#' ? item.link : undefined}
        target="_blank"
        rel="noopener noreferrer"
        title={item.reason}
      >
        <div className={`score-pill score-pill--small ${getScoreClass(item.ranking)}`}>
          <span>{item.ranking}</span>
          <div className="score-badge__internal">
            <span>F:{item.fit}</span>
            <span>V:{item.virality}</span>
          </div>
        </div>
        <div className="pool-item__content">
          <div className="pool-item__title">{decodeEntities(item.headline)}</div>
          <div className="pool-item__meta">
            <span>{item.source} • {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
      </a>
      {!isDone && (
        <button
          className="done-button done-button--small"
          onClick={(e) => { e.preventDefault(); onDone(item.headline); }}
          title="Mark as Done"
        >
          ✓
        </button>
      )}
    </div>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

/* ── X Post Item ── */
function XPostItem({ item }: { item: XItem }) {
  return (
    <a className="x-post" href={item.link} target="_blank" rel="noopener noreferrer">
      <div className="x-post__header">
        <span className="x-post__author">{item.author}</span>
      </div>
      <div className="x-post__title">{decodeEntities(item.headline)}</div>
      <div className="x-post__metrics">
        <span className="x-metric" title="Likes">❤️ {formatCompact(item.likes)}</span>
        <span className="x-metric" title="Views">👁 {formatCompact(item.views)}</span>
        <span className="x-metric" title="Reposts">🔁 {formatCompact(item.reposts)}</span>
      </div>
    </a>
  );
}

/* ── Reddit Post Item ── */
function RedditPostItem({ item }: { item: RedditItem }) {
  return (
    <a className="reddit-post" href={item.link} target="_blank" rel="noopener noreferrer">
      <div className="reddit-post__header">
        <span className="reddit-post__subreddit">r/{item.subreddit}</span>
      </div>
      <div className="reddit-post__title">{decodeEntities(item.headline)}</div>
      <div className="reddit-post__metrics">
        <span className="reddit-metric" title="Score">⬆ {formatCompact(item.score)}</span>
        <span className="reddit-metric" title="Comments">💬 {formatCompact(item.comments)}</span>
      </div>
    </a>
  );
}

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [doneHeadlines, setDoneHeadlines] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    // Load done status from localStorage
    const saved = localStorage.getItem('done_articles');
    if (saved) {
      try {
        setDoneHeadlines(new Set(JSON.parse(saved)));
      } catch (e) {
        console.error('Failed to parse done_articles from localStorage');
      }
    }

    const ts = Date.now();
    const primaryUrl = `/news-ticker/public/data.json?t=${ts}`;
    const fallbackUrl = `${import.meta.env.BASE_URL}data.json?t=${ts}`;

    fetch(primaryUrl, { cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error(`Primary fetch failed: ${res.status}`);
        return res.json();
      })
      .catch(() => fetch(fallbackUrl, { cache: 'no-store' }).then(res => res.json()))
      .then(data => {
        setData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load dashboard data:', err);
        setLoading(false);
      });
  }, []);

  const markAsDone = (headline: string) => {
    setDoneHeadlines(prev => {
      const next = new Set(prev);
      next.add(headline);
      localStorage.setItem('done_articles', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  if (!data || !data.articles) {
    return <div className="error">No data found.</div>;
  }

  // ── Dynamic Bucketing Logic ──
  // 1. Sort all articles by ranking DESC
  const sortedArticles = [...data.articles].sort((a, b) => b.ranking - a.ranking);

  // 2. Filter BEFORE slicing to enable "Auto-Shifting"
  // If showDone is TRUE, we keep the original structure so dimmed items stay in place.
  const activeArticles = showDone
    ? sortedArticles
    : sortedArticles.filter(item => !doneHeadlines.has(item.headline));

  // 3. Slice into buckets
  const top6 = activeArticles.slice(0, 6);
  const next6 = activeArticles.slice(6, 12);
  const remaining = activeArticles.slice(12);

  return (
    <>
      <header className="header">
        <div className="header__left">
          <h1 className="header__title">Ticker</h1>
          <span className="header__separator">·</span>
          <span className="header__date">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>

        <div className="header__right">
          <div className="toggle-group">
            <span className="toggle-label">Show Done</span>
            <label className="switch">
              <input type="checkbox" checked={showDone} onChange={() => setShowDone(!showDone)} />
              <span className="slider round"></span>
            </label>
          </div>
          <span className="header__badge">@chatgptricks</span>
          {doneHeadlines.size > 0 && (
            <button
              className="reset-button"
              onClick={() => {
                setDoneHeadlines(new Set());
                localStorage.removeItem('done_articles');
              }}
            >
              Reset All
            </button>
          )}
        </div>
      </header>

      <div className="dashboard-layout">
        <main className="container">
          {/* Featured Section */}
          {top6.length > 0 && (
            <>
              <div className="section-header">
                <div className="section-title">
                  <div className="section-title__icon">🔥</div>
                  <span className="section-title__text">Featured Stories</span>
                  <span className="section-title__count">{top6.length} articles</span>
                </div>
                <div className="section-divider" />
              </div>
              <div className="featured-grid">
                {top6.map((item, i) => (
                  <FeaturedCard
                    key={item.headline}
                    item={item}
                    index={i}
                    isDone={doneHeadlines.has(item.headline)}
                    onDone={markAsDone}
                  />
                ))}
              </div>
            </>
          )}

          {/* Top Stories Section */}
          {next6.length > 0 && (
            <>
              <div className="section-header">
                <div className="section-title">
                  <div className="section-title__icon">📋</div>
                  <span className="section-title__text">More Top Stories</span>
                  <span className="section-title__count">{next6.length} articles</span>
                </div>
                <div className="section-divider" />
              </div>
              <div className="simple-grid">
                {next6.map((item, i) => (
                  <SimpleCard
                    key={item.headline}
                    item={item}
                    index={i}
                    isDone={doneHeadlines.has(item.headline)}
                    onDone={markAsDone}
                  />
                ))}
              </div>
            </>
          )}

          {/* Article Pool */}
          {remaining.length > 0 && (
            <>
              <div className="section-header">
                <div className="section-title">
                  <div className="section-title__icon">📰</div>
                  <span className="section-title__text">Article Pool</span>
                  <span className="section-title__count">{remaining.length} articles</span>
                </div>
                <div className="section-divider" />
              </div>
              <div className="pool-list">
                {remaining.map((item) => (
                  <PoolItem
                    key={item.headline}
                    item={item}
                    isDone={doneHeadlines.has(item.headline)}
                    onDone={markAsDone}
                  />
                ))}
              </div>
            </>
          )}
        </main>

        {/* ── Social Sidebar ── */}
        <aside className="sidebar">
          {/* X / Twitter Section */}
          {data.x_viral && data.x_viral.items.length > 0 && (
            <div className="sidebar-section">
              <div className="sidebar-section__header">
                <span className="sidebar-section__icon">𝕏</span>
                <span className="sidebar-section__title">Trending on X</span>
                <span className="sidebar-section__count">{data.x_viral.items.length}</span>
              </div>
              <div className="sidebar-section__list">
                {data.x_viral.items.map((item, i) => (
                  <XPostItem key={i} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* Reddit Section */}
          {data.reddit_viral && data.reddit_viral.items.length > 0 && (
            <div className="sidebar-section">
              <div className="sidebar-section__header">
                <span className="sidebar-section__icon">🔴</span>
                <span className="sidebar-section__title">Viral on Reddit</span>
                <span className="sidebar-section__count">{data.reddit_viral.items.length}</span>
              </div>
              <div className="sidebar-section__list">
                {data.reddit_viral.items.map((item, i) => (
                  <RedditPostItem key={i} item={item} />
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      <footer className="footer">
        <div className="footer__divider" />
        <p>@chatgptricks · AI News Dashboard · {new Date().getFullYear()}</p>
      </footer>
    </>
  );
}
