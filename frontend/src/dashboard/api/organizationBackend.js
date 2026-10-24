/**
 * The organization and Team Leader dashboards against the real backend (used by organizationApi.js whenever
 * VITE_API_URL is set). Every function returns exactly the shape its demo twin in organizationApi.js returns, so the
 * pages never need to know which one answered.
 *
 * The backend's routes (FastAPI, backend/services/story-service/app/api/routes):
 *   Organization admin, {org} = the signed-in admin's organization_id (from GET /api/auth/me):
 *     GET/PATCH /api/organizations/{org}/profile                       name, business_type, official_address
 *     GET/POST  /api/organizations/{org}/projects,  GET/PATCH/DELETE .../projects/{id}
 *     GET/POST  /api/organizations/{org}/clients,   GET/PATCH/DELETE .../clients/{id}
 *     GET/POST  /api/organizations/{org}/tools,     PUT/DELETE .../tools/{id}
 *     GET       /api/organizations/{org}/employees                     accepted employees AND pending invitations
 *     PATCH     /api/organizations/{org}/employees/{user_id}/capacity          { max_concurrent_projects }
 *     PATCH     /api/organizations/{org}/employees/{user_id}/responsibilities  { is_team_leader, is_reviewer, reviewer_job_role_ids }
 *     POST/DELETE /api/organizations/{org}/employees/{user_id}/job-roles[/{job_role_id}]
 *     GET/POST  /api/auth/organizations/{org}/job-roles,  PUT .../job-roles/{id}   { name, description, tool_ids, feature_keys }
 *     POST      /api/auth/organizations/{org}/employees/invite         { email, job_role_id, max_concurrent_projects }
 *   Team Leader, {tl} = the signed-in user's own id:
 *     GET  /api/team-leaders/{tl}/dashboard | /projects | /projects/{id} | /available-employees | /available-reviewers
 *     POST /api/team-leaders/{tl}/projects/{id}/employees/{user_id}  { job_role_id }
 *     POST /api/team-leaders/{tl}/projects/{id}/reviewers/{user_id}  { job_role_id }
 *     DELETE /api/team-leaders/{tl}/projects/{id}/members/{member_id},  PATCH .../projects/{id}/status { status }
 *
 * Differences this file smooths over:
 *   - ids: an employee is known by their USER id everywhere (the backend's routes all use user_id).
 *   - project status: the backend says pending / started / completed / aborted; the pages say
 *     not_started / ongoing / completed / aborted (lifecycle) and ongoing / delivered / aborted (status).
 *   - features: the backend's keys are snake_case (story_creation), the pages' are camelCase (storyCreation).
 *   - employees and invitations come back with job role NAMES only; they are matched to ids through the job-role list.
 *   - projects carry only client_id / team_leader_id, so the client names and Team Leader emails are looked up.
 * Not in the backend yet (so these answer with an error, and the pages hide the buttons): deleting a job role,
 * revoking an invitation, the activity feed, project stages, client names for a Team Leader.
 */
import { currentSession, request, startSession } from '../../services/api.js';

const unavailable = (what) => Object.assign(new Error(`${what} is not available in the backend yet.`), { status: 501 });

const orgId = () => {
  const id = currentSession()?.organizationId;
  if (!id) throw Object.assign(new Error('Your organization could not be found. Please log in again.'), { status: 401 });
  return id;
};
const org = (path = '') => `/api/organizations/${orgId()}${path}`;
const authOrg = (path = '') => `/api/auth/organizations/${orgId()}${path}`;
const leader = (id, path = '') => `/api/team-leaders/${id}${path}`;
const time = (value) => (value ? Date.parse(value) || null : null);

