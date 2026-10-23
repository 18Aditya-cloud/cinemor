/**
 * Everything the organization dashboard (and the Team Leader dashboard) reads and writes.
 *
 * - With no backend (VITE_API_URL empty) it runs on a DEMO DATABASE: it lives in memory and, where the
 *   browser allows, in localStorage, so what you create survives a reload.
 *   To start over, run in the browser console:  localStorage.removeItem('cm-demo-org')
 * - With the backend connected, every function hands over to its twin in organizationBackend.js, which calls the
 *   real Cinemor API and returns the same shapes. That file lists every backend route used.
 *
 * ids are numbers; the pages show them as "#3". An employee's id is their user id.
 */
import { demoHash, isBackendConnected, wait } from '../../services/api.js';
import * as backend from './organizationBackend.js';
import { normalizePermissions } from '../permissionsModel.js';

const KEY = 'cm-demo-org';
const LATENCY = 260;

const blank = () => ({
  next: { project: 1, client: 1, jobRole: 1, employee: 1, invitation: 1, tool: 1, activity: 1, member: 1 },
  organization: { name: 'Your Organization', businessType: '', address: '' },
  profile: { name: '' },
  projects: [],
  clients: [],
  jobRoles: [],
  invitations: [],
  employees: [],
  tools: [],
  activity: [],
});

let db = blank();
try {
  const saved = JSON.parse(window.localStorage.getItem(KEY));
  if (saved && typeof saved === 'object') db = { ...blank(), ...saved, next: { ...blank().next, ...saved.next } };
} catch {
  /* storage blocked or empty: start with an empty demo database */
}

const persist = () => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const fail = (message, status) => Object.assign(new Error(message), { status });
const nextId = (kind) => db.next[kind]++;

// Runs a demo action after a short delay (so loading states are visible) and returns a copy of the result.
async function demo(action) {
  await wait(LATENCY);
  const result = action();
  persist();
  return clone(result);
}

const jobRoleName = (id) => db.jobRoles.find((r) => r.id === id)?.name ?? '';
// An employee may hold several job roles (jobRoleIds); older demo data only had one (jobRoleId).
const rolesOf = (e) => (Array.isArray(e.jobRoleIds) ? e.jobRoleIds : e.jobRoleId ? [e.jobRoleId] : []);
// How many ongoing projects someone is working on (as an employee or a reviewer), for the capacity checks.
// A project's lifecycle, as the backend has it: not_started -> ongoing -> completed, or aborted before it finishes.
// The organization's own pages speak of "ongoing", "delivered" and "aborted" (status); that is worked out from this.
const lifecycleOf = (p) => p.lifecycle || (p.status === 'delivered' ? 'completed' : 'ongoing');
const statusOf = (p) => (lifecycleOf(p) === 'completed' ? 'delivered' : lifecycleOf(p) === 'aborted' ? 'aborted' : 'ongoing');
const isActive = (p) => ['not_started', 'ongoing'].includes(lifecycleOf(p));
const activeProjectCount = (employeeId) =>
  db.projects.filter((p) => isActive(p) && (p.teamLeaderId === employeeId || (p.members || []).some((m) => m.employeeId === employeeId))).length;
// The job roles a Reviewer reviews: always a subset of the job roles they hold (the backend's rule), and none at all
// unless they are a Reviewer.
const reviewerRolesOf = (e) => (e.reviewer && Array.isArray(e.reviewerJobRoleIds) ? e.reviewerJobRoleIds.filter((id) => rolesOf(e).includes(id)) : []);
const employeeView = (e) => {
  const ids = rolesOf(e);
  return {
    ...e,
    jobRoleIds: ids,
    jobRoleId: ids[0] ?? null,
    // in the organization's own job-role order, whatever order they were ticked in
    jobRoles: db.jobRoles.filter((r) => ids.includes(r.id)).map((r) => ({ id: r.id, name: r.name })),
    jobRoleName: ids.map(jobRoleName).filter(Boolean).join(', '),
    reviewerJobRoleIds: reviewerRolesOf(e),
    currentProjects: activeProjectCount(e.id),
  };
};
const randomToken = () => Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');

