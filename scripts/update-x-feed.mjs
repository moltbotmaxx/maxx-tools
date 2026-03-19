import {
  DEFAULT_USER_AGENT,
  clamp,
  getArg,
  normalizeWhitespace,
  nowIso,
  readJson,
  toAbsolute,
  writeJsonAtomic,
} from './pipeline-utils.mjs';

const input = toAbsolute(getArg('--in', 'daily-tracker/data.json'));
const output = toAbsolute(getArg('--out', 'daily-tracker/data.json'));
const bearerToken = String(process.env.X_BEARER_TOKEN || getArg('--bearer-token', '')).trim();
const endpoint = String(process.env.X_RECENT_SEARCH_URL || getArg('--api-url', 'https://api.x.com/2/tweets/search/recent')).trim();
const sortOrder = String(process.env.X_SORT_ORDER || getArg('--sort-order', 'relevancy')).trim() || 'relevancy';
const perTopic = Math.max(10, Math.min(25, Number(process.env.X_PER_TOPIC || getArg('--per-topic', '10')) || 10));
const queryFilters = normalizeWhitespace(
  process.env.X_QUERY_FILTERS || getArg('--filters', 'lang:en -is:retweet -is:reply'),
);

const TOPIC_FIT = {
  AI: 92,
  CLAUDE: 88,
  CHATGPT: 90,
  GEMINI: 86,
};

const TOPIC_QUERIES = [
  {
    topic: 'AI',
    query: process.env.X_QUERY_AI || '"artificial intelligence" OR "AI agents" OR robotics OR LLM',
  },
  {
    topic: 'CLAUDE',
    query: process.env.X_QUERY_CLAUDE || 'Claude OR Anthropic',
  },
  {
    topic: 'CHATGPT',
    query: process.env.X_QUERY_CHATGPT || 'ChatGPT OR OpenAI',
  },
  {
    topic: 'GEMINI',
    query: process.env.X_QUERY_GEMINI || 'Gemini OR "Google AI" OR DeepMind',
  },
].map((entry) => ({
  topic: entry.topic,
  query: normalizeWhitespace(entry.query),
})).filter((entry) => entry.query);

function buildSearchQuery(query) {
  return normalizeWhitespace([`(${query})`, queryFilters].filter(Boolean).join(' '));
}

function compactNumber(value) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

function cleanPostText(text) {
  const withoutUrls = String(text || '').replace(/https:\/\/t\.co\/\w+/gi, '');
  return normalizeWhitespace(withoutUrls);
}

function buildReason(metrics = {}) {
  const parts = [];
  if ((metrics.like_count || 0) > 0) parts.push(`${compactNumber(metrics.like_count)} likes`);
  if ((metrics.retweet_count || 0) > 0) parts.push(`${compactNumber(metrics.retweet_count)} reposts`);
  if ((metrics.reply_count || 0) > 0) parts.push(`${compactNumber(metrics.reply_count)} replies`);
  if ((metrics.quote_count || 0) > 0) parts.push(`${compactNumber(metrics.quote_count)} quotes`);
  return parts.join(', ') || 'Recent X post from the AI conversation.';
}

function pickImageUrl(post, mediaByKey) {
  const keys = Array.isArray(post?.attachments?.media_keys) ? post.attachments.media_keys : [];
  for (const mediaKey of keys) {
    const media = mediaByKey.get(mediaKey);
    if (!media) continue;
    if (typeof media.url === 'string' && media.url) return media.url;
    if (typeof media.preview_image_url === 'string' && media.preview_image_url) return media.preview_image_url;
  }
  return '';
}

function buildRawScore(post, imageUrl) {
  const metrics = post?.public_metrics || {};
  const likes = Number(metrics.like_count) || 0;
  const reposts = Number(metrics.retweet_count) || 0;
  const replies = Number(metrics.reply_count) || 0;
  const quotes = Number(metrics.quote_count) || 0;
  const bookmarks = Number(metrics.bookmark_count) || 0;
  const impressions = Number(metrics.impression_count) || 0;
  const createdAt = new Date(post?.created_at || '');
  const hoursAgo = Number.isNaN(createdAt.getTime())
    ? 72
    : Math.max(0, (Date.now() - createdAt.getTime()) / (1000 * 60 * 60));
  const recencyBonus = Math.max(0, 48 - hoursAgo) * 1.2;

  return likes
    + reposts * 2.4
    + replies * 1.5
    + quotes * 2.2
    + bookmarks * 1.8
    + impressions * 0.004
    + recencyBonus
    + (imageUrl ? 18 : 0);
}

