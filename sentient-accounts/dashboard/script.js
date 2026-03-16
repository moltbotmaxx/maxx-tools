const state = {
  data: null,
  selectedAccount: null,
  charts: {},
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
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
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

function daysAgo(dateStr, refDate) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return Infinity;
  return Math.floor((refDate - d) / (1000 * 60 * 60 * 24));
}

/* ── Overview stats ──────────────────────────────────────────── */

function renderOverview(data) {
  document.getElementById("totalFollowers").textContent = formatNumber(data.total_followers);
  document.getElementById("totalAccounts").textContent = data.total_accounts;
  document.getElementById("totalPosts").textContent = formatNumber(data.total_posts);
  document.getElementById("avgEngagement").textContent = formatPercent(data.avg_engagement_rate);
  document.getElementById("lastUpdated").textContent = `Last update · ${formatDate(data.generated_at || data.date)}`;
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
      <div class="chip-header">
        <span class="chip-dot" style="background:${engColor}"></span>
        <span class="account-name">@${account.account}</span>
      </div>
      <span class="account-followers">${formatNumber(account.followers)} followers</span>
      <span class="account-engagement">${formatPercent(account.engagement_rate)} eng.</span>
    `;

    button.addEventListener("click", () => {
      state.selectedAccount = account;
      renderAccountList(accounts);
      renderAccountDetail(account);
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
  const now = new Date("2026-03-15T06:00:00Z"); // use generated_at reference

  // Filter to last 14 days, sort by likes desc, take top 5
  const filtered = allPosts
    .filter((p) => daysAgo(p.date, now) <= 14)
    .sort((a, b) => (b.likes || 0) - (a.likes || 0))
    .slice(0, 5);

  if (!filtered.length) {
    container.innerHTML = '<p class="empty-state">No posts in the last 14 days.</p>';
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
              ${formatNumber(post.likes)}
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

  document.getElementById("detailMeta").innerHTML = [
    renderMetaMetric("Followers", formatNumber(account.followers), true),
    renderMetaMetric("Following", formatNumber(account.following)),
    renderMetaMetric("Posts", formatNumber(account.posts)),
    renderMetaMetric("Avg likes", formatNumber(account.avg_likes)),
    renderMetaMetric("Avg comments", formatNumber(account.avg_comments)),
    renderMetaMetric("Avg views", formatNumber(account.avg_video_views)),
    renderMetaMetric("Engagement", formatPercent(account.engagement_rate), true),
    renderMetaMetric("Verified", account.is_verified ? "✓ Yes" : "✗ No"),
  ].join("");

  renderRecentPosts(account);
  await renderHistory(account);
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
  try {
    const data = await fetchJson("global.json");
    state.data = data;

    renderOverview(data);
    renderPortfolioCharts(data.accounts || []);

    if (data.accounts?.length) {
      state.selectedAccount = data.accounts[0];
      renderAccountList(data.accounts);
      await renderAccountDetail(state.selectedAccount);
    } else {
      renderAccountList([]);
      document.getElementById("detailMeta").innerHTML =
        '<p class="empty-state">Run the collector to populate the dashboard.</p>';
      document.getElementById("recentPosts").innerHTML = "";
    }
  } catch (error) {
    document.getElementById("lastUpdated").textContent =
      "Dashboard data could not be loaded.";
    document.getElementById("detailMeta").innerHTML = `<p class="empty-state">${error.message}</p>`;
  }

  revealPanels();
}

window.addEventListener("DOMContentLoaded", loadDashboard);
