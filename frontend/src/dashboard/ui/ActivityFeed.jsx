import { Fragment } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import cx from '../../utils/cx.js';
import timeAgo from '../timeAgo.js';
import { IconBriefcase, IconBuilding, IconCheckCircle, IconGear, IconProjects, IconUserPlus, IconUsers, IconWrench } from './DashIcons.jsx';
import styles from './ActivityFeed.module.css';

/**
 * The organization's activity, as a timeline grouped by day (Overview → Recent activity, and the Activity page).
 *   items: [{ id, type, text, at, actor: { userId, email, role } | null }]
 * With an actor the row reads "You created the project Panchatantra"; without one (the demo) `text` is shown as it is.
 */
export const ACTIVITY_KINDS = {
  project: { icon: IconProjects, label: 'Projects' },
  stage: { icon: IconCheckCircle, label: 'Approvals' },
  employee: { icon: IconUsers, label: 'Team' },
  invitation: { icon: IconUserPlus, label: 'Invitations' },
  client: { icon: IconBuilding, label: 'Clients' },
  role: { icon: IconBriefcase, label: 'Job roles' },
  tool: { icon: IconWrench, label: 'Tools' },
  organization: { icon: IconGear, label: 'Organization' },
};

const toTime = (at) => (typeof at === 'number' ? at : Date.parse(at));
const dayKey = (time) => new Date(time).toDateString();

function dayLabel(time) {
  const day = new Date(time);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (day.toDateString() === today.toDateString()) return 'Today';
  if (day.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return day.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    ...(day.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
}

// today: "5 min ago"; earlier days sit under their own date, so just the time of day
function when(time) {
  if (dayKey(time) === dayKey(Date.now())) return timeAgo(time);
  return new Date(time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// “Names” and e-mail addresses inside a message are drawn a little stronger
const TOKENS = /“([^”]+)”|"([^"]+)"|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;
function Message({ text }) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(TOKENS)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[3]) parts.push(<span key={match.index} className={styles.person}>{match[3]}</span>);
    else parts.push(<span key={match.index} className={styles.thing}>{match[1] ?? match[2]}</span>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const ROLE_CLASS = { Admin: 'roleAdmin', 'Team Leader': 'roleLead', Reviewer: 'roleReviewer', Employee: 'roleEmployee' };

export default function ActivityFeed({ items, compact = false, label = 'Activity' }) {
  const { user } = useAuth() ?? {};
  const groups = [];
  for (const item of items) {
    const time = toTime(item.at);
    const key = Number.isFinite(time) ? dayKey(time) : 'unknown';
    if (groups.at(-1)?.key !== key) groups.push({ key, time, items: [] });
    groups.at(-1).items.push({ ...item, time });
  }

  return (
    <div className={cx(styles.feed, compact && styles.compact)} aria-label={label} role="feed">
      {groups.map((group) => (
        <Fragment key={group.key}>
          <h3 className={styles.day}>{Number.isFinite(group.time) ? dayLabel(group.time) : 'Earlier'}</h3>
          <ol className={styles.list}>
            {group.items.map((item) => {
              const kind = ACTIVITY_KINDS[item.type] ? item.type : 'project';
              const Icon = ACTIVITY_KINDS[kind].icon;
              const actor = item.actor;
              const isMe = actor && user && (actor.userId === user.id || actor.email === user.email);
              return (
                <li key={item.id} className={cx(styles.item, styles[`k_${kind}`])}>
                  <span className={styles.tile} aria-hidden="true">
                    <Icon width={15} height={15} />
                  </span>
                  <div className={styles.body}>
                    <p className={styles.text}>
                      {actor ? (
                        <>
                          <span className={styles.actor}>{isMe ? 'You' : actor.email}</span> <Message text={item.text} />
                        </>
                      ) : (
                        <Message text={item.text} />
                      )}
                    </p>
                    <p className={styles.meta}>
                      {actor?.role && <span className={cx(styles.role, styles[ROLE_CLASS[actor.role] || 'roleEmployee'])}>{actor.role}</span>}
                      {Number.isFinite(item.time) && (
                        <time dateTime={new Date(item.time).toISOString()} title={new Date(item.time).toLocaleString()}>
                          {when(item.time)}
                        </time>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Fragment>
      ))}
    </div>
  );
}