function normalizeVirality(items) {
  const maxLogScore = Math.max(
    1,
    ...items.map((item) => Math.log10((Number(item._rawScore) || 0) + 1)),
  );

  return items.map((item) => {
    const rawScore = Number(item._rawScore) || 0;
    const ranking = clamp(Math.round((Math.log10(rawScore + 1) / maxLogScore) * 100));
    return {
      ...item,
      ranking,
      virality: ranking,
      fit: TOPIC_FIT[item.topic] || 85,
      rating: clamp(Math.round((ranking * 0.7) + ((TOPIC_FIT[item.topic] || 85) * 0.3))),
    };
  }).map(({ _rawScore, ...item }) => item);
}

async function fetchTopicPosts(topicConfig) {
  const url = new URL(endpoint);
  url.searchParams.set('query', buildSearchQuery(topicConfig.query));
  url.searchParams.set('max_results', String(perTopic));
  url.searchParams.set('sort_order', sortOrder);
  url.searchParams.set('tweet.fields', 'created_at,public_metrics,author_id,attachments');
  url.searchParams.set('expansions', 'author_id,attachments.media_keys');
  url.searchParams.set('user.fields', 'name,username');
  url.searchParams.set('media.fields', 'url,preview_image_url,type');

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${bearerToken}`,
      accept: 'application/json',
      'user-agent': DEFAULT_USER_AGENT,
    },
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`${topicConfig.topic} search failed with ${res.status}: ${details.slice(0, 240)}`);
  }

  const json = await res.json();
  const users = new Map((json?.includes?.users || []).map((user) => [user.id, user]));
  const media = new Map((json?.includes?.media || []).map((entry) => [entry.media_key, entry]));
  const posts = Array.isArray(json?.data) ? json.data : [];

  return posts.map((post) => {
    const author = users.get(post.author_id) || {};
    const headline = cleanPostText(post.text);
    const imageUrl = pickImageUrl(post, media);
    const postUrl = author.username
      ? `https://x.com/${author.username}/status/${post.id}`
      : `https://x.com/i/web/status/${post.id}`;

    return {
      topic: topicConfig.topic,
      headline: headline || `X post about ${topicConfig.topic}`,
      link: postUrl,
      source: 'X',
      author: author.username || '',
      full_name: author.name || '',
      published_at: post.created_at || nowIso(),
      image_url: imageUrl || '',
      reason: buildReason(post.public_metrics),
      score: buildRawScore(post, imageUrl),
      like_count: Number(post?.public_metrics?.like_count) || 0,
      repost_count: Number(post?.public_metrics?.retweet_count) || 0,
      reply_count: Number(post?.public_metrics?.reply_count) || 0,
      quote_count: Number(post?.public_metrics?.quote_count) || 0,
      _rawScore: buildRawScore(post, imageUrl),
    };
  });
}

async function main() {
  if (!bearerToken) {
    throw new Error('Missing X_BEARER_TOKEN');
  }
  if (!TOPIC_QUERIES.length) {
    throw new Error('No X topic queries configured');
  }

  const data = await readJson(input);
  const settled = await Promise.allSettled(TOPIC_QUERIES.map(fetchTopicPosts));

  const items = [];
  const failures = [];
  settled.forEach((result, index) => {
    const topic = TOPIC_QUERIES[index]?.topic || `topic-${index + 1}`;
    if (result.status === 'fulfilled') {
      items.push(...result.value);
      if (!result.value.length) failures.push(`${topic}:0`);
    } else {
      failures.push(`${topic}:${result.reason?.message || 'failed'}`);
    }
  });

  if (!items.length) {
    throw new Error(`No X items returned. Failures: ${failures.join(' | ') || 'unknown'}`);
  }

  const normalizedItems = normalizeVirality(items).sort((a, b) => {
    if ((b.ranking || 0) !== (a.ranking || 0)) return (b.ranking || 0) - (a.ranking || 0);
    return new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime();
  });

  const generatedAt = nowIso();
  const outputData = {
    ...data,
    x_viral: {
      generated_at: generatedAt,
      source: 'x-api-recent-search',
      sort_order: sortOrder,
      per_topic: perTopic,
      queries: TOPIC_QUERIES,
      note: failures.length
        ? `Partial refresh. ${failures.join(' | ')}`
        : 'Updated from the X recent search API via GitHub Actions.',
      items: normalizedItems,
    },
    pipeline_meta: {
      ...(data.pipeline_meta || {}),
      x_viral_generated_at: generatedAt,
      x_viral_source: 'x-api-recent-search',
    },
  };

  await writeJsonAtomic(output, outputData);

  console.log(JSON.stringify({
    stage: 'update-x-feed',
    in: input,
    out: output,
    at: generatedAt,
    counts: {
      topics: TOPIC_QUERIES.length,
      x_items: normalizedItems.length,
    },
    failures,
  }, null, 2));
}

main().catch((err) => {
  console.error('[update-x-feed] failed:', err);
  process.exitCode = 1;
});
