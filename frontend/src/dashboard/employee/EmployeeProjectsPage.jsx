import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import useResource from '../hooks/useResource.js';
import { IconProjects } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Notice from '../ui/Notice.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import pages from '../pages/pages.module.css';
import { listMyProjects } from './employeeApi.js';
import { NotificationBell, ProjectSections, StripLegend } from './EmployeeParts.jsx';
import e from './Employee.module.css';

/** Every project the person is on (as an employee, a reviewer, or its Team Leader). */
export default function EmployeeProjectsPage() {
  useDocumentTitle('My Projects');
  const { data, loading, error, reload } = useResource(listMyProjects, []);

  return (
    <div className={pages.page}>
      <div className={e.headRow}>
        <div>
          <h1 className={e.greeting}>My Projects</h1>
          <p className={e.lead}>Every project you are on, and where each of its six stages stands.</p>
        </div>
        <div className={e.headTools}>
          <NotificationBell />
          <RefreshButton onClick={reload} loading={loading} />
        </div>
      </div>
      {error && <Notice message={error.message} onRetry={reload} />}
      {data && data.length === 0 && (
        <EmptyState icon={IconProjects} title="No projects yet" text="When your Team Leader adds you to a project, it appears here with the stages you work on." />
      )}
      {data && data.length > 0 && (
        <>
          <div className={e.sectionHead}>
            <h2 className={e.sectionTitle}>Your projects by state</h2>
            <StripLegend />
          </div>
          {/* Ongoing, Not started, Completed and Aborted, each sorted (nearest deadline / latest activity first) */}
          <ProjectSections projects={data} />
        </>
      )}
    </div>
  );
}