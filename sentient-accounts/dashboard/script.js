/* ═══════════════════════════════════════════════════════
   SENTIENT — Fullscreen Network Controller
   ═══════════════════════════════════════════════════════ */

const state = {
  data: null,
  selected: null,
  graph: null,
  refreshPollTimer: null,
};

/* ── Helpers ───────────────────────────────────────── */
function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = String(str ?? "");
  return d.innerHTML;
}

function fmtNum(n) {
  n = Number(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return new Intl.NumberFormat("en-US").format(n);
}

function fmtPct(n) {
  return (Number(n) || 0).toFixed(2) + "%";
}

function fmtDate(dateString) {
  if (!dateString) return "Unknown";
  const d = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysSince(dateString) {
  if (!dateString) return null;
  const d = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.floor((start - d) / 86400000));
}

function avatar(a) {
  return a.avatar_path || a.profile_pic_url || "";
}

function eng(a) { return Number(a.engagement_rate) || 0; }

function totalViews(a) { return Number(a.total_video_views_recent_window) || 0; }
function totalLikes(a) { return Number(a.total_likes_recent_window) || 0; }
function postLikes(p) { return Number(p?.likes) === 3 ? 0 : Number(p?.likes) || 0; }
function postScore(p) { return postLikes(p) + (Number(p?.comments) || 0); }

function formatPostLikes(p) {
  return Number(p?.likes) === 3 ? "Hidden" : fmtNum(p?.likes);
}

function viewSourceLabel(a) {
  if (a.video_views_recent_window_source === "manual_override") return "Manual";
  if ((Number(a.video_posts_with_view_data_recent_window) || 0) > 0) return "Collector";
  if (totalViews(a) > 0) return "Dataset";
  return "None";
}

function isSimpleMobileView() {
  return window.matchMedia("(max-width: 700px)").matches;
}

function accountSegment(a) {
  const text = `${a.account || ""} ${a.full_name || ""} ${a.biography || ""}`.toLowerCase();
  if (/stoic|estoic|morir|vivir|procrastination|reflection/.test(text)) return "mindset";
  if (/costa|tras el velo|ivanel|louis|sergio|truco|tecnologia|artificialmente/.test(text)) return "spanish";
  if (/excel|programming|developer|code|prompt/.test(text)) return "tools";
  if (/basket|bball|nba/.test(text)) return "sports";
  return "ai-media";
}

function hasSpanishSignal(a) {
  return accountSegment(a) === "spanish" || /[áéíóúñ¿¡]/i.test(`${a.full_name || ""} ${a.biography || ""}`);
}

/* ── Panel Management ─────────────────────────────── */
function openPanel(a) {
  if (!a) { closePanel(); return; }
  
  const panel = document.getElementById("sidePanel");
  document.getElementById("panelAvatar").src = avatar(a);
  document.getElementById("panelName").textContent = a.full_name || a.account;
  document.getElementById("panelHandle").textContent = "@" + a.account;
  document.getElementById("panelFollowers").textContent = fmtNum(a.followers);
  document.getElementById("panelEngagement").textContent = fmtPct(eng(a));
  document.getElementById("panelBio").textContent = a.biography || "No intelligence data available.";
  document.getElementById("panelLink").href = "https://instagram.com/" + encodeURIComponent(a.account);
  
  document.getElementById("panelViews").textContent = fmtNum(totalViews(a));
  document.getElementById("panelLikes").textContent = fmtNum(totalLikes(a));
  document.getElementById("panelActivity").textContent = fmtNum(a.recent_post_count || 0);
  document.getElementById("panelSource").textContent = viewSourceLabel(a);

  // Top Posts
  const postsContainer = document.getElementById("panelPosts");
  postsContainer.innerHTML = "";
  
  if (a.recent_posts && a.recent_posts.length > 0) {
    const top3 = [...a.recent_posts]
      .sort((p1, p2) => postScore(p2) - postScore(p1))
      .slice(0, 3);
      
    top3.forEach(p => {
      const item = document.createElement("div");
      item.className = "nd-post-item";
      
      const cap = p.caption || "Intelligence transmission captured...";
      
      item.innerHTML = `
        <div class="nd-post-cap">${escapeHtml(cap)}</div>
        <div class="nd-post-meta">
          <span>Likes ${formatPostLikes(p)}</span>
          <span>Comments ${fmtNum(p.comments)}</span>
          <span style="margin-left:auto; opacity:0.5">${p.date}</span>
        </div>
      `;
      postsContainer.appendChild(item);
    });
  } else {
    postsContainer.innerHTML = '<div style="grid-column: span 3; font-size: 11px; color: var(--text-muted);">No recent transmissions detected.</div>';
  }

  panel.classList.add("is-open");
}

function closePanel() {
  const panel = document.getElementById("sidePanel");
  if (panel && panel.classList.contains("is-open")) {
    panel.classList.remove("is-open");
    state.selected = null;
    if (state.graph) state.graph.setSelected(null);
  }
}

/* ── HUD Updates ───────────────────────────────────── */
function updateHUD() {
  if (!state.data) return;
  const d = state.data;
  
  const elFollowers = document.getElementById("totalFollowers");
  const elLikes = document.getElementById("totalLikes");
  const elViews = document.getElementById("totalViews");
  const elReels = document.getElementById("totalReels");

  if (elFollowers) elFollowers.textContent = fmtNum(d.total_followers);
  if (elLikes) elLikes.textContent = fmtNum(d.total_likes_recent_window);
  if (elViews) elViews.textContent = fmtNum(d.total_video_views_recent_window);
  if (elReels) elReels.textContent = fmtPct(d.avg_engagement_rate);
  updateDataFreshness();
  updateInsights();
  updateMobileSimpleView();
}

function updateDataFreshness() {
  const d = state.data;
  const label = document.getElementById("dataFreshness");
  const dot = document.querySelector(".status-dot");
  const snapshotMeta = document.getElementById("snapshotMeta");
  if (!d || !label) return;

  const age = daysSince(d.snapshot_date || d.date);
  const isStale = age !== null && age > 2;
  const isOld = age !== null && age > 7;
  const copy = age === null
    ? "DATA UNKNOWN"
    : isStale
      ? `DATA STALE (${age}D)`
      : "DATA CURRENT";

  label.textContent = copy;
  label.dataset.state = isOld ? "old" : isStale ? "stale" : "current";
  if (dot) dot.dataset.state = label.dataset.state;
  if (snapshotMeta) {
    const covered = d.recent_window_covered ? "covered" : "partial";
    snapshotMeta.textContent = `${fmtDate(d.snapshot_date || d.date)} snapshot · ${d.recent_window_days || 30}d window · ${covered}`;
  }
}

function updateInsights() {
  const d = state.data;
  if (!d?.accounts?.length) return;
  const accounts = [...d.accounts];
  const byViews = [...accounts].sort((a, b) => totalViews(b) - totalViews(a));
  const byEngagement = [...accounts].filter(a => Number(a.followers) > 0).sort((a, b) => eng(b) - eng(a));
  const topViews = byViews[0];
  const topEr = byEngagement[0];

  document.getElementById("topViewsAccount").textContent = topViews ? `@${topViews.account}` : "--";
  document.getElementById("topViewsValue").textContent = topViews ? `${fmtNum(totalViews(topViews))} views` : "--";
  document.getElementById("topEngagementAccount").textContent = topEr ? `@${topEr.account}` : "--";
  document.getElementById("topEngagementValue").textContent = topEr ? `${fmtPct(eng(topEr))} ER` : "--";

  const manualCount = accounts.filter(a => a.video_views_recent_window_source === "manual_override").length;
  const failures = Number(d.load_failures?.length || 0);
  const stale = Number(d.stale_accounts_excluded?.length || 0);
  const quality = document.getElementById("dataQualityBadge");
  if (quality) {
    quality.textContent = failures || stale ? `${failures + stale} issue${failures + stale === 1 ? "" : "s"}` : `${manualCount} manual`;
    quality.dataset.state = failures || stale ? "warn" : "ok";
  }

  const list = document.getElementById("viewLeaderboard");
  if (list) {
    const max = Math.max(1, totalViews(byViews[0]));
    list.innerHTML = byViews.slice(0, 6).map(a => {
      const width = Math.max(3, (totalViews(a) / max) * 100);
      return `
        <button class="leaderboard-row" type="button" data-account="${escapeHtml(a.account)}">
          <span>@${escapeHtml(a.account)}</span>
          <strong>${fmtNum(totalViews(a))}</strong>
          <i style="width:${width}%"></i>
        </button>
      `;
    }).join("");
    list.querySelectorAll(".leaderboard-row").forEach(row => {
      row.addEventListener("click", () => {
        const account = accounts.find(a => a.account === row.dataset.account);
        if (account) {
          state.selected = account;
          openPanel(account);
          if (state.graph) state.graph.setSelected(account);
        }
      });
    });
  }
}

function updateMobileSimpleView() {
  const d = state.data;
  if (!d?.accounts?.length) return;

  const snapshot = document.getElementById("mobileSnapshot");
  const stateLabel = document.getElementById("mobileDataState");
  const age = daysSince(d.snapshot_date || d.date);
  const staleText = age === null ? "Unknown" : age > 2 ? `Stale · ${age}d` : "Current";

  if (snapshot) {
    snapshot.textContent = `${fmtDate(d.snapshot_date || d.date)} · ${d.recent_window_days || 30}d window · ${d.recent_window_covered ? "covered" : "partial"}`;
  }
  if (stateLabel) {
    stateLabel.textContent = staleText;
    stateLabel.dataset.state = age !== null && age > 2 ? "stale" : "current";
  }

  document.getElementById("mobileFollowers").textContent = fmtNum(d.total_followers);
  document.getElementById("mobileLikes").textContent = fmtNum(d.total_likes_recent_window);
  document.getElementById("mobileViews").textContent = fmtNum(d.total_video_views_recent_window);
  document.getElementById("mobileEngagement").textContent = fmtPct(d.avg_engagement_rate);

  const list = document.getElementById("mobileAccountList");
  if (!list) return;
  const leaders = [...d.accounts]
    .sort((a, b) => totalViews(b) - totalViews(a))
    .slice(0, 8);
  const maxViews = Math.max(1, totalViews(leaders[0]));
  list.innerHTML = leaders.map((a, index) => {
    const width = Math.max(3, (totalViews(a) / maxViews) * 100);
    return `
      <article class="mobile-account-row">
        <span class="mobile-rank">${index + 1}</span>
        <img src="${escapeHtml(avatar(a))}" alt="" />
        <div>
          <strong>@${escapeHtml(a.account)}</strong>
          <small>${fmtNum(a.followers)} followers · ${fmtPct(eng(a))} ER</small>
          <i style="width:${width}%"></i>
        </div>
        <b>${fmtNum(totalViews(a))}</b>
      </article>
    `;
  }).join("");
}

function startClock() {
  const el = document.getElementById("currentTimestamp");
  if (!el) return;
  const update = () => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString("en-US", { hour12: false });
  };
  update();
  setInterval(update, 1000);
}

