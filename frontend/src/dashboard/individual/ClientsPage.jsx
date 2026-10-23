import { useEffect, useId, useRef, useState } from 'react';
import TextField from '../../components/auth/TextField.jsx';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import Button from '../ui/Button.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import { IconBuilding, IconMail, IconPencil, IconPhone, IconPlus, IconProjects, IconTrash, IconUser, IconUsers } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Notice from '../ui/Notice.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import { useToast } from '../ui/Toast.jsx';
import { createClient, deleteClient, listClients, updateClient } from './individualApi.js';
import { Header, Tile } from './parts.jsx';
import s from './Individual.module.css';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BLANK = { name: '', companyName: '', email: '', phone: '' };

/**
 * The creator's clients, as cards. "Add Client" (or a card's pencil) opens the form at the top of the page, the way
 * the design has it; only the name is required. A client that still has projects can't be deleted.
 */
export default function ClientsPage() {
  useDocumentTitle('Clients');
  const toast = useToast();
  const { data, loading, error, reload } = useResource(listClients, []);
  const [editor, setEditor] = useState(null); // null (closed) | {} (adding) | the client being edited
  const [deleting, setDeleting] = useState(null);
  const clients = data ?? [];

  return (
    <div className={s.page}>
      <Header
        title="Clients"
        subtitle="Manage the clients you work with on your Cinemor AI projects."
        actions={
          <>
            <RefreshButton onClick={reload} loading={loading} />
            <Button icon={IconPlus} onClick={() => setEditor({})} disabled={editor && !editor.id}>
              Add Client
            </Button>
          </>
        }
      />
      {error && <Notice message={error.message} onRetry={reload} />}

      {editor && (
        <ClientForm
          key={editor.id ?? 'new'}
          client={editor.id ? editor : null}
          onClose={() => setEditor(null)}
          onSaved={(saved, updated) => {
            toast(updated ? `${saved.name} updated` : `${saved.name} added`);
            setEditor(null);
            reload();
          }}
        />
      )}

      {data && clients.length === 0 ? (
        !editor && (
          <EmptyState
            icon={IconUsers}
            title="No clients yet"
            text="Add the people or companies you make projects for."
            action={
              <Button icon={IconPlus} onClick={() => setEditor({})}>
                Add Client
              </Button>
            }
          />
        )
      ) : (
        <ul className={s.clientGrid} aria-label="Clients">
          {clients.map((c) => (
            <li key={c.id} className={cx(s.card, s.clientCard)}>
              <div className={s.cardTop}>
                <Tile icon={IconUser} size="lg" />
                <div className={s.iconButtons}>
                  <Button variant="secondary" icon={IconPencil} iconOnly onClick={() => setEditor(c)} aria-label={`Edit ${c.name}`} />
                  <Button variant="secondary" icon={IconTrash} iconOnly onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`} />
                </div>
              </div>
              <p className={s.clientName}>{c.name}</p>
              {c.companyName && (
                <p className={s.clientLine}>
                  <IconBuilding width={16} height={16} /> {c.companyName}
                </p>
              )}
              {c.email && (
                <p className={s.clientLine}>
                  <IconMail width={16} height={16} /> {c.email}
                </p>
              )}
              {c.phone && (
                <p className={s.clientLine}>
                  <IconPhone width={16} height={16} /> {c.phone}
                </p>
              )}
              <p className={s.clientLine}>
                <IconProjects width={16} height={16} /> {c.projectCount} {c.projectCount === 1 ? 'project' : 'projects'}
              </p>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete client?"
        text={deleting ? `${deleting.name} will be removed. A client that still has projects can't be deleted.` : ''}
        confirmLabel="Delete Client"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await deleteClient(deleting.id);
          toast(`${deleting.name} deleted`);
          if (editor?.id === deleting.id) setEditor(null);
          reload();
        }}
      />
    </div>
  );
}

function ClientForm({ client, onClose, onSaved }) {
  const uid = useId();
  const editing = Boolean(client);
  const [values, setValues] = useState(editing ? { name: client.name || '', companyName: client.companyName || '', email: client.email || '', phone: client.phone || '' } : BLANK);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  // bring the form into view and put the cursor in the first field when it opens
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    ref.current?.querySelector('input')?.focus({ preventScroll: true });
  }, []);

  const set = (key) => (event) => {
    setValues((v) => ({ ...v, [key]: event.target.value }));
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
    setFormError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!values.name.trim()) next.name = 'Enter the client name.';
    if (values.email.trim() && !EMAIL.test(values.email.trim())) next.email = 'Enter a valid email address, like client@company.com.';
    if (values.phone.trim() && (values.phone.replace(/\D/g, '').length < 7 || !/^[+()\d][\d\s()+-]*$/.test(values.phone.trim()))) next.phone = 'Enter a valid phone number.';
    setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => ref.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    try {
      const saved = editing ? await updateClient(client.id, values) : await createClient(values);
      onSaved(saved, editing);
    } catch (err) {
      setFormError(err.message);
      setBusy(false);
    }
  };

  return (
    <section ref={ref} className={cx(s.card, s.panel, s.editor)} aria-labelledby={`${uid}-title`}>
      <div className={s.panelHead}>
        <Tile icon={editing ? IconPencil : IconPlus} />
        <div>
          <h2 id={`${uid}-title`} className={s.panelTitle}>
            {editing ? 'Edit Client' : 'Add Client'}
          </h2>
          <p className={s.panelSub}>{editing ? 'Update the client’s information.' : 'Add someone you make projects for.'}</p>
        </div>
      </div>
      <form onSubmit={submit} noValidate>
        <div className={s.two}>
          <TextField id={`${uid}-name`} label="Client Name" requiredMark placeholder="e.g. Mythic Films" value={values.name} onChange={set('name')} error={errors.name} disabled={busy} />
          <TextField id={`${uid}-company`} label="Company" optionalMark placeholder="Company name" value={values.companyName} onChange={set('companyName')} disabled={busy} />
          <TextField id={`${uid}-email`} label="Email" optionalMark type="email" placeholder="client@company.com" value={values.email} onChange={set('email')} error={errors.email} disabled={busy} />
          <TextField id={`${uid}-phone`} label="Phone" optionalMark type="tel" placeholder="+91 98765 43210" value={values.phone} onChange={set('phone')} error={errors.phone} disabled={busy} />
        </div>
        {formError && (
          <p className={s.formError} role="alert">
            {formError}
          </p>
        )}
        <div className={s.formFoot}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" icon={editing ? IconPencil : IconPlus} loading={busy}>
            {editing ? 'Update Client' : 'Add Client'}
          </Button>
        </div>
      </form>
    </section>
  );
}