// DEMO: remember what happened, for the Overview's "Recent activity" (the last 40 things)
function log(type, text) {
  db.activity.unshift({ id: nextId('activity'), type, text, at: Date.now() });
  db.activity = db.activity.slice(0, 40);
}

/* ------------------------------------------------------------------ workspace */
export async function getWorkspace() {
  if (isBackendConnected) return backend.getWorkspace();
  return demo(() => ({ organization: { ...db.organization }, profile: { ...db.profile } }));
}

/** Settings page, "Save Changes": the editable organization details. */
export async function updateOrganizationSettings({ name, businessType, address }) {
  if (isBackendConnected) return backend.updateOrganizationSettings({ name, businessType, address });
  return demo(() => {
    db.organization = { name: name.trim(), businessType: businessType.trim(), address: address.trim() };
    log('organization', 'Organization details were updated');
    return { organization: { ...db.organization } };
  });
}

/* ------------------------------------------------------------------- projects */
export async function listProjects() {
  if (isBackendConnected) return backend.listProjects();
  return demo(() =>
    db.projects.map((p) => ({
      ...p,
      status: statusOf(p),
      lifecycle: lifecycleOf(p),
      stage: p.stage || 'story',
      clientName: db.clients.find((c) => c.id === p.clientId)?.name ?? '',
      teamLeaderEmail: db.employees.find((e) => e.id === p.teamLeaderId)?.email ?? '',
      memberCount: (p.members || []).length,
    })),
  );
}

/** DEMO ONLY: move a project to its next stage (and mark it delivered after the last one), so the progress bar can be seen moving. */
export async function advanceProjectDemo(id) {
  return demo(() => {
    const project = db.projects.find((p) => p.id === id);
    if (!project) throw fail('That project no longer exists.', 404);
    const order = ['story', 'storyboard', 'characters', 'scenes', 'shots', 'video'];
    const at = order.indexOf(project.stage || 'story');
    if (at < order.length - 1) {
      project.stage = order[at + 1];
      log('project', `Project "${project.title}" moved to ${project.stage}`);
    } else {
      project.status = 'delivered';
      project.lifecycle = 'completed';
      log('project', `Project "${project.title}" was delivered`);
    }
    return project;
  });
}

export async function createProject({ title, description, clientId, teamLeaderId, startDate = '', deadline = '' }) {
  if (isBackendConnected) return backend.createProject({ title, description, clientId, teamLeaderId, startDate, deadline });
  return demo(() => {
    if (!db.clients.some((c) => c.id === Number(clientId))) throw fail('Choose a client from the list.', 400);
    if (!db.employees.some((e) => e.id === Number(teamLeaderId) && e.teamLeader)) throw fail('Choose a Team Leader from the list.', 400);
    const project = { id: nextId('project'), title, description: description || '', clientId: Number(clientId), teamLeaderId: Number(teamLeaderId), startDate, deadline, status: 'ongoing', lifecycle: 'not_started', stage: 'story', members: [], createdAt: Date.now(), updatedAt: Date.now() };
    db.projects.push(project);
    log('project', `Project "${title}" was created`);
    return project;
  });
}

/* -------------------------------------------------------------------- clients */
export async function listClients() {
  if (isBackendConnected) return backend.listClients();
  return demo(() =>
    db.clients.map((c) => ({
      ...c,
      ongoingProjects: db.projects.filter((p) => p.clientId === c.id && isActive(p)).length,
      deliveredProjects: db.projects.filter((p) => p.clientId === c.id && lifecycleOf(p) === 'completed').length,
    })),
  );
}

export async function createClient({ name, email, phone }) {
  if (isBackendConnected) return backend.createClient({ name, email, phone });
  return demo(() => {
    const client = { id: nextId('client'), name, email, phone };
    db.clients.push(client);
    log('client', `Client "${client.name}" was added`);
    return client;
  });
}

export async function updateClient(id, { name, email, phone }) {
  if (isBackendConnected) return backend.updateClient(id, { name, email, phone });
  return demo(() => {
    const client = db.clients.find((c) => c.id === id);
    if (!client) throw fail('That client no longer exists.', 404);
    Object.assign(client, { name, email, phone });
    return client;
  });
}

