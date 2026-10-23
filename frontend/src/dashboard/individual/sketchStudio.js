/**
 * Sketch Studio: a sketch of every scene's place, made from the storyboard's scenes (or, without one, from
 * the story itself).
 *
 * For now the sketch is a DEMO drawn here in the browser: a painted landscape for the kind of place the scene is in
 * (forest, sea, city, indoors, mountains or open land), at the right time of day, with a river or a hut when the
 * scene mentions one. The backend will make real images later; it returns the same thing (an image).
 */
import { buildStoryboard } from './storyboard.js';

// the image models the backend offers (app/clients/openrouter_image_client.py)
export const SKETCH_MODELS = [
  { id: 'qwen/qwen-image-2.1-turbo', name: 'Qwen Image 2.1 Turbo' },
  { id: 'black-forest-labs/flux.2-flex', name: 'FLUX.2 Flex' },
  { id: 'qwen/qwen-image-2.1-pro', name: 'Qwen Image 2.1 Pro' },
  { id: 'black-forest-labs/flux.2-pro', name: 'FLUX.2 Pro' },
  { id: 'black-forest-labs/flux.2-max', name: 'FLUX.2 Max' },
];

/** The scenes of a story: from its storyboard when it has one, else worked out from the story. */
export function scenesOfStory(story, storyboard) {
  const board = storyboard?.board || buildStoryboard(story, story.settings || {});
  return board.scenes.map((sc, i) => ({ ...sc, no: i + 1 }));
}

const PLACES = [
  ['interior', /\b(room|lab|laboratory|office|house|home|kitchen|inside|indoors|desk|hall|corridor|classroom|library|bedroom|cabin|studio|workshop|palace hall|court|temple)\b/i],
  ['ocean', /\b(sea|ocean|pacific|atlantic|wave|waves|shore|beach|boat|ship|harbou?r|tide|underwater|reef|coast)\b/i],
  ['city', /\b(city|street|streets|town|road|traffic|market|building|buildings|rooftop|station|alley|downtown|kingdom|palace|lanka)\b/i],
  ['forest', /\b(forest|woods|trees|jungle|garden|park|grove|hermitage)\b/i],
  ['mountain', /\b(mountains?|hills?|cliffs?|peaks?|valley|ridge)\b/i],
];
/** The kind of place: the first kind mentioned in the scene's place, else in its text. */
export function placeKind(scene) {
  const first = (text) => {
    let best = '';
    let at = Infinity;
    PLACES.forEach(([kind, re]) => {
      const m = re.exec(text || '');
      if (m && m.index < at) {
        at = m.index;
        best = kind;
      }
    });
    return best;
  };
  return first(scene.location) || first(`${scene.visual_description} ${scene.summary} ${scene.primary_action}`) || 'open';
}
export function timeOfDay(scene, prompt = '') {
  const text = `${prompt} ${scene.location} ${scene.visual_description} ${scene.summary} ${scene.primary_action}`;
  if (/\b(night|midnight|moon|stars|dark sky)\b/i.test(text)) return 'night';
  if (/\b(dusk|sunset|evening|twilight)\b/i.test(text)) return 'dusk';
  if (/\b(dawn|sunrise|morning)\b/i.test(text)) return 'dawn';
  return 'day';
}
export const PLACE_LABEL = { interior: 'Indoors', ocean: 'By the sea', city: 'Town', forest: 'Forest', mountain: 'Mountains', open: 'Open land' };

/* ------------------------------------------------------------------ the demo sketch */

