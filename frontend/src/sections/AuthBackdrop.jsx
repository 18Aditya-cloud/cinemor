import bgUrl from '../assets/images/auth-bg.jpg';
import styles from './AuthBackdrop.module.css';

/**
 * The backdrop behind Log in / Sign up: a still image (a planet's horizon against a violet galaxy) instead
 * of the landing page's eclipse video. It sits under the particle canvas exactly the way HeroBackground does
 * (see App.jsx — same layer order, same z-index), so the same drifting particles carry over here too; only
 * the picture behind them changes.
 */
export default function AuthBackdrop() {
  return (
    <div className={styles.layer} aria-hidden="true">
      <img className={styles.img} src={bgUrl} alt="" />
      <div className={styles.wash} />
    </div>
  );
}