/* ------------------------------------------------------------------ job roles */
export async function listJobRoles() {
  if (isBackendConnected) return backend.listJobRoles();
  return demo(() => db.jobRoles.map((r) => ({ id: r.id, name: r.name, description: r.description, ...normalizePermissions(r) })));
}

export async function createJobRole({ name, description, features = [], tools = [] }) {
  if (isBackendConnected) return backend.createJobRole({ name, description, features, tools });
  return demo(() => {
    const role = { id: nextId('jobRole'), name, description: description || '', ...normalizePermissions({ features, tools }) };
    db.jobRoles.push(role);
    log('role', `Job role "${name}" was created`);
    return role;
  });
}

export async function updateJobRole(id, { name, description, features = [], tools = [] }) {
  if (isBackendConnected) return backend.updateJobRole(id, { name, description, features, tools });
  return demo(() => {
    const role = db.jobRoles.find((r) => r.id === id);
    if (!role) throw fail('That job role no longer exists.', 404);
    Object.assign(role, { name, description: description || '', ...normalizePermissions({ features, tools }) });
    return role;
  });
}

export async function deleteJobRole(id) {
  if (isBackendConnected) return backend.deleteJobRole(id);
  return demo(() => {
    const users = db.employees.filter((e) => rolesOf(e).includes(id)).length + db.invitations.filter((i) => i.jobRoleId === id).length;
    if (users) throw fail(`This job role is still used by ${users} ${users === 1 ? 'employee or invitation' : 'employees and invitations'}. Reassign or remove them first.`, 409);
    const removed = db.jobRoles.find((r) => r.id === id);
    db.jobRoles = db.jobRoles.filter((r) => r.id !== id);
    if (removed) log('role', `Job role "${removed.name}" was deleted`);
    return {};
  });
}

/** Saves just the permissions of one role (a click on a box in the Job Roles table). */
export async function updateRolePermissions(id, { features, tools }) {
  if (isBackendConnected) return backend.updateRolePermissions(id, { features, tools });
  return demo(() => {
    const role = db.jobRoles.find((r) => r.id === id);
    if (!role) throw fail('That job role no longer exists.', 404);
    Object.assign(role, normalizePermissions({ features, tools }));
    return normalizePermissions(role);
  });
}

// DEMO ONLY: a few roles so the table can be seen filled in (they get Cinemor features; tools are left for you to give).
const SAMPLE_ROLES = [
  ['Story Writer', 'Writes the story', ['storyCreation']],
  ['Storyboard Artist', 'Turns the story into a storyboard', ['storyboardCreation']],
  ['Character Designer', 'Designs the characters', ['characterCreation']],
  ['Environment Artist', 'Designs the locations', ['sceneCreation']],
  ['Sketch Artist', 'Sketches every scene', ['shotCreation']],
  ['Animator', 'Turns the scenes into clips and the film', ['videoGeneration']],
];

export async function seedSampleRolesDemo() {
  return demo(() => {
    for (const [name, description, features] of SAMPLE_ROLES) {
      if (db.jobRoles.some((r) => r.name.toLowerCase() === name.toLowerCase())) continue;
      db.jobRoles.push({ id: nextId('jobRole'), name, description, ...normalizePermissions({ features, tools: [] }) });
    }
    return {};
  });
}

/* ---------------------------------------------------------------- invitations */
export async function listInvitations() {
  if (isBackendConnected) return backend.listInvitations();
  return demo(() =>
    db.invitations.map((i) => {
      if (!i.token) i.token = randomToken(); // invitations made before tokens existed
      return { ...i, jobRoleName: jobRoleName(i.jobRoleId) };
    }),
  );
}

