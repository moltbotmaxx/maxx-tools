/* ─────────────────────────────────────────────────────────
   Sentient Network Graph · Canvas visualization
   ───────────────────────────────────────────────────────── */

(function () {
  'use strict';

  /* ── Engagement colour tiers ──────────────────────────── */
  function rimColor(eng) {
    const e = Number(eng) || 0;
    if (e >= 3)   return { h: '#00e5ff', r: 0,   g: 229, b: 255 };
    if (e >= 1.5) return { h: '#cfff04', r: 207, g: 255, b: 4   };
    if (e >= 0.5) return { h: '#a855f7', r: 168, g: 85,  b: 247 };
    return               { h: '#6366f1', r: 99,  g: 102, b: 241 };
  }

  function rgba(c, a) { return `rgba(${c.r},${c.g},${c.b},${a})`; }

  function fmt(v) {
    const n = Number(v) || 0;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(n);
  }

  /* ── Easing ───────────────────────────────────────────── */
  function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  /* ── NetworkGraph ─────────────────────────────────────── */
  class NetworkGraph {
    constructor(containerId, accounts, onSelect) {
      this.el       = document.getElementById(containerId);
      if (!this.el) return;

      this.accounts = accounts;
      this.onSelect = onSelect;
      this.nodes    = [];
      this.links    = [];
      this.imgs     = {};
      this.mx       = -9999;
      this.my       = -9999;
      this.hovered  = null;
      this.running  = false;
      this.raf      = null;
      this.tick     = 0;
      this._dataVersion = null;

      this.tt = document.getElementById('networkTooltip');

      /* build canvas */
      this.cv  = document.createElement('canvas');
      this.cv.className = 'network-canvas';
      this.ctx = this.cv.getContext('2d');
      this.el.appendChild(this.cv);

      this._mm  = e => this._move(e);
      this._ml  = ()  => this._leave();
      this._mc  = ()  => this._click();
      this.cv.addEventListener('mousemove',  this._mm);
      this.cv.addEventListener('mouseleave', this._ml);
      this.cv.addEventListener('click',      this._mc);

      this._ro = () => this.resize();
      window.addEventListener('resize', this._ro);
      this.resize();
    }

    /* ── Canvas sizing ──────────────────────────────────── */
    resize() {
      const dpr  = window.devicePixelRatio || 1;
      const r    = this.el.getBoundingClientRect();
      this.W     = r.width  > 10 ? r.width  : this.el.offsetWidth  || 960;
      this.H     = r.height > 10 ? r.height : this.el.offsetHeight || 520;
      this.cv.width  = Math.floor(this.W * dpr);
      this.cv.height = Math.floor(this.H * dpr);
      this.cv.style.width  = `${this.W}px`;
      this.cv.style.height = `${this.H}px`;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.cx = this.W / 2;
      this.cy = this.H / 2;

      /* reposition nodes after resize */
      if (this.nodes.length) this._placeNodes();
    }

    /* ── Node creation ──────────────────────────────────── */
    _placeNodes() {
      const N      = this.accounts.length;
      const maxLog = Math.log(Math.max(...this.accounts.map(a => Number(a.followers) || 0), 1) + 1);

      /* Scale spiral so the last node lands near the edge — no pileup */
      const maxD = Math.min(this.cx * 0.88, this.cy * 0.88);
      const k    = N > 1 ? maxD / Math.sqrt(N) : maxD;

      this.nodes.forEach((n, i) => {
        const f     = Number(n.account.followers) || 0;
        const ratio = Math.log(f + 1) / maxLog;
        n.r         = 22 + 40 * ratio;          /* smaller ceiling → less overlap */

        const angle = i * 2.3998;               /* golden angle */
        const dist  = i === 0 ? 0 : k * Math.sqrt(i);
        n.tx = this.cx + dist * Math.cos(angle);
        n.ty = this.cy + dist * Math.sin(angle);
        if (n.arrived) { n.x = n.tx; n.y = n.ty; }
      });
      this._links();
    }

    _setupNodes() {
      this.nodes = this.accounts.map((account, i) => ({
        account,
        x: this.cx, y: this.cy,
        tx: 0, ty: 0,
        r: 28,
        col: rimColor(account.engagement_rate),
        scale: 0,
        arrived: false,
        _enterAt: 0,
        phase:    Math.random() * Math.PI * 2,
        fspd:     0.22 + Math.random() * 0.28,
        fax:      2.5  + Math.random() * 3.5,
        fay:      1.5  + Math.random() * 2.5,
      }));
      this._placeNodes();
    }

    _links() {
      this.links = [];
      const seen = new Set();
      this.nodes.forEach((a, i) => {
        this.nodes
          .map((b, j) => i === j ? null : { j, d: Math.hypot(b.tx - a.tx, b.ty - a.ty) })
          .filter(Boolean)
          .sort((x, y) => x.d - y.d)
          .slice(0, 3)
          .forEach(({ j }) => {
            const k = `${Math.min(i, j)}-${Math.max(i, j)}`;
            if (!seen.has(k)) { seen.add(k); this.links.push({ a: this.nodes[i], b: this.nodes[j] }); }
          });
      });
    }

    /* ── Avatars (fire-and-forget) ──────────────────────── */
    _loadImgs() {
      this.accounts.forEach(acc => {
        const url = acc.avatar_path || acc.profile_pic_url
          || (acc.data_status !== 'placeholder_pending_collection' && acc.account
              ? `../avatars/${encodeURIComponent(acc.account)}.jpg` : '');
        if (!url) return;
        const img = new Image();
        img.onload = () => { this.imgs[acc.account] = img; };
        img.src = url;
      });
    }

    /* ── Entrance animation (manual timing — no GSAP) ───── */
    _enter() {
      const now = performance.now();
      this.nodes.forEach((n, i) => {
        n.x       = n.tx;
        n.y       = n.ty;
        n.scale   = 0;
        n.arrived = true;
        n._enterAt = now + i * 32;   /* 32 ms stagger */
      });
    }

    /* ── Update loop ────────────────────────────────────── */
    _update() {
      this.tick++;
      const now = performance.now();
      const t   = this.tick * 0.01;

      this.nodes.forEach(n => {
        /* scale-in */
        if (n.scale < 1) {
          const el = now - n._enterAt;
          if (el > 0) n.scale = Math.min(1, easeOutBack(Math.min(el / 480, 1)));
        }
        /* float */
        n.x = n.tx + Math.sin(t * n.fspd + n.phase)           * n.fax;
        n.y = n.ty + Math.cos(t * n.fspd * 0.68 + n.phase + 1) * n.fay;
      });
    }

    /* ── Draw ───────────────────────────────────────────── */
    _draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.W, this.H);

      /* subtle radial vignette so nodes read against background */
      const vg = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, Math.max(this.W, this.H) * 0.62);
      vg.addColorStop(0, 'rgba(16,16,26,0.55)');
      vg.addColorStop(1, 'rgba(4,4,8,0)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, this.W, this.H);

      this._drawLinks();
      /* large nodes first (underneath smaller ones) */
      [...this.nodes].sort((a, b) => b.r - a.r).forEach(n => this._drawNode(n));
    }

    _drawLinks() {
      const ctx  = this.ctx;
      const diag = Math.hypot(this.W, this.H);

      this.links.forEach(({ a, b }) => {
        const d    = Math.hypot(b.x - a.x, b.y - a.y);
        const base = Math.max(0, 0.18 - d / diag * 0.22);
        if (base < 0.005) return;

        const hot   = this.hovered && (a === this.hovered || b === this.hovered);
        const alpha = hot ? Math.min(base * 5, 0.6) : base;
        const mx    = (a.x + b.x) / 2 - (b.y - a.y) * 0.1;
        const my    = (a.y + b.y) / 2 + (b.x - a.x) * 0.1;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.strokeStyle = hot ? `rgba(207,255,4,${alpha})` : `rgba(180,180,255,${alpha})`;
        ctx.lineWidth   = hot ? 1.2 : 0.5;
        ctx.stroke();
      });
    }

    _drawNode(n) {
      const ctx  = this.ctx;
      const { x, y, r, scale, col } = n;
      const sr   = r * Math.max(scale, 0);
      if (sr < 1) return;

      const isHov = n === this.hovered;

      ctx.save();

      /* ── outer halo ──────────────────────────────────── */
      const haloR = sr * (isHov ? 2.0 : 1.6);
      const halo  = ctx.createRadialGradient(x, y, sr * 0.5, x, y, haloR);
      halo.addColorStop(0, rgba(col, isHov ? 0.22 : 0.10));
      halo.addColorStop(1, rgba(col, 0));
      ctx.beginPath();
      ctx.arc(x, y, haloR, 0, Math.PI * 2);
      ctx.fillStyle = halo;
      ctx.fill();

      /* ── shadow glow ──────────────────────────────────── */
      ctx.shadowBlur  = isHov ? 32 : 14;
      ctx.shadowColor = col.h;

      /* ── background disk ──────────────────────────────── */
      const bg = ctx.createRadialGradient(x - sr * 0.3, y - sr * 0.35, 0, x, y, sr);
      bg.addColorStop(0, '#22223a');
      bg.addColorStop(1, '#0e0e1c');
      ctx.beginPath();
      ctx.arc(x, y, sr, 0, Math.PI * 2);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.shadowBlur = 0;

      /* ── avatar or initial ───────────────────────────── */
      const img = this.imgs[n.account.account];
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, sr - 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, x - sr + 2, y - sr + 2, (sr - 2) * 2, (sr - 2) * 2);
        ctx.restore();
      } else {
        /* initial letter */
        const fs = Math.max(12, sr * 0.44);
        ctx.font         = `700 ${fs}px "Space Grotesk", sans-serif`;
        ctx.fillStyle    = isHov ? '#ffffff' : rgba(col, 0.9);
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.account.account.charAt(0).toUpperCase(), x, y);
      }

      /* ── rim ─────────────────────────────────────────── */
      ctx.beginPath();
      ctx.arc(x, y, sr, 0, Math.PI * 2);
      ctx.strokeStyle = isHov ? col.h : rgba(col, 0.65);
      ctx.lineWidth   = isHov ? 2.5 : 1.5;
      ctx.stroke();

      /* ── engagement arc ──────────────────────────────── */
      const eng   = Math.min(Number(n.account.engagement_rate) || 0, 8);
      const sweep = (eng / 8) * Math.PI * 2;
      if (sweep > 0.06) {
        ctx.beginPath();
        ctx.arc(x, y, sr + 5, -Math.PI / 2, -Math.PI / 2 + sweep);
        ctx.strokeStyle = isHov ? col.h : rgba(col, 0.7);
        ctx.lineWidth   = 2;
        ctx.lineCap     = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
      }

      ctx.restore();

      /* ── label ───────────────────────────────────────── */
      if (sr > 18) this._label(n, sr, isHov);
    }

    _label(n, sr, isHov) {
      const ctx = this.ctx;
      const ly  = n.y + sr + 14;
      ctx.save();
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.font      = `${isHov ? 600 : 500} ${isHov ? 12 : 11}px "Space Grotesk", sans-serif`;
      ctx.fillStyle = isHov ? '#f0f0f0' : 'rgba(220,220,230,0.65)';
      ctx.fillText(`@${n.account.account}`, n.x, ly);
      ctx.font      = `400 9px "IBM Plex Mono", monospace`;
      ctx.fillStyle = 'rgba(120,120,140,0.75)';
      ctx.fillText(fmt(n.account.followers), n.x, ly + 16);
      ctx.restore();
    }

    /* ── Mouse ──────────────────────────────────────────── */
    _move(e) {
      const r = this.cv.getBoundingClientRect();
      this.mx = e.clientX - r.left;
      this.my = e.clientY - r.top;

      let best = null, md = Infinity;
      this.nodes.forEach(n => {
        const d = Math.hypot(this.mx - n.x, this.my - n.y);
        if (d < n.r * n.scale + 10 && d < md) { best = n; md = d; }
      });
      this.hovered = best;
      this.cv.style.cursor = best ? 'pointer' : 'default';
      best ? this._tip(best) : (this.tt && (this.tt.dataset.visible = 'false'));
    }

    _leave() {
      this.hovered = null;
      this.cv.style.cursor = 'default';
      if (this.tt) this.tt.dataset.visible = 'false';
    }

    _click() {
      if (this.hovered && this.onSelect) this.onSelect(this.hovered.account);
    }

    _tip(n) {
      if (!this.tt) return;
      const a   = n.account;
      const eng = (Number(a.engagement_rate) || 0).toFixed(2);
      this.tt.querySelector('.net-tt-name').textContent       = `@${a.account}`;
      this.tt.querySelector('.net-tt-followers').textContent  = `${fmt(a.followers)} followers`;
      this.tt.querySelector('.net-tt-engagement').textContent = `${eng}% engagement`;
      this.tt.querySelector('.net-tt-posts').textContent      = `${fmt(a.posts)} posts`;

      const cr = this.cv.getBoundingClientRect();
      const pr = this.tt.parentElement.getBoundingClientRect();
      const ox = cr.left - pr.left, oy = cr.top - pr.top;
      const TW = 196, TH = 124;
      let tx = ox + n.x + n.r * n.scale + 18;
      let ty = oy + n.y - TH / 2;
      if (tx + TW > this.W - 8) tx = ox + n.x - n.r * n.scale - TW - 18;
      if (ty < 8)                ty = 8;
      if (ty + TH > this.H - 8) ty = this.H - TH - 8;

      this.tt.style.transform = `translate(${tx}px,${ty}px)`;
      this.tt.dataset.visible = 'true';
    }

    /* ── Lifecycle ──────────────────────────────────────── */
    start() {
      this._setupNodes();
      this.running = true;
      this._enter();        /* position nodes, start scale-in timer */
      this._loadImgs();     /* avatars load async in background */

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
      this.cv.removeEventListener('mousemove',  this._mm);
      this.cv.removeEventListener('mouseleave', this._ml);
      this.cv.removeEventListener('click',      this._mc);
      window.removeEventListener('resize',      this._ro);
      if (this.cv.parentElement) this.cv.parentElement.removeChild(this.cv);
    }
  }

  window.NetworkGraph = NetworkGraph;
})();
