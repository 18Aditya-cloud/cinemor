import { useRef, useState } from 'react';
import usePointerGlow from '../hooks/usePointerGlow.js';
import cx from '../utils/cx.js';
import { ArrowRight } from './Icons.jsx';
import styles from './GlowButton.module.css';

/**
 * The shared "alive" primary button. It has:
 *  - a moving gradient fill
 *  - a light that follows the cursor
 *  - a small magnetic pull toward the cursor
 *  - a shine sweep on hover and a ripple on click
 * Create.jsx and the login form's submit button both use it.
 */
export default function GlowButton({
  children,
  icon,
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  onClick,
  className,
  ...rest
}) {
  const ref = useRef(null);
  const [ripples, setRipples] = useState([]);
  usePointerGlow(ref, { magnet: 7 });

  const handleClick = (event) => {
    const rect = ref.current.getBoundingClientRect();
    // A keyboard "click" has no pointer position, so ripple from the centre.
    const fromKeyboard = event.detail === 0;
    const id = `${Date.now()}-${Math.random()}`;
    const ripple = {
      id,
      x: fromKeyboard ? rect.width / 2 : event.clientX - rect.left,
      y: fromKeyboard ? rect.height / 2 : event.clientY - rect.top,
    };
    setRipples((list) => [...list, ripple]);
    setTimeout(() => setRipples((list) => list.filter((r) => r.id !== id)), 750);
    onClick?.(event);
  };

  return (
    <button
      ref={ref}
      type={type}
      className={cx(styles.btn, styles[size], loading && styles.loading, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      <span className={styles.fill} aria-hidden="true" />
      <span className={styles.spot} aria-hidden="true" />
      <span className={styles.shine} aria-hidden="true" />
      <span className={styles.content}>
        {icon}
        <span className={styles.label}>{children}</span>
        <span className={styles.arrow} aria-hidden="true">
          <ArrowRight width={20} height={20} />
        </span>
      </span>
      {ripples.map((r) => (
        <span key={r.id} className={styles.ripple} style={{ left: r.x, top: r.y }} aria-hidden="true" />
      ))}
    </button>
  );
}