export async function sendInvitation({ email, jobRoleId, maxProjects }) {
  if (isBackendConnected) return backend.sendInvitation({ email, jobRoleId, maxProjects });
  return demo(() => {
    const lower = email.toLowerCase();
    if (db.invitations.some((i) => i.email.toLowerCase() === lower) || db.employees.some((e) => e.email.toLowerCase() === lower)) {
      throw fail('This email has already been invited.', 409);
    }
    if (!db.jobRoles.some((r) => r.id === Number(jobRoleId))) throw fail('Choose a job role from the list.', 400);
    const invitation = { id: nextId('invitation'), email, jobRoleId: Number(jobRoleId), maxProjects: maxProjects ? Number(maxProjects) : null, sentAt: Date.now(), status: 'pending', token: randomToken() };
    db.invitations.push(invitation);
    log('invitation', `Invitation sent to ${email}`);
    return { ...invitation, jobRoleName: jobRoleName(invitation.jobRoleId) };
  });
}

export async function revokeInvitation(id) {
  if (isBackendConnected) return backend.revokeInvitation(id);
  return demo(() => {
    const gone = db.invitations.find((i) => i.id === id);
    db.invitations = db.invitations.filter((i) => i.id !== id);
    if (gone) log('invitation', `Invitation to ${gone.email} was revoked`);
    return {};
  });
}

/** DEMO ONLY: pretend the invited person accepted, so the Employees pages have someone in them. */
export async function acceptInvitationDemo(id) {
  return demo(() => {
    const invitation = db.invitations.find((i) => i.id === id);
    if (!invitation) throw fail('That invitation no longer exists.', 404);
    db.invitations = db.invitations.filter((i) => i.id !== id);
    const employee = { id: nextId('employee'), email: invitation.email, jobRoleIds: [invitation.jobRoleId], maxProjects: invitation.maxProjects, teamLeader: false, reviewer: false };
    db.employees.push(employee);
    log('employee', `${employee.email} joined the team`);
    return employee;
  });
}

/* ------------------------------------------------------------------ employees */
export async function listEmployees() {
  if (isBackendConnected) return backend.listEmployees();
  return demo(() => db.employees.map(employeeView));
}

export async function setEmployeeRoles(id, changes) {
  if (isBackendConnected) return backend.setEmployeeRoles(id, changes);
  return demo(() => {
    const employee = db.employees.find((e) => e.id === id);
    if (!employee) throw fail('That employee no longer exists.', 404);
    Object.assign(employee, changes);
    if (changes.reviewer === false) employee.reviewerJobRoleIds = []; // no longer a Reviewer: they review nothing
    if ('teamLeader' in changes) log('employee', `${employee.email} ${changes.teamLeader ? 'is now' : 'is no longer'} a Team Leader`);
    if ('reviewer' in changes) log('employee', `${employee.email} ${changes.reviewer ? 'is now' : 'is no longer'} a Reviewer`);
    return employeeView(employee);
  });
}

/* ---------------------------------------------------------------------- tools */
export async function listTools() {
  if (isBackendConnected) return backend.listTools();
  return demo(() => db.tools);
}

export async function createTool({ name, description, url }) {
  if (isBackendConnected) return backend.createTool({ name, description, url });
  return demo(() => {
    const tool = { id: nextId('tool'), name, description, url: url || '' };
    db.tools.push(tool);
    log('tool', `Tool "${name}" was added`);
    return tool;
  });
}

/* ------------------------------------------------------------------- activity */
export async function listActivity() {
  if (isBackendConnected) return backend.listActivity();
  return demo(() => db.activity.slice(0, 12));
}

/** The Activity page: { items, hasMore }, newest first. `beforeId` loads the next page, `kind` filters ("project", "employee,invitation"). */
export async function listActivityPage({ limit = 20, beforeId, kind } = {}) {
  if (isBackendConnected) return backend.listActivityPage({ limit, beforeId, kind });
  return demo(() => {
    const kinds = kind ? kind.split(',') : null;
    const rows = db.activity.filter((a) => (!beforeId || a.id < beforeId) && (!kinds || kinds.includes(a.type)));
    return { items: rows.slice(0, limit), hasMore: rows.length > limit };
  });
}

