import { useRef } from 'react';
import logoUrl from '../../assets/images/cinemor-logo.png';
import darkUrl from '../../assets/images/cinemor-logo-3d-dark.png';
import midUrl from '../../assets/images/cinemor-logo-3d-mid.png';
import useInView from '../../hooks/useInView.js';
import styles from './Logo3D.module.css';

// How many thin copies of the logo are stacked to give it real thickness. More = a smoother solid
// edge when it turns side-on; fewer = lighter for the browser.
const SLICES = 40;

/**
 * The Cinemor logo as a slowly turning 3D model, with a soft glow.
 *
 * It is the flat logo picture stacked many times, each copy a hair further back, so it has depth and looks
 * solid from the side as it turns. The copies in the middle are darker than the ones at the front and back,
 * which reads as shading (they are darker copies of the picture made in advance, so the browser has no filters
 * to compute while it turns). A band of light also glides across the front face, and a soft halo glows behind it.
 * It stops turning while it is scrolled out of view.
 *
 * Size: set --size on it (or a parent) to change how big it is. With "reduce motion" on, it does not turn:
 * it stays angled so its thickness is still visible.
 */
export default function Logo3D({ className }) {
  const ref = useRef(null);
  const visible = useInView(ref, { rootMargin: '80px 0px' });
  return (
    <div ref={ref} className={`${styles.stage} ${className || ''}`} style={{ '--logo': `url(${logoUrl})` }} data-active={visible} aria-hidden="true">
      <span className={styles.glow} />
      <img className={styles.halo} src={midUrl} alt="" draggable={false} />
      <div className={styles.lit}>
        <div className={styles.scene}>
          <div className={styles.float}>
            <div className={styles.tilt}>
              <div className={styles.spin}>
                {Array.from({ length: SLICES }, (_, i) => {
                  const t = i / (SLICES - 1) - 0.5; // -0.5 (back) ... +0.5 (front)
                  const edge = Math.abs(t) * 2; // 1 at the front and back faces, 0 in the middle
                  const src = edge > 0.86 ? logoUrl : edge > 0.5 ? midUrl : darkUrl; // front/back faces bright, body darker
                  // on small screens every other body layer is hidden (see .thin in the CSS) to keep it light
                  const thin = i % 2 === 1 && i !== SLICES - 1 ? styles.thin : '';
                  return <img key={i} className={`${styles.slice} ${thin}`} src={src} alt="" draggable={false} style={{ transform: `translateZ(calc(var(--depth) * ${t.toFixed(4)}))` }} />;
                })}
                <span className={styles.shine} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
