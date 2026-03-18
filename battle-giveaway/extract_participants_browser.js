const fs = require("fs/promises");
const path = require("path");

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

function parseArg(argv, name, fallback = null) {
  const prefix = `--${name}=`;
  const inline = argv.find((value) => value.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = argv.indexOf(`--${name}`);
  if (index >= 0 && index + 1 < argv.length) {
    return argv[index + 1];
  }

  return fallback;
}

function normalizeUsername(value) {
  return value.trim().replace(/^@+/, "");
}

function looksLikeUsername(value) {
  return /^[a-z0-9._]{2,30}$/i.test(value);
}

async function loginToInstagram(page, username, password) {
  await page.goto("https://www.instagram.com/accounts/login/", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForFunction(() => document.querySelectorAll("input").length >= 2, {
    timeout: 30000,
  });

  const inputs = await page.$$("input");
  await inputs[0].type(username, { delay: 35 });
  await inputs[1].type(password, { delay: 35 });
  await inputs[1].press("Enter");

  await Promise.race([
    page
      .waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })
      .catch(() => null),
    page
      .waitForFunction(() => !window.location.pathname.startsWith("/accounts/login"), {
        timeout: 30000,
      })
      .catch(() => null),
    new Promise((resolve) => setTimeout(resolve, 15000)),
  ]);

  await new Promise((resolve) => setTimeout(resolve, 2000));
}

function extractMediaIdFromHtml(html) {
  const patterns = [
    /"media_id":"(\d+)"/,
    /"media_pk":"(\d+)"/,
    /instagram:\/\/media\?id=(\d+)/,
    /property="al:ios:url"\s+content="instagram:\/\/media\?id=(\d+)"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return match[1];
    }
  }

  throw new Error("Could not determine media_id from the post page.");
}

async function extractOwnerUsername(page) {
  const owner = await page.evaluate(() => {
    const description =
      document.querySelector('meta[name="description"]')?.content ||
      document.querySelector('meta[property="og:description"]')?.content ||
      "";
    const descriptionMatch = description.match(/\bcomments?\s+-\s+([a-z0-9._]{2,30})\s+on\b/i);
    if (descriptionMatch) {
      return descriptionMatch[1];
    }

    const articleOwnerLink = document.querySelector('article header a[href^="/"]');
    const href = articleOwnerLink?.getAttribute("href") || "";
    const hrefParts = href.split("/").filter(Boolean);
    if (hrefParts[0] && /^[a-z0-9._]{2,30}$/i.test(hrefParts[0])) {
      return hrefParts[0];
    }

    const ogTitle = document.querySelector('meta[property="og:title"]')?.content || "";
    const ogTitleMatch = ogTitle.match(/^([a-z0-9._]{2,30})\s+on Instagram:/i);
    if (ogTitleMatch) {
      return ogTitleMatch[1];
    }

    const lines = document.body.innerText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.find((line) => /^[a-z0-9._]{2,30}$/i.test(line) && line.toLowerCase() !== "home") || null;
  });

  if (!owner) {
    throw new Error("Could not determine the post owner username.");
  }

  return normalizeUsername(owner);
}

async function fetchCommentPage(page, mediaId, minId = null) {
  return page.evaluate(
    async ({ mediaId: mediaIdentifier, minId: nextMinId }) => {
      const url = new URL(`/api/v1/media/${mediaIdentifier}/comments/`, window.location.origin);
      url.searchParams.set("can_support_threading", "true");
      url.searchParams.set("permalink_enabled", "false");
      if (nextMinId) {
        url.searchParams.set("min_id", nextMinId);
      }

      const response = await fetch(url.toString(), {
        credentials: "include",
      });

      const payload = await response.json();
      return {
        ok: response.ok,
        payload,
        status: response.status,
      };
    },
    { mediaId, minId },
  );
}

async function fetchChildCommentPage(page, mediaId, commentId, maxId = null) {
  return page.evaluate(
    async ({
      commentId: parentCommentId,
      maxId: nextMaxId,
      mediaId: mediaIdentifier,
    }) => {
      const url = new URL(
        `/api/v1/media/${mediaIdentifier}/comments/${parentCommentId}/child_comments/`,
        window.location.origin,
      );
      if (nextMaxId) {
        url.searchParams.set("max_id", nextMaxId);
      }

      const response = await fetch(url.toString(), {
        credentials: "include",
      });

      const payload = await response.json();
      return {
        ok: response.ok,
        payload,
        status: response.status,
      };
    },
    { mediaId, commentId, maxId },
  );
}

function maybeAddMatch({
  commentId,
  commentText,
  filterLower,
  includePostOwner,
  matches,
  ownerUsername,
  user,
}) {
  if (!user?.username) {
    return;
  }

  const username = normalizeUsername(user.username);
  if (!includePostOwner && username.toLowerCase() === ownerUsername.toLowerCase()) {
    return;
  }

  if (filterLower && !commentText.toLowerCase().includes(filterLower)) {
    return;
  }

  matches.push({
    avatar_url: user.profile_pic_url || null,
    comment_id: String(commentId),
    text: commentText,
    username,
  });
}

function collectMatchesFromPayload(payload, filterLower, ownerUsername, includePostOwner) {
  const matches = [];

  for (const comment of payload.comments || []) {
    maybeAddMatch({
      commentId: comment.pk,
      commentText: comment.text || "",
      filterLower,
      includePostOwner,
      matches,
      ownerUsername,
      user: comment.user,
    });

    for (const reply of comment.preview_child_comments || []) {
      maybeAddMatch({
        commentId: reply.pk,
        commentText: reply.text || "",
        filterLower,
        includePostOwner,
        matches,
        ownerUsername,
        user: reply.user,
      });
    }
  }

  return matches;
}