/* ------------------------------------------------------------------ translations */
const LIFECYCLE = { pending: 'not_started', started: 'ongoing', completed: 'completed', aborted: 'aborted' };
const BACKEND_STATUS = { not_started: 'pending', ongoing: 'started', completed: 'completed', aborted: 'aborted' };
export const lifecycleFrom = (status) => LIFECYCLE[status] || 'not_started';
export const statusFrom = (lifecycle) => (lifecycle === 'completed' ? 'delivered' : lifecycle === 'aborted' ? 'aborted' : 'ongoing');
const toCamel = (key) => String(key).replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
const toSnake = (key) => String(key).replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/* --------------------------------------------------------------------- workspace */
export async function getWorkspace() {
  const me = currentSession();
  if (me?.accountType !== 'organization') {
    // Team Leaders and employees may not read the organization's profile; /api/auth/me already has its name.
    return { organization: { name: me?.organizationName || '', businessType: '', address: '' }, profile: { name: '' } };
  }
  const p = await request(org('/profile'));
  return { organization: { name: p?.name || '', businessType: p?.business_type || '', address: p?.official_address || '' }, profile: { name: '' } };
}

export async function updateOrganizationSettings({ name, businessType, address }) {
  const p = await request(org('/profile'), { method: 'PATCH', body: { name: name.trim(), business_type: businessType.trim(), official_address: address.trim() } });
  return { organization: { name: p.name || '', businessType: p.business_type || '', address: p.official_address || '' } };
}

/* ----------------------------------------------------------------------- job roles */
const jobRoleView = (r) => ({
  id: r.id,
  name: r.name,
  description: r.description || '',
  features: (r.feature_keys || []).map(toCamel),
  tools: (r.tool_ids || []).map(Number),
});

export async function listJobRoles() {
  const roles = await request(authOrg('/job-roles'));
  return (roles || []).map(jobRoleView);
}

const jobRoleBody = ({ name, description, features = [], tools = [] }) => ({
  name: name.trim(),
  description: description?.trim() ? description.trim() : null,
  tool_ids: tools.map(Number),
  feature_keys: features.map(toSnake),
});

export async function createJobRole(values) {
  const r = await request(authOrg('/job-roles'), { method: 'POST', body: jobRoleBody(values) });
  return { ...jobRoleView(r), features: [...(values.features || [])], tools: (values.tools || []).map(Number) };
}

export async function updateJobRole(id, values) {
  await request(authOrg(`/job-roles/${id}`), { method: 'PUT', body: jobRoleBody(values) });
  return { id, name: values.name.trim(), description: values.description || '', features: [...(values.features || [])], tools: (values.tools || []).map(Number) };
}

/** The backend saves a role's permissions together with its name, so the role is read first. */
export async function updateRolePermissions(id, { features, tools }) {
  const role = (await listJobRoles()).find((r) => r.id === Number(id));
  if (!role) throw Object.assign(new Error('That job role no longer exists.'), { status: 404 });
  await updateJobRole(id, { ...role, features, tools });
  return { features: [...features], tools: tools.map(Number) };
}

export async function deleteJobRole() {
  throw unavailable('Deleting a job role');
}

/* ---------------------------------------------------- employees and invitations */
// The org's job roles by name (employees and invitations only carry names).
const idsByName = (roles) => {
  const map = new Map();
  roles.forEach((r) => map.set(r.name.trim().toLowerCase(), r.id));
  return (names) => (names || []).map((n) => map.get(String(n).trim().toLowerCase())).filter((id) => id != null);
};

async function peopleAndRoles() {
  const [people, roles] = await Promise.all([request(org('/employees')), listJobRoles()]);
  return { people: people?.employees || [], roles };
}

const employeeView = (e, roles, toIds) => {
  const ids = toIds(e.job_roles);
  return {
    id: e.user_id,
    email: e.email,
    jobRoleIds: ids,
    jobRoleId: ids[0] ?? null,
    jobRoles: roles.filter((r) => ids.includes(r.id)).map((r) => ({ id: r.id, name: r.name })),
    jobRoleName: (e.job_roles || []).join(', '),
    maxProjects: e.max_concurrent_projects ?? null,
    currentProjects: e.current_project_count ?? 0,
    teamLeader: Boolean(e.is_team_leader),
    reviewer: Boolean(e.is_reviewer),
    reviewerJobRoleIds: (e.reviewer_job_role_ids || []).map(Number),
  };
};

