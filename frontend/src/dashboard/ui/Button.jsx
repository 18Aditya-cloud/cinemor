import cx from '../../utils/cx.js';
import styles from './Button.module.css';

/**
 * The dashboard button.
 *   variant="primary"    the gradient action button ("Create Project")
 *   variant="secondary"  a quiet dark button ("Cancel", "Update", "Refresh")
 *   variant="danger"     a red outlined button for deleting things
 *   iconOnly             a square button with just an icon (the refresh button); give it an aria-label (any text
 *                        children are not shown, since the square has no room for them)
 * `icon` is an icon component shown before the text. `loading` shows a spinner and blocks clicks.
 */
export default function Button({ variant = 'primary', icon: Icon, iconOnly = false, loading = false, className, children, ...rest }) {
  return (
    <button
      type="button"
      className={cx(styles.btn, styles[variant], iconOnly && styles.iconOnly, loading && styles.loading, className)}
      aria-busy={loading || undefined}
      {...rest}
      disabled={rest.disabled || loading}
    >
      {loading && !iconOnly ? <span className={styles.spinner} aria-hidden="true" /> : Icon ? <Icon width={18} height={18} /> : null}
      {children && !iconOnly && <span>{children}</span>}
    </button>
  );
}