function random(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const SKIES = {
  day: ['#7fb2e5', '#cfe4f2', '#f3ead2'],
  dawn: ['#6f86c7', '#e9a8a0', '#f6d6a8'],
  dusk: ['#3b3f78', '#c9677a', '#f2a65e'],
  night: ['#070b1f', '#16204a', '#2b2f5e'],
};
const GROUND = {
  day: ['#6f9a52', '#4d7a3a', '#2f5527'],
  dawn: ['#6d7f4e', '#4e6a3b', '#2f4a28'],
  dusk: ['#4f4a4a', '#3a3438', '#251f27'],
  night: ['#1d2a2c', '#141f22', '#0b1214'],
};

/**
 * Draw the demo sketch for a scene. Resolves to a JPEG data URL (960 x 540).
 * `prompt` can change the time of day ("at night") and add a river or a hut.
 */
export async function drawSceneSketch(scene, { seed = 1, prompt = '' } = {}) {
  const W = 960;
  const H = 540;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const rnd = random(seed * 7919 + scene.no * 104729);
  const kind = placeKind({ ...scene, visual_description: `${scene.visual_description} ${prompt}` });
  const time = timeOfDay(scene, prompt);
  const text = `${scene.location} ${scene.visual_description} ${scene.summary} ${scene.primary_action} ${prompt}`;
  const [s0, s1, s2] = SKIES[time];
  const [g0, g1, g2] = GROUND[time];
  const horizon = H * (kind === 'mountain' ? 0.62 : 0.56);

  const grad = (y0, y1, stops) => {
    const lg = g.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([at, col]) => lg.addColorStop(at, col));
    return lg;
  };
  const blob = (path, fill) => {
    g.fillStyle = fill;
    g.fill(path);
  };
  const ridge = (base, height, rough, step) => {
    const p = new Path2D();
    p.moveTo(0, H);
    p.lineTo(0, base);
    let x = 0;
    let y = base;
    while (x < W) {
      x += step * (0.6 + rnd() * 0.8);
      y = base - rnd() * height + (rnd() - 0.5) * rough;
      p.lineTo(x, y);
    }
    p.lineTo(W, H);
    p.closePath();
    return p;
  };

  if (kind === 'interior') {
    // a room: a back wall with a window onto the outside, a floor, a table and warm light
    g.fillStyle = grad(0, H, [[0, time === 'night' ? '#2a2233' : '#c9b79c'], [1, time === 'night' ? '#15111d' : '#8d7a63']]);
    g.fillRect(0, 0, W, H);
    const wx = W * (0.3 + rnd() * 0.25);
    g.fillStyle = grad(80, 300, [[0, s0], [1, s2]]);
    g.fillRect(wx, 80, 260, 200);
    if (time === 'night') {
      g.fillStyle = '#f5f1d8';
      g.beginPath();
      g.arc(wx + 190, 130, 18, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = time === 'night' ? '#3d3247' : '#6b5844';
    g.lineWidth = 10;
    g.strokeRect(wx, 80, 260, 200);
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(wx + 130, 80);
    g.lineTo(wx + 130, 280);
    g.moveTo(wx, 180);
    g.lineTo(wx + 260, 180);
    g.stroke();
    // light from the window
    g.fillStyle = 'rgba(255, 240, 200, 0.12)';
    g.beginPath();
    g.moveTo(wx, 280);
    g.lineTo(wx + 260, 280);
    g.lineTo(wx + 420, H);
    g.lineTo(wx - 120, H);
    g.fill();
    // floor
    g.fillStyle = grad(H * 0.7, H, [[0, time === 'night' ? '#2b2228' : '#7a5a3f'], [1, time === 'night' ? '#16111a' : '#4f3826']]);
    g.fillRect(0, H * 0.7, W, H * 0.3);
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 2;
    for (let i = 1; i < 6; i += 1) {
      g.beginPath();
      g.moveTo(0, H * 0.7 + i * 30);
      g.lineTo(W, H * 0.7 + i * 30);
      g.stroke();
    }
    // a table with a lamp
    g.fillStyle = time === 'night' ? '#3a2c26' : '#5c4030';
    g.fillRect(W * 0.62, H * 0.62, 240, 18);
    g.fillRect(W * 0.62 + 16, H * 0.62 + 18, 12, 110);
    g.fillRect(W * 0.62 + 212, H * 0.62 + 18, 12, 110);
    const lamp = g.createRadialGradient(W * 0.62 + 60, H * 0.56, 4, W * 0.62 + 60, H * 0.56, 160);
    lamp.addColorStop(0, 'rgba(255, 214, 140, 0.55)');
    lamp.addColorStop(1, 'rgba(255, 214, 140, 0)');
    g.fillStyle = lamp;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#e8c27a';
    g.beginPath();
    g.moveTo(W * 0.62 + 40, H * 0.56);
    g.lineTo(W * 0.62 + 80, H * 0.56);
    g.lineTo(W * 0.62 + 70, H * 0.52);
    g.lineTo(W * 0.62 + 50, H * 0.52);
    g.fill();
  } else {
    // sky, sun or moon
    g.fillStyle = grad(0, horizon, [[0, s0], [0.65, s1], [1, s2]]);
    g.fillRect(0, 0, W, horizon + 4);
    const sx = W * (0.2 + rnd() * 0.6);
    const sy = time === 'day' ? H * 0.16 : horizon * 0.62;
    const glow = g.createRadialGradient(sx, sy, 6, sx, sy, time === 'night' ? 120 : 220);
    glow.addColorStop(0, time === 'night' ? 'rgba(240,240,255,0.5)' : 'rgba(255,240,200,0.75)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
    g.fillStyle = time === 'night' ? '#eef0ff' : time === 'day' ? '#fff8e1' : '#ffd8a0';
    g.beginPath();
    g.arc(sx, sy, time === 'night' ? 20 : 30, 0, Math.PI * 2);
    g.fill();
    if (time === 'night') {
      for (let i = 0; i < 90; i += 1) {
        g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`;
        g.fillRect(rnd() * W, rnd() * horizon * 0.85, 1.6, 1.6);
      }
    }
    // far and middle ridges
    blob(ridge(horizon - 40, kind === 'mountain' ? 170 : 70, 30, kind === 'mountain' ? 90 : 60), time === 'night' ? '#1c2440' : 'rgba(120,140,170,0.55)');
    if (kind === 'mountain') {
      // snow on the far peaks
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fill(ridge(horizon - 150, 60, 20, 90));
    }
    blob(ridge(horizon + 6, 34, 16, 50), time === 'night' ? '#18242a' : g2);

    if (kind === 'ocean') {
      g.fillStyle = grad(horizon, H, [[0, time === 'night' ? '#16224a' : '#5d8fb8'], [1, time === 'night' ? '#070b1f' : '#1f4b6e']]);
      g.fillRect(0, horizon + 10, W, H);
      g.strokeStyle = time === 'night' ? 'rgba(220,230,255,0.35)' : 'rgba(255,255,255,0.45)';
      g.lineWidth = 2;
      for (let i = 0; i < 70; i += 1) {
        const y = horizon + 20 + rnd() ** 1.4 * (H - horizon - 20);
        const x = rnd() * W;
        const w = 10 + (y - horizon) * 0.18;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + w / 2, y - 3, x + w, y);
        g.stroke();
      }
      // the sun or moon on the water
      g.fillStyle = 'rgba(255,240,210,0.25)';
      g.fillRect(sx - 30, horizon + 14, 60, H - horizon);
      if (/\b(boat|ship)\b/i.test(text)) {
        g.fillStyle = '#2a2420';
        g.beginPath();
        g.moveTo(W * 0.55, horizon + 70);
        g.lineTo(W * 0.68, horizon + 70);
        g.lineTo(W * 0.66, horizon + 86);
        g.lineTo(W * 0.57, horizon + 86);
        g.fill();
        g.fillRect(W * 0.612, horizon + 20, 3, 50);
      }
    } else {
      // the ground in front
      g.fillStyle = grad(horizon, H, [[0, g0], [0.5, g1], [1, g2]]);
      g.fillRect(0, horizon + 12, W, H);
      if (kind === 'city') {
        // a skyline across the horizon, lit windows at night
        let x = -10;
        while (x < W) {
          const bw = 40 + rnd() * 70;
          const bh = 60 + rnd() * 150;
          g.fillStyle = time === 'night' ? '#141a2e' : `rgba(${80 + rnd() * 40},${85 + rnd() * 40},${100 + rnd() * 40},0.95)`;
          g.fillRect(x, horizon + 14 - bh, bw, bh);
          for (let wy = horizon + 24 - bh; wy < horizon; wy += 16) {
            for (let wx = x + 8; wx < x + bw - 10; wx += 14) {
              if (rnd() > (time === 'night' ? 0.5 : 0.75)) {
                g.fillStyle = time === 'night' ? 'rgba(255,214,120,0.85)' : 'rgba(220,235,255,0.6)';
                g.fillRect(wx, wy, 6, 8);
              }
            }
          }
          x += bw + 4;
        }
        // a road into the distance
        g.fillStyle = time === 'night' ? '#20232c' : '#5a5a5e';
        g.beginPath();
        g.moveTo(W * 0.46, horizon + 14);
        g.lineTo(W * 0.54, horizon + 14);
        g.lineTo(W * 0.8, H);
        g.lineTo(W * 0.2, H);
        g.fill();
      }
      if (kind === 'forest' || /\b(trees?|tall trees)\b/i.test(text)) {
        // rows of trees, darker and bigger in front
        for (let row = 0; row < 3; row += 1) {
          const count = 18 - row * 5;
          for (let i = 0; i < count; i += 1) {
            const x = rnd() * W;
            if (row === 2 && x > W * 0.3 && x < W * 0.7) continue; // keep a clearing in the middle
            const base = horizon + 14 + row * 46 + rnd() * 20;
            const h = 70 + row * 70 + rnd() * 50;
            const shade = time === 'night' ? 18 + row * 4 : 70 - row * 18;
            g.fillStyle = `rgb(${shade * 0.5},${shade + 20},${shade * 0.55})`;
            g.beginPath();
            g.moveTo(x, base - h);
            g.lineTo(x + h * 0.28, base);
            g.lineTo(x - h * 0.28, base);
            g.fill();
            g.fillStyle = 'rgba(40,28,20,0.8)';
            g.fillRect(x - 3, base - 6, 6, 14);
          }
        }
        // sunlight through the trees
        if (time === 'day' || time === 'dawn') {
          g.fillStyle = 'rgba(255,240,190,0.1)';
          for (let i = 0; i < 4; i += 1) {
            const x = W * (0.25 + i * 0.15);
            g.beginPath();
            g.moveTo(x, 0);
            g.lineTo(x + 40, 0);
            g.lineTo(x + 160, H);
            g.lineTo(x + 60, H);
            g.fill();
          }
        }
      }
      if (/\b(river|stream|brook|creek)\b/i.test(text)) {
        g.fillStyle = time === 'night' ? 'rgba(40,60,110,0.9)' : 'rgba(110,160,200,0.9)';
        g.beginPath();
        g.moveTo(W * 0.48, horizon + 16);
        g.bezierCurveTo(W * 0.3, horizon + 90, W * 0.75, horizon + 150, W * 0.35, H);
        g.lineTo(W * 0.62, H);
        g.bezierCurveTo(W * 0.95, horizon + 150, W * 0.4, horizon + 90, W * 0.52, horizon + 16);
        g.fill();
      }
      if (/\b(hut|hermitage|cottage|house|cabin|ashram)\b/i.test(text)) {
        const hx = W * (0.55 + rnd() * 0.1);
        const hy = horizon + 70;
        g.fillStyle = time === 'night' ? '#3a2e26' : '#8a6a46';
        g.fillRect(hx, hy, 120, 70);
        g.fillStyle = time === 'night' ? '#2a2018' : '#b08a52';
        g.beginPath();
        g.moveTo(hx - 20, hy + 4);
        g.lineTo(hx + 60, hy - 50);
        g.lineTo(hx + 140, hy + 4);
        g.fill();
        g.fillStyle = time === 'night' ? 'rgba(255,200,110,0.85)' : '#3b2a1c';
        g.fillRect(hx + 48, hy + 28, 24, 42);
      }
    }
  }

  // haze toward the horizon, a soft vignette
  if (kind !== 'interior') {
    g.fillStyle = grad(horizon - 60, horizon + 60, [[0, 'rgba(255,255,255,0)'], [0.5, time === 'night' ? 'rgba(120,130,200,0.12)' : 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']]);
    g.fillRect(0, horizon - 60, W, 120);
  }
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.42)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  return canvas.toDataURL('image/jpeg', 0.84);
}
