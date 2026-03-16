const query = new URLSearchParams(window.location.search);

const GAME_WIDTH = getNumberParam("width", 1080);
const GAME_HEIGHT = getNumberParam("height", 1920);
const HOLD_MS = getNumberParam("holdMs", 2600);
const SEED = query.get("seed") || `${Date.now()}`;
const CIRCLE_SCALE = clampNumber(getNumberParam("circleScale", 1), 0.6, 1.8);
const FINAL_DUEL_HITS = Math.round(clampNumber(getNumberParam("finalDuelHits", 10), 1, 20));
const NAME_SCALE = clampNumber(getNumberParam("nameScale", 1), 0.7, 2.2);
const PLAYER_HITS = Math.round(clampNumber(getNumberParam("playerHits", 3), 1, 8));
const CENTER_BIAS = clampNumber(getOptionalNumberParam("centerBias", 1.35), 0.4, 2.4);
const CHAOS_SCALE = clampNumber(getOptionalNumberParam("chaosScale", 0.65), 0, 2.2);
const FIGHT_DRIVE = clampNumber(getOptionalNumberParam("fightDrive", 1.45), 0.4, 2.6);
const FX_INTENSITY = clampNumber(getOptionalNumberParam("fxIntensity", 1), 0, 2.4);
const SHAKE_SCALE = clampNumber(getOptionalNumberParam("shakeScale", 1), 0, 2.4);
const SHOW_AVATARS = getBooleanParam("showAvatars", true);
const SHOW_NAMES = getBooleanParam("showNames", false);
const SOUND_ENABLED = getBooleanParam("soundEnabled", true);
const SOUND_VOLUME = clampNumber(getOptionalNumberParam("soundVolume", 0.72), 0, 1);
const FINAL_DUEL_HOLD_MS = 520;
const FINAL_DUEL_MOVE_MS = 980;
const FINAL_DUEL_TRANSITION_MS = FINAL_DUEL_HOLD_MS + FINAL_DUEL_MOVE_MS + 220;
const WINNER_REVEAL_MS = 820;

const stageElement = document.getElementById("stage");
const viewportElement = document.getElementById("viewport");
const MatterBody = Phaser.Physics.Matter.Matter.Body;

window.__battleState = {
  celebrating: false,
  centerBias: CENTER_BIAS,
  chaosScale: CHAOS_SCALE,
  circleScale: CIRCLE_SCALE,
  finalDuel: false,
  finalDuelTransitioning: false,
  finalDuelHits: FINAL_DUEL_HITS,
  finished: false,
  fightDrive: FIGHT_DRIVE,
  fxIntensity: FX_INTENSITY,
  nameScale: NAME_SCALE,
  playerHits: PLAYER_HITS,
  playerRadius: 0,
  ready: false,
  remaining: 0,
  shakeScale: SHAKE_SCALE,
  seed: SEED,
  soundEnabled: SOUND_ENABLED,
  soundVolume: SOUND_VOLUME,
  total: 0,
  winner: null,
};
window.__battleReady = false;

viewportElement.style.width = `${GAME_WIDTH}px`;
viewportElement.style.height = `${GAME_HEIGHT}px`;
resizeViewport();
window.addEventListener("resize", resizeViewport);

