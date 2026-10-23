import { useId } from 'react';
import TextField from '../../components/auth/TextField.jsx';
import { Link } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import { createJobRole, updateJobRole } from '../api/organizationApi.js';
import useModalForm from '../hooks/useModalForm.js';
import Button from '../ui/Button.jsx';
import { IconBriefcase, IconCheck, IconPencil, IconPlus } from '../ui/DashIcons.jsx';
import Modal, { ModalFooter } from '../ui/Modal.jsx';
import { FEATURES } from './permissions/features.js';
import styles from './JobRoleModal.module.css';
import pageStyles from './pages.module.css';

/**
 * The window for creating a job role, or (when `role` is given) editing one, including what the role can use:
 * the Cinemor features and the organization's tools (`tools` = the list from the Tools page).
 * `onSaved(wasEditing)` runs after it is saved.
 */
export default function JobRoleModal({ open, role, tools = [], onClose, onSaved }) {
  const editing = Boolean(role);
  const form = useModalForm(open, { name: role?.name ?? '', description: role?.description ?? '', features: role?.features ?? [], tools: role?.tools ?? [] }, role?.id ?? 'new');

  const toggle = (key, id) => {
    const list = form.values[key];
    form.set(key)(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const submit = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!form.values.name.trim()) errors.name = 'Enter a job role name.';
    form.setErrors(errors);
    if (Object.keys(errors).length) return form.focusFirstInvalid();
    form.setBusy(true);
    try {
      const values = { name: form.values.name.trim(), description: form.values.description.trim(), features: form.values.features, tools: form.values.tools };
      if (editing) await updateJobRole(role.id, values);
      else await createJobRole(values);
      onSaved(editing);
      onClose();
    } catch (error) {
      form.setFormError(error.message);
      form.setBusy(false);
    }
    return undefined;
  };

  return (
    <Modal open={open} onClose={onClose} wide icon={IconBriefcase} title={editing ? 'Edit Job Role' : 'Create Job Role'} subtitle={editing ? 'Change this role and its permissions.' : 'Define the role and select its permissions.'}>
      <form onSubmit={submit} noValidate>
        <TextField id="role-name" label="Job role name" requiredMark placeholder="e.g. Animator" value={form.values.name} onChange={form.set('name')} error={form.errors.name} disabled={form.busy} />
        <TextField id="role-description" label="Description" multiline rows={4} placeholder="Briefly describe this role." value={form.values.description} onChange={form.set('description')} disabled={form.busy} />

        <PermissionCard title="Cinemor Features" hint="Select the platform capabilities this role can use." options={FEATURES.map((f) => ({ id: f.id, label: f.label }))} selected={form.values.features} onToggle={(id) => toggle('features', id)} disabled={form.busy} />

        <PermissionCard
          title="Organization Tools"
          hint="Select external tools available to this role."
          options={tools.map((t) => ({ id: t.id, label: t.name }))}
          selected={form.values.tools}
          onToggle={(id) => toggle('tools', id)}
          disabled={form.busy}
          empty={
            <>
              No tools yet. Add them on the{' '}
              <Link to="/organization/tools" className={pageStyles.inlineLink} onClick={onClose}>
                Tools
              </Link>{' '}
              page and they will appear here.
            </>
          }
        />

        {form.formError && (
          <p className={pageStyles.formError} role="alert">
            {form.formError}
          </p>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" icon={editing ? IconPencil : IconPlus} loading={form.busy}>
            {editing ? 'Save Changes' : 'Create Role'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// A card with a title, a "N selected" badge and a set of tick-chips (real checkboxes, so the keyboard and screen readers work).
export function PermissionCard({ title, hint, options, selected, onToggle, disabled, empty }) {
  const uid = useId();
  return (
    <section className={styles.card} aria-labelledby={`${uid}-title`}>
      <header className={styles.cardHead}>
        <h3 id={`${uid}-title`} className={styles.cardTitle}>
          {title}
        </h3>
        <span className={styles.badge} aria-live="polite">
          {selected.length} selected
        </span>
      </header>
      <p className={styles.cardHint}>{hint}</p>
      {options.length === 0 ? (
        <p className={styles.cardEmpty}>{empty}</p>
      ) : (
        <div className={styles.chips} role="group" aria-labelledby={`${uid}-title`}>
          {options.map((option) => {
            const on = selected.includes(option.id);
            return (
              <label key={option.id} className={cx(styles.chip, on && styles.chipOn, disabled && styles.chipDisabled)}>
                <input type="checkbox" className={styles.chipInput} checked={on} disabled={disabled} onChange={() => onToggle(option.id)} />
                <span className={styles.chipBox} aria-hidden="true">
                  <IconCheck width={13} height={13} strokeWidth={3} />
                </span>
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
