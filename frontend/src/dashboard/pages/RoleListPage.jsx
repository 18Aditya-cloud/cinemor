import { useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import cx from '../../utils/cx.js';
import { listEmployees, setEmployeeRoles } from '../api/organizationApi.js';
import useResource from '../hooks/useResource.js';
import Button from '../ui/Button.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import DataTable from '../ui/DataTable.jsx';
import { IconMail } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Notice from '../ui/Notice.jsx';
import PageHeader from '../ui/PageHeader.jsx';
import Pill from '../ui/Pill.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import StatCard, { StatGrid } from '../ui/StatCard.jsx';
import { useToast } from '../ui/Toast.jsx';
import styles from './pages.module.css';
import e from './EmployeesPage.module.css';

// A person with a minus sign, for "Remove as ..." (drawn like the other dashboard icons).
function IconUserMinus(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M17 11h6" />
    </svg>
  );
}

const LABEL = { teamLeader: 'Team Leader', reviewer: 'Reviewer' };
const YesNo = ({ value }) => (value ? <Pill tone="green">Yes</Pill> : <Pill tone="gray">No</Pill>);

/**
 * Team Leaders and Reviewers are the same page with different words: the employees who have that responsibility, in
 * the same table as the Employees page (ID, email, job roles, max / current projects), a Yes / No column for the other
 * responsibility, two counts, and "Remove as Team Leader" / "Remove as Reviewer" (asked first, since a Team Leader
 * loses their dashboard and a Reviewer stops reviewing).
 * `field` is 'teamLeader' or 'reviewer'; `other` is the other one.
 */
export default function RoleListPage({ field, other, title, subtitle, statIcon, otherIcon, emptyTitle, emptyText, emptyIcon, docTitle }) {
  useDocumentTitle(docTitle);
  const toast = useToast();
  const { data, loading, error, reload } = useResource(listEmployees, []);
  const [removing, setRemoving] = useState(null); // the employee about to lose this responsibility
  const employees = data ?? [];
  const people = employees.filter((x) => x[field]);
  const both = employees.filter((x) => x[field] && x[other]);
  const what = LABEL[field];

  const columns = [
    { key: 'no', header: 'S.No.', render: (_row, index) => index + 1 },
    { key: 'id', header: 'Employee ID', render: (row) => <span className={e.id}>#{row.id}</span> },
    {
      key: 'email',
      header: 'Email',
      render: (row) => (
        <span className={styles.contact}>
          <IconMail width={15} height={15} />
          <span className={e.email}>{row.email}</span>
        </span>
      ),
    },
    {
      key: 'roles',
      header: 'Job Role',
      wrap: true,
      render: (row) =>
        row.jobRoles?.length ? (
          <span className={e.roles}>
            {row.jobRoles.map((r) => (
              <span key={r.id} className={e.role}>
                {r.name}
              </span>
            ))}
          </span>
        ) : (
          <span className={styles.muted}>-</span>
        ),
    },
    { key: 'max', header: 'Max Project', render: (row) => (row.maxProjects == null ? <span className={styles.muted}>Default</span> : <span className={e.num}>{row.maxProjects}</span>) },
    {
      key: 'current',
      header: 'Current Project',
      render: (row) => <span className={cx(e.num, row.maxProjects != null && (row.currentProjects ?? 0) > row.maxProjects && e.over)}>{row.currentProjects ?? 0}</span>,
    },
    { key: 'other', header: LABEL[other], render: (row) => <YesNo value={row[other]} /> },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <Button variant="danger" icon={IconUserMinus} onClick={() => setRemoving(row)} aria-label={`Remove ${row.email} as ${what}`}>
          Remove as {what}
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader title={title} subtitle={subtitle} actions={<RefreshButton onClick={reload} loading={loading} />} />
      {error && <Notice message={error.message} onRetry={reload} />}

      <StatGrid columns={2}>
        <StatCard icon={statIcon} label={title} value={people.length} />
        <StatCard icon={otherIcon} label="Reviewer + Team Leader" value={both.length} />
      </StatGrid>

      {people.length === 0 ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} text={emptyText} />
      ) : (
        <DataTable caption={title} columns={columns} rows={people} rowKey={(row) => row.id} />
      )}

      <ConfirmModal
        open={Boolean(removing)}
        title={`Remove as ${what}?`}
        text={
          removing
            ? field === 'teamLeader'
              ? `${removing.email} will no longer be a Team Leader, and their Team Leader dashboard will close. You can make them one again from the Employees page.`
              : `${removing.email} will no longer be a Reviewer, and the job roles they reviewed are cleared. You can make them one again from the Employees page.`
            : ''
        }
        confirmLabel={`Remove as ${what}`}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          await setEmployeeRoles(removing.id, { [field]: false });
          toast(`${removing.email} is no longer a ${what}`);
          await reload();
        }}
      />
    </div>
  );
}
