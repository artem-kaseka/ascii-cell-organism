/*
 * SOMATYPE // 01 — Original Interactive ASCII Cell Organism
 *
 * A unified bioluminescent typographic creature driven by a per-cell shader
 * function:
 *
 *   main(x, y, t, pointer) -> { glyph, color }
 *
 * Composited living systems:
 *   1. Whole-organism breathing (asymmetric inhale/exhale radius, density, luminance)
 *   2. Traveling typographic wavefronts (radial peristalsis + cross-current interference)
 *   3. Decaying & diffusing glyph trails (pointer streaks, flock wakes, cytoplasmic afterglow)
 *   4. Cursor-attracted symbiotic flock (54 directional zooid agents with orbital swirl)
 *   5. Pulsing heartbeat glyph field (lub-dub cardiac core radiating pressure rings)
 *
 * Controls (live mode):
 *   Keys 1-5   Switch organism preset
 *   Pointer    Attract flock, carve trails, locally warp membrane
 *   Space      Pause / resume
 *   D          Toggle demo autopilot pointer
 *   R          Reset & re-seed organism
 *
 * Deterministic capture API:
 *   window.__organism.enableCaptureMode()
 *   window.__organism.renderFrame(frameIndex)  // pure function of frameIndex at 60fps
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants & Deterministic Seeding
  // ---------------------------------------------------------------------------
  const FPS = 60;
  const DT = 1 / FPS;
  const PREWARM_FRAMES = 108; // 1.8s warm-up so frame 0 starts alive with wakes & waves
  const BASE_SEED = 0x50a7c311;
  const FLOCK_COUNT = 54;
  const CAPTURE_DURATION_SEC = 15.0;
  const CAPTURE_TOTAL_FRAMES = Math.round(CAPTURE_DURATION_SEC * FPS); // 900 frames
  const LUT_STOPS = 8; // 6 layers x 8 stops = 48 phosphor tones (smooth + long horizontal runs)

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function nextRand() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, u) {
    return a + (b - a) * u;
  }

  function smoothstep(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function lerpRGB(c0, c1, u) {
    const t = clamp(u, 0, 1);
    return [
      Math.round(c0[0] + (c1[0] - c0[0]) * t),
      Math.round(c0[1] + (c1[1] - c0[1]) * t),
      Math.round(c0[2] + (c1[2] - c0[2]) * t),
    ];
  }

  function rgbStr(c) {
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  // ---------------------------------------------------------------------------
  // 5 Original Dark-Terminal Presets
  // ---------------------------------------------------------------------------
  const PRESETS = [
    {
      id: 1,
      code: '01',
      name: 'PHOSPHOR CNIDARIA',
      subtitle: 'ABYSSAL BIOLUMINESCENCE',
      bg: [4, 9, 10],
      vignette: [11, 28, 30],
      coreGlow: [74, 245, 198],
      substrateRamp: [[15, 36, 38], [32, 86, 80], [64, 152, 134]],
      bodyRamp: [[20, 72, 68], [46, 192, 152], [148, 252, 218]],
      coreRamp: [[82, 224, 182], [192, 255, 236], [246, 255, 252]],
      waveRamp: [[34, 142, 134], [94, 236, 214], [214, 255, 246]],
      trailRamp: [[28, 108, 114], [88, 238, 196], [208, 255, 132]],
      flockRamp: [[118, 248, 186], [204, 255, 132], [250, 255, 228]],
      hudAccent: [110, 245, 206],
      substrateGlyphs: ' ..,:;~-',
      bodyGlyphs: ' .,:;-~+=*#%@',
      coreGlyphs: '.:-+*=80#%@',
      trailGlyphs: ' .,:;~=/\\+*o',
      crestGlyphs: '.:-~=+*x#%',
      flockGlyphs: ['>', '/', '^', '\\', '<', '/', 'v', '\\'],
      breathRate: 1.48,
      breathDepth: 0.16,
      heartHz: 1.18,
      pulseSpeed: 1.95,
      pulseWidth: 0.125,
      pulseStrength: 0.86,
      armCount: 7,
      armSharpness: 2.15,
      spiralTwist: 1.35,
      waveRadialFreq: 10.5,
      waveRadialSpeed: 2.9,
      wavePlanarFreq: 6.2,
      wavePlanarSpeed: 1.85,
      waveAngle: 0.55,
      trailDecay: 0.954,
      flockSpeed: 1.48,
      orbitRadius: 0.23,
      swirlStrength: 1.75,
    },
    {
      id: 2,
      code: '02',
      name: 'AMBER MYCELIUM',
      subtitle: 'FILAMENTOUS HYPHAE',
      bg: [10, 7, 5],
      vignette: [32, 19, 10],
      coreGlow: [255, 176, 66],
      substrateRamp: [[40, 24, 13], [96, 58, 24], [162, 102, 40]],
      bodyRamp: [[98, 50, 16], [224, 132, 36], [255, 204, 96]],
      coreRamp: [[235, 140, 42], [255, 218, 132], [255, 250, 226]],
      waveRamp: [[176, 82, 24], [250, 168, 56], [255, 236, 172]],
      trailRamp: [[142, 44, 22], [255, 114, 54], [255, 232, 142]],
      flockRamp: [[126, 236, 216], [228, 255, 230], [255, 255, 248]],
      hudAccent: [255, 184, 77],
      substrateGlyphs: " .'-:_~",
      bodyGlyphs: " .'-:_=+|/\\xX#&W",
      coreGlyphs: ':-=+xX#&W%@',
      trailGlyphs: " .,:;-~=/\\+*x",
      crestGlyphs: ".:-=|/\\+x#W",
      flockGlyphs: ['>', '/', '^', '\\', '<', '/', 'v', '\\'],
      breathRate: 1.15,
      breathDepth: 0.19,
      heartHz: 1.02,
      pulseSpeed: 1.74,
      pulseWidth: 0.145,
      pulseStrength: 0.82,
      armCount: 9,
      armSharpness: 2.6,
      spiralTwist: 2.55,
      waveRadialFreq: 9.2,
      waveRadialSpeed: 2.4,
      wavePlanarFreq: 7.4,
      wavePlanarSpeed: 2.1,
      waveAngle: -0.78,
      trailDecay: 0.964,
      flockSpeed: 1.38,
      orbitRadius: 0.26,
      swirlStrength: 1.95,
    },
    {
      id: 3,
      code: '03',
      name: 'CARDIAC CORAL',
      subtitle: 'SYSTOLIC RESONANCE',
      bg: [9, 5, 10],
      vignette: [34, 13, 26],
      coreGlow: [255, 86, 132],
      substrateRamp: [[38, 18, 36], [92, 36, 68], [160, 58, 102]],
      bodyRamp: [[108, 26, 62], [228, 60, 112], [255, 138, 168]],
      coreRamp: [[255, 96, 132], [255, 202, 192], [255, 248, 242]],
      waveRamp: [[188, 48, 102], [255, 124, 156], [255, 232, 224]],
      trailRamp: [[36, 114, 146], [96, 228, 250], [224, 252, 255]],
      flockRamp: [[108, 236, 255], [208, 250, 255], [255, 255, 255]],
      hudAccent: [255, 112, 150],
      substrateGlyphs: ' .,:;o-',
      bodyGlyphs: ' .,:;oO08#%@',
      coreGlyphs: '.:oO08#%@MW',
      trailGlyphs: ' .,:;~+*oO0',
      crestGlyphs: '.:;~+oO0#%@',
      flockGlyphs: ['>', '/', '^', '\\', '<', '/', 'v', '\\'],
      breathRate: 1.32,
      breathDepth: 0.14,
      heartHz: 1.38,
      pulseSpeed: 2.25,
      pulseWidth: 0.155,
      pulseStrength: 1.38,
      armCount: 6,
      armSharpness: 1.9,
      spiralTwist: 0.85,
      waveRadialFreq: 12.0,
      waveRadialSpeed: 3.3,
      wavePlanarFreq: 4.8,
      wavePlanarSpeed: 1.4,
      waveAngle: 0.25,
      trailDecay: 0.952,
      flockSpeed: 1.56,
      orbitRadius: 0.27,
      swirlStrength: 2.15,
    },
    {
      id: 4,
      code: '04',
      name: 'CYAN TIDE-SWARM',
      subtitle: 'HIGH-CURRENT INTERFERENCE',
      bg: [4, 7, 13],
      vignette: [11, 26, 48],
      coreGlow: [42, 214, 255],
      substrateRamp: [[16, 34, 60], [34, 84, 132], [66, 156, 214]],
      bodyRamp: [[20, 92, 148], [34, 212, 248], [164, 248, 255]],
      coreRamp: [[78, 230, 255], [202, 252, 255], [250, 255, 255]],
      waveRamp: [[34, 174, 228], [122, 244, 255], [238, 255, 255]],
      trailRamp: [[32, 134, 102], [142, 252, 126], [232, 255, 184]],
      flockRamp: [[148, 255, 124], [220, 255, 176], [252, 255, 244]],
      hudAccent: [74, 224, 255],
      substrateGlyphs: ' .,:;-~',
      bodyGlyphs: ' .,:;-=~^<>!?/|%$#M@',
      coreGlyphs: '.:=~^<>!?%$#M@',
      trailGlyphs: ' .,:;-=~^<>!/*',
      crestGlyphs: '.:-~^<>!?/%$#',
      flockGlyphs: ['>', '/', '^', '\\', '<', '/', 'v', '\\'],
      breathRate: 1.85,
      breathDepth: 0.13,
      heartHz: 1.46,
      pulseSpeed: 2.65,
      pulseWidth: 0.12,
      pulseStrength: 0.96,
      armCount: 11,
      armSharpness: 2.85,
      spiralTwist: -1.95,
      waveRadialFreq: 15.0,
      waveRadialSpeed: 4.8,
      wavePlanarFreq: 11.2,
      wavePlanarSpeed: 4.1,
      waveAngle: 1.05,
      trailDecay: 0.946,
      flockSpeed: 1.98,
      orbitRadius: 0.20,
      swirlStrength: 1.55,
    },
    {
      id: 5,
      code: '05',
      name: 'SPECTRAL X-RAY',
      subtitle: 'PHOSPHOR SKELETAL FIELD',
      bg: [5, 6, 8],
      vignette: [19, 24, 31],
      coreGlow: [192, 232, 255],
      substrateRamp: [[24, 29, 36], [64, 76, 88], [116, 132, 148]],
      bodyRamp: [[68, 80, 94], [172, 194, 212], [242, 248, 254]],
      coreRamp: [[108, 242, 214], [218, 255, 246], [255, 255, 255]],
      waveRamp: [[102, 146, 178], [204, 230, 248], [255, 248, 226]],
      trailRamp: [[46, 144, 162], [118, 242, 224], [255, 222, 142]],
      flockRamp: [[255, 206, 108], [255, 238, 184], [255, 255, 250]],
      hudAccent: [214, 234, 246],
      substrateGlyphs: " .':;-~",
      bodyGlyphs: " .':;-=~+<>()[]{}|/\\*#%0O8XWM$&@",
      coreGlyphs: '.:()[]{}*#%0O8MW@',
      trailGlyphs: " .,:;-~+*=x#%*",
      crestGlyphs: '.:-=()[]{}|*+#@',
      flockGlyphs: ['>', '/', '^', '\\', '<', '/', 'v', '\\'],
      breathRate: 1.22,
      breathDepth: 0.18,
      heartHz: 1.12,
      pulseSpeed: 2.05,
      pulseWidth: 0.138,
      pulseStrength: 1.08,
      armCount: 8,
      armSharpness: 2.3,
      spiralTwist: 1.65,
      waveRadialFreq: 11.4,
      waveRadialSpeed: 2.75,
      wavePlanarFreq: 8.0,
      wavePlanarSpeed: 2.05,
      waveAngle: -0.42,
      trailDecay: 0.958,
      flockSpeed: 1.48,
      orbitRadius: 0.24,
      swirlStrength: 2.05,
    },
  ];

  // ---------------------------------------------------------------------------
  // Scripted 15-Second Choreography (Deterministic Pointer + Preset Timeline)
  // ---------------------------------------------------------------------------
  function getScriptedState(t) {
    let presetIndex = 0;
    let nx = 0.5;
    let ny = 0.5;

    if (t < 3.0) {
      // 0-3s: Preset 1, pointer glides in from upper-left, arches across mantle, curls down
      presetIndex = 0;
      const u = clamp(t / 3.0, 0, 1);
      const ease = u * u * (3 - 2 * u);
      nx = lerp(0.18, 0.74, ease) + 0.08 * Math.sin(u * Math.PI * 2.0);
      ny = 0.34 + 0.26 * Math.sin(u * Math.PI * 1.18 - 0.30) + 0.05 * Math.cos(u * Math.PI * 3.0);
    } else if (t < 6.0) {
      // 3-6s: Preset 2, pointer sweeps a wide graceful S-curve across the filaments
      presetIndex = 1;
      const u = clamp((t - 3.0) / 3.0, 0, 1);
      const a = u * Math.PI * 2.0;
      nx = 0.50 + 0.31 * Math.cos(a * 0.85 + 0.45);
      ny = 0.50 + 0.26 * Math.sin(a * 1.35 + 0.60);
    } else if (t < 9.0) {
      // 6-9s: Preset 3, heartbeat pulse emphasized, pointer orbits the beating core
      presetIndex = 2;
      const u = clamp((t - 6.0) / 3.0, 0, 1);
      const angle = -0.35 + u * Math.PI * 2.9;
      const radX = lerp(0.28, 0.20, 0.5 - 0.5 * Math.cos(u * Math.PI * 2.0));
      const radY = lerp(0.30, 0.23, 0.5 - 0.5 * Math.cos(u * Math.PI * 2.0));
      nx = 0.50 + radX * Math.cos(angle);
      ny = 0.50 + radY * Math.sin(angle);
    } else if (t < 12.0) {
      // 9-12s: Preset 4, faster waves / denser glyphs, pointer darts energetically across quadrants
      presetIndex = 3;
      const u = clamp((t - 9.0) / 3.0, 0, 1);
      const segs = [
        [0.72, 0.34],
        [0.24, 0.68],
        [0.34, 0.25],
        [0.78, 0.66],
        [0.54, 0.30],
      ];
      const scaled = u * (segs.length - 1);
      const idx = Math.min(segs.length - 2, Math.floor(scaled));
      const f = scaled - idx;
      const s = f * f * (3 - 2 * f);
      const p0 = segs[idx];
      const p1 = segs[idx + 1];
      const whip = Math.sin(f * Math.PI) * 0.065 * (idx % 2 === 0 ? 1 : -1);
      nx = lerp(p0[0], p1[0], s) + whip;
      ny = lerp(p0[1], p1[1], s) - whip * 0.7;
    } else {
      // 12-15s: Preset 5, ascending spiral flourish into a luminous living hold
      presetIndex = 4;
      const u = clamp((t - 12.0) / 3.0, 0, 1);
      const moveU = clamp(u / 0.65, 0, 1);
      const ease = 1 - Math.pow(1 - moveU, 3);
      const angle = -1.35 + ease * Math.PI * 2.35;
      const radius = lerp(0.31, 0.13, ease);
      const holdDrift = u > 0.65 ? (u - 0.65) : 0;
      nx = 0.52 + radius * Math.cos(angle) + 0.018 * Math.sin(holdDrift * 6.0);
      ny = 0.48 + radius * 1.12 * Math.sin(angle) + 0.015 * Math.cos(holdDrift * 5.0);
    }

    return { presetIndex, nx, ny };
  }

  // ---------------------------------------------------------------------------
  // Heartbeat Waveform (Lub-Dub Double Pulse)
  // ---------------------------------------------------------------------------
  function computeHeartbeat(t, heartHz) {
    const phase = ((t * heartHz) % 1 + 1) % 1;
    const lub = Math.exp(-Math.pow((phase - 0.08) / 0.042, 2));
    const dub = 0.64 * Math.exp(-Math.pow((phase - 0.23) / 0.052, 2));
    return {
      phase,
      lub,
      dub,
      beat: clamp(lub + dub, 0, 1.25),
    };
  }

  // ---------------------------------------------------------------------------
  // Organism Engine
  // ---------------------------------------------------------------------------
  class AsciiCellOrganism {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });

      // Grid dimensions (exact 160x60 at 1920x1080 -> 12x18 cells)
      this.cols = 160;
      this.rows = 60;
      this.cellW = 12;
      this.cellH = 18;
      this.width = 1920;
      this.height = 1080;
      this.aspect = 16 / 9;

      // Mode flags
      this.captureMode = false;
      this.paused = false;
      this.demoPointer = false;
      this.livePointerActive = false;

      // Simulation clock & deterministic frame counter
      this.simFrame = -1;
      this.t = 0;

      // Preset morph state
      this.activePresetIdx = 0;
      this.fromPresetIdx = 0;
      this.morph = 1.0;
      this.transitionFlash = 0.0;

      // Pointer state
      this.pointer = {
        nx: 0.25,
        ny: 0.35,
        wx: -0.8,
        wy: -0.3,
        prevWx: -0.8,
        prevWy: -0.3,
        vx: 0,
        vy: 0,
        speed: 0,
        active: 1.0,
      };
      this.targetPointer = { nx: 0.5, ny: 0.5 };

      // Core organism coordinates & frame-cached globals
      this.coreX = 0;
      this.coreY = 0;
      this.breath = 0.5;
      this.heart = { phase: 0, lub: 0, dub: 0, beat: 0 };

      // Grid buffers
      this.trailEnergy = null;
      this.trailTmp = null;
      this.trailSource = null;
      this.flockEnergy = null;
      this.flockDir = null;
      this.flockHead = null;
      this.cellNoise = null;
      this.agents = [];

      // Precomputed per-frame LUT & horizontal run buckets (minimizes fillStyle + fillText calls)
      this.lut = new Array(6 * LUT_STOPS);
      this.lutKey = '';
      this.buckets = new Array(6 * LUT_STOPS);
      for (let i = 0; i < this.buckets.length; i++) {
        this.buckets[i] = [];
      }
      this._cellResult = { glyph: ' ', color: '#000000', bucketIdx: 0 };
      this.p = {};
      this.cachedFontKey = '';
      this.cachedFontStr = '';
      this.cachedLetterSpacing = '0px';
      this.cachedGlyphOffsetX = 0;

      this._allocGrid(160, 60);
      this.resetSimulation();
    }

    _allocGrid(cols, rows) {
      this.cols = cols;
      this.rows = rows;
      const n = cols * rows;
      this.trailEnergy = new Float32Array(n);
      this.trailTmp = new Float32Array(n);
      this.trailSource = new Float32Array(n);
      this.flockEnergy = new Float32Array(n);
      this.flockDir = new Uint8Array(n);
      this.flockHead = new Uint8Array(n);
      this.cellNoise = new Float32Array(n);

      const rng = mulberry32(BASE_SEED ^ 0x9e3779b9);
      for (let i = 0; i < n; i++) {
        this.cellNoise[i] = rng();
      }
    }

    resize(w, h, forceFixed1080 = false) {
      if (forceFixed1080) {
        this.width = 1920;
        this.height = 1080;
        this.cellW = 12;
        this.cellH = 18;
        this.canvas.width = 1920;
        this.canvas.height = 1080;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.aspect = 16 / 9;
        this.cachedFontKey = '';
        if (this.cols !== 160 || this.rows !== 60) {
          this._allocGrid(160, 60);
          this.resetSimulation();
        }
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.width = Math.max(320, Math.floor(w));
      this.height = Math.max(240, Math.floor(h));
      this.canvas.width = Math.floor(this.width * dpr);
      this.canvas.height = Math.floor(this.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const targetCellW = this.width >= 1600 ? 12 : this.width >= 1100 ? 11 : 10;
      const targetCellH = Math.round(targetCellW * 1.5);
      const newCols = Math.max(64, Math.floor(this.width / targetCellW));
      const newRows = Math.max(30, Math.floor(this.height / targetCellH));
      this.cellW = this.width / newCols;
      this.cellH = this.height / newRows;
      this.aspect = this.width / this.height;
      this.cachedFontKey = '';

      if (newCols !== this.cols || newRows !== this.rows) {
        this._allocGrid(newCols, newRows);
        this.resetSimulation();
      }
    }

    _toWorld(nx, ny) {
      return [
        (nx - 0.5) * 2 * this.aspect,
        (ny - 0.5) * 2,
      ];
    }

    _worldToCell(wx, wy) {
      const cx = (wx / (2 * this.aspect) + 0.5) * this.cols;
      const cy = (wy / 2 + 0.5) * this.rows;
      return [cx, cy];
    }

    resetSimulation() {
      const rng = mulberry32(BASE_SEED);
      this.trailEnergy.fill(0);
      this.trailTmp.fill(0);
      this.trailSource.fill(0);
      this.flockEnergy.fill(0);
      this.flockDir.fill(0);
      this.flockHead.fill(0);

      const initScript = getScriptedState(0);
      const [iwx, iwy] = this._toWorld(initScript.nx, initScript.ny);

      this.agents = [];
      for (let i = 0; i < FLOCK_COUNT; i++) {
        const ang = (i / FLOCK_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.4;
        const rad = 0.22 + rng() * 0.52;
        const speed = 0.5 + rng() * 0.55;
        this.agents.push({
          x: iwx * 0.55 + Math.cos(ang) * rad * 1.15,
          y: iwy * 0.55 + Math.sin(ang) * rad * 0.85,
          vx: -Math.sin(ang) * speed,
          vy: Math.cos(ang) * speed,
          phase: rng() * Math.PI * 2,
          bias: 0.78 + rng() * 0.46,
          orbitSign: i % 5 === 0 ? -0.65 : 1.0,
        });
      }

      this.activePresetIdx = 0;
      this.fromPresetIdx = 0;
      this.morph = 1.0;
      this.transitionFlash = 0.0;
      this.simFrame = -PREWARM_FRAMES;
      this.t = -PREWARM_FRAMES * DT;

      this.pointer.nx = initScript.nx;
      this.pointer.ny = initScript.ny;
      this.pointer.wx = iwx;
      this.pointer.wy = iwy;
      this.pointer.prevWx = iwx;
      this.pointer.prevWy = iwy;
      this.pointer.vx = 0;
      this.pointer.vy = 0;
      this.pointer.speed = 0;

      // Pre-warm so frame 0 has active flock orbits, curved trails, and flowing waves
      for (let k = 0; k < PREWARM_FRAMES; k++) {
        const warmT = (k - PREWARM_FRAMES) * DT;
        const u = k / PREWARM_FRAMES;
        const ease = u * u * (3 - 2 * u);
        const pnx = lerp(0.08, initScript.nx, ease);
        const pny = lerp(0.52, initScript.ny, ease);
        this._stepOneFrame(warmT, pnx, pny, 0);
      }
      this.simFrame = -1;
    }

    setPreset(index) {
      const clamped = clamp(index, 0, PRESETS.length - 1);
      if (clamped !== this.activePresetIdx) {
        this.fromPresetIdx = this.activePresetIdx;
        this.activePresetIdx = clamped;
        this.morph = 0.0;
        this.transitionFlash = 1.0;
      }
    }

    _updateMergedParams() {
      const a = PRESETS[this.fromPresetIdx];
      const b = PRESETS[this.activePresetIdx];
      const u = smoothstep(0, 1, this.morph);
      const p = this.p;

      p.bg = lerpRGB(a.bg, b.bg, u);
      p.vignette = lerpRGB(a.vignette, b.vignette, u);
      p.coreGlow = lerpRGB(a.coreGlow, b.coreGlow, u);
      p.hudAccent = lerpRGB(a.hudAccent, b.hudAccent, u);

      p.breathRate = lerp(a.breathRate, b.breathRate, u);
      p.breathDepth = lerp(a.breathDepth, b.breathDepth, u);
      p.heartHz = lerp(a.heartHz, b.heartHz, u);
      p.pulseSpeed = lerp(a.pulseSpeed, b.pulseSpeed, u);
      p.pulseWidth = lerp(a.pulseWidth, b.pulseWidth, u);
      p.pulseStrength = lerp(a.pulseStrength, b.pulseStrength, u);
      p.armCount = lerp(a.armCount, b.armCount, u);
      p.armSharpness = lerp(a.armSharpness, b.armSharpness, u);
      p.spiralTwist = lerp(a.spiralTwist, b.spiralTwist, u);
      p.waveRadialFreq = lerp(a.waveRadialFreq, b.waveRadialFreq, u);
      p.waveRadialSpeed = lerp(a.waveRadialSpeed, b.waveRadialSpeed, u);
      p.wavePlanarFreq = lerp(a.wavePlanarFreq, b.wavePlanarFreq, u);
      p.wavePlanarSpeed = lerp(a.wavePlanarSpeed, b.wavePlanarSpeed, u);
      p.waveAngle = lerp(a.waveAngle, b.waveAngle, u);
      p.waveCosA = Math.cos(p.waveAngle);
      p.waveSinA = Math.sin(p.waveAngle);
      p.armCountInt = Math.round(p.armCount);
      p.trailDecay = lerp(a.trailDecay, b.trailDecay, u);
      p.flockSpeed = lerp(a.flockSpeed, b.flockSpeed, u);
      p.orbitRadius = lerp(a.orbitRadius, b.orbitRadius, u);
      p.swirlStrength = lerp(a.swirlStrength, b.swirlStrength, u);

      const gSrc = u < 0.35 ? a : b;
      p.substrateGlyphs = gSrc.substrateGlyphs;
      p.bodyGlyphs = gSrc.bodyGlyphs;
      p.coreGlyphs = gSrc.coreGlyphs;
      p.trailGlyphs = gSrc.trailGlyphs;
      p.crestGlyphs = gSrc.crestGlyphs;
      p.flockGlyphs = gSrc.flockGlyphs;
      p.presetMeta = b;

      const qMorph = u >= 0.999 ? 100 : Math.round(u * 100);
      const nextKey = `${this.fromPresetIdx}:${this.activePresetIdx}:${qMorph}`;
      if (nextKey !== this.lutKey) {
        this.lutKey = nextKey;
        this._buildColorLUT(a, b, u);
      }
    }

    _buildColorLUT(a, b, u) {
      const layers = [
        'substrateRamp',
        'bodyRamp',
        'coreRamp',
        'waveRamp',
        'trailRamp',
        'flockRamp',
      ];
      for (let li = 0; li < layers.length; li++) {
        const key = layers[li];
        const rA = a[key];
        const rB = b[key];
        const c0 = lerpRGB(rA[0], rB[0], u);
        const c1 = lerpRGB(rA[1], rB[1], u);
        const c2 = lerpRGB(rA[2], rB[2], u);

        for (let s = 0; s < LUT_STOPS; s++) {
          const frac = s / (LUT_STOPS - 1);
          const col = frac < 0.55
            ? lerpRGB(c0, c1, frac / 0.55)
            : lerpRGB(c1, c2, (frac - 0.55) / 0.45);
          this.lut[li * LUT_STOPS + s] = rgbStr(col);
        }
      }
    }

    _depositTrailSegment(wx0, wy0, wx1, wy1, radiusCells, amount, sourceVal) {
      const [x0, y0] = this._worldToCell(wx0, wy0);
      const [x1, y1] = this._worldToCell(wx1, wy1);
      const dx = x1 - x0;
      const dy = y1 - y0;
      const dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(dist * 1.4));
      const rCeil = Math.ceil(radiusCells);
      const r2 = radiusCells * radiusCells;
      const cols = this.cols;
      const rows = this.rows;
      const trail = this.trailEnergy;
      const src = this.trailSource;

      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        const cx = x0 + dx * f;
        const cy = y0 + dy * f;
        const ix0 = Math.max(0, Math.floor(cx - rCeil));
        const ix1 = Math.min(cols - 1, Math.ceil(cx + rCeil));
        const iy0 = Math.max(0, Math.floor(cy - rCeil));
        const iy1 = Math.min(rows - 1, Math.ceil(cy + rCeil));

        for (let iy = iy0; iy <= iy1; iy++) {
          const ddy = iy + 0.5 - cy;
          const rowOff = iy * cols;
          for (let ix = ix0; ix <= ix1; ix++) {
            const ddx = ix + 0.5 - cx;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 < r2) {
              const falloff = 1 - Math.sqrt(d2) / radiusCells;
              const add = amount * falloff * falloff;
              const idx = rowOff + ix;
              trail[idx] = Math.min(1.45, trail[idx] + add);
              src[idx] = lerp(src[idx], sourceVal, clamp(add * 1.9, 0, 1));
            }
          }
        }
      }
    }

    _stepOneFrame(t, ptrNx, ptrNy, desiredPresetIdx) {
      if (desiredPresetIdx !== null && desiredPresetIdx !== undefined) {
        this.setPreset(desiredPresetIdx);
      }

      this.t = t;
      if (this.morph < 1.0) {
        this.morph = Math.min(1.0, this.morph + DT / 0.36);
      }
      if (this.transitionFlash > 0) {
        this.transitionFlash = Math.max(0, this.transitionFlash - DT * 2.4);
      }

      this._updateMergedParams();
      const p = this.p;

      // Update pointer state
      const [nwx, nwy] = this._toWorld(ptrNx, ptrNy);
      this.pointer.prevWx = this.pointer.wx;
      this.pointer.prevWy = this.pointer.wy;
      this.pointer.nx = ptrNx;
      this.pointer.ny = ptrNy;
      this.pointer.wx = nwx;
      this.pointer.wy = nwy;
      const vx = (nwx - this.pointer.prevWx) / DT;
      const vy = (nwy - this.pointer.prevWy) / DT;
      this.pointer.vx = lerp(this.pointer.vx, vx, 0.45);
      this.pointer.vy = lerp(this.pointer.vy, vy, 0.45);
      this.pointer.speed = Math.hypot(this.pointer.vx, this.pointer.vy);

      // Update breathing & heartbeat globals
      const bPhase = t * p.breathRate;
      this.breath = 0.5 + 0.5 * Math.sin(bPhase - 0.28 * Math.sin(bPhase));
      this.heart = computeHeartbeat(t, p.heartHz);

      // Organic slow drift of organism core + gentle lean toward pointer
      const leanX = clamp(this.pointer.wx, -1.2, 1.2) * 0.085;
      const leanY = clamp(this.pointer.wy, -0.9, 0.9) * 0.075;
      this.coreX = 0.11 * Math.sin(t * 0.41) + 0.05 * Math.cos(t * 0.89) + leanX;
      this.coreY = 0.07 * Math.cos(t * 0.53) + 0.03 * Math.sin(t * 1.07) + leanY;

      // 1) Diffuse and decay trail field
      const cols = this.cols;
      const rows = this.rows;
      const trail = this.trailEnergy;
      const tmp = this.trailTmp;
      const decay = p.trailDecay;

      for (let y = 0; y < rows; y++) {
        const yUp = y > 0 ? y - 1 : 0;
        const yDn = y < rows - 1 ? y + 1 : rows - 1;
        const rowOff = y * cols;
        const upOff = yUp * cols;
        const dnOff = yDn * cols;
        for (let x = 0; x < cols; x++) {
          const xL = x > 0 ? x - 1 : 0;
          const xR = x < cols - 1 ? x + 1 : cols - 1;
          const idx = rowOff + x;
          const c = trail[idx];
          const avg = 0.25 * (trail[rowOff + xL] + trail[rowOff + xR] + trail[upOff + x] + trail[dnOff + x]);
          const val = (c * 0.89 + avg * 0.11) * decay;
          tmp[idx] = val < 0.004 ? 0 : val;
        }
      }
      this.trailEnergy = tmp;
      this.trailTmp = trail;

      // 2) Pointer deposits rich luminous ribbon wake
      const pBoost = clamp(0.36 + this.pointer.speed * 0.48, 0.34, 1.25);
      const pRadius = clamp(2.3 + this.pointer.speed * 0.72, 2.2, 3.8);
      this._depositTrailSegment(
        this.pointer.prevWx,
        this.pointer.prevWy,
        this.pointer.wx,
        this.pointer.wy,
        pRadius,
        0.54 * pBoost,
        0.12
      );

      // 3) Step symbiotic flock (boids + pointer attraction + orbital swirl)
      this.flockEnergy.fill(0);
      this.flockHead.fill(0);

      const agents = this.agents;
      const count = agents.length;
      const maxSpeed = p.flockSpeed;
      const orbitR = p.orbitRadius;
      const swirlK = p.swirlStrength;
      const aspectLim = this.aspect * 0.96;

      for (let i = 0; i < count; i++) {
        const ag = agents[i];
        let sepX = 0, sepY = 0;
        let aliX = 0, aliY = 0;
        let cohX = 0, cohY = 0;
        let nCount = 0;

        for (let j = 0; j < count; j++) {
          if (i === j) continue;
          const other = agents[j];
          const dx = ag.x - other.x;
          const dy = ag.y - other.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 0.08 && d2 > 1e-6) {
            const inv = 1 / Math.sqrt(d2);
            if (d2 < 0.017) {
              const push = (0.132 - Math.sqrt(d2)) * 8.4;
              sepX += dx * inv * push;
              sepY += dy * inv * push;
            }
            aliX += other.vx;
            aliY += other.vy;
            cohX += other.x;
            cohY += other.y;
            nCount++;
          }
        }

        let ax = 0;
        let ay = 0;

        if (nCount > 0) {
          ax += sepX * 1.45;
          ay += sepY * 1.45;
          ax += (aliX / nCount - ag.vx) * 1.15;
          ay += (aliY / nCount - ag.vy) * 1.15;
          ax += (cohX / nCount - ag.x) * 0.85;
          ay += (cohY / nCount - ag.y) * 0.85;
        }

        // Pointer attraction + orbital swirl
        const toPx = this.pointer.wx - ag.x;
        const toPy = this.pointer.wy - ag.y;
        const pDist = Math.hypot(toPx, toPy) + 1e-5;
        const dirPx = toPx / pDist;
        const dirPy = toPy / pDist;

        const radialErr = pDist - orbitR * ag.bias;
        const pull = clamp(radialErr * 4.4, -1.7, 4.4);
        ax += dirPx * pull;
        ay += dirPy * pull;

        const swirlFalloff = Math.exp(-Math.pow((pDist - orbitR) / 0.50, 2));
        const tangX = -dirPy * ag.orbitSign;
        const tangY = dirPx * ag.orbitSign;
        ax += tangX * swirlK * (0.48 + 1.35 * swirlFalloff);
        ay += tangY * swirlK * (0.48 + 1.35 * swirlFalloff);

        // Cardiac pulse outward kick when pulse ring hits agent
        const cDx = ag.x - this.coreX;
        const cDy = ag.y - this.coreY;
        const cDist = Math.hypot(cDx, cDy) + 1e-5;
        const ringR = this.heart.phase * p.pulseSpeed;
        const ringHit = Math.exp(-Math.pow((cDist - ringR) / 0.14, 2));
        ax += (cDx / cDist) * ringHit * 1.45 * p.pulseStrength;
        ay += (cDy / cDist) * ringHit * 1.45 * p.pulseStrength;

        // Individual organic flutter
        ax += Math.cos(t * 2.7 + ag.phase) * 0.36;
        ay += Math.sin(t * 2.3 + ag.phase * 1.3) * 0.36;

        // Soft viewport containment
        if (ag.x > aspectLim) ax -= (ag.x - aspectLim) * 8.5;
        if (ag.x < -aspectLim) ax -= (ag.x + aspectLim) * 8.5;
        if (ag.y > 0.94) ay -= (ag.y - 0.94) * 8.5;
        if (ag.y < -0.94) ay -= (ag.y + 0.94) * 8.5;

        const prevX = ag.x;
        const prevY = ag.y;

        ag.vx += ax * DT;
        ag.vy += ay * DT;

        const sp = Math.hypot(ag.vx, ag.vy) + 1e-5;
        const targetMax = maxSpeed * ag.bias;
        const minSp = 0.42;
        if (sp > targetMax) {
          ag.vx = (ag.vx / sp) * targetMax;
          ag.vy = (ag.vy / sp) * targetMax;
        } else if (sp < minSp) {
          ag.vx = (ag.vx / sp) * minSp;
          ag.vy = (ag.vy / sp) * minSp;
        }

        ag.x += ag.vx * DT;
        ag.y += ag.vy * DT;

        // Deposit flock wake into trail field
        this._depositTrailSegment(prevX, prevY, ag.x, ag.y, 1.65, 0.34, 0.94);

        // Stamp agent head & aura onto per-frame flock grid
        const [gx, gy] = this._worldToCell(ag.x, ag.y);
        const ix = Math.floor(gx);
        const iy = Math.floor(gy);
        const headingAngle = Math.atan2(ag.vy, ag.vx);
        const dirBin = ((Math.round(headingAngle / (Math.PI / 4)) % 8) + 8) % 8;

        if (ix >= 0 && ix < cols && iy >= 0 && iy < rows) {
          const idx = iy * cols + ix;
          this.flockHead[idx] = 1;
          this.flockDir[idx] = dirBin;
          this.flockEnergy[idx] = 1.0;

          // Subtle 1-cell aura around zooid head
          for (let oy = -1; oy <= 1; oy++) {
            const ny = iy + oy;
            if (ny < 0 || ny >= rows) continue;
            for (let ox = -1; ox <= 1; ox++) {
              if (ox === 0 && oy === 0) continue;
              const nx = ix + ox;
              if (nx < 0 || nx >= cols) continue;
              const nIdx = ny * cols + nx;
              const aura = (ox === 0 || oy === 0) ? 0.56 : 0.28;
              if (aura > this.flockEnergy[nIdx]) {
                this.flockEnergy[nIdx] = aura;
                if (!this.flockHead[nIdx]) {
                  this.flockDir[nIdx] = dirBin;
                }
              }
            }
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // Per-Cell Shader Function: main(x, y, t, pointer) -> { glyph, color }
    // -------------------------------------------------------------------------
    main(x, y, t, pointer) {
      const p = this.p;
      const idx = y * this.cols + x;

      // Normalized aspect-corrected world coordinates
      const px = ((x + 0.5) / this.cols - 0.5) * 2 * this.aspect;
      const py = ((y + 0.5) / this.rows - 0.5) * 2;

      // Local membrane warp around pointer (tactile gravity + swirl)
      const mdx = px - pointer.wx;
      const mdy = py - pointer.wy;
      const mDist2 = mdx * mdx + mdy * mdy;
      const mDist = Math.sqrt(mDist2);
      const warpEnv = Math.exp(-mDist2 * 3.4);
      const warpRipple = Math.sin(mDist * 14.0 - t * 6.0) * 0.048 * warpEnv;
      const swirlAmt = (0.15 + Math.min(0.25, pointer.speed * 0.09)) * warpEnv;

      const wx = px - mdx * (0.12 * warpEnv - warpRipple) - mdy * swirlAmt;
      const wy = py - mdy * (0.12 * warpEnv - warpRipple) + mdx * swirlAmt;

      // Coordinates relative to drifting organism core
      const dx = wx - this.coreX;
      const dy = wy - this.coreY;
      const r = Math.sqrt(dx * dx + dy * dy);
      const theta = Math.atan2(dy, dx);

      // 1. BREATHING: asymmetric inhale/exhale expands mantle & boosts tissue density
      const breath = this.breath;
      const breathScale = 1.0 + (breath - 0.5) * 2.0 * p.breathDepth;

      // 2. HEARTBEAT ORGAN & RADIATING SYSTOLIC PULSE RINGS
      const beat = this.heart.beat;
      const beatPhase = this.heart.phase;
      const coreRadius = (0.20 + 0.068 * beat) * (0.94 + 0.12 * breath);
      const valveWarp = 1.0 + 0.12 * Math.sin(theta * 3.0 + t * 2.1) + 0.07 * Math.cos(theta * 5.0 - t * 2.9);
      const rCoreNorm = r / (coreRadius * valveWarp);
      const coreEnv = smoothstep(1.38, 0.10, rCoreNorm);
      // Internal anatomical chamber texture so the beating heart has crisp pulsing ridges
      const coreChambers = 0.66 + 0.34 * Math.cos(rCoreNorm * 7.5 - t * 5.8 + 0.7 * Math.sin(theta * 4.0 + t * 1.4));
      const coreField = coreEnv * coreChambers * (0.74 + 0.52 * beat);

      // Expanding primary (LUB) and echo (DUB) cardiac pressure rings
      const ringR1 = beatPhase * p.pulseSpeed;
      const ringR2 = Math.max(0, (beatPhase - 0.15) * p.pulseSpeed);
      const ringMod = 1.0 + 0.18 * Math.sin(theta * 6.0 - t * 2.5 + r * 3.0);
      const dr1 = (r - ringR1) / p.pulseWidth;
      const ring1 = Math.exp(-dr1 * dr1) * (1.0 - beatPhase * 0.52) * ringMod;
      let ring2 = 0.0;
      if (beatPhase > 0.15) {
        const dr2 = (r - ringR2) / (p.pulseWidth * 1.15);
        ring2 = 0.58 * Math.exp(-dr2 * dr2) * (1.0 - (beatPhase - 0.15) * 0.62);
      }
      const cardiacWave = (ring1 + ring2) * p.pulseStrength;

      // 3. ORGANISM MORPHOLOGY (Mantle Bell + Cytoplasmic Ribs + Sinuous Tendrils)
      const mantleR =
        (0.62 * breathScale) +
        0.11 * Math.sin(theta * 3.0 + t * 0.85) +
        0.075 * Math.cos(theta * 5.0 - t * 1.25) +
        0.04 * Math.sin(theta * 8.0 + t * 1.85);

      const insideMantle = smoothstep(mantleR + 0.20, mantleR - 0.24, r);
      const dRim = (r - mantleR) / 0.095;
      const membraneRim = Math.exp(-dRim * dRim);

      const ribWave = 0.5 + 0.5 * Math.cos(theta * p.armCountInt + Math.sin(r * 4.5 - t * 1.6) * 0.85);
      const cellChambers = 0.5 + 0.5 * Math.sin(r * 11.5 - t * 1.5 + Math.cos(theta * 4.0 + t * 0.7) * 1.2);

      // Extending undulating tentacles / cilia across the 16:9 widescreen field
      const armSignal = Math.sin(
        theta * p.armCount +
        Math.sin(r * 3.1 - t * 2.15) * 1.35 +
        p.spiralTwist * r
      );
      const armMask = armSignal > 0 ? Math.pow(armSignal, p.armSharpness) : 0;
      const armReach = Math.exp(-Math.max(0, r - mantleR * 0.65) * 0.82);
      const tendrils = armMask * armReach * (0.80 + 0.28 * breath);

      // 4. TRAVELING TYPOGRAPHIC WAVEFRONTS (Radial Peristalsis + Planar Cross-Current)
      const radWave = 0.5 + 0.5 * Math.sin(
        r * p.waveRadialFreq - t * p.waveRadialSpeed + 0.75 * Math.sin(theta * 3.0 - t * 0.7)
      );
      const cosA = p.waveCosA;
      const sinA = p.waveSinA;
      const planCoord = wx * cosA + wy * sinA;
      const planWave = 0.5 + 0.5 * Math.sin(
        planCoord * p.wavePlanarFreq - t * p.wavePlanarSpeed + 0.65 * Math.cos((wx * -sinA + wy * cosA) * 3.4 + t * 0.9)
      );
      const waveComposite = radWave * 0.58 + planWave * 0.42;
      const waveCrest = smoothstep(0.66, 0.98, waveComposite);

      // Ambient deep-abyssal living cellular substrate across full 1920x1080 viewport
      const substrateWave = 0.5 + 0.5 * Math.sin(px * 4.6 + py * 3.4 - t * 1.2 + Math.sin(py * 5.0 + t * 0.75));
      const substrate = 0.12 + 0.16 * substrateWave * (0.65 + 0.35 * breath) + 0.34 * cardiacWave + 0.18 * waveCrest;

      // 5. TRAILS & CURSOR-ATTRACTED FLOCK
      const trail = this.trailEnergy[idx];
      const trailSrc = this.trailSource[idx];
      const flockE = this.flockEnergy[idx];
      const isFlockHead = this.flockHead[idx] === 1;

      // Subtle crisp pointer focal reticle integrated into the ASCII field
      const dPtr = (mDist - 0.058) / 0.024;
      const pointerRing = mDist < 0.14 ? Math.exp(-dPtr * dPtr) : 0.0;
      const pointerCore = mDist < 0.022 ? 1.0 : 0.0;

      // Preset transition energy bloom
      let flashBoost = 0.0;
      if (this.transitionFlash > 0.001) {
        const dFl = (r - (1.0 - this.transitionFlash) * 2.2) / 0.28;
        flashBoost = this.transitionFlash * Math.exp(-dFl * dFl);
      }

      // Combine body density
      const bodyDensity =
        insideMantle * (0.28 + 0.36 * ribWave + 0.24 * cellChambers) * (0.82 + 0.26 * breath) +
        membraneRim * (0.58 + 0.28 * waveComposite) +
        tendrils * (0.54 + 0.44 * waveComposite) +
        cardiacWave * (0.34 + 0.40 * insideMantle + 0.30 * tendrils) +
        flashBoost * 0.55;

      // Select dominant typographic layer, glyph, and LUT color stop
      // Layer indices (LUT_STOPS each): 0:substrate, 1:body, 2:core, 3:wave, 4:trail, 5:flock
      let layer = 0;
      let intensity = 0;
      let glyph = ' ';

      if (isFlockHead) {
        layer = 5;
        intensity = clamp(0.80 + 0.20 * (0.5 + 0.5 * Math.sin(t * 9.0 + x * 0.7)), 0, 1);
        glyph = p.flockGlyphs[this.flockDir[idx] & 7];
      } else if (pointerCore > 0.5) {
        layer = 5;
        intensity = 1.0;
        glyph = '+';
      } else if (coreEnv > 0.48 && coreField > 0.36) {
        layer = 2;
        intensity = clamp(coreField * 0.84 + beat * 0.22 + waveCrest * 0.12, 0.12, 0.99);
        const cg = p.coreGlyphs;
        glyph = cg[Math.min(cg.length - 1, Math.floor(intensity * cg.length))];
      } else if (flockE > 0.20 || (trail > 0.16 && trail > bodyDensity * 0.52)) {
        const wakeE = clamp(Math.max(trail * 0.95, flockE * 0.95), 0, 1);
        layer = (flockE > 0.24 || trailSrc > 0.58) ? 5 : 4;
        intensity = clamp(wakeE * 0.92 + pointerRing * 0.45, 0, 1);
        const tg = p.trailGlyphs;
        glyph = tg[Math.min(tg.length - 1, Math.floor(intensity * tg.length))];
      } else if (cardiacWave > 0.34 || (waveCrest > 0.56 && bodyDensity > 0.34)) {
        // Graduated wavefront crests & radiating heartbeat shockwaves
        layer = 3;
        const ringProfile = clamp(cardiacWave * (0.62 + 0.36 * waveComposite), 0, 1);
        intensity = clamp(Math.max(ringProfile, bodyDensity * 0.74 + waveCrest * 0.34), 0, 1);
        const crg = p.crestGlyphs;
        glyph = crg[Math.min(crg.length - 1, Math.floor(intensity * crg.length))];
      } else if (bodyDensity > 0.15) {
        layer = 1;
        intensity = clamp(bodyDensity * 0.85 + trail * 0.38 + pointerRing * 0.35, 0, 1);
        const bg = p.bodyGlyphs;
        glyph = bg[Math.min(bg.length - 1, Math.floor(intensity * bg.length))];
      } else {
        layer = 0;
        intensity = clamp(substrate + trail * 0.58 + pointerRing * 0.45, 0, 1);
        const sg = p.substrateGlyphs;
        glyph = sg[Math.min(sg.length - 1, Math.floor(intensity * sg.length))];
        if (trail > 0.06) {
          layer = 4;
          intensity = clamp(trail * 0.88 + 0.14, 0, 1);
        } else if (cardiacWave > 0.16) {
          layer = 3;
          intensity = clamp(cardiacWave * 0.72, 0, 1);
        }
      }

      // Pointer halo accent ring
      if (pointerRing > 0.52 && !isFlockHead && pointerCore < 0.5) {
        layer = 5;
        intensity = Math.max(intensity, 0.82);
        if (glyph === ' ' || glyph === '.') {
          glyph = ':';
        }
      }

      const stop = clamp(Math.floor(intensity * (LUT_STOPS - 0.001)), 0, LUT_STOPS - 1);
      const bucketIdx = layer * LUT_STOPS + stop;
      const res = this._cellResult;
      res.glyph = glyph;
      res.color = this.lut[bucketIdx];
      res.bucketIdx = bucketIdx;
      return res;
    }

    // -------------------------------------------------------------------------
    // Render Frame to Canvas 2D (Horizontal Run-Batched fillText for 60fps+ lock)
    // -------------------------------------------------------------------------
    draw() {
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;
      const p = this.p;

      // 1) Near-black dark terminal backdrop with subtle radial depth vignette
      const bgGrad = ctx.createRadialGradient(
        w * (0.5 + this.coreX / (2 * this.aspect)),
        h * (0.5 + this.coreY / 2),
        h * 0.04,
        w * 0.5,
        h * 0.5,
        w * 0.68
      );
      const vig = p.vignette;
      const bg = p.bg;
      bgGrad.addColorStop(0, `rgb(${vig[0]},${vig[1]},${vig[2]})`);
      bgGrad.addColorStop(0.55, `rgb(${Math.round((vig[0] + bg[0]) * 0.5)},${Math.round((vig[1] + bg[1]) * 0.5)},${Math.round((vig[2] + bg[2]) * 0.5)})`);
      bgGrad.addColorStop(1, `rgb(${bg[0]},${bg[1]},${bg[2]})`);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // 2) Subtle bioluminescent core glow synced to heartbeat
      const corePx = w * (0.5 + this.coreX / (2 * this.aspect));
      const corePy = h * (0.5 + this.coreY / 2);
      const glowR = h * (0.20 + 0.11 * this.heart.beat + 0.05 * this.breath);
      const gc = p.coreGlow;
      const glowGrad = ctx.createRadialGradient(corePx, corePy, 0, corePx, corePy, glowR);
      const glowAlpha = (0.11 + 0.14 * this.heart.beat) * (0.85 + 0.25 * p.pulseStrength);
      glowGrad.addColorStop(0, `rgba(${gc[0]},${gc[1]},${gc[2]},${glowAlpha.toFixed(3)})`);
      glowGrad.addColorStop(0.5, `rgba(${gc[0]},${gc[1]},${gc[2]},${(glowAlpha * 0.35).toFixed(3)})`);
      glowGrad.addColorStop(1, `rgba(${gc[0]},${gc[1]},${gc[2]},0)`);
      ctx.fillStyle = glowGrad;
      ctx.fillRect(corePx - glowR, corePy - glowR, glowR * 2, glowR * 2);

      // 3) Evaluate shader main(x, y, t, pointer) and coalesce horizontal runs per color bucket
      const cols = this.cols;
      const rows = this.rows;
      const cw = this.cellW;
      const ch = this.cellH;
      const t = this.t;
      const ptr = this.pointer;
      const buckets = this.buckets;
      for (let b = 0; b < buckets.length; b++) {
        buckets[b].length = 0;
      }

      const supportsLetterSpacing = 'letterSpacing' in ctx;
      const fontKey = `${cw.toFixed(2)}x${ch.toFixed(2)}`;
      if (this.cachedFontKey !== fontKey) {
        const fontSize = Math.max(11, Math.round(ch * 0.86));
        this.cachedFontStr = `600 ${fontSize}px 'Liberation Mono', 'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace`;
        ctx.font = this.cachedFontStr;
        if (supportsLetterSpacing) {
          ctx.letterSpacing = '0px';
          const glyphW = ctx.measureText('M').width;
          const spacing = cw - glyphW;
          this.cachedLetterSpacing = `${spacing.toFixed(3)}px`;
          this.cachedGlyphOffsetX = Math.max(0, (cw - glyphW) * 0.5);
        }
        this.cachedFontKey = fontKey;
      }

      if (supportsLetterSpacing) {
        // Coalesce contiguous cells sharing the same color bucket into string runs
        // (short space gaps stay inside the active run to cut fillText call count)
        for (let y = 0; y < rows; y++) {
          const py = y * ch + ch * 0.54;
          let runBucket = -1;
          let runStartX = 0;
          let runStr = '';
          let pendingSpaces = '';

          for (let x = 0; x < cols; x++) {
            const cell = this.main(x, y, t, ptr);
            const g = cell.glyph;
            if (g === ' ') {
              if (runBucket !== -1) {
                pendingSpaces += ' ';
                if (pendingSpaces.length > 6) {
                  buckets[runBucket].push(runStr, runStartX * cw + this.cachedGlyphOffsetX, py);
                  runBucket = -1;
                  runStr = '';
                  pendingSpaces = '';
                }
              }
              continue;
            }
            const bIdx = cell.bucketIdx;
            if (bIdx === runBucket) {
              if (pendingSpaces) {
                runStr += pendingSpaces;
                pendingSpaces = '';
              }
              runStr += g;
            } else {
              if (runBucket !== -1) {
                buckets[runBucket].push(runStr, runStartX * cw + this.cachedGlyphOffsetX, py);
              }
              runBucket = bIdx;
              runStartX = x;
              runStr = g;
              pendingSpaces = '';
            }
          }
          if (runBucket !== -1) {
            buckets[runBucket].push(runStr, runStartX * cw + this.cachedGlyphOffsetX, py);
          }
        }

        ctx.font = this.cachedFontStr;
        ctx.letterSpacing = this.cachedLetterSpacing;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        for (let b = 0; b < buckets.length; b++) {
          const list = buckets[b];
          if (list.length === 0) continue;
          ctx.fillStyle = this.lut[b];
          for (let i = 0; i < list.length; i += 3) {
            ctx.fillText(list[i], list[i + 1], list[i + 2]);
          }
        }
        ctx.letterSpacing = '0px';
      } else {
        // Fallback for older canvases without letterSpacing
        for (let y = 0; y < rows; y++) {
          const py = y * ch + ch * 0.54;
          for (let x = 0; x < cols; x++) {
            const cell = this.main(x, y, t, ptr);
            if (cell.glyph !== ' ') {
              buckets[cell.bucketIdx].push(cell.glyph, x * cw + cw * 0.5, py);
            }
          }
        }
        ctx.font = this.cachedFontStr;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let b = 0; b < buckets.length; b++) {
          const list = buckets[b];
          if (list.length === 0) continue;
          ctx.fillStyle = this.lut[b];
          for (let i = 0; i < list.length; i += 3) {
            ctx.fillText(list[i], list[i + 1], list[i + 2]);
          }
        }
      }

      // 4) Discreet monospace terminal HUD
      this._drawHUD(ctx, w, h);
    }

    _drawHUD(ctx, w, h) {
      const p = this.p;
      const meta = p.presetMeta;
      const acc = p.hudAccent;
      const bg = p.bg;
      const beat = this.heart.beat;

      const padX = 22;
      const padY = 16;

      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      // Top-left preset badge pill
      const topH = 34;
      const topW = 472;
      ctx.fillStyle = `rgba(${bg[0]},${bg[1]},${bg[2]},0.86)`;
      ctx.fillRect(padX, padY, topW, topH);
      ctx.strokeStyle = `rgba(${acc[0]},${acc[1]},${acc[2]},0.36)`;
      ctx.lineWidth = 1;
      ctx.strokeRect(padX + 0.5, padY + 0.5, topW - 1, topH - 1);

      // Pulsing heartbeat indicator dot
      const dotR = 3.6 + beat * 2.1;
      ctx.fillStyle = `rgba(${acc[0]},${acc[1]},${acc[2]},${(0.55 + 0.45 * clamp(beat, 0, 1)).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(padX + 16, padY + topH * 0.5, dotR, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = "600 13px 'Liberation Mono', 'JetBrains Mono', Menlo, Consolas, monospace";
      ctx.fillStyle = `rgba(${acc[0]},${acc[1]},${acc[2]},0.95)`;
      ctx.fillText('SOMATYPE // 01', padX + 30, padY + topH * 0.5);

      ctx.fillStyle = 'rgba(218,236,232,0.45)';
      ctx.fillText('|', padX + 150, padY + topH * 0.5);

      ctx.fillStyle = 'rgba(240,250,248,0.94)';
      ctx.fillText(`[${meta.id}] ${meta.name}`, padX + 164, padY + topH * 0.5);

      // Top-right compact preset selector indicator (1 2 3 4 5)
      const pillW = 190;
      const pillX = w - padX - pillW;
      ctx.fillStyle = `rgba(${bg[0]},${bg[1]},${bg[2]},0.84)`;
      ctx.fillRect(pillX, padY, pillW, topH);
      ctx.strokeStyle = `rgba(${acc[0]},${acc[1]},${acc[2]},0.32)`;
      ctx.strokeRect(pillX + 0.5, padY + 0.5, pillW - 1, topH - 1);

      ctx.textAlign = 'center';
      ctx.font = "600 12px 'Liberation Mono', 'JetBrains Mono', Menlo, Consolas, monospace";
      for (let i = 0; i < PRESETS.length; i++) {
        const bx = pillX + 24 + i * 35;
        const by = padY + topH * 0.5;
        const active = i === this.activePresetIdx;
        if (active) {
          ctx.fillStyle = `rgba(${acc[0]},${acc[1]},${acc[2]},0.24)`;
          ctx.fillRect(bx - 12, padY + 6, 24, topH - 12);
          ctx.strokeStyle = `rgba(${acc[0]},${acc[1]},${acc[2]},0.88)`;
          ctx.strokeRect(bx - 11.5, padY + 6.5, 23, topH - 13);
          ctx.fillStyle = `rgb(${acc[0]},${acc[1]},${acc[2]})`;
        } else {
          ctx.fillStyle = 'rgba(186,204,208,0.52)';
        }
        ctx.fillText(String(i + 1), bx, by);
      }

      // Bottom-left crisp legend pill
      const botH = 26;
      const botTop = h - padY - botH;
      const botMid = botTop + botH * 0.5;
      ctx.textAlign = 'left';
      ctx.font = "500 11px 'Liberation Mono', 'JetBrains Mono', Menlo, Consolas, monospace";
      const leftText = `KEYS 1-5 PRESETS  ·  POINTER: ATTRACT FLOCK & WARP  ·  ${meta.subtitle}`;
      const leftW = Math.ceil(ctx.measureText(leftText).width) + 22;
      ctx.fillStyle = `rgba(${bg[0]},${bg[1]},${bg[2]},0.86)`;
      ctx.fillRect(padX, botTop, leftW, botH);
      ctx.strokeStyle = `rgba(${acc[0]},${acc[1]},${acc[2]},0.24)`;
      ctx.strokeRect(padX + 0.5, botTop + 0.5, leftW - 1, botH - 1);
      ctx.fillStyle = 'rgba(214,232,234,0.78)';
      ctx.fillText(leftText, padX + 11, botMid);

      // Bottom-right crisp telemetry pill
      ctx.textAlign = 'right';
      const bpm = Math.round(p.heartHz * 60);
      const breathPct = Math.round(this.breath * 100);
      const rightText = `BPM ${String(bpm).padStart(2, '0')}  ·  BREATH ${String(breathPct).padStart(3, ' ')}%  ·  ZOOIDS ${FLOCK_COUNT}  ·  ${this.cols}x${this.rows}`;
      const rightW = Math.ceil(ctx.measureText(rightText).width) + 22;
      const rightX = w - padX - rightW;
      ctx.fillStyle = `rgba(${bg[0]},${bg[1]},${bg[2]},0.86)`;
      ctx.fillRect(rightX, botTop, rightW, botH);
      ctx.strokeStyle = `rgba(${acc[0]},${acc[1]},${acc[2]},0.24)`;
      ctx.strokeRect(rightX + 0.5, botTop + 0.5, rightW - 1, botH - 1);
      ctx.fillStyle = `rgba(${acc[0]},${acc[1]},${acc[2]},0.88)`;
      ctx.fillText(rightText, w - padX - 11, botMid);

      ctx.restore();
    }

    // -------------------------------------------------------------------------
    // Deterministic Capture API: Pure Function of frameIndex
    // -------------------------------------------------------------------------
    enableCaptureMode() {
      this.captureMode = true;
      this.resize(1920, 1080, true);
      this.resetSimulation();
    }

    renderFrame(frameIndex) {
      const target = Math.max(0, Math.floor(frameIndex));

      if (target < this.simFrame) {
        this.resetSimulation();
      }

      if (target === this.simFrame) {
        this.draw();
        return this._telemetry(target);
      }

      for (let f = this.simFrame + 1; f <= target; f++) {
        const ft = f * DT;
        const script = getScriptedState(ft);
        this._stepOneFrame(ft, script.nx, script.ny, script.presetIndex);
      }
      this.simFrame = target;
      this.draw();
      return this._telemetry(target);
    }

    _telemetry(frame) {
      return {
        frame,
        time: Number((frame * DT).toFixed(4)),
        preset: this.activePresetIdx + 1,
        presetName: PRESETS[this.activePresetIdx].name,
        pointer: [Number(this.pointer.nx.toFixed(3)), Number(this.pointer.ny.toFixed(3))],
        beat: Number(this.heart.beat.toFixed(3)),
        breath: Number(this.breath.toFixed(3)),
      };
    }

    // -------------------------------------------------------------------------
    // Live Interactive Loop (60fps fixed-step accumulator)
    // -------------------------------------------------------------------------
    startLive() {
      this.resize(window.innerWidth, window.innerHeight, false);

      let lastTs = performance.now();
      let accum = 0;
      let liveTime = 0;

      const tick = (now) => {
        if (this.captureMode) return;
        requestAnimationFrame(tick);

        if (this.paused) {
          lastTs = now;
          return;
        }

        const elapsed = Math.min(0.05, (now - lastTs) / 1000);
        lastTs = now;
        accum += elapsed;

        let stepped = false;
        while (accum >= DT) {
          liveTime += DT;
          accum -= DT;
          let pnx, pny;
          if (this.demoPointer || !this.livePointerActive) {
            const loopT = liveTime % CAPTURE_DURATION_SEC;
            const sc = getScriptedState(loopT);
            pnx = sc.nx;
            pny = sc.ny;
            if (this.demoPointer) {
              this.setPreset(sc.presetIndex);
            }
          } else {
            pnx = lerp(this.pointer.nx, this.targetPointer.nx, 0.34);
            pny = lerp(this.pointer.ny, this.targetPointer.ny, 0.34);
          }
          this._stepOneFrame(liveTime, pnx, pny, null);
          stepped = true;
        }

        if (stepped) {
          this.draw();
        }
      };

      this._stepOneFrame(0, 0.5, 0.45, 0);
      this.draw();
      requestAnimationFrame(tick);
    }
  }

  // ---------------------------------------------------------------------------
  // Bootstrap & Interactive Bindings
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('stage');
  const organism = new AsciiCellOrganism(canvas);

  window.addEventListener('resize', () => {
    if (!organism.captureMode) {
      organism.resize(window.innerWidth, window.innerHeight, false);
    }
  });

  function updatePointerFromEvent(e) {
    if (organism.captureMode) return;
    const rect = canvas.getBoundingClientRect();
    organism.targetPointer.nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    organism.targetPointer.ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    organism.livePointerActive = true;
    organism.demoPointer = false;
  }

  canvas.addEventListener('pointermove', updatePointerFromEvent);
  canvas.addEventListener('pointerdown', (e) => {
    if (organism.captureMode) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pillW = 190;
    const pillX = rect.width - 22 - pillW;
    if (y >= 16 && y <= 50 && x >= pillX && x <= pillX + pillW) {
      const idx = Math.floor((x - pillX - 6) / 35);
      if (idx >= 0 && idx < PRESETS.length) {
        organism.setPreset(idx);
        return;
      }
    }
    updatePointerFromEvent(e);
  });

  window.addEventListener('keydown', (e) => {
    if (organism.captureMode) return;
    if (e.key >= '1' && e.key <= '5') {
      organism.setPreset(Number(e.key) - 1);
    } else if (e.code === 'Space') {
      e.preventDefault();
      organism.paused = !organism.paused;
    } else if (e.key === 'd' || e.key === 'D') {
      organism.demoPointer = !organism.demoPointer;
    } else if (e.key === 'r' || e.key === 'R') {
      organism.resetSimulation();
    }
  });

  window.__organism = {
    FPS,
    TOTAL_FRAMES: CAPTURE_TOTAL_FRAMES,
    DURATION_SEC: CAPTURE_DURATION_SEC,
    PRESETS: PRESETS.map((pr) => ({ id: pr.id, name: pr.name, subtitle: pr.subtitle })),
    enableCaptureMode: () => organism.enableCaptureMode(),
    renderFrame: (frameIndex) => organism.renderFrame(frameIndex),
    setPreset: (index) => organism.setPreset(index),
    getScriptedState,
    main: (x, y, t, pointer) => organism.main(x, y, t, pointer),
    instance: organism,
  };

  const params = new URLSearchParams(window.location.search);
  if (params.get('capture') === '1') {
    organism.enableCaptureMode();
  } else {
    organism.startLive();
  }
})();
