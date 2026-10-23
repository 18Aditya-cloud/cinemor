import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import useResource from '../hooks/useResource.js';
import { IconExternal, IconWrench } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Notice from '../ui/Notice.jsx';
import pages from '../pages/pages.module.css';
import { getMe } from './employeeApi.js';
import { STAGES } from './stages.js';
import e from './Employee.module.css';

/** The tools the organization gave the person's job roles, and the roles themselves. */
export default function EmployeeToolsPage() {
  useDocumentTitle('Tools');
  const { data: me, error, reload } = useResource(getMe, []);
  const roleName = (id) => me?.jobRoles.find((r) => r.jobRoleId === id)?.name;

  return (
    <div className={pages.page}>
      <div className={e.headRow}>
        <div>
          <h1 className={e.greeting}>Tools</h1>
          <p className={e.lead}>
            {me?.jobRoles.length ? (
              <>
                Your roles: <b>{me.jobRoles.map((r) => r.name).join(', ')}</b>. The Cinemor studios for {STAGES.map((s) => s.label).join(', ')} open from your projects.
              </>
            ) : (
              'The tools your organization chose for your roles.'
            )}
          </p>
        </div>
      </div>
      {error && <Notice message={error.message} onRetry={reload} />}
      {me && me.tools.length === 0 && <EmptyState icon={IconWrench} title="No tools for your roles yet" text="Your organization adds tools to job roles on its Job Roles page." />}
      {me && me.tools.length > 0 && (
        <ul className={e.tools}>
          {me.tools.map((t) => (
            <li key={t.id} className={e.tool}>
              <span className={e.tile} aria-hidden="true">
                <IconWrench width={18} height={18} />
              </span>
              <p className={e.toolName}>{t.name}</p>
              {t.description && <p className={e.stageText}>{t.description}</p>}
              <p className={e.small}>For {t.jobRoleIds.map(roleName).filter(Boolean).join(', ')}</p>
              {t.url && (
                <a className={e.toolLink} href={t.url} target="_blank" rel="noreferrer">
                  Open {t.name} <IconExternal width={14} height={14} />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
