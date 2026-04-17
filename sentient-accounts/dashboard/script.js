const state = {
  data: null,
  errors: null,
  refresh: {
    activeRun: null,
    isSubmitting: false,
    pollAttempts: 0,
    pollTimer: null,
    settings: null,
    awaitingPublishedData: false,
    publishRetryAttempts: 0,
    publishRetryTimer: null,
  },
  selectedAccount: null,
  charts: {},
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVE_RUN_STATUSES = new Set(["queued", "in_progress", "requested", "waiting", "pending"]);
const HIDDEN_LIKES_SENTINEL = 3;
const RUN_STATUS_LABELS = {
  queued: "Queued",
  in_progress: "Running",
  requested: "Requested",
  waiting: "Waiting",
  pending: "Pending",
  completed: "Completed",
  success: "Succeeded",
  failure: "Failed",
  cancelled: "Cancelled",
  timed_out: "Timed out",
  skipped: "Skipped",
};
const refreshConfig = {
  apiBaseUrl: String(window.SENTIENT_ACCOUNTS_CONFIG?.refreshApiBaseUrl || "").trim(),
  apiBaseStorageKey: String(window.SENTIENT_ACCOUNTS_CONFIG?.refreshApiBaseStorageKey || "sentient-accounts-refresh-api-url"),
  adminKeyStorageKey: String(window.SENTIENT_ACCOUNTS_CONFIG?.refreshAdminKeyStorageKey || "sentient-accounts-refresh-admin-key"),
  statusPollIntervalMs: Number(window.SENTIENT_ACCOUNTS_CONFIG?.statusPollIntervalMs) || 15000,
  maxStatusPollAttempts: Number(window.SENTIENT_ACCOUNTS_CONFIG?.maxStatusPollAttempts) || 40,
};

/* ── Chart.js global defaults ────────────────────────────────── */
const chartColors = {
  accent: "#cfff04",
  accentSoft: "rgba(207, 255, 4, 0.25)",
  green: "#cfff04",
  greenSoft: "rgba(207, 255, 4, 0.20)",
  blue: "#00e5ff",
  blueSoft: "rgba(0, 229, 255, 0.20)",
  purple: "#b48cde",
  purpleSoft: "rgba(180, 140, 222, 0.20)",
  text: "#f0f0f0",
  muted: "#8a8a8a",
  gridLine: "rgba(255, 255, 255, 0.04)",
};

function buildChartOptions(overrides = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: chartColors.text,
          font: { family: "IBM Plex Mono", size: 11 },
          padding: 16,
          usePointStyle: true,
          pointStyle: "circle",
        },
      },
      tooltip: {
        backgroundColor: "rgba(0, 0, 0, 0.92)",
        titleColor: chartColors.accent,
        bodyColor: chartColors.text,
        borderColor: "rgba(207, 255, 4, 0.2)",
        borderWidth: 1,
        cornerRadius: 10,
        padding: 12,
        titleFont: { family: "IBM Plex Mono", weight: "bold" },
        bodyFont: { family: "IBM Plex Mono" },
        displayColors: true,
        boxPadding: 4,
      },
      ...overrides.plugins,
    },
    scales: {
      x: {
        ticks: {
          color: chartColors.muted,
          font: { family: "IBM Plex Mono", size: 11 },
        },
        grid: { color: chartColors.gridLine },
        border: { color: "rgba(214, 207, 190, 0.08)" },
        ...(overrides.scales?.x || {}),
      },
      y: {
        ticks: {
          color: chartColors.muted,
          font: { family: "IBM Plex Mono", size: 11 },
          callback: (v) =>
            v >= 1_000_000
              ? `${(v / 1_000_000).toFixed(1)}M`
              : v >= 1_000
                ? `${(v / 1_000).toFixed(0)}K`
                : v,
        },
        grid: { color: chartColors.gridLine },
        border: { color: "rgba(214, 207, 190, 0.08)" },
        ...(overrides.scales?.y || {}),
      },
    },
    animation: {
      duration: 900,
      easing: "easeOutQuart",
    },
  };
}

/* ── Helpers ──────────────────────────────────────────────────── */

async function fetchJson(relativePath) {
  const cacheBuster = `?t=${Date.now()}`;
  const candidates = [
    `../data/${relativePath}${cacheBuster}`,
    `./data/${relativePath}${cacheBuster}`,
    `data/${relativePath}${cacheBuster}`,
  ];

  for (const path of candidates) {
    try {
      const response = await fetch(path, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache"
        }
      });
      if (response.ok) return await response.json();
    } catch (_) {
      /* next */
    }
  }
  throw new Error(`Unable to load ${relativePath}`);
}

function formatNumber(value) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-US").format(n);
}

function formatPercent(value) {
  const n = Number(value || 0);
  return `${Number.isFinite(n) ? n.toFixed(2) : "0.00"}%`;
}

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" && DATE_ONLY_PATTERN.test(value)) {
    const dateOnly = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(dateOnly.getTime()) ? null : dateOnly;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  if (!value) return "Unknown";
  const date = parseDateValue(value);
  if (!date) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    delete state.charts[key];
  }
}

function daysAgo(dateValue, refValue) {
  const date = parseDateValue(dateValue);
  const refDate = parseDateValue(refValue);
  if (!date || !refDate) return Infinity;

  const dateDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const refDay = Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate());
  return Math.floor((refDay - dateDay) / (1000 * 60 * 60 * 24));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function safeLocalStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function hasHiddenLikes(post) {
  return Number(post?.likes) === HIDDEN_LIKES_SENTINEL;
}

function formatPostLikes(post) {
  return hasHiddenLikes(post) ? "Hidden" : formatNumber(post?.likes);
}

function getRecentPostSortValue(post) {
  return hasHiddenLikes(post) ? (Number(post?.comments) || 0) : (Number(post?.likes) || 0);
}

