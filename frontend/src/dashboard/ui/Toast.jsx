import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import cx from '../../utils/cx.js';
import { IconAlert, IconCheckCircle } from './DashIcons.jsx';
import styles from './Toast.module.css';

/**
 * Small messages in the corner. They go away by themselves.
 *   const toast = useToast();
 *   toast('Client created');                 done: green tick
 *   toast(err.message, 'error');             refused or failed: red, with a warning sign (stays a little longer)
 */
const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const push = useCallback((message, tone = 'success') => {
    const id = ++counter.current;
    const error = tone === 'error';
    setToasts((list) => {
      // the same refusal twice in a row (a button pressed again) is shown once
      if (list.some((t) => t.message === message && t.error === error)) return list;
      return [...list, { id, message, error }];
    });
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), error ? 5200 : 3600);
  }, []);

  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.stack} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={cx(styles.toast, toast.error && styles.error)} role={toast.error ? 'alert' : undefined}>
            {toast.error ? <IconAlert width={18} height={18} /> : <IconCheckCircle width={18} height={18} />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);