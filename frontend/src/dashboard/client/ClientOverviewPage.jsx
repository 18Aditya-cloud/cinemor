import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import pages from '../pages/pages.module.css';
import timeAgo from '../timeAgo.js';
import { IconMail, IconPlay, IconProjects, IconStoryboard } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Notice from '../ui/Notice.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import { getOverview } from './clientApi.js';
import { dateText, ProjectPill, projectSteps, StepBar } from './ClientParts.jsx';
import c from './Client.module.css';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/** The client's home: what is ready for them, their projects at a glance, and what changed lately. */
export default function ClientOverviewPage() {
  useDocumentTitle('Client portal');
  const { data, loading, error, reload } = useResource(getOverview, []);
  const projects = data?.projects || [];
  const leaders = [];
  projects.forEach((p) => {
    if (p.teamLeader && !leaders.some((l) => l.email === p.teamLeader.email)) leaders.push({ ...p.teamLeader, project: p.title, projectId: p.id });
  });

  return (
    <div className={pages.page}>
      <div className={c.headRow}>
        <div>
          <h1 className={c.greeting}>
            {greeting()}, {data?.name || 'there'}
          </h1>
          {data && (
            <p className={c.lead}>
              {projects.length === 0
                ? 'Your studio has not added a project for you yet.'
                : data.counts.ready
                  ? `${data.counts.ready === 1 ? 'One thing is' : `${data.counts.ready} things are`} ready for you to look at.`
                  : 'Nothing is waiting for you right now. Your studio is at work.'}
            </p>
          )}
        </div>
        <RefreshButton onClick={reload} loading={loading} />
      </div>

      {error && <Notice message={error.message || 'The portal could not be loaded.'} onRetry={reload} />}

      {data && projects.length === 0 && (
        <EmptyState icon={IconProjects} title="No projects yet" text="When your studio links a project to you, its films, storyboards and characters appear here." />
      )}

      {data && projects.length > 0 && (
        <>
          <section className={c.stats} aria-label="At a glance">
            <div className={cx(c.card, c.stat)}>
              <p>Ongoing projects</p>
              <b>{data.counts.ongoing}</b>
            </div>
            <div className={cx(c.card, c.stat)}>
              <p>Completed</p>
              <b>{data.counts.completed}</b>
            </div>
            <div className={cx(c.card, c.stat)}>
              <p>Ready for you</p>
              <b>{data.counts.ready}</b>
            </div>
            <div className={cx(c.card, c.stat)}>
              <p>Next deadline</p>
              <b className={c.statDate}>{data.nextDeadline ? dateText(data.nextDeadline) : 'None'}</b>
            </div>
          </section>

          <div className={c.overviewGrid}>
            <div>
              <section aria-labelledby="ready-title">
                <h2 id="ready-title" className={c.h2}>
                  Ready for you
                </h2>
                {data.ready.length === 0 ? (
                  <p className={c.empty}>Films and storyboards show up here as soon as the studio finishes them.</p>
                ) : (
                  <div className={c.readyGrid}>
                    {data.ready.map((r) => (
                      <article key={`${r.kind}-${r.storyId}`} className={cx(c.card, c.readyCard)}>
                        <div className={cx(c.readyArt, r.kind !== 'film' && c.board)} aria-hidden="true">
                          <span className={c.playDisc}>{r.kind === 'film' ? <IconPlay width={22} height={22} /> : <IconStoryboard width={22} height={22} />}</span>
                        </div>
                        <div className={c.readyBody}>
                          <div className={c.readyTop}>
                            <b>
                              {r.story} {r.kind === 'film' ? 'film' : 'storyboard'}
                            </b>
                            <span className={c.small}>{timeAgo(r.at)}</span>
                          </div>
                          <span className={c.small}>{r.project}</span>
                          <div className={c.actions}>
                            <Link className={c.linkButton} to={`/client/projects/${r.projectId}?story=${r.storyId}`}>
                              {r.kind === 'film' ? 'Watch and approve' : 'Open the storyboard'}
                            </Link>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className={c.section} aria-labelledby="projects-title">
                <h2 id="projects-title" className={c.h2}>
                  Your projects
                </h2>
                <ul className={c.projectList}>
                  {projects.map((p) => (
                    <li key={p.id}>
                      <Link to={`/client/projects/${p.id}`} className={cx(c.card, c.projectRow)}>
                        <div>
                          <div className={c.projectName}>{p.title}</div>
                          <div className={c.meta}>
                            <ProjectPill project={p} />
                            <span className={c.small}>
                              {p.storyCount === 1 ? '1 story' : `${p.storyCount} stories`}
                              {p.deadline ? `, due ${dateText(p.deadline)}` : ''}
                            </span>
                          </div>
                        </div>
                        <div>
                          <StepBar steps={projectSteps(p)} label={`${p.progress}% ready`} />
                          <p className={c.small} style={{ marginTop: 6 }}>
                            {p.progress}% ready
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <aside className={c.side}>
              <section className={cx(c.card, c.pad)} aria-labelledby="updates-title">
                <h2 id="updates-title" className={c.h2}>
                  Latest updates
                </h2>
                {data.updates.length === 0 ? (
                  <p className={c.empty}>Nothing new yet.</p>
                ) : (
                  <ul className={c.updates}>
                    {data.updates.map((u, i) => (
                      <li key={i} className={c.update}>
                        <span className={cx(c.dot, u.kind === 'reply' && c.dotReply)} aria-hidden="true" />
                        <span>
                          <b>{u.text}</b>
                          {u.story ? ` for ${u.story}` : ''} in <Link to={`/client/projects/${u.projectId}`}>{u.project}</Link>
                          <br />
                          <span className={c.small}>{timeAgo(u.at)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {leaders.length > 0 && (
                <section className={cx(c.card, c.pad)} aria-labelledby="contact-title">
                  <h2 id="contact-title" className={c.h2}>
                    {leaders.length === 1 ? 'Your contact' : 'Your contacts'}
                  </h2>
                  {leaders.map((l) => (
                    <div key={l.email} className={c.contact}>
                      <span className={c.avatar} aria-hidden="true">
                        {(l.name || '?').slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        <b>{l.name}</b>
                        <br />
                        <span className={c.small}>Team Leader, {l.project}</span>
                      </span>
                    </div>
                  ))}
                  <Link to="/client/messages" className={c.linkButton}>
                    <IconMail width={15} height={15} aria-hidden="true" />
                    Send a message
                  </Link>
                </section>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
