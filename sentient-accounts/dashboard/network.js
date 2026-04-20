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
  const NOISE_SPEED = 0.05; 
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
      if (!this.el) {
        console.error("NetworkGraph: Container not found", containerId);
        return;
      }

      this.accounts = accounts || [];
      this.onSelect = onSelect;
      this.options = options;
      this.tooltip = this.el.querySelector('.net-tooltip');
      this.running = false;
      this.raf = null;
      this.nodes = [];
      this.meshes = [];
      this.hoveredNode = null;
      this.selectedNode = null;
      this.dragNode = null;
      this.mx = 0;
      this.my = 0;

      // Golden Physics Config
      this.nodeRadius = 2.95;
      this.bounds = { x: 50, y: 30, z: 0 }; // Default bounds, will be updated by resize

      this.timeScale = 5.0;
      this.maxSpeed = 0.036;
      this.friction = 0.985;
      this.gridBlend = 1.0;
      this.repulsionStrength = 0.2;
      this.repulsionRadiusMultiplier = 20;
      this.centerGravityMultiplier = 5;
      this.tetherStrength = 0.002;
      this.tetherMaxDist = 63;
      this.chaosBurstStrength = 1.0;
      this.chaosFreq = 60.0;
      this.linkOpacity = 0.46;
      this.linkDistLimit = 80.0;

      // Toast System
      this.toast = {
        activeNode: null,
        activePost: null,
        timer: 0,
        history: [],
        el: this.el.querySelector('.network-toast')
      };

      if (!window.THREE) {
        console.error("NetworkGraph: THREE.js not found");
        this.el.innerHTML = '<div class="network-fallback">Three.js no cargó.</div>';
        return;
      }

      this.THREE = window.THREE;
      this._setupRenderer();
      this._setupScene();
      this._bindEvents();
      this.resize(); 
      this._buildData(); 
      this._buildSceneObjects();

      console.log("SENTIENT SYSTEM V2 INITIALIZED", {
        nodes: this.nodes.length,
        radius: this.nodeRadius,
        bounds: this.bounds
      });

      if (options.selectedAccount) this.setSelected(options.selectedAccount);
    }

    _setupRenderer() {
      const THREE = this.THREE;
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.domElement.className = 'network-webgl';
      this.el.appendChild(this.renderer.domElement);
    }

    _setupScene() {
      const THREE = this.THREE;
      this.scene = new THREE.Scene();
      
      this.frustumHeight = this.options.preview ? 34 : 64;
      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
      this.camera.position.set(0, 0, 100);

      this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));
      
      this.group = new THREE.Group();
      this.scene.add(this.group);

      this.raycaster = new THREE.Raycaster();
      this.pointer = new THREE.Vector2();
      this.clock = new THREE.Clock();

      this._updateBoundsFromViewport();
      this._buildStars();
      this._buildLinks();
    }

    _updateBoundsFromViewport() {
      const visibleHeight = this.frustumHeight;
      const visibleWidth = visibleHeight * (this.camera.right - this.camera.left) / (this.camera.top - this.camera.bottom || 2);
      this.bounds.x = (visibleWidth || 100) * 0.5;
      this.bounds.y = (visibleHeight || 64) * 0.5;
    }

    _buildStars() {
      const THREE = this.THREE;
      const count = 180;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
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
      const n = this.accounts.length;
      const maxSegments = Math.ceil((n * (n - 1)) / 2) + 10;
      
      this.linkGeometry = new THREE.BufferGeometry();
      this.linkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxSegments * 2 * 3), 3));
      this.linkGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxSegments * 2 * 3), 3));
      
      this.links = new THREE.LineSegments(
        this.linkGeometry,
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: this.linkOpacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this.group.add(this.links);
    }

    _buildData() {
      const THREE = this.THREE;
      this.nodes = this.accounts.map((account) => {
        const pos = new THREE.Vector3(
          (Math.random() * 2 - 1) * (this.bounds.x - this.nodeRadius),
          (Math.random() * 2 - 1) * (this.bounds.y - this.nodeRadius),
          0
        );
        return {
          account,
          currentPosition: pos,
          velocity: new THREE.Vector3(),
          baseScale: 1.0,
          chaosClock: Math.random() * 60,
          collisionTimer: 0,
          reboundTimer: 0
        };
      });
    }

    _buildSceneObjects() {
      const THREE = this.THREE;
      const loader = new THREE.TextureLoader();
      const circleGeo = new THREE.CircleGeometry(this.nodeRadius, 64);

      this.nodes.forEach(node => {
        const material = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.98,
        });

        const avatarUrl = node.account.avatar_path || node.account.profile_pic_url;
        if (avatarUrl) {
          loader.load(avatarUrl, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            material.map = tex;
            material.needsUpdate = true;
          });
        }

        const disk = new THREE.Mesh(circleGeo, material);
        
        const borderMat = new THREE.MeshBasicMaterial({
          color: rimColor(node.account.engagement_rate),
          transparent: true,
          opacity: 0.4,
        });
        const borderGeo = new THREE.CircleGeometry(this.nodeRadius * 1.08, 64);
        const border = new THREE.Mesh(borderGeo, borderMat);

        this.group.add(border);
        this.group.add(disk);

        node.sphere = disk;
        node.halo = border;
        this.meshes.push(disk);
      });
    }

    _bindEvents() {
      window.addEventListener('resize', () => this.resize());
      this.el.addEventListener('pointermove', (e) => this._onPointerMove(e));
      this.el.addEventListener('click', (e) => this._onClick(e));
    }

    resize() {
      if (!this.renderer || !this.camera) return;
      const rect = this.el.getBoundingClientRect();
      const width = rect.width || 960;
      const height = rect.height || 520;
      const aspect = width / height;

      this.camera.left = -this.frustumHeight * aspect / 2;
      this.camera.right = this.frustumHeight * aspect / 2;
      this.camera.top = this.frustumHeight / 2;
      this.camera.bottom = -this.frustumHeight / 2;
      this.camera.updateProjectionMatrix();

      this._updateBoundsFromViewport();
      this.renderer.setSize(width, height);
    }

    _updateNodePositions(t) {
      const THREE = this.THREE;
      
      // 1. Repulsion & Physics
      const n = this.nodes.length;
      for (let i = 0; i < n; i++) {
        const a = this.nodes[i];
        for (let j = i + 1; j < n; j++) {
          const b = this.nodes[j];
          const delta = a.currentPosition.clone().sub(b.currentPosition);
          const dist = delta.length() || 0.1;
          const minDist = this.nodeRadius * 2.2;
          
          if (dist < minDist) {
            const force = (minDist - dist) * this.repulsionStrength;
            const push = delta.normalize().multiplyScalar(force);
            a.currentPosition.add(push);
            b.currentPosition.sub(push);
          }
        }
      }

      // 2. Main Loop
      this.nodes.forEach(node => {
        const isSelected = this.selectedNode === node;
        const targetScale = isSelected ? 1.8 : 1.0;
        node.baseScale += (targetScale - node.baseScale) * 0.1;

        // Apply Flow
        this._applyGridFlow(node, t);
        
        // Gravity
        const distToCenter = node.currentPosition.length();
        const gravity = node.currentPosition.clone().normalize().multiplyScalar(-0.0008 * (distToCenter / 15) * this.centerGravityMultiplier * this.timeScale);
        node.velocity.add(gravity);

        // Apply Velocity
        if (node.velocity.length() > this.maxSpeed) node.velocity.setLength(this.maxSpeed);
        node.velocity.multiplyScalar(this.friction);
        node.currentPosition.add(node.velocity.clone().multiplyScalar(this.timeScale));

        this._applyHardBounds(node);

        // Sync Meshes
        if (node.sphere) {
          node.sphere.position.copy(node.currentPosition);
          node.sphere.position.z = isSelected ? 5 : 0;
          node.sphere.scale.set(node.baseScale, node.baseScale, 1);
        }
        if (node.halo) {
          node.halo.position.copy(node.sphere.position);
          node.halo.position.z = node.sphere.position.z - 0.1;
          node.halo.scale.set(node.baseScale, node.baseScale, 1);
        }
      });

      this._updateLinks();
    }

    _applyGridFlow(node, t) {
      const noise = simpleNoise(node.currentPosition.x, node.currentPosition.y, t);
      const flow = new this.THREE.Vector3(Math.cos(noise * Math.PI), Math.sin(noise * Math.PI), 0).multiplyScalar(0.001 * this.timeScale);
      node.velocity.add(flow);
    }

    _applyHardBounds(node) {
      const bx = this.bounds.x - this.nodeRadius;
      const by = this.bounds.y - this.nodeRadius;
      node.currentPosition.x = clamp(node.currentPosition.x, -bx, bx);
      node.currentPosition.y = clamp(node.currentPosition.y, -by, by);
    }

    _updateLinks() {
      const pos = this.linkGeometry.getAttribute('position');
      const col = this.linkGeometry.getAttribute('color');
      let idx = 0;
      const n = this.nodes.length;

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const na = this.nodes[i];
          const nb = this.nodes[j];
          const d = na.currentPosition.distanceTo(nb.currentPosition);
          if (d > this.linkDistLimit) continue;

          const alpha = Math.max(0, 1 - d / this.linkDistLimit) * this.linkOpacity;
          const r = 0.8 * alpha, g = 1.0 * alpha, b = 0.1 * alpha;

          pos.setXYZ(idx * 2, na.currentPosition.x, na.currentPosition.y, 0);
          pos.setXYZ(idx * 2 + 1, nb.currentPosition.x, nb.currentPosition.y, 0);
          col.setXYZ(idx * 2, r, g, b);
          col.setXYZ(idx * 2 + 1, r, g, b);
          idx++;
        }
      }
      this.linkGeometry.setDrawRange(0, idx * 2);
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }

    _onPointerMove(e) {
      const rect = this.el.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.meshes);
      this.hoveredNode = hits.length ? hits[0].object : null;
      this.el.style.cursor = this.hoveredNode ? 'pointer' : 'default';
    }

    _onClick(e) {
      this._onPointerMove(e);
      if (this.hoveredNode) {
        const node = this.nodes.find(n => n.sphere === this.hoveredNode);
        this.setSelected(node.account);
        if (this.onSelect) this.onSelect(node.account);
      } else {
        this.setSelected(null);
        if (this.onSelect) this.onSelect(null);
      }
    }

    setSelected(account) {
      this.selectedNode = account ? this.nodes.find(n => n.account.account === account.account) : null;
    }

    start() {
      this.running = true;
      const loop = () => {
        if (!this.running) return;
        this._updateNodePositions(this.clock.getElapsedTime());
        this.renderer.render(this.scene, this.camera);
        this.raf = requestAnimationFrame(loop);
      };
      loop();
    }

    stop() {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
    }
  }

  window.NetworkGraph = NetworkGraph;
})();