export async function listEmployees() {
  const { people, roles } = await peopleAndRoles();
  const toIds = idsByName(roles);
  return people.filter((e) => e.status === 'accepted').map((e) => employeeView(e, roles, toIds));
}

export async function listInvitations() {
  const { people, roles } = await peopleAndRoles();
  const toIds = idsByName(roles);
  return people
    .filter((e) => e.status === 'pending')
    .map((e) => ({
      id: e.invitation_id,
      email: e.email,
      jobRoleId: toIds(e.job_roles)[0] ?? null,
      jobRoleName: (e.job_roles || []).join(', '),
      maxProjects: e.max_concurrent_projects ?? null,
      sentAt: time(e.created_at),
      expiresAt: time(e.expires_at),
      status: 'pending',
    }));
}

export async function sendInvitation({ email, jobRoleId, maxProjects }) {
  const data = await request(authOrg('/employees/invite'), {
    method: 'POST',
    body: { email: email.trim(), job_role_id: Number(jobRoleId), max_concurrent_projects: maxProjects ? Number(maxProjects) : null },
  });
  const inv = data?.invitation || {};
  const role = (await listJobRoles()).find((r) => r.id === Number(jobRoleId));
  return { id: inv.id, email: inv.email || email, jobRoleId: Number(jobRoleId), jobRoleName: role?.name || '', maxProjects: inv.max_concurrent_projects ?? null, sentAt: time(inv.created_at), status: 'pending' };
}

export async function revokeInvitation() {
  throw unavailable('Revoking an invitation');
}

/**
 * The link in the invitation email: POST /api/auth/invitations/accept { token, password, confirm_password }.
 * The backend creates the account and signs the employee in (access token + refresh cookie).
 */
export async function acceptInvitation({ token, password, confirmPassword }) {
  const data = await request('/api/auth/invitations/accept', { method: 'POST', auth: false, body: { token, password, confirm_password: confirmPassword } });
  return startSession(data.access_token);
}

async function findEmployee(id) {
  const employee = (await listEmployees()).find((e) => e.id === Number(id));
  if (!employee) throw Object.assign(new Error('That employee no longer exists.'), { status: 404 });
  return employee;
}

/** "Remove as Team Leader" / "Remove as Reviewer" (and the reverse): PATCH .../responsibilities */
export async function setEmployeeRoles(id, changes) {
  const body = {};
  if ('teamLeader' in changes) body.is_team_leader = Boolean(changes.teamLeader);
  if ('reviewer' in changes) {
    body.is_reviewer = Boolean(changes.reviewer);
    body.reviewer_job_role_ids = changes.reviewer ? (changes.reviewerJobRoleIds || []).map(Number) : [];
  }
  await request(org(`/employees/${id}/responsibilities`), { method: 'PATCH', body });
  return findEmployee(id);
}

/**
 * Employees page, "Update": the backend saves these with separate calls, made in an order that keeps its rules
 * happy at every step (a Reviewer's roles must always be among their job roles):
 *   1. capacity, 2. add the new job roles, 3. Team Leader / Reviewer (+ which roles they review), 4. remove old job roles.
 * If one step fails, the ones before it have already been saved; the error says which part failed.
 */
