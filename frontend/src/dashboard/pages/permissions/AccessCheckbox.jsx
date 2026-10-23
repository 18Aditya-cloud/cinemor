import { IconCheck } from '../../ui/DashIcons.jsx';
import styles from './Permissions.module.css';

/** A labelled checkbox (a real one, so the keyboard and screen readers work) for the lists in Role Details. */
export default function AccessCheckbox({ checked, onChange, label, disabled }) {
  return (
    <label className={styles.checkRow}>
      <input type="checkbox" className={styles.checkInput} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className={styles.checkBox} aria-hidden="true">
        <IconCheck width={13} height={13} strokeWidth={3} />
      </span>
      <span>{label}</span>
    </label>
  );
}
