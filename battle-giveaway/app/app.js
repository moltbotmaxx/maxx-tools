const postUrlInput = document.getElementById("post-url");
const filterTextInput = document.getElementById("filter-text");
const showNamesInput = document.getElementById("show-names");
const showAvatarsInput = document.getElementById("show-avatars");
const soundEnabledInput = document.getElementById("sound-enabled");
const circleSizeInput = document.getElementById("circle-size");
const nameSizeInput = document.getElementById("name-size");
const hitCountInput = document.getElementById("hit-count");
const finalHitCountInput = document.getElementById("final-hit-count");
const soundVolumeInput = document.getElementById("sound-volume");
const shakeScaleInput = document.getElementById("shake-scale");
const centerBiasInput = document.getElementById("center-bias");
const fightDriveInput = document.getElementById("fight-drive");
const chaosScaleInput = document.getElementById("chaos-scale");
const fxIntensityInput = document.getElementById("fx-intensity");
const extractButton = document.getElementById("extract-button");
const battleButton = document.getElementById("battle-button");
const circleSizeValue = document.getElementById("circle-size-value");
const nameSizeValue = document.getElementById("name-size-value");
const hitCountValue = document.getElementById("hit-count-value");
const finalHitCountValue = document.getElementById("final-hit-count-value");
const soundVolumeValue = document.getElementById("sound-volume-value");
const shakeScaleValue = document.getElementById("shake-scale-value");
const centerBiasValue = document.getElementById("center-bias-value");
const fightDriveValue = document.getElementById("fight-drive-value");
const chaosScaleValue = document.getElementById("chaos-scale-value");
const fxIntensityValue = document.getElementById("fx-intensity-value");
const credentialsStatus = document.getElementById("credentials-status");
const participantCount = document.getElementById("participant-count");
const extractSummary = document.getElementById("extract-summary");
const statusNote = document.getElementById("status-note");
const progressFill = document.getElementById("progress-fill");
const progressLabel = document.getElementById("progress-label");
const progressPercent = document.getElementById("progress-percent");
const participantsPreview = document.getElementById("participants-preview");
const previewSlot = document.getElementById("preview-slot");

const staticUploadPanel = document.getElementById("static-upload");
const serverControls = document.getElementById("server-controls");
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");

const POLL_INTERVAL_MS = 1200;

let latestState = null;
let pollTimer = null;
let staticMode = false;
let uploadedPlayers = null;

// ── Mode detection ──────────────────────────────────────────────────

async function detectMode() {
  const hostname = window.location.hostname;

  // Known static-only hosts
  if (hostname.endsWith(".github.io") || hostname.endsWith(".pages.dev") || hostname.endsWith(".netlify.app")) {
    return "static";
  }

  // Known server hosts (Railway, local dev)
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".railway.app")) {
    return "server";
  }

  // Unknown host — probe the API to decide
  try {
    const response = await fetch("/api/state", { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      return "server";
    }
  } catch {
    // server unreachable
  }

  return "static";
}

async function init() {
  const mode = await detectMode();
  staticMode = mode === "static";

  syncBattleControlLabels();

  if (staticMode) {
    initStaticMode();
  } else {
    initServerMode();
  }
}

// ── Static mode (GitHub Pages) ──────────────────────────────────────

function initStaticMode() {
  staticUploadPanel.classList.remove("hidden");
  serverControls.classList.add("hidden");
  extractButton.classList.add("hidden");

  credentialsStatus.textContent = "N/A";
  setStatus("Upload a players.json file to start.");

  dropZone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileSelect);
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragover");
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      loadJsonFile(file);
    }
  });
}

function handleFileSelect(event) {
  const file = event.target.files?.[0];
  if (file) {
    loadJsonFile(file);
  }
}

async function loadJsonFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!Array.isArray(data) || data.length === 0) {
      setStatus("Invalid file: expected a non-empty JSON array of players.", true);
      return;
    }

    uploadedPlayers = data;
    dropZone.classList.add("loaded");
    dropZone.querySelector("div > div:last-child").textContent =
      `✓ Loaded ${data.length} players from ${file.name}`;

    participantCount.textContent = `${data.length}`;
    extractSummary.textContent = `${data.length} players (file upload)`;
    battleButton.disabled = false;

    const preview = data.slice(0, 12).map((player) => player.name || player.id);
    participantsPreview.replaceChildren();
    for (const username of preview) {
      const pill = document.createElement("span");
      pill.textContent = `@${username}`;
      participantsPreview.append(pill);
    }

    setStatus(`Ready — ${data.length} players loaded. Hit "Run battle" to start!`);
  } catch (error) {
    setStatus(`Failed to parse file: ${error.message}`, true);
  }
}

// ── Server mode (local dev) ─────────────────────────────────────────

