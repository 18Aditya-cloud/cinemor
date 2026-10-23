import cx from '../../utils/cx.js';
import styles from './PageHeader.module.css';

/**
 * The top of every dashboard page: a small blue label, the page title, one line of description, and
 * the page's buttons on the right (refresh, "Create ..." ).
 * `stacked` is the Tools layout: an icon tile beside the title and the buttons underneath.
 */
export default function PageHeader({ title, subtitle, actions, icon: Icon, stacked = false }) {
  return (
    <header className={cx(styles.header, stacked && styles.stacked)}>
      <div className={styles.block}>
        {Icon && (
          <span className={styles.tile} aria-hidden="true">
            <Icon width={22} height={22} />
          </span>
        )}
        <div className={styles.text}>
          {!stacked && <p className={styles.eyebrow}>Organization Workspace</p>}
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
