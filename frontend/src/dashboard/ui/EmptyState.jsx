import cx from '../../utils/cx.js';
import styles from './EmptyState.module.css';

/**
 * "Nothing here yet": an icon tile, a title, one line of help and optionally a button.
 * `framed` (the default) puts it in a large card; Tools uses it without one.
 */
export default function EmptyState({ icon: Icon, title, text, action, framed = true }) {
  return (
    <section className={cx(styles.empty, framed && styles.framed)}>
      <span className={styles.tile} aria-hidden="true">
        <Icon width={28} height={28} />
      </span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.text}>{text}</p>
      {action && <div className={styles.action}>{action}</div>}
    </section>
  );
}
