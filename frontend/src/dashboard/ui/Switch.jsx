import cx from '../../utils/cx.js';
import styles from './Switch.module.css';

// An on/off toggle (for Team Leader / Reviewer). Give it a label that says what it switches, e.g. "Team Leader for a@b.com".
export default function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx(styles.switch, checked && styles.on)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} />
    </button>
  );
}
