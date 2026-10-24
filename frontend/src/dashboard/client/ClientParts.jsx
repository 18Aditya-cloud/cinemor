import { useEffect, useState } from 'react';
import cx from '../../utils/cx.js';
import { dayLabel } from '../projectDates.jsx';
import timeAgo from '../timeAgo.js';
import Pill from '../ui/Pill.jsx';
import { fileUrl } from './clientApi.js';
import c from './Client.module.css';

/** An object URL for a file of the project (undefined while loading, null when it is not there). */
export function useFileUrl(path) {
  const [url, setUrl] = useState(undefined);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return undefined;
    }
    let alive = true;
    setUrl(undefined);
    fileUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

/** An image behind the sign-in; `fallback` shows while it loads or when there is none. */
export function AuthImage({ path, alt, fallback = null }) {
  const url = useFileUrl(path);
  return url ? <img src={url} alt={alt} loading="lazy" /> : fallback;
}

/** The project's state, in words a client reads. */
export function ProjectPill({ project }) {
  if (project.waitingForYou) return <Pill tone="amber">{project.waitingForYou === 1 ? '1 film to review' : `${project.waitingForYou} films to review`}</Pill>;
  if (project.status === 'completed') return <Pill tone="green">Completed</Pill>;
  if (project.status === 'aborted') return <Pill tone="gray">Stopped</Pill>;
  if (project.delayedDays > 0) return <Pill tone="red">Running late</Pill>;
  if (project.status === 'pending') return <Pill tone="blue">Starting soon</Pill>;
  return <Pill tone="violet">In progress</Pill>;
}

export function FilmPill({ film }) {
  if (film.state === 'waiting_for_you') return <Pill tone="amber">Waiting for you</Pill>;
  if (film.state === 'approved') return <Pill tone="green">You approved it</Pill>;
  if (film.state === 'changes_asked') return <Pill tone="red">Changes asked</Pill>;
  return <Pill tone="gray">Being made</Pill>;
}

/** Five short bars: story, storyboard, characters & places, sketches, film. */
export function StepBar({ steps, label }) {
  const done = steps.filter((s) => s.status === 'done').length;
  return (
    <div className={c.bar} role="img" aria-label={label || `${done} of ${steps.length} steps ready`}>
      {steps.map((s) => (
        <i key={s.key} className={cx(s.status === 'done' && c.done, s.status === 'working' && c.working, (s.status === 'for_you' || s.status === 'changes_asked') && c.forYou)} title={`${s.label}: ${STEP_WORDS[s.status]}`} />
      ))}
    </div>
  );
}

export const STEP_WORDS = {
  done: 'ready',
  working: 'being made',
  waiting: 'not started',
  for_you: 'waiting for you',
  changes_asked: 'being changed',
};

/** A project's stories' steps, folded into one row (a step is done when it is done for every story). */
export function projectSteps(project) {
  const stories = project.stories || [];
  if (!stories.length) return ['story', 'storyboard', 'cast', 'sketches', 'film'].map((key) => ({ key, label: key, status: 'waiting' }));
  return stories[0].steps.map((first, i) => {
    const all = stories.map((s) => s.steps[i]?.status);
    let status = 'waiting';
    if (all.every((x) => x === 'done')) status = 'done';
    else if (all.some((x) => x === 'for_you')) status = 'for_you';
    else if (all.some((x) => x !== 'waiting')) status = 'working';
    return { key: first.key, label: first.label, status };
  });
}

export const dateText = (iso) => (iso ? dayLabel(iso.slice(0, 10)) : '');

/** The conversation with the studio. `side` is the reader's side ('client' or 'team'). */
export function Thread({ comments, side = 'client', empty = 'No messages yet.' }) {
  if (!comments.length) return <p className={c.empty}>{empty}</p>;
  return (
    <ul className={c.thread} aria-label="Messages">
      {comments.map((m) => (
        <li key={m.id} className={cx(c.msg, m.side === side && c.msgMine)}>
          <span className={c.msgHead}>
            <b>{m.side === side ? 'You' : m.author}</b>
            {m.story && <span>on {m.story}</span>}
            <span>{timeAgo(m.at)}</span>
          </span>
          {m.body}
        </li>
      ))}
    </ul>
  );
}
