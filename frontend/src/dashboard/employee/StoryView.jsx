import { useId, useRef, useState } from 'react';
import { Link } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import timeAgo from '../timeAgo.js';
import Button from '../ui/Button.jsx';
import { IconBook, IconCheck, IconCheckCircle, IconChevronLeft, IconClose, IconEye, IconInfo, IconLock, IconMail, IconRefresh, IconSend, IconTrash } from '../ui/DashIcons.jsx';
import { Avatar, Chip, CoverArt, palette, Pipeline, StageIcon, stageColor } from '../ui/Production.jsx';
import { useToast } from '../ui/Toast.jsx';
import { getClientComments, replyToClient } from './employeeApi.js';
import { modulePath, projectPath, stageMeta, STATE } from './stages.js';
import v from './StoryView.module.css';

const names = (list) => (list?.length ? list.map((p) => p.name).join(', ') : 'Nobody yet');
const STATE_COLOR = { approved: 'ok', open: null, in_review: 'storyboard', changes_requested: 'red', locked: 'gray' };
const NODE_STATE = { approved: 'done', open: 'now', in_review: 'now', changes_requested: 'now', locked: 'lock' };

/**
 * One story of an organization project (/employee/projects/:id?story=:storyId): its six stages on a line (a click
 * jumps to the stage), a card per stage in the stage's colour with everything that can be done there (Open / View,
 * Submit for review, Take back, Approve / Ask for changes, Reopen) and, on the side, the story's timeline: what was
 * sent, approved or sent back and, for the Team Leader, what the client wrote about this story, with a box to answer.
 */
