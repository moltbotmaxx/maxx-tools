require("dotenv").config();
const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const ROOT_DIR = path.resolve(__dirname);
const PARTICIPANTS_PATH = path.join(ROOT_DIR, "participants", "players.txt");
const COMMENTERS_PATH = path.join(ROOT_DIR, "participants", "commenters.json");
const PLAYERS_JSON_PATH = path.join(ROOT_DIR, "battle", "players.json");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const serverState = {
  extracting: false,
  lastError: null,
  lastExtract: null,
  progress: {
    detail: "Idle.",
    percent: 0,
    phase: "idle",
  },
};

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}

function setProgress(percent, phase, detail) {
  serverState.progress = {
    detail,
    percent: clampPercent(percent),
    phase,
  };
}

function parseFlag(argv, name, fallback) {
  const prefix = `--${name}=`;
  const match = argv.find((value) => value.startsWith(prefix));
  if (!match) {
    return fallback;
  }
  return match.slice(prefix.length);
}

function parseShortcode(input) {
  const value = `${input || ""}`.trim();
  if (!value) {
    throw new Error("Post URL is required.");
  }

  const urlMatch = value.match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/i);
  if (urlMatch) {
    return urlMatch[1];
  }

  const shortcodeMatch = value.match(/^[A-Za-z0-9_-]{5,}$/);
  if (shortcodeMatch) {
    return shortcodeMatch[0];
  }

  throw new Error("Could not extract a valid Instagram shortcode from the provided URL.");
}

function resolveRequestPath(requestUrl) {
  const requestPath = new URL(requestUrl, "http://127.0.0.1").pathname;
  if (requestPath === "/favicon.ico") {
    return "__favicon__";
  }
  const relativePath = requestPath === "/" ? "/app/index.html" : requestPath;
  const absolutePath = path.resolve(ROOT_DIR, `.${relativePath}`);

  if (!absolutePath.startsWith(ROOT_DIR)) {
    return null;
  }

  return absolutePath;
}

function sendResponse(response, statusCode, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  });
  response.end(body);
}

function sendJson(response, statusCode, payload) {
  sendResponse(response, statusCode, JSON.stringify(payload), "application/json; charset=utf-8");
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function readTextFile(filePath) {
  try {
    return await fsp.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function buildStatePayload() {
  const metadata = await readJsonFile(COMMENTERS_PATH);
  const playersContent = await readTextFile(PARTICIPANTS_PATH);
  const battlePlayers = await readJsonFile(PLAYERS_JSON_PATH);
  const participants = playersContent
    ? playersContent.split("\n").map((value) => value.trim()).filter(Boolean)
    : [];

  return {
    battleReady: Array.isArray(battlePlayers) && battlePlayers.length > 0,
    extracting: serverState.extracting,
    hasCredentials: Boolean(process.env.IG_USERNAME && process.env.IG_PASSWORD),
    lastError: serverState.lastError,
    lastExtract:
      serverState.lastExtract ||
      (metadata
        ? {
            extractedAt: metadata.extracted_at || null,
            filter: metadata.filter || null,
            mediaId: metadata.media_id || null,
            ownerUsername: metadata.owner_username || null,
            participantCount: Array.isArray(metadata.participants) ? metadata.participants.length : participants.length,
            shortcode: metadata.shortcode || null,
            source: metadata.source || "browser",
            topLevelCommentsSeen: metadata.top_level_comments_seen || null,
          }
        : null),
    participantCount: participants.length,
    participantsPreview: participants.slice(0, 12),
    progress: serverState.progress,
  };
}

function detectPythonExecutable() {
  const venvPython = path.join(ROOT_DIR, ".venv", "bin", "python3");
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  return "python3";
}

function runCommand(command, args, env, options = {}) {
  const { timeoutMs = 0 } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let settled = false;
    let timeoutId = null;
    let stdout = "";
    let stderr = "";

    const finish = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      callback();
    };

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 1500).unref();
        finish(() => {
          reject(new Error(`${command} ${args.join(" ")} timed out after ${Math.round(timeoutMs / 1000)}s`));
        });
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", (error) => {
      finish(() => reject(error));
    });
    child.once("close", (code) => {
      finish(() => {
        if (code === 0) {
          resolve({ stderr, stdout });
          return;
        }
        reject(
          new Error(
            [stdout.trim(), stderr.trim()].filter(Boolean).join("\n") || `${command} exited with code ${code}`,
          ),
        );
      });
    });
  });
}

