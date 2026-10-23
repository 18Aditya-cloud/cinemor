/**
 * Turns the logo image into a cloud of 3D points.
 *
 * 1. Draw the logo to a small offscreen canvas and read its pixels.
 * 2. Every visible pixel is a candidate point. It keeps the logo's own colour.
 * 3. Depth: a distance transform measures how far each pixel is from the
 *    logo's edge. Pixels deep inside get pushed forward and backward, so the flat
 *    logo becomes a soft, inflated 3D shape. Edges stay thin.
 *
 * Returns typed arrays (fast to loop over every frame):
 *   x, y, z    model coordinates. x/y are roughly -0.5..0.5, z is about +-0.15
 *   r, g, b    the colour of the logo at that point (0..255)
 */

// Small seeded random generator so the logo looks the same on every reload.
function makeRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load image: ${src}`));
    image.src = src;
  });
}

// Chamfer 3-4 distance transform: for every "inside" pixel, roughly 3x its
// distance (in pixels) to the nearest "outside" pixel.
function distanceToEdge(inside, size) {
  const INF = 1 << 20;
  const d = new Int32Array(size * size);
  for (let i = 0; i < d.length; i += 1) d[i] = inside[i] ? INF : 0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - size] + 3);
        if (x > 0) v = Math.min(v, d[i - size - 1] + 4);
        if (x < size - 1) v = Math.min(v, d[i - size + 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let y = size - 1; y >= 0; y -= 1) {
    for (let x = size - 1; x >= 0; x -= 1) {
      const i = y * size + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < size - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < size - 1) {
        v = Math.min(v, d[i + size] + 3);
        if (x < size - 1) v = Math.min(v, d[i + size + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + size - 1] + 4);
      }
      d[i] = v;
    }
  }
  return d;
}

export async function sampleLogo(src, { grid = 256, count = 4800, thickness = 0.3, seed = 11 } = {}) {
  const image = await loadImage(src);

  const canvas = document.createElement('canvas');
  canvas.width = grid;
  canvas.height = grid;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const scale = Math.min(grid / image.width, grid / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (grid - w) / 2, (grid - h) / 2, w, h);
  const { data } = ctx.getImageData(0, 0, grid, grid);

  const inside = new Uint8Array(grid * grid);
  for (let i = 0; i < inside.length; i += 1) inside[i] = data[i * 4 + 3] > 140 ? 1 : 0;

  const dist = distanceToEdge(inside, grid);
  let maxDist = 1;
  for (let i = 0; i < dist.length; i += 1) if (dist[i] > maxDist && dist[i] < 1 << 19) maxDist = dist[i];

  const all = [];
  const rim = [];
  for (let i = 0; i < inside.length; i += 1) {
    if (!inside[i]) continue;
    all.push(i);
    if (dist[i] <= 7) rim.push(i); // pixels within ~2px of the edge
  }
  if (!all.length) throw new Error('Logo has no visible pixels to sample.');

  const random = makeRandom(seed);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const r = new Uint8Array(count);
  const g = new Uint8Array(count);
  const b = new Uint8Array(count);

  for (let n = 0; n < count; n += 1) {
    // 32% of the points hug the outline so the silhouette reads clearly.
    const pool = rim.length && random() < 0.32 ? rim : all;
    const index = pool[Math.floor(random() * pool.length)];
    const px = index % grid;
    const py = (index / grid) | 0;

    x[n] = (px + random() - grid / 2) / grid;
    y[n] = (py + random() - grid / 2) / grid;

    // Inflate: more depth the further a pixel is from the edge.
    const depth = Math.sqrt(Math.min(1, dist[index] / maxDist)) * (thickness / 2);
    const roll = random();
    const face = random() < 0.5 ? -1 : 1;
    // 80% on the front/back skin, 20% inside the body, so it reads as a solid.
    z[n] = roll < 0.8 ? face * depth * (0.82 + 0.18 * random()) : (random() * 2 - 1) * depth;

    r[n] = data[index * 4];
    g[n] = data[index * 4 + 1];
    b[n] = data[index * 4 + 2];
  }

  return { count, x, y, z, r, g, b };
}
