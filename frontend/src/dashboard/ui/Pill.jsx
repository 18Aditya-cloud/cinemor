import cx from '../../utils/cx.js';
import styles from './Pill.module.css';

// A small coloured badge: tone = 'amber' | 'green' | 'violet' | 'blue' | 'red' | 'gray'
export default function Pill({ tone = 'gray', children }) {
  return <span className={cx(styles.pill, styles[tone])}>{children}</span>;
}