function compareRecentPosts(left, right) {
  const primaryDelta = getRecentPostSortValue(right) - getRecentPostSortValue(left);
  if (primaryDelta !== 0) {
    return primaryDelta;
  }

  const commentsDelta = (Number(right?.comments) || 0) - (Number(left?.comments) || 0);
  if (commentsDelta !== 0) {
    return commentsDelta;
  }

  const likesDelta = (Number(right?.likes) || 0) - (Number(left?.likes) || 0);
  if (likesDelta !== 0) {
    return likesDelta;
  }

  return String(right?.date || "").localeCompare(String(left?.date || ""));
}

function safeLocalStorageSet(key, value) {
  try {
    if (!value) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, value);
  } catch (_) {
    /* ignore storage errors */
  }
}

function normalizeApiBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function loadRefreshSettings() {
  const storedApiBaseUrl = safeLocalStorageGet(refreshConfig.apiBaseStorageKey);
  const storedAdminKey = safeLocalStorageGet(refreshConfig.adminKeyStorageKey);

  state.refresh.settings = {
    apiBaseUrl: normalizeApiBaseUrl(storedApiBaseUrl || refreshConfig.apiBaseUrl),
    adminKey: String(storedAdminKey || "").trim(),
  };
}

function saveRefreshSettings({ apiBaseUrl, adminKey }) {
  state.refresh.settings = {
    apiBaseUrl: normalizeApiBaseUrl(apiBaseUrl),
    adminKey: String(adminKey || "").trim(),
  };
  safeLocalStorageSet(refreshConfig.apiBaseStorageKey, state.refresh.settings.apiBaseUrl);
  safeLocalStorageSet(refreshConfig.adminKeyStorageKey, state.refresh.settings.adminKey);
}

function hasRefreshService() {
  return Boolean(state.refresh.settings?.apiBaseUrl);
}

function hasRefreshCredentials() {
  return hasRefreshService() && Boolean(state.refresh.settings?.adminKey);
}

function buildRefreshUrl(pathname) {
  return `${state.refresh.settings.apiBaseUrl}${pathname}`;
}

function describeRunState(run) {
  if (!run) return "No refresh run detected yet.";

  const statusKey = run.status === "completed" && run.conclusion ? run.conclusion : run.status;
  const label = RUN_STATUS_LABELS[statusKey] || run.status || "Unknown";
  const startedAt = formatDate(run.created_at);
  const runNumber = run.run_number ? ` #${run.run_number}` : "";
  return `Refresh${runNumber} · ${label} · started ${startedAt}`;
}

function renderRefreshStatus(message, tone = "neutral", href = "") {
  const node = document.getElementById("refreshStatus");
  if (!node) return;

  node.dataset.tone = tone;
  if (href) {
    node.innerHTML = `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(message)}</a>`;
  } else {
    node.textContent = message;
  }
}

function renderSnapshotDate(value) {
  const node = document.getElementById("lastUpdatedDate");
  if (!node) return;
  node.textContent = value;
}

function syncRefreshButtonState() {
  const refreshButton = document.getElementById("refreshButton");
  if (!refreshButton) return;

  refreshButton.disabled = state.refresh.isSubmitting || !hasRefreshCredentials();
  if (!hasRefreshService()) {
    refreshButton.textContent = "Refresh unavailable";
  } else if (state.refresh.isSubmitting) {
    refreshButton.textContent = "Queuing…";
  } else if (state.refresh.activeRun && ACTIVE_RUN_STATUSES.has(state.refresh.activeRun.status)) {
    refreshButton.textContent = "Refresh running";
  } else {
    refreshButton.textContent = "Refresh data";
  }
}

function stopPublishedDataReload() {
  if (state.refresh.publishRetryTimer) {
    window.clearTimeout(state.refresh.publishRetryTimer);
    state.refresh.publishRetryTimer = null;
  }
  state.refresh.publishRetryAttempts = 0;
}

function toggleRefreshConfig(open) {
  const form = document.getElementById("refreshConfigForm");
  const urlInput = document.getElementById("refreshApiUrlInput");
  const keyInput = document.getElementById("refreshAdminKeyInput");
  if (!form || !urlInput || !keyInput) return;

  form.classList.toggle("hidden", !open);
  urlInput.value = state.refresh.settings?.apiBaseUrl || "";
  keyInput.value = state.refresh.settings?.adminKey || "";
}

function hasManualVideoViewsOverride(account) {
  return account?.video_views_recent_window_source === "manual_override"
    || Number.isFinite(Number(account?.manual_total_video_views_recent_window));
}

function isPlaceholderAccount(account) {
  return account?.data_status === "placeholder_pending_collection";
}

function buildAccountBadges(account, className = "chip-badge") {
  const badges = [];
  if (isPlaceholderAccount(account)) {
    badges.push(`<span class="${className} ${className}--placeholder">pending scrape</span>`);
  }
  return badges.join("");
}

function getDataSignature(rawData) {
  if (!rawData || typeof rawData !== "object") return "";
  const accounts = Array.isArray(rawData.accounts) ? rawData.accounts.length : 0;
  return [
    rawData.generated_at || "",
    rawData.run_started_at || "",
    rawData.snapshot_date || rawData.date || "",
    rawData.total_accounts || accounts,
  ].join("|");
}

function selectAccountFromData(accounts, previousSelection) {
  const previousAccountName = previousSelection?.account;
  if (previousAccountName) {
    const matching = accounts.find((account) => account.account === previousAccountName);
    if (matching) return matching;
  }
  return accounts[0] || null;
}