/**
 * Employees page, "Update": everything about one employee, saved together.
 *   jobRoleIds          the job roles they hold (at least one; more than one is allowed)
 *   maxProjects         how many projects at once, 1 to 100, and not below what they are on now (null = the job
 *                       role's default)
 *   teamLeader          may lead projects (the Team Leader dashboard opens for them)
 *   reviewer            may review work
 *   reviewerJobRoleIds  which of THEIR job roles they review: at least one when `reviewer` is on, none when it is off
 * With the backend these are its own separate calls (see updateEmployee in organizationBackend.js).
 */
export async function updateEmployee(id, { maxProjects, jobRoleIds, teamLeader, reviewer, reviewerJobRoleIds }) {
  if (isBackendConnected) return backend.updateEmployee(id, { maxProjects, jobRoleIds, teamLeader, reviewer, reviewerJobRoleIds });
  return demo(() => {
    const employee = db.employees.find((e) => e.id === id);
    if (!employee) throw fail('That employee no longer exists.', 404);
    const ids = [...new Set((jobRoleIds || []).map(Number))];
    if (!ids.length) throw fail('Give the employee at least one job role.', 400);
    if (ids.some((rid) => !db.jobRoles.some((r) => r.id === rid))) throw fail('One of those job roles no longer exists.', 400);
    const max = maxProjects === '' || maxProjects == null ? null : Number(maxProjects);
    if (max !== null && (!Number.isInteger(max) || max < 1 || max > 100)) throw fail('Maximum concurrent projects must be a whole number from 1 to 100.', 400);
    const busy = activeProjectCount(employee.id);
    if (max !== null && max < busy) throw fail(`This employee is already on ${busy} active projects. Set at least ${busy}, or remove them from a project first.`, 409);
    const isReviewer = reviewer === undefined ? Boolean(employee.reviewer) : Boolean(reviewer);
    const reviews = isReviewer ? [...new Set((reviewerJobRoleIds || []).map(Number))] : [];
    if (isReviewer && !reviews.length) throw fail('Select at least one job role for which this employee will be a Reviewer.', 400);
    if (reviews.some((rid) => !ids.includes(rid))) throw fail("Reviewer job roles must be selected from the employee's assigned job roles.", 400);

    const was = { teamLeader: Boolean(employee.teamLeader), reviewer: Boolean(employee.reviewer) };
    employee.jobRoleIds = ids;
    delete employee.jobRoleId;
    employee.maxProjects = max;
    if (teamLeader !== undefined) employee.teamLeader = Boolean(teamLeader);
    employee.reviewer = isReviewer;
    employee.reviewerJobRoleIds = reviews;
    log('employee', `${employee.email}'s details were updated`);
    if (employee.teamLeader !== was.teamLeader) log('employee', `${employee.email} ${employee.teamLeader ? 'is now' : 'is no longer'} a Team Leader`);
    if (employee.reviewer !== was.reviewer) log('employee', `${employee.email} ${employee.reviewer ? 'is now' : 'is no longer'} a Reviewer`);
    return employeeView(employee);
  });
}

export async function deleteClient(id) {
  if (isBackendConnected) return backend.deleteClient(id);
  return demo(() => {
    const client = db.clients.find((c) => c.id === id);
    if (!client) throw fail('That client no longer exists.', 404);
    const used = db.projects.filter((p) => p.clientId === id).length;
    if (used) throw fail(`${client.name} still has ${used} ${used === 1 ? 'project' : 'projects'}. Delete or move ${used === 1 ? 'it' : 'them'} first.`, 409);
    db.clients = db.clients.filter((c) => c.id !== id);
    log('client', `Client "${client.name}" was deleted`);
    return {};
  });
}

export async function updateProject(id, { title, description, clientId, teamLeaderId, startDate = '', deadline = '' }) {
  if (isBackendConnected) return backend.updateProject(id, { title, description, clientId, teamLeaderId, startDate, deadline });
  return demo(() => {
    const project = db.projects.find((p) => p.id === id);
    if (!project) throw fail('That project no longer exists.', 404);
    if (!db.clients.some((c) => c.id === Number(clientId))) throw fail('Choose a client from the list.', 400);
    if (!db.employees.some((e) => e.id === Number(teamLeaderId) && e.teamLeader)) throw fail('Choose a Team Leader from the list.', 400);
    // the title is fixed; the start date too once the project has started; the deadline can always move
    Object.assign(project, { description: description || '', clientId: Number(clientId), teamLeaderId: Number(teamLeaderId), deadline: deadline || project.deadline || '' });
    if (project.lifecycle === 'not_started' && startDate) project.startDate = startDate;
    log('project', `Project "${title}" was updated`);
    return project;
  });
}

