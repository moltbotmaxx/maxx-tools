import {
  DEFAULT_USER_AGENT,
  clamp,
  decodeHtmlEntities,
  fetchWithRetry,
  getArg,
  normalizeWhitespace,
  nowIso,
  readJson,
  toAbsolute,
  writeJsonAtomic,
} from './pipeline-utils.mjs';

const input = toAbsolute(getArg('--in', 'daily-tracker/data.json'));
const output = toAbsolute(getArg('--out', 'daily-tracker/data.json'));
const redditRssUrl = String(
  process.env.REDDIT_RSS_URL || getArg('--rss-url', 'https://old.reddit.com/user/diligent_run882/m/ai/.rss'),
).trim();
const redditRss2JsonUrl = String(
  process.env.REDDIT_RSS2JSON_URL || getArg('--rss2json-url', `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(redditRssUrl)}`),
).trim();
const windowHours = Math.max(1, Number(process.env.REDDIT_WINDOW_HOURS || getArg('--window-hours', '48')) || 48);
const itemCount = Math.max(1, Number(process.env.REDDIT_COUNT || getArg('--count', '10')) || 10);

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTag(block, tagName) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRegex(tagName)}>`, 'i');
  const match = String(block || '').match(pattern);
  return match ? decodeHtmlEntities(match[1].trim()) : '';
}

function extractAttr(block, tagName, attrName) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*\\b${escapeRegex(attrName)}="([^"]*)"`, 'i');
  const match = String(block || '').match(pattern);
  return match ? decodeHtmlEntities(match[1].trim()) : '';
}

function stripHtml(html = '') {
  return normalizeWhitespace(
    decodeHtmlEntities(String(html || ''))
      .replace(/<[^>]+>/g, ' ')
      .replace(/\[link\]|\[comments\]|submitted by/gi, ' '),
  );
}

function normalizeRedditLink(url) {
  if (!url) return '';
  try {
    const normalized = new URL(url);
    if (/^(old|www)\.reddit\.com$/i.test(normalized.hostname)) {
      normalized.hostname = 'reddit.com';
    }
    normalized.hash = '';
    return normalized.toString();
  } catch {
    return String(url).trim();
  }
}

function hoursAgo(isoDate) {
  const publishedDate = new Date(isoDate || '');
  if (Number.isNaN(publishedDate.getTime())) return Number.POSITIVE_INFINITY;
  return (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60);
}

function inWindow(isoDate) {
  const ageHours = hoursAgo(isoDate);
  return Number.isFinite(ageHours) && ageHours >= 0 && ageHours <= windowHours;
}

function dedupeByLink(items) {
  const seen = new Set();
  return items.filter((item) => {
    const link = normalizeRedditLink(item?.link || '');
    if (!link || seen.has(link)) return false;
    seen.add(link);
    return true;
  });
}

function parseRedditRssEntries(xmlText) {
  const entryMatches = String(xmlText || '').matchAll(/<entry>([\s\S]*?)<\/entry>/gi);
  return Array.from(entryMatches, ([, block]) => {
    const headline = extractTag(block, 'title');
    const link = normalizeRedditLink(extractAttr(block, 'link', 'href'));
    const publishedAt = extractTag(block, 'published') || extractTag(block, 'updated');
    const subreddit = extractAttr(block, 'category', 'term') || extractAttr(block, 'category', 'label').replace(/^r\//i, '');

    if (!headline || !link || !publishedAt) return null;

    return {
      headline,
      link,
      subreddit,
      published_at: publishedAt,
      reason: stripHtml(extractTag(block, 'content')).slice(0, 220),
      image_url: extractAttr(block, 'media:thumbnail', 'url'),
    };
  }).filter(Boolean);
}

async function fetchRedditRssItems() {
  const res = await fetchWithRetry(
    redditRssUrl,
    {
      headers: {
        accept: 'application/atom+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.5',
        'user-agent': DEFAULT_USER_AGENT,
      },
    },
    12000,
    1,
  );

  if (!res.ok) {
    throw new Error(`Reddit RSS failed with ${res.status}`);
  }

  return parseRedditRssEntries(await res.text());
}

async function fetchRss2JsonMetrics() {
  try {
    const res = await fetchWithRetry(
      redditRss2JsonUrl,
      {
        headers: {
          accept: 'application/json',
          'user-agent': DEFAULT_USER_AGENT,
        },
      },
      12000,
      1,
    );

    if (!res.ok) {
      throw new Error(`rss2json failed with ${res.status}`);
    }

    const json = await res.json();
    const metricMap = new Map();
    const items = Array.isArray(json?.items) ? json.items : [];

    items.forEach((item) => {
      const link = normalizeRedditLink(item?.link || '');
      if (!link) return;
      metricMap.set(link, {
        score: Number(item?.score) || 0,
        comments: Number(item?.comments) || 0,
      });
    });

    return metricMap;
  } catch (error) {
    console.warn('[update-reddit-feed] rss2json metrics unavailable:', error?.message || error);
    return new Map();
  }
}

function buildRedditRawScore(item, index) {
  const score = Number(item?.score) || 0;
  const comments = Number(item?.comments) || 0;
  const freshnessBonus = Math.max(0, windowHours - Math.max(0, hoursAgo(item?.published_at))) * 8;
  const orderingBonus = Math.max(0, itemCount - index);
  return Math.max(1, score + comments * 6 + freshnessBonus + orderingBonus);
}

function applyViralScores(items) {
  const rawScores = items.map((item, index) => buildRedditRawScore(item, index));
  const maxRawScore = Math.max(1, ...rawScores);

  return items.map((item, index) => ({
    ...item,
    viral_score: clamp(Math.round((rawScores[index] / maxRawScore) * 100)),
  }));
}

async function main() {
  const data = await readJson(input);
  const [rssItems, metricMap] = await Promise.all([
    fetchRedditRssItems(),
    fetchRss2JsonMetrics(),
  ]);

  const freshItems = applyViralScores(
    dedupeByLink(rssItems)
      .filter((item) => inWindow(item.published_at))
      .sort((left, right) => new Date(right.published_at).getTime() - new Date(left.published_at).getTime())
      .slice(0, itemCount)
      .map((item) => {
        const metrics = metricMap.get(item.link) || {};
        return {
          headline: item.headline,
          link: item.link,
          subreddit: item.subreddit,
          published_at: item.published_at,
          score: Number(metrics.score) || 0,
          comments: Number(metrics.comments) || 0,
        };
      }),
  );

  if (!freshItems.length) {
    throw new Error(`No Reddit items available within the last ${windowHours} hours`);
  }

  const generatedAt = nowIso();
  const outputData = {
    ...data,
    reddit_viral: {
      generated_at: generatedAt,
      source: 'reddit-rss',
      rss_url: redditRssUrl,
      window_hours: windowHours,
      items: freshItems,
    },
    pipeline_meta: {
      ...(data.pipeline_meta || {}),
      reddit_viral_generated_at: generatedAt,
      reddit_viral_source: 'reddit-rss',
    },
  };

  await writeJsonAtomic(output, outputData);

  console.log(JSON.stringify({
    stage: 'update-reddit-feed',
    in: input,
    out: output,
    at: generatedAt,
    counts: {
      reddit_items: freshItems.length,
    },
  }, null, 2));
}

main().catch((err) => {
  console.error('[update-reddit-feed] failed:', err);
  process.exitCode = 1;
});
