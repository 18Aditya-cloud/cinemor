import { useEffect, useMemo, useState } from 'react';
import { advanceProjectDemo, createProject, deleteProject, listClients, listEmployees, listProjects, updateProject } from '../api/organizationApi.js';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import { DASHBOARD } from '../../data/content.js';
import { isBackendConnected } from '../../services/api.js';
import cx from '../../utils/cx.js';
import { PROJECT_STAGES, stageIndex } from '../projectStages.js';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import TextField from '../../components/auth/TextField.jsx';
import useModalForm from '../hooks/useModalForm.js';
import useOpenFromQuery from '../hooks/useOpenFromQuery.js';
import useResource from '../hooks/useResource.js';
import Button from '../ui/Button.jsx';
import DataTable from '../ui/DataTable.jsx';
import { IconBriefcase, IconBuilding, IconGrid, IconList, IconPencil, IconPlus, IconSearch, IconTrash, IconUserCog } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Modal, { ModalFooter } from '../ui/Modal.jsx';
import Notice from '../ui/Notice.jsx';
import PageHeader from '../ui/PageHeader.jsx';
import Pill from '../ui/Pill.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import SelectField from '../ui/SelectField.jsx';
import { useToast } from '../ui/Toast.jsx';
import ProjectCard from './ProjectCard.jsx';
import { DeadlineCell, dayLabel } from '../projectDates.jsx';
import styles from './pages.module.css';
import toolbar from './ProjectsToolbar.module.css';

