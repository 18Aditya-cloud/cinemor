// A small, deterministic "random" generator (not Math.random) so the mesh is identical on every render
// and every visit — it only needs to look organic, not be truly random.
const seeded = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/**
 * Builds the shard mesh: an irregular grid of points (jittered, so the cells are not perfect squares), each
 * cell split into two triangles, then trimmed only where the glowing logo pane sits (a hole in the middle) —
 * otherwise it fills the whole square, the way a real pane of cracked glass covers its whole frame, right to
 * the edges, rather than trailing off into empty space.
 *
 * Coordinates are in a 0–100 square (percent of the stage). Returns triangles as
 *   { points: [[x,y],[x,y],[x,y]], box: {left,top,width,height}, clip: 'polygon(...)' (percent, relative to box),
 *     depth: 0..1 (how far from the centre — used for the parallax amount) }
 */
export function buildShardMesh({ cols = 8, rows = 7, innerHole = 15, seed = 0 } = {}) {
  const points = [];
  for (let j = 0; j <= rows; j++) {
    const row = [];
    for (let i = 0; i <= cols; i++) {
      const baseX = (i / cols) * 100;
      const baseY = (j / rows) * 100;
      const edge = i === 0 || i === cols || j === 0 || j === rows;
      const n = seed + i * 31 + j * 97;
      const jitterX = edge ? 0 : (seeded(n) - 0.5) * (100 / cols) * 0.7;
      const jitterY = edge ? 0 : (seeded(n + 500) - 0.5) * (100 / rows) * 0.7;
      row.push([baseX + jitterX, baseY + jitterY]);
    }
    points.push(row);
  }

  const cx = 50;
  const cy = 50;
  const maxR = dist(0, 0, cx, cy); // corner distance, so depth still ranges smoothly all the way to the edges
  const triangles = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const p00 = points[j][i];
      const p10 = points[j][i + 1];
      const p01 = points[j + 1][i];
      const p11 = points[j + 1][i + 1];
      const flip = (i + j) % 2 === 0;
      const cells = flip ? [[p00, p10, p11], [p00, p11, p01]] : [[p00, p10, p01], [p10, p11, p01]];
      cells.forEach((tri, k) => {
        const [ax, ay] = tri[0];
        const [bx, by] = tri[1];
        const [cxp, cyp] = tri[2];
        const centroidX = (ax + bx + cxp) / 3;
        const centroidY = (ay + by + cyp) / 3;
        const r = dist(centroidX, centroidY, cx, cy);
        const minX = Math.min(ax, bx, cxp);
        const maxX = Math.max(ax, bx, cxp);
        const minY = Math.min(ay, by, cyp);
        const maxY = Math.max(ay, by, cyp);
        const nearestVertex = Math.min(dist(ax, ay, cx, cy), dist(bx, by, cx, cy), dist(cxp, cyp, cx, cy));
        // the only thing ever left out is the hole for the glowing centre pane — otherwise the mosaic fills
        // the whole square, right to its edges, the way a real cracked pane fills its whole frame
        if (r < innerHole || nearestVertex < innerHole * 0.62) return;
        const width = Math.max(maxX - minX, 0.01);
        const height = Math.max(maxY - minY, 0.01);
        const pct = (v, min, span) => `${(((v - min) / span) * 100).toFixed(1)}%`;
        const clip = `polygon(${pct(ax, minX, width)} ${pct(ay, minY, height)}, ${pct(bx, minX, width)} ${pct(by, minY, height)}, ${pct(cxp, minX, width)} ${pct(cyp, minY, height)})`;

        triangles.push({
          key: `${j}-${i}-${k}`,
          points: tri,
          box: { left: minX, top: minY, width, height },
          clip,
          depth: Math.min(1, (r - innerHole) / (maxR - innerHole)),
        });
      });
    }
  }
  return triangles;
}
