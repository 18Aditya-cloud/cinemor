import { useEffect, useState } from 'react';

/**
 * State for a form inside a modal: values, per-field errors, a busy flag and one form-level error.
 * It resets whenever the modal opens (or `resetKey` changes, e.g. when editing a different row).
 *   const form = useModalForm(open, { name: '' }, client?.id);
 *   <TextField value={form.values.name} onChange={form.set('name')} error={form.errors.name} />
 */
export default function useModalForm(open, initial, resetKey = null) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setValues(initial);
    setErrors({});
    setBusy(false);
    setFormError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resetKey]);

  // set('name') returns a handler that accepts either an input event or a plain value
  const set = (key) => (valueOrEvent) => {
    const value = valueOrEvent && valueOrEvent.target ? valueOrEvent.target.value : valueOrEvent;
    setValues((s) => ({ ...s, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
    setFormError('');
  };

  // after a failed check, put the cursor on the first wrong field
  const focusFirstInvalid = () =>
    requestAnimationFrame(() => document.querySelector('[role="dialog"] [aria-invalid="true"]')?.focus());

  return { values, errors, setErrors, busy, setBusy, formError, setFormError, set, focusFirstInvalid };
}
