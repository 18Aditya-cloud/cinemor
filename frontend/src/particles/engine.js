/**
 * Cinemor particle engine (plain JavaScript, no libraries).
 *
 * One fixed canvas sits behind the whole page. Every particle has two homes:
 *   1. an "ambient" position: floating up slowly at the left/right sides
 *   2. a "logo" position: a spot in the 3D logo
 * The page scroll decides `formation` (0 = all ambient, 1 = fully the logo), and each
 * particle is drawn somewhere between its two homes. Because position is a pure
 * function of scroll, the logo assembles when you scroll down and disperses when you
 * keep going, and it plays backwards too when you scroll up.
 *
 * While the logo is formed it turns slowly on its own, and you can grab it and turn it
 * yourself (mouse or touch) with momentum. A hand rises under it (see LogoStage.jsx); the
 * engine only reports how far the hand has risen, as the CSS variable --cm-hand.
 */
import { sampleLogo } from './logoSampler.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (t) => t * t * (3 - 2 * t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrap = (n, m) => ((n % m) + m) % m;

// Every tunable number is here, so behaviour can be adjusted without reading the code below.
export const SETTINGS = {
  count: { desktop: 4000, tablet: 2800, mobile: 2000 },
  minCount: 1400, // never drop below this when the device is slow
  ambientShare: 0.13, // share of particles that are visible while floating
  sideSpread: 0.36, // ambient particles stay within this fraction of the width from each edge
  formSpread: 0.45, // how staggered the arrival is (0 = all together, 1 = very staggered)
  // Where the logo forms/disperses along the LogoStage scroll (0 = stage pinned at top, 1 = pinned end)
  scroll: { begin: -0.08, formed: 0.28, holdEnd: 0.72, gone: 1.0 },
  drag: { sensitivity: 0.0085, maxPitch: 1.25 },
  // The logo floats above a hand, so it is smaller and sits in the upper part of the screen.
  logo: { widthShare: 0.5, heightShare: 0.32, min: 170, max: 420, centerY: 0.35 },
  spin: 0.55, // steady turning speed (radians per second) when nobody is dragging it
  // The hand rises and leaves along the same LogoStage scroll as `scroll` above (0 = stage pinned).
  hand: { start: -0.3, full: 0.1, leaveStart: 0.62, gone: 0.95 },
};

