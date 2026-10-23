import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import timeAgo from '../timeAgo.js';
import Button from '../ui/Button.jsx';
import { IconCheckCircle, IconChevronRight, IconPencil } from '../ui/DashIcons.jsx';
import Notice from '../ui/Notice.jsx';
import Pill from '../ui/Pill.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import pages from '../pages/pages.module.css';
import { itemLabel, listMyProjects, listMySubmissions, listReviews } from './employeeApi.js';
import { NotificationBell, ProjectCard, StripLegend } from './EmployeeParts.jsx';
import { stageMeta, SUBMISSION, upNext } from './stages.js';
import e from './Employee.module.css';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

async function loadAll() {
  const [projects, reviews, sent] = await Promise.all([listMyProjects(), listReviews(), listMySubmissions()]);
  return { projects, reviews, sent };
}

/** The employee's home: Up next, their work in review, and their projects with the six stages. */
export default function EmployeeOverviewPage({ email }) {
  useDocumentTitle('My Work');
  const { navigate } = useRouter();
  const { data, loading, error, reload } = useResource(loadAll, []);
  const name = (email || '').split('@')[0] || 'there';
  const projects = data?.projects || [];
  const tasks = data ? upNext(projects, data.reviews) : [];
  const toReview = data ? data.reviews.filter((r) => r.canAct).length : 0;
  // the latest answer (or wait) for each stage this person sent
  const latest = [];
  (data?.sent || []).forEach((s) => {
    if (['withdrawn', 'cancelled'].includes(s.status)) return;
    if (!latest.some((x) => x.projectId === s.projectId && x.stage === s.stage)) latest.push(s);
  });

  return (
    <div className={pages.page}>
      <div className={e.headRow}>
        <div>
          <h1 className={e.greeting}>
            {greeting()}, {name}
          </h1>
          {data && (
            <p className={e.lead}>
              {projects.length === 0 ? (
                'No projects yet. Your Team Leader adds you to one.'
              ) : (
                <>
                  You are on <b>{projects.length === 1 ? '1 project' : `${projects.length} projects`}</b>.{' '}
                  {tasks.length ? (
                    <>
                      <b>{tasks.length === 1 ? '1 thing' : `${tasks.length} things`}</b> {tasks.length === 1 ? 'is' : 'are'} waiting for you
                      {toReview ? (
                        <>
                          , and <b>{toReview === 1 ? '1 review' : `${toReview} reviews`}</b> {toReview === 1 ? 'needs' : 'need'} your eye.
                        </>
                      ) : (
                        '.'
                      )}
                    </>
                  ) : (
                    'Nothing is waiting for you right now.'
                  )}
                </>
              )}
            </p>
          )}
        </div>
        <div className={e.headTools}>
          <NotificationBell />
          <RefreshButton onClick={reload} loading={loading} />
        </div>
      </div>
      {error && <Notice message={error.message} onRetry={reload} />}

      <div className={e.grid2}>
        <section className={e.card} aria-labelledby="emp-next">
          <div className={e.cardHead}>
            <h2 id="emp-next" className={e.cardTitle}>
              Up next
            </h2>
            <span className={e.cardSub}>Work in your roles that is open now</span>
          </div>
          {!data ? (
            <p className={e.empty}>Loading…</p>
          ) : tasks.length === 0 ? (
            <p className={e.empty}>Nothing to do right now. A stage opens for you when the one before it is approved, and you will see it here.</p>
          ) : (
            <ul className={e.tasks}>
              {tasks.slice(0, 6).map((t, i) => {
                const Icon = t.kind === 'review' ? IconCheckCircle : t.kind === 'fix' ? IconPencil : stageMeta(t.stage.key).icon;
                return (
                  <li key={t.key} className={cx(e.task, i === 0 && e.taskFirst)}>
                    <span className={cx(e.tile, t.kind === 'fix' && e.tileRed)} aria-hidden="true">
                      <Icon width={18} height={18} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p className={e.taskTitle}>{t.title}</p>
                      <p className={e.taskSub}>
                        {t.kind === 'review'
                          ? `${t.review.projectTitle}, sent ${timeAgo(t.review.at)}${t.review.note ? `: “${t.review.note}”` : ''}`
                          : `${t.project.title}${t.kind === 'work' && t.stage.key !== 'story' ? `. The ${t.stage.requires.map((k) => stageMeta(k).label).join(' and ')} ${t.stage.requires.length > 1 ? 'are' : 'is'} approved.` : ''}`}
                      </p>
                    </div>
                    <Button variant={i === 0 ? 'primary' : 'secondary'} onClick={() => navigate(t.to)}>
                      {t.kind === 'review' ? 'Review' : t.kind === 'fix' ? 'Open' : 'Start'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={e.card} aria-labelledby="emp-sent">
          <div className={e.cardHead}>
            <h2 id="emp-sent" className={e.cardTitle}>
              Your work in review
            </h2>
            <span className={e.cardSub}>What reviewers said</span>
          </div>
          {!data ? (
            <p className={e.empty}>Loading…</p>
          ) : latest.length === 0 ? (
            <p className={e.empty}>Nothing sent yet. When your part of a stage is ready, use Submit for review.</p>
          ) : (
            <div>
              {latest.slice(0, 4).map((s) => {
                const st = SUBMISSION[s.status];
                return (
                  <div key={s.id} className={e.reviewItem}>
                    <div className={e.reviewRow}>
                      <span className={e.reviewName}>{itemLabel(s)}</span>
                      <Pill tone={st.tone}>{st.label}</Pill>
                    </div>
                    <span className={e.small}>
                      {s.projectTitle}, {s.status === 'pending' ? `with ${s.reviewer?.name || 'the reviewer'}, sent ${timeAgo(s.at)}` : `${timeAgo(s.reviewedAt)}`}
                    </span>
                    {s.comment && (
                      <p className={cx(e.quote, s.status === 'approved' && e.quoteOk)}>
                        {s.comment}
                        <span className={e.quoteBy}>{s.reviewedBy?.name}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className={e.section} aria-labelledby="emp-projects">
        <div className={e.sectionHead}>
          <h2 id="emp-projects" className={e.sectionTitle}>
            My projects
          </h2>
          <div className={e.headTools}>
            <StripLegend />
            {projects.length > 3 && (
              <Link to="/employee/projects" className={pages.inlineLink} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                View all <IconChevronRight width={16} height={16} />
              </Link>
            )}
          </div>
        </div>
        {data && projects.length === 0 ? (
          <p className={cx(e.card, e.empty)}>
            You are not on any project yet. When your Team Leader adds you to one, it appears here with the stages you work on.
          </p>
        ) : (
          <ul className={e.projects}>
            {projects.slice(0, 3).map((p) => (
              <li key={p.id}>
                <ProjectCard project={p} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
