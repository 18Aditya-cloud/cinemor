import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { listTeamLeaderTeam } from '../api/organizationApi.js';
import useResource from '../hooks/useResource.js';
import { IconUserCog, IconUsers } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Notice from '../ui/Notice.jsx';
import PageHeader from '../ui/PageHeader.jsx';
import Pill from '../ui/Pill.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import styles from '../pages/pages.module.css';
import { initialsOf } from './lifecycle.js';
import tl from './TeamLeader.module.css';

/** Everyone the Team Leader can put on a project, and the reviewers, with how many projects each is on right now. */
export default function TeamLeaderTeamPage({ teamLeaderId }) {
  useDocumentTitle('Team');
  const { data, loading, error, reload } = useResource(() => listTeamLeaderTeam(teamLeaderId), [teamLeaderId]);

  return (
    <div className={styles.page}>
      <PageHeader title="Team Members" subtitle="The employees and reviewers in your organization, and how busy each one is." actions={<RefreshButton onClick={reload} loading={loading} />} />
      {error && <Notice message={error.message} onRetry={reload} />}
      <div className={tl.stack}>
        <PeoplePanel id="tl-employees" eyebrow="Employees" title="Employees" icon={IconUsers} people={data?.employees ?? []} empty="No employees have joined your organization yet." />
        <PeoplePanel id="tl-reviewers" eyebrow="Review" title="Reviewers" icon={IconUserCog} people={data?.reviewers ?? []} empty="Nobody is a Reviewer yet. Your organization chooses who reviews." reviewer />
      </div>
    </div>
  );
}

function PeoplePanel({ id, eyebrow, title, icon: Icon, people, empty, reviewer = false }) {
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <div className={styles.panelHead}>
        <div>
          <p className={styles.panelEyebrow}>{eyebrow}</p>
          <h2 id={id} className={styles.panelTitle}>
            {title}
          </h2>
        </div>
        <Icon width={22} height={22} className={styles.panelIcon} />
      </div>
      {people.length === 0 ? (
        <div style={{ padding: '8px 28px 28px' }}>
          <EmptyState framed={false} icon={Icon} title={`No ${title.toLowerCase()}`} text={empty} />
        </div>
      ) : (
        <ul className={tl.people}>
          {people.map((p) => (
            <li key={p.id} className={tl.person}>
              <span className={tl.avatar} aria-hidden="true">
                {initialsOf(p.email)}
              </span>
              <span style={{ minWidth: 0 }}>
                <span className={tl.email} style={{ display: 'block' }}>
                  {p.email}
                </span>
                <span className={tl.tags}>
                  {p.jobRoles.length ? p.jobRoles.map((r) => <span key={r.id} className={tl.tag}>{r.name}</span>) : <span className={tl.tag}>No job role</span>}
                </span>
              </span>
              <span className={tl.load}>
                <span className={tl.label} style={{ display: 'block' }}>
                  Active projects
                </span>
                <span className={tl.value} style={{ display: 'block' }}>
                  {p.activeProjects} / {p.maxProjects ?? '\u221e'}
                </span>
              </span>
              {reviewer ? <Pill tone="violet">Reviewer</Pill> : p.available ? <Pill tone="green">Available</Pill> : <Pill tone="amber">At limit</Pill>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