async function renderDashboardData(rawData, errorsPayload) {
  const data = normalizeDashboardData(rawData);
  state.data = data;
  state.errors = errorsPayload;

  renderOverview(data);
  renderStatusBanner(data, errorsPayload);
  renderPortfolioCharts(data.accounts);

  if (data.accounts.length) {
    state.selectedAccount = selectAccountFromData(data.accounts, state.selectedAccount);
    renderAccountList(data.accounts);

    // Network visualization — only (re)create when data version changes
    if (typeof NetworkGraph !== "undefined" && document.getElementById("networkContainer")) {
      const version = data.snapshot_date || data.generated_at || String(data.accounts.length);
      if (!window._networkGraph || window._networkGraph._dataVersion !== version) {
        if (window._networkGraph) window._networkGraph.stop();
        window._networkGraph = new NetworkGraph("networkContainer", data.accounts, (account) => {
          state.selectedAccount = account;
          renderAccountDetail(account);
          if (window.sentientNav) window.sentientNav.navigateTo("detail");
        });
        window._networkGraph._dataVersion = version;
        window._networkGraph.start();
      }
    }

    await renderAccountDetail(state.selectedAccount);
  } else {
    state.selectedAccount = null;
    renderAccountList([]);
    document.getElementById("detailMeta").innerHTML =
      '<p class="empty-state">Run the collector to populate the dashboard.</p>';
    document.getElementById("detailNotes").innerHTML = "";
    document.getElementById("detailNotes").classList.add("hidden");
    document.getElementById("recentPosts").innerHTML = "";
    updateRecentPostsWindow(data.snapshot_date || data.date);
  }

  return data;
}

async function reloadDashboardData({ silent = false } = {}) {
  const previousSignature = getDataSignature(state.data);
  const [rawData, errorsPayload] = await Promise.all([
    fetchJson("global.json"),
    fetchJson("errors.json").catch(() => null),
  ]);
  await renderDashboardData(rawData, errorsPayload);
  const nextSignature = getDataSignature(rawData);
  const changed = previousSignature !== nextSignature;

  if (!silent) {
    renderRefreshStatus(
      changed
        ? "Published dashboard data reloaded."
        : "Refresh finished, but GitHub Pages is still serving the previous snapshot.",
      changed ? "success" : "warning",
      state.refresh.activeRun?.html_url || ""
    );
  }

  return changed;
}

function schedulePublishedDataReload() {
  if (!state.refresh.awaitingPublishedData) return;

  stopPublishedDataReload();

  const poll = async () => {
    state.refresh.publishRetryAttempts += 1;

    try {
      const changed = await reloadDashboardData({ silent: true });
      if (changed) {
        state.refresh.awaitingPublishedData = false;
        stopPublishedDataReload();
        renderRefreshStatus("Published dashboard data reloaded.", "success", state.refresh.activeRun?.html_url || "");
        return;
      }
    } catch (_) {
      /* keep retrying while GitHub Pages catches up */
    }

    if (state.refresh.publishRetryAttempts >= 6) {
      state.refresh.awaitingPublishedData = false;
      stopPublishedDataReload();
      renderRefreshStatus(
        "Collector finished, but the published dashboard JSON has not updated yet. Try again in a moment.",
        "warning",
        state.refresh.activeRun?.html_url || ""
      );
      return;
    }

    state.refresh.publishRetryTimer = window.setTimeout(poll, 10000);
  };

  state.refresh.publishRetryTimer = window.setTimeout(poll, 4000);
}

function applyRefreshStatusFromRun(run) {
  state.refresh.activeRun = run || null;

  if (!hasRefreshService()) {
    renderRefreshStatus("Manual refresh unavailable. Configure the refresh service URL first.");
    syncRefreshButtonState();
    return;
  }

  if (!hasRefreshCredentials()) {
    renderRefreshStatus("Refresh service ready. Save the admin key in this browser to enable the button.");
    syncRefreshButtonState();
    return;
  }

  if (!run) {
    renderRefreshStatus("Manual refresh ready. This button queues the Python collector on GitHub Actions.");
    syncRefreshButtonState();
    return;
  }

  const statusKey = run.status === "completed" && run.conclusion ? run.conclusion : run.status;
  const tone = ACTIVE_RUN_STATUSES.has(run.status)
    ? "progress"
    : statusKey === "success"
      ? "success"
      : statusKey === "failure" || statusKey === "cancelled" || statusKey === "timed_out"
        ? "error"
        : "warning";
  const suffix = statusKey === "success"
    ? " GitHub Pages will publish the updated JSON after the workflow push."
    : "";
  renderRefreshStatus(`${describeRunState(run)}.${suffix}`, tone, run.html_url || "");
  syncRefreshButtonState();

  if (run && ACTIVE_RUN_STATUSES.has(run.status)) {
    state.refresh.awaitingPublishedData = true;
    stopPublishedDataReload();
    return;
  }

  if (run && statusKey === "success" && state.refresh.awaitingPublishedData) {
    schedulePublishedDataReload();
    return;
  }

  state.refresh.awaitingPublishedData = false;
  stopPublishedDataReload();
}

function stopRefreshPolling() {
  if (state.refresh.pollTimer) {
    window.clearTimeout(state.refresh.pollTimer);
    state.refresh.pollTimer = null;
  }
  state.refresh.pollAttempts = 0;
}

async function fetchRefreshApi(pathname, options = {}) {
  const response = await fetch(buildRefreshUrl(pathname), options);
  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.message || payload?.detail || `Refresh API request failed (${response.status})`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function refreshWorkflowStatus({ silent = false } = {}) {
  if (!hasRefreshService()) {
    applyRefreshStatusFromRun(null);
    return null;
  }

  try {
    const payload = await fetchRefreshApi("/api/status");
    const run = payload?.run || null;
    if (!silent || run) {
      applyRefreshStatusFromRun(run);
    } else {
      syncRefreshButtonState();
    }
    return run;
  } catch (error) {
    if (!silent) {
      renderRefreshStatus(error.message, "warning");
      syncRefreshButtonState();
    }
    return null;
  }
}

function scheduleRefreshStatusPoll() {
  stopRefreshPolling();
  if (!hasRefreshService()) return;

  const poll = async () => {
    state.refresh.pollAttempts += 1;
    const run = await refreshWorkflowStatus({ silent: true });
    if (run && ACTIVE_RUN_STATUSES.has(run.status) && state.refresh.pollAttempts < refreshConfig.maxStatusPollAttempts) {
      state.refresh.pollTimer = window.setTimeout(poll, refreshConfig.statusPollIntervalMs);
      return;
    }

    if (run) {
      applyRefreshStatusFromRun(run);
    }
    stopRefreshPolling();
  };

  state.refresh.pollTimer = window.setTimeout(poll, refreshConfig.statusPollIntervalMs);
}

function summarizeItems(values, { limit = 4, accountHandles = false } = {}) {
  const unique = [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .map((value) => accountHandles ? value.replace(/^@+/, "") : value)
  )];

  if (!unique.length) return "unknown";

  const visible = unique
    .slice(0, limit)
    .map((value) => escapeHtml(accountHandles ? `@${value}` : value));
  const remaining = unique.length - visible.length;
  return remaining > 0 ? `${visible.join(", ")} +${remaining} more` : visible.join(", ");
}

