import { useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import timeAgo from '../timeAgo.js';
import Button from '../ui/Button.jsx';
import { IconCheckCircle, IconChevronLeft, IconClose, IconEye, IconInfo, IconLock, IconRefresh, IconSend } from '../ui/DashIcons.jsx';
import Notice from '../ui/Notice.jsx';
import Pill from '../ui/Pill.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import { useToast } from '../ui/Toast.jsx';
import pages from '../pages/pages.module.css';
import { getMyProject, withdrawSubmission } from './employeeApi.js';
import { NotificationBell, RolePills, STAGE_ORDER } from './EmployeeParts.jsx';
import { AnswerModal, ReopenModal, SubmitModal } from './ReviewModals.jsx';
import { modulePath, stageMeta, STATE, SUBMISSION } from './stages.js';
import e from './Employee.module.css';

const names = (list) => (list.length ? list.map((p) => p.name).join(', ') : 'Nobody yet');

/**
 * One project's workflow: the six stages in order, each with its state, who works on it and who reviews it, and
 * what this person can do (open it, submit it for review, answer a review, and, as Team Leader, reopen it).
 */
export default function EmployeeProjectPage({ projectId }) {
  const toast = useToast();
  const { navigate } = useRouter();
  const { data: project, loading, error, reload } = useResource(() => getMyProject(projectId), [projectId]);
  const [submit, setSubmit] = useState(null); // stage
  const [answer, setAnswer] = useState(null); // { submission, mode }
  const [reopen, setReopen] = useState(null); // stage
  const [taking, setTaking] = useState(null);
  useDocumentTitle(project?.title || 'Project');

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

  const pending = (key) => project.submissions.find((x) => x.stage === key && x.status === 'pending');
  const lastAnswer = (key) => project.submissions.find((x) => x.stage === key && ['approved', 'changes_requested'].includes(x.status));

  const takeBack = async (sub) => {
    setTaking(sub.id);
    try {
      await withdrawSubmission(sub.id);
      toast('Taken back from review');
      await reload();
    } catch (err) {
      toast(err.message);
    }
    setTaking(null);
  };

  return (
    <div className={pages.page}>
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
              <b>
                {project.approvedCount} of {project.totalStages}
              </b>{' '}
              stages approved
            </span>
          </div>
          <div style={{ marginTop: 12 }}>
            <RolePills project={project} max={6} />
          </div>
        </div>
        <div className={e.headTools}>
          <NotificationBell />
          <RefreshButton onClick={reload} loading={loading} />
        </div>
      </div>
      {error && <Notice message={error.message} onRetry={reload} />}
      {project.description && <p className={e.lead} style={{ marginTop: -6, marginBottom: 20 }}>{project.description}</p>}

      <ol className={e.flow} aria-label="Stages, in order">
        {project.stages.map((s) => {
          const meta = stageMeta(s.key);
          const state = STATE[s.status];
          const sub = pending(s.key);
          const answered = lastAnswer(s.key);
          const canSubmit = s.canWork && ['open', 'changes_requested'].includes(s.status);
          const canReopen = project.isTeamLeader && ['approved', 'in_review', 'changes_requested'].includes(s.status);
          const storyId = s.key === 'story' ? (s.status === 'approved' ? project.storyId : null) : project.storyId;
          return (
            <li key={s.key} className={cx(e.stage, (s.canWork || s.canReview) && e.stageMine, s.status === 'locked' && e.stageLocked)}>
              <div className={e.stageTop}>
                <span className={e.stageName}>
                  <span className={e.tile} aria-hidden="true">
                    <meta.icon width={18} height={18} />
                  </span>
                  <span>
                    <span className={e.stageStep}>Step {STAGE_ORDER[s.key]}</span>
                    <h2 className={e.stageLabel}>{s.label}</h2>
                  </span>
                </span>
                <Pill tone={state.tone}>{state.label}</Pill>
              </div>
              <p className={e.stageText}>{meta.text}</p>
              <div className={e.people}>
                <span>
                  Works on it: <b>{names(s.workers)}</b>
                </span>
                <span>
                  Reviews it: <b>{names(s.reviewers)}</b>
                </span>
              </div>

              {s.status === 'locked' && (
                <p className={e.stageNote}>
                  <IconLock width={15} height={15} /> {s.lockedReason}
                </p>
              )}
              {s.status === 'in_review' && sub && (
                <p className={e.stageNote}>
                  <IconInfo width={15} height={15} /> {sub.submittedBy?.name} sent it to {sub.reviewer?.name} {timeAgo(sub.at)}.
                  {sub.note ? ` “${sub.note}”` : ''}
                </p>
              )}
              {s.status === 'changes_requested' && answered && (
                <p className={cx(e.quote)}>
                  {answered.comment}
                  <span className={e.quoteBy}>
                    {answered.reviewedBy?.name}, {timeAgo(answered.reviewedAt)}
                  </span>
                </p>
              )}
              {s.status === 'approved' && (
                <p className={e.stageNote}>
                  <IconCheckCircle width={15} height={15} /> Approved{s.approvedBy ? ` by ${s.approvedBy.name}` : ''}
                  {s.approvedAt ? `, ${timeAgo(s.approvedAt)}` : ''}.
                </p>
              )}

              <div className={e.stageActions}>
                {s.status !== 'locked' && (
                  <Button variant={canSubmit ? 'primary' : 'secondary'} icon={canSubmit ? meta.icon : IconEye} onClick={() => navigate(modulePath(project.id, s.key, storyId))}>
                    {canSubmit ? `Open ${s.label}` : 'View'}
                  </Button>
                )}
                {canSubmit && (
                  <Button variant="secondary" icon={IconSend} onClick={() => setSubmit(s)}>
                    Submit for review
                  </Button>
                )}
                {sub?.canWithdraw && (
                  <Button variant="secondary" onClick={() => takeBack(sub)} loading={taking === sub.id}>
                    Take back
                  </Button>
                )}
                {sub?.canAct && (
                  <>
                    <Button icon={IconCheckCircle} onClick={() => setAnswer({ submission: sub, mode: 'approve' })}>
                      Approve
                    </Button>
                    <Button variant="danger" icon={IconClose} onClick={() => setAnswer({ submission: sub, mode: 'changes' })}>
                      Ask for changes
                    </Button>
                  </>
                )}
                {canReopen && (
                  <Button variant="secondary" icon={IconRefresh} onClick={() => setReopen(s)}>
                    Reopen
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <section className={cx(e.card, e.section)} aria-labelledby="emp-history">
        <div className={e.cardHead}>
          <h2 id="emp-history" className={e.cardTitle}>
            Reviews on this project
          </h2>
          <span className={e.cardSub}>Newest first</span>
        </div>
        {project.submissions.length === 0 ? (
          <p className={e.empty}>Nothing has been sent for review yet.</p>
        ) : (
          <ul className={e.history}>
            {project.submissions.map((x) => {
              const st = SUBMISSION[x.status];
              return (
                <li key={x.id} className={e.historyItem}>
                  <Pill tone={st.tone}>{st.label}</Pill>
                  <div className={e.historyText}>
                    <span>
                      <b>{x.submittedBy?.name}</b> sent the <b>{x.stageLabel}</b> to <b>{x.reviewer?.name}</b>
                      {x.reviewedBy && x.status !== 'withdrawn' && x.status !== 'cancelled' ? (
                        <>
                          ; {x.status === 'approved' ? 'approved' : 'changes asked'} by <b>{x.reviewedBy.name}</b>
                        </>
                      ) : null}
                      .
                    </span>
                    {x.note && <span className={cx(e.quote, e.quoteNote)}>{x.note}</span>}
                    {x.comment && <span className={cx(e.quote, x.status === 'approved' && e.quoteOk)}>{x.comment}</span>}
                  </div>
                  <span className={e.small}>{timeAgo(x.reviewedAt || x.at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <SubmitModal open={Boolean(submit)} project={project} stage={submit} onClose={() => setSubmit(null)} onDone={reload} />
      <AnswerModal open={Boolean(answer)} submission={answer?.submission} mode={answer?.mode} onClose={() => setAnswer(null)} onDone={reload} />
      <ReopenModal open={Boolean(reopen)} project={project} stage={reopen} onClose={() => setReopen(null)} onDone={reload} />
    </div>
  );
}