export async function deleteProject(id) {
  if (isBackendConnected) return backend.deleteProject(id);
  return demo(() => {
    const project = db.projects.find((p) => p.id === id);
    if (!project) throw fail('That project no longer exists.', 404);
    db.projects = db.projects.filter((p) => p.id !== id);
    log('project', `Project "${project.title}" was deleted`);
    return {};
  });
}

/* -------------------------------------------------------- accepting an invitation (the link in the email) */
/**
 * POST /api/auth/invitations/accept  { token, password, confirm_password }  ->  201 { access_token, ... } (+ refresh cookie)
 * The backend already knows the email, organization, job role and Team Leader / Reviewer status from the invitation,
 * so the page only sends the token from the link and the new password. It signs the employee in straight away.
 * Errors: 400 / 404 / 410 when the link is used, cancelled or expired; 422 when the passwords are not acceptable.
 */
export async function acceptInvitation({ token, password, confirmPassword }) {
  if (isBackendConnected) return backend.acceptInvitation({ token, password, confirmPassword });
  const passwordHash = await demoHash(password);
  return demo(() => {
    const invitation = db.invitations.find((i) => i.token && i.token === token);
    if (!invitation) throw fail('This invitation link is not valid any more. It may have been used already or cancelled.', 404);
    if (!password || password.length < 8) throw fail('Choose a password of at least 8 characters.', 422);
    if (password !== confirmPassword) throw fail('The two passwords do not match.', 422);
    db.invitations = db.invitations.filter((i) => i.id !== invitation.id);
    const employee = { id: nextId('employee'), email: invitation.email, jobRoleIds: [invitation.jobRoleId], maxProjects: invitation.maxProjects, teamLeader: false, reviewer: false, passwordHash };
    db.employees.push(employee);
    log('employee', `${employee.email} joined the team`);
    return { user: { email: employee.email, accountType: 'employee', employeeId: employee.id, teamLeader: false, reviewer: false } };
  });
}

/** DEMO ONLY: which email an invitation link is for, so the demo page can say it. The real backend has no such lookup. */
export function demoInvitationEmail(token) {
  return db.invitations.find((i) => i.token && i.token === token)?.email ?? '';
}

/** DEMO ONLY: who an email belongs to among the organization's employees (used by the demo log in). */
export function findDemoEmployee(email) {
  const lower = String(email || '').trim().toLowerCase();
  const employee = db.employees.find((e) => e.email.toLowerCase() === lower);
  return employee ? { employeeId: employee.id, teamLeader: Boolean(employee.teamLeader), reviewer: Boolean(employee.reviewer) } : null;
}

/* ----------------------------------------------------------------------------- the Team Leader's own view */
const touch = (project) => {
  project.updatedAt = Date.now();
};
const leaderProject = (teamLeaderId, projectId) => {
  const project = db.projects.find((p) => p.id === Number(projectId));
  if (!project || project.teamLeaderId !== Number(teamLeaderId)) throw fail('That project is not one of yours, or it no longer exists.', 404);
  if (!project.members) project.members = [];
  return project;
};
const projectSummary = (p) => ({
  id: p.id,
  title: p.title,
  description: p.description,
  lifecycle: lifecycleOf(p),
  stage: p.stage || 'story',
  clientName: db.clients.find((c) => c.id === p.clientId)?.name ?? '',
  memberCount: (p.members || []).length,
  createdAt: p.createdAt ?? null,
  updatedAt: p.updatedAt ?? p.createdAt ?? null,
});
const personView = (e) => ({
  id: e.id,
  email: e.email,
  jobRoles: rolesOf(e).map((id) => ({ id, name: jobRoleName(id) })).filter((r) => r.name),
  // the job roles this person reviews (a Team Leader adds a reviewer to a project for one of them)
  reviewerJobRoles: (e.reviewer ? e.reviewerJobRoleIds || [] : []).map((id) => ({ id, name: jobRoleName(id) })).filter((r) => r.name),
  activeProjects: activeProjectCount(e.id),
  maxProjects: e.maxProjects ?? null,
  available: e.maxProjects == null || activeProjectCount(e.id) < e.maxProjects,
});
const leaderProjects = (teamLeaderId) => db.projects.filter((p) => p.teamLeaderId === Number(teamLeaderId));