export default function StoryView({ project, story, pending, lastAnswer, onSubmit, onAnswer, onReopen, onTakeBack, taking, onDelete, navigate }) {
  const index = project.stories.findIndex((s) => s.id === story.id);
  const mineOf = Object.fromEntries(project.stages.map((s) => [s.key, s]));
  const [flash, setFlash] = useState(null);
  const cards = useRef({});

  const jump = (key) => {
    const el = cards.current[key];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
    setFlash(key);
    setTimeout(() => setFlash((k) => (k === key ? null : k)), 1200);
  };

  const nodes = story.stages.map((s) => ({ key: s.key, label: s.key === 'animation' ? 'Animation' : s.label, icon: stageMeta(s.key).icon, state: NODE_STATE[s.status] || 'todo', title: STATE[s.status]?.label }));

  return (
    <div className={cx(v.layout, palette)}>
      <div className={v.main}>
        <Link to={projectPath(project.id)} className={v.back}>
          <IconChevronLeft width={16} height={16} /> {project.title}
        </Link>
        <div className={v.head}>
          <CoverArt seed={`s${story.id}`} sun={false} className={v.headArt} />
          <div className={v.headText}>
            <h1 className={v.title}>{story.title}</h1>
            <p className={v.sub}>
              Story {index + 1} of {project.stories.length}
              {story.sentBy ? ` · by ${story.sentBy.name}` : ''} · {story.approvedCount} of {story.stages.length} approved
            </p>
          </div>
          {project.stories.length > 1 && (
            <div className={v.switcher} role="group" aria-label="Stories of this project">
              {project.stories.map((s) => (
                <button key={s.id} type="button" aria-pressed={s.id === story.id} className={cx(v.switch, s.id === story.id && v.switchOn)} onClick={() => navigate(`${projectPath(project.id)}?story=${s.id}`, { replace: true })} title={s.title}>
                  {s.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {!project.workOpen && (
          <p className={v.closed} role="status">
            <IconLock width={16} height={16} /> {project.workClosedReason}
          </p>
        )}

        <section className={v.pipeCard} aria-label="Where the story stands">
          <Pipeline nodes={nodes} onPick={jump} label={`Stages of ${story.title}`} />
        </section>

        <ol className={v.stages} aria-label={`Stages of ${story.title}`}>
          {story.stages.map((s) => {
            const meta = stageMeta(s.key);
            const sub = pending(story, s.key);
            const answered = lastAnswer(story, s.key);
            const canReopen = project.isTeamLeader && ['approved', 'in_review', 'changes_requested'].includes(s.status);
            const yours = mineOf[s.key]?.roleAllows || mineOf[s.key]?.canReview;
            const locked = s.status === 'locked';
            const color = STATE_COLOR[s.status] ?? s.key;
            return (
              <li
                key={s.key}
                ref={(el) => {
                  cards.current[s.key] = el;
                }}
                tabIndex={-1}
                className={cx(v.stage, stageColor(s.key), yours && v.stageMine, locked && v.stageLocked, flash === s.key && v.flash)}
              >
                <div className={v.stageHead}>
                  <span className={v.stageName}>
                    <StageIcon color={s.key} icon={meta.icon} />
                    {s.label}
                  </span>
                  <Chip color={color} icon={s.status === 'approved' ? IconCheck : locked ? IconLock : undefined}>
                    {s.status === 'open' && s.canWork ? 'Your part' : STATE[s.status]?.label}
                  </Chip>
                </div>
                {locked && (
                  <p className={v.note}>
                    <IconLock width={13} height={13} /> {s.lockedReason}
                  </p>
                )}
                {s.status === 'open' && (
                  <p className={v.note}>
                    <IconInfo width={13} height={13} /> {s.canWork ? 'Open it and work on it, then send it for review.' : `Open for ${names(mineOf[s.key]?.workers)}.`}
                  </p>
                )}
                {s.status === 'in_review' && sub && (
                  <p className={v.note}>
                    <IconInfo width={13} height={13} /> {sub.submittedBy?.name} sent it to {sub.reviewer?.name} {timeAgo(sub.at)}.{sub.note ? ` “${sub.note}”` : ''}
                  </p>
                )}
                {s.status === 'changes_requested' && answered && (
                  <p className={v.quote}>
                    {answered.comment}
                    <span>
                      {answered.reviewedBy?.name}, {timeAgo(answered.reviewedAt)}
                    </span>
                  </p>
                )}
                {s.status === 'approved' && (
                  <p className={v.approved}>
                    {s.approvedBy && <Avatar name={s.approvedBy.name} seed={s.approvedBy.userId} size={22} />}
                    <span>
                      Approved{s.approvedBy ? ` by ${s.approvedBy.name}` : ''}
                      {s.approvedAt ? ` · ${timeAgo(s.approvedAt)}` : ''}
                    </span>
                  </p>
                )}
                {(!locked || canReopen) && (
                  <div className={v.actions}>
                    {!locked && (
                      <Button variant={s.canWork ? 'primary' : 'secondary'} icon={s.canWork ? meta.icon : IconEye} onClick={() => navigate(modulePath(project.id, s.key, story.id))}>
                        {s.canWork ? 'Open' : 'View'}
                      </Button>
                    )}
                    {s.canWork && (
                      <Button variant="secondary" icon={IconSend} onClick={() => onSubmit({ stage: s, story })}>
                        {s.status === 'changes_requested' ? 'Submit again' : 'Submit for review'}
                      </Button>
                    )}
                    {sub?.canWithdraw && (
                      <Button variant="secondary" onClick={() => onTakeBack(sub)} loading={taking === sub.id}>
                        Take back
                      </Button>
                    )}
                    {sub?.canAct && (
                      <>
                        <Button icon={IconCheckCircle} onClick={() => onAnswer({ submission: sub, mode: 'approve' })}>
                          Approve
                        </Button>
                        <Button variant="danger" icon={IconClose} onClick={() => onAnswer({ submission: sub, mode: 'changes' })}>
                          Ask for changes
                        </Button>
                      </>
                    )}
                    {canReopen && (
                      <Button variant="secondary" icon={IconRefresh} onClick={() => onReopen({ stage: s, story })}>
                        Reopen
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {project.isTeamLeader && (
          <div className={v.danger}>
            <span>Team Leader only: delete this story, with everything made from it.</span>
            <Button variant="danger" icon={IconTrash} onClick={() => onDelete(story)}>
              Delete story
            </Button>
          </div>
        )}
      </div>

      <Timeline project={project} story={story} />
    </div>
  );
}

/** The story's timeline: reviews, approvals and (Team Leader) the client's messages about this story, newest first. */
function Timeline({ project, story }) {
  const toast = useToast();
  const uid = useId();
  const client = useResource(() => (project.isTeamLeader ? getClientComments(project.id) : Promise.resolve(null)), [project.id, project.isTeamLeader]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const events = [];
  if (story.createdAt) events.push({ key: 'made', at: story.createdAt, color: 'story', icon: IconBook, title: 'Story started', text: story.sentBy ? `by ${story.sentBy.name}` : '' });
  project.submissions
    .filter((x) => x.storyId === story.id)
    .forEach((x) => {
      const icon = stageMeta(x.stage).icon;
      events.push({ key: `s${x.id}`, at: x.at, color: x.stage, icon: IconSend, title: `${x.stageLabel} sent for review`, text: `${x.submittedBy?.name || 'Someone'} → ${x.reviewer?.name || 'reviewer'}`, quote: x.note });
      if (x.status === 'approved' && x.reviewedAt) events.push({ key: `a${x.id}`, at: x.reviewedAt, color: x.stage, icon: IconCheck, title: `${x.stageLabel} approved`, text: x.reviewedBy?.name || '', quote: x.comment, ok: true });
      if (x.status === 'changes_requested' && x.reviewedAt) events.push({ key: `c${x.id}`, at: x.reviewedAt, color: 'red', icon: IconClose, title: `Changes asked on the ${x.stageLabel}`, text: x.reviewedBy?.name || '', quote: x.comment });
      if (x.status === 'withdrawn') events.push({ key: `w${x.id}`, at: x.reviewedAt || x.at, color: 'gray', icon: icon, title: `${x.stageLabel} taken back`, text: x.submittedBy?.name || '' });
    });
  const talk = client.data ? client.data.comments.filter((m) => m.storyId === story.id) : [];
  talk.forEach((m) =>
    events.push({ key: `m${m.id}`, at: m.at, color: m.side === 'client' ? 'brand' : 'storyboard', icon: IconMail, title: m.side === 'client' ? `Client ${m.author}` : `${m.author} to the client`, quote: m.body, message: true }),
  );
  events.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

  const send = async (event) => {
    event.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await replyToClient(project.id, text.trim(), story.id);
      setText('');
      toast('Reply sent to the client.');
      client.reload();
    } catch (err) {
      toast(err.message || 'The reply could not be sent.', 'error');
    }
    setSending(false);
  };

  return (
    <aside className={v.timeline} aria-labelledby={`${uid}-tl`}>
      <h2 id={`${uid}-tl`} className={v.tlTitle}>
        Story timeline
      </h2>
      <p className={v.tlSub}>{project.isTeamLeader ? 'Reviews, approvals and the client’s messages, newest first' : 'Reviews and approvals, newest first'}</p>
      {events.length === 0 ? (
        <p className={v.tlEmpty}>Nothing has happened on this story yet.</p>
      ) : (
        <ol className={v.events}>
          {events.map((ev) => (
            <li key={ev.key} className={v.event}>
              <span className={cx(v.eventDot, stageColor(ev.color))} aria-hidden="true">
                <ev.icon width={13} height={13} />
              </span>
              <div className={v.eventBody}>
                <b>{ev.title}</b>
                <span className={v.eventMeta}>
                  {ev.text ? `${ev.text} · ` : ''}
                  {timeAgo(ev.at)}
                </span>
                {ev.quote && <p className={cx(v.eventQuote, ev.message && v.eventMessage)}>{ev.quote}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {project.isTeamLeader && client.data && (
        client.data.client.onPortal ? (
          <form className={v.composer} onSubmit={send}>
            <label htmlFor={`${uid}-reply`} className="cm-sr-only">
              Reply to the client about this story
            </label>
            <textarea id={`${uid}-reply`} value={text} onChange={(ev) => setText(ev.target.value)} placeholder={`Write to ${client.data.client.name || 'the client'} about this story…`} maxLength={4000} rows={2} />
            <Button type="submit" icon={IconSend} iconOnly loading={sending} disabled={!text.trim()} aria-label="Send to the client">
              Send
            </Button>
          </form>
        ) : (
          <p className={v.tlEmpty}>{client.data.client.name ? `${client.data.client.name} is not on the client portal yet.` : 'This project has no client on the portal.'}</p>
        )
      )}
    </aside>
  );
}
