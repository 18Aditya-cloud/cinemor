import cx from '../../../utils/cx.js';
import { IconCheck } from '../../ui/DashIcons.jsx';
import styles from './Permissions.module.css';

/**
 * One box in the matrix: a green tick when the role is allowed, a dash when it is not. One click flips it.
 * It is a checkbox for screen readers; `label` names the role and the stage/resource.
 */
export default function AccessCell({ allowed, label, locked, onChange }) {
  return (
    <button type="button" role="checkbox" aria-checked={allowed} aria-label={label} className={cx(styles.cell, locked && styles.lockedCell)} disabled={locked} onClick={() => onChange(!allowed)}>
      {allowed ? (
        <span className={styles.check}>
          <IconCheck width={14} height={14} strokeWidth={3} />
        </span>
      ) : (
        <span className={styles.dash}>&ndash;</span>
      )}
    </button>
  );
}
