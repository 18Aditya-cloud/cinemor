import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { IconCheckCircle } from './DashIcons.jsx';
import styles from './Toast.module.css';

/**
 * Small confirmation messages in the corner ("Client created"). They go away by themselves.
 *   const toast = useToast();  toast('Client created');
 */
const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const push = useCallback((message) => {
    const id = ++counter.current;
    setToasts((list) => [...list, { id, message }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3600);
  }, []);

  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.stack} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={styles.toast}>
            <IconCheckCircle width={18} height={18} />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
