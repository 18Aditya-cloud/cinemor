import { useEffect, useState } from 'react';
import TextField from '../../components/auth/TextField.jsx';
import cx from '../../utils/cx.js';
import Button from '../ui/Button.jsx';
import { IconCheckCircle, IconClose, IconRefresh, IconSend } from '../ui/DashIcons.jsx';
import Modal, { ModalFooter } from '../ui/Modal.jsx';
import { useToast } from '../ui/Toast.jsx';
import { approveSubmission, itemLabel, listStageReviewers, reopenStage, requestChanges, submitStage } from './employeeApi.js';
import { STAGES } from './stages.js';
import e from './Employee.module.css';

/**
 * Submit one story's stage for review: pick one of the reviewers of THIS stage on the project (the backend only offers
 * those) and add a note. `story` is the story it is about ({ id, title }); every story has its own stages.
 */
export function SubmitModal({ open, project, stage, story, onClose, onDone }) {
  const toast = useToast();
  const [reviewers, setReviewers] = useState(null);
  const [reviewer, setReviewer] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !project || !stage) return;
    setReviewers(null);
    setReviewer('');
    setNote('');
    setError('');
    listStageReviewers(project.id, stage.key)
      .then((list) => {
        setReviewers(list);
        if (list.length === 1) setReviewer(String(list[0].userId));
      })
      .catch((err) => setError(err.message));
  }, [open, project, stage]);

  const send = async (event) => {
    event.preventDefault();
    if (!reviewer) return setError('Choose who should review it.');
    if (!story?.id) return setError('Write or import the story first.');
    setBusy(true);
    setError('');
    try {
      const sent = await submitStage(project.id, stage.key, { reviewerUserId: reviewer, note, storyId: story.id });
      toast(`Sent to ${sent.reviewer?.name || 'the reviewer'} for review`);
      onDone?.(sent);
      onClose();
    } catch (err) {
      setError(err.message);
    }
    return setBusy(false);
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      icon={IconSend}
      divider
      title={stage?.key === 'story' ? 'Submit the story for review' : `Submit the ${stage?.label || ''} for review`}
      subtitle={story ? `“${story.title}”. Only reviewers of this stage on the project are listed.` : 'Only reviewers of this stage on the project are listed.'}
    >
      <form onSubmit={send}>
        <p className={e.fieldLabel} id="submit-reviewer-label">
          Reviewer
        </p>
        {!reviewers && !error && <p className={e.small} style={{ marginBottom: 16 }}>Loading the reviewers…</p>}
        {reviewers && reviewers.length === 0 && (
          <p className={e.warn}>This project has no reviewer for the {stage?.label} yet. Ask your Team Leader to add one.</p>
        )}
        {reviewers && reviewers.length > 0 && (
          <div className={e.choices} role="radiogroup" aria-labelledby="submit-reviewer-label">
            {reviewers.map((r) => {
              const on = reviewer === String(r.userId);
              return (
                <label key={r.userId} className={cx(e.choice, on && e.choiceOn)}>
                  <input type="radio" name="reviewer" value={r.userId} checked={on} onChange={() => setReviewer(String(r.userId))} disabled={busy} />
                  <span className={e.choiceText}>
                    {r.name}
                    <span className={e.small}>{r.roles.join(', ')} reviewer</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <TextField id="submit-note" label="Note for the reviewer" optionalMark multiline rows={3} placeholder="What changed, what to look at…" value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={2000} disabled={busy} />
        {error && (
          <p className={e.formError} role="alert">
            {error}
          </p>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" icon={IconSend} loading={busy} disabled={!reviewers?.length}>
            Submit for review
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/** Approve (a comment is optional) or ask for changes (a comment is needed). */
export function AnswerModal({ open, submission, mode, onClose, onDone }) {
  const toast = useToast();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setComment('');
      setError('');
    }
  }, [open, mode]);
  const approving = mode === 'approve';

  const answer = async (event) => {
    event.preventDefault();
    if (!approving && !comment.trim()) return setError('Say what should change.');
    setBusy(true);
    setError('');
    try {
      const done = approving ? await approveSubmission(submission.id, comment) : await requestChanges(submission.id, comment.trim());
      toast(approving ? `${itemLabel(submission)} approved` : 'Changes asked');
      onDone?.(done);
      onClose();
    } catch (err) {
      setError(err.message);
    }
    return setBusy(false);
  };

  if (!submission) return null;
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      icon={approving ? IconCheckCircle : IconClose}
      divider
      title={approving ? `Approve the ${itemLabel(submission)}` : `Ask for changes to the ${itemLabel(submission)}`}
      subtitle={`${submission.projectTitle}, sent by ${submission.submittedBy?.name || 'someone'}`}
    >
      <form onSubmit={answer}>
        {approving && <p className={e.small} style={{ marginBottom: 14 }}>Once approved, it is locked, and the next stages of this story open for their teams.</p>}
        <TextField
          id="answer-comment"
          label={approving ? 'Comment' : 'What should change'}
          optionalMark={approving}
          requiredMark={!approving}
          multiline
          rows={4}
          placeholder={approving ? 'Anything to say about it…' : 'Be specific: what to change, and where.'}
          value={comment}
          onChange={(ev) => setComment(ev.target.value)}
          maxLength={4000}
          disabled={busy}
        />
        {error && (
          <p className={e.formError} role="alert">
            {error}
          </p>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant={approving ? 'primary' : 'danger'} icon={approving ? IconCheckCircle : IconClose} loading={busy}>
            {approving ? 'Approve' : 'Ask for changes'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/** Team Leader: reopen a stage of one story. Every stage of that story after it is locked again until it is approved again. */
export function ReopenModal({ open, project, stage, story, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setReason('');
      setError('');
    }
  }, [open]);
  if (!project || !stage || !story) return null;

  // the stages after this one that are open or further along now (they go back to locked)
  const after = [];
  const add = (key) => {
    STAGES.forEach((s) => {
      const st = project.stages.find((x) => x.key === s.key);
      if (st?.requires.includes(key) && !after.includes(s.key)) {
        after.push(s.key);
        add(s.key);
      }
    });
  };
  add(stage.key);
  const affected = after.map((k) => story.stages.find((x) => x.key === k)).filter((s) => s && s.status !== 'locked');

  const reopen = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = await reopenStage(project.id, stage.key, reason, story.id);
      toast(`${stage.label} reopened`);
      onDone?.(updated);
      onClose();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} icon={IconRefresh} divider title={`Reopen the ${stage.label}`} subtitle={`Of “${story.title}”. Its team can change it again, and it goes back for review.`}>
      <form onSubmit={reopen}>
        {affected.length > 0 && (
          <p className={e.warn}>
            {affected.map((s) => s.label).join(', ')} will be locked again until the {stage.label} is approved again. Their work is kept.
          </p>
        )}
        <TextField id="reopen-reason" label="Why" optionalMark multiline rows={3} placeholder="What needs to change…" value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={1000} disabled={busy} />
        {error && (
          <p className={e.formError} role="alert">
            {error}
          </p>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" icon={IconRefresh} loading={busy}>
            Reopen
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