/* ── Master Render ─────────────────────────────────── */
function renderAll() {
  if (!state.data) return;
  updateHUD();

  if (isSimpleMobileView()) {
    if (state.graph) {
      state.graph.stop();
      state.graph = null;
    }
    return;
  }
  
  const containerId = "fullscreenNetwork";
  if (!window.NetworkGraph) {
    renderDomFallback("Network renderer unavailable.");
    return;
  }

  if (!state.graph) {
    state.graph = new window.NetworkGraph(containerId, state.data.accounts, (sel) => {
      state.selected = sel;
      if (sel) openPanel(sel);
      else closePanel();
    }, {
      selectedAccount: state.selected,
      accountSegment,
      hasSpanishSignal,
    });
    state.graph.start?.();
    window.__sentientGraph = state.graph;
    window.__sentientRebuild = function () {
      if (state.graph) { state.graph.stop(); state.graph = null; }
      renderAll();
    };
  } else {
    state.graph.setSelected(state.selected);
  }

}

function renderDomFallback(message) {
  const fallback = document.getElementById("networkFallback");
  if (!fallback || !state.data) return;
  const accounts = [...state.data.accounts].sort((a, b) => Number(b.followers || 0) - Number(a.followers || 0));
  fallback.hidden = false;
  fallback.innerHTML = `
    <div class="fallback-shell">
      <div class="fallback-copy">
        <strong>${escapeHtml(message || "WebGL is unavailable.")}</strong>
        <span>Showing a static portfolio grid instead.</span>
      </div>
      <div class="fallback-grid">
        ${accounts.map(a => `
          <button class="fallback-account" type="button" data-account="${escapeHtml(a.account)}">
            <img src="${escapeHtml(avatar(a))}" alt="" />
            <span>@${escapeHtml(a.account)}</span>
            <small>${fmtNum(a.followers)} followers · ${fmtPct(eng(a))} ER</small>
          </button>
        `).join("")}
      </div>
    </div>
  `;
  fallback.querySelectorAll(".fallback-account").forEach(row => {
    row.addEventListener("click", () => {
      const account = accounts.find(a => a.account === row.dataset.account);
      state.selected = account;
      openPanel(account);
    });
  });
}

