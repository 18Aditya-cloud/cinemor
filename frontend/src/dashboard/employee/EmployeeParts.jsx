import { useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import timeAgo from '../timeAgo.js';
import Button from '../ui/Button.jsx';
import { IconBell, IconCheck, IconLock } from '../ui/DashIcons.jsx';
import { getNotifications, markNotificationsRead } from './employeeApi.js';
import { projectPath, stageMeta, STAGES, STATE } from './stages.js';
import e from './Employee.module.css';

/** The person's roles on a project as small pills: the work roles, then "Reviewer: ..." ones. */
export function RolePills({ project, max = 3 }) {
  const work = project.workRoles.map((r) => ({ key: `w${r.jobRoleId}`, text: r.name, review: false }));
  const review = project.reviewRoles.map((r) => ({ key: `r${r.jobRoleId}`, text: `${r.name} reviewer`, review: true }));
  const all = [...work, ...review];
  if (!all.length && project.isTeamLeader) all.push({ key: 'tl', text: 'Team Leader', review: true });
  const shown = all.slice(0, max);
  return (
    <span className={e.roles}>
      {shown.map((r) => (
        <span key={r.key} className={cx(e.role, r.review && e.roleReview)}>
          {r.text}
        </span>
      ))}
      {all.length > max && <span className={e.role}>+{all.length - max}</span>}
    </span>
  );
}

/** The six stages as a strip: the person's own stages highlighted, approved ones ticked, locked ones with a lock. */
export function StageStrip({ project, stages = null }) {
  const mineOf = Object.fromEntries(project.stages.map((s) => [s.key, s]));
  return (
    <ol className={e.pipe} aria-label="Stages">
      {(stages || project.stages).map((one) => {
        const s = { ...one, canReview: mineOf[one.key]?.canReview, canWork: stages ? mineOf[one.key]?.roleAllows : one.canWork };
        const meta = stageMeta(s.key);
        const Icon = s.status === 'approved' ? IconCheck : s.status === 'locked' ? IconLock : meta.icon;
        const mine = s.canWork || s.canReview;
        return (
          <li
            key={s.key}
            className={cx(
              e.chip,
              mine && e.chipMine,
              s.status === 'approved' && e.chipDone,
              s.status === 'in_review' && e.chipReview,
              s.status === 'changes_requested' && e.chipAsk,
              s.status === 'locked' && e.chipLocked,
            )}
            title={`${s.label}: ${STATE[s.status]?.label || s.status}${s.canWork ? ' (your part)' : s.canReview ? ' (you review it)' : ''}`}
          >
            <Icon width={15} height={15} aria-hidden="true" />
            <span>{meta.short}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function StripLegend() {
  return (
    <div className={e.legend} aria-hidden="true">
      <span>
        <i className={e.dotMine} /> Your part
      </span>
      <span>
        <i className={e.dotDone} /> Approved
      </span>
      <span>
        <i className={e.dotLock} /> Not open yet
      </span>
    </div>
  );
}

/** A project as a card: title, client, the person's roles, the stage strip, progress, Team Leader. */
export function ProjectCard({ project }) {
  const done = project.stories.reduce((n, st) => n + st.approvedCount, 0);
  const pct = project.storyCount ? Math.round((done / (project.storyCount * project.totalStages)) * 100) : 0;
  const stories = project.storyCount ? `${project.storyCount} ${project.storyCount === 1 ? 'story' : 'stories'}, ${project.finishedStoryCount} finished` : 'No story yet';
  return (
    <Link to={projectPath(project.id)} className={e.project} aria-label={`${project.title}, ${stories}`}>
      <div>
        <p className={e.projectTitle}>{project.title}</p>
        <p className={e.small} style={{ marginTop: 4 }}>
          {project.clientName ? `Client: ${project.clientName}` : 'No client'}
        </p>
      </div>
      <RolePills project={project} max={3} />
      <StageStrip project={project} />
      <div className={e.bar} role="presentation">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className={e.meta}>
        <span>{project.teamLeader ? `Team Leader: ${project.teamLeader.name}` : ''}</span>
        <span>
          {stories}
        </span>
      </div>
    </Link>
  );
}

/** The bell: the unread count, and the latest updates (opening one marks it read; or mark all). */
export function NotificationBell() {
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ unread: 0, items: [] });
  const wrap = useRef(null);

  const load = () =>
    getNotifications()
      .then(setData)
      .catch(() => {});
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => wrap.current && !wrap.current.contains(event.target) && setOpen(false);
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markAll = async () => {
    await markNotificationsRead([]).catch(() => {});
    load();
  };

  return (
    <div className={e.bellWrap} ref={wrap}>
      <Button variant="secondary" icon={IconBell} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog">
        {data.unread ? `${data.unread} new` : 'Updates'}
      </Button>
      {open && (
        <div className={e.popover} role="dialog" aria-label="Updates">
          <div className={e.popHead}>
            <span>Updates</span>
            {data.unread > 0 && (
              <button type="button" className={e.linkButton} onClick={markAll}>
                Mark all as read
              </button>
            )}
          </div>
          {data.items.length === 0 ? (
            <p className={e.empty} style={{ padding: 16 }}>
              Nothing yet. You will hear here when work is sent to you, approved, or opens for you.
            </p>
          ) : (
            <ul className={e.notes}>
              {data.items.map((n) => (
                <li key={n.id} className={cx(e.noteItem, !n.read && e.noteUnread)}>
                  <span>{n.message}</span>
                  <span className={e.small}>
                    {timeAgo(n.at)}
                    {n.projectId && (
                      <>
                        {' '}
                        <button
                          type="button"
                          className={e.linkButton}
                          onClick={() => {
                            setOpen(false);
                            markNotificationsRead([n.id]).catch(() => {});
                            navigate(projectPath(n.projectId));
                          }}
                        >
                          Open project
                        </button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export const STAGE_ORDER = Object.fromEntries(STAGES.map((s, i) => [s.key, i + 1]));
