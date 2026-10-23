import cx from '../../utils/cx.js';
import styles from './StatCard.module.css';

/**
 * A small number card: icon tile, label, big value.
 * `shout` writes the label in tracked capitals ("TOTAL EMPLOYEES"); `compact` keeps the card narrow.
 */
export function StatGrid({ columns = 3, compact = false, children }) {
  return (
    <div className={cx(styles.grid, compact && styles.compactGrid)} style={{ '--cols': columns }}>
      {children}
    </div>
  );
}

export default function StatCard({ icon: Icon, label, value, shout = false }) {
  return (
    <div className={styles.card}>
      <span className={styles.tile} aria-hidden="true">
        <Icon width={20} height={20} />
      </span>
      <div>
        <p className={cx(styles.label, shout && styles.shout)}>{label}</p>
        <p className={styles.value}>{value}</p>
      </div>
    </div>
  );
}
