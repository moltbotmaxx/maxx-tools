/* ─────────────────────────────────────────────────────────
   Sentient Solar System · Dev Settings Panel
   Toggle with ` (backtick) key or the ⚙ button (bottom-right)
   ───────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // Default config — mirrors hardcoded values in network.js
  window.SOLAR_CONFIG = window.SOLAR_CONFIG || {
    // Camera
    orthoHeight: 64,
    cameraY: -48,
    cameraZ: 400,
    // Sun
    sunSize: 1.15,
    sunGlowRadius: 4,
    // Planets
    nodeRadius: 1.6,
    sizeLarge: 1.4,
    sizeMedium: 1.05,
    sizeSmall: 0.7,
    // Speed
    speedMax: 0.0017,
    speedMin: 0.0006,
    // Orbits
    emptyOrbits: 0,
    orbitMinRatio: 0.17,
    orbitMaxRatio: 0.88,
    orbitOpacity: 0.06,
    // Visual
    borderOpacity: 0,
    // Moon relationships: { moonAccount: parentAccount }
    moonRelations: {
      'chatgptruco': 'chatgptricks',
    },
  };

  const FIELDS = [
    { section: 'CAMERA' },
    { key: 'orthoHeight',   label: 'Zoom',                  min: 20,     max: 120,   step: 1      },
    { key: 'cameraY',       label: 'Camera Y tilt',          min: -80,    max: 0,     step: 1      },
    { key: 'cameraZ',       label: 'Camera Z distance',      min: 20,     max: 400,   step: 5      },
    { section: 'SUN' },
    { key: 'sunSize',       label: 'Sun size × base radius', min: 0.3,    max: 5.0,   step: 0.05   },
    { key: 'sunGlowRadius', label: 'Glow radius × sun',      min: 1,      max: 25,    step: 0.5    },
    { section: 'PLANETS' },
    { key: 'nodeRadius',    label: 'Base radius',             min: 0.3,    max: 8,     step: 0.1    },
    { key: 'sizeLarge',     label: 'Large tier (top ⅓)',      min: 0.5,    max: 3.0,   step: 0.05   },
    { key: 'sizeMedium',    label: 'Medium tier (mid ⅓)',     min: 0.4,    max: 2.5,   step: 0.05   },
    { key: 'sizeSmall',     label: 'Small tier (bot ⅓)',      min: 0.2,    max: 2.0,   step: 0.05   },
    { section: 'SPEED' },
    { key: 'speedMax',      label: 'Inner orbit (max)',       min: 0.0002, max: 0.015, step: 0.0001 },
    { key: 'speedMin',      label: 'Outer orbit (min)',       min: 0.0001, max: 0.008, step: 0.0001 },
    { section: 'ORBITS' },
    { key: 'emptyOrbits',   label: 'Empty rings near sun',   min: 0,      max: 12,    step: 1      },
    { key: 'orbitMinRatio', label: 'Inner edge (× bounds)',  min: 0.02,   max: 0.4,   step: 0.01   },
    { key: 'orbitMaxRatio', label: 'Outer edge (× bounds)',  min: 0.5,    max: 1.0,   step: 0.01   },
    { key: 'orbitOpacity',  label: 'Ring line opacity',      min: 0.01,   max: 0.6,   step: 0.01   },
    { section: 'VISUAL' },
    { key: 'borderOpacity', label: 'Planet ring opacity',    min: 0,      max: 1.0,   step: 0.05   },
  ];

  function fmtVal(v, step) {
    if (step < 0.001) return v.toFixed(4);
    if (step < 0.1)   return v.toFixed(2);
    return String(v);
  }

  // ── Live updates (no rebuild needed) ──────────────────────
  function applyLive(key, val) {
    const g = window.__sentientGraph;
    if (!g) return;

    switch (key) {
      case 'orthoHeight':
        g._orthoHeight = val;
        g.resize();
        break;

      case 'orbitOpacity':
        g.group.traverse(obj => {
          if (obj.isLine && obj.material) obj.material.opacity = val;
        });
        break;

      case 'borderOpacity':
        g.nodes.forEach(n => {
          if (n.halo && n.halo.material) n.halo.material.opacity = val;
        });
        break;

      case 'speedMax':
      case 'speedMin': {
        const sMax = window.SOLAR_CONFIG.speedMax;
        const sMin = window.SOLAR_CONFIG.speedMin;
        const planetNodes = g.nodes.filter(n => !n.isMoon);
        const orbitAs = planetNodes.map(n => n.orbit.a);
        const minA = Math.min(...orbitAs);
        const maxA = Math.max(...orbitAs);
        planetNodes.forEach(node => {
          const ratio = (node.orbit.a - minA) / Math.max(0.001, maxA - minA);
          node.orbit.speed = -(sMax - ratio * (sMax - sMin));
        });
        break;
      }
    }
  }

  // ── Build panel DOM ────────────────────────────────────────
  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'ssp';
    panel.innerHTML = `
      <div class="ssp-hdr">
        <span class="ssp-title">⚙ Scene Settings</span>
        <button class="ssp-x" title="Close">×</button>
      </div>
      <div class="ssp-body" id="ssp-body"></div>
      <div class="ssp-foot">
        <button class="ssp-btn ssp-rebuild" id="ssp-rebuild">↻ Rebuild</button>
        <button class="ssp-btn ssp-copy" id="ssp-copy">⎘ Copy Config</button>
      </div>
    `;

    const body = panel.querySelector('#ssp-body');

    FIELDS.forEach(f => {
      if (f.section) {
        const s = document.createElement('div');
        s.className = 'ssp-sec';
        s.textContent = f.section;
        body.appendChild(s);
        return;
      }

      const val = window.SOLAR_CONFIG[f.key];
      const row = document.createElement('div');
      row.className = 'ssp-row';
      row.innerHTML = `
        <div class="ssp-row-top">
          <span class="ssp-lbl">${f.label}</span>
          <span class="ssp-val" id="sv-${f.key}">${fmtVal(val, f.step)}</span>
        </div>
        <input class="ssp-range" type="range"
          min="${f.min}" max="${f.max}" step="${f.step}" value="${val}">
      `;
      body.appendChild(row);

      const slider = row.querySelector('.ssp-range');
      const valEl  = row.querySelector(`#sv-${f.key}`);

      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        window.SOLAR_CONFIG[f.key] = v;
        valEl.textContent = fmtVal(v, f.step);
        applyLive(f.key, v);
      });
    });

    // Close
    panel.querySelector('.ssp-x').addEventListener('click', () => toggle(false));

    // Rebuild
    const rebuildBtn = panel.querySelector('#ssp-rebuild');
    rebuildBtn.addEventListener('click', () => {
      if (typeof window.__sentientRebuild === 'function') {
        window.__sentientRebuild();
        rebuildBtn.textContent = '✓ Done';
        setTimeout(() => { rebuildBtn.textContent = '↻ Rebuild'; }, 1600);
      }
    });

    // Copy
    const copyBtn = panel.querySelector('#ssp-copy');
    copyBtn.addEventListener('click', () => {
      const cfg = window.SOLAR_CONFIG;
      const txt = [
        '// Paste into settings-panel.js → window.SOLAR_CONFIG',
        'window.SOLAR_CONFIG = {',
        ...Object.entries(cfg).map(([k, v]) => `  ${k}: ${v},`),
        '};',
      ].join('\n');

      const done = () => {
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => { copyBtn.textContent = '⎘ Copy Config'; }, 2200);
      };

      if (navigator.clipboard) {
        navigator.clipboard.writeText(txt).then(done);
      } else {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      }
    });

    return panel;
  }

  // ── Toggle visibility ──────────────────────────────────────
  let panelEl = null;
  let open = false;

  function toggle(force) {
    if (!panelEl) {
      panelEl = buildPanel();
      document.body.appendChild(panelEl);
    }
    open = force !== undefined ? force : !open;
    panelEl.style.display = open ? 'flex' : 'none';
  }

  // ── Floating toggle button ─────────────────────────────────
  function buildToggle() {
    const btn = document.createElement('button');
    btn.id = 'ssp-fab';
    btn.innerHTML = '⚙';
    btn.title = 'Scene Settings (`)';
    btn.addEventListener('click', () => toggle());
    document.body.appendChild(btn);
  }

  // Keyboard shortcut: backtick
  document.addEventListener('keydown', e => {
    if (e.key === '`' && !e.ctrlKey && !e.metaKey && !e.altKey) toggle();
  });

  // ── Styles ─────────────────────────────────────────────────
  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
      #ssp {
        position: fixed;
        top: 68px; right: 14px;
        width: 296px;
        max-height: calc(100vh - 84px);
        background: rgba(6, 8, 16, 0.97);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 10px;
        display: none;
        flex-direction: column;
        z-index: 9999;
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 12px;
        color: #94a3b8;
        backdrop-filter: blur(16px);
        box-shadow: 0 12px 40px rgba(0,0,0,0.7);
      }
      .ssp-hdr {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 11px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        flex-shrink: 0;
      }
      .ssp-title {
        font-size: 11px;
        font-weight: 600;
        color: #e2e8f0;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .ssp-x {
        background: none; border: none;
        color: #475569; font-size: 20px;
        cursor: pointer; line-height: 1; padding: 0 2px;
        transition: color 0.15s;
      }
      .ssp-x:hover { color: #e2e8f0; }
      .ssp-body {
        overflow-y: auto; padding: 6px 0; flex: 1;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.06) transparent;
      }
      .ssp-sec {
        font-size: 9px; font-weight: 700;
        letter-spacing: 0.12em; color: #cfff04;
        padding: 10px 14px 3px;
      }
      .ssp-row { padding: 3px 14px 7px; }
      .ssp-row-top {
        display: flex; justify-content: space-between;
        margin-bottom: 5px;
      }
      .ssp-lbl { color: #64748b; font-size: 11px; }
      .ssp-val {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px; color: #e2e8f0;
        min-width: 56px; text-align: right;
      }
      .ssp-range {
        width: 100%; height: 3px;
        -webkit-appearance: none; appearance: none;
        background: rgba(255,255,255,0.08);
        border-radius: 2px; outline: none; cursor: pointer;
      }
      .ssp-range::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 11px; height: 11px; border-radius: 50%;
        background: #cfff04; cursor: pointer;
        box-shadow: 0 0 6px rgba(207,255,4,0.5);
      }
      .ssp-range::-moz-range-thumb {
        width: 11px; height: 11px; border-radius: 50%;
        background: #cfff04; border: none; cursor: pointer;
      }
      .ssp-foot {
        display: flex; gap: 8px;
        padding: 10px 14px;
        border-top: 1px solid rgba(255,255,255,0.05);
        flex-shrink: 0;
      }
      .ssp-btn {
        flex: 1; padding: 7px 0;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        color: #64748b; font-size: 11px; font-weight: 500;
        cursor: pointer; font-family: inherit;
        transition: all 0.15s;
      }
      .ssp-btn:hover { background: rgba(255,255,255,0.07); color: #e2e8f0; }
      .ssp-rebuild:hover { border-color: rgba(207,255,4,0.25); color: #cfff04; }
      .ssp-copy { border-color: rgba(207,255,4,0.15); }
      .ssp-copy:hover {
        background: rgba(207,255,4,0.08);
        border-color: rgba(207,255,4,0.4);
        color: #cfff04;
      }
      #ssp-fab {
        position: fixed; bottom: 20px; right: 20px;
        width: 36px; height: 36px; border-radius: 50%;
        background: rgba(6,8,16,0.9);
        border: 1px solid rgba(207,255,4,0.25);
        color: #cfff04; font-size: 15px;
        cursor: pointer; z-index: 9998;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(8px);
        transition: all 0.2s;
        box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      }
      #ssp-fab:hover {
        background: rgba(207,255,4,0.1);
        border-color: rgba(207,255,4,0.6);
        box-shadow: 0 0 12px rgba(207,255,4,0.2);
      }
    `;
    document.head.appendChild(s);
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    injectStyles();
    buildToggle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
