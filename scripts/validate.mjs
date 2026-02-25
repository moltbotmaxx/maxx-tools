import crypto from 'node:crypto';
import { getArg, normalizeTitle, normalizeUrlForDedupe, nowIso, readJson, safeNumber, toAbsolute } from './pipeline-utils.mjs';

const input = toAbsolute(getArg('--in', 'daily-tracker/data.json'));
const windowHours = Number(getArg('--window-hours', '48')) || 48;
const requiredArticles = Number(getArg('--articles', '30')) || 30;
const requiredXPerTopic = Number(getArg('--x-per-topic', '10')) || 10;
const requiredReddit = Number(getArg('--reddit-count', '10')) || 10;
const requiredImageCoverage = Number(getArg('--image-coverage', '0.6'));

const requiredXTopics = ['AI', 'CLAUDE', 'CHATGPT', 'GEMINI'];
const allowedSubreddits = new Set(['singularity', 'openai', 'chatgpt']);

function hoursAgo(isoDate) {
  const d = new Date(isoDate || '');
  if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60);
}

function stableTitleHash(title) {
  return crypto.createHash('sha1').update(normalizeTitle(title)).digest('hex');
}

async function main() {
  const data = await readJson(input);
  const errors = [];
  const warnings = [];

  const articles = Array.isArray(data.articles) ? data.articles : [];
  const xItems = Array.isArray(data.x_viral?.items) ? data.x_viral.items : [];
  const redditItems = Array.isArray(data.reddit_viral?.items) ? data.reddit_viral.items : [];

  if (articles.length !== requiredArticles) {
    errors.push(`articles.length=${articles.length}, expected=${requiredArticles}`);
  }

  let validImages = 0;
  const urlSeen = new Set();
  const titleSeen = new Set();

  articles.forEach((article, idx) => {
    if (!article.headline) errors.push(`articles[${idx}] missing headline`);
    if (!article.link) errors.push(`articles[${idx}] missing link`);
    if (!article.source) errors.push(`articles[${idx}] missing source`);
    if (!article.date && !article.published_at) errors.push(`articles[${idx}] missing date/published_at`);

    const recencyHours = hoursAgo(article.published_at || article.date);
    if (!Number.isFinite(recencyHours) || recencyHours > windowHours) {
      errors.push(`articles[${idx}] outside ${windowHours}h window`);
    }

    const canonical = normalizeUrlForDedupe(article.canonical_url || article.link || '');
    const titleHash = stableTitleHash(article.headline || '');
    if (canonical) {
      if (urlSeen.has(canonical)) errors.push(`duplicate canonical url found: ${canonical}`);
      urlSeen.add(canonical);
    }
    if (titleSeen.has(titleHash)) {
      errors.push(`duplicate title hash found for headline: ${article.headline}`);
    }
    titleSeen.add(titleHash);

    ['rating', 'ranking', 'virality', 'fit'].forEach((field) => {
      const n = safeNumber(article[field], NaN);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        errors.push(`articles[${idx}] invalid ${field}=${article[field]}`);
      }
    });

    if (article.image_url && /^https?:\/\//i.test(article.image_url)) validImages += 1;
  });

  const imageCoverage = articles.length ? validImages / articles.length : 0;
  if (imageCoverage < requiredImageCoverage) {
    errors.push(
      `image coverage ${(imageCoverage * 100).toFixed(1)}% below required ${(requiredImageCoverage * 100).toFixed(1)}%`,
    );
  }

  const byTopic = Object.fromEntries(requiredXTopics.map((t) => [t, 0]));
  xItems.forEach((item, idx) => {
    const t = String(item.topic || '').toUpperCase();
    if (!requiredXTopics.includes(t)) warnings.push(`x_viral.items[${idx}] unknown topic=${item.topic}`);
    else byTopic[t] += 1;
  });
  requiredXTopics.forEach((t) => {
    if (byTopic[t] !== requiredXPerTopic) {
      errors.push(`x topic ${t} has ${byTopic[t]}, expected ${requiredXPerTopic}`);
    }
  });
  if (xItems.length !== requiredXPerTopic * requiredXTopics.length) {
    errors.push(`x_viral.items.length=${xItems.length}, expected=${requiredXPerTopic * requiredXTopics.length}`);
  }

  if (redditItems.length !== requiredReddit) {
    errors.push(`reddit_viral.items.length=${redditItems.length}, expected=${requiredReddit}`);
  }
  redditItems.forEach((item, idx) => {
    const sr = String(item.subreddit || '').toLowerCase();
    if (!allowedSubreddits.has(sr)) {
      errors.push(`reddit_viral.items[${idx}] subreddit=${item.subreddit} not in allowed set`);
    }
    if (hoursAgo(item.published_at) > windowHours) {
      errors.push(`reddit_viral.items[${idx}] outside ${windowHours}h window`);
    }
  });

  const summary = {
    stage: 'validate',
    at: nowIso(),
    in: input,
    counts: {
      articles: articles.length,
      x_items: xItems.length,
      reddit_items: redditItems.length,
    },
    image_coverage: Number((imageCoverage * 100).toFixed(2)),
    errors,
    warnings,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[validate] failed:', err);
  process.exitCode = 1;
});
