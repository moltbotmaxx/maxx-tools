import { nowIso, readJson, toAbsolute, writeJson, getArg } from './pipeline-utils.mjs';

const input = toAbsolute(getArg('--in', 'daily-tracker/data.json'));
const output = toAbsolute(getArg('--out', 'daily-tracker/data.json'));

async function main() {
  const data = await readJson(input);
  const normalized = {
    articles: Array.isArray(data.articles) ? data.articles : [],
    x_viral: data.x_viral && typeof data.x_viral === 'object' ? data.x_viral : { items: [] },
    reddit_viral: data.reddit_viral && typeof data.reddit_viral === 'object' ? data.reddit_viral : { items: [] },
    pipeline_meta: {
      ...(data.pipeline_meta || {}),
      last_stage: 'scrape',
      scrape_at: nowIso(),
      source_file: input,
    },
  };

  await writeJson(output, normalized);
  console.log(
    JSON.stringify(
      {
        stage: 'scrape',
        in: input,
        out: output,
        counts: {
          articles: normalized.articles.length,
          x_items: Array.isArray(normalized.x_viral.items) ? normalized.x_viral.items.length : 0,
          reddit_items: Array.isArray(normalized.reddit_viral.items) ? normalized.reddit_viral.items.length : 0,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error('[scrape] failed:', err);
  process.exitCode = 1;
});
