import { useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import TextField from '../../components/auth/TextField.jsx';
import { createClient, deleteClient, listClients, updateClient } from '../api/organizationApi.js';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import useModalForm from '../hooks/useModalForm.js';
import useResource from '../hooks/useResource.js';
import useOpenFromQuery from '../hooks/useOpenFromQuery.js';
import Button from '../ui/Button.jsx';
import DataTable from '../ui/DataTable.jsx';
import { IconBuilding, IconMail, IconPencil, IconPhone, IconPlus, IconTrash } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Modal, { ModalFooter } from '../ui/Modal.jsx';
import Notice from '../ui/Notice.jsx';
import PageHeader from '../ui/PageHeader.jsx';
import Pill from '../ui/Pill.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import { useToast } from '../ui/Toast.jsx';
import styles from './pages.module.css';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ClientsPage() {
  useDocumentTitle('Clients');
  const toast = useToast();
  const { data, loading, error, reload } = useResource(listClients, []);
  const [modal, setModal] = useState(null); // null | { client?: the client being updated }
  const [deleting, setDeleting] = useState(null);
  useOpenFromQuery(() => setModal({}));
  const clients = data ?? [];

  const columns = [
    { key: 'no', header: 'No.', render: (_row, index) => index + 1 },
    { key: 'id', header: 'Client ID', render: (row) => <strong>#{row.id}</strong> },
    { key: 'name', header: 'Name', render: (row) => <strong>{row.name}</strong> },
    {
      key: 'email',
      header: 'Email',
      render: (row) => (
        <span className={styles.contact}>
          <IconMail width={16} height={16} />
          {row.email}
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'Phone No.',
      render: (row) => (
        <span className={styles.contact}>
          <IconPhone width={16} height={16} />
          {row.phone}
        </span>
      ),
    },
    { key: 'ongoing', header: 'Ongoing Projects', render: (row) => <Pill tone="amber">{row.ongoingProjects ?? 0}</Pill> },
    { key: 'delivered', header: 'Successful Delivered', render: (row) => <Pill tone="green">{row.deliveredProjects ?? 0}</Pill> },
    {
      key: 'update',
      header: 'Actions',
      render: (row) => (
        <div className={styles.rowActions}>
          <Button variant="secondary" icon={IconPencil} onClick={() => setModal({ client: row })} aria-label={`Update ${row.name}`}>
            Update
          </Button>
          <Button variant="secondary" icon={IconTrash} iconOnly onClick={() => setDeleting(row)} aria-label={`Delete ${row.name}`}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Clients"
        subtitle="Manage client relationships and track project delivery across your organization."
        actions={
          <>
            <RefreshButton onClick={reload} loading={loading} />
            <Button icon={IconPlus} onClick={() => setModal({})}>
              Create Client
            </Button>
          </>
        }
      />
      {error && <Notice message={error.message} onRetry={reload} />}

      {clients.length === 0 ? (
        <EmptyState
          icon={IconBuilding}
          title="No clients yet"
          text="Add your first client to start connecting production projects with an external organization or customer."
          action={
            <Button icon={IconPlus} onClick={() => setModal({})}>
              Create Client
            </Button>
          }
        />
      ) : (
        <DataTable caption="Clients" columns={columns} rows={clients} rowKey={(row) => row.id} />
      )}

      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete client?"
        text={deleting ? `${deleting.name} will be removed from your organization. A client that still has projects can't be deleted.` : ''}
        confirmLabel="Delete Client"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await deleteClient(deleting.id);
          toast('Client deleted');
          reload();
        }}
      />

      <ClientModal
        open={Boolean(modal)}
        client={modal?.client}
        onClose={() => setModal(null)}
        onSaved={(updated) => {
          toast(updated ? 'Client updated' : 'Client created');
          reload();
        }}
      />
    </div>
  );
}

function ClientModal({ open, client, onClose, onSaved }) {
  const editing = Boolean(client);
  const form = useModalForm(open, { name: client?.name ?? '', email: client?.email ?? '', phone: client?.phone ?? '' }, client?.id ?? 'new');

  const submit = async (event) => {
    event.preventDefault();
    const { name, email, phone } = form.values;
    const errors = {};
    if (!name.trim()) errors.name = 'Enter the client name.';
    if (!email.trim()) errors.email = 'Enter the client email.';
    else if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address, like client@company.com.';
    if (!phone.trim()) errors.phone = 'Enter the client phone number.';
    else if (phone.replace(/\D/g, '').length < 7 || !/^[+()\d][\d\s()+-]*$/.test(phone.trim())) errors.phone = 'Enter a valid phone number.';
    form.setErrors(errors);
    if (Object.keys(errors).length) return form.focusFirstInvalid();
    form.setBusy(true);
    try {
      const values = { name: name.trim(), email: email.trim(), phone: phone.trim() };
      if (editing) await updateClient(client.id, values);
      else await createClient(values);
      onSaved(editing);
      onClose();
    } catch (error) {
      form.setFormError(error.message);
      form.setBusy(false);
    }
    return undefined;
  };

  return (
    <Modal open={open} onClose={onClose} icon={IconBuilding} divider title={editing ? 'Update Client' : 'Create Client'} subtitle={editing ? 'Change this client\u2019s details.' : 'Add a client to your organization.'}>
      <form onSubmit={submit} noValidate>
        <TextField id="client-name" label="Client name" requiredMark placeholder="e.g. Mythic Studios" value={form.values.name} onChange={form.set('name')} error={form.errors.name} disabled={form.busy} />
        <TextField id="client-email" label="Email" requiredMark type="email" placeholder="client@company.com" value={form.values.email} onChange={form.set('email')} error={form.errors.email} disabled={form.busy} />
        <TextField id="client-phone" label="Phone number" requiredMark type="tel" placeholder="+91 98765 43210" value={form.values.phone} onChange={form.set('phone')} error={form.errors.phone} disabled={form.busy} />
        {form.formError && (
          <p className={styles.formError} role="alert">
            {form.formError}
          </p>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" icon={editing ? IconPencil : IconPlus} loading={form.busy}>
            {editing ? 'Save Changes' : 'Create Client'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
