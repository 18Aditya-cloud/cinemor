import { useEffect, useId, useRef, useState } from 'react';
import cx from '../../utils/cx.js';
import { IconChevronDown, IconCheck, IconAlert } from './DashIcons.jsx';
import styles from './SelectField.module.css';

/**
 * A dropdown that matches the rest of the form. Works with the mouse and the keyboard
 * (Arrow keys, Home/End, Enter or Space to pick, Esc to close, and typing a letter jumps to it).
 *
 * options: [{ value, label }]. `emptyText` is shown inside the list when there is nothing to pick.
 */
export default function SelectField({ id, label, requiredMark, icon: Icon, placeholder, options, value, onChange, error, hint, emptyText, disabled }) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const selectedIndex = options.findIndex((o) => String(o.value) === String(value));
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return undefined;
    const onOutside = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const openList = () => {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : options.length ? 0 : -1);
    setOpen(true);
  };
  const pick = (index) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (event) => {
    const { key } = event;
    if (key === 'Escape' && open) {
      event.stopPropagation(); // close the list, not the window it is in
      setOpen(false);
      return;
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      if (!open) return openList();
      const step = key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (options.length ? (i + step + options.length) % options.length : -1));
      return undefined;
    }
    if (key === 'Home' || key === 'End') {
      if (!open) return undefined;
      event.preventDefault();
      setActive(key === 'Home' ? 0 : options.length - 1);
      return undefined;
    }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (!open) openList();
      else pick(active);
      return undefined;
    }
    if (key === 'Tab') setOpen(false);
    else if (key.length === 1 && /\S/.test(key)) {
      const index = options.findIndex((o) => o.label.toLowerCase().startsWith(key.toLowerCase()));
      if (index >= 0) {
        if (!open) setOpen(true);
        setActive(index);
      }
    }
    return undefined;
  };

  return (
    <div className={cx(styles.field, error && styles.hasError)} ref={wrapRef}>
      <label className={styles.label} id={`${uid}-label`} htmlFor={id}>
        {label}
        {requiredMark && (
          <span className={styles.req} aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <div className={styles.control}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className={cx(styles.button, open && styles.open)}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${uid}-label ${id}`}
        aria-activedescendant={open && active >= 0 ? `${uid}-opt-${active}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-required={requiredMark || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        {Icon && <Icon width={18} height={18} className={styles.icon} />}
        <span className={cx(styles.value, !selected && styles.placeholder)}>{selected ? selected.label : placeholder}</span>
        <IconChevronDown width={18} height={18} className={cx(styles.chevron, open && styles.flip)} />
      </button>

      {open && (
        <ul id={listId} className={styles.list} role="listbox" aria-labelledby={`${uid}-label`}>
          {options.length === 0 && <li className={styles.empty}>{emptyText || 'Nothing to choose yet.'}</li>}
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${uid}-opt-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              className={cx(styles.option, index === active && styles.active, index === selectedIndex && styles.chosen)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(index)}
            >
              <span>{option.label}</span>
              {index === selectedIndex && <IconCheck width={16} height={16} />}
            </li>
          ))}
        </ul>
      )}
      </div>

      <div className={styles.msgWrap} data-open={Boolean(error || hint)}>
        <p className={cx(styles.msg, !error && hint && styles.hint)} role={error ? 'alert' : undefined}>
          {error && <IconAlert width={16} height={16} />}
          <span>{error || hint}</span>
        </p>
      </div>
    </div>
  );
}
