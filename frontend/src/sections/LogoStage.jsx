import { forwardRef } from 'react';
import { HAND_SCENE } from '../data/content.js';
import cx from '../utils/cx.js';
import handUrl from '../assets/images/hand.webp';
import styles from './LogoStage.module.css';

/**
 * A tall scroll section with one scene in it: a hand rises from below, swinging and turning,
 * and the Cinemor logo (made of particles) floats above its palm and slowly rotates.
 * Three short lines sit around the logo. When you keep scrolling, the hand sinks away, the
 * lines fade, and the particles scatter.
 *
 * This component draws the hand, the lines and the ring. The logo itself is drawn by the
 * particle canvas behind the page. The engine (particles/engine.js) writes three CSS variables
 * onto this section, and everything here just reads them:
 *   --cm-hand      0..1  how far the hand has risen (drives the hand and the lines)
 *   --cm-formed    0..1  how gathered the particles are (drives the ring)
 *   --cm-logo-y / --cm-logo-size   where the logo is, so the ring and lines can be placed around it
 * The ref is handed to <ParticleField /> so the engine can read the scroll position and
 * receive drag events from here.
 */
const LogoStage = forwardRef(function LogoStage(_, ref) {
  return (
    <section ref={ref} className={styles.stage} aria-label="Interactive 3D Cinemor AI logo held in a hand">
      <div className={styles.sticky}>
        <svg className={styles.hud} viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
          <circle className={styles.ringFaint} r="98" />
          <circle className={styles.ringDots} r="93" />
          <circle className={styles.ringArcs} r="86" />
        </svg>

        <p className={cx(styles.label, styles.top)}>{HAND_SCENE.top}</p>
        <p className={cx(styles.label, styles.left)}>{HAND_SCENE.left}</p>
        <p className={cx(styles.label, styles.right)}>{HAND_SCENE.right}</p>

        <div className={styles.hand} aria-hidden="true">
          <div className={styles.float}>
            <img className={styles.img} src={handUrl} alt="" width="760" height="795" draggable={false} />
          </div>
        </div>

        <p className="cm-sr-only">
          Decorative 3D logo made of particles, held in a hand. With a mouse or touch you can drag it to rotate.
        </p>
      </div>
    </section>
  );
});

export default LogoStage;
