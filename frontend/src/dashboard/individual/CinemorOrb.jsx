import logoUrl from '../../assets/images/cinemor-logo.png';
import cx from '../../utils/cx.js';
import o from './CinemorOrb.module.css';

/**
 * The Cinemor logo as a living "orb": it floats and sways gently, a soft glow breathes behind it, a light sweeps
 * across it now and then, and a thin ring circles it with a spark travelling round (the half of the ring in front
 * of the logo is drawn over it, the other half behind, so it really goes round).
 *
 *   size  'lg' (the Story page's hero) | 'sm' (the chat avatar next to "Building your story")
 *   busy  while a story is being written: the ring spins faster and the glow pulses
 *
 * With "reduce motion" on, it stays still.
 */
export default function CinemorOrb({ size = 'lg', busy = false, className }) {
  return (
    <span className={cx(o.orb, size === 'sm' && o.sm, busy && o.busy, className)} style={{ '--logo': `url(${logoUrl})` }} aria-hidden="true">
      <span className={o.glow} />
      <span className={o.float}>
        <Ring />
        <span className={o.mark}>
          <img className={o.logo} src={logoUrl} alt="" draggable={false} />
          <span className={o.shine} />
        </span>
        <Ring front />
      </span>
    </span>
  );
}

// The ring is drawn twice: once behind the logo (all of it) and once in front (only its near, lower half).
function Ring({ front = false }) {
  return (
    <span className={cx(o.ringClip, front && o.ringFront)}>
      <span className={o.ringTilt}>
        <span className={o.ring} />
        <span className={o.track}>
          <span className={o.spark} />
        </span>
      </span>
    </span>
  );
}
