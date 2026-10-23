import { useRef } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { homeFor } from '../auth/homeFor.js';
import usePointerGlow from '../hooks/usePointerGlow.js';
import { Link, useRouter } from '../router/router.jsx';
import styles from './Login.module.css';

/**
 * The button at the top right of the navbar. It links to the right page:
 *   signed out, on the home page    -> "Log in"  (/login)
 *   on the Log in page              -> "Sign up" (/signup)
 *   on the Sign up page             -> "Log in"  (/login)
 *   signed in                       -> "Dashboard" (organizations, /organization) or "Studio" (individuals, /app)
 */
export default function Login() {
  const ref = useRef(null);
  const { path } = useRouter();
  const { user } = useAuth();
  usePointerGlow(ref);

  let to = '/login';
  let label = 'Log in';
  if (user) {
    to = homeFor(user);
    label = to === '/app' ? 'Studio' : 'Dashboard';
  } else if (path === '/login') {
    to = '/signup';
    label = 'Sign up';
  }

  return (
    <Link ref={ref} to={to} className={styles.trigger}>
      <span className={styles.triggerLabel}>
        <span className={styles.roll}>
          <span>{label}</span>
          <span aria-hidden="true">{label}</span>
        </span>
      </span>
    </Link>
  );
}
