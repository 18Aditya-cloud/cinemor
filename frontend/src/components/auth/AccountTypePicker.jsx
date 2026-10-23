import { useRef } from 'react';
import usePointerGlow from '../../hooks/usePointerGlow.js';
import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion.js';
import cx from '../../utils/cx.js';
import { Building, Check, Person } from '../Icons.jsx';
import styles from './AccountTypePicker.module.css';

const ICONS = { individual: Person, organization: Building };

/**
 * The two big choices at the start of Sign up: Individual or Organization.
 * Each card follows the cursor with a soft light and a slight tilt, and shows a tick once chosen.
 */
export default function AccountTypePicker({ types, value, onSelect }) {
  return (
    <div className={styles.group} role="group" aria-label="Choose an account type">
      {types.map((type) => (
        <TypeCard key={type.id} type={type} selected={value === type.id} onSelect={() => onSelect(type.id)} />
      ))}
    </div>
  );
}

function TypeCard({ type, selected, onSelect }) {
  const ref = useRef(null);
  const reduced = usePrefersReducedMotion();
  const Icon = ICONS[type.id] || Person;
  usePointerGlow(ref); // the light that follows the cursor

  const tilt = (event) => {
    if (reduced || event.pointerType !== 'mouse') return;
    const rect = ref.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    ref.current.style.setProperty('--ry', `${(x * 9).toFixed(2)}deg`);
    ref.current.style.setProperty('--rx', `${(-y * 9).toFixed(2)}deg`);
  };
  const untilt = () => {
    ref.current.style.setProperty('--rx', '0deg');
    ref.current.style.setProperty('--ry', '0deg');
  };

  return (
    <button
      ref={ref}
      type="button"
      className={cx(styles.card, selected && styles.selected)}
      aria-pressed={selected}
      onClick={onSelect}
      onPointerMove={tilt}
      onPointerLeave={untilt}
    >
      <span className={styles.badge} aria-hidden="true">
        <Check width={14} height={14} />
      </span>
      <span className={styles.icon} aria-hidden="true">
        <Icon width={26} height={26} />
      </span>
      <span className={styles.title}>{type.title}</span>
      <span className={styles.text}>{type.text}</span>
    </button>
  );
}
