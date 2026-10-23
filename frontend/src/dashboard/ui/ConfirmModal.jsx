import { useEffect, useState } from 'react';
import Button from './Button.jsx';
import Modal, { ModalFooter } from './Modal.jsx';
import { IconTrash } from './DashIcons.jsx';

/**
 * "Are you sure?" for things that cannot be undone. `onConfirm` may throw; its message is shown in the window.
 *   <ConfirmModal open={...} title="Delete job role?" text="..." confirmLabel="Delete Role" onConfirm={...} onClose={...} />
 */
export default function ConfirmModal({ open, title, text, confirmLabel, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setBusy(false);
      setError('');
    }
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} icon={IconTrash} title={title}>
      <div style={{ display: 'grid', gap: 16 }}>
        <p style={{ color: 'var(--cm-ink-dim)', lineHeight: 1.55 }}>{text}</p>
        {error && (
          <p role="alert" style={{ padding: '12px 14px', border: '1px solid var(--d-danger-bd)', borderRadius: 14, background: 'var(--d-danger-bg)', color: 'var(--d-danger-fg-strong)', fontSize: '.9rem' }}>
            {error}
          </p>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" icon={IconTrash} onClick={confirm} loading={busy} data-autofocus>
            {confirmLabel}
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