const COLUMNS = [
  { key: 'no', header: 'No.', render: (_row, index) => index + 1 },
  { key: 'id', header: 'Project ID', render: (row) => <strong>#{row.id}</strong> },
  { key: 'title', header: 'Title', render: (row) => <strong>{row.title}</strong> },
  { key: 'description', header: 'Description', wrap: true, render: (row) => row.description || <span className={styles.muted}>-</span> },
  { key: 'client', header: 'Client', render: (row) => row.clientName },
  { key: 'leader', header: 'Team Leader', render: (row) => row.teamLeaderEmail },
  { key: 'start', header: 'Start', render: (row) => dayLabel(row.startDate) || <span className={styles.muted}>-</span> },
  { key: 'deadline', header: 'Deadline', render: (row) => <DeadlineCell project={row} /> },
  { key: 'stage', header: 'Stage', render: (row) => (row.status === 'delivered' || row.stage == null ? '-' : PROJECT_STAGES[stageIndex(row.stage)].label) },
  {
    key: 'status',
    header: 'Status',
    render: (row) =>
      row.status === 'delivered' ? <Pill tone="green">Delivered</Pill> : row.lifecycle === 'aborted' ? <Pill tone="red">Aborted</Pill> : row.lifecycle === 'not_started' ? <Pill tone="gray">Not started</Pill> : <Pill tone="amber">Ongoing</Pill>,
  },
];

const VIEW_KEY = 'cm-projects-view';
const readView = () => {
  try {
    const saved = window.localStorage.getItem(VIEW_KEY);
    if (saved === 'cards' || saved === 'table') return saved;
  } catch {
    /* no saved choice */
  }
  return DASHBOARD.projectsView === 'table' ? 'table' : 'cards';
};

/**
 * All Projects, as cards (with how far along each is) or as the table; search and a status filter above them.
 * Creating a project needs a client and a Team Leader, so the window loads both lists.
 */
export default function ProjectsPage() {
  useDocumentTitle('All Projects');
  const toast = useToast();
  const { data, loading, error, reload } = useResource(listProjects, []);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // the project being edited
  const [deleting, setDeleting] = useState(null); // the project about to be deleted
  useOpenFromQuery(() => setCreating(true));
  const projects = useMemo(() => data ?? [], [data]);

  const [view, setViewState] = useState(readView);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all'); // all | ongoing | delivered
  const [advancingId, setAdvancingId] = useState(null);
  const setView = (next) => {
    setViewState(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* the choice lasts until the page is closed */
    }
  };

  const counts = useMemo(() => ({ all: projects.length, ongoing: projects.filter((p) => p.status !== 'delivered').length, delivered: projects.filter((p) => p.status === 'delivered').length }), [projects]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (status === 'ongoing' && p.status === 'delivered') return false;
      if (status === 'delivered' && p.status !== 'delivered') return false;
      if (!q) return true;
      return [p.title, p.description, p.clientName, p.teamLeaderEmail].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [projects, query, status]);

  const advance = async (id) => {
    setAdvancingId(id);
    try {
      await advanceProjectDemo(id);
      await reload();
    } catch (err) {
      toast(err.message || 'Could not update the project.', 'error');
    }
    setAdvancingId(null);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="All Projects"
        subtitle="Manage production projects, clients and team leaders across your organization."
        actions={
          <>
            <RefreshButton onClick={reload} loading={loading} />
            <Button icon={IconPlus} onClick={() => setCreating(true)}>
              Create Project
            </Button>
          </>
        }
      />

      {error && <Notice message={error.message} onRetry={reload} />}

      {projects.length === 0 && !error ? (
        <section className={styles.panel} aria-labelledby="cm-projects-title">
          <div className={styles.panelHead}>
            <div>
              <p className={styles.panelEyebrow}>Production</p>
              <h2 id="cm-projects-title" className={styles.panelTitle}>
                Company Projects
              </h2>
              <p className={styles.panelSub}>All projects currently managed by your organization.</p>
            </div>
            <IconBriefcase width={22} height={22} className={styles.panelIcon} />
          </div>
          <div className={styles.panelBody}>
            <div className={styles.panelEmpty}>
              <EmptyState
                framed={false}
                icon={IconBriefcase}
                title="No projects yet"
                text="Create your first production project and assign its client and team leader."
                action={
                  <Button icon={IconPlus} onClick={() => setCreating(true)}>
                    Create Project
                  </Button>
                }
              />
            </div>
          </div>
        </section>
      ) : (
        projects.length > 0 && (
          <>
            <div className={toolbar.bar}>
              <div className={toolbar.search}>
                <IconSearch width={18} height={18} aria-hidden="true" />
                <label htmlFor="cm-project-search" className="cm-sr-only">
                  Search projects
                </label>
                <input id="cm-project-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects, clients, team leaders" autoComplete="off" />
              </div>
              <div className={toolbar.group} role="group" aria-label="Show projects">
                {[
                  ['all', 'All'],
                  ['ongoing', 'Ongoing'],
                  ['delivered', 'Delivered'],
                ].map(([id, label]) => (
                  <button key={id} type="button" className={cx(toolbar.tab, status === id && toolbar.tabOn)} aria-pressed={status === id} onClick={() => setStatus(id)}>
                    {label}
                    <span className={toolbar.count}>{counts[id]}</span>
                  </button>
                ))}
              </div>
              <div className={toolbar.group} role="group" aria-label="View">
                <button type="button" className={cx(toolbar.tab, view === 'cards' && toolbar.tabOn)} aria-pressed={view === 'cards'} onClick={() => setView('cards')}>
                  <IconGrid width={16} height={16} aria-hidden="true" />
                  Cards
                </button>
                <button type="button" className={cx(toolbar.tab, view === 'table' && toolbar.tabOn)} aria-pressed={view === 'table'} onClick={() => setView('table')}>
                  <IconList width={16} height={16} aria-hidden="true" />
                  Table
                </button>
              </div>
            </div>

            <p className="cm-sr-only" role="status" aria-live="polite">
              {shown.length} {shown.length === 1 ? 'project' : 'projects'} shown
            </p>

            {shown.length === 0 ? (
              <div className={toolbar.none}>
                <p>No projects match your search or filter.</p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setStatus('all');
                  }}
                >
                  Clear search and filter
                </Button>
              </div>
            ) : view === 'cards' ? (
              <ul className={toolbar.grid} aria-label="Projects">
                {shown.map((project) => (
                  <li key={project.id}>
                    <ProjectCard project={project} advancing={advancingId === project.id} onAdvance={isBackendConnected ? undefined : () => advance(project.id)} onEdit={() => setEditing(project)} onDelete={() => setDeleting(project)} />
                  </li>
                ))}
              </ul>
            ) : (
              <section className={styles.panel} aria-labelledby="cm-projects-title">
                <div className={styles.panelHead}>
                  <div>
                    <p className={styles.panelEyebrow}>Production</p>
                    <h2 id="cm-projects-title" className={styles.panelTitle}>
                      Company Projects
                    </h2>
                    <p className={styles.panelSub}>All projects currently managed by your organization.</p>
                  </div>
                  <IconBriefcase width={22} height={22} className={styles.panelIcon} />
                </div>
                <div className={styles.panelBody}>
                  <DataTable bare caption="Company projects" columns={[...COLUMNS, actionsColumn(setEditing, setDeleting)]} rows={shown} rowKey={(row) => row.id} />
                </div>
              </section>
            )}
          </>
        )
      )}

      <ProjectModal
        open={creating || Boolean(editing)}
        project={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={(updated) => {
          toast(updated ? 'Project updated' : 'Project created');
          reload();
        }}
      />
      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete project?"
        text={deleting ? `"${deleting.title}" and its team will be removed. This can't be undone.` : ''}
        confirmLabel="Delete Project"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await deleteProject(deleting.id);
          toast('Project deleted');
          reload();
        }}
      />
    </div>
  );
}

