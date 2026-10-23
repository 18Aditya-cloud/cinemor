import { useEffect, useRef } from 'react';
import logoUrl from '../../assets/images/cinemor-logo.png';
import s from './CharacterStudio.module.css';

/**
 * What the frame shows while a character image is made: a cloud of silver particles that gathers into the Cinemor
 * mark and shimmers, then flows into the shape of a standing figure (shape="figure") or a landscape
 * (shape="scene"), and scatters away when the image is ready.
 * "Generating…" and a thin progress line sit at the bottom of the frame.
 *
 *   started   performance.now() when the run began
 *   duration  how long the run takes (ms); the logo holds for the first part, the figure for the rest
 *   done      true once the image is ready: the particles scatter and fade
 *   pct       0..100 for the progress line
 */
const LOGO_AT = 0.06; // fraction of the run: particles have flown into the logo
const MORPH_AT = 0.5; // they start leaving the logo for the figure
const FIGURE_AT = 0.72; // the figure is formed

let logoPoints = null; // the logo's shape, sampled once: [[x, y, brightness]] in 0..1

function loadLogoPoints() {
  if (logoPoints) return Promise.resolve(logoPoints);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 220;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, size, size);
      const { data } = g.getImageData(0, 0, size, size);
      const pts = [];
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const i = (y * size + x) * 4;
          const a = data[i + 3] / 255;
          if (a < 0.4) continue;
          const lum = (0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]) / 255;
          pts.push([x / size, y / size, Math.min(1, 0.35 + lum)]);
        }
      }
      logoPoints = pts;
      resolve(pts);
    };
    img.onerror = () => resolve([]);
    img.src = logoUrl;
  });
}

// a standing figure, front view, in a 0..1 box (head, neck, shoulders, arms, body, legs)
function figurePoint(rnd) {
  for (;;) {
    const x = rnd();
    const y = rnd();
    const dx = Math.abs(x - 0.5);
    const head = ((x - 0.5) / 0.1) ** 2 + ((y - 0.135) / 0.088) ** 2 <= 1;
    const neck = dx < 0.05 && y > 0.2 && y < 0.25;
    // shoulders widen quickly, then the body narrows a little to the waist; arms hang beside it
    const half = y < 0.3 ? 0.07 + ((y - 0.235) / 0.065) * 0.14 : 0.21 - ((y - 0.3) / 0.28) * 0.05;
    const torso = y >= 0.235 && y <= 0.58 && dx <= half;
    const arms = y >= 0.29 && y <= 0.6 && dx >= half + 0.01 && dx <= half + 0.07 - (y - 0.29) * 0.04;
    const legs = y >= 0.57 && y <= 0.94 && dx >= 0.014 && dx <= 0.15 - (y - 0.57) * 0.1;
    if (head || neck || torso || arms || legs) return [x, y, 0.5 + rnd() * 0.5];
  }
}

// a landscape, in a 0..1 box: hills on the horizon, a hut, trees, the ground and the sun
function scenePoint(rnd) {
  for (;;) {
    const x = rnd();
    const y = rnd();
    const hill = 0.52 - 0.1 * Math.sin(x * 5.2 + 0.6) - 0.06 * Math.sin(x * 11.3);
    const ground = y > 0.74 && rnd() < 0.55;
    const hills = y > hill && y < hill + 0.035; // the ridge line
    const sun = ((x - 0.78) / 0.07) ** 2 + ((y - 0.2) / 0.12) ** 2 <= 1;
    const hut = x > 0.56 && x < 0.7 && y > 0.6 && y < 0.74;
    const roof = y > 0.5 && y <= 0.6 && Math.abs(x - 0.63) <= (y - 0.5) * 0.9;
    const tree = [0.12, 0.2, 0.3, 0.86, 0.94].some((tx, i) => {
      const top = 0.36 + (i % 2) * 0.06;
      return y > top && y < 0.76 && Math.abs(x - tx) <= (y - top) * 0.16;
    });
    const path = y > 0.76 && Math.abs(x - 0.45 + (y - 0.76) * 0.5) < 0.02 + (y - 0.76) * 0.12;
    if (hills || sun || hut || roof || tree || (ground && !path)) return [x, y, 0.45 + rnd() * 0.55];
  }
}

