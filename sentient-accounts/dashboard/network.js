/* ─────────────────────────────────────────────────────────
   Sentient Network Graph · Canvas force visualization
   ───────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // Engagement tier colors
  const RIM = {
    top:  { solid: '#00e5ff', a: 'rgba(0,229,255,'   },
    good: { solid: '#cfff04', a: 'rgba(207,255,4,'   },
    avg:  { solid: '#a855f7', a: 'rgba(168,85,247,'  },
    low:  { solid: '#3a3a48', a: 'rgba(58,58,72,'    },
  };

  function tierFor(eng) {
    const e = Number(eng) || 0;
    if (e >= 3)   return RIM.top;
    if (e >= 1.5) return RIM.good;
    if (e >= 0.5) return RIM.avg;
    return RIM.low;
  }

  function fmt(v) {
    const n = Number(v) || 0;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(n);
  }

  class NetworkGraph {
    constructor(containerId, accounts, onSelect) {
      this.container = document.getElementById(containerId);
      if (!this.container) return;

      this.accounts = accounts;
      this.onSelect = onSelect;
      this.nodes    = [];
      this.links    = [];
      this.images   = {};
      this.mouse    = { x: -9999, y: -9999 };
      this.hovered  = null;
      this.running  = false;
      this.raf      = null;
      this.tick     = 0;
      this._dataVersion = null;

      this.tooltip  = document.getElementById('networkTooltip');

      // Build canvas
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'network-canvas';
      this.ctx = this.canvas.getContext('2d');
      this.container.appendChild(this.canvas);

      // Bind event handlers
      this._mm = this._onMove.bind(this);
      this._ml = this._onLeave.bind(this);
      this._mc = this._onClick.bind(this);
      this.canvas.addEventListener('mousemove',  this._mm);
      this.canvas.addEventListener('mouseleave', this._ml);
      this.canvas.addEventListener('click',      this._mc);

      this.resize();
      this._resizeObs = () => this.resize();
      window.addEventListener('resize', this._resizeObs);
    }

    resize() {
      const dpr  = window.devicePixelRatio || 1;
      const rect = this.container.getBoundingClientRect();
      // Use container dimensions if visible, otherwise fall back to CSS-computed values
      this.W = rect.width  > 10 ? rect.width  : this.container.offsetWidth  || 900;
      this.H = rect.height > 10 ? rect.height : this.container.offsetHeight || 500;
      this.canvas.width  = Math.floor(this.W * dpr);
      this.canvas.height = Math.floor(this.H * dpr);
      this.canvas.style.width  = `${this.W}px`;
      this.canvas.style.height = `${this.H}px`;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.cx = this.W / 2;
      this.cy = this.H / 2;

      // Reposition nodes on resize if they already exist
      if (this.nodes.length) {
        this.nodes.forEach((node, i) => {
          const angle = i * 2.3998;
          const rawD  = 58 * Math.sqrt(i + 1);
          const maxD  = Math.min(this.cx, this.cy) * 0.80;
          const dist  = Math.min(rawD, maxD);
          node.tx = this.cx + dist * Math.cos(angle);
          node.ty = this.cy + dist * 0.72 * Math.sin(angle);
          if (node.arrived) { node.x = node.tx; node.y = node.ty; }
        });
        this._buildLinks();
      }
    }

    // ── Node setup ─────────────────────────────────────────

    _setupNodes() {
      const maxF   = Math.max(...this.accounts.map(a => Number(a.followers) || 0), 1);
      const maxLog = Math.log(maxF + 1);
      const CX = this.cx, CY = this.cy;

      this.nodes = this.accounts.map((account, i) => {
        const f       = Number(account.followers) || 0;
        const ratio   = Math.log(f + 1) / maxLog;
        const r       = 18 + 42 * ratio;

        // Phyllotaxis golden-angle spiral (largest near center)
        const angle  = i * 2.3998;                        // golden angle ≈ 137.5°
        const rawD   = 58 * Math.sqrt(i + 1);
        const maxD   = Math.min(CX, CY) * 0.80;
        const dist   = Math.min(rawD, maxD);
        const tx     = CX + dist * Math.cos(angle);
        const ty     = CY + dist * 0.72 * Math.sin(angle);

        return {
          account,
          x: CX, y: CY,          // start at center for entrance
          tx, ty,                 // resting position
          r,
          rim: tierFor(account.engagement_rate),
          scale: 0,
          arrived: false,
          phase:      Math.random() * Math.PI * 2,
          floatSpd:   0.25 + Math.random() * 0.32,
          floatAX:    2   + Math.random() * 3.5,
          floatAY:    1.2 + Math.random() * 2.2,
        };
      });

      this._buildLinks();
    }

    _buildLinks() {
      this.links = [];
      const seen = new Set();

      this.nodes.forEach((a, i) => {
        // Connect each node to 2–3 nearest neighbours
        this.nodes
          .map((b, j) => {
            if (i === j) return null;
            const dx = b.tx - a.tx, dy = b.ty - a.ty;
            return { j, d: Math.sqrt(dx * dx + dy * dy) };
          })
          .filter(Boolean)
          .sort((x, y) => x.d - y.d)
          .slice(0, 3)
          .forEach(({ j }) => {
            const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
            if (!seen.has(key)) {
              seen.add(key);
              this.links.push({ a: this.nodes[i], b: this.nodes[j] });
            }
          });
      });
    }

    // ── Avatar loading ──────────────────────────────────────

    async _loadAvatars() {
      const jobs = this.accounts.map(acc => new Promise(res => {
        const url =
          acc.avatar_path ||
          acc.profile_pic_url ||
          (acc.data_status !== 'placeholder_pending_collection' && acc.account
            ? `../avatars/${encodeURIComponent(acc.account)}.jpg`
            : '');
        if (!url) { res(); return; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload  = () => { this.images[acc.account] = img; res(); };
        img.onerror = () => res();
        img.src = url;
      }));
      await Promise.allSettled(jobs);
    }

    // ── Entrance animation ──────────────────────────────────

    _enter() {
      this.nodes.forEach((node, i) => {
        if (typeof gsap !== 'undefined') {
          gsap.to(node, {
            x: node.tx,
            y: node.ty,
            scale: 1,
            duration: 1.0,
            delay: i * 0.038 + 0.18,
            ease: 'expo.out',
            onComplete: () => { node.arrived = true; },
          });
        } else {
          node.x = node.tx; node.y = node.ty;
          node.scale = 1; node.arrived = true;
        }
      });
    }

    // ── Physics update ──────────────────────────────────────

    _update() {
      this.tick++;
      const t = this.tick * 0.01;

      this.nodes.forEach(n => {
        if (!n.arrived) return;
        n.x = n.tx + Math.sin(t * n.floatSpd + n.phase)           * n.floatAX;
        n.y = n.ty + Math.cos(t * n.floatSpd * 0.68 + n.phase + 1) * n.floatAY;
      });
    }

    // ── Rendering ───────────────────────────────────────────

    _draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.W, this.H);
      this._drawLinks();
      // Largest nodes render first (go underneath smaller)
      [...this.nodes]
        .sort((a, b) => b.r - a.r)
        .forEach(n => this._drawNode(n));
    }

    _drawLinks() {
      const ctx  = this.ctx;
      const diag = Math.hypot(this.W, this.H);

      this.links.forEach(({ a, b }) => {
        const dx = b.x - a.x, dy = b.y - a.y;
        const d  = Math.hypot(dx, dy);
        const base = Math.max(0, 0.13 - d / diag * 0.22);
        if (base <= 0.004) return;

        const hot   = this.hovered && (a === this.hovered || b === this.hovered);
        const alpha = hot ? Math.min(base * 4, 0.5) : base;
        const color = hot
          ? `rgba(207,255,4,${alpha})`
          : `rgba(207,255,4,${alpha})`;

        // Gentle curve
        const mx = (a.x + b.x) / 2 - dy * 0.1;
        const my = (a.y + b.y) / 2 + dx * 0.1;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.strokeStyle = color;
        ctx.lineWidth   = hot ? 1.2 : 0.5;
        ctx.stroke();
      });
    }

    _drawNode(node) {
      const ctx  = this.ctx;
      const { x, y, r, scale, rim } = node;
      const sr   = r * scale;
      if (sr < 0.5) return;

      const isHov = node === this.hovered;

      ctx.save();

      // ── Outer glow ────────────────────────────────────────
      if (isHov) {
        // Soft radial halo
        const halo = ctx.createRadialGradient(x, y, sr * 0.6, x, y, sr * 2.2);
        halo.addColorStop(0, `${rim.a}0.18)`);
        halo.addColorStop(1, `${rim.a}0)`);
        ctx.beginPath();
        ctx.arc(x, y, sr * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = halo;
        ctx.fill();
      }

      // ── Shadow glow ───────────────────────────────────────
      ctx.shadowBlur  = isHov ? 28 : (scale < 0.98 ? 12 : 0);
      ctx.shadowColor = rim.solid;

      // ── Background disk ───────────────────────────────────
      ctx.beginPath();
      ctx.arc(x, y, sr, 0, Math.PI * 2);
      ctx.fillStyle = '#0b0b12';
      ctx.fill();
      ctx.shadowBlur = 0;

      // ── Avatar or initial ─────────────────────────────────
      const img = this.images[node.account.account];
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, sr - 1.5, 0, Math.PI * 2);
        ctx.clip();
        const d = (sr - 1.5) * 2;
        ctx.drawImage(img, x - sr + 1.5, y - sr + 1.5, d, d);
        ctx.restore();
      } else {
        // Gradient fill + letter
        const bg = ctx.createRadialGradient(x - sr * 0.28, y - sr * 0.28, 0, x, y, sr);
        bg.addColorStop(0, '#1e1e2c');
        bg.addColorStop(1, '#0b0b12');
        ctx.beginPath();
        ctx.arc(x, y, sr - 1.5, 0, Math.PI * 2);
        ctx.fillStyle = bg;
        ctx.fill();

        const fs = Math.max(11, sr * 0.42);
        ctx.font         = `600 ${fs}px "Space Grotesk", sans-serif`;
        ctx.fillStyle    = rim.solid;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.account.account.charAt(0).toUpperCase(), x, y);
      }

      // ── Rim ring ──────────────────────────────────────────
      ctx.beginPath();
      ctx.arc(x, y, sr, 0, Math.PI * 2);
      ctx.strokeStyle = isHov ? rim.solid : `${rim.a}0.5)`;
      ctx.lineWidth   = isHov ? 2.5 : 1.2;
      ctx.stroke();

      // ── Engagement arc (outer progress ring) ─────────────
      const eng   = Math.min(Number(node.account.engagement_rate) || 0, 8);
      const sweep = (eng / 8) * Math.PI * 2;
      if (sweep > 0.06) {
        ctx.beginPath();
        ctx.arc(x, y, sr + 5.5, -Math.PI / 2, -Math.PI / 2 + sweep);
        ctx.strokeStyle = isHov ? rim.solid : `${rim.a}0.6)`;
        ctx.lineWidth   = isHov ? 2.5 : 1.5;
        ctx.lineCap     = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
      }

      ctx.restore();

      // ── Label ─────────────────────────────────────────────
      this._drawLabel(node, sr, isHov);
    }

    _drawLabel(node, sr, isHov) {
      const ctx = this.ctx;
      const lY  = node.y + sr + 14;

      ctx.save();
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';

      ctx.font      = `${isHov ? 600 : 500} ${isHov ? 12 : 11}px "Space Grotesk", sans-serif`;
      ctx.fillStyle = isHov ? '#f0f0f0' : 'rgba(235,235,235,0.58)';
      ctx.fillText(`@${node.account.account}`, node.x, lY);

      ctx.font      = '400 9px "IBM Plex Mono", monospace';
      ctx.fillStyle = 'rgba(90,90,108,0.85)';
      ctx.fillText(fmt(node.account.followers), node.x, lY + 16);

      ctx.restore();
    }

    // ── Interaction ─────────────────────────────────────────

    _onMove(e) {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;

      let best = null, minD = Infinity;
      this.nodes.forEach(n => {
        const dx = this.mouse.x - n.x, dy = this.mouse.y - n.y;
        const d  = Math.hypot(dx, dy);
        if (d < n.r * n.scale + 12 && d < minD) { best = n; minD = d; }
      });

      this.hovered = best;
      this.canvas.style.cursor = best ? 'pointer' : 'default';

      if (best) {
        this._showTip(best);
      } else if (this.tooltip) {
        this.tooltip.dataset.visible = 'false';
      }
    }

    _onLeave() {
      this.hovered = null;
      if (this.tooltip) this.tooltip.dataset.visible = 'false';
      this.canvas.style.cursor = 'default';
    }

    _onClick() {
      if (this.hovered && this.onSelect) {
        this.onSelect(this.hovered.account);
      }
    }

    _showTip(node) {
      const tt = this.tooltip;
      if (!tt) return;
      const a   = node.account;
      const eng = (Number(a.engagement_rate) || 0).toFixed(2);

      tt.querySelector('.net-tt-name').textContent        = `@${a.account}`;
      tt.querySelector('.net-tt-followers').textContent   = `${fmt(a.followers)} followers`;
      tt.querySelector('.net-tt-engagement').textContent  = `${eng}% engagement`;
      tt.querySelector('.net-tt-posts').textContent       = `${fmt(a.posts)} posts`;

      // Position near node, keep within canvas bounds
      const cRect   = this.canvas.getBoundingClientRect();
      const pRect   = tt.parentElement.getBoundingClientRect();
      const offX    = cRect.left - pRect.left;
      const offY    = cRect.top  - pRect.top;
      const TW      = 196, TH = 124;
      let tx = offX + node.x + node.r * node.scale + 18;
      let ty = offY + node.y - TH / 2;
      if (tx + TW > this.W - 8) tx = offX + node.x - node.r * node.scale - TW - 18;
      if (ty < 8)                ty = 8;
      if (ty + TH > this.H - 8) ty = this.H - TH - 8;

      tt.style.transform  = `translate(${tx}px, ${ty}px)`;
      tt.dataset.visible  = 'true';
    }

    // ── Lifecycle ───────────────────────────────────────────

    async start() {
      this._setupNodes();
      await this._loadAvatars();
      this.running = true;
      this._enter();

      const loop = () => {
        if (!this.running) return;
        this._update();
        this._draw();
        this.raf = requestAnimationFrame(loop);
      };
      loop();
    }

    stop() {
      this.running = false;
      if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
      this.canvas.removeEventListener('mousemove',  this._mm);
      this.canvas.removeEventListener('mouseleave', this._ml);
      this.canvas.removeEventListener('click',      this._mc);
      window.removeEventListener('resize', this._resizeObs);
      if (this.canvas.parentElement) this.canvas.parentElement.removeChild(this.canvas);
    }
  }

  window.NetworkGraph = NetworkGraph;
})();