/* ── Fetch & Init ──────────────────────────────────── */
async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to load ${url}`);
  return r.json();
}

async function init() {
  // Bind close panel
  document.getElementById("closePanel")?.addEventListener("click", closePanel);
  document.getElementById("appOverlay")?.addEventListener("click", closePanel);

  // Mode Selector
  const modeBtns = document.querySelectorAll(".mode-btn");
  modeBtns.forEach(btn => {
    btn.addEventListener("click", function() {
      const mode = this.dataset.mode;
      modeBtns.forEach(b => b.classList.remove("is-active"));
      this.classList.add("is-active");
      if (state.graph) state.graph.setMode(mode);
    });
  });

  // Set initial active mode button
  const defaultMode = "solar";
  document.querySelector(`.mode-btn[data-mode="${defaultMode}"]`)?.classList.add("is-active");

  // Resize handling
  window.addEventListener("resize", () => {
    if (isSimpleMobileView()) {
      if (state.graph) {
        state.graph.stop();
        state.graph = null;
      }
      updateMobileSimpleView();
      return;
    }
    if (state.graph) state.graph.resize();
    else renderAll();
  });

  // Click on background of dashboard should close panel
  // (Relying on NetworkGraph's internal selection callback for this)

  bindRefreshControls();
  await loadDevSettingsIfRequested();

  // Load Data
  try {
    const raw = window.__SENTIENT_DASHBOARD_DATA__ || await (await fetch("global.json")).json();
    state.data = raw;
    // Normalize ER
    state.data.accounts.forEach(a => {
      a.engagement_rate = Number(a.engagement_rate) || 0;
      a.segment = accountSegment(a);
      a.is_spanish = hasSpanishSignal(a);
    });
    renderAll();
    startClock();
  } catch (err) {
    console.error(err);
    renderDomFallback("Dataset could not be loaded.");
  }
}

window.addEventListener("DOMContentLoaded", init);

function getRefreshConfig() {
  const cfg = window.SENTIENT_ACCOUNTS_CONFIG || {};
  const urlKey = cfg.refreshApiBaseStorageKey || "sentient-accounts-refresh-api-url";
  const keyKey = cfg.refreshAdminKeyStorageKey || "sentient-accounts-refresh-admin-key";
  return {
    apiBase: (localStorage.getItem(urlKey) || cfg.refreshApiBaseUrl || "").replace(/\/$/, ""),
    adminKey: localStorage.getItem(keyKey) || "",
    urlKey,
    keyKey,
    pollMs: cfg.statusPollIntervalMs || 15000,
    maxPolls: cfg.maxStatusPollAttempts || 40,
  };
}

function setRefreshStatus(message, stateName = "idle") {
  const buttons = [
    document.getElementById("refreshDataBtn"),
    document.getElementById("refreshDataBtnCompact"),
    document.getElementById("mobileRefreshBtn"),
  ].filter(Boolean);
  buttons.forEach(btn => {
    btn.dataset.state = stateName;
    btn.textContent = message;
  });
}

function bindRefreshControls() {
  const refreshBtn = document.getElementById("refreshDataBtn");
  const compactRefreshBtn = document.getElementById("refreshDataBtnCompact");
  const mobileRefreshBtn = document.getElementById("mobileRefreshBtn");
  const configBtn = document.getElementById("configureRefreshBtn");
  refreshBtn?.addEventListener("click", queueRefresh);
  compactRefreshBtn?.addEventListener("click", queueRefresh);
  mobileRefreshBtn?.addEventListener("click", queueRefresh);
  configBtn?.addEventListener("click", configureRefresh);
}

function configureRefresh() {
  const cfg = getRefreshConfig();
  const nextUrl = window.prompt("Refresh API URL", cfg.apiBase || "");
  if (nextUrl === null) return;
  const nextKey = window.prompt("Admin refresh key", cfg.adminKey || "");
  if (nextKey === null) return;
  localStorage.setItem(cfg.urlKey, nextUrl.trim().replace(/\/$/, ""));
  localStorage.setItem(cfg.keyKey, nextKey.trim());
  setRefreshStatus("Configured", "ok");
  setTimeout(() => setRefreshStatus("Refresh", "idle"), 1600);
}

async function queueRefresh() {
  const cfg = getRefreshConfig();
  if (!cfg.apiBase || !cfg.adminKey) {
    configureRefresh();
    return;
  }

  setRefreshStatus("Queueing", "busy");
  try {
    const response = await fetch(`${cfg.apiBase}/api/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.adminKey}`,
      },
      body: JSON.stringify({
        requested_by: "dashboard-ui",
        source_url: window.location.href,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.detail || "Refresh failed.");
    setRefreshStatus(payload.run?.status === "completed" ? "Complete" : "Queued", "ok");
    pollRefreshStatus(0);
  } catch (err) {
    console.error(err);
    setRefreshStatus("Failed", "error");
    setTimeout(() => setRefreshStatus("Refresh", "idle"), 3500);
  }
}

async function pollRefreshStatus(attempt) {
  const cfg = getRefreshConfig();
  if (!cfg.apiBase || attempt >= cfg.maxPolls) {
    setRefreshStatus("Refresh", "idle");
    return;
  }
  clearTimeout(state.refreshPollTimer);
  state.refreshPollTimer = setTimeout(async () => {
    try {
      const response = await fetch(`${cfg.apiBase}/api/status`);
      const payload = await response.json();
      const run = payload.run || {};
      if (payload.has_active_run || ["queued", "in_progress", "requested", "waiting", "pending"].includes(run.status)) {
        setRefreshStatus("Running", "busy");
        pollRefreshStatus(attempt + 1);
      } else if (run.conclusion === "success") {
        setRefreshStatus("Published soon", "ok");
        setTimeout(() => setRefreshStatus("Refresh", "idle"), 5000);
      } else {
        setRefreshStatus("Check run", "error");
        setTimeout(() => setRefreshStatus("Refresh", "idle"), 5000);
      }
    } catch (err) {
      console.error(err);
      setRefreshStatus("Status error", "error");
      setTimeout(() => setRefreshStatus("Refresh", "idle"), 3500);
    }
  }, cfg.pollMs);
}

function loadDevSettingsIfRequested() {
  const params = new URLSearchParams(window.location.search);
  const enabled = params.has("dev") || params.has("settings") || localStorage.getItem("sentient-dev-settings") === "1";
  if (!enabled) return Promise.resolve();
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "./settings-panel.js";
    script.onload = resolve;
    script.onerror = resolve;
    document.head.appendChild(script);
  });
}
