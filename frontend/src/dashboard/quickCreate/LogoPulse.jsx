import { useEffect, useRef } from 'react';
import logoUrl from '../../assets/images/cinemor-logo.png';
import q from './QuickCreate.module.css';

/**
 * What a card shows while it is being made: silver particles that gather into the Cinemor mark, which then beats
 * softly like a heart and sparkles. No progress bar. When `done` turns true the whole layer fades away and the
 * result underneath shows through. (The same silver particles as the character and sketch studios.)
 */
let logoPoints = null;
function loadLogoPoints() {
  if (logoPoints) return Promise.resolve(logoPoints);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 160;
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
          if (data[i + 3] / 255 < 0.4) continue;
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

function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// a heartbeat: two quick beats ("lub-dub"), then a rest; 0..1
function beat(sec) {
  const t = (sec % 1.3) / 1.3;
  const pulse = (center, width) => Math.max(0, 1 - Math.abs(t - center) / width);
  return Math.max(pulse(0.08, 0.08) ** 2, 0.7 * pulse(0.27, 0.08) ** 2);
}

export default function LogoPulse({ done = false, label = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const g = canvas.getContext('2d');
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const started = performance.now();
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
      const rnd = random(11);
      const area = (W * H) / ((window.devicePixelRatio || 1) ** 2);
      const count = Math.round(Math.min(2600, Math.max(700, area / 30)));
      particles = Array.from({ length: count }, () => {
        const L = logo.length ? logo[Math.floor(rnd() * logo.length)] : [rnd(), rnd(), 0.6];
        return {
          sx: rnd(),
          sy: rnd(),
          lx: L[0] + (rnd() - 0.5) * 0.01,
          ly: L[1] + (rnd() - 0.5) * 0.01,
          b: L[2],
          size: rnd() < 0.08 ? 1.8 : rnd() < 0.45 ? 1.2 : 0.8,
          phase: rnd() * Math.PI * 2,
          speed: 0.6 + rnd() * 1.6,
          spark: rnd() < 0.04,
        };
      });
    };
    const draw = (now) => {
      if (cancelled) return;
      const sec = (now - started) / 1000;
      const gather = ease(clamp01(sec / 0.9));
      const pulse = still ? 0 : beat(sec);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const box = Math.min(W, H) * 0.42 * (1 + 0.07 * pulse);
      const x0 = (W - box) / 2;
      const y0 = (H - box) / 2 - (label ? H * 0.04 : 0);
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = '#e9eaf0';
      for (let k = 0; k < particles.length; k += 1) {
        const p = particles[k];
        let x = p.sx * W + (x0 + p.lx * box - p.sx * W) * gather;
        let y = p.sy * H + (y0 + p.ly * box - p.sy * H) * gather;
        if (!still) {
          x += Math.sin(sec * p.speed + p.phase) * 1.2 * dpr;
          y += Math.cos(sec * p.speed * 0.8 + p.phase) * 1.2 * dpr;
        }
        const twinkle = still ? 1 : 0.65 + 0.35 * Math.sin(sec * 2.6 * p.speed + p.phase);
        const alpha = (0.25 + 0.6 * p.b) * twinkle * (0.8 + 0.35 * pulse);
        g.globalAlpha = Math.max(0, Math.min(1, alpha));
        const sz = (p.spark && !still ? p.size * (1.4 + Math.sin(sec * 5 + p.phase)) : p.size) * dpr;
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
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
    observer?.observe(canvas);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [label]);

  return (
    <div className={`${q.pulse} ${done ? q.pulseDone : ''}`} aria-hidden="true">
      <canvas ref={canvasRef} className={q.pulseCanvas} />
      {label && <p className={q.pulseLabel}>{label}</p>}
    </div>
  );
}
