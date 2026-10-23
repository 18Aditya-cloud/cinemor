import { useEffect, useState } from 'react';
import { isHomePath, Link, useRouter } from '../router/router.jsx';
import cx from '../utils/cx.js';
import Logo from './Logo.jsx';
import Login from './Login.jsx';
import styles from './Navbar.module.css';

// Top bar: logo + "Cinemor AI" on the left, the Log in / Sign up button on the right.
// It starts transparent over the hero and gains a frosted background once you scroll.
export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const { path } = useRouter();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={cx(styles.nav, scrolled && styles.scrolled)}>
      <div className={styles.inner}>
        {isHomePath(path) ? (
          <a className={styles.brand} href="#top" aria-label="Cinemor AI, back to top">
            <Logo />
          </a>
        ) : (
          <Link className={styles.brand} to="/" aria-label="Cinemor AI, home">
            <Logo />
          </Link>
        )}
        <Login />
      </div>
    </header>
  );
}
