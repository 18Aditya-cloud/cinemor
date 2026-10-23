import { useState } from 'react';
import { Link } from '../../router/router.jsx';
import useResource from '../hooks/useResource.js';
import Button from '../ui/Button.jsx';
import { IconChevronLeft, IconSend } from '../ui/DashIcons.jsx';
import Pill from '../ui/Pill.jsx';
import { useToast } from '../ui/Toast.jsx';
import { getMyProject, withdrawSubmission } from './employeeApi.js';
import { SubmitModal } from './ReviewModals.jsx';
import { projectPath, STATE } from './stages.js';
import e from './Employee.module.css';

/**
 * The bar above a module page in the employee dashboard: where this story's stage stands, what the person can do
 * with it, and Submit for review. Every story has its own stages. The module page under it is the creator's own page;
 * the backend refuses changes the person may not make (another role's stage, a locked, in-review or approved stage)
 * with a clear message.
 */
export default function StageBar({ projectId, stageKey, storyId = null }) {
  const toast = useToast();
  const { data: project, reload } = useResource(() => getMyProject(projectId), [projectId]);
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!project) return null;
  const story = storyId ? project.stories.find((x) => x.id === Number(storyId)) : null;
  const stage = story?.stages.find((x) => x.key === stageKey) || null;
  const label = project.stages.find((x) => x.key === stageKey)?.label || '';
  const mine = stage && project.submissions.find((x) => x.stage === stageKey && x.storyId === story.id && x.status === 'pending' && x.canWithdraw);
  const lastAsk = stage && project.submissions.find((x) => x.stage === stageKey && x.storyId === story.id && x.status === 'changes_requested');

  let text;
  if (!project.workOpen) text = project.workClosedReason;
  else if (!stage) text = stageKey === 'story' ? 'Write a new story, or open one of the project’s stories.' : 'Choose a story: every story has its own stages.';
  else if (stage.status === 'locked') text = stage.lockedReason;
  else if (stage.status === 'approved') text = `Approved${stage.approvedBy ? ` by ${stage.approvedBy.name}` : ''}. It is locked; the Team Leader can reopen it.`;
  else if (stage.status === 'in_review') text = mine ? `Waiting for ${mine.reviewer?.name || 'the reviewer'} to review it.` : 'Waiting for review.';
  else if (stage.status === 'changes_requested') text = lastAsk?.comment ? `${lastAsk.reviewedBy?.name || 'The reviewer'} asked: “${lastAsk.comment}”` : 'The reviewer asked for changes.';
  else text = stage.canWork ? 'Open for your work. Submit it for review when it is ready.' : 'Open. You can look at it; your role does not include changing it.';

  const takeBack = async () => {
    setBusy(true);
    try {
      await withdrawSubmission(mine.id);
      toast('Taken back from review');
      await reload();
    } catch (err) {
      toast(err.message);
    }
    setBusy(false);
  };

  return (
    <div className={e.stageBar} role="region" aria-label={`${label} stage`}>
      <div className={e.stageBarText}>
        <Link to={projectPath(project.id)} className={e.back} style={{ margin: 0 }}>
          <IconChevronLeft width={16} height={16} /> Workflow
        </Link>
        <b>
          {label}
          {story ? ` of “${story.title}”` : ''}
        </b>
        {stage && <Pill tone={STATE[stage.status].tone}>{STATE[stage.status].label}</Pill>}
        <span>{text}</span>
      </div>
      <div className={e.headTools}>
        {mine && (
          <Button variant="secondary" onClick={takeBack} loading={busy}>
            Take back
          </Button>
        )}
        {stage?.canWork && (
          <Button icon={IconSend} onClick={() => setSubmitting(true)}>
            Submit for review
          </Button>
        )}
      </div>
      <SubmitModal open={submitting} project={project} stage={stage} story={story} onClose={() => setSubmitting(false)} onDone={reload} />
    </div>
  );
}