function random(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export default function ParticleForge({ started, duration, done, pct, hint, shape = 'figure' }) {
  const canvasRef = useRef(null);
  const doneAt = useRef(null);
  if (done && doneAt.current === null) doneAt.current = performance.now();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const g = canvas.getContext('2d');
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let particles = [];
    let W = 0;
    let H = 0;
    let cancelled = false;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, Math.round(r.width * dpr));
      H = Math.max(1, Math.round(r.height * dpr));
      canvas.width = W;
      canvas.height = H;
    };

    const build = (logo) => {
      const rnd = random(7);
      const area = (W * H) / ((window.devicePixelRatio || 1) ** 2);
      const count = Math.round(Math.min(6500, Math.max(1800, area / 18)));
      particles = Array.from({ length: count }, (_, i) => {
        const L = logo.length ? logo[Math.floor(rnd() * logo.length)] : [rnd(), rnd(), 0.6];
        const F = shape === 'scene' ? scenePoint(rnd) : figurePoint(rnd);
        return {
          sx: rnd(), // where it starts (scattered)
          sy: rnd(),
          lx: L[0] + (rnd() - 0.5) * 0.008,
          ly: L[1] + (rnd() - 0.5) * 0.008,
          lb: L[2],
          fx: F[0] + (rnd() - 0.5) * 0.01,
          fy: F[1] + (rnd() - 0.5) * 0.01,
          fb: F[2],
          size: rnd() < 0.08 ? 1.8 : rnd() < 0.45 ? 1.2 : 0.8,
          phase: rnd() * Math.PI * 2,
          speed: 0.6 + rnd() * 1.6,
          delay: rnd() * 0.22, // a little stagger in the morph
          out: rnd() * Math.PI * 2, // direction it leaves in at the end
          i,
        };
      });
    };

    const draw = (now) => {
      if (cancelled) return;
      const t = clamp01((now - started) / duration);
      const sec = (now - started) / 1000;
      const end = doneAt.current ? clamp01((now - doneAt.current) / 800) : 0;
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = '#e9eaf0'; // silver

      // the logo fills ~58% of the width, the figure ~70% of the height
      // (a wide frame is short: the mark sits a little higher and smaller there, clear of "Generating…")
      const logoBox = shape === 'scene' ? Math.min(W * 0.5, H * 0.46) : Math.min(W * 0.58, H * 0.52);
      const lx0 = (W - logoBox) / 2;
      const ly0 = (shape === 'scene' ? H * 0.37 : H * 0.44) - logoBox / 2;
      // a figure stands in a 3:4 box, a landscape fills a 16:9 one
      const figH = shape === 'scene' ? Math.min(H * 0.62, W * 0.86 * 0.5625) : H * 0.7;
      const figW = shape === 'scene' ? figH / 0.5625 : figH * 0.75;
      const fx0 = (W - figW) / 2;
      const fy0 = shape === 'scene' ? H * 0.05 : H * 0.08;
      const dpr = Math.min(2, window.devicePixelRatio || 1);

      for (let k = 0; k < particles.length; k += 1) {
        const p = particles[k];
        // scattered -> logo
        const a = ease(clamp01(t / LOGO_AT));
        let x = p.sx * W + (lx0 + p.lx * logoBox - p.sx * W) * a;
        let y = p.sy * H + (ly0 + p.ly * logoBox - p.sy * H) * a;
        let bright = p.lb;
        // logo -> figure
        const m = ease(clamp01((t - MORPH_AT - p.delay * (FIGURE_AT - MORPH_AT)) / ((FIGURE_AT - MORPH_AT) * 0.78)));
        if (m > 0) {
          const tx = fx0 + p.fx * figW;
          const ty = fy0 + p.fy * figH;
          // a gentle swirl on the way
          const swirl = Math.sin(m * Math.PI) * 0.06 * W * Math.sin(p.phase);
          x += (tx - x) * m + swirl;
          y += (ty - y) * m;
          bright = p.lb + (p.fb - p.lb) * m;
        }
        // shimmer: a small drift and twinkle
        if (!still) {
          x += Math.sin(sec * p.speed + p.phase) * 1.4 * dpr;
          y += Math.cos(sec * p.speed * 0.8 + p.phase) * 1.4 * dpr;
        }
        let alpha = (0.25 + 0.6 * bright) * (still ? 1 : 0.65 + 0.35 * Math.sin(sec * 2.4 * p.speed + p.phase));
        // at the end they scatter outward and fade
        if (end > 0) {
          const d = ease(end) * 0.25 * W;
          x += Math.cos(p.out) * d;
          y += Math.sin(p.out) * d;
          alpha *= 1 - end;
        }
        g.globalAlpha = Math.max(0, Math.min(1, alpha * (0.75 + 0.25 * bright)));
        const sz = p.size * dpr;
        g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      frame = requestAnimationFrame(draw);
    };

    resize();
    loadLogoPoints().then((logo) => {
      if (cancelled) return;
      build(logo);
      frame = requestAnimationFrame(draw);
    });
    const onResize = () => {
      resize();
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, [started, duration, shape]);

  return (
    <div className={`${s.forge} ${done ? s.forgeDone : ''}`} aria-hidden="true">
      <canvas ref={canvasRef} className={s.forgeCanvas} />
      <div className={s.forgeFoot}>
        <p className={s.forgeLabel}>{done ? 'Ready' : 'Generating…'}</p>
        <span className={s.forgeBar}>
          <span style={{ width: `${pct}%` }} />
        </span>
        {hint && <p className={s.forgeHint}>{hint}</p>}
      </div>
    </div>
  );
}
