import { useEffect, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import Button from '../ui/Button.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import timeAgo from '../timeAgo.js';
import { IconBook, IconCheck, IconChevronLeft, IconFilm, IconImage, IconPencil, IconPlus, IconProjects, IconSparkles, IconStoryboard, IconTrash, IconUser, IconUsers } from '../ui/DashIcons.jsx';
import Modal from '../ui/Modal.jsx';
import Notice from '../ui/Notice.jsx';
import { useToast } from '../ui/Toast.jsx';
import { deleteProject, getProject, getProjectStory, listProjectStories, PROJECT_STATUSES, PROJECT_TYPES, setProjectBuildMode, setProjectStatus, STORY_SOURCES } from './individualApi.js';
import { formatDate, IconArrowRight, IconCalendar, StatusPill, Tile } from './parts.jsx';
import { IconBolt, IconChats, IconLayers } from './StoryIcons.jsx';
import s from './Individual.module.css';

// The creative modules. Only Story has its page so far; the others say they are coming.
const MODULES = [
  { id: 'story', title: 'Story', text: 'Create with AI or import your story, then edit it.', icon: IconBook, ready: true },
  { id: 'storyboard', title: 'Storyboard', text: 'Break your story into characters, scenes, dialogue, places and objects.', icon: IconStoryboard, ready: true },
  { id: 'characters', title: 'Characters', text: 'Give every character a profile and a master image.', icon: IconUsers, ready: true },
  { id: 'environment', title: 'Environment', text: 'Give every place in the story a profile and a master image.', icon: IconImage, ready: true },
  { id: 'sketches', title: 'Sketch', text: 'Sketch every scene of your story.', icon: IconPencil, ready: true },
  { id: 'animation', title: 'AI Animation', text: 'Turn every scene into a video clip, then join them into your film.', icon: IconFilm, ready: true },
];

// The two ways to build a project, chosen at the top of the project page.
const BUILD_OPTIONS = [
  {
    id: 'layers',
    title: 'Layer by layer',
    text: 'Build one part at a time: story, storyboard, characters, environment, sketches and animation. Full control over every layer.',
    note: '6 creative modules',
    icon: IconLayers,
  },
  {
    id: 'oneclick',
    title: 'One-click generation',
    text: 'Describe your idea once. Cinemor builds a complete first draft for you in the workshop.',
    note: 'Fastest way to start',
    icon: IconBolt,
  },
];

const storyPath = (projectId) => `/dashboard/projects/${projectId}/story`;
const generatePath = (projectId) => `/dashboard/projects/${projectId}/generate`;
const editorPath = (projectId, storyId) => `/dashboard/projects/${projectId}/stories/${storyId}/edit`;

// What each status means, shown under its name in "Project Status".
const STATUS_HINTS = {
  pending: 'Not started yet',
  active: 'Work is in progress',
  completed: 'Finished and delivered',
  aborted: 'Stopped, not going ahead',
};

/**
 * One project: what it is; how to build it ("Layer by layer" shows the Creative Modules, "One-click generation" opens
 * the workshop); the project's stories (each opens in a reader, with Open Chat and Edit Story); its status (which can be
 * changed here); its details; and Edit / Delete.
 */
export default function ProjectPage({ projectId }) {
  const toast = useToast();
  const { navigate } = useRouter();
  const { data: project, error, reload } = useResource(() => getProject(projectId), [projectId]);
  const stories = useResource(() => listProjectStories(projectId), [projectId]);
  const [reading, setReading] = useState(null); // the story open in the reader (its summary)
  const [deleting, setDeleting] = useState(false);
  const [changing, setChanging] = useState(null); // the status being saved
  const [mode, setMode] = useState(null); // the way of building, once the project has loaded
  useEffect(() => {
    if (project) setMode(project.buildMode || null);
  }, [project]);

  const chooseMode = async (next) => {
    setMode(next);
    try {
      await setProjectBuildMode(project.id, next);
    } catch (err) {
      toast(err.message, 'error');
    }
    if (next === 'oneclick') navigate(generatePath(project.id));
  };
  useDocumentTitle(project?.title || 'Project');

  const changeStatus = async (status) => {
    if (!project || status === project.status || changing) return;
    setChanging(status);
    try {
      await setProjectStatus(project.id, status);
      toast(`Project marked ${PROJECT_STATUSES[status].label}`);
      await reload();
    } catch (err) {
      toast(err.message, 'error');
    }
    setChanging(null);
  };

  const backLink = (
    <Link to="/dashboard/projects" className={s.back}>
      <IconChevronLeft width={16} height={16} /> Back to Projects
    </Link>
  );

  if (!project) {
    return (
      <div className={s.page} aria-busy={!error}>
        {backLink}
        {error && <Notice message={error.message} onRetry={reload} />}
      </div>
    );
  }

  const client = project.projectType === 'client';
  const oneClickDraft = stories.data?.find((st) => st.oneClick); // the newest one-click draft, if any

  return (
    <div className={s.page}>
      {backLink}
      <div className={s.projectHead}>
        <div className={s.projectTitleRow}>
          <Tile icon={IconProjects} size="lg" />
          <div style={{ minWidth: 0 }}>
            <h1 className={s.projectTitle}>{project.title}</h1>
            <div className={s.projectTags}>
              <StatusPill status={project.status} />
              <span>{client ? `Client Project${project.clientName ? ` · ${project.clientName}` : ''}` : PROJECT_TYPES.personal}</span>
            </div>
          </div>
        </div>
        <div className={s.headButtons}>
          <Button variant="secondary" icon={IconPencil} onClick={() => navigate(`/dashboard/projects/${project.id}/edit`)}>
            Edit
          </Button>
          <Button variant="danger" icon={IconTrash} onClick={() => setDeleting(true)}>
            Delete
          </Button>
        </div>
      </div>

      <div className={s.detailLayout}>
        <div className={s.formMain}>
          <section className={cx(s.card, s.panel)} aria-labelledby="ind-overview">
            <div className={s.panelHead}>
              <Tile icon={IconProjects} />
              <div>
                <h2 id="ind-overview" className={s.panelTitle}>
                  Project Overview
                </h2>
                <p className={s.panelSub}>Basic information about this project.</p>
              </div>
            </div>
            <p className={s.description}>{project.description || <span className={s.muted}>No description yet. Use Edit to add one.</span>}</p>
          </section>

          <section className={cx(s.card, s.panel)} aria-labelledby="ind-build">
            <div className={s.panelHead}>
              <Tile icon={IconSparkles} />
              <div>
                <h2 id="ind-build" className={s.panelTitle}>
                  How do you want to build?
                </h2>
                <p className={s.panelSub}>Pick one. You can switch at any time.</p>
              </div>
            </div>
            <div className={s.buildOptions} role="group" aria-labelledby="ind-build">
              {BUILD_OPTIONS.map((option) => {
                const on = mode === option.id;
                return (
                  <button key={option.id} type="button" className={cx(s.buildOption, on && s.buildOn)} aria-pressed={on} onClick={() => chooseMode(option.id)}>
                    <span className={s.buildTop}>
                      <span className={s.buildIcon} aria-hidden="true">
                        <option.icon width={22} height={22} />
                      </span>
                      <span className={s.buildCheck} aria-hidden="true">
                        {on && <IconCheck width={13} height={13} strokeWidth={3} />}
                      </span>
                    </span>
                    <span className={s.buildTitle}>{option.title}</span>
                    <span className={s.buildText}>{option.text}</span>
                    <span className={s.buildNote}>
                      {option.note} <IconArrowRight width={14} height={14} aria-hidden="true" />
                    </span>
                  </button>
                );
              })}
            </div>

            {mode === 'layers' && (
              <div className={s.modulesWrap} aria-labelledby="ind-modules" role="region">
                <h3 id="ind-modules" className={s.modulesTitle}>
                  Creative Modules
                </h3>
                <ul className={s.modules}>
                  {MODULES.map((m) => (
                    <li key={m.id} className={cx(s.module, !m.ready && s.moduleSoon)}>
                      <div className={s.moduleTop}>
                        <Tile icon={m.icon} />
                        {m.ready ? (
                          m.id === 'story' && stories.data?.length > 0 && <span className={s.moduleTag}>{stories.data.length === 1 ? '1 story' : `${stories.data.length} stories`}</span>
                        ) : (
                          <span className={cx(s.moduleTag, s.moduleTagSoon)}>Coming soon</span>
                        )}
                      </div>
                      <h4 className={s.moduleTitle}>{m.title}</h4>
                      <p className={s.moduleText}>{m.text}</p>
                      {m.ready ? (
                        <Button onClick={() => navigate(m.id === 'story' ? storyPath(project.id) : `/dashboard/projects/${project.id}/${m.id}`)} aria-label={`Open ${m.title}`}>
                          Open {m.title}
                        </Button>
                      ) : (
                        <Button variant="secondary" onClick={() => toast(`${m.title} is coming soon`)} aria-label={`Open ${m.title}`}>
                          Open
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {mode === 'oneclick' && (
              <div className={s.workshopRow}>
                <span className={s.workshopText}>
                  <span className={s.workshopTitle}>One-click workshop</span>
                  <span className={s.muted}>
                    {oneClickDraft ? `Your draft: ${oneClickDraft.title}, updated ${timeAgo(oneClickDraft.updatedAt)}` : 'Describe your idea and get a full first draft.'}
                  </span>
                </span>
                <Button icon={IconBolt} onClick={() => navigate(generatePath(project.id))}>
                  {oneClickDraft ? 'Open Workshop' : 'Start Generating'}
                </Button>
              </div>
            )}
            {!mode && <p className={s.buildHint}>Choose one to get started.</p>}
          </section>

          <section className={cx(s.card, s.panel)} aria-labelledby="ind-stories">
            <div className={s.panelHead}>
              <Tile icon={IconBook} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 id="ind-stories" className={s.panelTitle}>
                  Stories
                </h2>
                <p className={s.panelSub}>Stories created or uploaded for this project.</p>
              </div>
              {stories.data?.length > 0 && (
                <Button variant="secondary" icon={IconPlus} onClick={() => navigate(storyPath(project.id))}>
                  New Story
                </Button>
              )}
            </div>
            {stories.error ? (
              <Notice message={stories.error.message} onRetry={stories.reload} />
            ) : !stories.data ? (
              <p className={s.muted}>Loading stories...</p>
            ) : stories.data.length === 0 ? (
              <div className={s.storyEmpty}>
                <p className={s.storyEmptyTitle}>No stories yet</p>
                <p className={s.muted}>Create one with AI, or import a story you have already written.</p>
                <Button icon={IconPlus} onClick={() => navigate(storyPath(project.id))}>
                  Create Story
                </Button>
              </div>
            ) : (
              <ul className={s.storyList} aria-label="Stories">
                {stories.data.map((story) => (
                  <li key={story.id} className={s.storyItem}>
                    <span className={s.storyText}>
                      <span className={s.storyTitle}>{story.title}</span>
                      <span className={s.storyMeta}>
                        <span className={cx(s.storySource, story.source === 'import' && s.storySourceImport)}>{STORY_SOURCES[story.source]}</span>
                        <span>{story.words.toLocaleString('en-IN')} words</span>
                        <span>
                          {story.versionCount} {story.versionCount === 1 ? 'version' : 'versions'}
                        </span>
                        <span>Updated {timeAgo(story.updatedAt)}</span>
                      </span>
                    </span>
                    <button type="button" className={s.storyOpen} onClick={() => setReading(story)} aria-label={`Open Story: ${story.title}`}>
                      Open Story <IconArrowRight width={16} height={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className={s.sideStack} aria-label="Project status and details">
          <section className={cx(s.card, s.panel)} aria-labelledby="ind-status">
            <h2 id="ind-status" className={s.panelTitle}>
              Project Status
            </h2>
            <p className={s.panelSub}>Move the project along as the work progresses.</p>
            <div className={s.statusList} role="group" aria-labelledby="ind-status">
              {Object.entries(PROJECT_STATUSES).map(([id, st]) => {
                const on = project.status === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={cx(s.statusOption, s[`status_${st.tone}`], on && s.statusOn)}
                    aria-pressed={on}
                    disabled={Boolean(changing)}
                    onClick={() => changeStatus(id)}
                  >
                    <span className={s.statusDot} aria-hidden="true" />
                    <span className={s.statusText}>
                      <span className={s.statusName}>{st.label}</span>
                      <span className={s.statusHint}>{changing === id ? 'Saving...' : STATUS_HINTS[id]}</span>
                    </span>
                    {on && <IconCheck width={16} height={16} className={s.statusCheck} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </section>

          <section className={cx(s.card, s.panel)} aria-labelledby="ind-details">
            <h2 id="ind-details" className={s.panelTitle}>
              Project Details
            </h2>
            <div className={s.details}>
              <Detail icon={IconCalendar} label="Start Date" value={formatDate(project.startedDate) || 'Not set'} />
              <Detail icon={IconCalendar} label="Deadline" value={formatDate(project.deadline) || 'Not set'} />
              <Detail icon={IconProjects} label="Project Type" value={client ? 'Client' : 'Personal'} />
              {client && <Detail icon={IconUser} label="Client" value={project.clientName || '-'} />}
            </div>
          </section>
        </aside>
      </div>

      <StoryReader
        projectId={project.id}
        story={reading}
        onClose={() => setReading(null)}
        onEdit={(id) => navigate(editorPath(project.id, id))}
        onChat={(id) => navigate(`${storyPath(project.id)}/${id}`)}
      />

      <ConfirmModal
        open={deleting}
        title="Delete project?"
        text={`"${project.title}" will be deleted. This can't be undone.`}
        confirmLabel="Delete Project"
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await deleteProject(project.id);
          toast('Project deleted');
          navigate('/dashboard/projects', { replace: true });
        }}
      />
    </div>
  );
}

function Detail({ icon: Icon, label, value }) {
  return (
    <div className={s.detail}>
      <Icon width={18} height={18} />
      <span>
        <span className={s.detailLabel}>{label}</span>
        <span className={s.detailValue}>{value}</span>
      </span>
    </div>
  );
}

/** A story opened from the Stories list: its title, where it came from, Open Chat, Edit Story, and the full text to read. */
function StoryReader({ projectId, story, onClose, onEdit, onChat }) {
  const [full, setFull] = useState(null);
  const [error, setError] = useState('');
  const [shown, setShown] = useState(story); // stays while the window closes
  if (story && story !== shown) setShown(story);

  useEffect(() => {
    if (!story) return undefined;
    let live = true;
    setFull(null);
    setError('');
    getProjectStory(projectId, story.id).then(
      (result) => live && setFull(result),
      (err) => live && setError(err.message),
    );
    return () => {
      live = false;
    };
  }, [projectId, story]);

  const st = full || shown;
  return (
    <Modal open={Boolean(story)} onClose={onClose} wide title={st?.title || 'Story'} subtitle={st ? `${STORY_SOURCES[st.source]}${st.fileName ? ` · ${st.fileName}` : ''}` : ''} icon={IconBook} divider>
      <div className={s.reader}>
        <div className={s.readerBar}>
          <span className={s.muted}>{full ? `${full.content.trim().split(/\s+/).length.toLocaleString('en-IN')} words · version ${full.versions.length}` : ''}</span>
          <div className={s.readerActions}>
            <Button variant="secondary" icon={IconChats} onClick={() => onChat(st.id)} disabled={!st}>
              Open Chat
            </Button>
            <Button icon={IconPencil} onClick={() => onEdit(st.id)} disabled={!st}>
              Edit Story
            </Button>
          </div>
        </div>
        {error ? (
          <Notice message={error} />
        ) : (
          <div className={s.readerText} tabIndex={0} aria-label="Story text" aria-busy={!full}>
            {full ? full.content : 'Loading...'}
          </div>
        )}
      </div>
    </Modal>
  );
}
