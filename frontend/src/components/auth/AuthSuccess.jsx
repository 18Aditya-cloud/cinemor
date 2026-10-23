import { useEffect, useRef } from 'react';
import { Check } from '../Icons.jsx';
import styles from './AuthSuccess.module.css';

// A round icon, a title, a line of text and (optionally) buttons. Shown after a successful log in or sign up, and on the
// password reset pages. `icon` defaults to a tick. With buttons inside (children) it is not a live region; instead the
// heading takes the keyboard focus when it appears, so a screen reader reads it.
export default function AuthSuccess({ title, text, icon: Icon = Check, children }) {
  const heading = useRef(null);
  useEffect(() => {
    if (children) heading.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={styles.wrap} role={children ? undefined : 'status'}>
      <span className={styles.ring} aria-hidden="true">
        <Icon width={34} height={34} />
      </span>
      <h1 ref={heading} tabIndex={-1} className={styles.title}>
        {title}
      </h1>
      <p className={styles.text}>{text}</p>
      {children}
    </div>
  );
}