function buildStatusItem(tone, title, detail) {
  return `
    <article class="status-banner__item status-banner__item--${tone}">
      <strong>${escapeHtml(title)}</strong>
      <span>${detail}</span>
    </article>
  `;
}

function renderFatalBanner(message) {
  const banner = document.getElementById("statusBanner");
  banner.innerHTML = `
    <div class="status-banner__header">
      <span class="eyebrow">Status</span>
      <strong class="status-banner__title">Dashboard load failed</strong>
    </div>
    <div class="status-banner__list">
      ${buildStatusItem("error", "Data source unavailable", escapeHtml(message))}
    </div>
  `;
  banner.classList.remove("hidden");
}

function renderStatusBanner(data, errorsPayload) {
  const banner = document.getElementById("statusBanner");
  const items = [];
  const collectionFailures = Array.isArray(errorsPayload?.failures) ? errorsPayload.failures : [];
  const staleAccounts = Array.isArray(data?.stale_accounts_excluded) ? data.stale_accounts_excluded : [];
  const loadFailures = Array.isArray(data?.load_failures) ? data.load_failures : [];
  const placeholderAccounts = Array.isArray(data?.accounts)
    ? data.accounts.filter((account) => isPlaceholderAccount(account))
    : [];

  if (collectionFailures.length) {
    const failedAccounts = collectionFailures
      .map((item) => item?.account)
      .filter(Boolean);
    items.push(buildStatusItem(
      "error",
      `${collectionFailures.length} collection failure${collectionFailures.length === 1 ? "" : "s"} in the latest run`,
      `Latest refresh missed ${summarizeItems(failedAccounts, { accountHandles: true })}. Portfolio totals only include the freshest successful snapshots.`
    ));
  }

  if (staleAccounts.length) {
    const excludedAccounts = staleAccounts
      .map((item) => item?.account)
      .filter(Boolean);
    items.push(buildStatusItem(
      "warning",
      `${staleAccounts.length} stale dataset${staleAccounts.length === 1 ? "" : "s"} excluded`,
      `Aggregation skipped ${summarizeItems(excludedAccounts, { accountHandles: true })} because those files do not belong to the latest snapshot.`
    ));
  }

  if (loadFailures.length) {
    const invalidFiles = loadFailures
      .map((item) => item?.file)
      .filter(Boolean);
    items.push(buildStatusItem(
      "warning",
      `${loadFailures.length} invalid data file${loadFailures.length === 1 ? "" : "s"} skipped`,
      `Aggregation ignored ${summarizeItems(invalidFiles, { limit: 3 })} until the JSON is fixed.`
    ));
  }

  if (placeholderAccounts.length) {
    items.push(buildStatusItem(
      "warning",
      `${placeholderAccounts.length} tracked account${placeholderAccounts.length === 1 ? "" : "s"} pending collection`,
      `Dashboard placeholders are visible for ${summarizeItems(placeholderAccounts.map((account) => account?.account), { accountHandles: true })}. They are counted in the portfolio, but follower and post metrics stay at zero until the collector succeeds for them.`
    ));
  }

  if (!items.length) {
    banner.innerHTML = "";
    banner.classList.add("hidden");
    return;
  }

  const snapshotLabel = formatDate(data?.snapshot_date || data?.date);
  banner.innerHTML = `
    <div class="status-banner__header">
      <span class="eyebrow">Status</span>
      <strong class="status-banner__title">Snapshot checks for ${escapeHtml(snapshotLabel)}</strong>
    </div>
    <div class="status-banner__list">
      ${items.join("")}
    </div>
  `;
  banner.classList.remove("hidden");
}

function resolveReferenceDate(account) {
  return (
    parseDateValue(account?.run_started_at) ||
    parseDateValue(account?.generated_at) ||
    parseDateValue(account?.date) ||
    parseDateValue(state.data?.run_started_at) ||
    parseDateValue(state.data?.snapshot_date) ||
    parseDateValue(state.data?.generated_at) ||
    new Date()
  );
}

function updateRecentPostsWindow(referenceDate, account = null) {
  const label = document.getElementById("recentPostsWindow");
  if (!label) return;

  const resolved = parseDateValue(referenceDate);
  const windowDays = Number(account?.recent_posts_window_days) || 14;
  const baseLabel = resolved
    ? `· last ${windowDays} days from ${formatDate(resolved)}`
    : `· last ${windowDays} days`;

  if (account?.recent_posts_window_covered === false) {
    const hardLimit = Number(account?.recent_posts_hard_limit) || 0;
    label.textContent = hardLimit
      ? `${baseLabel} · truncated at ${formatNumber(hardLimit)} posts`
      : `${baseLabel} · truncated sample`;
    return;
  }

  label.textContent = baseLabel;
}

function getAverageVideoViews(account) {
  const avgVideoViews = Number(account?.avg_video_views_per_video);
  if (Number.isFinite(avgVideoViews) && avgVideoViews > 0) {
    return avgVideoViews;
  }

  const fallbackAvg = Number(account?.avg_video_views);
  return Number.isFinite(fallbackAvg) && fallbackAvg > 0 ? fallbackAvg : 0;
}

