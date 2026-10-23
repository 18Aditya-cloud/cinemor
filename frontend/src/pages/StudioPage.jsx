import { useEffect } from 'react';
import { AUTH } from '../data/content.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { homeFor } from '../auth/homeFor.js';
import PillButton from '../components/PillButton.jsx';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import { useRouter } from '../router/router.jsx';
import styles from './AuthPage.module.css';

/**
 * A placeholder for the app itself (/app), shown after logging in or signing up.
 * Replace this page with your real studio once the backend is connected. If nobody is signed in,
 * it sends you to the Log in page.
 */
export default function StudioPage() {
  const { user, checking, signOut } = useAuth();
  const { navigate } = useRouter();
  useDocumentTitle('Studio');

  useEffect(() => {
    if (checking) return;
    if (!user) navigate('/login', { replace: true });
    else if (homeFor(user) !== '/app') navigate(homeFor(user), { replace: true }); // organizations, Team Leaders and individuals have their own dashboards
  }, [checking, user, navigate]);

  if (!user || homeFor(user) !== '/app') return null;
  const type = AUTH.types.find((t) => t.id === user.accountType);

  return (
    <div className={styles.page}>
      <section className={styles.studio} aria-labelledby="cm-studio-title">
        <h1 id="cm-studio-title" className={styles.title}>
          Your studio
        </h1>
        <p>
          Signed in as <strong>{user.email}</strong>
          {type ? ` (${type.title} account)` : ''}.
        </p>
        <p>This is where your stories will live. Replace this page with your app once the backend is connected.</p>
        <div className={styles.studioActions}>
          <PillButton
            icon={null}
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
          >
            Log out
          </PillButton>
        </div>
      </section>
    </div>
  );
}
