import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import pages from '../pages/pages.module.css';
import { IconProjects } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Notice from '../ui/Notice.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import { listProjects } from './clientApi.js';
import { dateText, ProjectPill, projectSteps, StepBar } from './ClientParts.jsx';
import c from './Client.module.css';

/** Every project the studio made (or is making) for this client. */
export default function ClientProjectsPage() {
  useDocumentTitle('My Projects');
  const { data, loading, error, reload } = useResource(listProjects, []);

  return (
    <div className={pages.page}>
      <div className={c.headRow}>
        <div>
          <h1 className={c.pageTitle}>My Projects</h1>
          <p className={c.lead}>Each project shows what the studio has finished and approved so far.</p>
        </div>
        <RefreshButton onClick={reload} loading={loading} />
      </div>
      {error && <Notice message={error.message || 'Your projects could not be loaded.'} onRetry={reload} />}
      {data && data.length === 0 && <EmptyState icon={IconProjects} title="No projects yet" text="When your studio links a project to you, it appears here." />}
      {data && data.length > 0 && (
        <div className={c.cards}>
          {data.map((p) => (
            <Link key={p.id} to={`/client/projects/${p.id}`} className={cx(c.card, c.projectCard)}>
              <div className={c.readyTop}>
                <span className={c.projectName}>{p.title}</span>
                <ProjectPill project={p} />
              </div>
              {p.description && <p className={c.small}>{p.description.length > 140 ? `${p.description.slice(0, 140)}…` : p.description}</p>}
              <StepBar steps={projectSteps(p)} label={`${p.progress}% ready`} />
              <div className={c.facts}>
                <span>
                  <b>{p.progress}%</b> ready
                </span>
                <span>
                  <b>{p.storyCount}</b> {p.storyCount === 1 ? 'story' : 'stories'}
                </span>
                {p.deadline && (
                  <span>
                    Due <b>{dateText(p.deadline)}</b>
                  </span>
                )}
                {p.teamLeader && (
                  <span>
                    Team Leader <b>{p.teamLeader.name}</b>
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
