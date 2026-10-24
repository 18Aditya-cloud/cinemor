import { useEffect, useId, useRef, useState } from 'react';
import TextField from '../../components/auth/TextField.jsx';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import Button from '../ui/Button.jsx';
import { IconCheck, IconChevronLeft, IconPlus, IconProjects, IconUser } from '../ui/DashIcons.jsx';
import Notice from '../ui/Notice.jsx';
import SelectField from '../ui/SelectField.jsx';
import { useToast } from '../ui/Toast.jsx';
import { createProject, getProject, listClients, PROJECT_TYPES, updateProject } from './individualApi.js';
import { Header, IconArrowLeft, IconCalendar, IconSave, Tile, today } from './parts.jsx';
import s from './Individual.module.css';

const FOR = [
  { id: 'personal', title: 'Myself', text: 'This is my own personal project.', icon: IconProjects },
  { id: 'client', title: 'Client', text: 'This project is being made for a client.', icon: IconUser },
];

/**
 * Create a project (/dashboard/projects/new): its title and description, who it is for (the creator themself, or one
 * of their clients), and its start date and deadline. A preview card on the right shows what is being made.
 * Edit a project (/dashboard/projects/:id/edit, `projectId` given): its title, description and dates only (who it is
 * for and its status stay as they are); the preview card then shows the title and description.
 */
