import {
  SCORING_VERSION,
  clamp,
  decodeHtmlEntities,
  fetchWithRetry,
  getArg,
  normalizeTitle,
  normalizeUrlForDedupe,
  normalizeWhitespace,
  nowIso,
  readJson,
  safeNumber,
  toAbsolute,
  toIsoDate,
  writeJson,
} from './pipeline-utils.mjs';

const input = toAbsolute(getArg('--in', 'daily-tracker/data.json'));
const output = toAbsolute(getArg('--out', 'daily-tracker/data.json'));

const MAX_ARTICLES = Number(getArg('--articles', '30')) || 30;
const WINDOW_HOURS = Number(getArg('--window-hours', '48')) || 48;

const SOURCE_QUALITY = new Map([
  ['reuters.com', 95],
  ['apnews.com', 94],
  ['bloomberg.com', 92],
  ['wsj.com', 90],
  ['ft.com', 90],
  ['nytimes.com', 88],
  ['theverge.com', 84],
  ['techcrunch.com', 82],
  ['wired.com', 82],
  ['arstechnica.com', 80],
  ['bbc.com', 80],
  ['cnbc.com', 78],
  ['news.google.com', 52],
  ['aol.com', 45],
]);

const RELEVANCE_TERMS = [
  'ai',
  'artificial intelligence',
  'openai',
  'chatgpt',
  'gpt',
  'claude',
  'anthropic',
  'gemini',
  'llm',
  'agent',
  'copilot',
  'deepmind',
  'microsoft',
  'google',
];

function parseDomain(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function tokenSet(text) {
  return new Set(
    normalizeTitle(text)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4),
  );
}

function extractCandidateImage(html, baseUrl) {
  if (!html) return null;
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (!m || !m[1]) continue;
    const decoded = decodeHtmlEntities(m[1].trim());
    try {
      const abs = new URL(decoded, baseUrl).href;
      if (/^https?:\/\//i.test(abs)) return abs;
    } catch {
      continue;
    }
  }
  return null;
}

function extractCanonicalUrl(html, fallbackUrl) {
  if (!html) return fallbackUrl;
  const canonicalPatterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  ];
  for (const p of canonicalPatterns) {
    const m = html.match(p);
    if (!m || !m[1]) continue;
    try {
      return new URL(decodeHtmlEntities(m[1].trim()), fallbackUrl).href;
    } catch {
      continue;
    }
  }
  return fallbackUrl;
}

async function resolveArticleLinkAndImage(link) {
  if (!link) return { finalUrl: '', imageUrl: null, error: 'missing_link' };
  try {
    const res = await fetchWithRetry(link, { method: 'GET' });
    const finalUrl = res.url || link;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text/html')) return { finalUrl, imageUrl: null, error: null };
    const html = await res.text();
    const canonicalUrl = extractCanonicalUrl(html, finalUrl);
    const imageUrl = extractCandidateImage(html, canonicalUrl);
    return { finalUrl: canonicalUrl, imageUrl: imageUrl || null, error: null };
  } catch (err) {
    return { finalUrl: link, imageUrl: null, error: err?.message || 'fetch_error' };
  }
}

function computeRelevance(article) {
  const haystack = normalizeTitle(
    `${article.headline || ''} ${article.reason || ''} ${article.source || ''} ${article.link || ''}`,
  );
  let hits = 0;
  for (const term of RELEVANCE_TERMS) {
    if (haystack.includes(term)) hits += 1;
  }
  const score = Math.min(100, Math.round((hits / RELEVANCE_TERMS.length) * 150));
  return clamp(score);
}

function computeRecency(articleIsoDate, now) {
  if (!articleIsoDate) return 0;
  const d = new Date(articleIsoDate);
  if (Number.isNaN(d.getTime())) return 0;
  const deltaHours = Math.max(0, (now.getTime() - d.getTime()) / (1000 * 60 * 60));
  if (deltaHours >= WINDOW_HOURS) return 0;
  const normalized = 1 - deltaHours / WINDOW_HOURS;
  return clamp(Math.round(normalized * 100));
}

function sourceQualityScore(url, sourceLabel) {
  const domain = parseDomain(url);
  if (domain && SOURCE_QUALITY.has(domain)) return SOURCE_QUALITY.get(domain);
  const label = normalizeTitle(sourceLabel);
  for (const [d, score] of SOURCE_QUALITY.entries()) {
    if (label.includes(d.replace('.com', ''))) return score;
  }
  return 60;
}

function buildTrendTokenSet(data) {
  const tokens = new Set();
  const xItems = Array.isArray(data.x_viral?.items) ? data.x_viral.items : [];
  const redditItems = Array.isArray(data.reddit_viral?.items) ? data.reddit_viral.items : [];
  [...xItems, ...redditItems].forEach((item) => {
    tokenSet(item.headline || '').forEach((t) => tokens.add(t));
  });
  return tokens;
}

function computeEngagement(article, trendTokens) {
  const articleTokens = tokenSet(article.headline || '');
  let overlap = 0;
  articleTokens.forEach((t) => {
    if (trendTokens.has(t)) overlap += 1;
  });
  const overlapScore = clamp(overlap * 14, 0, 70);
  const existingVirality = safeNumber(article.virality, 0);
  return clamp(Math.round(overlapScore + existingVirality * 0.3));
}