export async function updateEmployee(id, { maxProjects, jobRoleIds, teamLeader, reviewer, reviewerJobRoleIds }) {
  const before = await findEmployee(id);
  const want = [...new Set((jobRoleIds || []).map(Number))];
  if (!want.length) throw Object.assign(new Error('Give the employee at least one job role.'), { status: 400 });
  const max = maxProjects === '' || maxProjects == null ? null : Number(maxProjects);
  const isReviewer = reviewer === undefined ? before.reviewer : Boolean(reviewer);
  const reviews = isReviewer ? [...new Set((reviewerJobRoleIds || []).map(Number))] : [];
  if (isReviewer && !reviews.length) throw Object.assign(new Error('Select at least one job role for which this employee will be a Reviewer.'), { status: 400 });
  if (reviews.some((r) => !want.includes(r))) throw Object.assign(new Error("Reviewer job roles must be selected from the employee's assigned job roles."), { status: 400 });
  if (max !== null && max < before.currentProjects) {
    throw Object.assign(new Error(`This employee is already on ${before.currentProjects} active projects. Set at least ${before.currentProjects}, or remove them from a project first.`), { status: 409 });
  }

  const step = async (label, work) => {
    try {
      await work();
    } catch (error) {
      error.message = `${label}: ${error.message}`;
      throw error;
    }
  };
  const base = `/employees/${id}`;
  if (max !== before.maxProjects) {
    await step('Saving the project limit', () => request(org(`${base}/capacity`), { method: 'PATCH', body: { max_concurrent_projects: max } }));
  }
  for (const roleId of want.filter((r) => !before.jobRoleIds.includes(r))) {
    await step('Adding a job role', () => request(org(`${base}/job-roles`), { method: 'POST', body: { job_role_id: roleId } }));
  }
  await step('Saving Team Leader / Reviewer', () =>
    request(org(`${base}/responsibilities`), {
      method: 'PATCH',
      body: { is_team_leader: teamLeader === undefined ? before.teamLeader : Boolean(teamLeader), is_reviewer: isReviewer, reviewer_job_role_ids: reviews },
    }),
  );
  for (const roleId of before.jobRoleIds.filter((r) => !want.includes(r))) {
    await step('Removing a job role', () => request(org(`${base}/job-roles/${roleId}`), { method: 'DELETE' }));
  }
  return findEmployee(id);
}

/** Delete an employee for good (the backend refuses while they lead a project or are on an unfinished one). */
export async function deleteEmployee(id) {
  await request(org(`/employees/${id}`), { method: 'DELETE' });
  return {};
}

/* ------------------------------------------------------------------------ clients */
const clientView = (c) => ({
  id: c.id,
  name: c.name,
  email: c.email || '',
  phone: c.phone || '',
  ongoingProjects: c.ongoing_projects ?? 0,
  deliveredProjects: c.successfully_delivered_projects ?? 0,
});
const clientBody = ({ name, email, phone }) => ({ name: name.trim(), email: email.trim(), phone: phone?.trim() ? phone.trim() : null });

export async function listClients() {
  return ((await request(org('/clients'))) || []).map(clientView);
}
export async function createClient(values) {
  return clientView(await request(org('/clients'), { method: 'POST', body: clientBody(values) }));
}
export async function updateClient(id, values) {
  return clientView(await request(org(`/clients/${id}`), { method: 'PATCH', body: clientBody(values) }));
}
export async function deleteClient(id) {
  await request(org(`/clients/${id}`), { method: 'DELETE' });
  return {};
}

/* ----------------------------------------------------------------------- projects */
const projectView = (p, clients = [], employees = []) => {
  const lifecycle = lifecycleFrom(p.status);
  return {
    id: p.id,
    title: p.title,
    description: p.description || '',
    clientId: p.client_id,
    teamLeaderId: p.team_leader_id,
    lifecycle,
    status: statusFrom(lifecycle),
    stage: null, // the backend has no production stages yet; the cards show the status instead
    clientName: clients.find((c) => c.id === p.client_id)?.name ?? '',
    teamLeaderEmail: employees.find((e) => e.id === p.team_leader_id)?.email ?? '',
    memberCount: (p.members || []).length,
    members: p.members || [],
    startDate: p.start_date || '', // "YYYY-MM-DD", set by the admin
    deadline: p.deadline || '',
    createdAt: time(p.created_at),
    updatedAt: time(p.updated_at),
  };
};

