import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import cx from '../../utils/cx.js';
import { IconClose } from './DashIcons.jsx';
import styles from './Modal.module.css';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A pop-up window. It keeps the keyboard inside while open, closes with Esc, the X, or a click outside,
 * locks the page behind it, and puts the focus back where it was when it closes.
 *
 * `side` makes it a panel that slides in from the right edge (used for Role Details on narrower screens).
 *
 *   <Modal open={open} onClose={close} title="Create Client" subtitle="Add a client to your organization."
 *          icon={IconBuilding} divider>
 *     <form>...<ModalFooter>...</ModalFooter></form>
 *   </Modal>
 */
export default function Modal({ open, onClose, title, subtitle, icon: Icon, divider = false, wide = false, side = false, children }) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef(null);
  const returnFocus = useRef(null);
  const pressedBackdrop = useRef(false);
  const titleId = useId();

  // stay in the page for a moment while the closing animation plays
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return undefined;
    }
    if (!mounted) return undefined;
    setClosing(true);
    const timer = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 180);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // focus the first field, lock the page, and give the focus back on close
  useEffect(() => {
    if (!open) return undefined;
    returnFocus.current = document.activeElement;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector('[data-autofocus], input:not([disabled]), textarea:not([disabled]), button[aria-haspopup]');
      (first || dialogRef.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      root.style.overflow = previousOverflow;
      returnFocus.current?.focus?.();
    };
  }, [open]);

  // Esc closes; Tab stays inside the window
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Render as soon as `open` is true (not one step later), so the focus code below finds the window.
  if (!open && !mounted) return null;

  return createPortal(
    <div className="cm-scope">
      <div
        className={cx(styles.overlay, side && styles.sideOverlay, closing && styles.closing)}
        onMouseDown={(event) => {
          pressedBackdrop.current = event.target === event.currentTarget;
        }}
        onClick={(event) => {
          // only a click that started AND ended on the dark area closes it (not a text selection that drifted out)
          if (pressedBackdrop.current && event.target === event.currentTarget) onClose();
        }}
      >
        <div ref={dialogRef} className={cx(styles.card, wide && styles.wide, side && styles.sideCard)} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
          <header className={cx(styles.head, divider && styles.divider)}>
            {Icon && (
              <span className={styles.tile} aria-hidden="true">
                <Icon width={22} height={22} />
              </span>
            )}
            <div className={styles.titles}>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
              <IconClose width={18} height={18} />
            </button>
          </header>
          <div className={styles.body}>{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The buttons row at the bottom of a modal form (Cancel and the main action). */
export function ModalFooter({ children }) {
  return <div className={styles.footer}>{children}</div>;
}
