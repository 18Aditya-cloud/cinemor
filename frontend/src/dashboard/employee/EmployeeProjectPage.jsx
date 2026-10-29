import { useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import timeAgo from '../timeAgo.js';
import Button from '../ui/Button.jsx';
import { IconCheckCircle, IconChevronLeft, IconChevronRight, IconClose, IconEye, IconLock, IconPlus, IconSend } from '../ui/DashIcons.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import Notice from '../ui/Notice.jsx';
import Pill from '../ui/Pill.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import { useToast } from '../ui/Toast.jsx';
import pages from '../pages/pages.module.css';
import { deleteProjectStory, getMyProject, itemLabel, withdrawSubmission } from './employeeApi.js';
import ClientPanel from './ClientPanel.jsx';
import { NotificationBell, RolePills } from './EmployeeParts.jsx';
import { AnswerModal, ReopenModal, SubmitModal } from './ReviewModals.jsx';
import { modulePath, projectPath, STAGES, stageMeta, STATE, SUBMISSION } from './stages.js';
import StoryView from './StoryView.jsx';
import e from './Employee.module.css';

const names = (list) => (list.length ? list.map((p) => p.name).join(', ') : 'Nobody yet');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// what a story is doing now: the stage that matters most comes first
const ACTIVE = ['changes_requested', 'in_review', 'open'];
const TASK_ORDER = { fix: 0, review: 1, work: 2 };
const TASKS_SHOWN = 4;
const REVIEWS_SHOWN = 6;
const SEG = { approved: e.segDone, open: e.segOpen, in_review: e.segReview, changes_requested: e.segAsk };

const FILTERS = [
  { key: 'all', label: 'All stories' },
  { key: 'mine', label: 'Needs you' },
  { key: 'review', label: 'In review' },
  { key: 'changes', label: 'Changes asked' },
  { key: 'done', label: 'Finished' },
];

/**
 * One project's workflow, sorted around what this person has to do.
 *  - "Ready for you": the stages they can work on now, the changes asked of them, and the work waiting for their review.
 *  - "All stories": one line per story with its six stages as a bar and where it stands now. Opening a story shows it
 *    on its own (StoryView, ?story=id): its stages on a line, a card per stage with its buttons (Open / View, Submit for
 *    review, Take back, Approve / Ask for changes and, as Team Leader, Reopen and Delete story) and its timeline.
 *  - On the side: who works on and reviews each stage, and the project's reviews.
 * A project can have several stories; every story goes through the six stages on its own.
 */
export default function EmployeeProjectPage({ projectId }) {
  const toast = useToast();
  const { navigate, search } = useRouter();
  const { data: project, loading, error, reload } = useResource(() => getMyProject(projectId), [projectId]);
  const [submit, setSubmit] = useState(null); // { stage, story }
  const [answer, setAnswer] = useState(null); // { submission, mode }
  const [reopen, setReopen] = useState(null); // { stage, story }
  const [taking, setTaking] = useState(null);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('mine');
  const [allTasks, setAllTasks] = useState(false);
  const [allReviews, setAllReviews] = useState(false);
  const [deleting, setDeleting] = useState(null); // the story the Team Leader is deleting (asks first)
  // a story opened on its own (?story=id) names the tab after itself
  const storyParam = Number(new URLSearchParams(search).get('story')) || null;
  const openedTitle = storyParam ? project?.stories.find((st) => st.id === storyParam)?.title : null;
  useDocumentTitle(openedTitle ? `${openedTitle} · ${project.title}` : project?.title || 'Project');

  const back = (
    <Link to="/employee/projects" className={e.back}>
      <IconChevronLeft width={16} height={16} /> My Projects
    </Link>
  );
  if (!project) {
    return (
      <div className={pages.page} aria-busy={!error}>
        {back}
        {error && <Notice message={error.message} onRetry={reload} />}
      </div>
    );
  }

  const mineOf = Object.fromEntries(project.stages.map((s) => [s.key, s]));
  const canWrite = Boolean(mineOf.story?.canWork);
  const pending = (story, key) => project.submissions.find((x) => x.storyId === story.id && x.stage === key && x.status === 'pending');
  const lastAnswer = (story, key) => project.submissions.find((x) => x.storyId === story.id && x.stage === key && ['approved', 'changes_requested'].includes(x.status));
  const needsYou = (story) => story.stages.some((s) => s.canWork || pending(story, s.key)?.canAct);
  const hasMine = (story) => story.stages.some((s) => s.canWork || pending(story, s.key)?.canAct || pending(story, s.key)?.canWithdraw);
  const finished = (story) => story.stages.length > 0 && story.approvedCount === story.stages.length;
  const matches = {
    all: () => true,
    mine: needsYou,
    review: (st) => st.stages.some((s) => s.status === 'in_review'),
    changes: (st) => st.stages.some((s) => s.status === 'changes_requested'),
    done: finished,
  };

  // where a story stands now, for its line in the list
  const nowOf = (story) => {
    if (finished(story)) return { tone: 'green', label: 'Finished', note: 'All six stages approved' };
    const active = story.stages.filter((s) => ACTIVE.includes(s.status)).sort((a, b) => ACTIVE.indexOf(a.status) - ACTIVE.indexOf(b.status));
    if (!active.length) return { tone: 'gray', label: 'Waiting', note: '' };
    const s = active[0];
    let note = s.label;
    if (s.status === 'in_review') {
      const sub = pending(story, s.key);
      if (sub?.reviewer) note += sub.canAct ? ' · sent to you' : ` · with ${sub.reviewer.name}`;
    } else if (s.status === 'changes_requested') {
      const a = lastAnswer(story, s.key);
      if (a?.reviewedBy) note += ` · ${a.reviewedBy.name}`;
    } else if (s.canWork) {
      note += ' · your part';
    }
    if (active.length > 1) note += ` (+${active.length - 1} more)`;
    return { tone: STATE[s.status].tone, label: `${s.label} ${STATE[s.status].label.toLowerCase()}`, note };
  };

  // "Ready for you": every stage this person can work on now, and every submission waiting for their answer
  const tasks = [];
  project.stories.forEach((story) => {
    story.stages.forEach((s) => {
      const sub = pending(story, s.key);
      if (sub?.canAct) tasks.push({ key: `r${sub.id}`, kind: 'review', story, stage: s, sub });
      if (s.canWork) tasks.push({ key: `w${story.id}-${s.key}`, kind: s.status === 'changes_requested' ? 'fix' : 'work', story, stage: s });
    });
  });
  tasks.sort((a, b) => TASK_ORDER[a.kind] - TASK_ORDER[b.kind]);
  const shownTasks = allTasks ? tasks : tasks.slice(0, TASKS_SHOWN);

  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, project.stories.filter(matches[f.key]).length]));
  const rank = (st) => (needsYou(st) ? 0 : finished(st) ? 2 : 1);
  const stories = project.stories.map((st, i) => ({ st, i })).filter(({ st }) => matches[filter](st));
  if (sort === 'mine') stories.sort((a, b) => rank(a.st) - rank(b.st) || a.i - b.i);
  const shownReviews = allReviews ? project.submissions : project.submissions.slice(0, REVIEWS_SHOWN);

  const takeBack = async (sub) => {
    setTaking(sub.id);
    try {
      await withdrawSubmission(sub.id);
      toast('Taken back from review');
      await reload();
    } catch (err) {
      toast(err.message, 'error');
    }
    setTaking(null);
  };

  const modals = (
    <>
      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete this story?"
        text={deleting ? `“${deleting.title}” is deleted for good, with everything made from it: its versions, storyboard, characters, locations, sketches, clips and film, and its reviews. The other stories of the project are not touched. This cannot be undone.` : ''}
        confirmLabel="Delete Story"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await deleteProjectStory(project.id, deleting.id);
          toast(`“${deleting.title}” deleted`);
          navigate(projectPath(project.id), { replace: true });
          await reload();
        }}
      />
      <SubmitModal open={Boolean(submit)} project={project} stage={submit?.stage} story={submit?.story} onClose={() => setSubmit(null)} onDone={reload} />
      <AnswerModal open={Boolean(answer)} submission={answer?.submission} mode={answer?.mode} onClose={() => setAnswer(null)} onDone={reload} />
      <ReopenModal open={Boolean(reopen)} project={project} stage={reopen?.stage} story={reopen?.story} onClose={() => setReopen(null)} onDone={reload} />
    </>
  );

  // one story on its own (?story=id)
  const opened = storyParam ? project.stories.find((st) => st.id === storyParam) : null;
  if (opened) {
    return (
      <div className={pages.page}>
        {error && <Notice message={error.message} onRetry={reload} />}
        <StoryView
          key={opened.id}
          project={project}
          story={opened}
          pending={pending}
          lastAnswer={lastAnswer}
          onSubmit={setSubmit}
          onAnswer={setAnswer}
          onReopen={setReopen}
          onTakeBack={takeBack}
          taking={taking}
          onDelete={setDeleting}
          navigate={navigate}
        />
        {modals}
      </div>
    );
  }

  return (
    <div className={cx(pages.page, e.projectPage)}>
      {back}
      <div className={e.projectHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={e.pageTitle}>{project.title}</h1>
          <div className={e.facts}>
            {project.clientName && (
              <span>
                Client <b>{project.clientName}</b>
              </span>
            )}
            {project.teamLeader && (
              <span>
                Team Leader <b>{project.isTeamLeader ? 'You' : project.teamLeader.name}</b>
              </span>
            )}
            <span>
              <b>{plural(project.storyCount, 'story', 'stories')}</b>, {project.finishedStoryCount} finished
            </span>
          </div>
          <div style={{ marginTop: 12 }}>
            <RolePills project={project} max={6} />
          </div>
        </div>
        <div className={e.headTools}>
          <NotificationBell />
          <RefreshButton onClick={reload} loading={loading} />
          {canWrite && (
            <Button icon={IconPlus} onClick={() => navigate(modulePath(project.id, 'story'))}>
              Write a new story
            </Button>
          )}
        </div>
      </div>
      {error && <Notice message={error.message} onRetry={reload} />}
      {project.description && <p className={e.lead} style={{ marginTop: -6, marginBottom: 20 }}>{project.description}</p>}
      {!project.workOpen && (
        <p className={e.closedNote} role="status">
          <IconLock width={17} height={17} /> {project.workClosedReason}
        </p>
      )}

      {project.stories.length > 0 && (
        <div className={e.filterBar}>
          <div className={e.filters} role="group" aria-label="Show stories">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={cx(e.filter, filter === f.key && e.filterOn)} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label}
                <span className={e.filterCount}>{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <label className={e.sortBox}>
            <span>Sort</span>
            <select value={sort} onChange={(ev) => setSort(ev.target.value)}>
              <option value="mine">Needs me first</option>
              <option value="order">Order written</option>
            </select>
          </label>
        </div>
      )}

      <div className={e.projectLayout}>
        <div className={e.projectMain}>
          {/* ------------------------------------------------------------------ ready for you */}
          {tasks.length > 0 && (
            <section aria-labelledby="emp-ready">
              <h2 id="emp-ready" className={e.groupTitle}>
                Ready for you <span className={e.groupCount}>{tasks.length}</span>
              </h2>
              <ul className={e.readyGrid}>
                {shownTasks.map((t) => (
                  <ReadyCard key={t.key} task={t} project={project} lastAnswer={lastAnswer} navigate={navigate} onSubmit={setSubmit} onAnswer={setAnswer} />
                ))}
              </ul>
              {tasks.length > TASKS_SHOWN && (
                <button type="button" className={e.moreLink} onClick={() => setAllTasks((v) => !v)}>
                  {allTasks ? 'Show fewer' : `Show all ${tasks.length}`}
                </button>
              )}
            </section>
          )}

          {/* ------------------------------------------------------------------ all stories */}
          <section className={tasks.length ? e.section : undefined} aria-labelledby="emp-stories">
            <h2 id="emp-stories" className={e.groupTitle}>
              All stories
            </h2>
            {project.stories.length === 0 ? (
              <div className={cx(e.card, e.emptyStories)}>
                <p>{canWrite ? 'No story yet. Write the first one: it starts the workflow.' : 'No story yet. The Story Writers start here.'}</p>
                {canWrite && (
                  <Button icon={IconPlus} onClick={() => navigate(modulePath(project.id, 'story'))}>
                    Write the first story
                  </Button>
                )}
              </div>
            ) : (
              <div className={e.storyTable}>
                <div className={e.storyTableHead} aria-hidden="true">
                  <span>Story</span>
                  <span className={e.trackLabels}>
                    {STAGES.map((s) => (
                      <span key={s.key} title={s.label} className={e.trackLabel}>
                        <s.icon width={14} height={14} aria-hidden="true" />
                        <span className={e.trackText}>{s.short}</span>
                      </span>
                    ))}
                  </span>
                  <span>Now</span>
                  <span />
                </div>
                {stories.length === 0 && (
                  <p className={e.tableEmpty}>
                    No story here.{' '}
                    <button type="button" className={e.linkButton} onClick={() => setFilter('all')}>
                      Show all stories
                    </button>
                  </p>
                )}
                <ol className={e.storyRows}>
                  {stories.map(({ st: story }) => {
                    const now = nowOf(story);
                    const mine = hasMine(story);
                    return (
                      <li key={story.id} className={cx(e.storyItem, mine && e.storyItemMine)}>
                        <div className={e.storyLine}>
                          <div className={e.storyName}>
                            <Link to={modulePath(project.id, 'story', story.id)} className={e.storyLink}>
                              {story.title}
                            </Link>
                            <span className={e.small}>
                              {story.sentBy ? `by ${story.sentBy.name}` : 'Not sent for review yet'} · {story.approvedCount} of {story.stages.length} approved
                            </span>
                          </div>
                          <ol className={e.track} aria-label={`Stages of ${story.title}`}>
                            {story.stages.map((s) => {
                              const yours = mineOf[s.key]?.roleAllows || mineOf[s.key]?.canReview;
                              return (
                                <li key={s.key} className={cx(e.seg, SEG[s.status], yours && e.segMine)} title={`${s.label}: ${STATE[s.status]?.label}${yours ? ' (your part)' : ''}`}>
                                  <span className={e.srOnly}>
                                    {s.label}: {STATE[s.status]?.label}
                                  </span>
                                </li>
                              );
                            })}
                          </ol>
                          <div className={e.storyNow}>
                            <Pill tone={now.tone}>{now.label}</Pill>
                            {now.note && <span className={e.small}>{now.note}</span>}
                          </div>
                          <Link
                            to={`${projectPath(project.id)}?story=${story.id}`}
                            className={cx(e.rowToggle, needsYou(story) && e.rowTogglePrimary)}
                            style={{ textDecoration: 'none' }}
                            aria-label={`${needsYou(story) ? 'Open' : 'View'} ${story.title}`}
                          >
                            {needsYou(story) ? 'Open' : 'View'}
                            <IconChevronRight width={15} height={15} aria-hidden="true" />
                          </Link>
                        </div>

                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
            {project.stories.length > 0 && (
              <div className={e.trackLegend} aria-hidden="true">
                <span>
                  <i className={cx(e.seg, e.segDone)} /> Approved
                </span>
                <span>
                  <i className={cx(e.seg, e.segOpen)} /> Open
                </span>
                <span>
                  <i className={cx(e.seg, e.segReview)} /> In review
                </span>
                <span>
                  <i className={cx(e.seg, e.segAsk)} /> Changes asked
                </span>
                <span>
                  <i className={e.seg} /> Not open yet
                </span>
                <span>
                  <i className={cx(e.seg, e.segMine)} /> Your part (outlined)
                </span>
              </div>
            )}
          </section>
        </div>

        {/* ------------------------------------------------------------------ the side: who does what, and reviews */}
        <aside className={e.projectRail}>
          {project.isTeamLeader && <ClientPanel project={project} />}
          <section className={cx(e.card, e.railCard)} aria-labelledby="emp-team">
            <h2 id="emp-team" className={e.cardTitle}>
              Who works on each stage
            </h2>
            <ul className={e.teamList}>
              {project.stages.map((s) => {
                const yours = s.roleAllows || s.canReview;
                return (
                  <li key={s.key} className={cx(e.teamLine, yours && e.teamLineMine)}>
                    <span className={e.teamStage}>
                      {s.label}
                      {s.roleAllows ? <span className={e.mineTag}>Your part</span> : s.canReview ? <span className={e.mineTag}>You review it</span> : null}
                    </span>
                    <span className={e.teamPeople}>
                      Works on it: <b>{names(s.workers)}</b>
                    </span>
                    <span className={e.teamPeople}>
                      Reviews it: <b>{names(s.reviewers)}</b>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={cx(e.card, e.railCard)} aria-labelledby="emp-history">
            <div className={e.cardHead} style={{ marginBottom: 0 }}>
              <h2 id="emp-history" className={e.cardTitle}>
                Reviews on this project
              </h2>
              <span className={e.cardSub}>Newest first</span>
            </div>
            {project.submissions.length === 0 ? (
              <p className={e.empty} style={{ paddingTop: 4 }}>
                Nothing has been sent for review yet.
              </p>
            ) : (
              <ul className={e.railReviews}>
                {shownReviews.map((x) => {
                  const st = SUBMISSION[x.status];
                  return (
                    <li key={x.id} className={e.railReview}>
                      <div className={e.railReviewTop}>
                        <Pill tone={st.tone}>{st.label}</Pill>
                        <span className={e.small}>{timeAgo(x.reviewedAt || x.at)}</span>
                      </div>
                      <span className={e.railReviewText}>
                        <b>{x.submittedBy?.name}</b> sent the <b>{itemLabel(x)}</b> to <b>{x.reviewer?.name}</b>
                        {x.reviewedBy && x.status !== 'withdrawn' && x.status !== 'cancelled' ? (
                          <>
                            ; {x.status === 'approved' ? 'approved' : 'changes asked'} by <b>{x.reviewedBy.name}</b>
                          </>
                        ) : null}
                        .
                      </span>
                      {x.note && <span className={cx(e.quote, e.quoteNote)}>{x.note}</span>}
                      {x.comment && <span className={cx(e.quote, x.status === 'approved' && e.quoteOk)}>{x.comment}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            {project.submissions.length > REVIEWS_SHOWN && (
              <button type="button" className={e.moreLink} onClick={() => setAllReviews((v) => !v)}>
                {allReviews ? 'Show fewer' : `Show all ${project.submissions.length}`}
              </button>
            )}
          </section>
        </aside>
      </div>

      {modals}
    </div>
  );
}

/** One card in "Ready for you": a stage to work on, changes to make, or a submission to answer. */
function ReadyCard({ task, project, lastAnswer, navigate, onSubmit, onAnswer }) {
  const { kind, story, stage, sub } = task;
  const meta = stageMeta(stage.key);
  const go = () => navigate(modulePath(project.id, stage.key, story.id));
  const answered = kind === 'fix' ? lastAnswer(story, stage.key) : null;
  const what = stage.key === 'story' ? 'The story' : `${stage.label}`;
  const pill = kind === 'review' ? { tone: 'blue', text: `${stage.label}: to review` } : kind === 'fix' ? { tone: 'red', text: `${stage.label}: changes asked` } : { tone: 'violet', text: `${stage.label}: open` };
  return (
    <li className={cx(e.ready, kind === 'review' && e.readyReview, kind === 'fix' && e.readyFix)}>
      <div className={e.readyHead}>
        <div style={{ minWidth: 0 }}>
          <Link to={modulePath(project.id, 'story', story.id)} className={e.storyLink}>
            {story.title}
          </Link>
          <span className={e.small} style={{ display: 'block', marginTop: 2 }}>
            {kind === 'review' ? `${sub.submittedBy?.name} sent it to you ${timeAgo(sub.at)}` : story.sentBy ? `by ${story.sentBy.name}` : 'Not sent for review yet'}
          </span>
        </div>
        <Pill tone={pill.tone}>{pill.text}</Pill>
      </div>
      {kind === 'work' && <p className={e.readyText}>{stage.key === 'story' ? 'Finish the story, then send it for review.' : `${meta.text} Then send it for review.`}</p>}
      {kind === 'fix' &&
        (answered?.comment ? (
          <span className={e.quote}>
            {answered.comment}
            <span className={e.quoteBy}>
              {answered.reviewedBy?.name}, {timeAgo(answered.reviewedAt)}
            </span>
          </span>
        ) : (
          <p className={e.readyText}>{what} needs changes. Make them, then send it again.</p>
        ))}
      {kind === 'review' && (sub.note ? <span className={cx(e.quote, e.quoteNote)}>{sub.note}</span> : <p className={e.readyText}>Read it, then approve it or ask for changes.</p>)}
      <div className={e.readyActions}>
        {kind === 'review' ? (
          <>
            <Button variant="secondary" icon={IconEye} onClick={go}>
              View
            </Button>
            <Button icon={IconCheckCircle} onClick={() => onAnswer({ submission: sub, mode: 'approve' })}>
              Approve
            </Button>
            <Button variant="danger" icon={IconClose} onClick={() => onAnswer({ submission: sub, mode: 'changes' })}>
              Ask for changes
            </Button>
          </>
        ) : (
          <>
            <Button icon={meta.icon} onClick={go}>
              Open {stage.label}
            </Button>
            <Button variant="secondary" icon={IconSend} onClick={() => onSubmit({ stage, story })}>
              {kind === 'fix' ? 'Submit again' : 'Submit for review'}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
