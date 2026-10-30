import { useEffect, useMemo, useRef } from 'react';
import { CREATION_WALL, MODEL_STRIPS } from '../data/content.js';
import { MODEL_LOGOS } from '../data/modelLogos.js';
import styles from './CreationWall.module.css';

/**
 * Under the hand scene: a wall of films and pictures made with Cinemor AI, edge to edge, drifting slowly up and down
 * behind frosted glass, with one glassy button in the middle ("Create your first"). The wall is only a backdrop:
 * nothing on it can be clicked, and screen readers skip it. Above and below, two strips of the models we use move
 * in opposite directions (top: left to right, bottom: right to left).
 *
 * Everything moves only while the section is on screen, and stays still for people who ask for reduced motion
 * (then the clips show their still picture).
 */
const COLUMNS = 7;

export default function CreationWall({ onCreate }) {
  const ref = useRef(null);
  const columns = useMemo(() => {
    const tiles = CREATION_WALL.tiles;
    // each column starts at a different tile, so the same picture never sits side by side
    return Array.from({ length: COLUMNS }, (_, c) => {
      const list = [];
      for (let i = 0; i < 5; i += 1) list.push(tiles[(c * 3 + i * 2) % tiles.length]);
      return list;
    });
  }, []);

  // play (and move) only while visible
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const set = (on) => {
      el.dataset.live = on && !still ? 'true' : 'false';
      el.querySelectorAll('video').forEach((v) => {
        if (on && !still) v.play().catch(() => {});
        else v.pause();
      });
    };
    if (!('IntersectionObserver' in window)) {
      set(true);
      return undefined;
    }
    const io = new IntersectionObserver(([e]) => set(e.isIntersecting), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className={styles.section} data-live="false">
      <Strip items={MODEL_STRIPS.top} direction="right" />

      <div className={styles.stage}>
        <div className={styles.wall} aria-hidden="true">
          {columns.map((list, c) => (
            <div key={c} className={styles.col} data-dir={c % 2 ? 'down' : 'up'} style={{ '--speed': `${70 + (c % 3) * 14}s` }}>
              {/* the list twice, so the loop has no seam */}
              {[...list, ...list].map((t, i) => (
                <div key={i} className={styles.tile} style={{ aspectRatio: `1 / ${t.ratio}` }}>
                  {t.video ? (
                    <video src={t.video} poster={t.image} muted loop playsInline preload="metadata" style={{ objectPosition: t.focus }} />
                  ) : (
                    <img src={t.image} alt="" loading="lazy" decoding="async" style={{ objectPosition: t.focus }} />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className={styles.glass}>
          <button type="button" className={styles.cta} onClick={onCreate}>
            <span className={styles.halo} aria-hidden="true" />
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2l2.2 6.3L20.5 10.5l-6.3 2.2L12 19l-2.2-6.3L3.5 10.5l6.3-2.2z" />
              <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" opacity=".7" />
            </svg>
            {CREATION_WALL.cta}
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} className={styles.spark} aria-hidden="true" />
            ))}
          </button>
        </div>
      </div>

      <Strip items={MODEL_STRIPS.bottom} direction="left" />
    </section>
  );
}

function Strip({ items, direction }) {
  // repeated so one copy always covers the widest screen; the row moves by exactly one copy
  const copy = [...items, ...items];
  return (
    <div className={styles.strip} data-dir={direction} aria-label="Models Cinemor AI works with">
      <div className={styles.row}>
        {[copy, copy].map((list, half) => (
          <div key={half} className={styles.half} aria-hidden={half === 1 || undefined}>
            {list.map((m, i) => (
              <span key={i} className={styles.model}>
                {m.logo && MODEL_LOGOS[m.logo] && (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d={MODEL_LOGOS[m.logo]} />
                  </svg>
                )}
                {m.name}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}