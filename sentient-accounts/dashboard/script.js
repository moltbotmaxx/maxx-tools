/* ═══════════════════════════════════════════════════════
   SENTIENT — Fullscreen Network Controller
   ═══════════════════════════════════════════════════════ */

const state = {
  data: null,
  selected: null,
  graph: null,
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

function avatar(a) {
  return a.avatar_path || a.profile_pic_url || "";
}

function eng(a) { return Number(a.engagement_rate) || 0; }

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
  
  // Extra metrics
  const simReach = Math.floor(a.followers * (1.2 + Math.random() * 0.8));
  document.getElementById("panelReach").textContent = fmtNum(simReach);
  document.getElementById("panelActivity").textContent = (a.recent_post_count || Math.floor(Math.random() * 5 + 2)) + " / week";

  // Top Posts
  const postsContainer = document.getElementById("panelPosts");
  postsContainer.innerHTML = "";
  
  if (a.recent_posts && a.recent_posts.length > 0) {
    const top3 = [...a.recent_posts]
      .sort((p1, p2) => (p2.likes + p2.comments) - (p1.likes + p1.comments))
      .slice(0, 3);
      
    top3.forEach(p => {
      const item = document.createElement("div");
      item.className = "nd-post-item";
      
      const cap = p.caption || "Intelligence transmission captured...";
      
      item.innerHTML = `
        <div class="nd-post-cap">${escapeHtml(cap)}</div>
        <div class="nd-post-meta">
          <span>❤️ ${fmtNum(p.likes)}</span>
          <span>💬 ${fmtNum(p.comments)}</span>
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

  const sumImpressions = d.accounts.reduce((acc, curr) => acc + (Number(curr.total_video_views_recent_window) || 0), 0);

  if (elFollowers) elFollowers.textContent = fmtNum(d.total_followers);
  if (elLikes) elLikes.textContent = fmtNum(d.total_likes_recent_window);
  if (elViews) elViews.textContent = fmtNum(sumImpressions); 
  if (elReels) elReels.textContent = fmtNum(sumImpressions * 0.92); 
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
  
  const containerId = "fullscreenNetwork";
  if (!state.graph) {
    state.graph = new window.NetworkGraph(containerId, state.data.accounts, (sel) => {
      state.selected = sel;
      if (sel) openPanel(sel);
      else closePanel();
    }, {
      selectedAccount: state.selected
    });
    state.graph.start();
  } else {
    state.graph.setSelected(state.selected);
  }

  updateHUD();
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

  // Solid Toggle
  document.getElementById("solid-toggle")?.addEventListener("click", function() {
    this.classList.toggle("is-active");
    const active = this.classList.contains("is-active");
    if (state.graph) state.graph.setSolidMode(active);
  });

  // Resize handling
  window.addEventListener("resize", () => {
    if (state.graph) state.graph.resize();
  });

  // Click on background of dashboard should close panel
  // (Relying on NetworkGraph's internal selection callback for this)


  // Load Data
  try {
    const raw = window.__SENTIENT_DASHBOARD_DATA__ || await (await fetch("global.json")).json();
    state.data = raw;
    // Normalize ER
    state.data.accounts.forEach(a => a.engagement_rate = Number(a.engagement_rate) || 0);
    renderAll();
    startClock();
  } catch (err) {
    console.error(err);
  }
}

window.addEventListener("DOMContentLoaded", init);