function dedupeParticipants(matches) {
  const result = [];
  const seen = new Set();

  for (const match of matches) {
    const key = match.username.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(match);
  }

  return result;
}

async function collectChildMatchesForComment(
  page,
  mediaId,
  comment,
  filterLower,
  ownerUsername,
  includePostOwner,
) {
  const matches = [];
  const seenChildCommentIds = new Set();
  const seenCursors = new Set();
  let maxId = null;

  for (let pageIndex = 0; pageIndex < 50; pageIndex += 1) {
    const response = await fetchChildCommentPage(page, mediaId, comment.pk, maxId);
    if (!response.ok || response.payload?.status === "fail") {
      throw new Error(
        `Instagram child comment API failed with status ${response.status}: ${response.payload?.message || "unknown error"}`,
      );
    }

    const childComments = response.payload.child_comments || [];
    for (const childComment of childComments) {
      const childCommentId = String(childComment.pk);
      if (seenChildCommentIds.has(childCommentId)) {
        continue;
      }
      seenChildCommentIds.add(childCommentId);
      maybeAddMatch({
        commentId: childComment.pk,
        commentText: childComment.text || "",
        filterLower,
        includePostOwner,
        matches,
        ownerUsername,
        user: childComment.user,
      });
    }

    const nextCursor =
      response.payload.next_max_child_cursor ||
      response.payload.next_max_id ||
      response.payload.next_min_id ||
      null;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      break;
    }

    seenCursors.add(nextCursor);
    maxId = nextCursor;
  }

  return matches;
}

async function scrapeParticipants({
  contains,
  includePostOwner,
  password,
  sessionId,
  shortcode,
  username,
}) {
  const launchOptions = {
    headless: true,
    defaultViewport: {
      width: 1280,
      height: 2000,
      deviceScaleFactor: 1,
    },
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    launchOptions.args = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];
  }

  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    
    if (sessionId) {
      console.log("Using IG_SESSIONID for authentication...");
      await page.setCookie({
        name: "sessionid",
        value: sessionId,
        domain: ".instagram.com",
        path: "/",
        httpOnly: true,
        secure: true,
      });
    } else {
      await loginToInstagram(page, username, password);
    }

    await page.goto(`https://www.instagram.com/p/${shortcode}/`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForFunction(() => document.body.innerText.length > 200, {
      timeout: 30000,
    });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const ownerUsername = await extractOwnerUsername(page);
    const mediaId = extractMediaIdFromHtml(await page.content());
    const filterLower = contains.toLowerCase();

    const allMatches = [];
    const seenCommentIds = new Set();
    const seenCursors = new Set();
    let minId = null;

    for (let pageIndex = 0; pageIndex < 50; pageIndex += 1) {
      const response = await fetchCommentPage(page, mediaId, minId);
      if (!response.ok || response.payload?.status === "fail") {
        throw new Error(
          `Instagram comment API failed with status ${response.status}: ${response.payload?.message || "unknown error"}`,
        );
      }

      const payload = response.payload;
      const comments = payload.comments || [];
      if (!comments.length && !payload.next_min_id) {
        break;
      }

      comments.forEach((comment) => {
        seenCommentIds.add(String(comment.pk));
      });

      allMatches.push(
        ...collectMatchesFromPayload(payload, filterLower, ownerUsername, includePostOwner),
      );

      for (const comment of comments) {
        if (!(comment.child_comment_count > 0)) {
          continue;
        }
        allMatches.push(
          ...(await collectChildMatchesForComment(
            page,
            mediaId,
            comment,
            filterLower,
            ownerUsername,
            includePostOwner,
          )),
        );
      }

      const nextMinId = payload.next_min_id || null;
      if (!nextMinId || seenCursors.has(nextMinId)) {
        break;
      }
      seenCursors.add(nextMinId);
      minId = nextMinId;
    }

    return {
      mediaId,
      ownerUsername,
      participants: dedupeParticipants(allMatches),
      topLevelCommentCount: seenCommentIds.size,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const shortcode = argv[0];
  const contains = parseArg(argv, "contains", "");
  const outputPath = path.resolve(parseArg(argv, "output", path.join("participants", "players.txt")));
  const metadataOutputPath = path.resolve(
    parseArg(argv, "metadata-output", path.join("participants", "commenters.json")),
  );
  const includePostOwner = argv.includes("--include-post-owner");

  const username = process.env.IG_USERNAME;
  const password = process.env.IG_PASSWORD;
  const sessionId = process.env.IG_SESSIONID;

  if (!shortcode) {
    throw new Error(
      "Usage: node extract_participants_browser.js SHORTCODE [--contains text] [--output path] [--metadata-output path]",
    );
  }
  if (!sessionId && (!username || !password)) {
    throw new Error("IG_SESSIONID (or IG_USERNAME and IG_PASSWORD) are required");
  }

  const result = await scrapeParticipants({
    contains,
    includePostOwner,
    password,
    sessionId,
    shortcode,
    username,
  });

  if (!result.participants.length) {
    throw new Error("No matching participants found in the full comment thread.");
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${result.participants.map((participant) => participant.username).join("\n")}\n`,
    "utf8",
  );

  await fs.mkdir(path.dirname(metadataOutputPath), { recursive: true });
  await fs.writeFile(
    metadataOutputPath,
    `${JSON.stringify(
      {
        extracted_at: new Date().toISOString(),
        filter: contains || null,
        media_id: result.mediaId,
        owner_username: result.ownerUsername,
        participants: result.participants,
        shortcode,
        source: "browser",
        top_level_comments_seen: result.topLevelCommentCount,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    `Saved ${result.participants.length} participants to ${outputPath} using media_id ${result.mediaId}.`,
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
