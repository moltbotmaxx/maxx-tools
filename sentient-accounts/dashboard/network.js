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

      // 2D Bounds and Config
      this.nodeRadius = options.preview ? 1.8 : 2.2;
      this.bounds = { x: 16, y: 10, z: 0 };
      this.repulsionRadius = this.nodeRadius * 5.8;
      this.repulsionStrength = 0.005;
      this.wanderStrength = 0.002; // Much slower base flow
      this.maxSpeed = 0.006; // Significantly lower speed cap

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
      this.el.appendChild(this.renderer.domElement);
    }

    _setupScene() {
      const THREE = this.THREE;
      this.scene = new THREE.Scene();

      this.frustumHeight = this.options.preview ? 34 : 64; // Increased for fullscreen spread
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
      const visibleWidth = this.camera.right - this.camera.left;
      const margin = this.options.preview ? 0.02 : 0; // Edge to edge for fullscreen
      this.bounds.x = visibleWidth * (0.5 - margin);
      this.bounds.y = visibleHeight * (0.5 - margin);
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
      const n = this.accounts.length;
      const maxSegments = Math.ceil((n * (n - 1)) / 2) + 10;
      this.linkGeometry = new THREE.BufferGeometry();
      this.linkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxSegments * 2 * 3), 3));
      this.linkGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxSegments * 2 * 3), 3));
      this.linkGeometry.setDrawRange(0, 0);

      this.linkLines = new THREE.LineSegments(
        this.linkGeometry,
        new THREE.LineBasicMaterial({
          color: 0xffffff, // Base white to not tint vertex colors
          transparent: true,
          opacity: 0.35, // Increased overall visibility
          vertexColors: true,
          blending: THREE.AdditiveBlending, // Makes it pop more
        }),
      );
      this.group.add(this.linkLines);
    }

    _randomPoint() {
      return new this.THREE.Vector3(
        (Math.random() * 2 - 1) * (this.bounds.x - this.nodeRadius),
        (Math.random() * 2 - 1) * (this.bounds.y - this.nodeRadius),
        0
      );
    }

    _buildData() {
      this.nodes = this.accounts.map((account, index) => {
        const position = this._randomPoint();
        return {
          account,
          index,
          color: rimColor(account.engagement_rate),
          currentPosition: position,
          velocity: new this.THREE.Vector3((Math.random() * 2 - 1) * 0.02, (Math.random() * 2 - 1) * 0.02, 0),
          driftSeed: new this.THREE.Vector2(Math.random() * 100, Math.random() * 100),
          sphere: null,
          halo: null,
          baseScale: 1.0,
          stagnationTime: 0,
          collisionTimer: 0,
          reboundTimer: 0
        };
      });
    }

    _buildSceneObjects() {
      const THREE = this.THREE;
      const loader = new THREE.TextureLoader();
      const circleGeo = new THREE.CircleGeometry(this.nodeRadius, 42);

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
        disk.renderOrder = 10;

        const borderGeo = new THREE.CircleGeometry(this.nodeRadius * 1.12, 42);
        const borderMat = new THREE.MeshBasicMaterial({
          color: node.color,
          transparent: true,
          opacity: 0.12,
        });
        const border = new THREE.Mesh(borderGeo, borderMat);
        border.renderOrder = 5;

        this.group.add(border);
        this.group.add(disk);

        disk.userData.node = node;
        node.sphere = disk;
        node.halo = border;
        this.meshes.push(disk);
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
      this.camera.left = -this.frustumHeight * aspect / 2;
      this.camera.right = this.frustumHeight * aspect / 2;
      this.camera.top = this.frustumHeight / 2;
      this.camera.bottom = -this.frustumHeight / 2;
      this.camera.updateProjectionMatrix();
      this._updateBoundsFromViewport();
      this.renderer.setSize(width, height);
      this.renderer.setClearColor(0x000000, 0); // Fully transparent
    }

    _applyRepulsion() {
      const n = this.nodes.length;
      for (let i = 0; i < n; i += 1) {
        let furthestNode = null;
        let maxDist = -1;
        const a = this.nodes[i];

        for (let j = 0; j < n; j += 1) {
          if (i === j) continue;
          const b = this.nodes[j];
          if (this.dragNode === a || this.dragNode === b) continue;

          const delta = a.currentPosition.clone().sub(b.currentPosition);
          const dist = delta.length();

          // 1. Furthest Node Tracking
          if (dist > maxDist) {
            maxDist = dist;
            furthestNode = b;
          }

          // 2. Passive Repulsion (Always active, prevents clumping)
          const minDist = (this.nodeRadius * a.baseScale) + (this.nodeRadius * b.baseScale);
          const repulsionRadius = minDist * 3.0;

          if (dist < repulsionRadius) {
            const force = (repulsionRadius - dist) * this.repulsionStrength * 0.5;
            const push = delta.clone().normalize().multiplyScalar(force);
            if (this.selectedNode !== a) a.currentPosition.add(push);
            if (this.selectedNode !== b) b.currentPosition.sub(push);
          }

          // 3. Collision Timer (Timed high-strength repulsion)
          if (dist < minDist) {
            a.collisionTimer = 5.0;
            b.collisionTimer = 5.0;
          }

          if ((a.collisionTimer > 0 || b.collisionTimer > 0) && dist < minDist * 2.2) {
            const force = (minDist * 2.2 - dist) * this.repulsionStrength * 2.5;
            const push = delta.clone().normalize().multiplyScalar(force);
            if (this.selectedNode !== a) a.currentPosition.add(push);
            if (this.selectedNode !== b) b.currentPosition.sub(push);
          }
        }

        // 4. Furthest Attraction (Pulls nodes towards their most distant peer)
        if (furthestNode && this.selectedNode !== a) {
          const attractionDelta = furthestNode.currentPosition.clone().sub(a.currentPosition);
          const attractionForce = attractionDelta.normalize().multiplyScalar(0.00015);
          a.velocity.add(attractionForce);
        }
      }
    }

    _updateLinks() {
      if (!this.linkGeometry) return;
      const pos = this.linkGeometry.getAttribute('position');
      const col = this.linkGeometry.getAttribute('color');
      let idx = 0;

      const n = this.nodes.length;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const na = this.nodes[i];
          const nb = this.nodes[j];
          const d = na.currentPosition.distanceTo(nb.currentPosition);

          const alpha = Math.max(0.01, 1 - d / 80) * 0.45;

          const r = 0.81 * alpha;
          const g = 1.0 * alpha;
          const b = 0.015 * alpha;

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

    _updateNodePositions(t) {
      this._applyRepulsion();
      this._updateLinks();

      this.nodes.forEach(node => {
        const isDragged = this.dragNode === node;
        const isSelected = this.selectedNode === node;
        const isToast = this.toast.activeNode === node;

        const targetScale = isSelected ? 2.5 : (isDragged ? 1.2 : 1.0);
        node.baseScale += (targetScale - node.baseScale) * 0.15;

        if (isSelected && !isDragged) {
          // Selected node stays on top and moves to center
          const targetPos = new this.THREE.Vector3(0, 0, 3.0);
          node.sphere.position.lerp(targetPos, 0.14);
          node.currentPosition.copy(node.sphere.position);
          node.halo.position.copy(node.sphere.position);
          node.halo.position.z -= 0.1;
          node.velocity.set(0, 0, 0);
        } else if (isDragged) {
          // Dragged node stays on top of connections (z = 2.0)
          node.sphere.position.copy(node.currentPosition);
          node.sphere.position.z = 2.0;
          node.halo.position.copy(node.sphere.position);
          node.halo.position.z -= 0.1;
          node.velocity.set(0, 0, 0);
        } else if (isToast) {
          // Freeze node in place while toast is active
          node.velocity.set(0, 0, 0);
          node.sphere.position.copy(node.currentPosition);
          node.sphere.position.z = 1.5;
          node.halo.position.copy(node.sphere.position);
          node.halo.position.z -= 0.1;
        } else {
          // Grid-based Flow logic (24-piece grid) + Chaos
          this._applyGridFlow(node, t);

          // Center Gravity & Forced Rebound (6s state)
          const distToCenter = node.currentPosition.length();
          if (node.reboundTimer > 0) {
            const force = node.currentPosition.clone().normalize().multiplyScalar(-0.01);
            node.velocity.add(force);
            node.reboundTimer -= 0.016;
          } else {
            const gravity = node.currentPosition.clone().normalize().multiplyScalar(-0.0004 * (distToCenter / 20));
            node.velocity.add(gravity);
          }

          // Decrement Timers
          if (node.collisionTimer > 0) node.collisionTimer -= 0.016;

          // 3. Stagnation & Physics Update
          if (node.velocity.length() > this.maxSpeed) node.velocity.setLength(this.maxSpeed);
          node.velocity.multiplyScalar(0.985);
          node.currentPosition.add(node.velocity);

          this._applyHardBounds(node);

          node.sphere.position.copy(node.currentPosition);
          node.sphere.position.z = 0;
        }
        node.halo.position.copy(node.sphere.position);
        node.halo.position.z -= 0.05;
        node.sphere.scale.set(node.baseScale, node.baseScale, 1);
        node.halo.scale.set(node.baseScale, node.baseScale, 1);
      });
    }

    _applyHardBounds(node) {
      const limitX = this.bounds.x - this.nodeRadius;
      const limitY = this.bounds.y - this.nodeRadius;

      // Header exclusion (Approx top 15% of screen)
      const headerHeight = this.frustumHeight * 0.15;
      const limitYTop = limitY - headerHeight;

      const bounce = 0.05;
      let hit = false;

      // X Bounds
      if (node.currentPosition.x >= limitX) { node.currentPosition.x = limitX; node.velocity.x = -bounce; hit = true; }
      else if (node.currentPosition.x <= -limitX) { node.currentPosition.x = -limitX; node.velocity.x = bounce; hit = true; }

      // Y Bounds (Special handling for Top/Header)
      if (node.currentPosition.y >= limitYTop) {
        node.currentPosition.y = limitYTop;
        node.velocity.y = -bounce;
        hit = true;
      }
      else if (node.currentPosition.y <= -limitY) {
        node.currentPosition.y = -limitY;
        node.velocity.y = bounce;
        hit = true;
      }

      if (hit) node.reboundTimer = 6.0;
    }

    _applyGridFlow(node, t) {
      const pos = node.currentPosition;
      // Grid 6x4 over the available bounds (24 pieces)
      const xPart = (pos.x + this.bounds.x) / (this.bounds.x * 2);
      const yPart = (pos.y + this.bounds.y) / (this.bounds.y * 2);

      const col = Math.floor(clamp(xPart * 6, 0, 5.99));
      const row = Math.floor(clamp(yPart * 4, 0, 3.99));

      const force = new this.THREE.Vector3();
      const strength = this.wanderStrength * 2.8;

      if (row === 3) {
        if (col < 5) force.set(1, 0, 0);
        else force.set(0, -1, 0);
      } 
      else if (row === 2) {
        if (col === 0) force.set(0, 1, 0);
        else if (col === 5) force.set(0, -1, 0);
        else force.set(-1, 0, 0);
      }
      else if (row === 1) {
        if (col === 0) force.set(0, 1, 0);
        else if (col === 5) force.set(0, -1, 0);
        else force.set(1, 0, 0);
      }
      else {
        if (col === 0) force.set(0, 1, 0);
        else force.set(-1, 0, 0);
      }

      // Add "Chaos" (Noise-based turbulence) to break straight lines
      const nx = pos.x + node.driftSeed.x;
      const ny = pos.y + node.driftSeed.y;
      const noiseAngle = simpleNoise(nx, ny, t) * Math.PI * 2;
      const chaos = new this.THREE.Vector3(Math.cos(noiseAngle), Math.sin(noiseAngle), 0);
      
      // Blend 70% grid force, 30% chaos
      const blendedForce = force.multiplyScalar(0.7).add(chaos.multiplyScalar(0.3));
      node.velocity.add(blendedForce.multiplyScalar(strength));
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
          const screenPos = randomNode.sphere.position.clone().project(this.camera);
          const sx = (screenPos.x + 1) * this.el.clientWidth / 2;
          const sy = (-screenPos.y + 1) * this.el.clientHeight / 2;

          // Toast size is approx 320x180. Center is at (sx-50, sy-50).
          const margin = 40;
          const isSafeX = sx > (50 + margin) && sx < (this.el.clientWidth - 270 - margin);
          const isSafeY = sy > (50 + margin) && sy < (this.el.clientHeight - 130 - margin);

          if (!isSafeX || !isSafeY) {
            this.toast.timer = 0.5; // Quick retry for another node
            return;
          }

          // Use ALL available posts for more variety
          const allPosts = randomNode.account.recent_posts;
          this.toast.activeNode = randomNode;
          this.toast.activePost = allPosts[Math.floor(Math.random() * allPosts.length)];

          // Update history (prevent repeats)
          this.toast.history.push(randomNode.account.account);
          if (this.toast.history.length > 15) this.toast.history.shift();

          // Fill Toast
          this.toast.el.querySelector('.nt-account').textContent = `@${randomNode.account.account}`;
          this.toast.el.querySelector('.nt-caption').textContent = this.toast.activePost.caption || "Intelligence transmission...";
          this.toast.el.querySelector('.nt-likes').textContent = fmt(this.toast.activePost.likes);
          this.toast.el.querySelector('.nt-comments').textContent = fmt(this.toast.activePost.comments);
          this.toast.el.classList.add('is-active');
        }
      }

      // If active, follow the node (align sprite exactly over placeholder)
      if (this.toast.activeNode) {
        const screenPos = this.toast.activeNode.sphere.position.clone().project(this.camera);
        const x = (screenPos.x + 1) * this.el.clientWidth / 2;
        const y = (-screenPos.y + 1) * this.el.clientHeight / 2;

        // Position toast statically relative to node
        this.toast.el.style.left = `${x - 50}px`;
        this.toast.el.style.top = `${y - 50}px`;
      }
    }

    start() {
      this.running = true;
      const loop = () => {
        if (!this.running) return;
        const dt = 0.016; // Approx 60fps
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
