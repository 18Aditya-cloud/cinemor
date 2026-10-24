import { useEffect, useMemo, useRef, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { isBackendConnected } from '../../services/api.js';
import { Link } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import { deleteJobRole, listEmployees, listJobRoles, listTools, seedSampleRolesDemo, updateRolePermissions } from '../api/organizationApi.js';
import useElementWidth from '../hooks/useElementWidth.js';
import useOpenFromQuery from '../hooks/useOpenFromQuery.js';
import useResource from '../hooks/useResource.js';
import { normalizePermissions } from '../permissionsModel.js';
import Button from '../ui/Button.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import { IconBriefcase, IconCheck, IconDash, IconPlus } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Modal from '../ui/Modal.jsx';
import Notice from '../ui/Notice.jsx';
import PageHeader from '../ui/PageHeader.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import { useToast } from '../ui/Toast.jsx';
import JobRoleModal from './JobRoleModal.jsx';
import PermissionMatrix from './permissions/PermissionMatrix.jsx';
import RoleDetails from './permissions/RoleDetails.jsx';
import styles from './permissions/Permissions.module.css';

// Wide enough for the table and the details panel side by side (pixels of page width)
const SIDE_BY_SIDE = 1500;

/**
 * Job Roles: the roles of the organization AND what each may use, in one table.
 * Each row is a job role; the columns are the nine Cinemor features and the organization's tools (from the Tools page).
 * Clicking a box changes it and saves straight away; the note by the table says when it is saved.
 */
export default function JobRolesPage() {
  useDocumentTitle('Job Roles');
  const toast = useToast();
  const { data, loading, error, reload } = useResource(() => Promise.all([listJobRoles(), listTools(), listEmployees()]), []);

  // the roles on screen; edited here first, then saved (see persist)
  const [roles, setRoles] = useState([]);
  useEffect(() => {
    if (data) setRoles(data[0].map((role) => ({ ...role, ...normalizePermissions(role) })));
  }, [data]);
  const tools = useMemo(() => data?.[1] ?? [], [data]);
  const employees = data?.[2] ?? [];

  const [selectedId, setSelectedId] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [roleModal, setRoleModal] = useState(null); // null, {} (new role) or { role } (edit)
  useOpenFromQuery(() => setRoleModal({}));
  const [deleting, setDeleting] = useState(null);
  const [knownIds, setKnownIds] = useState(null); // while waiting for a just-created role to show up: the ids we already had
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(0);
  const [everSaved, setEverSaved] = useState(false);
  const queues = useRef({});

  const wrapRef = useRef(null);
  const sideBySide = useElementWidth(wrapRef) >= SIDE_BY_SIDE;

  const selected = roles.find((r) => r.id === selectedId) ?? null;
  const selectedIndex = Math.max(0, roles.findIndex((r) => r.id === selectedId));
  const assigned = selected ? employees.filter((e) => e.jobRoleId === selected.id) : [];

  // with room for it, the first role is chosen by default so the panel is never empty
  useEffect(() => {
    if (sideBySide && !selected && roles.length) setSelectedId(roles[0].id);
  }, [sideBySide, selected, roles]);
  // just created a role: once it appears in the list (an id we did not have), choose it
  useEffect(() => {
    if (!knownIds) return;
    const fresh = roles.find((r) => !knownIds.has(r.id));
    if (fresh) {
      setSelectedId(fresh.id);
      setKnownIds(null);
    }
  }, [knownIds, roles]);

  // Save one role's permissions. Saves for the same role go one after another, so the last click always wins.
  const persist = (role) => {
    setSaving((n) => n + 1);
    setEverSaved(true);
    const previous = queues.current[role.id] ?? Promise.resolve();
    queues.current[role.id] = previous
      .then(() => updateRolePermissions(role.id, { features: role.features, tools: role.tools }))
      .catch((err) => {
        toast(err.message || 'Could not save that change.', 'error');
        reload(); // show what the server really has
      })
      .finally(() => setSaving((n) => n - 1));
  };

  const changeAccess = (roleId, group, key, allowed) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role || role[group].includes(key) === allowed) return;
    const list = allowed ? [...role[group], key] : role[group].filter((x) => x !== key);
    const updated = { ...role, [group]: list };
    setRoles((all) => all.map((r) => (r.id === roleId ? updated : r)));
    persist(updated);
  };

  const choose = (id) => {
    setSelectedId(id);
    if (!sideBySide) setSheetOpen(true);
  };

  const emptyRoles = roles.length === 0 && !loading;

  const details = selected && (
    <RoleDetails
      key={selected.id}
      role={selected}
      index={selectedIndex}
      tools={tools}
      assigned={assigned}
      onChange={(group, key, allowed) => changeAccess(selected.id, group, key, allowed)}
      onEdit={() => setRoleModal({ role: selected })}
      onDelete={() => setDeleting(selected)}
    />
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Job Roles"
        subtitle="Create and manage the production roles used across your organization."
        actions={
          <>
            <RefreshButton onClick={reload} loading={loading} />
            <Button icon={IconPlus} onClick={() => setRoleModal({})}>
              Create Job Role
            </Button>
          </>
        }
      />
      {error && <Notice message={error.message} onRetry={reload} />}

      {/* This wrapper is always on the page (even when there are no roles yet), so its width is always measured. */}
      <div ref={wrapRef} className={cx(styles.layout, sideBySide && !emptyRoles && styles.layoutWide)}>
        {emptyRoles ? (
          <EmptyState
            icon={IconBriefcase}
            title="No job roles yet"
            text="Create your first production role to define the roles available across your organization."
            action={
              <div className={styles.emptyActions}>
                <Button icon={IconPlus} onClick={() => setRoleModal({})}>
                  Create Job Role
                </Button>
                {!isBackendConnected && (
                  <Button
                    variant="secondary"
                    loading={seeding}
                    onClick={async () => {
                      setSeeding(true);
                      await seedSampleRolesDemo();
                      setSeeding(false);
                      toast('Sample roles added');
                      reload();
                    }}
                  >
                    Add sample roles (demo)
                  </Button>
                )}
              </div>
            }
          />
        ) : (
          <>
            <section className={cx(styles.card, styles.matrixCard)} aria-labelledby="cm-matrix-title">
              <div className={styles.matrixHead}>
                <div>
                  <h2 id="cm-matrix-title" className={styles.cardTitle}>
                    Roles &amp; Permissions
                  </h2>
                  <p className={styles.cardSub}>Click a box to change what a role can use. Changes are saved automatically.</p>
                </div>
                <div className={styles.headRight}>
                  <ul className={styles.legend} aria-label="What the boxes mean">
                    <li>
                      <span className={styles.legendCheck}>
                        <IconCheck width={11} height={11} strokeWidth={3} />
                      </span>
                      Allowed
                    </li>
                    <li>
                      <IconDash width={14} height={14} />
                      Not allowed
                    </li>
                  </ul>
                  <p className={styles.saveNote} role="status" aria-live="polite">
                    {saving > 0 ? 'Saving...' : everSaved ? 'All changes saved' : ''}
                  </p>
                </div>
              </div>

              <PermissionMatrix roles={roles} tools={tools} selectedId={selectedId} onSelect={choose} onChange={changeAccess} />

              {tools.length === 0 && (
                <p className={styles.toolsNote}>
                  Tools you add on the{' '}
                  <Link to="/organization/tools" className={styles.inlineLink}>
                    Tools
                  </Link>{' '}
                  page appear here as extra columns, so you can choose which roles may use them.
                </p>
              )}
            </section>

            {sideBySide && (
              <aside className={cx(styles.card, styles.detailsCard)} aria-label="Role Details">
                <h2 className={styles.cardTitle}>Role Details</h2>
                {details ?? <p className={styles.lockNote}>Choose a role in the table to see its details.</p>}
              </aside>
            )}
          </>
        )}
      </div>

      {/* on narrower screens the details slide in from the right */}
      <Modal side open={sheetOpen && !sideBySide && Boolean(selected)} onClose={() => setSheetOpen(false)} title="Role Details">
        {details}
      </Modal>

      <JobRoleModal
        open={Boolean(roleModal)}
        role={roleModal?.role}
        tools={tools}
        onClose={() => setRoleModal(null)}
        onSaved={(wasEditing) => {
          toast(wasEditing ? 'Job role updated' : 'Job role created');
          if (!wasEditing) setKnownIds(new Set(roles.map((r) => r.id)));
          reload();
        }}
      />

      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete job role?"
        text={deleting ? `Delete "${deleting.name}"? Its permissions are removed too, and this cannot be undone.` : ''}
        confirmLabel="Delete Role"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await deleteJobRole(deleting.id);
          toast('Job role deleted');
          setSelectedId(null);
          setSheetOpen(false);
          reload();
        }}
      />
    </div>
  );
}
