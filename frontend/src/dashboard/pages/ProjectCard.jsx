import cx from '../../utils/cx.js';
import { PROJECT_STAGES, stageIndex } from '../projectStages.js';
import Button from '../ui/Button.jsx';
import { IconBuilding, IconPencil, IconTrash } from '../ui/DashIcons.jsx';
import Pill from '../ui/Pill.jsx';
import { ProjectDates } from '../projectDates.jsx';
import styles from './ProjectCard.module.css';

const initialsOf = (email) => (email || '?').split('@')[0].slice(0, 2).toUpperCase();
const dateOf = (createdAt) => (createdAt ? new Date(createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// The status pill. `lifecycle` comes from the backend (not_started / ongoing / completed / aborted); demo projects
// only have `status` (ongoing / delivered).
const PILL = {
  delivered: ['green', 'Delivered'],
  aborted: ['red', 'Aborted'],
  not_started: ['gray', 'Not started'],
  ongoing: ['amber', 'Ongoing'],
};
const pillFor = (project) => PILL[project.status === 'delivered' ? 'delivered' : project.lifecycle] || PILL.ongoing;

/**
 * One project as a card: status, title, description, client, how far along it is (which of the six stages), and its
 * Team Leader. `onAdvance` (demo mode only) moves it along so the progress bar can be seen moving.
 * A project with no `stage` (the backend doesn't track production stages yet) shows its status instead of the bar.
 */
export default function ProjectCard({ project, onAdvance, advancing, onEdit, onDelete }) {
  const delivered = project.status === 'delivered';
  const [tone, statusLabel] = pillFor(project);
  const hasStage = project.stage != null;
  const at = stageIndex(project.stage);
  const last = PROJECT_STAGES.length - 1;
  const stageText = delivered ? 'Delivered' : `Stage ${at + 1} of ${PROJECT_STAGES.length}: ${PROJECT_STAGES[at].label}`;
  const titleId = `cm-project-${project.id}`;
  const created = dateOf(project.createdAt);

  return (
    <article className={cx(styles.card, delivered && styles.delivered)} aria-labelledby={titleId}>
      <header className={styles.head}>
        <Pill tone={tone}>{statusLabel}</Pill>
        <span className={styles.id}>#{project.id}</span>
      </header>

      <h2 id={titleId} className={styles.title}>
        {project.title}
      </h2>
      <p className={styles.desc}>{project.description || 'No description.'}</p>

      <p className={styles.client}>
        <IconBuilding width={16} height={16} aria-hidden="true" />
        {project.clientName || 'No client'}
      </p>
      <ProjectDates project={project} />



      {hasStage && (
        <div className={styles.progress}>
          <div className={styles.bar} role="progressbar" aria-label={`Progress of ${project.title}`} aria-valuemin={1} aria-valuemax={PROJECT_STAGES.length} aria-valuenow={delivered ? PROJECT_STAGES.length : at + 1} aria-valuetext={stageText}>
            {PROJECT_STAGES.map((stage, index) => (
              <span key={stage.id} className={cx(styles.segment, (delivered || index < at) && styles.segmentDone, !delivered && index === at && styles.segmentNow)} />
            ))}
          </div>
          <p className={styles.stageText}>
            {delivered ? (
              'Delivered'
            ) : (
              <>
                <strong>{PROJECT_STAGES[at].label}</strong>
                <span>
                  {at + 1} of {PROJECT_STAGES.length}
                </span>
              </>
            )}
          </p>
        </div>
      )}

      <footer className={styles.foot}>
        <span className={styles.avatar} aria-hidden="true">
          {initialsOf(project.teamLeaderEmail)}
        </span>
        <span className={styles.leader}>
          <span className={styles.leaderLabel}>Team Leader</span>
          <span className={styles.leaderEmail}>{project.teamLeaderEmail || '-'}</span>
        </span>
        {created && <time className={styles.date}>{created}</time>}
      </footer>

      {(onEdit || onDelete) && (
        <div className={styles.cardActions}>
          {onEdit && (
            <Button variant="secondary" icon={IconPencil} iconOnly onClick={onEdit} aria-label={`Edit ${project.title}`}>
              Edit
            </Button>
          )}
          {onDelete && (
            <Button variant="secondary" icon={IconTrash} iconOnly onClick={onDelete} aria-label={`Delete ${project.title}`}>
              Delete
            </Button>
          )}
        </div>
      )}
      {onAdvance && !delivered && (
        <Button variant="secondary" className={styles.demoButton} loading={advancing} onClick={onAdvance}>
          {at === last ? 'Mark delivered (demo)' : 'Next stage (demo)'}
        </Button>
      )}
    </article>
  );
}