function computeFinalScore(relevance, recency, sourceQuality, engagement, duplicatePenalty = 0) {
  const finalScore =
    relevance * 0.35 + recency * 0.25 + sourceQuality * 0.2 + engagement * 0.2 - duplicatePenalty;
  return clamp(Math.round(finalScore));
}

function inWindow(isoDate, now) {
  const d = new Date(isoDate || '');
  if (Number.isNaN(d.getTime())) return false;
  const deltaHours = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
  return deltaHours >= 0 && deltaHours <= WINDOW_HOURS;
}

async function main() {
  const startAt = Date.now();
  const data = await readJson(input);
  const rawArticles = Array.isArray(data.articles) ? data.articles : [];
  const now = new Date();
  const trendTokens = buildTrendTokenSet(data);

  let imageResolvedCount = 0;
  let imageMissingCount = 0;
  const domainFailures = {};

  const enrichedArticles = [];
  for (const article of rawArticles) {
    const baseDate = toIsoDate(article.date || article.published_at || article.created_at);
    if (!baseDate || !inWindow(baseDate, now)) continue;

    const resolved = await resolveArticleLinkAndImage(article.link);
    const finalUrl = resolved.finalUrl || article.link || '';
    const domain = parseDomain(finalUrl);
    if (resolved.error && domain) {
      domainFailures[domain] = (domainFailures[domain] || 0) + 1;
    }

    const imageUrl = resolved.imageUrl || null;
    if (imageUrl) imageResolvedCount += 1;
    else imageMissingCount += 1;

    const relevance = computeRelevance(article);
    const recency = computeRecency(baseDate, now);
    const sourceQuality = sourceQualityScore(finalUrl, article.source || '');
    const engagement = computeEngagement(article, trendTokens);

    enrichedArticles.push({
      ...article,
      date: baseDate.split('T')[0],
      published_at: baseDate,
      link: finalUrl,
      canonical_url: normalizeUrlForDedupe(finalUrl),
      image_url: imageUrl,
      fit: clamp(Math.round(relevance)),
      virality: clamp(Math.round(engagement)),
      _score_parts: {
        relevance,
        recency,
        source_quality: sourceQuality,
        engagement,
      },
    });
  }

  const seenCanonical = new Set();
  const seenTitle = new Set();
  const deduped = [];
  const duplicateCounts = { canonical: {}, title: {} };
  enrichedArticles.forEach((article) => {
    const canonicalKey = article.canonical_url || '';
    const titleKey = normalizeTitle(article.headline || '');
    if (canonicalKey) duplicateCounts.canonical[canonicalKey] = (duplicateCounts.canonical[canonicalKey] || 0) + 1;
    if (titleKey) duplicateCounts.title[titleKey] = (duplicateCounts.title[titleKey] || 0) + 1;
  });

  enrichedArticles.forEach((article) => {
    const canonicalKey = article.canonical_url || '';
    const titleKey = normalizeTitle(article.headline || '');
    const byCanonical = canonicalKey && seenCanonical.has(canonicalKey);
    const byTitle = titleKey && seenTitle.has(titleKey);
    if (byCanonical || byTitle) return;
    if (canonicalKey) seenCanonical.add(canonicalKey);
    if (titleKey) seenTitle.add(titleKey);
    deduped.push(article);
  });

  deduped.forEach((article) => {
    const canonicalKey = article.canonical_url || '';
    const titleKey = normalizeTitle(article.headline || '');
    const dupByCanonical = canonicalKey ? duplicateCounts.canonical[canonicalKey] || 1 : 1;
    const dupByTitle = titleKey ? duplicateCounts.title[titleKey] || 1 : 1;
    const duplicatePenalty = Math.max(0, Math.max(dupByCanonical, dupByTitle) - 1) * 18;
    const finalScore = computeFinalScore(
      article._score_parts.relevance,
      article._score_parts.recency,
      article._score_parts.source_quality,
      article._score_parts.engagement,
      duplicatePenalty,
    );
    article.rating = finalScore;
    article.ranking = finalScore;
    article.reason = `Scored by relevance/recency/source/engagement (dup_penalty=${duplicatePenalty}).`;
  });

  deduped.sort((a, b) => safeNumber(b.rating, 0) - safeNumber(a.rating, 0));
  const top = deduped.slice(0, MAX_ARTICLES).map((article, idx) => ({
    ...article,
    rank_position: idx + 1,
    _score_parts: undefined,
  }));

  const result = {
    ...data,
    articles: top,
    pipeline_meta: {
      ...(data.pipeline_meta || {}),
      scoring_version: SCORING_VERSION,
      generated_at: nowIso(),
      last_stage: 'enrich',
      window_hours: WINDOW_HOURS,
      image_stats: {
        resolved: imageResolvedCount,
        missing: imageMissingCount,
      },
      duplicates_removed: enrichedArticles.length - deduped.length,
      duration_ms: Date.now() - startAt,
    },
  };

  await writeJson(output, result);

  console.log(
    JSON.stringify(
      {
        stage: 'enrich',
        in: input,
        out: output,
        counts: {
          raw_articles: rawArticles.length,
          filtered_articles: enrichedArticles.length,
          deduped_articles: deduped.length,
          final_articles: top.length,
        },
        images: {
          resolved: imageResolvedCount,
          missing: imageMissingCount,
        },
        domain_failures: domainFailures,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error('[enrich] failed:', err);
  process.exitCode = 1;
});
