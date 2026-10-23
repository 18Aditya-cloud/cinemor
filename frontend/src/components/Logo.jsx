import logoUrl from '../assets/images/cinemor-logo.png';
import { SITE } from '../config/site.js';
import cx from '../utils/cx.js';
import styles from './Logo.module.css';

// Logo mark + "Cinemor AI" wordmark. Used in the navbar and the footer.
export default function Logo({ size = 36, className }) {
  return (
    <span className={cx(styles.logo, className)}>
      <img className={styles.mark} src={logoUrl} width={size} height={size} alt="" />
      <span className={styles.word}>
        {SITE.wordmark.main}
        <span className={styles.accent}> {SITE.wordmark.accent}</span>
      </span>
    </span>
  );
}