export async function listProjects() {
  const [projects, clients, employees] = await Promise.all([request(org('/projects')), listClients(), listEmployees()]);
  return (projects || []).map((p) => projectView(p, clients, employees));
}

const projectBody = ({ title, description, clientId, teamLeaderId, startDate, deadline }) => ({
  title: title.trim(),
  description: description?.trim() ? description.trim() : null,
  client_id: Number(clientId),
  team_leader_id: Number(teamLeaderId),
  ...(startDate ? { start_date: startDate } : {}),
  ...(deadline ? { deadline } : {}),
});

export async function createProject(values) {
  return projectView(await request(org('/projects'), { method: 'POST', body: projectBody(values) }));
}
export async function updateProject(id, values) {
  return projectView(await request(org(`/projects/${id}`), { method: 'PATCH', body: projectBody(values) }));
}
export async function deleteProject(id) {
  await request(org(`/projects/${id}`), { method: 'DELETE' });
  return {};
}

/* -------------------------------------------------------------------------- tools */
const toolView = (t) => ({ id: t.id, name: t.name, description: t.description || '', url: t.website_url || '' });

export async function listTools() {
  return ((await request(org('/tools'))) || []).map(toolView);
}
export async function createTool({ name, description, url }) {
  return toolView(await request(org('/tools'), { method: 'POST', body: { name: name.trim(), description: description.trim(), website_url: url?.trim() ? url.trim() : null } }));
}

/* ------------------------------------------------------------------- activity */
// GET /api/organizations/{id}/activity?limit=&before_id=&kind=  (newest first; admins only)
const activityView = (a) => ({
  id: a.id,
  type: a.kind,
  action: a.action,
  text: a.message,
  at: time(a.created_at),
  actor: a.actor?.email ? { userId: a.actor.user_id, email: a.actor.email, role: a.actor.role || '' } : null,
});

export async function listActivityPage({ limit = 20, beforeId, kind } = {}) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (beforeId) query.set('before_id', String(beforeId));
  if (kind) query.set('kind', kind);
  const page = await request(org(`/activity?${query}`));
  return { items: (page?.items || []).map(activityView), hasMore: Boolean(page?.has_more) };
}

export async function listActivity() {
  return (await listActivityPage({ limit: 12 })).items;
}

/* ------------------------------------------------------------- the Team Leader */
const summaryView = (p) => {
  const lifecycle = lifecycleFrom(p.status);
  return {
    id: p.id,
    title: p.title,
    description: p.description || '',
    lifecycle,
    stage: null,
    clientId: p.client_id,
    clientName: p.client_name || '', // sent with each Team Leader project (client_name)
    startDate: p.start_date || '',
    deadline: p.deadline || '',
    memberCount: (p.members || []).length,
    createdAt: time(p.created_at),
    updatedAt: time(p.updated_at),
  };
};

const personView = (e) => ({
  id: e.user_id,
  email: e.email,
  jobRoles: (e.job_roles || []).map((r) => ({ id: r.id, name: r.name })),
  reviewerJobRoles: (e.reviewer_job_roles || []).map((r) => ({ id: r.id, name: r.name })),
  activeProjects: e.current_project_count ?? 0,
  maxProjects: e.max_concurrent_projects ?? null,
  available: e.is_available !== false,
  onProject: Boolean(e.is_on_project), // already on the project asked about (another role there takes no new slot)
});

const memberView = (m) => ({
  id: m.id,
  kind: m.is_reviewer ? 'reviewer' : 'employee',
  employeeId: m.user_id,
  email: m.email,
  jobRoleId: m.job_role?.id ?? null,
  jobRoleName: m.job_role?.name || '',
  // the job roles the organization gave this person (to choose from when changing their roles here)
  employeeJobRoles: (m.employee_job_roles || []).map((r) => ({ id: r.id, name: r.name })),
});

