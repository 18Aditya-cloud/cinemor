import { useRef } from 'react';
import usePointerGlow from '../hooks/usePointerGlow.js';
import cx from '../utils/cx.js';
import { ArrowUpRight } from './Icons.jsx';
import styles from './PillButton.module.css';

/**
 * Secondary button: a glossy dark pill with a small arrow, like "Try now ↗".
 * A soft light follows the cursor, and the arrow nudges outward on hover.
 */
export default function PillButton({ children, icon = <ArrowUpRight width={16} height={16} />, className, ...rest }) {
  const ref = useRef(null);
  usePointerGlow(ref);

  return (
    <button ref={ref} type="button" className={cx(styles.pill, className)} {...rest}>
      <span className={styles.label}>{children}</span>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}