function actionsColumn(onEdit, onDelete) {
  return {
    key: 'actions',
    header: 'Actions',
    render: (row) => (
      <div className={styles.rowActions}>
        <Button variant="secondary" icon={IconPencil} iconOnly onClick={() => onEdit(row)} aria-label={`Edit ${row.title}`}>
          Edit
        </Button>
        <Button variant="secondary" icon={IconTrash} iconOnly onClick={() => onDelete(row)} aria-label={`Delete ${row.title}`}>
          Delete
        </Button>
      </div>
    ),
  };
}

/** Today's date in the browser's time zone, as YYYY-MM-DD (what a date field holds). */
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Create a project, or (with `project`) edit one. The admin sets the start date and the deadline. Once created, the
 * title cannot change; the start date is fixed once the Team Leader starts the project; the deadline can always move.
 */
function ProjectModal({ open, project, onClose, onSaved }) {
  const editing = Boolean(project);
  const form = useModalForm(
    open,
    { title: project?.title ?? '', description: project?.description ?? '', clientId: project?.clientId ?? '', teamLeaderId: project?.teamLeaderId ?? '', startDate: project?.startDate ?? '', deadline: project?.deadline ?? '' },
    project?.id ?? 'new',
  );
  const [clients, setClients] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [leadersFull, setLeadersFull] = useState(0); // Team Leaders hidden because they are at their project limit
  // the start date is fixed once the project has started (or ended)
  const startFixed = editing && project.lifecycle !== 'not_started';

  // the two lists are loaded each time the window opens
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    Promise.all([listClients(), listEmployees()])
      .then(([c, e]) => {
        if (!alive) return;
        // the email too, so two clients with the same name can be told apart
        setClients(c.map((x) => ({ value: x.id, label: x.email ? `${x.name} (${x.email})` : x.name })));
        // a Team Leader already on as many projects as their limit can't take another one
        // (the project's own Team Leader stays in the list when editing)
        const full = (x) => x.maxProjects != null && x.currentProjects >= x.maxProjects && x.id !== project?.teamLeaderId;
        const all = e.filter((x) => x.teamLeader);
        setLeaders(all.filter((x) => !full(x)).map((x) => ({ value: x.id, label: x.maxProjects != null ? `${x.email} (${x.currentProjects} of ${x.maxProjects} projects)` : x.email })));
        setLeadersFull(all.filter(full).length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, project?.teamLeaderId]);

  const submit = async (event) => {
    event.preventDefault();
    const { values } = form;
    const errors = {};
    if (!values.title.trim()) errors.title = 'Enter a project title.';
    if (!values.clientId) errors.clientId = 'Choose a client.';
    if (!values.teamLeaderId) errors.teamLeaderId = 'Choose a Team Leader.';
    if (!values.startDate) errors.startDate = 'Choose the start date.';
    // a new start date can only be today or later (an unchanged one on an existing project is left as it is)
    else if (!startFixed && values.startDate < todayIso() && values.startDate !== (project?.startDate ?? '')) errors.startDate = 'The start date cannot be in the past. Choose today or a later day.';
    if (!values.deadline) errors.deadline = 'Choose the deadline.';
    else if (values.startDate && values.deadline < values.startDate) errors.deadline = 'The deadline cannot be before the start date.';
    form.setErrors(errors);
    if (Object.keys(errors).length) return form.focusFirstInvalid();
    form.setBusy(true);
    try {
      const body = {
        title: editing ? project.title : values.title.trim(),
        description: values.description.trim(),
        clientId: editing ? project.clientId : values.clientId,
        teamLeaderId: values.teamLeaderId,
        startDate: startFixed ? undefined : values.startDate,
        deadline: values.deadline,
      };
      if (editing) await updateProject(project.id, body);
      else await createProject(body);
      onSaved(editing);
      onClose();
    } catch (error) {
      form.setFormError(error.message);
      form.setBusy(false);
    }
    return undefined;
  };

  return (
    <Modal open={open} onClose={onClose} icon={IconBriefcase} title={editing ? 'Edit Project' : 'Create Project'} subtitle={editing ? 'Change the description, Team Leader or deadline.' : 'Create a production project: its client, Team Leader, start date and deadline.'}>
      <form onSubmit={submit} noValidate>
        <TextField
          id="project-title"
          label="Project Title"
          placeholder="Enter project title"
          value={form.values.title}
          onChange={form.set('title')}
          error={form.errors.title}
          hint={editing ? 'The title cannot be changed once the project is created.' : undefined}
          readOnly={editing}
          disabled={form.busy || editing}
        />
        <TextField
          id="project-description"
          label="Description"
          optionalMark
          multiline
          rows={4}
          placeholder="Describe the production project"
          value={form.values.description}
          onChange={form.set('description')}
          disabled={form.busy}
        />
        <SelectField
          id="project-client"
          label="Client"
          icon={IconBuilding}
          placeholder="Select client"
          options={clients}
          value={form.values.clientId}
          onChange={form.set('clientId')}
          error={form.errors.clientId}
          emptyText="No clients yet. Add one on the Clients page."
          hint={editing ? 'The client cannot be changed once the project is created.' : undefined}
          disabled={form.busy || editing}
        />
        <SelectField
          id="project-leader"
          label="Team Leader"
          icon={IconUserCog}
          placeholder="Select Team Leader"
          options={leaders}
          value={form.values.teamLeaderId}
          onChange={form.set('teamLeaderId')}
          error={form.errors.teamLeaderId}
          emptyText={leadersFull ? 'Every Team Leader is at their project limit. Raise a limit on the Employees page.' : 'No Team Leaders yet. Mark an employee as a Team Leader on the Employees page.'}
          hint={leadersFull ? `${leadersFull} Team Leader${leadersFull === 1 ? ' is' : 's are'} at the project limit and not shown.` : undefined}
          disabled={form.busy}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0 14px' }}>
          <TextField
            id="project-start"
            label="Start Date"
            type="date"
            min={startFixed ? undefined : todayIso()}
            value={form.values.startDate}
            onChange={form.set('startDate')}
            error={form.errors.startDate}
            hint={startFixed ? 'Fixed: the project has started.' : undefined}
            disabled={form.busy || startFixed}
          />
          <TextField
            id="project-deadline"
            label="Deadline"
            type="date"
            min={form.values.startDate || undefined}
            value={form.values.deadline}
            onChange={form.set('deadline')}
            error={form.errors.deadline}
            hint={editing ? 'You can move the deadline at any time.' : undefined}
            disabled={form.busy}
          />
        </div>
        {form.formError && (
          <p className={styles.formError} role="alert">
            {form.formError}
          </p>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" icon={editing ? IconPencil : IconPlus} loading={form.busy}>
            {editing ? 'Save Changes' : 'Create Project'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
