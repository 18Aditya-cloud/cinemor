import { useEffect, useRef, useState } from 'react';
import logoUrl from '../../assets/images/cinemor-logo.png';
import butterflyA from '../../assets/images/auth-shards/butterfly-a.jpg';
import butterflyB from '../../assets/images/auth-shards/butterfly-b.jpg';
import butterflyC from '../../assets/images/auth-shards/butterfly-c.jpg';
import chibiA from '../../assets/images/auth-shards/chibi-a.jpg';
import chibiB from '../../assets/images/auth-shards/chibi-b.jpg';
import chibiC from '../../assets/images/auth-shards/chibi-c.jpg';
import dragonA from '../../assets/images/auth-shards/dragon-a.jpg';
import dragonB from '../../assets/images/auth-shards/dragon-b.jpg';
import dragonC from '../../assets/images/auth-shards/dragon-c.jpg';
import explorerA from '../../assets/images/auth-shards/explorer-a.jpg';
import explorerB from '../../assets/images/auth-shards/explorer-b.jpg';
import explorerC from '../../assets/images/auth-shards/explorer-c.jpg';
import lanternA from '../../assets/images/auth-shards/lantern-a.jpg';
import lanternB from '../../assets/images/auth-shards/lantern-b.jpg';
import lanternC from '../../assets/images/auth-shards/lantern-c.jpg';
import rabbitA from '../../assets/images/auth-shards/rabbit-a.jpg';
import rabbitB from '../../assets/images/auth-shards/rabbit-b.jpg';
import rabbitC from '../../assets/images/auth-shards/rabbit-c.jpg';
import { buildShardMesh } from './shardMesh.js';
import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion.js';
import styles from './AuthShards.module.css';

// Six real photos, a few different crops of each (different region/zoom), so a mesh with far more pieces
// than photos still rarely shows the same crop twice next to itself. See shardMesh.js for the mesh itself.
const IMAGES = [
  butterflyA, explorerB, lanternC, rabbitA, chibiB, dragonC,
  explorerA, lanternB, rabbitC, chibiA, dragonB, butterflyC,
  lanternA, rabbitB, chibiC, dragonA, butterflyB, explorerC,
];

// A stride that shares no small common factor with the image count, so walking the mesh in order rarely
// repeats a crop right next to itself (rather than 0,1,2,... which would put the same photo in a visible line).
const imageFor = (index) => IMAGES[(index * 7) % IMAGES.length];

// Every shard gets its photo up front, then shards are grouped into a few depth "bands" (near the centre vs
// near the outer edge). Moving 80-odd shards individually every animation frame is what made the parallax
// slow to begin with; moving 5 band wrappers instead — with every shard inside riding along for free, by
// ordinary CSS transform inheritance — is what keeps it cheap, however dense the mosaic is.
const BAND_COUNT = 5;
const bandOf = (depth) => Math.min(BAND_COUNT - 1, Math.floor(depth * BAND_COUNT));
const MESH = buildShardMesh({ cols: 14, rows: 12, innerHole: 13, seed: 5 }).map((tri, i) => ({ ...tri, img: imageFor(i) }));
const BANDS = Array.from({ length: BAND_COUNT }, (_, band) => ({
  band,
  depth: (band + 0.5) / BAND_COUNT, // the drift amount used for this whole band
  shards: MESH.filter((tri) => bandOf(tri.depth) === band),
}));

/**
 * The broken-mirror scene beside the Log in / Sign up card: a gapless mosaic of triangular photo shards
 * (a real triangle mesh via CSS clip-path, not separated cards) around the Cinemor logo glowing in a shiny
 * centre pane, the whole mosaic drifting gently toward the cursor like a tilting pane of glass.
 *
 * With "reduce motion" on, or on a touch device (nothing to point with), the mosaic stays put; nothing tracks
 * the pointer. Decorative throughout (aria-hidden): the real page title next to it already says where you are.
 */
export default function AuthShards() {
  const stageRef = useRef(null);
  const bandRefs = useRef([]);
  const reduced = usePrefersReducedMotion();
  // Below this width the page shows the form only (see AuthPage.module.css); returning null here means the
  // shard photos are never even requested on a phone, not just hidden by CSS.
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 961px)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 961px)');
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || reduced || !wide) return undefined;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined; // a touch screen has no cursor to follow

    const MAX_DRIFT = 16; // px the outermost band moves; the centre pane moves a little less (see .center)
    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;

    const apply = () => {
      x += (targetX - x) * 0.07;
      y += (targetY - y) * 0.07;
      bandRefs.current.forEach((el, i) => {
        if (!el) return;
        const depth = BANDS[i].depth;
        el.style.transform = `translate3d(${x * depth * MAX_DRIFT}px, ${y * depth * MAX_DRIFT}px, 0)`;
      });
      stage.style.setProperty('--tilt-x', `${x * 3.2}deg`);
      stage.style.setProperty('--tilt-y', `${y * -3.2}deg`);
      raf = requestAnimationFrame(apply);
    };

    const onMove = (event) => {
      const rect = stage.getBoundingClientRect();
      targetX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
      targetY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));
    };
    const onLeave = () => {
      targetX = 0;
      targetY = 0;
    };

    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(apply);
    return () => {
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [reduced, wide]);

  if (!wide) return null;

  return (
    <div ref={stageRef} className={styles.stage} aria-hidden="true">
      <span className={styles.ambient} />
      <div className={styles.mesh}>
        {BANDS.map((band, i) => (
          <div
            key={band.band}
            ref={(el) => {
              bandRefs.current[i] = el;
            }}
            className={styles.band}
            data-depth={band.depth.toFixed(2)}
          >
            {band.shards.map((tri) => (
              <span
                key={tri.key}
                className={styles.shard}
                style={{
                  left: `${tri.box.left}%`,
                  top: `${tri.box.top}%`,
                  width: `${tri.box.width}%`,
                  height: `${tri.box.height}%`,
                  clipPath: tri.clip,
                  backgroundImage: `url(${tri.img})`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className={styles.center}>
        <span className={styles.centerGlow} />
        <span className={styles.centerRing} />
        <img className={styles.centerLogo} src={logoUrl} width={68} height={68} alt="" />
      </div>
    </div>
  );
}