function formatVideoViewsMetric(account) {
  const avgVideoViews = getAverageVideoViews(account);
  if (avgVideoViews > 0) {
    return formatNumber(avgVideoViews);
  }
  return Number(account?.video_post_count || 0) > 0 ? "N/A" : "0";
}

function getEffectiveLikeCount(post) {
  const likes = Number(post?.likes) || 0;
  return likes === HIDDEN_LIKES_SENTINEL ? 0 : likes;
}

function getCollectionWindowDays(account) {
  const collectionWindow = Number(account?.recent_posts_collection_window_days);
  if (Number.isFinite(collectionWindow) && collectionWindow > 0) {
    return collectionWindow;
  }

  const displayWindow = Number(account?.recent_posts_window_days);
  if (Number.isFinite(displayWindow) && displayWindow > 0) {
    return Math.max(displayWindow, 30);
  }

  return 30;
}

function getPostsInWindow(account, windowDays) {
  const referenceDate = resolveReferenceDate(account);
  return (account?.recent_posts || []).filter((post) => {
    const ageInDays = daysAgo(post.date, referenceDate);
    return ageInDays >= 0 && ageInDays <= windowDays;
  });
}

function getRecentWindowVideoViewsTotal(account) {
  const explicitTotal = Number(account?.total_video_views_recent_window);
  if (Number.isFinite(explicitTotal) && explicitTotal > 0) {
    return explicitTotal;
  }

  const windowDays = getCollectionWindowDays(account);
  return getPostsInWindow(account, windowDays)
    .filter((post) => post?.is_video)
    .reduce((sum, post) => sum + (Number(post?.video_views) || 0), 0);
}

function getRecentWindowLikesTotal(account) {
  const explicitTotal = Number(account?.total_likes_recent_window);
  if (Number.isFinite(explicitTotal) && explicitTotal > 0) {
    return explicitTotal;
  }

  const windowDays = getCollectionWindowDays(account);
  return getPostsInWindow(account, windowDays)
    .reduce((sum, post) => sum + getEffectiveLikeCount(post), 0);
}

function hasRecentWindowVideos(account) {
  return getPostsInWindow(account, getCollectionWindowDays(account)).some((post) => post?.is_video);
}

function formatRecentWindowVideoViewsMetric(account) {
  const totalViews = getRecentWindowVideoViewsTotal(account);
  if (totalViews > 0) {
    return account?.recent_posts_collection_window_covered === false
      ? `${formatNumber(totalViews)}+`
      : formatNumber(totalViews);
  }
  return hasRecentWindowVideos(account) ? "N/A" : "0";
}

function getAvatarUrl(account) {
  const accountName = String(account?.account || "").trim();
  const cacheToken = encodeURIComponent(String(
    account?.generated_at || account?.run_started_at || account?.date || state.data?.generated_at || ""
  ));
  const suffix = cacheToken ? `?v=${cacheToken}` : "";
  const explicitPath = String(account?.avatar_path || "").trim();
  if (explicitPath) {
    return `${explicitPath}${suffix}`;
  }

  const remoteProfilePicUrl = String(account?.profile_pic_url || "").trim();
  if (remoteProfilePicUrl) {
    return remoteProfilePicUrl;
  }

  if (account?.data_status !== "placeholder_pending_collection" && accountName) {
    return `../avatars/${encodeURIComponent(accountName)}.jpg${suffix}`;
  }

  return "";
}

function buildAvatarMarkup(account, className) {
  const profilePicUrl = getAvatarUrl(account);
  const label = String(account?.full_name || account?.account || "Account").trim();
  const initial = escapeHtml(String(account?.account || "?").trim().charAt(0).toUpperCase() || "?");

  if (profilePicUrl) {
    return `<img class="${className}" src="${escapeHtml(profilePicUrl)}" alt="${escapeHtml(label)} profile photo" loading="lazy" referrerpolicy="no-referrer" />`;
  }

  return `<span class="${className} ${className}--placeholder" aria-hidden="true">${initial}</span>`;
}

function normalizeAccounts(rawAccounts) {
  if (!Array.isArray(rawAccounts)) {
    return [];
  }

  return rawAccounts
    .filter((account) => account && typeof account === "object" && typeof account.account === "string")
    .sort((left, right) => (Number(right.followers) || 0) - (Number(left.followers) || 0));
}

function normalizeDashboardData(rawData) {
  const accounts = normalizeAccounts(rawData?.accounts);
  const totalFollowers = accounts.reduce((sum, account) => sum + (Number(account.followers) || 0), 0);
  const totalPosts = accounts.reduce((sum, account) => sum + (Number(account.posts) || 0), 0);
  const totalAvgLikes = accounts.reduce((sum, account) => sum + (Number(account.avg_likes) || 0), 0);
  const totalAvgComments = accounts.reduce((sum, account) => sum + (Number(account.avg_comments) || 0), 0);
  const recentWindowDays = Number(rawData?.recent_window_days) || Math.max(
    ...accounts.map((account) => getCollectionWindowDays(account)),
    30,
  );
  const totalLikesRecentWindow = Number(rawData?.total_likes_recent_window) || accounts.reduce(
    (sum, account) => sum + getRecentWindowLikesTotal(account),
    0,
  );
  const totalVideoViewsRecentWindow = Number(rawData?.total_video_views_recent_window) || accounts.reduce(
    (sum, account) => sum + getRecentWindowVideoViewsTotal(account),
    0,
  );
  const recentWindowCovered = rawData?.recent_window_covered !== false
    && accounts.every((account) => account?.recent_posts_collection_window_covered !== false);
  const avgEngagementRate = totalFollowers
    ? (((totalAvgLikes + totalAvgComments) / totalFollowers) * 100)
    : 0;

  return {
    ...rawData,
    accounts,
    avg_engagement_rate: avgEngagementRate,
    snapshot_date: rawData?.snapshot_date || rawData?.date || null,
    total_accounts: accounts.length,
    total_followers: totalFollowers,
    total_posts: totalPosts,
    recent_window_days: recentWindowDays,
    recent_window_covered: recentWindowCovered,
    total_likes_recent_window: totalLikesRecentWindow,
    total_video_views_recent_window: totalVideoViewsRecentWindow,
  };
}