/** The Team Leader's dashboard: counts by status, and the latest projects. */
export async function getTeamLeaderDashboard(teamLeaderId) {
  if (isBackendConnected) return backend.getTeamLeaderDashboard(teamLeaderId);
  return demo(() => {
    const mine = leaderProjects(teamLeaderId);
    const count = (state) => mine.filter((p) => lifecycleOf(p) === state).length;
    const people = new Set(mine.flatMap((p) => (p.members || []).map((m) => m.employeeId)));
    return {
      stats: { total: mine.length, notStarted: count('not_started'), ongoing: count('ongoing'), completed: count('completed'), aborted: count('aborted'), teamMembers: people.size },
      projects: [...mine].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 4).map(projectSummary),
    };
  });
}

export async function listTeamLeaderProjects(teamLeaderId) {
  if (isBackendConnected) return backend.listTeamLeaderProjects(teamLeaderId);
  return demo(() => leaderProjects(teamLeaderId).map(projectSummary));
}

export async function getTeamLeaderProject(teamLeaderId, projectId) {
  if (isBackendConnected) return backend.getTeamLeaderProject(teamLeaderId, projectId);
  return demo(() => {
    const project = leaderProject(teamLeaderId, projectId);
    const on = new Set(project.members.map((m) => `${m.kind}:${m.employeeId}`));
    return {
      project: projectSummary(project),
      members: project.members.map((m) => {
        const e = db.employees.find((x) => x.id === m.employeeId);
        return { id: m.id, kind: m.kind, employeeId: m.employeeId, email: e?.email ?? '(removed employee)', jobRoleName: jobRoleName(m.jobRoleId) || (m.kind === 'reviewer' ? 'Reviewer' : ''),jobRoleId: m.jobRoleId ?? null,
          employeeJobRoles: e ? rolesOf(e).map((id) => ({ id, name: jobRoleName(id) })).filter((r) => r.name) : [], };
      }),
      availableEmployees: db.employees.filter((e) => e.id !== project.teamLeaderId && !on.has(`employee:${e.id}`)).map(personView).filter((e) => e.available),
      availableReviewers: db.employees.filter((e) => e.reviewer && e.id !== project.teamLeaderId && !on.has(`reviewer:${e.id}`)).map(personView),
    };
  });
}

/** Add someone to a project: as an employee (doing the work, in one of their job roles) or as a reviewer. */
export async function addProjectMember(teamLeaderId, projectId, { employeeId, kind, jobRoleId }) {
  if (isBackendConnected) return backend.addProjectMember(teamLeaderId, projectId, { employeeId, kind, jobRoleId });
  return demo(() => {
    const project = leaderProject(teamLeaderId, projectId);
    if (!isActive(project)) throw fail('This project is finished, so its team can no longer change.', 409);
    const employee = db.employees.find((e) => e.id === Number(employeeId));
    if (!employee) throw fail('Choose someone from the list.', 400);
    if (kind === 'reviewer' && !employee.reviewer) throw fail(`${employee.email} is not a Reviewer.`, 400);
    // the same rule as the backend: a reviewer is added for one of the job roles they review
    if (kind === 'reviewer' && !(employee.reviewerJobRoleIds || []).includes(Number(jobRoleId))) throw fail('Choose one of the job roles this reviewer reviews.', 400);
    if (project.members.some((m) => m.kind === kind && m.employeeId === employee.id)) throw fail(`${employee.email} is already on this project.`, 409);
    if (kind === 'employee') {
      if (!rolesOf(employee).includes(Number(jobRoleId))) throw fail('Choose one of this employee\u2019s job roles.', 400);
      if (employee.maxProjects != null && activeProjectCount(employee.id) >= employee.maxProjects) throw fail(`${employee.email} is already on ${employee.maxProjects} projects, their limit.`, 409);
    }
    const member = { id: nextId('member'), employeeId: employee.id, kind, jobRoleId: Number(jobRoleId) };
    project.members.push(member);
    touch(project);
    log('project', `${employee.email} was added to "${project.title}" as ${kind === 'reviewer' ? 'a reviewer' : 'an employee'}`);
    return member;
  });
}

