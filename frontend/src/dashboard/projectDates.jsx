import cx from '../utils/cx.js';
import { IconAlert } from './ui/DashIcons.jsx';
import s from './projectDates.module.css';

/**
 * A project's start date and deadline (set by the organization admin), and the "Delayed by N days" alert.
 * Dates come from the backend as "YYYY-MM-DD" (no time): they are read as that calendar day, wherever the browser is.
 */

const parse = (day) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/** "2026-11-01" -> "1 Nov 2026" ("" when there is no date). */
export const dayLabel = (day) => parse(day)?.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) || '';

/** Today as "YYYY-MM-DD" (for the date fields). */
export const todayValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** How many days a project is past its deadline (0 when it is not, or when it is completed or aborted). */
export function daysLate(project) {
  if (!project || project.status === 'delivered' || ['completed', 'aborted'].includes(project.lifecycle)) return 0;
  const end = parse(project.deadline);
  if (!end) return 0;
  const today = parse(todayValue());
  return Math.max(0, Math.round((today - end) / 86400000));
}

/** The red "Delayed by N days" alert, or nothing. */
export function DelayAlert({ project, compact = false }) {
  const late = daysLate(project);
  if (!late) return null;
  return (
    <span className={cx(s.alert, compact && s.compact)} role="status">
      <IconAlert width={compact ? 13 : 15} height={compact ? 13 : 15} aria-hidden="true" />
      Delayed by {late} {late === 1 ? 'day' : 'days'}
    </span>
  );
}

/** Start and deadline side by side, with the delay alert under them. */
export function ProjectDates({ project, className }) {
  if (!project?.startDate && !project?.deadline) return null;
  return (
    <div className={cx(s.dates, className)}>
      <span className={s.item}>
        <span className={s.label}>Start</span>
        <span className={s.value}>{dayLabel(project.startDate) || '-'}</span>
      </span>
      <span className={s.item}>
        <span className={s.label}>Deadline</span>
        <span className={cx(s.value, daysLate(project) > 0 && s.late)}>{dayLabel(project.deadline) || '-'}</span>
      </span>
      <DelayAlert project={project} />
    </div>
  );
}

/** For a table cell: the deadline, and the alert under it. */
export function DeadlineCell({ project }) {
  if (!project?.deadline) return <span className={s.none}>-</span>;
  return (
    <span className={s.cell}>
      <span className={cx(daysLate(project) > 0 && s.late)}>{dayLabel(project.deadline)}</span>
      <DelayAlert project={project} compact />
    </span>
  );
}
