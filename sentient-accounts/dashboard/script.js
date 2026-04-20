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
  const simActivity = (eng(a) * (0.8 + Math.random() * 0.4)).toFixed(1) + "/10";
  document.getElementById("panelActivity").textContent = simActivity;

  // Recent Posts
  const postList = document.getElementById("panelPosts");
  postList.innerHTML = "";
  if (a.recent_posts && a.recent_posts.length > 0) {
    a.recent_posts.slice(0, 3).forEach(p => {
      const div = document.createElement("div");
      div.className = "nd-post-item";
      div.innerHTML = `
        <div class="nd-post-cap">${escapeHtml(p.caption)}</div>
        <div class="nd-post-metrics">
          <div class="nt-stat"><span class="lbl">Likes</span> <span>${fmtNum(p.likes)}</span></div>
          <div class="nt-stat"><span class="lbl">Comments</span> <span>${fmtNum(p.comments)}</span></div>
        </div>
      `;
      postList.appendChild(div);
    });
  }

  panel.classList.add("is-open");
}

function closePanel() {
  document.getElementById("sidePanel").classList.remove("is-open");
  if (state.graph) state.graph.setSelected(null);
}

/* ── HUD Update ────────────────────────────────────── */
function updateHUD() {
  if (!state.data) return;
  
  document.getElementById("totalAccounts").textContent = fmtNum(state.data.total_accounts);
  document.getElementById("totalFollowers").textContent = fmtNum(state.data.total_followers);
  document.getElementById("avgEngagement").textContent = fmtPct(state.data.avg_engagement_rate);
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

/* ── Main ──────────────────────────────────────────── */
function renderAll() {
  if (!state.data) return;
  
  const containerId = "fullscreenNetwork";
  if (!state.graph) {
    console.log("Creating NetworkGraph...");
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

async function init() {
  console.log("Initializing Dashboard...");
  
  document.getElementById("closePanel")?.addEventListener("click", closePanel);
  document.getElementById("appOverlay")?.addEventListener("click", closePanel);

  startClock();

  try {
    const raw = window.__SENTIENT_DASHBOARD_DATA__ || await (await fetch("global.json")).json();
    state.data = raw;
    console.log("Data loaded", state.data.accounts.length, "accounts");
    
    state.data.accounts.forEach(a => a.engagement_rate = Number(a.engagement_rate) || 0);
    renderAll();
  } catch (err) {
    console.error("Failed to load data:", err);
  }
}

window.addEventListener("DOMContentLoaded", init);
