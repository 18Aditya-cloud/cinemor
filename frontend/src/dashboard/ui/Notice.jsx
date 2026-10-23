import { IconAlert } from './DashIcons.jsx';
import styles from './Notice.module.css';

/**
 * The amber message bar at the top of a page when something could not be loaded or done, for example
 * "Only organization administrators can perform this action." with a Retry button.
 */
export default function Notice({ message, onRetry }) {
  return (
    <div className={styles.notice} role="alert">
      <IconAlert width={18} height={18} />
      <span className={styles.message}>{message}</span>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
