import { useCallback, useState } from 'react';
import AuthCard from '../components/auth/AuthCard.jsx';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import LoginForm from './LoginForm.jsx';
import SignupForm from './SignupForm.jsx';
import styles from './AuthPage.module.css';

/**
 * The Log in and Sign up pages (/login and /signup). They share one card, centered on the page, so
 * switching between them slides the tab highlight instead of reloading the whole thing.
 *
 * (The broken-mirror photo-shard scene that used to sit beside the card on a wide screen,
 * src/components/auth/AuthShards.jsx, is not used here any more — back to a single centered card, as
 * it was before that. The component's files are still in the project, unused, in case it comes back.)
 */
export default function AuthPage({ mode }) {
  const [shake, setShake] = useState(0);
  const bump = useCallback(() => setShake((n) => n + 1), []);
  useDocumentTitle(mode === 'login' ? 'Log in' : 'Sign up');

  return (
    <div className={styles.page}>
      <AuthCard mode={mode} shake={shake}>
        <div key={mode} className={styles.swap}>
          {mode === 'login' ? <LoginForm onInvalid={bump} /> : <SignupForm onInvalid={bump} />}
        </div>
      </AuthCard>
    </div>
  );
}