async function handleExtractRequest(response, bodyText) {
  if (serverState.extracting) {
    sendJson(response, 409, {
      error: "An extraction is already running.",
    });
    return;
  }

  let payload;
  try {
    payload = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    sendJson(response, 400, {
      error: "Invalid JSON body.",
    });
    return;
  }

  const filterText = `${payload.filterText || ""}`.trim();
  const normalizedFilterText = filterText || null;

  let shortcode;
  try {
    shortcode = parseShortcode(payload.postUrl);
  } catch (error) {
    sendJson(response, 400, {
      error: error.message,
    });
    return;
  }

  if (!process.env.IG_USERNAME || !process.env.IG_PASSWORD) {
    sendJson(response, 400, {
      error: "IG_USERNAME and IG_PASSWORD must be present in the server environment.",
    });
    return;
  }

  serverState.extracting = true;
  serverState.lastError = null;
  setProgress(6, "starting", "Starting extraction...");

  const env = { ...process.env };
  const python = detectPythonExecutable();

  try {
    setProgress(18, "comments", "Reading comments from Instagram...");
    const extractArgs = [
      "extract_participants_browser.js",
      shortcode,
      ...(normalizedFilterText ? ["--contains", normalizedFilterText] : []),
      "--output",
      "participants/players.txt",
      "--metadata-output",
      "participants/commenters.json",
    ];
    await runCommand(
      "node",
      extractArgs,
      env,
      { timeoutMs: 150_000 },
    );
    setProgress(62, "avatars", "Downloading profile pictures...");
    await runCommand(
      python,
      [
        "download_avatars.py",
        "--input",
        "participants/players.txt",
        "--metadata",
        "participants/commenters.json",
        "--overwrite",
      ],
      env,
      { timeoutMs: 120_000 },
    );
    setProgress(88, "battle", "Preparing battle data...");
    await runCommand(
      python,
      [
        "generate_players_json.py",
        "--input",
        "participants/players.txt",
      ],
      env,
      { timeoutMs: 60_000 },
    );

    const metadata = (await readJsonFile(COMMENTERS_PATH)) || {};
    serverState.lastExtract = {
      extractedAt: metadata.extracted_at || new Date().toISOString(),
      filter: normalizedFilterText,
      mediaId: metadata.media_id || null,
      ownerUsername: metadata.owner_username || null,
      participantCount: Array.isArray(metadata.participants) ? metadata.participants.length : null,
      shortcode,
      source: "browser",
      topLevelCommentsSeen: metadata.top_level_comments_seen || null,
    };
    serverState.extracting = false;
    setProgress(100, "complete", "Extraction finished. Battle is ready.");

    sendJson(response, 200, {
      ok: true,
      state: await buildStatePayload(),
    });
  } catch (error) {
    serverState.lastError = error.message;
    serverState.extracting = false;
    setProgress(serverState.progress.percent || 0, "error", `Extraction failed: ${error.message}`);
    sendJson(response, 500, {
      error: error.message,
      state: await buildStatePayload(),
    });
  } finally {
    serverState.extracting = false;
  }
}

async function handleApiRequest(request, response) {
  const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;

  if (request.method === "OPTIONS") {
    sendResponse(response, 204, "");
    return true;
  }

  if (pathname === "/api/state" && request.method === "GET") {
    sendJson(response, 200, await buildStatePayload());
    return true;
  }

  if (pathname === "/api/extract" && request.method === "POST") {
    const bodyText = await readRequestBody(request);
    await handleExtractRequest(response, bodyText);
    return true;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(response, 404, {
      error: "API route not found.",
    });
    return true;
  }

  return false;
}

function startStaticServer({ port = 0, host = "127.0.0.1" } = {}) {
  const server = http.createServer(async (request, response) => {
    try {
      if (await handleApiRequest(request, response)) {
        return;
      }
    } catch (error) {
      sendJson(response, 500, {
        error: error.message || "Unexpected server error.",
      });
      return;
    }

    const targetPath = resolveRequestPath(request.url || "/");
    if (!targetPath) {
      sendResponse(response, 403, "Forbidden");
      return;
    }
    if (targetPath === "__favicon__") {
      sendResponse(response, 204, "");
      return;
    }

    fs.stat(targetPath, (error, stats) => {
      if (error || !stats.isFile()) {
        sendResponse(response, 404, "Not found");
        return;
      }

      const extension = path.extname(targetPath).toLowerCase();
      const stream = fs.createReadStream(targetPath);
      response.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
        "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      });
      stream.pipe(response);
      stream.on("error", () => {
        if (!response.headersSent) {
          sendResponse(response, 500, "Failed to read file");
        } else {
          response.destroy();
        }
      });
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      const url = `http://${host}:${actualPort}`;
      resolve({
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
        port: actualPort,
        server,
        url,
      });
    });
  });
}

function openUrl(targetUrl) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";

  spawn(command, [targetUrl], {
    detached: true,
    shell: process.platform === "win32",
    stdio: "ignore",
  }).unref();
}

async function main() {
  const argv = process.argv.slice(2);
  const port = Number.parseInt(parseFlag(argv, "port", "3000"), 10);
  const host = parseFlag(argv, "host", "127.0.0.1");
  const shouldOpen = argv.includes("--open");

  const server = await startStaticServer({ host, port: Number.isFinite(port) ? port : 3000 });
  console.log(`Serving ${ROOT_DIR} at ${server.url}`);

  if (shouldOpen) {
    openUrl(server.url);
  }

  const closeServer = async () => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", closeServer);
  process.on("SIGTERM", closeServer);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  startStaticServer,
};
