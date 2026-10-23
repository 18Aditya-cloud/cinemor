import { useState } from 'react';
import { Eye, EyeOff } from '../Icons.jsx';
import TextField from './TextField.jsx';
import styles from './PasswordField.module.css';

/**
 * A password input with a show/hide button and a "Caps Lock is on" warning.
 * Same props as TextField.
 */
export default function PasswordField({ hint, onBlur, ...props }) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);

  const checkCaps = (event) => setCaps(Boolean(event.getModifierState?.('CapsLock')));

  return (
    <TextField
      {...props}
      type={show ? 'text' : 'password'}
      hint={caps ? 'Caps Lock is on' : hint}
      hintTone={caps ? 'warn' : props.hintTone}
      onKeyDown={checkCaps}
      onKeyUp={checkCaps}
      onBlur={(event) => {
        setCaps(false);
        onBlur?.(event);
      }}
      spellCheck={false}
      autoCapitalize="none"
      trailing={
        <button
          type="button"
          className={styles.eye}
          onClick={() => setShow((value) => !value)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
        >
          {show ? <EyeOff width={20} height={20} /> : <Eye width={20} height={20} />}
        </button>
      }
    />
  );
}