export async function removeProjectMember(teamLeaderId, projectId, memberId) {
  if (isBackendConnected) return backend.removeProjectMember(teamLeaderId, projectId, memberId);
  return demo(() => {
    const project = leaderProject(teamLeaderId, projectId);
    project.members = project.members.filter((m) => m.id !== memberId);
    touch(project);
    return {};
  });
}

export async function setEmployeeJobRoles(teamLeaderId, projectId, employeeId, jobRoleIds) {
  if (isBackendConnected) return backend.setEmployeeJobRoles(teamLeaderId, projectId, employeeId, jobRoleIds);
  return demo(() => {
    const project = leaderProject(teamLeaderId, projectId);
    if (!isActive(project)) throw fail('This project is finished, so its team can no longer change.', 409);
    const employee = db.employees.find((e) => e.id === Number(employeeId));
    if (!employee) throw fail('Choose someone from the list.', 400);
    const wanted = [...new Set(jobRoleIds.map(Number))];
    if (!wanted.length) throw fail('Choose at least one job role.', 400);
    if (wanted.some((id) => !rolesOf(employee).includes(id))) throw fail('Choose from this employee\u2019s job roles.', 400);
    const onProject = project.members.some((m) => m.employeeId === employee.id);
    if (!onProject && employee.maxProjects != null && activeProjectCount(employee.id) >= employee.maxProjects) throw fail('Employee has reached the maximum number of concurrent projects.', 409);
    const mine = (m) => m.kind === 'employee' && m.employeeId === employee.id;
    const have = project.members.filter(mine).map((m) => m.jobRoleId);
    project.members = project.members.filter((m) => !mine(m) || wanted.includes(m.jobRoleId));
    wanted.filter((id) => !have.includes(id)).forEach((id) => project.members.push({ id: nextId('member'), employeeId: employee.id, kind: 'employee', jobRoleId: id }));
    touch(project);
    return {};
  });
}

// What a project may move to from where it is now (the same rules as the backend).
export const NEXT_LIFECYCLE = { not_started: ['ongoing', 'aborted'], ongoing: ['completed', 'aborted'], completed: [], aborted: [] };

export async function setProjectStatus(teamLeaderId, projectId, lifecycle) {
  if (isBackendConnected) return backend.setProjectStatus(teamLeaderId, projectId, lifecycle);
  return demo(() => {
    const project = leaderProject(teamLeaderId, projectId);
    const from = lifecycleOf(project);
    if (!NEXT_LIFECYCLE[from].includes(lifecycle)) throw fail(`A project that is ${from.replace('_', ' ')} can't be moved to ${lifecycle.replace('_', ' ')}.`, 409);
    project.lifecycle = lifecycle;
    project.status = lifecycle === 'completed' ? 'delivered' : 'ongoing';
    touch(project);
    log('project', `Project "${project.title}" is now ${lifecycle.replace('_', ' ')}`);
    return projectSummary(project);
  });
}

/** The Team page: everyone the Team Leader could put on a project, and the reviewers, with how busy each is. */
export async function listTeamLeaderTeam(teamLeaderId) {
  if (isBackendConnected) return backend.listTeamLeaderTeam(teamLeaderId);
  return demo(() => ({
    employees: db.employees.filter((e) => e.id !== Number(teamLeaderId)).map(personView),
    reviewers: db.employees.filter((e) => e.reviewer && e.id !== Number(teamLeaderId)).map(personView),
  }));
}
