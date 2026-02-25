import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_TIMEOUT_MS = 8000;
export const RETRY_ATTEMPTS = 1;
export const SCORING_VERSION = 'v2.0.0';
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

export function getArg(flag, fallback = '') {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

export function toAbsolute(p) {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

export function nowIso() {
  return new Date().toISOString();
}

export function clamp(num, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num));
}

export function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function normalizeTitle(text) {
  return normalizeWhitespace(String(text || '').toLowerCase());
}

export function normalizeUrlForDedupe(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url);
    u.hash = '';
    const removeParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'];
    removeParams.forEach((k) => u.searchParams.delete(k));
    const search = u.searchParams.toString();
    return `${u.origin}${u.pathname}${search ? `?${search}` : ''}`;
  } catch {
    return url.trim();
  }
}

export function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function toIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function writeJson(filePath, data) {
  const serialized = JSON.stringify(data, null, 2) + '\n';
  await writeFile(filePath, serialized, 'utf8');
}

export async function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.tmp`;
  await writeJson(tmp, data);
  await rename(tmp, filePath);
}

export async function fetchWithRetry(url, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS, retries = RETRY_ATTEMPTS) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        ...init,
        signal: controller.signal,
        headers: {
          'user-agent': DEFAULT_USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...init.headers,
        },
      });
      clearTimeout(timer);
      return response;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) await sleep(250);
    }
  }
  throw lastErr;
}
