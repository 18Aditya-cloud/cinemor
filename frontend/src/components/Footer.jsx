import { SITE } from '../config/site.js';
import Logo from './Logo.jsx';
import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <Logo size={28} />
      <p className={styles.copy}>
        &copy; {new Date().getFullYear()} {SITE.name}. All rights reserved.
      </p>
    </footer>
  );
}