/* ── Overview stats ──────────────────────────────────────────── */

function renderOverview(data) {
  const recentWindowDays = Number(data?.recent_window_days) || 30;
  const totalLikesLabel = document.getElementById("totalLikesLabel");
  const totalViewsLabel = document.getElementById("totalViewsLabel");
  if (totalLikesLabel) totalLikesLabel.textContent = `${recentWindowDays}d likes`;
  if (totalViewsLabel) totalViewsLabel.textContent = `${recentWindowDays}d impressions`;

  const coverageSuffix = data?.recent_window_covered === false ? "+" : "";
  document.getElementById("totalFollowers").textContent = formatNumber(data.total_followers);
  document.getElementById("totalAccounts").textContent = data.total_accounts;
  document.getElementById("totalPosts").textContent = formatNumber(data.total_posts);
  document.getElementById("totalLikes30d").textContent = `${formatNumber(data.total_likes_recent_window)}${coverageSuffix}`;
  document.getElementById("totalViews30d").textContent = `${formatNumber(data.total_video_views_recent_window)}${coverageSuffix}`;
  document.getElementById("avgEngagement").textContent = formatPercent(data.avg_engagement_rate);
  renderSnapshotDate(formatDate(data.snapshot_date || data.date || data.generated_at));
}

/* ── Portfolio charts ────────────────────────────────────────── */

function createGradient(ctx, color1, color2) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  return gradient;
}

function renderPortfolioCharts(accounts) {
  const labels = accounts.map((a) => `@${a.account}`);
  const followers = accounts.map((a) => a.followers || 0);
  const avgLikes = accounts.map((a) => a.avg_likes || 0);
  const avgComments = accounts.map((a) => a.avg_comments || 0);

  /* ── Followers — horizontal bar ── */
  destroyChart("followers");
  const followersCtx = document.getElementById("followersChart").getContext("2d");
  const accentGradH = followersCtx.createLinearGradient(0, 0, followersCtx.canvas.width, 0);
  accentGradH.addColorStop(0, "rgba(207, 255, 4, 0.2)");
  accentGradH.addColorStop(1, chartColors.accent);

  state.charts.followers = new Chart(followersCtx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Followers",
          data: followers,
          borderRadius: 10,
          borderSkipped: false,
          backgroundColor: accentGradH,
          hoverBackgroundColor: chartColors.accent,
          barPercentage: 0.55,
          categoryPercentage: 0.7,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: buildChartOptions().plugins.tooltip,
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            color: chartColors.muted,
            font: { family: "IBM Plex Mono", size: 11 },
            callback: (v) =>
              v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : v,
          },
          grid: { color: chartColors.gridLine },
          border: { color: "rgba(214, 207, 190, 0.08)" },
        },
        y: {
          ticks: {
            color: chartColors.text,
            font: { family: "Space Grotesk", size: 13, weight: "bold" },
            mirror: false,
          },
          grid: { display: false },
          border: { display: false },
        },
      },
      animation: { duration: 900, easing: "easeOutQuart" },
    },
  });

  /* ── Avg likes vs comments — horizontal grouped bar ── */
  destroyChart("interactions");
  const interCtx = document.getElementById("interactionsChart").getContext("2d");
  const greenGradH = interCtx.createLinearGradient(0, 0, interCtx.canvas.width, 0);
  greenGradH.addColorStop(0, "rgba(207, 255, 4, 0.15)");
  greenGradH.addColorStop(1, chartColors.accent);
  const blueGradH = interCtx.createLinearGradient(0, 0, interCtx.canvas.width, 0);
  blueGradH.addColorStop(0, "rgba(0, 229, 255, 0.15)");
  blueGradH.addColorStop(1, chartColors.blue);

  state.charts.interactions = new Chart(interCtx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Avg likes",
          data: avgLikes,
          borderRadius: 10,
          borderSkipped: false,
          backgroundColor: greenGradH,
          hoverBackgroundColor: chartColors.green,
          barPercentage: 0.55,
          categoryPercentage: 0.7,
        },
        {
          label: "Avg comments",
          data: avgComments,
          borderRadius: 10,
          borderSkipped: false,
          backgroundColor: blueGradH,
          hoverBackgroundColor: chartColors.blue,
          barPercentage: 0.55,
          categoryPercentage: 0.7,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: chartColors.text,
            font: { family: "IBM Plex Mono", size: 11 },
            padding: 16,
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
        tooltip: buildChartOptions().plugins.tooltip,
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            color: chartColors.muted,
            font: { family: "IBM Plex Mono", size: 11 },
            callback: (v) =>
              v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : v,
          },
          grid: { color: chartColors.gridLine },
          border: { color: "rgba(214, 207, 190, 0.08)" },
        },
        y: {
          ticks: {
            color: chartColors.text,
            font: { family: "Space Grotesk", size: 13, weight: "bold" },
          },
          grid: { display: false },
          border: { display: false },
        },
      },
      animation: { duration: 900, easing: "easeOutQuart" },
    },
  });
}

/* ── Account picker ──────────────────────────────────────────── */

