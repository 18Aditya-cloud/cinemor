/**
 * The employee dashboard's calls to the backend (/api/employee/..., backend file app/api/routes/employee_routes.py).
 * Everything comes back camelCase. The project's AI work (story, storyboard, characters...) is not here: the
 * creator's module pages do it, pointed at /api/employee/projects/{id}/work (see EmployeeApp.jsx).
 */
import { request } from '../../services/api.js';

const person = (p) => (p ? { userId: p.user_id, email: p.email, name: p.name || (p.email || '').split('@')[0] } : null);

const role = (r) => ({ jobRoleId: r.job_role_id, name: r.name, stages: r.stages || [] });

const stage = (s) => ({
  key: s.key,
  label: s.label,
  requires: s.requires || [],
  status: s.status, // locked | open | in_review | changes_requested | approved
  canWork: Boolean(s.can_work), // their role includes it AND the project is Ongoing
  roleAllows: Boolean(s.role_allows ?? s.can_work), // their role includes it (even before the project starts)
  canReview: Boolean(s.can_review),
  approvedAt: s.approved_at || null,
  approvedBy: person(s.approved_by),
  lockedReason: s.locked_reason || '',
  workers: (s.workers || []).map((w) => ({ ...person(w), roles: w.roles || [] })),
  reviewers: (s.reviewers || []).map((w) => ({ ...person(w), roles: w.roles || [] })),
});

export const toSubmission = (x) => ({
  id: x.id,
  projectId: x.project_id,
  projectTitle: x.project_title || '',
  stage: x.stage,
  stageLabel: x.stage_label,
  storyId: x.story_id || null,
  status: x.status, // pending | approved | changes_requested | withdrawn | cancelled
  note: x.note || '',
  comment: x.review_comment || '',
  submittedBy: person(x.submitted_by),
  reviewer: person(x.reviewer),
  reviewedBy: person(x.reviewed_by),
  at: x.created_at,
  reviewedAt: x.reviewed_at || null,
  canAct: Boolean(x.can_act),
  canWithdraw: Boolean(x.can_withdraw),
});

const project = (p) => ({
  id: p.id,
  title: p.title,
  description: p.description || '',
  status: p.status,
  clientName: p.client_name || '',
  teamLeader: person(p.team_leader),
  isTeamLeader: Boolean(p.is_team_leader),
  workRoles: (p.my_work_roles || []).map(role),
  reviewRoles: (p.my_review_roles || []).map(role),
  stages: (p.stages || []).map(stage),
  approvedCount: p.approved_count || 0,
  workOpen: p.work_open !== false, // false until the Team Leader starts the project (and after it ends)
  workClosedReason: p.work_closed_reason || '',
  totalStages: p.total_stages || 6,
  storyId: p.story_id || null,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
  submissions: (p.submissions || []).map(toSubmission),
});

const E = '/api/employee';

export async function getMe() {
  const m = await request(`${E}/me`);
  return {
    userId: m.user_id,
    email: m.email,
    organizationName: m.organization_name || '',
    isTeamLeader: Boolean(m.is_team_leader),
    isReviewer: Boolean(m.is_reviewer),
    jobRoles: (m.job_roles || []).map((r) => ({ jobRoleId: r.job_role_id, name: r.name })),
    tools: (m.tools || []).map((t) => ({ id: t.id, name: t.name, description: t.description || '', url: t.website_url || '', jobRoleIds: t.job_role_ids || [] })),
  };
}

export const listMyProjects = async () => (await request(`${E}/projects`)).map(project);
export const getMyProject = async (id) => project(await request(`${E}/projects/${Number(id)}`));
export const listStageReviewers = async (projectId, stageKey) => (await request(`${E}/projects/${Number(projectId)}/stages/${stageKey}/reviewers`)).map((r) => ({ ...person(r), roles: r.roles || [] }));

export const submitStage = async (projectId, stageKey, { reviewerUserId, note, storyId }) =>
  toSubmission(
    await request(`${E}/projects/${Number(projectId)}/stages/${stageKey}/submit`, {
      method: 'POST',
      body: { reviewer_user_id: Number(reviewerUserId), note: note?.trim() || null, story_id: storyId ? Number(storyId) : null },
    }),
  );

export const reopenStage = async (projectId, stageKey, reason) => project(await request(`${E}/projects/${Number(projectId)}/stages/${stageKey}/reopen`, { method: 'POST', body: { reason: reason?.trim() || null } }));

export const listReviews = async () => (await request(`${E}/reviews`)).map(toSubmission);
export const listMySubmissions = async () => (await request(`${E}/submissions`)).map(toSubmission);
export const approveSubmission = async (id, comment) => toSubmission(await request(`${E}/submissions/${Number(id)}/approve`, { method: 'POST', body: { comment: comment?.trim() || null } }));
export const requestChanges = async (id, comment) => toSubmission(await request(`${E}/submissions/${Number(id)}/request-changes`, { method: 'POST', body: { comment } }));
export const withdrawSubmission = async (id) => toSubmission(await request(`${E}/submissions/${Number(id)}/withdraw`, { method: 'POST' }));

export async function getNotifications() {
  const n = await request(`${E}/notifications`);
  return {
    unread: n.unread || 0,
    items: (n.items || []).map((i) => ({ id: i.id, projectId: i.project_id, projectTitle: i.project_title || '', stage: i.stage, kind: i.kind, message: i.message, read: i.read, at: i.created_at })),
  };
}
export const markNotificationsRead = (ids = []) => request(`${E}/notifications/read`, { method: 'POST', body: { ids } });

/** The address the creator's module pages use for this project's AI work (see individualBackend.setProjectApiBase). */
export const workBase = (projectId) => `${E}/projects/${Number(projectId)}/work`;
