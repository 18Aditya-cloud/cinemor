import cx from '../../utils/cx.js';
import { AlertCircle, Check } from '../Icons.jsx';
import styles from './TextField.module.css';

/**
 * One labelled input with a message line under it.
 *  - `error`   red message + red border (also announced to screen readers)
 *  - `hint`    neutral message; `hintTone` can be 'ok' (green) or 'warn' (amber)
 *  - `success` green border + tick
 *  - `trailing` something inside the right end of the field (the password eye button)
 *  - `requiredMark` shows a red * after the label; `optionalMark` shows a small "Optional" tag
 *  - `multiline` makes it a textarea (`rows` sets its height)
 * Any other props (type, value, onChange, autoComplete...) go straight to the <input>.
 */
export default function TextField({
  id,
  label,
  error,
  hint,
  hintTone,
  success,
  trailing,
  inputRef,
  describedBy,
  className,
  requiredMark,
  optionalMark,
  multiline,
  rows = 4,
  ...inputProps
}) {
  const Control = multiline ? 'textarea' : 'input';
  const messageId = `${id}-msg`;
  const message = error || hint;
  return (
    <div className={cx(styles.field, error && styles.hasError, success && !error && styles.ok, trailing && styles.hasTrailing, className)}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {requiredMark && (
          <span className={styles.req} aria-hidden="true">
            {' '}
            *
          </span>
        )}
        {optionalMark && <span className={styles.opt}>Optional</span>}
      </label>
      <div className={styles.control}>
        <Control
          id={id}
          ref={inputRef}
          className={cx(styles.input, multiline && styles.textarea)}
          rows={multiline ? rows : undefined}
          aria-required={requiredMark || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={cx(message && messageId, describedBy) || undefined}
          {...inputProps}
        />
        {trailing && <span className={styles.trailing}>{trailing}</span>}
        {!trailing && success && !error && (
          <span className={styles.tick} aria-hidden="true">
            <Check width={18} height={18} />
          </span>
        )}
      </div>
      <div className={styles.msgWrap} data-open={Boolean(message)}>
        <p
          id={messageId}
          className={cx(styles.msg, error && styles.msgError, !error && hintTone && styles[`tone_${hintTone}`])}
          role={error ? 'alert' : undefined}
        >
          {error && <AlertCircle width={16} height={16} className={styles.msgIcon} />}
          <span>{message}</span>
        </p>
      </div>
    </div>
  );
}