function renderAccountList(accounts) {
  const container = document.getElementById("accountList");
  container.innerHTML = "";

  if (!accounts.length) {
    container.innerHTML = '<p class="empty-state">No account datasets available yet.</p>';
    return;
  }

  accounts.forEach((account) => {
    const button = document.createElement("button");
    button.className = "account-chip";
    if (state.selectedAccount?.account === account.account) {
      button.classList.add("active");
    }

    const engColor =
      account.engagement_rate >= 1 ? chartColors.accent : chartColors.accent;

    button.innerHTML = `
      <div class="chip-topline">
        ${buildAvatarMarkup(account, "chip-avatar")}
        <div class="chip-header">
          <span class="chip-dot" style="background:${engColor}"></span>
          <div class="chip-header-text">
            <span class="account-name">@${escapeHtml(account.account)}</span>
            ${buildAccountBadges(account) ? `<div class="chip-badges">${buildAccountBadges(account)}</div>` : ""}
          </div>
        </div>
      </div>
      <span class="account-followers">${formatNumber(account.followers)} followers</span>
      <span class="account-engagement">${formatPercent(account.engagement_rate)} eng.</span>
    `;

    button.addEventListener("click", () => {
      state.selectedAccount = account;
      renderAccountList(accounts);
      renderAccountDetail(account);
      if (window.sentientNav) window.sentientNav.navigateTo("detail");
    });

    container.appendChild(button);
  });
}

/* ── Detail meta card ────────────────────────────────────────── */

