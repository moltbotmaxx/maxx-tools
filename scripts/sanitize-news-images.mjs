import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_FILES = [
  path.join(ROOT, 'news-ticker/public/data.json'),
  path.join(ROOT, 'daily-tracker/data.json'),
];

const REQUEST_TIMEOUT_MS = 12000;

function isLikelyHttpUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function urlReturnsImage(url) {
  if (!isLikelyHttpUrl(url)) return false;

  try {
    const head = await fetchWithTimeout(url, { method: 'HEAD' });
    if (head.ok) {
      const ct = (head.headers.get('content-type') || '').toLowerCase();
      if (ct.startsWith('image/')) return true;
      const cl = Number(head.headers.get('content-length') || '0');
      if (ct === '' && cl > 0) return true;
    }
  } catch {
    // fall through to GET probe
  }

  try {
    const getProbe = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    });
    if (!getProbe.ok) return false;

    const ct = (getProbe.headers.get('content-type') || '').toLowerCase();
    return ct.startsWith('image/');
  } catch {
    return false;
  }
}

function sortJsonKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortJsonKeys);
  if (!obj || typeof obj !== 'object') return obj;

  const out = {};
  for (const key of Object.keys(obj)) {
    out[key] = sortJsonKeys(obj[key]);
  }
  return out;
}

async function processFile(filePath) {
  const raw = await readFile(filePath, 'utf8');
  const json = JSON.parse(raw);

  if (!Array.isArray(json.articles)) {
    throw new Error(`${filePath} has no articles array`);
  }

  const urlCache = new Map();
  let removed = 0;
  let checked = 0;

  for (const article of json.articles) {
    const current = article?.image_url;
    if (!current) continue;

    if (!urlCache.has(current)) {
      checked += 1;
      urlCache.set(current, await urlReturnsImage(current));
    }

    if (!urlCache.get(current)) {
      article.image_url = '';
      removed += 1;
    }
  }

  const normalized = sortJsonKeys(json);
  const output = JSON.stringify(normalized, null, 4) + '\n';

  if (output !== raw) {
    await writeFile(filePath, output, 'utf8');
  }

  return { filePath, checked, removed, changed: output !== raw };
}

async function main() {
  const results = [];
  for (const filePath of TARGET_FILES) {
    results.push(await processFile(filePath));
  }

  for (const r of results) {
    console.log(`${path.relative(ROOT, r.filePath)}: checked unique URLs=${r.checked}, removed broken images=${r.removed}, changed=${r.changed}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