function initServerMode() {
  staticUploadPanel.classList.add("hidden");
  serverControls.classList.remove("hidden");
  extractButton.classList.remove("hidden");

  postUrlInput.value = "https://www.instagram.com/p/DVy3rKeIPF1/";
  filterTextInput.value = "";

  extractButton.addEventListener("click", onExtract);

  refreshState({ showLoading: true }).then(() => syncPolling());
}

async function refreshState(options = {}) {
  const { keepStatus = false, showLoading = false } = options;
  if (showLoading) {
    setStatus("Loading local state...");
  }
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    const state = await response.json();
    latestState = state;
    renderState(state, { keepStatus });
    syncPolling();
    return state;
  } catch (error) {
    setStatus(`Failed to load state: ${error.message}`, true);
    return null;
  }
}

async function onExtract() {
  const postUrl = postUrlInput.value.trim();
  const filterText = filterTextInput.value.trim();

  if (!postUrl) {
    setStatus("Enter an Instagram post URL first.", true);
    return;
  }

  setBusy(true);
  renderProgress(
    {
      detail: "Starting extraction...",
      percent: 4,
    },
    true,
  );
  setStatus("Extracting participants and refreshing assets...");
  startPolling();

  try {
    const response = await fetch("/api/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filterText,
        postUrl,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      if (payload.state) {
        latestState = payload.state;
        renderState(payload.state, { keepStatus: true });
      }
      throw new Error(payload.error || "Extraction failed.");
    }

    latestState = payload.state;
    renderState(payload.state, { keepStatus: true });
    setStatus("Extraction finished. You can run the battle now.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    stopPolling();
    setBusy(false);
    syncPolling();
  }
}

// ── Battle launch (both modes) ──────────────────────────────────────

battleButton.addEventListener("click", onRunBattle);

function onRunBattle() {
  if (staticMode) {
    if (!uploadedPlayers || uploadedPlayers.length === 0) {
      setStatus("Upload a players.json file first.", true);
      return;
    }
    launchBattleWithPlayers(uploadedPlayers);
  } else {
    if (!latestState?.battleReady) {
      setStatus("Extract participants first so the battle has player data.", true);
      return;
    }
    launchBattleIframe();
  }
}

function buildBattleQuery() {
  return new URLSearchParams({
    seed: `${Date.now()}`,
    circleScale: toScaleParam(circleSizeInput.value),
    finalDuelHits: `${normalizeFinalHitCount(finalHitCountInput.value)}`,
    fightDrive: toTuningScaleParam(fightDriveInput.value, 145),
    fxIntensity: toTuningScaleParam(fxIntensityInput.value, 100),
    nameScale: toScaleParam(nameSizeInput.value),
    playerHits: `${normalizeHitCount(hitCountInput.value)}`,
    centerBias: toTuningScaleParam(centerBiasInput.value, 135),
    chaosScale: toTuningScaleParam(chaosScaleInput.value, 65),
    shakeScale: toTuningScaleParam(shakeScaleInput.value, 100),
    soundEnabled: soundEnabledInput.checked ? "1" : "0",
    soundVolume: `${(normalizeVolume(soundVolumeInput.value) / 100).toFixed(2)}`,
    showAvatars: showAvatarsInput.checked ? "1" : "0",
    showNames: showNamesInput.checked ? "1" : "0",
    ts: `${Date.now()}`,
  });
}

function launchBattleIframe() {
  const query = buildBattleQuery();
  const iframe = document.createElement("iframe");
  iframe.src = `/battle/index.html?${query.toString()}`;
  iframe.title = "Battle preview";
  previewSlot.replaceChildren(iframe);
  previewSlot.classList.remove("empty");
  setStatus("Battle running.");
}

function launchBattleWithPlayers(players) {
  const query = buildBattleQuery();
  const iframe = document.createElement("iframe");
  const basePath = new URL("../battle/index.html", window.location.href).href;
  iframe.src = `${basePath}?${query.toString()}`;
  iframe.title = "Battle preview";

  // Listen for the battle iframe to signal it's ready
  const messageHandler = (event) => {
    if (event.data?.type === "battle-ready" && event.source === iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: "battle-players", players }, "*");
      window.removeEventListener("message", messageHandler);
    }
  };
  window.addEventListener("message", messageHandler);

  previewSlot.replaceChildren(iframe);
  previewSlot.classList.remove("empty");
  setStatus("Battle running.");
}

// ── Render helpers ──────────────────────────────────────────────────