function getNumberParam(name, fallback) {
  const value = Number(query.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getOptionalNumberParam(name, fallback) {
  const rawValue = query.get(name);
  if (rawValue === null) {
    return fallback;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : fallback;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.max(min, Math.min(max, number));
}

function getBooleanParam(name, fallback) {
  const value = query.get(name);
  if (value === null) {
    return fallback;
  }
  return value === "1" || value === "true";
}

async function loadPlayers() {
  if (Array.isArray(window.__battlePlayers) && window.__battlePlayers.length > 0) {
    return window.__battlePlayers;
  }

  // If embedded in an iframe, wait briefly for parent to inject players via postMessage
  if (window.parent !== window) {
    const injected = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 800);
      window.addEventListener("message", (event) => {
        if (event.data?.type === "battle-players" && Array.isArray(event.data.players)) {
          clearTimeout(timeout);
          resolve(event.data.players);
        }
      }, { once: true });
      // Signal parent that we're ready to receive players
      window.parent.postMessage({ type: "battle-ready" }, "*");
    });
    if (injected && injected.length > 0) {
      return injected;
    }
  }

  try {
    const response = await fetch(`./players.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      return [];
    }
    const payload = await response.json();
    return Array.isArray(payload) ? payload : [];
  } catch (error) {
    console.error("Failed to load players.json", error);
    return [];
  }
}

function resizeViewport() {
  const scale = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT);
  const offsetX = (window.innerWidth - GAME_WIDTH * scale) / 2;
  const offsetY = (window.innerHeight - GAME_HEIGHT * scale) / 2;

  viewportElement.style.transformOrigin = "top left";
  viewportElement.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

function announce(message, urgent = false) {
  if (urgent) {
    console.warn(message);
    return;
  }
  console.log(message);
}

function setResult(winnerName, avatarUrl, visible = false) {
  void winnerName;
  void avatarUrl;
  void visible;
}

function markBattleReady() {
  window.__battleState.ready = true;
  window.__battleReady = true;
}

function markBattleFinished(winnerName = null) {
  window.__battleState.finished = true;
  window.__battleState.winner = winnerName;
}

function createSeededRandom(seedString) {
  let seed = 0;
  for (let index = 0; index < seedString.length; index += 1) {
    seed = (seed * 31 + seedString.charCodeAt(index)) >>> 0;
  }

  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

class BattleAudioEngine {
  constructor({ enabled, volume }) {
    this.enabled = Boolean(enabled && volume > 0);
    this.volume = clampNumber(volume, 0, 1);
    this.context = null;
    this.masterGain = null;
    this.noiseBuffer = null;
    this.unlockHandler = () => {
      void this.unlock();
    };

    if (this.enabled) {
      window.addEventListener("pointerdown", this.unlockHandler, { passive: true });
      window.addEventListener("touchstart", this.unlockHandler, { passive: true });
      window.addEventListener("keydown", this.unlockHandler);
    }
  }

  ensureContext() {
    if (!this.enabled) {
      return null;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      this.enabled = false;
      return null;
    }

    if (!this.context) {
      this.context = new AudioContextClass();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.context.destination);
    }

    return this.context;
  }

  async unlock() {
    const context = this.ensureContext();
    if (!context) {
      return false;
    }

    if (context.state !== "running") {
      await context.resume().catch(() => null);
    }

    return context.state === "running";
  }

  destroy() {
    window.removeEventListener("pointerdown", this.unlockHandler);
    window.removeEventListener("touchstart", this.unlockHandler);
    window.removeEventListener("keydown", this.unlockHandler);
  }

  getNoiseBuffer(context) {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === context.sampleRate) {
      return this.noiseBuffer;
    }

    const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * 0.26)), context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  scheduleTone(startTime, options) {
    const context = this.ensureContext();
    if (!context || !this.masterGain) {
      return;
    }

    const {
      attack = 0.003,
      duration = 0.11,
      filterFrequency = 1800,
      filterType = "lowpass",
      frequency,
      frequencyEnd = null,
      gain = 0.08,
      q = 0.8,
      release = 0.08,
      type = "triangle",
    } = options;

    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const amplitude = context.createGain();
    const stopTime = startTime + duration + release + 0.04;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(40, frequency), startTime);
    if (frequencyEnd) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequencyEnd), startTime + duration);
    }

    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFrequency, startTime);
    filter.Q.value = q;

    amplitude.gain.setValueAtTime(0.0001, startTime);
    amplitude.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), startTime + attack);
    amplitude.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + release);

    oscillator.connect(filter);
    filter.connect(amplitude);
    amplitude.connect(this.masterGain);

    oscillator.start(startTime);
    oscillator.stop(stopTime);
    oscillator.onended = () => {
      oscillator.disconnect();
      filter.disconnect();
      amplitude.disconnect();
    };
  }

  scheduleNoise(startTime, options = {}) {
    const context = this.ensureContext();
    if (!context || !this.masterGain) {
      return;
    }

    const {
      duration = 0.08,
      filterFrequency = 2200,
      filterType = "bandpass",
      gain = 0.08,
      playbackRate = 1,
      q = 0.7,
    } = options;

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const amplitude = context.createGain();
    const stopTime = startTime + duration + 0.05;

    source.buffer = this.getNoiseBuffer(context);
    source.playbackRate.setValueAtTime(playbackRate, startTime);

    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFrequency, startTime);
    filter.Q.value = q;

    amplitude.gain.setValueAtTime(0.0001, startTime);
    amplitude.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), startTime + 0.004);
    amplitude.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    source.connect(filter);
    filter.connect(amplitude);
    amplitude.connect(this.masterGain);

    source.start(startTime);
    source.stop(stopTime);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      amplitude.disconnect();
    };
  }

  playHit({ strong = false, duel = false } = {}) {
    const context = this.ensureContext();
    if (!context) {
      return;
    }

    void this.unlock();
    const startTime = context.currentTime + 0.01;

    this.scheduleNoise(startTime, {
      duration: strong ? 0.12 : 0.07,
      filterFrequency: strong ? 2400 : 1800,
      gain: strong ? 0.11 : 0.06,
      playbackRate: strong ? 0.95 : 1.1,
    });
    this.scheduleTone(startTime, {
      duration: strong ? 0.16 : 0.1,
      filterFrequency: strong ? 1500 : 1200,
      frequency: strong ? 280 : 190,
      frequencyEnd: strong ? 96 : 126,
      gain: strong ? 0.12 : 0.08,
      release: strong ? 0.12 : 0.07,
      type: strong ? "sawtooth" : "triangle",
    });

    if (duel) {
      this.scheduleTone(startTime + 0.024, {
        duration: 0.08,
        filterFrequency: 2400,
        frequency: 430,
        frequencyEnd: 210,
        gain: 0.04,
        release: 0.05,
        type: "square",
      });
    }
  }

  playFinalDuelStart() {
    const context = this.ensureContext();
    if (!context) {
      return;
    }

    void this.unlock();
    const startTime = context.currentTime + 0.02;
    const notes = [196, 247, 329];
    notes.forEach((note, index) => {
      this.scheduleTone(startTime + index * 0.09, {
        duration: 0.12,
        filterFrequency: 2200,
        frequency: note,
        frequencyEnd: note * 1.04,
        gain: 0.08 + index * 0.01,
        release: 0.09,
        type: "sawtooth",
      });
    });
    this.scheduleNoise(startTime, {
      duration: 0.16,
      filterFrequency: 900,
      filterType: "lowpass",
      gain: 0.05,
      playbackRate: 0.8,
    });
  }

  playWinner() {
    const context = this.ensureContext();
    if (!context) {
      return;
    }

    void this.unlock();
    const startTime = context.currentTime + 0.02;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((note, index) => {
      this.scheduleTone(startTime + index * 0.08, {
        attack: 0.004,
        duration: 0.22,
        filterFrequency: 2600,
        frequency: note,
        frequencyEnd: note * 1.015,
        gain: 0.08,
        release: 0.16,
        type: index < 2 ? "triangle" : "sine",
      });
    });
    this.scheduleNoise(startTime + 0.04, {
      duration: 0.12,
      filterFrequency: 3400,
      gain: 0.045,
      playbackRate: 1.2,
      q: 1.2,
    });
  }
}

class BattleScene extends Phaser.Scene {
  constructor(playersList) {
    super("battle");
    this.playersList = playersList;
    this.actors = [];
    this.random = createSeededRandom(SEED);
    this.hitCooldowns = new Map();
    this.elapsedMs = 0;
    this.finalDuelClock = 0;
    this.finalDuelStarted = false;
    this.finalDuelTransitioning = false;
    this.pullStrength = 0.52;
    this.lastEngageBurstAt = 0;
    this.lastImpactMs = 0;
    this.totalPlayers = playersList.length;
    this.safeOrbitRadius = Math.min(GAME_WIDTH, GAME_HEIGHT) * 0.28;
    this.finished = false;
  }

  preload() {
    if (!SHOW_AVATARS) {
      return;
    }
    this.playersList.forEach((player) => {
      this.load.image(`avatar-source-${player.id}`, player.avatar);
    });
  }

  create() {
    this.audio = new BattleAudioEngine({
      enabled: SOUND_ENABLED,
      volume: SOUND_VOLUME,
    });
    this.events.once("shutdown", () => this.audio?.destroy());
    this.events.once("destroy", () => this.audio?.destroy());

    this.drawBackdrop();
    this.createBounds();

    this.playerRadius = Phaser.Math.Clamp((52 - Math.sqrt(this.playersList.length) * 2.8) * CIRCLE_SCALE, 10, 40);
    this.labelFontSize = Math.max(10, Math.round(this.playerRadius * 0.88 * NAME_SCALE));
    this.showLabels = SHOW_NAMES;
    this.showHealthPips = false;
    window.__battleState.playerRadius = this.playerRadius;

    const positions = this.buildSpawnPositions(this.playersList.length, this.playerRadius);
    const spawnDelay = Math.min(120, Math.max(15, 3000 / this.playersList.length));

    let spawnedCount = 0;
    
    this.time.addEvent({
      delay: spawnDelay,
      repeat: this.playersList.length - 1,
      callback: () => {
        const player = this.playersList[spawnedCount];
        const actor = this.createActor(player, positions[spawnedCount], this.playerRadius);
        
        actor.sprite.setScale(0);
        this.tweens.add({
          targets: actor.sprite,
          scale: { from: 0, to: 1 },
          duration: 300,
          ease: "Back.out",
        });

        this.actors.push(actor);
        spawnedCount += 1;

        if (spawnedCount === this.playersList.length) {
          window.__battleState.total = this.actors.length;
          window.__battleState.remaining = this.actors.length;

          this.registerCollisionHandler();
          this.startArenaEvents();
          void this.audio.unlock();

          this.isReady = false;
          let count = 3;

          const overlay = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.4)
            .setOrigin(0)
            .setDepth(200);

          const countText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "3", {
            fontFamily: '"Avenir Next", "Helvetica Neue", Arial, sans-serif',
            fontSize: "200px",
            fontWeight: "800",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 10,
          }).setOrigin(0.5).setDepth(201);

          this.tweens.add({
            targets: countText,
            scale: { from: 1.5, to: 1 },
            alpha: { from: 0, to: 1 },
            duration: 300,
            ease: "Back.out",
          });

          this.time.addEvent({
            delay: 1000,
            repeat: 3,
            callback: () => {
              count -= 1;
              if (count > 0) {
                countText.setText(count.toString());
                this.audio?.playHit({ strong: false });
                this.tweens.add({
                  targets: countText,
                  scale: { from: 1.3, to: 1 },
                  duration: 200,
                  ease: "Back.out",
                });
              } else if (count === 0) {
                countText.setText("FIGHT!");
                countText.setFontSize("160px");
                countText.setColor("#ff2d55");
                this.audio?.playHit({ strong: true });
                this.tweens.add({
                  targets: countText,
                  scale: { from: 1.5, to: 1 },
                  duration: 300,
                  ease: "Elastic.out",
                });
                this.flashArena();
              } else {
                countText.destroy();
                overlay.destroy();
                this.isReady = true;
                this.time.delayedCall(350, () => this.nudgeAllPlayers(true));
                markBattleReady();

                if (this.actors.length === 1) {
                  this.time.delayedCall(600, () => this.finishBattle(this.actors[0]));
                }
              }
            },
          });
        }
      },
    });
  }

  update(_, delta) {
    if (this.finished || !this.isReady) {
      return;
    }

    this.elapsedMs += delta;

    const center = new Phaser.Math.Vector2(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    const aliveActors = this.getAliveActors();
    if (this.finalDuelTransitioning) {
      aliveActors.forEach((actor) => {
        if (this.showLabels && actor.label && actor.sprite?.active) {
          actor.label.setPosition(actor.sprite.x, actor.sprite.y + actor.labelOffset);
        }
        actor.healthBarGraphic?.clear();
      });
      return;
    }
    const aliveRatio = aliveActors.length / Math.max(1, this.totalPlayers);
    const crowdPressure = 1 + (1 - aliveRatio) * 1.1;

    this.updateActorScales(aliveActors);
    if (this.finalDuelStarted) {
      this.finalDuelClock += delta;
      if (this.finalDuelClock > 6500 && !this.finalDuelPressure) {
        this.startFinalDuelPressure();
      }
    }

    aliveActors.forEach((actor, index) => {
      const sprite = actor.sprite;
      const opponent = this.findNearestOpponent(actor, aliveActors);
      const toCenter = new Phaser.Math.Vector2(center.x - sprite.x, center.y - sprite.y);
      const distance = Math.max(1, toCenter.length());
      const directionToCenter = toCenter.clone().scale(1 / distance);
      const orbitDistance = this.safeOrbitRadius * (0.78 + aliveRatio * 0.4) * (this.finalDuelStarted ? 0.48 : 1);
      const distancePressure = Phaser.Math.Clamp(distance / orbitDistance, 0.58, 2.9);
      const centerForce =
        0.00011 *
        this.pullStrength *
        CENTER_BIAS *
        distancePressure *
        crowdPressure *
        (this.finalDuelStarted ? 1.72 : 1);
      let directionToOpponent = new Phaser.Math.Vector2(0, 0);
      let opponentDistance = orbitDistance;
      if (opponent?.sprite?.active) {
        const toOpponent = new Phaser.Math.Vector2(opponent.sprite.x - sprite.x, opponent.sprite.y - sprite.y);
        opponentDistance = Math.max(1, toOpponent.length());
        directionToOpponent = toOpponent.scale(1 / opponentDistance);
      }

      const pursuitPressure = Phaser.Math.Clamp((orbitDistance * 0.92) / Math.max(1, opponentDistance), 0.58, 2.6);
      const pursuitForce =
        0.000072 *
        FIGHT_DRIVE *
        pursuitPressure *
        (0.82 + (1 - aliveRatio) * 0.85) *
        (this.finalDuelStarted ? 1.58 : 1.08);
      const orbitForce = 0.000024 * CHAOS_SCALE * (0.35 + aliveRatio * 0.55) * (this.finalDuelStarted ? 0.14 : 1);
      const wanderAngle = actor.wanderOffset + this.elapsedMs * actor.wanderSpeed;
      const wanderForce = 0.000013 * CHAOS_SCALE * (0.48 + distancePressure * 0.24) * (this.finalDuelStarted ? 0.08 : 1);
      const swirlBase = opponent?.sprite?.active ? directionToOpponent : directionToCenter;

      const swirl = new Phaser.Math.Vector2(-swirlBase.y, swirlBase.x).scale(
        orbitForce * actor.swirlDirection,
      );
      const wander = new Phaser.Math.Vector2(Math.cos(wanderAngle), Math.sin(wanderAngle)).scale(wanderForce);

      sprite.applyForce({
        x: directionToCenter.x * centerForce + directionToOpponent.x * pursuitForce + swirl.x + wander.x,
        y: directionToCenter.y * centerForce + directionToOpponent.y * pursuitForce + swirl.y + wander.y,
      });
      this.keepActorNearFinalCenter(actor, directionToCenter, distance);
      actor.lastPosition = { x: sprite.x, y: sprite.y };

      if (this.showLabels && actor.label) {
        actor.label.setPosition(sprite.x, sprite.y + actor.labelOffset);
      }

      if (this.showHealthPips) {
        actor.healthPips.forEach((pip, pipIndex) => {
          pip.setPosition(
            sprite.x + (pipIndex - 1) * 20,
            sprite.y + this.playerRadius + 24,
          );
        });
      }

      if (actor.healthBarGraphic) {
        this.drawHealthBar(actor);
      }

      if (!this.suddenDeathWarned && index === 0 && this.elapsedMs > 14000 && aliveActors.length > 1) {
        this.suddenDeathWarned = true;
        announce("Sudden death pressure is rising", true);
      }
    });

    const stallThreshold = this.finalDuelStarted ? 900 : 2400;
    const burstCooldown = this.finalDuelStarted ? 650 : 1400;
    if (
      aliveActors.length > 1 &&
      this.elapsedMs - this.lastImpactMs > stallThreshold &&
      this.elapsedMs - this.lastEngageBurstAt > burstCooldown
    ) {
      this.lastEngageBurstAt = this.elapsedMs;
      this.forceEngagementBurst(aliveActors, this.elapsedMs - this.lastImpactMs > stallThreshold * 1.8);
    }

    if (this.elapsedMs > 20000 && !this.suddenDeathTimer && !this.finalDuelStarted) {
      this.startSuddenDeath();
    }
  }

  drawBackdrop() {
    const background = this.add.graphics();
    background.fillStyle(0x000000, 1);
    background.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.flashOverlay = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 1)
      .setAlpha(0)
      .setDepth(69)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  flashArena(color = 0xffffff, alpha = 0.08, duration = 140) {
    if (!this.flashOverlay || FX_INTENSITY <= 0) {
      return;
    }

    const scaledAlpha = Math.min(0.38, alpha * Math.max(0, FX_INTENSITY));
    const scaledDuration = Math.round(duration * clampNumber(0.82 + FX_INTENSITY * 0.18, 0.42, 1.42));
    this.tweens.killTweensOf(this.flashOverlay);
    this.flashOverlay.setFillStyle(color, 1);
    this.flashOverlay.setAlpha(scaledAlpha);
    this.tweens.add({
      targets: this.flashOverlay,
      alpha: 0,
      duration: scaledDuration,
      ease: "Quad.Out",
    });
  }

  cameraKick(intensity = 0.0025, duration = 90) {
    if (SHAKE_SCALE <= 0) {
      return;
    }

    this.cameras.main.shake(duration, intensity * SHAKE_SCALE, true);
  }

  createBounds() {
    this.bounds = {
      left: 18,
      top: 18,
      width: GAME_WIDTH - 36,
      height: GAME_HEIGHT - 36,
    };

    this.matter.world.setBounds(
      this.bounds.left,
      this.bounds.top,
      this.bounds.width,
      this.bounds.height,
      80,
      true,
      true,
      true,
      true,
    );
  }

  buildSpawnPositions(count, radius) {
    const positions = [];
    const padding = radius * 1.9;
    const maxAttempts = Math.max(40, count * 18);
    const preferredGap = radius * 2.3;
    const fallbackGap = radius * 1.45;

    for (let index = 0; index < count; index += 1) {
      let chosen = null;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const gap = attempt < maxAttempts * 0.72 ? preferredGap : fallbackGap;
        const candidate = {
          x: this.bounds.left + padding + this.random() * Math.max(1, this.bounds.width - padding * 2),
          y: this.bounds.top + padding + this.random() * Math.max(1, this.bounds.height - padding * 2),
        };

        const overlaps = positions.some(
          (position) => Phaser.Math.Distance.Between(position.x, position.y, candidate.x, candidate.y) < gap,
        );

        if (!overlaps) {
          chosen = candidate;
          break;
        }
      }

      positions.push(
        chosen || {
          x: this.bounds.left + padding + this.random() * Math.max(1, this.bounds.width - padding * 2),
          y: this.bounds.top + padding + this.random() * Math.max(1, this.bounds.height - padding * 2),
        },
      );
    }

    return positions;
  }

  createActor(player, position, radius) {
    const textureKey = this.buildAvatarTexture(player, radius);
    const sprite = this.matter.add.image(position.x, position.y, textureKey);
    sprite.setCircle(radius);
    sprite.setBounce(0.985);
    sprite.setFriction(0, 0, 0);
    sprite.setFrictionAir(0.014);
    sprite.setMass(6);
    sprite.setAngularVelocity((this.random() - 0.5) * 0.1);
    sprite.setVelocity((this.random() - 0.5) * 7.4, (this.random() - 0.5) * 7.4);
    sprite.setDepth(20);

    const actor = {
      avatarUrl: player.avatar,
      colors: player.colors || {},
      eliminated: false,
      health: PLAYER_HITS,
      healthBarGraphic: null,
      healthPips: [],
      id: player.id,
      label: null,
      labelOffset: radius + Math.max(24, Math.round(this.labelFontSize * 1.55)),
      lastPosition: { x: position.x, y: position.y },
      maxHealth: PLAYER_HITS,
      name: player.name,
      baseLabelOffset: radius + Math.max(24, Math.round(this.labelFontSize * 1.55)),
      currentScale: 1,
      sprite,
      swirlDirection: this.random() > 0.5 ? 1 : -1,
      textureKey,
      wanderOffset: this.random() * Math.PI * 2,
      wanderSpeed: 0.0014 + this.random() * 0.0016,
    };

    sprite.actor = actor;

    if (this.showLabels) {
      actor.label = this.add
        .text(position.x, position.y + actor.labelOffset, `@${shorten(player.name, 14)}`, {
          color: "rgba(246, 239, 227, 0.88)",
          fontFamily: '"Avenir Next", "Montserrat", sans-serif',
          fontSize: `${this.labelFontSize}px`,
          fontStyle: "700",
          stroke: "#08111f",
          strokeThickness: Math.max(4, Math.round(this.labelFontSize * 0.36)),
        })
        .setOrigin(0.5)
        .setDepth(24);
    }

    if (this.showHealthPips) {
      for (let pipIndex = 0; pipIndex < actor.maxHealth; pipIndex += 1) {
        const pip = this.add
          .circle(position.x, position.y, 7, 0xffbd87, pipIndex < actor.health ? 1 : 0.18)
          .setStrokeStyle(2, 0xffffff, 0.8)
          .setDepth(24);
        actor.healthPips.push(pip);
      }
    }

    return actor;
  }

  findNearestOpponent(actor, aliveActors = this.getAliveActors()) {
    if (!actor?.sprite?.active) {
      return null;
    }

    let nearestActor = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    aliveActors.forEach((candidate) => {
      if (candidate === actor || !candidate?.sprite?.active) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(
        actor.sprite.x,
        actor.sprite.y,
        candidate.sprite.x,
        candidate.sprite.y,
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestActor = candidate;
      }
    });

    return nearestActor;
  }

  syncActorBodyToSprite(actor) {
    if (!actor?.sprite?.body) {
      return;
    }

    MatterBody.setPosition(actor.sprite.body, {
      x: actor.sprite.x,
      y: actor.sprite.y,
    });
    MatterBody.setVelocity(actor.sprite.body, { x: 0, y: 0 });
    MatterBody.setAngularVelocity(actor.sprite.body, 0);
  }

  keepActorNearFinalCenter(actor, directionToCenter, distanceToCenter) {
    if (!this.finalDuelStarted || !actor?.sprite?.body) {
      return;
    }

    const leashRadius = Math.max(this.playerRadius * 4.2, 150);
    const speedLimit = 9.4;
    const { x, y } = actor.sprite.body.velocity;

    if (distanceToCenter > leashRadius) {
      const overshoot = distanceToCenter - leashRadius;
      actor.sprite.setVelocity(
        x * 0.84 + directionToCenter.x * (2.8 + overshoot * 0.05),
        y * 0.84 + directionToCenter.y * (2.8 + overshoot * 0.05),
      );
    } else if (distanceToCenter > leashRadius * 0.78) {
      actor.sprite.setVelocity(
        x * 0.93 + directionToCenter.x * 1.15,
        y * 0.93 + directionToCenter.y * 1.15,
      );
    }

    const velocityX = actor.sprite.body.velocity.x;
    const velocityY = actor.sprite.body.velocity.y;
    const speed = Math.hypot(velocityX, velocityY);
    if (speed > speedLimit) {
      const scale = speedLimit / speed;
      actor.sprite.setVelocity(velocityX * scale, velocityY * scale);
    }
  }

  buildAvatarTexture(player, radius) {
    const outline = Math.max(2, radius * 0.08);
    const textureSize = Math.ceil(radius * 2 + outline * 6);
    const textureKey = `avatar-ready-${player.id}`;
    const texture = this.textures.createCanvas(textureKey, textureSize, textureSize);
    const context = texture.getContext();
    const center = textureSize / 2;
    const initials = getInitials(player.name);

    context.clearRect(0, 0, textureSize, textureSize);
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.closePath();

    if (SHOW_AVATARS) {
      const source = this.textures.get(`avatar-source-${player.id}`).getSourceImage();
      context.save();
      context.clip();
      context.drawImage(source, center - radius, center - radius, radius * 2, radius * 2);
      context.restore();
    } else {
      context.fillStyle = player.colors?.primary || "#444444";
      context.fill();
      context.font = `700 ${Math.max(12, Math.round(radius * 0.85))}px sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = "#ffffff";
      context.fillText(initials, center, center + radius * 0.04);
    }

    context.beginPath();
    context.arc(center, center, radius + outline * 0.22, 0, Math.PI * 2);
    context.lineWidth = outline * 0.9;
    context.strokeStyle = "rgba(255, 255, 255, 0.94)";
    context.stroke();

    texture.refresh();
    return textureKey;
  }

  registerCollisionHandler() {
    this.matter.world.on("collisionstart", (event) => {
      if (this.finished || this.finalDuelTransitioning) {
        return;
      }

      event.pairs.forEach((pair) => {
        const actorA = pair.bodyA.gameObject?.actor;
        const actorB = pair.bodyB.gameObject?.actor;
        if (!actorA || !actorB || actorA === actorB) {
          return;
        }

        if (actorA.health <= 0 || actorB.health <= 0 || actorA.eliminated || actorB.eliminated) {
          return;
        }

        const pairKey = actorA.id < actorB.id ? `${actorA.id}:${actorB.id}` : `${actorB.id}:${actorA.id}`;
        const now = this.time.now;
        if ((this.hitCooldowns.get(pairKey) || 0) + 240 > now) {
          return;
        }
        this.hitCooldowns.set(pairKey, now);
        this.lastImpactMs = this.elapsedMs;

        const impactX = (actorA.sprite.x + actorB.sprite.x) / 2;
        const impactY = (actorA.sprite.y + actorB.sprite.y) / 2;
        const { aggressor, victim } = this.pickCollisionOutcome(actorA, actorB);
        this.damageActor(victim, aggressor, {
          impactX,
          impactY,
          reason: "collision",
          strong: this.finalDuelStarted,
        });
      });
    });
  }

  pickCollisionOutcome(actorA, actorB) {
    const distanceA = this.getDistanceToCenter(actorA);
    const distanceB = this.getDistanceToCenter(actorB);
    const epsilon = 4;

    if (Math.abs(distanceA - distanceB) <= epsilon) {
      if (`${actorA.id}` < `${actorB.id}`) {
        return { aggressor: actorB, victim: actorA };
      }
      return { aggressor: actorA, victim: actorB };
    }

    if (distanceA < distanceB) {
      return { aggressor: actorB, victim: actorA };
    }

    return { aggressor: actorA, victim: actorB };
  }

  damageActor(actor, attacker, context = {}) {
    if (actor.health <= 0 || actor.eliminated || this.finished) {
      return;
    }

    actor.health -= 1;
    actor.sprite.setAlpha(0.38 + (actor.health / Math.max(1, actor.maxHealth)) * 0.62);
    this.playHitFeedback(actor, attacker, context);

    actor.healthPips.forEach((pip, pipIndex) => {
      pip.setAlpha(pipIndex < actor.health ? 1 : 0.18);
    });
    this.drawHealthBar(actor);

    if (actor.health <= 0) {
      actor.eliminated = true;
      this.time.delayedCall(0, () => this.eliminateActor(actor, attacker));
    }
  }

  eliminateActor(actor, attacker) {
    if (this.finished || !actor.sprite) {
      return;
    }

    const { x, y } = actor.sprite;
    actor.lastPosition = { x, y };
    const ghost = this.add.image(x, y, actor.sprite.texture.key).setDepth(42);
    const body = actor.sprite.body;

    if (body) {
      this.matter.world.remove(body);
    }

    actor.sprite.destroy();
    actor.label?.destroy();
    actor.healthBarGraphic?.destroy();
    actor.healthPips.forEach((pip) => pip.destroy());
    actor.sprite = null;
    actor.healthBarGraphic = null;
    actor.label = null;
    actor.healthPips = [];
    actor.health = 0;

    this.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: 460,
      ease: "Cubic.In",
      scaleX: 0.28,
      scaleY: 0.28,
      onComplete: () => ghost.destroy(),
    });

    const remaining = this.getAliveActors().length;
    window.__battleState.remaining = remaining;

    if (remaining === 2 && !this.finalDuelStarted) {
      this.activateFinalDuel();
      return;
    }

    if (remaining <= 1) {
      const winner = this.getAliveActors()[0] || this.pickWinnerFallback(attacker);
      this.finishBattle(winner);
    }
  }

  spawnShockwave(x, y, strong = false) {
    if (FX_INTENSITY <= 0) {
      return;
    }

    const ring = this.add
      .circle(x, y, (strong ? 18 : 12) * Math.max(0.6, FX_INTENSITY))
      .setStrokeStyle(strong ? 3 : 2, strong ? 0xffffff : 0xff8f8f, strong ? 0.92 : 0.74)
      .setScale(0.72)
      .setDepth(43);

    this.tweens.add({
      targets: ring,
      alpha: 0,
      duration: Math.round((strong ? 300 : 180) * clampNumber(0.78 + FX_INTENSITY * 0.22, 0.48, 1.42)),
      ease: "Cubic.Out",
      scaleX: (strong ? 5.2 : 3.8) * Math.max(0.55, FX_INTENSITY),
      scaleY: (strong ? 5.2 : 3.8) * Math.max(0.55, FX_INTENSITY),
      onComplete: () => ring.destroy(),
    });
  }

  spawnImpact(x, y, strong = false) {
    const burst = this.add
      .circle(x, y, (strong ? 12 : 8) * Math.max(0.55, FX_INTENSITY), 0xffffff, strong ? 0.22 : 0.14)
      .setDepth(44);
    this.tweens.add({
      targets: burst,
      alpha: 0,
      duration: Math.round((strong ? 170 : 110) * clampNumber(0.82 + FX_INTENSITY * 0.18, 0.5, 1.38)),
      scaleX: (strong ? 3.6 : 2) * Math.max(0.5, FX_INTENSITY),
      scaleY: (strong ? 3.6 : 2) * Math.max(0.5, FX_INTENSITY),
      onComplete: () => burst.destroy(),
    });

    this.spawnShockwave(x, y, strong);

    const sparkCount = Math.max(0, Math.round((strong ? 12 : 6) * FX_INTENSITY));
    for (let index = 0; index < sparkCount; index += 1) {
      const angle = (Math.PI * 2 * index) / sparkCount + this.random() * 0.18;
      const travel = ((strong ? 36 : 20) + this.random() * (strong ? 42 : 20)) * Math.max(0.55, FX_INTENSITY);
      const spark = this.add
        .rectangle(x, y, strong ? 10 : 7, strong ? 3 : 2, index % 2 === 0 ? 0xffffff : 0xff4d4d, 0.95)
        .setDepth(45)
        .setRotation(angle);

      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * travel,
        y: y + Math.sin(angle) * travel,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: Math.round((strong ? 260 : 170) * clampNumber(0.82 + FX_INTENSITY * 0.18, 0.52, 1.42)),
        ease: "Cubic.Out",
        onComplete: () => spark.destroy(),
      });
    }
  }

  playHitFeedback(actor, attacker, context = {}) {
    if (!actor.sprite?.active) {
      return;
    }

    const strong = Boolean(context.strong || this.finalDuelStarted);
    const duel = Boolean(this.finalDuelStarted);
    const impactX = context.impactX ?? actor.sprite.x;
    const impactY = context.impactY ?? actor.sprite.y;
    const ringRadius = this.playerRadius * (actor.currentScale || 1) * 1.05;
    const ring = this.add
      .circle(actor.sprite.x, actor.sprite.y, ringRadius)
      .setStrokeStyle(strong ? 7 : 4, 0xff4343, strong ? 0.96 : 0.72)
      .setDepth(61);

    actor.sprite.setTintFill(0xff3b3b);
    this.time.delayedCall(strong ? 130 : 90, () => {
      if (actor.sprite?.active) {
        actor.sprite.clearTint();
      }
    });

    this.tweens.add({
      targets: ring,
      alpha: 0,
      scaleX: strong ? 1.24 : 1.12,
      scaleY: strong ? 1.24 : 1.12,
      duration: strong ? 180 : 120,
      ease: "Cubic.Out",
      onComplete: () => ring.destroy(),
    });

    if (attacker?.sprite?.active && actor.sprite.body) {
      const away = new Phaser.Math.Vector2(actor.sprite.x - attacker.sprite.x, actor.sprite.y - attacker.sprite.y);
      away.normalize();
      const knockback = strong ? 2.6 : 1.4;
      actor.sprite.setVelocity(
        actor.sprite.body.velocity.x + away.x * knockback,
        actor.sprite.body.velocity.y + away.y * knockback,
      );
    }

    this.cameraKick(strong ? 0.0072 : 0.0028, strong ? 150 : 90);
    this.flashArena(strong ? 0xffffff : 0xff4b4b, strong ? 0.1 : 0.05, strong ? 170 : 110);
    this.audio?.playHit({ strong, duel });
    this.spawnImpact(impactX, impactY, strong);
  }

  startArenaEvents() {
    this.time.addEvent({
      delay: 900,
      loop: true,
      callback: () => this.nudgeAllPlayers(false),
    });

    this.time.addEvent({
      delay: 3200,
      loop: true,
      callback: () => {
        if (this.finished) {
          return;
        }
        this.pullStrength = Math.min(1.28, this.pullStrength + 0.16);
        this.nudgeAllPlayers(true);
      },
    });
  }

  nudgeAllPlayers(strong) {
    if (this.finished || this.finalDuelTransitioning) {
      return;
    }

    const center = new Phaser.Math.Vector2(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    const multiplier = (strong ? 1.5 : 0.92) * (this.finalDuelStarted ? 1.18 : 1);
    const aliveActors = this.getAliveActors();
    aliveActors.forEach((actor) => {
      const opponent = this.findNearestOpponent(actor, aliveActors);
      const towardCenter = new Phaser.Math.Vector2(center.x - actor.sprite.x, center.y - actor.sprite.y);
      towardCenter.normalize();
      let towardOpponent = towardCenter.clone();
      if (opponent?.sprite?.active) {
        towardOpponent = new Phaser.Math.Vector2(opponent.sprite.x - actor.sprite.x, opponent.sprite.y - actor.sprite.y);
        towardOpponent.normalize();
      }

      const tangent = new Phaser.Math.Vector2(-towardOpponent.y, towardOpponent.x).scale(actor.swirlDirection);
      const chaos = new Phaser.Math.Vector2(this.random() * 2 - 1, this.random() * 2 - 1);
      chaos.normalize();
      const centerBoost = (2.1 + this.random() * 1.8) * CENTER_BIAS * (this.finalDuelStarted ? 1.25 : 1);
      const pursuitBoost = (2.7 + this.random() * 2.2) * FIGHT_DRIVE * (this.finalDuelStarted ? 1.4 : 1.08);
      const tangentBoost = (0.9 + this.random() * 1.25) * CHAOS_SCALE * (this.finalDuelStarted ? 0.68 : 1);
      const chaosBoost = (0.35 + this.random() * 0.55) * CHAOS_SCALE * (this.finalDuelStarted ? 0.38 : 1);
      actor.sprite.setVelocity(
        actor.sprite.body.velocity.x +
          (towardCenter.x * centerBoost +
            towardOpponent.x * pursuitBoost +
            tangent.x * tangentBoost +
            chaos.x * chaosBoost) *
            multiplier,
        actor.sprite.body.velocity.y +
          (towardCenter.y * centerBoost +
            towardOpponent.y * pursuitBoost +
            tangent.y * tangentBoost +
            chaos.y * chaosBoost) *
            multiplier,
      );
    });
  }

  forceEngagementBurst(aliveActors, strong = false) {
    if (this.finished || this.finalDuelTransitioning || aliveActors.length <= 1) {
      return;
    }

    const center = new Phaser.Math.Vector2(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    aliveActors.forEach((actor) => {
      const opponent = this.findNearestOpponent(actor, aliveActors);
      if (!actor.sprite?.body || !opponent?.sprite?.active) {
        return;
      }

      const towardOpponent = new Phaser.Math.Vector2(opponent.sprite.x - actor.sprite.x, opponent.sprite.y - actor.sprite.y);
      towardOpponent.normalize();
      const towardCenter = new Phaser.Math.Vector2(center.x - actor.sprite.x, center.y - actor.sprite.y);
      towardCenter.normalize();
      const tangent = new Phaser.Math.Vector2(-towardOpponent.y, towardOpponent.x).scale(actor.swirlDirection);

      const duelMultiplier = this.finalDuelStarted ? 1.45 : 1;
      const pursuitBoost = (4.9 + this.random() * 2.7) * FIGHT_DRIVE * (strong ? 1.22 : 1) * duelMultiplier;
      const centerBoost = (2.8 + this.random() * 1.5) * CENTER_BIAS * (strong ? 1.18 : 1) * duelMultiplier;
      const flankBoost =
        (0.55 + this.random() * 0.7) *
        CHAOS_SCALE *
        (this.finalDuelStarted ? 0.18 : 1) *
        (strong ? 0.72 : 0.48);

      actor.sprite.setVelocity(
        actor.sprite.body.velocity.x +
          towardOpponent.x * pursuitBoost +
          towardCenter.x * centerBoost +
          tangent.x * flankBoost,
        actor.sprite.body.velocity.y +
          towardOpponent.y * pursuitBoost +
          towardCenter.y * centerBoost +
          tangent.y * flankBoost,
      );
    });

    if (strong) {
      this.flashArena(0xffffff, 0.03, 90);
    }
  }

  startSuddenDeath() {
    if (this.suddenDeathTimer) {
      return;
    }

    this.suddenDeathTimer = this.time.addEvent({
      delay: 1500,
      loop: true,
      callback: () => {
        const alive = this.getAliveActors();
        if (alive.length <= 1 || this.finished) {
          return;
        }

        const sparedIndex = Math.floor(this.random() * alive.length);
        alive.forEach((actor, index) => {
          if (index !== sparedIndex) {
            this.damageActor(actor, alive[sparedIndex] || null, {
              impactX: actor.sprite?.x,
              impactY: actor.sprite?.y,
              reason: "sudden-death",
              strong: false,
            });
          }
        });
      },
    });
  }

  startFinalDuelPressure() {
    if (this.finalDuelPressure) {
      return;
    }

    this.finalDuelPressure = this.time.addEvent({
      delay: 900,
      loop: true,
      callback: () => {
        const alive = this.getAliveActors();
        if (alive.length !== 2 || this.finished) {
          return;
        }

        const ordered = [...alive].sort((left, right) => this.getDistanceToCenter(right) - this.getDistanceToCenter(left));
        this.damageActor(ordered[0], ordered[1], {
          impactX: ordered[0].sprite?.x,
          impactY: ordered[0].sprite?.y,
          reason: "final-duel-pressure",
          strong: true,
        });
      },
    });
  }

  startFinalDuelManeuvers() {
    if (this.finalDuelManeuvers) {
      return;
    }

    this.finalDuelManeuvers = this.time.addEvent({
      delay: 420,
      loop: true,
      callback: () => this.executeFinalDuelBeat(),
    });
  }

  executeFinalDuelBeat() {
    const alive = this.getAliveActors();
    if (alive.length !== 2 || this.finished) {
      return;
    }

    const center = new Phaser.Math.Vector2(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    const aggressorIndex = Math.floor(this.random() * 2);

    alive.forEach((actor, index) => {
      const opponent = alive[index === 0 ? 1 : 0];
      if (!opponent?.sprite?.active || !actor.sprite?.body) {
        return;
      }

      const toOpponent = new Phaser.Math.Vector2(opponent.sprite.x - actor.sprite.x, opponent.sprite.y - actor.sprite.y);
      const toCenter = new Phaser.Math.Vector2(center.x - actor.sprite.x, center.y - actor.sprite.y);
      toOpponent.normalize();
      toCenter.normalize();

      const tangent = new Phaser.Math.Vector2(-toOpponent.y, toOpponent.x).scale(this.random() > 0.5 ? 1 : -1);
      actor.swirlDirection *= -1;

      if (index === aggressorIndex) {
        const lunge = toOpponent.scale(5.4 + this.random() * 2.1);
        const centerDrive = toCenter.scale(4.6 + this.random() * 1.8);
        const feint = tangent.scale(0.5 + this.random() * 0.6);
        actor.sprite.setVelocity(
          actor.sprite.body.velocity.x + lunge.x + centerDrive.x + feint.x,
          actor.sprite.body.velocity.y + lunge.y + centerDrive.y + feint.y,
        );
      } else {
        const retreat = toOpponent.scale(-(0.2 + this.random() * 0.4));
        const sidestep = tangent.scale(1.8 + this.random() * 1.0);
        const brace = toCenter.scale(4.4 + this.random() * 1.8);
        actor.sprite.setVelocity(
          actor.sprite.body.velocity.x + retreat.x + sidestep.x + brace.x,
          actor.sprite.body.velocity.y + retreat.y + sidestep.y + brace.y,
        );
      }
    });
  }

  activateFinalDuel() {
    if (this.finalDuelStarted || this.finished) {
      return;
    }

    const finalists = this.getAliveActors();
    if (finalists.length !== 2) {
      return;
    }

    this.finalDuelStarted = true;
    this.finalDuelTransitioning = true;
    this.finalDuelClock = 0;
    window.__battleState.finalDuel = true;
    window.__battleState.finalDuelTransitioning = true;
    announce("Final duel", true);

    this.suddenDeathTimer?.destroy();
    this.suddenDeathTimer = null;
    this.pullStrength = Math.max(this.pullStrength, 1.04);
    this.hitCooldowns.clear();

    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;
    const duelOffset = Math.max(this.playerRadius * 2.1, 88);
    const transitionVeil = this.add
      .rectangle(centerX, centerY, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1)
      .setAlpha(0)
      .setDepth(56);

    finalists.forEach((actor, index) => {
      actor.health = FINAL_DUEL_HITS;
      actor.maxHealth = FINAL_DUEL_HITS;
      actor.eliminated = false;
      this.ensureHealthBar(actor);
      actor.healthBarGraphic?.clear();
      actor.healthBarGraphic?.setAlpha(0);

      const target = {
        x: centerX + (index === 0 ? -duelOffset : duelOffset),
        y: centerY + (index === 0 ? -18 : 18),
      };
      const start = {
        x: actor.sprite.x,
        y: actor.sprite.y,
      };

      if (actor.sprite.body) {
        MatterBody.setVelocity(actor.sprite.body, { x: 0, y: 0 });
        MatterBody.setAngularVelocity(actor.sprite.body, 0);
      }

      actor.sprite
        .setPosition(start.x, start.y)
        .setVelocity(0, 0)
        .setAlpha(1)
        .setScale(actor.currentScale || 1)
        .setAngle(0)
        .setRotation(0)
        .clearTint();
      actor.lastPosition = start;
      actor.finalDuelStart = start;
      actor.finalDuelTarget = target;

      if (actor.label) {
        actor.label
          .setPosition(start.x, start.y + actor.labelOffset)
          .setAlpha(0.86)
          .setAngle(0)
          .setRotation(0);
      }
    });

    this.flashArena(0xffffff, 0.12, 300);
    this.cameraKick(0.006, 200);
    this.spawnShockwave(centerX, centerY, true);
    this.audio?.playFinalDuelStart();
    this.flashFinalDuelBanner();
    this.tweens.add({
      targets: transitionVeil,
      alpha: 0.18,
      duration: 240,
      ease: "Quad.Out",
    });

    finalists.forEach((actor) => {
      this.tweens.add({
        targets: actor.sprite,
        scaleX: (actor.currentScale || 1) * 1.04,
        scaleY: (actor.currentScale || 1) * 1.04,
        duration: FINAL_DUEL_HOLD_MS / 2,
        ease: "Sine.InOut",
        yoyo: true,
      });
    });

    this.time.delayedCall(FINAL_DUEL_HOLD_MS, () => {
      finalists.forEach((actor) => {
        if (!actor.sprite?.active) {
          return;
        }

        const target = actor.finalDuelTarget || actor.lastPosition || { x: centerX, y: centerY };
        this.tweens.add({
          targets: actor.sprite,
          x: target.x,
          y: target.y,
          duration: FINAL_DUEL_MOVE_MS,
          ease: "Sine.InOut",
          onUpdate: () => {
            this.syncActorBodyToSprite(actor);
          },
          onComplete: () => {
            actor.lastPosition = target;
          },
        });

        if (actor.label) {
          this.tweens.add({
            targets: actor.label,
            alpha: 1,
            x: target.x,
            y: target.y + actor.labelOffset,
            duration: FINAL_DUEL_MOVE_MS,
            ease: "Sine.InOut",
          });
        }
      });
    });

    this.time.delayedCall(FINAL_DUEL_TRANSITION_MS, () => {
      this.tweens.add({
        targets: transitionVeil,
        alpha: 0,
        duration: 180,
        ease: "Quad.Out",
        onComplete: () => transitionVeil.destroy(),
      });
      this.finalDuelTransitioning = false;
      window.__battleState.finalDuelTransitioning = false;
      this.finalDuelClock = 0;
      this.lastImpactMs = this.elapsedMs;

      finalists.forEach((actor) => {
        actor.healthBarGraphic?.setAlpha(1);
        this.drawHealthBar(actor);
      });

      this.startFinalDuelManeuvers();
      this.nudgeAllPlayers(true);
    });
  }

  finishBattle(winner) {
    if (this.finished) {
      return;
    }
    this.finished = true;

    this.suddenDeathTimer?.destroy();
    this.finalDuelManeuvers?.destroy();
    this.finalDuelPressure?.destroy();

    const resolvedWinner = winner || this.pickWinnerFallback();
    const winnerName = resolvedWinner?.name || null;
    setResult(winnerName, resolvedWinner?.avatarUrl || "", false);

    if (winnerName) {
      window.__battleState.remaining = 1;
    }
    this.moveWinnerToCenter(resolvedWinner);
    this.time.delayedCall(WINNER_REVEAL_MS - 80, () => this.playWinnerCelebration(resolvedWinner));

    this.time.delayedCall(HOLD_MS, () => {
      markBattleFinished(winnerName);
    });
  }

  getAliveActors() {
    return this.actors.filter((actor) => actor.health > 0 && actor.sprite && actor.sprite.active);
  }

  pickWinnerFallback(preferredActor = null) {
    const alive = this.getAliveActors();
    if (alive.length) {
      return alive[0];
    }
    if (preferredActor?.name) {
      return preferredActor;
    }

    return this.actors
      .filter((actor) => actor.lastPosition)
      .sort((left, right) => this.getDistanceToCenter(left) - this.getDistanceToCenter(right))[0] || null;
  }

  getDistanceToCenter(actor) {
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;
    const x = actor.sprite?.x ?? actor.lastPosition?.x ?? centerX;
    const y = actor.sprite?.y ?? actor.lastPosition?.y ?? centerY;
    return Phaser.Math.Distance.Between(x, y, centerX, centerY);
  }

  updateActorScales(aliveActors) {
    const targetScale = this.getAliveScaleTarget(aliveActors.length);
    aliveActors.forEach((actor) => this.applyActorScale(actor, targetScale));
  }

  getAliveScaleTarget(aliveCount) {
    const collapseProgress =
      1 - Phaser.Math.Clamp((aliveCount - 1) / Math.max(1, this.totalPlayers - 1), 0, 1);
    let targetScale = 1 + collapseProgress * 0.52;
    if (this.finalDuelStarted) {
      targetScale = Math.max(targetScale, 1.58);
    }
    return clampNumber(targetScale, 1, 1.72);
  }

  applyActorScale(actor, targetScale) {
    if (!actor.sprite?.body) {
      return;
    }

    const currentScale = actor.currentScale || 1;
    if (Math.abs(targetScale - currentScale) < 0.015) {
      return;
    }

    const ratio = targetScale / currentScale;
    MatterBody.scale(actor.sprite.body, ratio, ratio);
    actor.sprite.setScale(targetScale);
    actor.currentScale = targetScale;
    actor.labelOffset = actor.baseLabelOffset * (1 + (targetScale - 1) * 0.92);

    if (actor.label) {
      actor.label.setScale(1 + (targetScale - 1) * 0.16);
    }

    this.drawHealthBar(actor);
  }

  ensureHealthBar(actor) {
    if (!actor.healthBarGraphic) {
      actor.healthBarGraphic = this.add.graphics().setDepth(59);
    }
  }

  drawHealthBar(actor) {
    if (!actor.healthBarGraphic) {
      return;
    }

    if (!this.finalDuelStarted || !actor.sprite?.active || actor.health <= 0) {
      actor.healthBarGraphic.clear();
      return;
    }

    const barWidth = Math.max(110, Math.round(this.playerRadius * actor.currentScale * 3.9));
    const barHeight = Math.max(12, Math.round(12 + actor.currentScale * 2));
    const x = actor.sprite.x - barWidth / 2;
    const y = actor.sprite.y - this.playerRadius * actor.currentScale - 34;
    const innerPadding = 2;
    const fillWidth = Math.max(0, (barWidth - innerPadding * 2) * (actor.health / Math.max(1, actor.maxHealth)));
    const radius = barHeight / 2;
    const graphics = actor.healthBarGraphic;

    graphics.clear();
    graphics.fillStyle(0x000000, 0.48);
    graphics.fillRoundedRect(x, y, barWidth, barHeight, radius);
    graphics.fillStyle(0xffffff, 0.92);
    graphics.fillRoundedRect(x + innerPadding, y + innerPadding, fillWidth, barHeight - innerPadding * 2, radius);
    graphics.lineStyle(2, 0xffffff, 0.8);
    graphics.strokeRoundedRect(x, y, barWidth, barHeight, radius);
  }

  stabilizeWinnerSprite(winner, x, y) {
    if (!winner?.sprite) {
      return;
    }

    winner.sprite
      .setOrigin(0.5)
      .setPosition(x, y)
      .setDepth(52)
      .setAlpha(1)
      .setScale(winner.currentScale || 1)
      .setRotation(0)
      .setAngle(0)
      .setFlip(false, false)
      .clearTint();
  }

  moveWinnerToCenter(winner) {
    if (!winner) {
      return;
    }

    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;
    const startX = winner.sprite?.x ?? winner.lastPosition?.x ?? centerX;
    const startY = winner.sprite?.y ?? winner.lastPosition?.y ?? centerY;

    if (winner.sprite?.body) {
      this.matter.world.remove(winner.sprite.body);
    }

    if (!winner.sprite || !winner.sprite.active) {
      winner.sprite = this.add.image(startX, startY, winner.textureKey).setDepth(52);
    } else {
      winner.sprite.setDepth(52);
    }

    this.stabilizeWinnerSprite(winner, startX, startY);
    winner.healthBarGraphic?.clear();

    this.tweens.add({
      targets: winner.sprite,
      x: centerX,
      y: centerY,
      duration: WINNER_REVEAL_MS,
      ease: "Cubic.Out",
      scaleX: (winner.currentScale || 1) * 1.12,
      scaleY: (winner.currentScale || 1) * 1.12,
      onComplete: () => {
        this.stabilizeWinnerSprite(winner, centerX, centerY);
        winner.lastPosition = { x: centerX, y: centerY };
      },
    });

    if (this.showLabels && winner.label) {
      winner.label.setDepth(54);
      winner.label
        .setOrigin(0.5)
        .setPosition(startX, startY + winner.labelOffset)
        .setAngle(0)
        .setRotation(0)
        .setAlpha(1);
      this.tweens.add({
        targets: winner.label,
        x: centerX,
        y: centerY + winner.labelOffset,
        duration: WINNER_REVEAL_MS,
        ease: "Cubic.Out",
        onComplete: () => {
          winner.label
            .setOrigin(0.5)
            .setPosition(centerX, centerY + winner.labelOffset)
            .setAngle(0)
            .setRotation(0)
            .setAlpha(1);
        },
      });
    }
  }

  flashFinalDuelBanner() {
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "FINAL BATTLE", {
        color: "#ffffff",
        fontFamily: '"Avenir Next", "Montserrat", sans-serif',
        fontSize: `${Math.max(28, Math.round(this.playerRadius * 1.2))}px`,
        fontStyle: "800",
        letterSpacing: 10,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScale(0.92)
      .setDepth(62);

    this.tweens.add({
      targets: title,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 380,
      ease: "Cubic.Out",
    });

    this.tweens.add({
      targets: title,
      alpha: 0,
      delay: 980,
      duration: 360,
      ease: "Quad.Out",
      onComplete: () => title.destroy(),
    });
  }

  playWinnerCelebration(winner) {
    if (!winner || this.winnerCelebrationStarted) {
      return;
    }

    this.winnerCelebrationStarted = true;
    window.__battleState.celebrating = true;
    this.flashArena(0xffffff, 0.18, 320);
    this.cameraKick(0.006, 180);
    this.audio?.playWinner();

    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;
    const winnerRadius = this.playerRadius * (winner.currentScale || 1);
    const glow = this.add.circle(centerX, centerY, winnerRadius * 1.18, 0xffffff, 0.08).setDepth(46);
    const core = this.add.circle(centerX, centerY, winnerRadius * 0.94, 0xffffff, 0.05).setDepth(47);
    const ringA = this.add.circle(centerX, centerY, winnerRadius * 0.92).setStrokeStyle(3, 0xffffff, 0.8).setDepth(48);
    const ringB = this.add.circle(centerX, centerY, winnerRadius * 0.92).setStrokeStyle(2, 0xffffff, 0.45).setDepth(48);
    const title = this.add
      .text(centerX, centerY - winnerRadius * 2.5, "WINNER", {
        color: "#ffffff",
        fontFamily: '"Avenir Next", "Montserrat", sans-serif',
        fontSize: `${Math.max(18, Math.round(winnerRadius * 0.62))}px`,
        fontStyle: "800",
        letterSpacing: 10,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(58);

    let subtitle = null;
    if (!this.showLabels) {
      subtitle = this.add
        .text(centerX, centerY + winnerRadius * 1.6, `@${shorten(winner.name, 18)}`, {
          color: "rgba(255, 255, 255, 0.86)",
          fontFamily: '"Avenir Next", "Montserrat", sans-serif',
          fontSize: `${Math.max(16, Math.round(winnerRadius * 0.48 * NAME_SCALE))}px`,
          fontStyle: "700",
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(58);
    }

    winner.sprite.setDepth(56);
    this.stabilizeWinnerSprite(winner, centerX, centerY);
    this.tweens.add({
      targets: winner.sprite,
      scaleX: (winner.currentScale || 1) * 1.18,
      scaleY: (winner.currentScale || 1) * 1.18,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });

    this.tweens.add({
      targets: glow,
      scaleX: 1.34,
      scaleY: 1.34,
      alpha: { from: 0.1, to: 0.22 },
      duration: 760,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });

    this.tweens.add({
      targets: core,
      scaleX: 1.18,
      scaleY: 1.18,
      alpha: { from: 0.12, to: 0.03 },
      duration: 920,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });

    this.tweens.add({
      targets: ringA,
      scaleX: 2.18,
      scaleY: 2.18,
      alpha: { from: 0.85, to: 0 },
      duration: 1400,
      repeat: -1,
      ease: "Cubic.Out",
    });

    this.tweens.add({
      targets: ringB,
      scaleX: 2.55,
      scaleY: 2.55,
      alpha: { from: 0.52, to: 0 },
      duration: 1400,
      repeat: -1,
      delay: 260,
      ease: "Cubic.Out",
    });

    this.tweens.add({
      targets: title,
      alpha: 1,
      y: title.y - 14,
      duration: 520,
      ease: "Cubic.Out",
    });

    if (subtitle) {
      this.tweens.add({
        targets: subtitle,
        alpha: 1,
        y: subtitle.y - 10,
        duration: 520,
        ease: "Cubic.Out",
      });
    }

    const particleCount = Math.max(0, Math.round(18 * FX_INTENSITY));
    for (let index = 0; index < particleCount; index += 1) {
      const angle = (Math.PI * 2 * index) / Math.max(1, particleCount) + this.random() * 0.12;
      const dot = this.add
        .circle(centerX, centerY, 2 + this.random() * 3.4, 0xffffff, 0.95)
        .setDepth(57);
      const travel = winnerRadius * (1.8 + this.random() * 1.2);
      this.tweens.add({
        targets: dot,
        x: centerX + Math.cos(angle) * travel,
        y: centerY + Math.sin(angle) * travel,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 900 + this.random() * 260,
        ease: "Cubic.Out",
        onComplete: () => dot.destroy(),
      });
    }
  }
}

function shorten(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function getInitials(value) {
  const parts = value
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const initials = parts.map((part) => part[0].toUpperCase()).join("").slice(0, 2);
  return initials || "IG";
}

await startBattle();

async function startBattle() {
  const players = await loadPlayers();

  if (!players.length) {
    announce("No players available. Generate battle/players.json first.", true);
    setResult(null, "", true);
    markBattleReady();
    markBattleFinished();
    return;
  }

  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: stageElement,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#000000",
    transparent: false,
    render: {
      antialias: true,
      pixelArt: false,
    },
    physics: {
      default: "matter",
      matter: {
        debug: false,
        gravity: { x: 0, y: 0 },
        enableSleep: false,
      },
    },
    scene: [new BattleScene(players)],
  });

  window.__battleGame = game;
}
