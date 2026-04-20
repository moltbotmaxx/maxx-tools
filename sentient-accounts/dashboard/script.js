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

  // Debug Panel Logic
  const debugPanel = document.getElementById("debug-panel");
  const openDebug = document.getElementById("open-debug");
  const closeDebug = document.getElementById("close-debug");

  openDebug?.addEventListener("click", () => {
    debugPanel.classList.add("is-open");
    // Sync sliders with current graph state
    if (state.graph) {
      syncDebug(state.graph);
    }
  });
  closeDebug?.addEventListener("click", () => debugPanel.classList.remove("is-open"));

  function syncDebug(g) {
    const params = [
      { id: 'timescale', key: 'timeScale', valId: 'val-timescale' },
      { id: 'speed', key: 'maxSpeed', valId: 'val-speed' },
      { id: 'friction', key: 'friction', valId: 'val-friction' },
      { id: 'gravity', key: 'centerGravityMultiplier', valId: 'val-gravity' },
      { id: 'repulsion', key: 'repulsionStrength', valId: 'val-repulsion' },
      { id: 'repulsion-r', key: 'repulsionRadiusMultiplier', valId: 'val-repulsion-r' },
      { id: 'wander', key: 'wanderStrength', valId: 'val-wander' },
      { id: 'grid-blend', key: 'gridBlend', valId: 'val-grid-blend' },
      { id: 'tether-s', key: 'tetherStrength', valId: 'val-tether-s' },
      { id: 'tether-d', key: 'tetherMaxDist', valId: 'val-tether-d' },
      { id: 'chaos-s', key: 'chaosBurstStrength', valId: 'val-chaos-s' },
      { id: 'chaos-f', key: 'chaosFreq', valId: 'val-chaos-f' },
      { id: 'node-size', key: 'nodeRadius', valId: 'val-node-size' },
      { id: 'link-op', key: 'linkOpacity', valId: 'val-link-op' },
      { id: 'link-l', key: 'linkDistLimit', valId: 'val-link-l' }
    ];

    params.forEach(p => {
      const input = document.getElementById(`param-${p.id}`);
      const label = document.getElementById(p.valId);
      if (input && label) {
        input.value = g[p.key];
        label.textContent = g[p.key];
        input.oninput = (e) => {
          const val = parseFloat(e.target.value);
          g[p.key] = val;
          label.textContent = val;
          if (p.key === 'nodeRadius' && g.updateNodeGeometry) g.updateNodeGeometry();
          if (p.key === 'repulsionRadiusMultiplier') g.repulsionRadius = g.nodeRadius * val;
        };
      }
    });
  }

  document.getElementById("export-config")?.addEventListener("click", () => {
    if (!state.graph) return;
    const g = state.graph;
    const config = {};
    [
      'timeScale', 'maxSpeed', 'friction', 'centerGravityMultiplier', 
      'repulsionStrength', 'repulsionRadiusMultiplier', 'wanderStrength', 
      'gridBlend', 'tetherStrength', 'tetherMaxDist', 'chaosBurstStrength', 
      'chaosFreq', 'nodeRadius', 'linkOpacity', 'linkDistLimit'
    ].forEach(k => config[k] = g[k]);

    const str = JSON.stringify(config, null, 2);
    console.log("SENTIENT MASTER CONFIG:", str);
    prompt("MASTER CONFIG EXPORTED (Copy to clipboard):", str);
  });

  document.getElementById("import-config")?.addEventListener("click", () => {
    if (!state.graph) return;
    const raw = prompt("PASTE MASTER CONFIG JSON:");
    if (!raw) return;
    try {
      const cfg = JSON.parse(raw);
      Object.assign(state.graph, cfg);
      syncDebug(state.graph);
      if (state.graph.updateNodeGeometry) state.graph.updateNodeGeometry();
      alert("SYSTEM RECALIBRATED SUCCESSFULLY");
    } catch (e) {
      alert("INVALID CONFIG JSON");
    }
  });

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
