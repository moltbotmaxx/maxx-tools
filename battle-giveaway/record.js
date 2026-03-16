const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

const ffmpegPath = require("ffmpeg-static");
const puppeteer = require("puppeteer");

const { startStaticServer } = require("./serve");

const ROOT_DIR = path.resolve(__dirname);
const OUTPUT_DIR = path.join(ROOT_DIR, "output");
const TEMP_DIR = path.join(ROOT_DIR, "temp");

function parseArg(argv, name, fallback = null) {
  const prefix = `--${name}=`;
  const match = argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(argv, name) {
  return argv.includes(`--${name}`);
}

function padFrame(frameIndex) {
  return String(frameIndex).padStart(6, "0");
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function ensureDirectory(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function removeDirectory(targetPath) {
  await fs.rm(targetPath, { force: true, recursive: true });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const executable = ffmpegPath || "ffmpeg";
    const processHandle = spawn(executable, args, { stdio: "inherit" });

    processHandle.once("error", reject);
    processHandle.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

async function captureFrames(page, framesDir, fps, timeoutMs) {
  const frameDuration = 1000 / fps;
  const startTime = Date.now();
  let frameIndex = 0;
  let finalState = null;

  while (Date.now() - startTime < timeoutMs) {
    const tickStarted = Date.now();
    const framePath = path.join(framesDir, `frame-${padFrame(frameIndex)}.png`);
    await page.screenshot({ path: framePath, type: "png" });
    frameIndex += 1;

    finalState = await page.evaluate(() => window.__battleState || null);
    if (finalState?.finished) {
      break;
    }

    const delay = frameDuration - (Date.now() - tickStarted);
    if (delay > 0) {
      await sleep(delay);
    }
  }

  if (!finalState?.finished) {
    throw new Error(`Timed out after ${timeoutMs}ms while waiting for the battle to finish.`);
  }

  const holdFrames = Math.max(1, Math.floor(fps * 1.5));
  for (let index = 0; index < holdFrames; index += 1) {
    const framePath = path.join(framesDir, `frame-${padFrame(frameIndex)}.png`);
    await page.screenshot({ path: framePath, type: "png" });
    frameIndex += 1;
  }

  return { frameCount: frameIndex, state: finalState };
}

async function main() {
  const argv = process.argv.slice(2);
  const width = Number.parseInt(parseArg(argv, "width", "1080"), 10);
  const height = Number.parseInt(parseArg(argv, "height", "1920"), 10);
  const fps = Number.parseInt(parseArg(argv, "fps", "30"), 10);
  const holdMs = Number.parseInt(parseArg(argv, "hold-ms", "2600"), 10);
  const timeoutMs = Number.parseInt(parseArg(argv, "timeout", "120000"), 10);
  const outputPath = path.resolve(parseArg(argv, "output", path.join(OUTPUT_DIR, "battle.mp4")));
  const keepFrames = hasFlag(argv, "keep-frames");
  const seed = parseArg(argv, "seed", `${Date.now()}`);

  await ensureDirectory(OUTPUT_DIR);
  await ensureDirectory(TEMP_DIR);

  const framesDir = path.join(TEMP_DIR, `frames-${Date.now()}`);
  await ensureDirectory(framesDir);

  const server = await startStaticServer({ host: "127.0.0.1", port: 0 });
  const browser = await puppeteer.launch({
    defaultViewport: {
      width,
      height,
      deviceScaleFactor: 1,
    },
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        console.error(`[page:${message.type()}] ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      console.error(`[pageerror] ${error.stack || error.message}`);
    });
    page.on("requestfailed", (request) => {
      console.error(
        `[requestfailed] ${request.failure()?.errorText || "unknown"} ${request.url()}`,
      );
    });

    await page.goto(
      `${server.url}/battle/index.html?width=${width}&height=${height}&seed=${encodeURIComponent(seed)}&holdMs=${holdMs}`,
      { waitUntil: "load", timeout: timeoutMs },
    );
    await page.waitForFunction(() => window.__battleState?.ready === true, {
      timeout: timeoutMs,
    });

    const captureSummary = await captureFrames(page, framesDir, fps, timeoutMs);

    await runFfmpeg([
      "-y",
      "-framerate",
      `${fps}`,
      "-i",
      path.join(framesDir, "frame-%06d.png"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    console.log(
      `Saved ${outputPath} with ${captureSummary.frameCount} frames. Winner: ${captureSummary.state.winner || "none"}`,
    );
  } finally {
    await browser.close();
    await server.close();
    if (!keepFrames) {
      await removeDirectory(framesDir);
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
