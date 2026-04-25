/* ─────────────────────────────────────────────────────────
   Sentient Network Graph · Pure 2D Refactor
   ───────────────────────────────────────────────────────── */

(function () {
  'use strict';

  function rimColor(eng) {
    const e = Number(eng) || 0;
    if (e >= 3) return '#00e5ff';
    if (e >= 1.5) return '#cfff04';
    if (e >= 0.5) return '#a855f7';
    return '#6366f1';
  }

  function fmt(v) {
    const n = Number(v) || 0;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(n);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // Lightweight Noise Field (Perlin-like approximation)
  const NOISE_SCALE = 0.04;
  const NOISE_SPEED = 0.05; // Much slower noise evolution
  const simpleNoise = (x, y, t) => {
    return (
      Math.sin(x * NOISE_SCALE + t * NOISE_SPEED) *
      Math.cos(y * NOISE_SCALE - t * NOISE_SPEED * 0.8) +
      Math.sin(x * NOISE_SCALE * 0.5 + y * NOISE_SCALE * 0.3 + t * NOISE_SPEED * 0.5)
    );
  };

  class NetworkGraph {
    constructor(containerId, accounts, onSelect, options = {}) {
      this.el = document.getElementById(containerId);
      if (!this.el) return;

      this.accounts = accounts;
      this.onSelect = onSelect;
      this.options = options;
      this.tooltip = this.el.querySelector('.net-tooltip');
      this.detailPanel = options.detailPanelId ? document.getElementById(options.detailPanelId) : null;
      this.running = false;
      this.raf = null;
      this.nodes = [];
      this.meshes = [];
      this.hoveredNode = null;
      this.selectedNode = null;
      this.pointerDownNode = null;
      this.pointerDown = false;
      this.pointerMoved = false;
      this.downX = 0;
      this.downY = 0;
      this.mx = 0;
      this.my = 0;
      this.dragNode = null;
      this.dragPlane = null;
      this.dragOffset = null;

      // Config — falls back to SOLAR_CONFIG if present
      const _cfg = window.SOLAR_CONFIG || {};
      this.nodeRadius = options.preview ? 1.8 : (_cfg.nodeRadius || 2.2);
      this.bounds = { x: 45, y: 25 }; // Default bounds, updated by resize
      this.repulsionStrength = 0.005;
      this.mode = options.mode || 'solar'; // Default mode

      // Toast System State
      this.toast = {
        activeNode: null,
        activePost: null,
        timer: 0,
        history: [], // Keep track of recently shown nodes
        isBreak: false,
        el: this.el.querySelector('.network-toast')
      };

      if (!window.THREE) {
        this.el.innerHTML = '<div class="network-fallback">Three.js no cargó.</div>';
        return;
      }

      this.THREE = window.THREE;
      this._setupRenderer();
      this._setupScene();
      this._bindEvents();
      this.resize(); // Get real bounds first
      this._buildData(); // Now place nodes in those bounds
      this._buildSceneObjects();

      if (options.selectedAccount) this.setSelected(options.selectedAccount);
      
      // Initialize mode
      this.setMode(this.mode);
    }

    _setupLayout() {
      const isMobile = window.innerWidth < 600;
      const isPortrait = window.innerHeight > window.innerWidth;

      this.nodeRadius = isMobile ? 0.45 : 0.62;

      if (isPortrait) {
        this.gridCols = 3;
        this.gridRows = 8;
      } else {
        this.gridCols = 6;
        this.gridRows = 4;
      }
    }

    _setupRenderer() {
      const THREE = this.THREE;
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true, // Allow background to show through
        powerPreference: "high-performance"
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      if (THREE.SRGBColorSpace) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.domElement.className = 'network-webgl';
      this.renderer.domElement.style.cursor = 'default';
      this.el.appendChild(this.renderer.domElement);
    }

    _setupScene() {
      const THREE = this.THREE;
      this.scene = new THREE.Scene();

      // Orthographic camera — no edge distortion, preserves orrery tilt
      const _camCfg = window.SOLAR_CONFIG || {};
      this._orthoHeight = _camCfg.orthoHeight || 54;
      const initAspect = (this.el.clientWidth / this.el.clientHeight) || 1.8;
      const initW = this._orthoHeight * initAspect;
      this.camera = new THREE.OrthographicCamera(
        -initW / 2, initW / 2,
        this._orthoHeight / 2, -this._orthoHeight / 2,
        0.1, 2000
      );
      const _camY = _camCfg.cameraY !== undefined ? _camCfg.cameraY : -22;
      const _camZ = _camCfg.cameraZ || 75;
      this.camera.position.set(0, _camY, _camZ);
      this.camera.lookAt(0, 0, 0);

      // Neutral white light only — no color tinting
      this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));

      this.group = new THREE.Group();
      this.scene.add(this.group);

      this.raycaster = new THREE.Raycaster();
      this.pointer = new THREE.Vector2();
      this.clock = new THREE.Clock();


      this._updateBoundsFromViewport();
      this._buildStars();
    }

    _updateBoundsFromViewport() {
      const margin = this.options.preview ? 0.05 : 0.04;
      const halfW = this.camera.right || (this._orthoHeight * ((this.el.clientWidth / this.el.clientHeight) || 1.8) / 2);
      const halfH = this._orthoHeight / 2;
      this.bounds.x = halfW * (1 - margin * 2);
      this.bounds.y = halfH * (1 - margin * 2);
    }


    _buildStars() {
      const THREE = this.THREE;
      const count = this.options.preview ? 100 : 180;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        positions[i * 3] = (Math.random() * 2 - 1) * 100;
        positions[i * 3 + 1] = (Math.random() * 2 - 1) * 100;
        positions[i * 3 + 2] = -50;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.stars = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: 0x4a5568,
          size: 0.5,
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
        }),
      );
      this.scene.add(this.stars);
    }

    _buildLinks() {
      const THREE = this.THREE;
      const maxLinks = this.nodes.length * 6; // Max expected links
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxLinks * 2 * 3), 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxLinks * 2 * 3), 3));
      
      this.linksMesh = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.25,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      this.linksMesh.renderOrder = 2;
      this.group.add(this.linksMesh);
    }

    _randomPoint() {
      return new this.THREE.Vector3(
        (Math.random() * 2 - 1) * (this.bounds.x - this.nodeRadius),
        (Math.random() * 2 - 1) * (this.bounds.y - this.nodeRadius),
        0
      );
    }

    _buildData() {
      const _dc = window.SOLAR_CONFIG || {};
      const sorted = [...this.accounts].sort((a, b) => (Number(b.followers) || 0) - (Number(a.followers) || 0));
      const n = sorted.length;
      const emptyOrbits = _dc.emptyOrbits !== undefined ? _dc.emptyOrbits : 4;
      const orbitMinRatio = _dc.orbitMinRatio || 0.08;
      const orbitMaxRatio = _dc.orbitMaxRatio || 0.92;
      const totalSlots = n + emptyOrbits;

      // Shuffle orbit slots so planets start in random orbits
      const slots = Array.from({ length: n }, (_, i) => i);
      for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }

      const minA = this.bounds.x * orbitMinRatio;
      const maxA = this.bounds.x * orbitMaxRatio;
      const minB = this.bounds.y * orbitMinRatio;
      const maxB = this.bounds.y * orbitMaxRatio;
      const maxSpeed = _dc.speedMax || 0.0022;
      const minSpeed = _dc.speedMin || 0.0005;

      this.nodes = sorted.map((account, index) => {
        // Random orbit slot → ratio (speed follows actual orbit, not follower rank)
        const slot = slots[index];
        const orbitRatio = (slot + emptyOrbits) / Math.max(1, totalSlots - 1);
        const baseA = minA + orbitRatio * (maxA - minA);
        const baseB = minB + orbitRatio * (maxB - minB);

        // Speed tied directly to orbit size: inner = faster, outer = slower
        const baseSpeed = -(maxSpeed - orbitRatio * (maxSpeed - minSpeed));

        // 3-tier planet size based on follower ranking
        let planetRadius;
        if (index < n / 3) {
          planetRadius = this.nodeRadius * (_dc.sizeLarge || 1.35);
        } else if (index < (n * 2) / 3) {
          planetRadius = this.nodeRadius * (_dc.sizeMedium || 1.0);
        } else {
          planetRadius = this.nodeRadius * (_dc.sizeSmall || 0.7);
        }

        const initAngle = Math.random() * Math.PI * 2;
        const initPos = new this.THREE.Vector3(
          (Math.random() * 2 - 1) * this.bounds.x,
          (Math.random() * 2 - 1) * this.bounds.y,
          0
        );

        return {
          account,
          index,
          color: rimColor(account.engagement_rate),
          currentPosition: initPos,
          velocity: new this.THREE.Vector3(),
          orbit: {
            a: baseA,
            b: baseB,
            angle: initAngle,
            speed: baseSpeed,
            tilt: 0
          },
          planetRadius,
          sphere: null,
          halo: null,
          baseScale: 1.0,
          collisionTimer: 0
        };
      });

      // Link moon nodes to their parent planets
      const moonRelations = _dc.moonRelations || {};
      const byAccount = {};
      this.nodes.forEach(n => { byAccount[n.account.account] = n; });
      this.nodes.forEach(node => {
        const parentName = moonRelations[node.account.account];
        if (parentName && byAccount[parentName]) {
          node.isMoon = true;
          node.parentNode = byAccount[parentName];
          node.planetRadius *= 0.55; // moons are smaller regardless of followers
          const ma = node.parentNode.planetRadius * 2.0;
          const mb = ma * (this.bounds.y / this.bounds.x); // same aspect as solar orbits
          const initAngle = Math.random() * Math.PI * 2;
          node.moonOrbit = {
            a: ma, b: mb,
            angle: initAngle,
            speed: -0.004,
          };
          // Start moon at its initial orbital position around parent
          const p = node.parentNode.currentPosition;
          node.currentPosition.set(
            p.x + ma * Math.cos(initAngle),
            p.y + mb * Math.sin(initAngle),
            0
          );
        }
      });

      this._maxPlanetRadius = Math.max(...this.nodes.map(n => n.planetRadius));
    }

    _buildSceneObjects() {
      const THREE = this.THREE;
      const loader = new THREE.TextureLoader();

      this.solarGroup = new THREE.Group();
      this.group.add(this.solarGroup);

      this._buildLinks(); // For network mode

      // ── Central Sun ──────────────────────────────────────────────
      const _sc = window.SOLAR_CONFIG || {};
      const coreRadius = this.nodeRadius * (_sc.sunSize || 1.3);

      // Canvas-based radial glow (outer halo)
      const glowSz = 256;
      const glowCv = document.createElement('canvas');
      glowCv.width = glowSz; glowCv.height = glowSz;
      const glowCtx = glowCv.getContext('2d');
      const gc = glowSz / 2;
      const gGrad = glowCtx.createRadialGradient(gc, gc, 0, gc, gc, gc);
      gGrad.addColorStop(0.0, 'rgba(220,255,50,0.95)');
      gGrad.addColorStop(0.2, 'rgba(207,255,4,0.6)');
      gGrad.addColorStop(0.5, 'rgba(180,230,0,0.15)');
      gGrad.addColorStop(1.0, 'rgba(0,0,0,0)');
      glowCtx.fillStyle = gGrad;
      glowCtx.fillRect(0, 0, glowSz, glowSz);
      const glowTex = new THREE.CanvasTexture(glowCv);
      const outerGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(coreRadius * (_sc.sunGlowRadius || 10), coreRadius * (_sc.sunGlowRadius || 10)),
        new THREE.MeshBasicMaterial({
          map: glowTex,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      outerGlow.position.z = -0.3;
      this.solarGroup.add(outerGlow);

      // Neon yellow border ring
      const ringGeo = new THREE.RingGeometry(coreRadius, coreRadius + 0.12, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xcfff04,
        transparent: true,
        opacity: 0.85,
      });
      this.solarGroup.add(new THREE.Mesh(ringGeo, ringMat));

      // Core solid circle
      const coreGeo = new THREE.CircleGeometry(coreRadius, 64);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xcfff04 });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.z = 0.1;
      this.solarGroup.add(core);

      // s.png logo on top
      const logoGeo = new THREE.CircleGeometry(coreRadius * 0.85, 64);
      const logoMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1.0 });
      loader.load('../s.png', (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        logoMat.map = tex;
        logoMat.needsUpdate = true;
      });
      const logoMesh = new THREE.Mesh(logoGeo, logoMat);
      logoMesh.position.z = 0.2;
      logoMesh.renderOrder = 15;
      this.solarGroup.add(logoMesh);

      // ── Empty Orbit Rings before first planet ────────────────────
      const _oc = window.SOLAR_CONFIG || {};
      const _emptyOrbits = _oc.emptyOrbits !== undefined ? _oc.emptyOrbits : 4;
      const _orbitMinRatio = _oc.orbitMinRatio || 0.08;
      const _orbitMaxRatio = _oc.orbitMaxRatio || 0.92;
      const _orbitOpacity = _oc.orbitOpacity || 0.08;
      const totalSlots = this.nodes.length + _emptyOrbits;
      const minA = this.bounds.x * _orbitMinRatio;
      const maxA = this.bounds.x * _orbitMaxRatio;
      const minB = this.bounds.y * _orbitMinRatio;
      const maxB = this.bounds.y * _orbitMaxRatio;

      for (let slot = 0; slot < _emptyOrbits; slot++) {
        const orbitRatio = slot / Math.max(1, totalSlots - 1);
        const eA = minA + orbitRatio * (maxA - minA);
        const eB = minB + orbitRatio * (maxB - minB);
        const pts = [];
        for (let i = 0; i <= 128; i++) {
          const theta = (i / 128) * Math.PI * 2;
          pts.push(new THREE.Vector3(eA * Math.cos(theta), eB * Math.sin(theta), -0.5));
        }
        this.solarGroup.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: _orbitOpacity })
        ));
      }

      // ── Draw Planet Orbit Trails (skip moons) ─────────────────────
      this.nodes.forEach(node => {
        if (node.isMoon) return;
        const pts = [];
        for (let i = 0; i <= 128; i++) {
          const theta = (i / 128) * Math.PI * 2;
          pts.push(new THREE.Vector3(
            node.orbit.a * Math.cos(theta),
            node.orbit.b * Math.sin(theta),
            -0.5
          ));
        }
        const trail = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: _orbitOpacity })
        );
        this.solarGroup.add(trail);
        node.orbitLine = trail;
      });

      // ── Moon orbit rings (dynamic — updated each frame) ───────────
      this.nodes.forEach(node => {
        if (!node.isMoon) return;
        const { a: ma, b: mb } = node.moonOrbit;
        const pts = [];
        for (let i = 0; i <= 64; i++) {
          const theta = (i / 64) * Math.PI * 2;
          pts.push(new THREE.Vector3(ma * Math.cos(theta), mb * Math.sin(theta), -0.1));
        }
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: _orbitOpacity })
        );
        this.solarGroup.add(line);
        node.moonOrbitLine = line;
      });

      // ── Create Account Planets (per-node size) ────────────────────
      this.nodes.forEach(node => {
        const r = node.planetRadius;
        const circleGeo = new THREE.CircleGeometry(r, 42);
        const material = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 1.0,
          depthWrite: false,
          side: THREE.DoubleSide,
        });

        const avatarUrl = node.account.avatar_path || node.account.profile_pic_url;
        if (avatarUrl) {
          loader.load(avatarUrl, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            // Center-crop non-square images to prevent distortion
            const img = tex.image;
            if (img && img.width && img.height && img.width !== img.height) {
              if (img.width > img.height) {
                const ratio = img.height / img.width;
                tex.repeat.set(ratio, 1);
                tex.offset.set((1 - ratio) / 2, 0);
              } else {
                const ratio = img.width / img.height;
                tex.repeat.set(1, ratio);
                tex.offset.set(0, (1 - ratio) / 2);
              }
            }
            material.map = tex;
            material.needsUpdate = true;
          });
        }

        const disk = new THREE.Mesh(circleGeo, material);
        disk.renderOrder = 10;

        // Engagement-colored ring border
        const borderOpacity = _sc.borderOpacity !== undefined ? _sc.borderOpacity : 0.6;
        const borderGeo = new THREE.RingGeometry(r * 1.02, r * 1.15, 42);
        const borderMat = new THREE.MeshBasicMaterial({
          color: node.color,
          transparent: true,
          opacity: borderOpacity,
          depthWrite: false,
          side: THREE.DoubleSide,
          visible: borderOpacity > 0,
        });
        const border = new THREE.Mesh(borderGeo, borderMat);
        border.renderOrder = 5;

        // Language Badge (ES)
        const spanishAccounts = ['chatgptruco', 'artificialmente.ia', 'estoicomorir', 'estoicovivir', 'tecnologia', 'traselveloreal', 'costarica', 'ivanelgrande', 'sergioprompts'];
        if (spanishAccounts.includes(node.account.account)) {
          const badgeCanvas = document.createElement('canvas');
          badgeCanvas.width = 64;
          badgeCanvas.height = 32;
          const ctx = badgeCanvas.getContext('2d');
          ctx.fillStyle = 'rgba(45, 48, 58, 0.98)';
          ctx.beginPath();
          ctx.roundRect(0, 0, 64, 32, 8);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 24px Inter, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('ES', 32, 17);

          const badgeTex = new THREE.CanvasTexture(badgeCanvas);
          const badgeMat = new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true, side: THREE.DoubleSide });
          const bW = r * 0.65;
          const badgeGeo = new THREE.PlaneGeometry(bW, bW / 2);
          const badge = new THREE.Mesh(badgeGeo, badgeMat);
          badge.position.set(r * 0.65, -r * 0.65, 0.2);
          badge.renderOrder = 20;
          disk.add(badge);
        }

        this.group.add(border);
        this.group.add(disk);

        disk.userData.node = node;
        node.sphere = disk;
        node.halo = border;
        this.meshes.push(disk);
      });

      // ── Planet glow sprites (animated when toast is active) ───────
      const planetGlowCv = document.createElement('canvas');
      planetGlowCv.width = 128; planetGlowCv.height = 128;
      const planetGlowCtx = planetGlowCv.getContext('2d');
      const pgc = 64;
      const pgGrad = planetGlowCtx.createRadialGradient(pgc, pgc, 0, pgc, pgc, pgc);
      pgGrad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
      pgGrad.addColorStop(0.35, 'rgba(207,255,4,0.5)');
      pgGrad.addColorStop(1.0, 'rgba(0,0,0,0)');
      planetGlowCtx.fillStyle = pgGrad;
      planetGlowCtx.fillRect(0, 0, 128, 128);
      const glowTex2 = new THREE.CanvasTexture(planetGlowCv);

      this.nodes.forEach(node => {
        const r = node.planetRadius;
        const gm = new THREE.Mesh(
          new THREE.PlaneGeometry(r * 6, r * 6),
          new THREE.MeshBasicMaterial({
            map: glowTex2,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        gm.renderOrder = 8;
        this.group.add(gm);
        node.glowMesh = gm;
        node.glowOpacity = 0;
      });
    }

    _bindEvents() {
      this._pointerDown = e => this._onPointerDown(e);
      this._pointerMove = e => this._onPointerMove(e);
      this._pointerUp = () => this._onPointerUp();
      this._pointerLeave = () => this._onPointerLeave();
      this._click = e => this._onClick(e);
      this._resize = () => this.resize();

      // Bind events to container instead of canvas so they pass through to UI if needed
      this.el.addEventListener('pointerdown', this._pointerDown);
      this.el.addEventListener('pointermove', this._pointerMove);
      this.el.addEventListener('pointerup', this._pointerUp);
      this.el.addEventListener('pointerleave', this._pointerLeave);
      this.el.addEventListener('click', this._click);
      window.addEventListener('resize', this._resize);

      if (window.ResizeObserver) {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.el);
      }
    }

    _updatePointer(event) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mx = event.clientX - rect.left;
      this.my = event.clientY - rect.top;
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    _pickNode(event) {
      this._updatePointer(event);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.meshes, false);
      return hits.length ? hits[0].object.userData.node : null;
    }

    _onPointerDown(event) {
      this.pointerDown = true;
      this.pointerMoved = false;
      this.downX = event.clientX;
      this.downY = event.clientY;
      this.pointerDownNode = this._pickNode(event);

      if (this.pointerDownNode) {
        const THREE = this.THREE;
        this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hit = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.dragPlane, hit)) {
          this.dragNode = this.pointerDownNode;
          this.dragOffset = this.dragNode.currentPosition.clone().sub(hit);
        }
      }
    }

    _onPointerMove(event) {
      if (this.pointerDown && (Math.abs(event.clientX - this.downX) > 4 || Math.abs(event.clientY - this.downY) > 4)) {
        this.pointerMoved = true;
      }

      // Planet drag
      if (this.dragNode) {
        this._updatePointer(event);
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hit = new this.THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.dragPlane, hit)) {
          const next = hit.add(this.dragOffset);
          next.x = clamp(next.x, -this.bounds.x + this.nodeRadius, this.bounds.x - this.nodeRadius);
          next.y = clamp(next.y, -this.bounds.y + this.nodeRadius, this.bounds.y - this.nodeRadius);
          this.dragNode.currentPosition.copy(next);
          this.dragNode.velocity.set(0, 0, 0);
        }
        this.hoveredNode = this.dragNode;
        this.renderer.domElement.style.cursor = 'grabbing';
        this._tip(this.dragNode);
        return;
      }

      // Hover
      const node = this._pickNode(event);
      this.hoveredNode = node;
      this.renderer.domElement.style.cursor = node ? 'grab' : 'default';
      if (node) this._tip(node);
      else if (this.tooltip) this.tooltip.dataset.visible = 'false';
    }

    _onPointerUp() {
      this.pointerDown = false;
      this.dragNode = null;
    }

    _onPointerLeave() {
      this._onPointerUp();
      if (this.tooltip) this.tooltip.dataset.visible = 'false';
    }

    _onClick(event) {
      // Small movement threshold to allow for slight jitter during clicks
      const moveThreshold = 5;
      const moved = Math.abs(event.clientX - this.downX) > moveThreshold ||
        Math.abs(event.clientY - this.downY) > moveThreshold;

      if (!moved) {
        const clicked = this._pickNode(event);
        if (clicked) {
          this.setSelected(clicked.account);
          if (this.onSelect) this.onSelect(clicked.account);
        } else {
          this.setSelected(null);
          if (this.onSelect) this.onSelect(null);
        }
      }
    }

    _tip(node) {
      if (!this.tooltip) return;
      const a = node.account;
      this.tooltip.querySelector('.net-tt-name').textContent = `@${a.account}`;
      this.tooltip.querySelector('.net-tt-followers').textContent = `${fmt(a.followers)} followers`;
      this.tooltip.querySelector('.net-tt-engagement').textContent = `${(Number(a.engagement_rate) || 0).toFixed(2)}% engagement`;
      this.tooltip.querySelector('.net-tt-posts').textContent = `${fmt(a.posts || a.recent_post_count)} posts`;

      const ttWidth = 196;
      const ttHeight = 124;
      const rect = this.el.getBoundingClientRect();
      let tx = this.mx + 18;
      let ty = this.my - ttHeight / 2;
      if (tx + ttWidth > rect.width - 8) tx = this.mx - ttWidth - 18;
      if (ty < 8) ty = 8;
      if (ty + ttHeight > rect.height - 8) ty = rect.height - ttHeight - 8;
      this.tooltip.style.transform = `translate(${tx}px,${ty}px)`;
      this.tooltip.dataset.visible = 'true';
    }

    setSelected(account) {
      if (!account) {
        this.selectedNode = null;
        if (this.detailPanel) {
          const ph = this.detailPanel.querySelector('.nd-placeholder');
          const ct = this.detailPanel.querySelector('.nd-content');
          if (ph) ph.style.display = 'flex';
          if (ct) ct.style.display = 'none';
        }
        return;
      }
      this.selectedNode = this.nodes.find(n => n.account.account === account.account) || null;
      if (this.selectedNode && this.detailPanel) {
        this._updateDetailPanel(this.selectedNode);
        const ph = this.detailPanel.querySelector('.nd-placeholder');
        const ct = this.detailPanel.querySelector('.nd-content');
        if (ph) ph.style.display = 'none';
        if (ct) ct.style.display = 'flex';
      }
    }

    _updateDetailPanel(node) {
      const a = node.account;
      const dp = this.detailPanel;
      dp.querySelector('.nd-name').textContent = a.full_name || a.account;
      dp.querySelector('.nd-handle').textContent = `@${a.account}`;
      dp.querySelector('.nd-avatar').src = a.avatar_path || a.profile_pic_url || '';
      dp.querySelector('.nd-stat-val.followers').textContent = fmt(a.followers);
      dp.querySelector('.nd-stat-val.engagement').textContent = `${(Number(a.engagement_rate) || 0).toFixed(2)}%`;
      dp.querySelector('.nd-bio').textContent = a.biography || '';
      dp.querySelector('.nd-link').href = `https://instagram.com/${a.account}`;
    }

    resize() {
      if (!this.renderer || !this.camera) return;
      const rect = this.el.getBoundingClientRect();
      const width = rect.width || 960;
      const height = rect.height || 520;
      const aspect = width / height;
      const halfW = (this._orthoHeight * aspect) / 2;
      const halfH = this._orthoHeight / 2;
      this.camera.left = -halfW;
      this.camera.right = halfW;
      this.camera.top = halfH;
      this.camera.bottom = -halfH;
      this.camera.updateProjectionMatrix();
      this._updateBoundsFromViewport();
      this.renderer.setSize(width, height);
      this.renderer.setClearColor(0x000000, 0);
      
      if (this.mode === 'solid') this._calculateSolidTargets();
    }

    _applyRepulsion() {
      const n = this.nodes.length;
      for (let i = 0; i < n; i++) {
        const a = this.nodes[i];
        for (let j = i + 1; j < n; j++) {
          const b = this.nodes[j];
          const delta = a.currentPosition.clone().sub(b.currentPosition);
          const dist = delta.length();
          const repulsionRadius = (a.planetRadius + b.planetRadius) * 2.5;

          if (dist < repulsionRadius && dist > 0.1) {
            const force = (repulsionRadius - dist) * 0.02;
            const push = delta.normalize().multiplyScalar(force);
            if (this.selectedNode !== a) a.currentPosition.add(push);
            if (this.selectedNode !== b) b.currentPosition.sub(push);
          }
        }
      }
    }

    _updateLinks() {
      if (!this.linksMesh) return;
      const THREE = this.THREE;
      const positions = this.linksMesh.geometry.attributes.position.array;
      const colors = this.linksMesh.geometry.attributes.color.array;
      let count = 0;
      const maxLinks = (positions.length / 6);

      const threshold = 18.0;
      const c1 = new THREE.Color(0xcfff04); // Accent
      const c2 = new THREE.Color(0x4a5568); // Muted

      for (let i = 0; i < this.nodes.length; i++) {
        const a = this.nodes[i];
        for (let j = i + 1; j < this.nodes.length; j++) {
          const b = this.nodes[j];
          const dist = a.currentPosition.distanceTo(b.currentPosition);
          if (dist < threshold) {
            if (count >= maxLinks) break;
            const opacity = 1.0 - (dist / threshold);
            const idx = count * 6;
            
            positions[idx] = a.currentPosition.x;
            positions[idx + 1] = a.currentPosition.y;
            positions[idx + 2] = a.currentPosition.z - 0.5;
            positions[idx + 3] = b.currentPosition.x;
            positions[idx + 4] = b.currentPosition.y;
            positions[idx + 5] = b.currentPosition.z - 0.5;

            const color = c1.clone().lerp(c2, 1.0 - opacity);
            colors[idx] = color.r;
            colors[idx + 1] = color.g;
            colors[idx + 2] = color.b;
            colors[idx + 3] = color.r;
            colors[idx + 4] = color.g;
            colors[idx + 5] = color.b;

            count++;
          }
        }
      }
      this.linksMesh.geometry.attributes.position.needsUpdate = true;
      this.linksMesh.geometry.attributes.color.needsUpdate = true;
      this.linksMesh.geometry.setDrawRange(0, count * 2);
    }

    _updateNodePositions(t) {
      if (this.mode === 'network') {
        this._applyRepulsion();
        this.nodes.forEach(node => {
          if (this.selectedNode === node || this.dragNode === node) return;
          // Noise drift
          const nx = simpleNoise(node.currentPosition.x, node.currentPosition.y, t) * 0.005;
          const ny = simpleNoise(node.currentPosition.y, node.currentPosition.x, t + 100) * 0.005;
          node.velocity.x += nx;
          node.velocity.y += ny;
          
          // Slight pull to center
          node.velocity.x -= node.currentPosition.x * 0.0001;
          node.velocity.y -= node.currentPosition.y * 0.0001;
          
          node.velocity.multiplyScalar(0.92);
          node.currentPosition.add(node.velocity);
          
          // Hard bounds
          const bx = this.bounds.x * 1.1;
          const by = this.bounds.y * 1.1;
          if (node.currentPosition.x > bx) { node.currentPosition.x = bx; node.velocity.x *= -0.5; }
          if (node.currentPosition.x < -bx) { node.currentPosition.x = -bx; node.velocity.x *= -0.5; }
          if (node.currentPosition.y > by) { node.currentPosition.y = by; node.velocity.y *= -0.5; }
          if (node.currentPosition.y < -by) { node.currentPosition.y = -by; node.velocity.y *= -0.5; }
        });
        this._updateLinks();
      } else if (this.mode === 'solar') {
        this._applyRepulsion();
        this.nodes.forEach(node => {
          if (node.isMoon || this.selectedNode === node || this.dragNode === node) return;
          node.orbit.angle += node.orbit.speed;
          const x0 = node.orbit.a * Math.cos(node.orbit.angle);
          const y0 = node.orbit.b * Math.sin(node.orbit.angle);
          const targetPos = new this.THREE.Vector3(x0, y0, 0);
          node.currentPosition.lerp(targetPos, 0.04);
        });
      } else if (this.mode === 'solid') {
        this.nodes.forEach(node => {
          if (this.selectedNode === node || this.dragNode === node) return;
          if (node.solidTarget) {
            node.currentPosition.lerp(node.solidTarget, 0.08);
          }
        });
      }

      this.nodes.forEach(node => {
        const isDragged = this.dragNode === node;
        const isSelected = this.selectedNode === node;

        const selectedScale = (this._maxPlanetRadius * 2.5) / node.planetRadius;
        const targetScale = isSelected ? selectedScale : (isDragged ? 1.2 : 1.0);
        node.baseScale += (targetScale - node.baseScale) * 0.15;
        node.sphere.renderOrder = isSelected ? 100 : 10;

        if (isSelected && !isDragged) {
          const targetPos = new this.THREE.Vector3(0, 0, 20.0);
          node.sphere.position.lerp(targetPos, 0.14);
          node.currentPosition.copy(node.sphere.position);
          node.halo.position.copy(node.sphere.position);
          node.halo.position.z -= 0.1;
          node.velocity.set(0, 0, 0);
        } else if (isDragged) {
          node.sphere.position.copy(node.currentPosition);
          node.sphere.position.z = 2.0;
          node.halo.position.copy(node.sphere.position);
          node.halo.position.z -= 0.1;
          node.velocity.set(0, 0, 0);
        } else if (node.isMoon && node.parentNode && this.mode === 'solar') {
          node.moonOrbit.angle += node.moonOrbit.speed;
          const p = node.parentNode.currentPosition;
          const { a: ma, b: mb } = node.moonOrbit;
          node.currentPosition.set(
            p.x + ma * Math.cos(node.moonOrbit.angle),
            p.y + mb * Math.sin(node.moonOrbit.angle),
            0
          );
          node.sphere.position.copy(node.currentPosition);
          node.sphere.position.z = 0.1;
          if (node.moonOrbitLine) node.moonOrbitLine.position.set(p.x, p.y, 0);
        } else {
          node.sphere.position.copy(node.currentPosition);
          node.sphere.position.z = 0;
        }

        node.halo.position.copy(node.sphere.position);
        node.halo.position.z -= 0.05;
        node.sphere.scale.set(node.baseScale, node.baseScale, node.baseScale);
        node.halo.scale.set(node.baseScale, node.baseScale, 1);
        node.sphere.quaternion.copy(this.camera.quaternion);
        node.halo.quaternion.copy(this.camera.quaternion);
      });
    }

    _calculateSolidTargets() {
      const n = this.nodes.length;
      const aspect = this.bounds.x / this.bounds.y;
      const cols = Math.ceil(Math.sqrt(n * aspect));
      const rows = Math.ceil(n / cols);
      
      const spacingX = (this.bounds.x * 1.8) / Math.max(cols - 1, 1);
      const spacingY = (this.bounds.y * 1.6) / Math.max(rows - 1, 1);
      
      this.nodes.forEach((node, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = (c - (cols - 1) / 2) * spacingX;
        const y = (r - (rows - 1) / 2) * -spacingY;
        node.solidTarget = new this.THREE.Vector3(x, y, 0);
      });
    }

    setMode(mode) {
      this.mode = mode;
      
      if (this.solarGroup) this.solarGroup.visible = (mode === 'solar');
      if (this.linksMesh) this.linksMesh.visible = (mode === 'network');
      
      if (mode === 'solid') {
        this._calculateSolidTargets();
      }
      
      // Update nodes
      this.nodes.forEach(n => {
        if (n.moonOrbitLine) n.moonOrbitLine.visible = (mode === 'solar');
      });
    }

    setSolidMode(active) {
      this.setMode(active ? 'solid' : 'solar');
    }

    _updateToast(dt, t) {
      if (!this.toast.el) return;

      // Stop all toast activity if a node is manually selected
      if (this.selectedNode) {
        if (this.toast.activeNode) {
          this.toast.activeNode = null;
          this.toast.activePost = null;
          this.toast.el.classList.remove('is-active');
          this.toast.timer = 10.0; // Reset for when panel closes
        }
        return;
      }

      this.toast.timer -= dt;

      if (this.toast.timer <= 0) {
        if (!this.toast.isBreak) {
          this.toast.isBreak = true;
          this.toast.timer = 6.0;
          this.toast.activeNode = null;
          this.toast.activePost = null;
          this.toast.el.classList.remove('is-active');
        } else {
          // End break, pick new node
          this.toast.isBreak = false;
          this.toast.timer = 10.0;
          const candidates = this.nodes.filter(n => n.account.recent_posts && n.account.recent_posts.length > 0);
          if (candidates.length === 0) {
            this.toast.timer = 2.0; // Try again soon
            return;
          }

          // Pick a random node not in history
          const availableCandidates = candidates.filter(n => !this.toast.history.includes(n.account.account));
          const nodePool = availableCandidates.length > 0 ? availableCandidates : candidates;

          const randomNode = nodePool[Math.floor(Math.random() * nodePool.length)];

          const allPosts = randomNode.account.recent_posts;
          this.toast.activeNode = randomNode;
          this.toast.activePost = allPosts[Math.floor(Math.random() * allPosts.length)];

          this.toast.history.push(randomNode.account.account);
          if (this.toast.history.length > 15) this.toast.history.shift();

          const acc = randomNode.account;
          this.toast.el.querySelector('.nt-account').textContent = `@${acc.account}`;
          this.toast.el.querySelector('.nt-avatar').src = acc.avatar_path || acc.profile_pic_url || '';
          this.toast.el.querySelector('.nt-caption').textContent = this.toast.activePost.caption || "Intelligence transmission...";
          this.toast.el.querySelector('.nt-likes').textContent = fmt(this.toast.activePost.likes);
          this.toast.el.querySelector('.nt-comments').textContent = fmt(this.toast.activePost.comments);
          this.toast.el.classList.add('is-active');
        }
      }

      // Animate planet glows
      const activeNode = this.toast.activeNode;
      this.nodes.forEach(node => {
        if (!node.glowMesh) return;
        const isActive = node === activeNode;
        const target = isActive ? 0.55 : 0;
        node.glowOpacity += (target - node.glowOpacity) * 0.06;
        const pulse = isActive ? 1 + 0.12 * Math.sin(t * 5) : 1;
        node.glowMesh.material.opacity = node.glowOpacity * pulse;
        node.glowMesh.position.copy(node.sphere.position);
        node.glowMesh.quaternion.copy(this.camera.quaternion);
      });
    }

    start() {
      this.running = true;
      const loop = () => {
        if (!this.running) return;
        const dt = 0.016;
        const t = this.clock.getElapsedTime();

        this._updateNodePositions(t);
        this._updateToast(dt, t);
        this.renderer.render(this.scene, this.camera);
        this.raf = requestAnimationFrame(loop);
      };
      loop();
    }

    stop() {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      if (this.resizeObserver) this.resizeObserver.disconnect();
      if (this.renderer) {
        this.renderer.dispose();
        if (this.renderer.domElement.parentElement) this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
    }
  }

  window.NetworkGraph = NetworkGraph;
})();