function renderMetaMetric(label, value, highlight = false) {
  return `
    <article class="mini-card${highlight ? " mini-card--accent" : ""}">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function renderAccountNotes(account) {
  const container = document.getElementById("detailNotes");
  if (!container) return;

  const notes = [];
  const collectionWindowDays = getCollectionWindowDays(account);

  if (hasManualVideoViewsOverride(account)) {
    const manualTotal = Number(account?.manual_total_video_views_recent_window) || 0;
    const collectorTotal = Number(account?.collector_total_video_views_recent_window);
    const collectorComparison = Number.isFinite(collectorTotal) && collectorTotal >= 0
      ? ` Collector value: ${formatNumber(collectorTotal)}.`
      : "";
    const updatedAt = account?.manual_metrics_updated_at
      ? ` Updated ${formatDate(account.manual_metrics_updated_at)}.`
      : "";

    notes.push(`
      <article class="detail-note">
        <div class="detail-note-badges">
          <span class="detail-note-badge detail-note-badge--manual">manual impressions</span>
        </div>
        <strong>${collectionWindowDays}d impressions are using a manual override</strong>
        <p>Dashboard total: ${formatNumber(manualTotal)}.${collectorComparison}${updatedAt}</p>
      </article>
    `);
  }

  if (isPlaceholderAccount(account)) {
    notes.push(`
      <article class="detail-note">
        <div class="detail-note-badges">
          <span class="detail-note-badge detail-note-badge--placeholder">pending scrape</span>
        </div>
        <strong>Collector has not populated this account yet</strong>
        <p>This handle is already tracked in <code>collector/accounts.json</code>, so the dashboard keeps it visible as a placeholder until a refresh publishes a successful dataset.</p>
      </article>
    `);
  }

  container.innerHTML = notes.join("");
  container.classList.toggle("hidden", notes.length === 0);
}

/* ── Follower history line chart ─────────────────────────────── */

async function renderHistory(account) {
  let history = [];
  try {
    history = await fetchJson(`history/${account.account}.json`);
  } catch (_) {
    history = [];
  }

  destroyChart("history");

  const canvas = document.getElementById("historyChart");
  // Remove any previous snapshot overlay
  const existing = canvas.parentElement.querySelector(".history-snapshot");
  if (existing) existing.remove();

  if (!history.length || history.length < 2) {
    canvas.style.display = "none";
    const snap = document.createElement("div");
    snap.className = "history-snapshot";
    snap.innerHTML = `
      <div class="snapshot-icon">📊</div>
      <p class="snapshot-title">Collecting data…</p>
      <p class="snapshot-hint">The growth chart will appear once more daily snapshots have been recorded.</p>
    `;
    canvas.parentElement.appendChild(snap);
    return;
  }

  // 2+ data points — render the line chart
  canvas.style.display = "";
  const histCtx = canvas.getContext("2d");
  const fillGrad = histCtx.createLinearGradient(0, 0, 0, 280);
  fillGrad.addColorStop(0, "rgba(207, 255, 4, 0.18)");
  fillGrad.addColorStop(1, "rgba(207, 255, 4, 0.0)");

  state.charts.history = new Chart(histCtx, {
    type: "line",
    data: {
      labels: history.map((p) => p.date),
      datasets: [
        {
          label: "Followers",
          data: history.map((p) => p.followers || 0),
          borderColor: chartColors.accent,
          backgroundColor: fillGrad,
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: chartColors.accent,
          pointBorderColor: "#000000",
          pointBorderWidth: 2,
          pointHoverRadius: 8,
          fill: true,
          tension: 0.35,
        },
      ],
    },
    options: buildChartOptions({
      plugins: {
        legend: { display: false },
      },
    }),
  });
}

/* ── Recent posts — TOP 5 MOST LIKED, LAST 14 DAYS ──────────── */

function renderRecentPosts(account) {
  const container = document.getElementById("recentPosts");
  const allPosts = account.recent_posts || [];
  const referenceDate = resolveReferenceDate(account);
  updateRecentPostsWindow(referenceDate, account);
  const windowDays = Number(account?.recent_posts_window_days) || 14;

  // Hidden likes come through as "3", so those posts fall back to comments for ranking.
  const filtered = allPosts
    .filter((post) => {
      const ageInDays = daysAgo(post.date, referenceDate);
      return ageInDays >= 0 && ageInDays <= windowDays;
    })
    .sort(compareRecentPosts)
    .slice(0, 5);

  if (!filtered.length) {
    container.innerHTML = `<p class="empty-state">No posts in the last ${windowDays} days.</p>`;
    return;
  }

  container.innerHTML = filtered
    .map((post, i) => {
      const badge =
        i === 0
          ? '<span class="top-badge">🔥 Top post</span>'
          : `<span class="rank-badge">#${i + 1}</span>`;

      const caption =
        post.caption && post.caption.length > 120
          ? post.caption.slice(0, 120) + "…"
          : post.caption || "No caption captured.";

      return `
        <article class="post-row${i === 0 ? " post-row--top" : ""}">
          <div class="post-content">
            ${badge}
            <p class="post-date">${formatDate(post.date)}</p>
            <p class="post-caption">${caption}</p>
            <a href="${post.url}" target="_blank" rel="noreferrer" class="post-link">View post →</a>
          </div>
          <div class="post-metrics">
            <span class="metric metric--likes">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              ${formatPostLikes(post)}
            </span>
            <span class="metric metric--comments">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              ${formatNumber(post.comments)}
            </span>
            ${post.video_views ? `<span class="metric metric--views">▶ ${formatNumber(post.video_views)}</span>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

/* ── Account detail panel ────────────────────────────────────── */

async function renderAccountDetail(account) {
  document.getElementById("detailTitle").textContent = `@${account.account}`;

  const link = document.getElementById("detailLink");
  link.href = account.profile_url;
  link.classList.remove("hidden");

  const avatar = document.getElementById("detailAvatar");
  const profilePicUrl = getAvatarUrl(account);
  if (avatar) {
    if (profilePicUrl) {
      avatar.src = profilePicUrl;
      avatar.alt = `@${account.account} profile photo`;
      avatar.classList.remove("hidden");
    } else {
      avatar.removeAttribute("src");
      avatar.alt = "";
      avatar.classList.add("hidden");
    }
  }

  const collectionWindowDays = getCollectionWindowDays(account);

  document.getElementById("detailMeta").innerHTML = [
    renderMetaMetric("Followers", formatNumber(account.followers), true),
    renderMetaMetric("Following", formatNumber(account.following)),
    renderMetaMetric("Posts", formatNumber(account.posts)),
    renderMetaMetric("Avg likes", formatNumber(account.avg_likes)),
    renderMetaMetric("Avg comments", formatNumber(account.avg_comments)),
    renderMetaMetric("Avg video views", formatVideoViewsMetric(account)),
    renderMetaMetric(`${collectionWindowDays}d impressions`, formatRecentWindowVideoViewsMetric(account), true),
    renderMetaMetric("Engagement", formatPercent(account.engagement_rate), true),
    renderMetaMetric("Verified", account.is_verified ? "✓ Yes" : "✗ No"),
  ].join("");
  renderAccountNotes(account);

  renderRecentPosts(account);
  await renderHistory(account);
}

/* ── Manual refresh controls ─────────────────────────────────── */

function setupRefreshControls() {
  loadRefreshSettings();

  const refreshButton = document.getElementById("refreshButton");
  const configureButton = document.getElementById("refreshConfigButton");
  const configForm = document.getElementById("refreshConfigForm");
  const configCancel = document.getElementById("refreshConfigCancel");
  const apiUrlInput = document.getElementById("refreshApiUrlInput");
  const adminKeyInput = document.getElementById("refreshAdminKeyInput");

  if (!refreshButton || !configureButton || !configForm || !configCancel || !apiUrlInput || !adminKeyInput) {
    return;
  }

  syncRefreshButtonState();
  applyRefreshStatusFromRun(null);

  configureButton.addEventListener("click", () => {
    const isOpen = !configForm.classList.contains("hidden");
    toggleRefreshConfig(!isOpen);
  });

  configCancel.addEventListener("click", () => {
    toggleRefreshConfig(false);
    applyRefreshStatusFromRun(state.refresh.activeRun);
  });

  configForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    saveRefreshSettings({
      apiBaseUrl: apiUrlInput.value,
      adminKey: adminKeyInput.value,
    });
    toggleRefreshConfig(false);
    applyRefreshStatusFromRun(state.refresh.activeRun);
    if (hasRefreshService()) {
      await refreshWorkflowStatus({ silent: false });
    }
  });

  refreshButton.addEventListener("click", async () => {
    if (!hasRefreshCredentials() || state.refresh.isSubmitting) {
      toggleRefreshConfig(true);
      renderRefreshStatus("Save a refresh API URL and admin key before triggering a run.", "warning");
      syncRefreshButtonState();
      return;
    }

    state.refresh.isSubmitting = true;
    syncRefreshButtonState();
    renderRefreshStatus("Queuing collector workflow…", "progress");

    try {
      const payload = await fetchRefreshApi("/api/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.refresh.settings.adminKey}`,
        },
        body: JSON.stringify({
          requested_by: "dashboard-ui",
          source_url: window.location.href,
        }),
      });
      state.refresh.awaitingPublishedData = true;
      applyRefreshStatusFromRun(payload?.run || null);
      scheduleRefreshStatusPoll();
    } catch (error) {
      if (error.payload?.run) {
        applyRefreshStatusFromRun(error.payload.run);
        scheduleRefreshStatusPoll();
      } else {
        renderRefreshStatus(error.message, "error");
      }
    } finally {
      state.refresh.isSubmitting = false;
      syncRefreshButtonState();
    }
  });
}

/* ── Reveal animation ────────────────────────────────────────── */

function revealPanels() {
  const items = document.querySelectorAll(".reveal");
  items.forEach((item, index) => {
    item.style.animationDelay = `${index * 120}ms`;
    item.classList.add("visible");
  });
}

/* ── Bootstrap ───────────────────────────────────────────────── */

async function loadDashboard() {
  setupRefreshControls();

  try {
    await reloadDashboardData({ silent: true });
    await refreshWorkflowStatus({ silent: true });
    if (state.refresh.activeRun && ACTIVE_RUN_STATUSES.has(state.refresh.activeRun.status)) {
      state.refresh.awaitingPublishedData = true;
      scheduleRefreshStatusPoll();
    }
  } catch (error) {
    renderFatalBanner(error.message);
    renderSnapshotDate("Unavailable");
    renderRefreshStatus("Dashboard data could not be loaded.", "error");
    document.getElementById("detailMeta").innerHTML = `<p class="empty-state">${error.message}</p>`;
    const detailNotes = document.getElementById("detailNotes");
    if (detailNotes) {
      detailNotes.innerHTML = "";
      detailNotes.classList.add("hidden");
    }
  }

  revealPanels();
}

window.addEventListener("DOMContentLoaded", loadDashboard);