export default function ProjectFormPage({ projectId = null }) {
  const editing = projectId != null;
  useDocumentTitle(editing ? 'Edit Project' : 'Create Project');
  const uid = useId();
  const toast = useToast();
  const { navigate } = useRouter();
  const { data: clients } = useResource(listClients, []);
  const { data: existing, error: loadError, reload } = useResource(() => (editing ? getProject(projectId) : Promise.resolve(null)), [projectId]);
  const [values, setValues] = useState({ title: '', description: '', projectType: 'personal', clientId: '', startedDate: editing ? '' : today(), deadline: '', status: 'pending' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  // editing: fill the form once the project arrives
  useEffect(() => {
    if (!existing || loaded.current) return;
    loaded.current = true;
    setValues({
      title: existing.title || '',
      description: existing.description || '',
      projectType: existing.projectType || 'personal',
      clientId: existing.clientId ?? '',
      startedDate: existing.startedDate || '',
      deadline: existing.deadline || '',
      status: existing.status || 'pending',
    });
  }, [existing]);

  const set = (key) => (valueOrEvent) => {
    const value = valueOrEvent && valueOrEvent.target ? valueOrEvent.target.value : valueOrEvent;
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
    setFormError('');
  };

  // the email too, so two clients with the same name can be told apart
  const clientOptions = (clients ?? []).map((c) => ({ value: c.id, label: `${c.name}${c.companyName ? `, ${c.companyName}` : ''}${c.email ? ` (${c.email})` : ''}` }));
  const clientName = (clients ?? []).find((c) => String(c.id) === String(values.clientId))?.name;
  const previewFor = values.projectType === 'client' ? (clientName ? `For ${clientName}` : PROJECT_TYPES.client) : PROJECT_TYPES.personal;
  const back = editing ? `/dashboard/projects/${projectId}` : '/dashboard/projects';

  const submit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!values.title.trim()) next.title = 'Enter a project title.';
    if (values.projectType === 'client' && !values.clientId) next.clientId = 'Choose the client this project is for.';
    if (values.startedDate && values.deadline && values.deadline < values.startedDate) next.deadline = 'The deadline can’t be before the start date.';
    setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => document.querySelector('main [aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    try {
      const body = { ...values, clientId: values.projectType === 'client' ? values.clientId : null };
      if (!editing) delete body.status;
      const saved = editing ? await updateProject(projectId, body) : await createProject(body);
      toast(editing ? 'Project updated' : 'Project created');
      navigate(`/dashboard/projects/${saved.id}`);
    } catch (err) {
      setFormError(err.message);
      setBusy(false);
    }
  };

  if (editing && loadError) {
    return (
      <div className={s.page}>
        <Link to="/dashboard/projects" className={s.back}>
          <IconChevronLeft width={16} height={16} /> Back to Projects
        </Link>
        <Notice message={loadError.message} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className={s.page}>
      <Link to={back} className={s.back}>
        {editing ? <IconArrowLeft width={16} height={16} /> : <IconChevronLeft width={16} height={16} />} {editing ? 'Back to Project' : 'Back to Projects'}
      </Link>
      <Header
        eyebrow={null}
        icon={editing ? IconProjects : undefined}
        title={editing ? 'Edit Project' : 'Create Project'}
        subtitle={editing ? 'Update your project information.' : 'Set up your project before starting the Cinemor AI creation workflow.'}
      />

      <form className={s.formLayout} onSubmit={submit} noValidate aria-busy={editing && !existing}>
        <div className={s.formMain}>
          <section className={cx(s.card, s.panel)} aria-labelledby={`${uid}-info`}>
            <div className={s.panelHead}>
              <Tile icon={IconProjects} />
              <div>
                <h2 id={`${uid}-info`} className={s.panelTitle}>
                  Project Information
                </h2>
                <p className={s.panelSub}>{editing ? 'Update the basic information of your project.' : 'Give your project a name and basic information.'}</p>
              </div>
            </div>
            <TextField id={`${uid}-title`} label="Project Title" requiredMark placeholder="e.g. My AI Short Film" value={values.title} onChange={set('title')} error={errors.title} disabled={busy} maxLength={200} />
            <TextField id={`${uid}-desc`} label="Description" optionalMark multiline rows={4} placeholder="Describe your project..." value={values.description} onChange={set('description')} disabled={busy} />
          </section>

          {!editing && (
            <section className={cx(s.card, s.panel)} aria-labelledby={`${uid}-for`}>
              <div className={s.panelHead}>
                <Tile icon={IconUser} />
                <div>
                  <h2 id={`${uid}-for`} className={s.panelTitle}>
                    Project For
                  </h2>
                  <p className={s.panelSub}>Choose whether this project is for you or for a client.</p>
                </div>
              </div>
              <div className={s.two} role="radiogroup" aria-labelledby={`${uid}-for`} style={{ gap: 14 }}>
                {FOR.map((f) => {
                  const on = values.projectType === f.id;
                  return (
                    <label key={f.id} className={cx(s.choice, on && s.choiceOn)}>
                      <input type="radio" name={`${uid}-type`} value={f.id} checked={on} onChange={() => set('projectType')(f.id)} disabled={busy} />
                      <Tile icon={f.icon} size="sm" />
                      <span>
                        <span className={s.choiceTitle}>{f.title}</span>
                        <span className={s.choiceText}>{f.text}</span>
                      </span>
                      <span className={s.choiceCheck} aria-hidden="true">
                        <IconCheck width={14} height={14} strokeWidth={3} />
                      </span>
                    </label>
                  );
                })}
              </div>
              {values.projectType === 'client' && (
                <div className={s.clientPick}>
                  <SelectField
                    id={`${uid}-client`}
                    label="Client"
                    requiredMark
                    icon={IconUser}
                    placeholder="Select client"
                    options={clientOptions}
                    value={values.clientId}
                    onChange={set('clientId')}
                    error={errors.clientId}
                    emptyText="No clients yet. Add one on the Clients page first."
                    disabled={busy}
                  />
                  {clients && clients.length === 0 && (
                    <p className={s.hint}>
                      You have no clients yet.{' '}
                      <Link to="/dashboard/clients" className={s.link}>
                        Add a client
                      </Link>
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          <section className={cx(s.card, s.panel)} aria-labelledby={`${uid}-time`}>
            <div className={s.panelHead}>
              <Tile icon={IconCalendar} />
              <div>
                <h2 id={`${uid}-time`} className={s.panelTitle}>
                  Project Timeline
                </h2>
                <p className={s.panelSub}>{editing ? 'Update the project start date and deadline.' : 'Set the project start date and deadline.'}</p>
              </div>
            </div>
            <div className={s.two}>
              <TextField id={`${uid}-start`} label="Start Date" type="date" value={values.startedDate} onChange={set('startedDate')} disabled={busy} />
              <TextField id={`${uid}-deadline`} label="Deadline" type="date" min={values.startedDate || undefined} value={values.deadline} onChange={set('deadline')} error={errors.deadline} disabled={busy} />
            </div>
          </section>
        </div>

        <aside className={s.side} aria-label="Preview">
          <div className={cx(s.card, s.preview)}>
            <Tile icon={IconProjects} size="lg" />
            <p className={s.previewTitle}>{values.title.trim() || 'Untitled Project'}</p>
            <p className={s.previewFor}>{editing ? 'Update Project' : previewFor}</p>
            {editing && values.description.trim() && <p className={s.previewDesc}>{values.description.trim()}</p>}
          </div>
          {formError && (
            <p className={s.formError} role="alert">
              {formError}
            </p>
          )}
          <div className={s.sideActions}>
            <Button variant="secondary" icon={editing ? IconArrowLeft : undefined} onClick={() => navigate(back)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" icon={editing ? IconSave : IconPlus} loading={busy}>
              {editing ? 'Save Changes' : 'Create Project'}
            </Button>
          </div>
        </aside>
      </form>
    </div>
  );
}