function renderState(state, options = {}) {
  const { keepStatus = false } = options;

  credentialsStatus.textContent = state.hasCredentials ? "Ready" : "Missing";
  participantCount.textContent = `${state.participantCount || 0}`;

  const summary = state.lastExtract
    ? `${state.lastExtract.participantCount || state.participantCount || 0} players`
    : "None";
  extractSummary.textContent = summary;
  renderProgress(state.progress, state.extracting);

  participantsPreview.replaceChildren();
  for (const username of state.participantsPreview || []) {
    const pill = document.createElement("span");
    pill.textContent = `@${username}`;
    participantsPreview.append(pill);
  }

  battleButton.disabled = !state.battleReady || state.extracting;
  extractButton.disabled = state.extracting || !state.hasCredentials;

  if (!keepStatus && !state.hasCredentials) {
    setStatus("Server is missing IG_USERNAME and IG_PASSWORD.", true);
  } else if (!keepStatus && state.lastError) {
    setStatus(state.lastError, true);
  } else if (!keepStatus && state.extracting) {
    setStatus(state.progress?.detail || "Extraction in progress...");
  } else if (!keepStatus) {
    setStatus("Ready.");
  }
}

function setBusy(isBusy) {
  extractButton.disabled = isBusy || !latestState?.hasCredentials;
  battleButton.disabled = isBusy || !latestState?.battleReady;
}

function renderProgress(progress, isActive) {
  const percent = clampPercent(progress?.percent);
  progressPercent.textContent = `${percent}%`;
  progressFill.style.width = `${percent}%`;
  progressFill.classList.toggle("active", Boolean(isActive));
  progressLabel.textContent = progress?.detail || (isActive ? "Extraction in progress..." : "Idle.");
}

// ── Slider labels ───────────────────────────────────────────────────

circleSizeInput.addEventListener("input", syncBattleControlLabels);
nameSizeInput.addEventListener("input", syncBattleControlLabels);
hitCountInput.addEventListener("input", syncBattleControlLabels);
finalHitCountInput.addEventListener("input", syncBattleControlLabels);
soundEnabledInput.addEventListener("change", syncBattleControlLabels);
soundVolumeInput.addEventListener("input", syncBattleControlLabels);
shakeScaleInput.addEventListener("input", syncBattleControlLabels);
centerBiasInput.addEventListener("input", syncBattleControlLabels);
fightDriveInput.addEventListener("input", syncBattleControlLabels);
chaosScaleInput.addEventListener("input", syncBattleControlLabels);
fxIntensityInput.addEventListener("input", syncBattleControlLabels);

function syncBattleControlLabels() {
  circleSizeValue.textContent = `${normalizePercent(circleSizeInput.value)}%`;
  nameSizeValue.textContent = `${normalizePercent(nameSizeInput.value)}%`;
  const hits = normalizeHitCount(hitCountInput.value);
  hitCountValue.textContent = `${hits} hit${hits === 1 ? "" : "s"}`;
  const finalHits = normalizeFinalHitCount(finalHitCountInput.value);
  finalHitCountValue.textContent = `${finalHits} hit${finalHits === 1 ? "" : "s"}`;
  soundVolumeInput.disabled = !soundEnabledInput.checked;
  soundVolumeValue.textContent = soundEnabledInput.checked ? `${normalizeVolume(soundVolumeInput.value)}%` : "Muted";
  shakeScaleValue.textContent = `${normalizeTuningPercent(shakeScaleInput.value, 100)}%`;
  centerBiasValue.textContent = `${normalizeTuningPercent(centerBiasInput.value, 135)}%`;
  fightDriveValue.textContent = `${normalizeTuningPercent(fightDriveInput.value, 145)}%`;
  chaosScaleValue.textContent = `${normalizeTuningPercent(chaosScaleInput.value, 65)}%`;
  fxIntensityValue.textContent = `${normalizeTuningPercent(fxIntensityInput.value, 100)}%`;
}

// ── Math utils ──────────────────────────────────────────────────────

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 100;
  }
  return Math.max(10, Math.min(300, Math.round(number)));
}

function toScaleParam(value) {
  return (normalizePercent(value) / 100).toFixed(2);
}

function toTuningScaleParam(value, fallback = 100) {
  return (normalizeTuningPercent(value, fallback) / 100).toFixed(2);
}

function normalizeHitCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 3;
  }
  return Math.max(1, Math.min(8, Math.round(number)));
}

function normalizeFinalHitCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 10;
  }
  return Math.max(1, Math.min(20, Math.round(number)));
}

function normalizeVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 72;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeTuningPercent(value, fallback = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(0, Math.min(300, Math.round(number)));
}

// ── Polling (server mode only) ──────────────────────────────────────

function syncPolling() {
  if (latestState?.extracting) {
    startPolling();
    return;
  }
  stopPolling();
}

function startPolling() {
  if (pollTimer) {
    return;
  }

  pollTimer = window.setInterval(async () => {
    const state = await refreshState({ keepStatus: false });
    if (!state?.extracting) {
      stopPolling();
    }
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (!pollTimer) {
    return;
  }
  window.clearInterval(pollTimer);
  pollTimer = null;
}

function setStatus(message, isError = false) {
  statusNote.textContent = message;
  statusNote.classList.toggle("error", isError);
}

// ── Boot ────────────────────────────────────────────────────────────

init();
