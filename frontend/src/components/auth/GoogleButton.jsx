import { useRef } from 'react';
import usePointerGlow from '../../hooks/usePointerGlow.js';
import { GoogleG } from '../Icons.jsx';
import styles from './GoogleButton.module.css';

/**
 * "Sign in with Google" / "Sign up with Google". It only reports the click; the page decides what
 * happens (see services/api.js, loginWithGoogle).
 */
export default function GoogleButton({ children, loading = false, disabled = false, onClick }) {
  const ref = useRef(null);
  usePointerGlow(ref);
  return (
    <button
      ref={ref}
      type="button"
      className={styles.google}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      <span className={styles.g}>{loading ? <span className={styles.spinner} aria-hidden="true" /> : <GoogleG />}</span>
      <span>{loading ? 'Connecting to Google' : children}</span>
    </button>
  );
}