export async function getTeamLeaderDashboard(teamLeaderId) {
  const d = await request(leader(teamLeaderId, '/dashboard'));
  const s = d?.statistics || {};
  return {
    stats: { total: s.total_projects ?? 0, notStarted: s.pending_projects ?? 0, ongoing: s.ongoing_projects ?? 0, completed: s.completed_projects ?? 0, aborted: s.aborted_projects ?? 0, teamMembers: s.total_members ?? 0 },
    projects: [...(d?.projects || [])]
      .sort((a, b) => (time(b.created_at) ?? 0) - (time(a.created_at) ?? 0))
      .slice(0, 4)
      .map(summaryView),
  };
}

export async function listTeamLeaderProjects(teamLeaderId) {
  const d = await request(leader(teamLeaderId, '/projects'));
  return (d?.projects || []).map(summaryView);
}

/**
 * One project, with its team and who could still join. (The project itself carries its members; the separate
 * GET .../members endpoint is not used because it fails in the current backend.)
 */
export async function getTeamLeaderProject(teamLeaderId, projectId) {
  const [project, employees, reviewers] = await Promise.all([
    request(leader(teamLeaderId, `/projects/${projectId}`)),
    // ?project_id: people already on this project are offered even at their project limit
    request(leader(teamLeaderId, `/available-employees?project_id=${projectId}`)),
    request(leader(teamLeaderId, `/available-reviewers?project_id=${projectId}`)),
  ]);
  const members = (project?.members || []).map(memberView);
  const on = new Set(members.map((m) => `${m.kind}:${m.employeeId}`));
  const reviewing = (id) => members.filter((m) => m.kind === 'reviewer' && m.employeeId === id).map((m) => m.jobRoleId);
  const allReviewers = (reviewers || []).map(personView);
  return {
    project: summaryView(project),
    members,
    availableEmployees: (employees || []).map(personView).filter((e) => !on.has(`employee:${e.id}`) && e.available),
    // a reviewer can review several job roles on one project: offered while one of their roles is not reviewed here yet
    availableReviewers: allReviewers.filter((e) => e.reviewerJobRoles.some((r) => !reviewing(e.id).includes(r.id))),
    // the job roles each reviewer reviews (to choose from when changing what they review here)
    reviewerRolesOf: Object.fromEntries(allReviewers.map((e) => [e.id, e.reviewerJobRoles])),
  };
}

export async function addProjectMember(teamLeaderId, projectId, { employeeId, kind, jobRoleId }) {
  const path = kind === 'reviewer' ? 'reviewers' : 'employees';
  return memberView(await request(leader(teamLeaderId, `/projects/${projectId}/${path}/${employeeId}`), { method: 'POST', body: { job_role_id: Number(jobRoleId) } }));
}

export async function removeProjectMember(teamLeaderId, projectId, memberId) {
  await request(leader(teamLeaderId, `/projects/${projectId}/members/${memberId}`), { method: 'DELETE' });
  return {};
}

/** Add an employee with one or more of their job roles, or change which of their roles they do on the project. */
export async function setEmployeeJobRoles(teamLeaderId, projectId, employeeId, jobRoleIds) {
  await request(leader(teamLeaderId, `/projects/${projectId}/employees/${employeeId}/job-roles`), { method: 'PUT', body: { job_role_ids: jobRoleIds.map(Number) } });
  return {};
}

export async function setProjectStatus(teamLeaderId, projectId, lifecycle) {
  return summaryView(await request(leader(teamLeaderId, `/projects/${projectId}/status`), { method: 'PATCH', body: { status: BACKEND_STATUS[lifecycle] } }));
}

/** The Team page. The backend lists only people with room for another project (and all Reviewers). */
export async function listTeamLeaderTeam(teamLeaderId) {
  const [employees, reviewers] = await Promise.all([request(leader(teamLeaderId, '/available-employees')), request(leader(teamLeaderId, '/available-reviewers'))]);
  return { employees: (employees || []).map(personView), reviewers: (reviewers || []).map(personView) };
}