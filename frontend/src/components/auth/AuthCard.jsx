import { useEffect, useRef } from 'react';
import logoUrl from '../../assets/images/cinemor-logo.png';
import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion.js';
import { Link } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import styles from './AuthCard.module.css';

/**
 * The glass card that holds the Log in / Sign up forms, with the Cinemor logo centred above the two-way
 * switch on top (mode="welcome" is the same card without the switch, used by /choose-account). The card
 * stays put when you switch, so the highlight slides from one tab to the other. Change `shake` (a number)
 * to make the card shake, which the forms do when something is wrong.
 */
export default function AuthCard({ mode, shake = 0, children }) {
  const showTabs = mode === 'login' || mode === 'signup';
  const ref = useRef(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!shake || reduced || !ref.current?.animate) return;
    ref.current.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-9px)' },
        { transform: 'translateX(8px)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 420, easing: 'ease-out' },
    );
  }, [shake, reduced]);

  return (
    <div ref={ref} className={cx(styles.card, !showTabs && styles.plain)}>
      <Link to="/" className={styles.logo} aria-label="Cinemor AI, home">
        {/* the tile is its own element (not the link's own background) so the glow behind it can sit
            underneath it — a pseudo-element glow on the same element paints OVER that element's background */}
        <span className={styles.logoTile}>
          <img src={logoUrl} width={46} height={46} alt="" />
        </span>
      </Link>
      {showTabs && (
        <nav className={styles.tabs} data-active={mode} aria-label="Log in or sign up">
          <span className={styles.thumb} aria-hidden="true" />
          <Link to="/login" className={styles.tab} aria-current={mode === 'login' ? 'page' : undefined}>
            Log in
          </Link>
          <Link to="/signup" className={styles.tab} aria-current={mode === 'signup' ? 'page' : undefined}>
            Sign up
          </Link>
        </nav>
      )}
      {children}
    </div>
  );
}