export function createParticleEngine({ canvas, logoSrc, stageEl = null, glowEl = null, reducedMotion = false }) {
  const ctx = canvas.getContext('2d');
  let reduced = reducedMotion;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let raf = 0;
  let lastNow = 0;
  let time = 0;
  let destroyed = false;
  let frames = 0;
  let slowFrames = 0;

  let P = null; // particle arrays, set once the logo has been sampled
  let atlas = null;
  let atlasCols = 16;
  const CELL = 32;
  let activeCount = 0;

  let formation = 0;
  let hand = 0; // 0 = hand hidden below the screen, 1 = raised under the logo
  let lastWrittenHand = -1;
  let lastWrittenFormation = -1;
  let logo = { cx: 0, cy: 0, size: 400 };
  let stageTop = null; // stage position in the document, measured once (not every frame)
  let stageHeight = 0;

  const pointer = { x: -9999, y: -9999, active: false };
  const rot = { yaw: 0, pitch: 0, vyaw: 0, vpitch: 0, dragging: false, idle: 0, lastX: 0, lastY: 0, lastT: 0, id: null };
  let grabState = 'false';

  /* ---------------------------------------------------------------- setup */

  function deviceCount() {
    const w = window.innerWidth;
    if (w < 640) return SETTINGS.count.mobile;
    if (w < 1100) return SETTINGS.count.tablet;
    return SETTINGS.count.desktop;
  }

  // One small texture holding a glowing dot for every colour used. Drawing from a
  // single texture is much faster than drawing thousands of gradients.
  function buildAtlas(data, bucketOf) {
    const sums = [];
    for (let i = 0; i < data.count; i += 1) {
      const k = bucketOf[i];
      if (!sums[k]) sums[k] = [0, 0, 0, 0];
      sums[k][0] += data.r[i];
      sums[k][1] += data.g[i];
      sums[k][2] += data.b[i];
      sums[k][3] += 1;
    }
    const total = sums.length;
    const rows = Math.ceil(total / atlasCols);
    const a = document.createElement('canvas');
    a.width = atlasCols * CELL;
    a.height = rows * CELL;
    const actx = a.getContext('2d');
    const mid = CELL / 2;
    for (let k = 0; k < total; k += 1) {
      const s = sums[k] || [255, 255, 255, 1];
      const r = Math.round(s[0] / s[3]);
      const g = Math.round(s[1] / s[3]);
      const b = Math.round(s[2] / s[3]);
      const hot = (v, amt) => Math.round(v + (255 - v) * amt);
      const ox = (k % atlasCols) * CELL;
      const oy = Math.floor(k / atlasCols) * CELL;
      const grad = actx.createRadialGradient(ox + mid, oy + mid, 0, ox + mid, oy + mid, mid);
      grad.addColorStop(0, `rgba(${hot(r, 0.7)},${hot(g, 0.7)},${hot(b, 0.7)},1)`);
      grad.addColorStop(0.14, `rgba(${hot(r, 0.35)},${hot(g, 0.35)},${hot(b, 0.35)},0.95)`);
      grad.addColorStop(0.32, `rgba(${r},${g},${b},0.5)`);
      grad.addColorStop(0.62, `rgba(${r},${g},${b},0.14)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      actx.fillStyle = grad;
      actx.fillRect(ox, oy, CELL, CELL);
    }
    return a;
  }

  function initParticles(data) {
    const n = data.count;
    const random = Math.random;

    // Group colours into a small palette (8 levels per channel).
    const keyToIndex = new Map();
    const bucket = new Uint16Array(n);
    for (let i = 0; i < n; i += 1) {
      const key = ((data.r[i] >> 5) << 6) | ((data.g[i] >> 5) << 3) | (data.b[i] >> 5);
      let index = keyToIndex.get(key);
      if (index === undefined) {
        index = keyToIndex.size;
        keyToIndex.set(key, index);
      }
      bucket[i] = index;
    }
    atlas = buildAtlas(data, bucket);

    const f32 = () => new Float32Array(n);
    P = {
      n,
      mx: data.x,
      my: data.y,
      mz: data.z,
      bucket,
      axn: f32(), // ambient x (0..1 of width)
      ayn: f32(), // ambient y (0..1 of height)
      depth: f32(), // 0.35..1, far particles are slower/smaller
      rise: f32(), // px per second upward
      aSpd: f32(),
      aPh: f32(),
      tw: f32(), // twinkle speed
      ambVis: f32(), // 0 = only appears once it starts flying to the logo
      ambSize: f32(),
      dot: f32(), // dot size once part of the logo
      delay: f32(), // 0..1 staggered start
      swirl: f32(), // -1..1 sideways bend of its flight path
    };

    for (let i = 0; i < n; i += 1) {
      const side = random() < 0.5 ? 0 : 1;
      const u = Math.pow(random(), 1.9) * SETTINGS.sideSpread;
      P.axn[i] = side ? 1 - u : u;
      P.ayn[i] = random();
      P.depth[i] = 0.35 + 0.65 * random();
      P.rise[i] = (5 + 15 * random()) * P.depth[i];
      P.aSpd[i] = 0.2 + 0.55 * random();
      P.aPh[i] = random() * TAU;
      P.tw[i] = 0.8 + 1.9 * random();
      P.ambVis[i] = random() < SETTINGS.ambientShare ? 0.5 + 0.5 * random() : 0;
      P.ambSize[i] = (9 + 9 * random()) * P.depth[i];
      P.dot[i] = 12 + 5 * random();
      P.delay[i] = random();
      P.swirl[i] = random() * 2 - 1;
    }
    activeCount = Math.min(n, deviceCount());
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nextW = Math.round(rect.width);
    const nextH = Math.round(rect.height);
    // On phones the address bar changes the height a little while scrolling. Ignore that.
    if (W && nextW === W && Math.abs(nextH - H) < 120) return;
    W = nextW;
    H = nextH;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5); // soft glows do not need full retina resolution
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const L = SETTINGS.logo;
    const size = clamp(Math.min(W * L.widthShare, H * L.heightShare), L.min, L.max);
    logo = { cx: W / 2, cy: H * L.centerY, size };
    if (stageEl) {
      stageEl.style.setProperty('--cm-logo-size', `${Math.round(size)}px`);
      stageEl.style.setProperty('--cm-logo-y', `${Math.round(logo.cy)}px`);
    }
    glowEl?.style.setProperty('--cm-glow-y', `${Math.round(logo.cy)}px`);
  }

  /* --------------------------------------------------------------- scroll */

  // How far through the LogoStage section we are: 0 when it is pinned to the top, 1 at the end.
  function readStageProgress() {
    if (!stageEl) return -99;
    if (stageTop === null) {
      const rect = stageEl.getBoundingClientRect();
      stageTop = rect.top + window.scrollY;
      stageHeight = rect.height;
    }
    return (window.scrollY - stageTop) / Math.max(1, stageHeight - H);
  }

  // 0..1: how much the particles have gathered into the logo.
  function formationAt(s) {
    const { begin, formed, holdEnd, gone } = SETTINGS.scroll;
    if (s <= begin) return 0;
    if (s < formed) return smooth((s - begin) / (formed - begin));
    if (s <= holdEnd) return 1;
    if (s < gone) return smooth((gone - s) / (gone - holdEnd));
    return 0;
  }

  // 0..1: how far the hand has risen. It swoops up quickly, holds, then sinks away again.
  function handAt(s) {
    const { start, full, leaveStart, gone } = SETTINGS.hand;
    if (s <= start) return 0;
    if (s < full) return 1 - Math.pow(1 - (s - start) / (full - start), 3);
    if (s <= leaveStart) return 1;
    if (s < gone) return smooth((gone - s) / (gone - leaveStart));
    return 0;
  }

  /* ---------------------------------------------------------- interaction */

  function canGrab(event) {
    if (!stageEl || formation < 0.85) return false;
    if (!stageEl.contains(event.target)) return false;
    const dx = event.clientX - logo.cx;
    const dy = event.clientY - logo.cy;
    return dx * dx + dy * dy < (logo.size * 0.62) ** 2;
  }

  function setGrab(value) {
    if (grabState === value || !stageEl) return;
    grabState = value;
    stageEl.dataset.grab = value;
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!canGrab(event)) return;
    rot.dragging = true;
    rot.id = event.pointerId;
    rot.lastX = event.clientX;
    rot.lastY = event.clientY;
    rot.lastT = event.timeStamp;
    rot.vyaw = 0;
    rot.vpitch = 0;
    rot.idle = 0;
    stageEl.dataset.drag = 'true';
    try {
      event.target.setPointerCapture?.(event.pointerId);
    } catch {
      /* pointer capture is optional */
    }
  }

  function onPointerMove(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = event.pointerType === 'mouse';

    if (rot.dragging && event.pointerId === rot.id) {
      const k = SETTINGS.drag.sensitivity;
      const dx = event.clientX - rot.lastX;
      const dy = event.clientY - rot.lastY;
      const dt = Math.max(0.008, (event.timeStamp - rot.lastT) / 1000);
      rot.yaw += dx * k;
      rot.pitch = clamp(rot.pitch + dy * k, -SETTINGS.drag.maxPitch, SETTINGS.drag.maxPitch);
      // Remember the speed of the flick so it keeps spinning after release.
      rot.vyaw += ((dx * k) / dt - rot.vyaw) * 0.5;
      rot.vpitch += ((dy * k) / dt - rot.vpitch) * 0.5;
      rot.lastX = event.clientX;
      rot.lastY = event.clientY;
      rot.lastT = event.timeStamp;
      return;
    }
    if (event.pointerType === 'mouse') setGrab(canGrab(event) ? 'true' : 'false');
  }

  function endDrag(event) {
    if (!rot.dragging || (event && event.pointerId !== rot.id)) return;
    rot.dragging = false;
    rot.idle = 0;
    if (stageEl) stageEl.dataset.drag = 'false';
    // A pause before release means no flick.
    if (event && event.timeStamp - rot.lastT > 90) {
      rot.vyaw = 0;
      rot.vpitch = 0;
    }
    rot.vyaw = clamp(rot.vyaw, -9, 9);
    rot.vpitch = clamp(rot.vpitch, -5, 5);
  }

  function onPointerLeave() {
    pointer.active = false;
    setGrab('false');
  }

  /* --------------------------------------------------------------- update */

  function updateRotation(dt) {
    if (rot.dragging) return;
    const spin = reduced ? 0 : SETTINGS.spin;
    if (reduced) {
      rot.vyaw = 0;
      rot.vpitch = 0;
    }
    rot.yaw += rot.vyaw * dt;
    rot.pitch = clamp(rot.pitch + rot.vpitch * dt, -SETTINGS.drag.maxPitch, SETTINGS.drag.maxPitch);
    // A flick's momentum fades back down to the steady spin speed.
    rot.vyaw += (spin - rot.vyaw) * (1 - Math.exp(-dt * 1.3));
    rot.vpitch *= Math.exp(-dt * 3.2);
    // The logo never stays tipped over: pitch eases back to level.
    rot.pitch += (0 - rot.pitch) * (1 - Math.exp(-dt * 1.1));
    if (Math.abs(rot.yaw) > 200) rot.yaw %= TAU;
  }

  /* ----------------------------------------------------------------- draw */

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    const F = formation;
    const { cx, cy, size: S } = logo;
    const scrollY = window.scrollY;

    if (!P) return;

    // Steady spin, plus a small nod and a gentle float so it feels held in the air.
    const idle = reduced || rot.dragging ? 0 : 1;
    const yaw = rot.yaw;
    const pitch = rot.pitch + Math.sin(time * 0.55 + 1) * 0.07 * idle;
    const cyy = cy + Math.sin(time * 1.05) * S * 0.016 * F * idle;
    const cY = Math.cos(yaw);
    const sY = Math.sin(yaw);
    const cP = Math.cos(pitch);
    const sP = Math.sin(pitch);
    const FOV = S * 1.7;
    const depthRange = S * 0.16;
    // Seen from the side the same particles crowd into a thin sliver, and additive light would
    // burn out to white. Dim them in proportion so the colours stay clear at every angle.
    const facing = Math.min(1, Math.abs(cY) * Math.abs(cP) + 0.1);
    const density = 0.28 + 0.72 * facing;
    const spread = SETTINGS.formSpread;

    const px = pointer.x;
    const py = pointer.y;
    const hasPointer = pointer.active;
    const ambientRadius = 120;
    const logoRadius = 70;

    for (let i = 0; i < activeCount; i += 1) {
      // How far along its trip to the logo this particle is (0 = not started).
      const vis = P.ambVis[i];
      let e = 0;
      if (F > 0.0005) e = easeInOut(clamp((F - P.delay[i] * (1 - spread)) / spread, 0, 1));
      // Not visible right now: skip all the work. Most particles are like this while
      // the page is idle, which is what keeps scrolling cheap.
      if (e === 0 && vis === 0) continue;

      /* --- ambient position (floating at the sides) --- */
      const dep = P.depth[i];
      let ax = P.axn[i] * W;
      let ay = P.ayn[i] * H - scrollY * 0.09 * dep;
      if (!reduced) {
        ax += Math.sin(time * P.aSpd[i] + P.aPh[i]) * 18 * dep;
        ay -= time * P.rise[i];
      }
      ay = wrap(ay, H);
      const edge = clamp(Math.min(ay, H - ay) / 70, 0, 1);
      const twinkle = reduced ? 0.85 : 0.62 + 0.38 * Math.sin(time * P.tw[i] + P.aPh[i]);
      const ambAlpha = vis * twinkle * edge;

      if (hasPointer && vis > 0) {
        const dx = ax - px;
        const dy = ay - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < ambientRadius * ambientRadius) {
          const d = Math.sqrt(d2) || 1;
          const f = 1 - d / ambientRadius;
          ax += (dx / d) * f * f * 46;
          ay += (dy / d) * f * f * 46;
        }
      }

      /* --- blend toward the logo --- */
      let x = ax;
      let y = ay;
      let alpha = ambAlpha;
      let sz = P.ambSize[i];

      if (e > 0) {
        // 3D model position, rotated then projected with perspective.
        const mx = P.mx[i] * S;
        const my = P.my[i] * S;
        const mz = P.mz[i] * S;
        const x1 = mx * cY - mz * sY;
        const z1 = mx * sY + mz * cY;
        const y1 = my * cP - z1 * sP;
        const z2 = my * sP + z1 * cP;
        const persp = FOV / (FOV + z2);
        let lx = cx + x1 * persp;
        let ly = cyy + y1 * persp;
        if (!reduced) {
          lx += Math.sin(time * 1.7 + P.aPh[i] * 3) * 0.55;
          ly += Math.cos(time * 1.3 + P.aPh[i] * 5) * 0.55;
        }
        if (hasPointer && F > 0.85) {
          const dx = lx - px;
          const dy = ly - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < logoRadius * logoRadius) {
            const d = Math.sqrt(d2) || 1;
            const f = 1 - d / logoRadius;
            lx += (dx / d) * f * f * 20;
            ly += (dy / d) * f * f * 20;
          }
        }

        // Curved flight path: swing sideways in the middle of the journey.
        const vx = lx - ax;
        const vy = ly - ay;
        const bend = Math.sin(Math.PI * e) * P.swirl[i] * 0.35;
        x = ax + vx * e - vy * bend;
        y = ay + vy * e + vx * bend;

        // Nearer parts of the logo are brighter and bigger.
        const shade = clamp(1 - z2 / (depthRange * 2.4), 0.5, 1.2);
        alpha = ambAlpha * (1 - e) + 0.9 * shade * density * e;
        sz = P.ambSize[i] * (1 - e) + P.dot[i] * persp * e;
      }

      if (alpha < 0.012) continue;
      const k = P.bucket[i];
      ctx.globalAlpha = alpha > 1 ? 1 : alpha;
      ctx.drawImage(
        atlas,
        (k % atlasCols) * CELL,
        Math.floor(k / atlasCols) * CELL,
        CELL,
        CELL,
        x - sz / 2,
        y - sz / 2,
        sz,
        sz,
      );
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ----------------------------------------------------------------- loop */

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastNow) / 1000 || 0.016);
    lastNow = now;
    time += dt;
    frames += 1;

    // Smooth the scroll-driven value so a jumpy mouse wheel still looks fluid.
    const progress = readStageProgress();
    const target = formationAt(progress);
    const handTarget = handAt(progress);
    const follow = reduced ? 1 : 1 - Math.exp(-dt * 12);
    formation += (target - formation) * follow;
    if (Math.abs(target - formation) < 0.0004) formation = target;
    hand += (handTarget - hand) * (reduced ? 1 : 1 - Math.exp(-dt * 10));
    if (Math.abs(handTarget - hand) < 0.0004) hand = handTarget;
    if (stageEl && Math.abs(formation - lastWrittenFormation) > 0.002) {
      lastWrittenFormation = formation;
      stageEl.style.setProperty('--cm-formed', formation.toFixed(3));
    }
    if (stageEl && Math.abs(hand - lastWrittenHand) > 0.001) {
      lastWrittenHand = hand;
      stageEl.style.setProperty('--cm-hand', hand.toFixed(3));
      if (glowEl) glowEl.style.opacity = (hand * 0.9).toFixed(3);
    }

    updateRotation(dt);
    draw();

    // If the device struggles, quietly use fewer particles.
    if (frames > 90 && P) {
      slowFrames = dt > 0.036 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames > 45 && activeCount > SETTINGS.minCount) {
        activeCount = Math.max(SETTINGS.minCount, Math.floor(activeCount * 0.8));
        slowFrames = 0;
      }
    }
  }

  /* ------------------------------------------------------------ lifecycle */

  const invalidateStage = () => {
    stageTop = null;
  };
  const onResize = () => {
    invalidateStage();
    resize();
  };
  let sizeObserver = null;

  function start() {
    resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('load', invalidateStage);
    // Re-measure if the content above the stage changes height (fonts, images, etc.)
    if (typeof ResizeObserver !== 'undefined') {
      sizeObserver = new ResizeObserver(invalidateStage);
      sizeObserver.observe(document.body);
    }
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    document.documentElement.addEventListener('pointerleave', onPointerLeave);

    sampleLogo(logoSrc, { count: SETTINGS.count.desktop })
      .then((data) => {
        if (destroyed) return;
        initParticles(data);
        raf = requestAnimationFrame(frame);
      })
      .catch((error) => {
        // Without the logo we simply show no particles. The rest of the page is unaffected.
        console.warn('[Cinemor particles] disabled:', error.message);
      });
  }

  function destroy() {
    destroyed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('load', invalidateStage);
    sizeObserver?.disconnect();
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    document.documentElement.removeEventListener('pointerleave', onPointerLeave);
    if (stageEl) {
      stageEl.style.removeProperty('--cm-formed');
      stageEl.style.removeProperty('--cm-logo-size');
      stageEl.style.removeProperty('--cm-logo-y');
      stageEl.style.removeProperty('--cm-hand');
      delete stageEl.dataset.grab;
      delete stageEl.dataset.drag;
    }
  }

  // The logo section can come and go as the visitor moves between pages. Point the engine at the
  // new section (or at nothing) without restarting the particles.
  function setStage(el) {
    if (el === stageEl) return;
    if (stageEl) {
      stageEl.style.removeProperty('--cm-formed');
      stageEl.style.removeProperty('--cm-logo-size');
      stageEl.style.removeProperty('--cm-logo-y');
      stageEl.style.removeProperty('--cm-hand');
      delete stageEl.dataset.grab;
      delete stageEl.dataset.drag;
    }
    stageEl = el;
    stageTop = null;
    lastWrittenFormation = -1;
    lastWrittenHand = -1;
    grabState = 'false';
    if (stageEl) {
      stageEl.style.setProperty('--cm-logo-size', `${Math.round(logo.size)}px`);
      stageEl.style.setProperty('--cm-logo-y', `${Math.round(logo.cy)}px`);
    }
  }

  return {
    start,
    destroy,
    setStage,
    setReducedMotion(value) {
      reduced = value;
    },
  };
}
