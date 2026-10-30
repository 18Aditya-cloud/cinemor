import { useEffect, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import Button from '../ui/Button.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import timeAgo from '../timeAgo.js';
import { IconBook, IconCheck, IconChevronLeft, IconFilm, IconImage, IconPencil, IconPlus, IconStoryboard, IconTrash, IconUser } from '../ui/DashIcons.jsx';
import Modal from '../ui/Modal.jsx';
import Notice from '../ui/Notice.jsx';
import { forgetPlaces } from '../CommandPalette.jsx';
import { Chip, CoverArt, Dot, palette, Ring, StageIcon, stageColor } from '../ui/Production.jsx';
import { useToast } from '../ui/Toast.jsx';
import {
  deleteProject,
  getCharacterRecords,
  getLocationRecords,
  getProject,
  getProjectStory,
  getSceneSketches,
  isLive,
  listOneClickFilms,
  listProjectStories,
  listStoryboards,
  listVideoClips,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  setProjectBuildMode,
  setProjectStatus,
  STORY_SOURCES,
} from './individualApi.js';
import { formatDate, IconArrowRight } from './parts.jsx';
import { IconBolt, IconChats, IconLayers } from './StoryIcons.jsx';
import s from './Individual.module.css';
import x from './ProjectPage.module.css';

// The creative modules, in production order (each has its stage colour).
const MODULES = [
  { id: 'story', title: 'Story', text: 'Create with AI or import your story, then edit it.', icon: IconBook },
  { id: 'storyboard', title: 'Storyboard', text: 'Scenes, dialogue, characters, places and objects.', icon: IconStoryboard },
  { id: 'characters', title: 'Characters', text: 'A profile and a master image for every character.', icon: IconUser },
  { id: 'environment', title: 'Environment', text: 'A profile and a master image for every place.', icon: IconImage },
  { id: 'sketches', title: 'Sketches', text: 'A sketch for every scene of your story.', icon: IconPencil },
  { id: 'animation', title: 'AI Animation', text: 'A clip for every scene, then your film.', icon: IconFilm },
];

// The two ways to build a project.
const BUILD_OPTIONS = [
  { id: 'layers', title: 'Layer by layer', text: 'Full control, one module at a time', icon: IconLayers, color: 'brand' },
  { id: 'oneclick', title: 'One-click generation', text: 'Describe it once, get a finished film', icon: IconBolt, color: 'story' },
];

const STATUS_COLORS = { pending: 'storyboard', active: 'warn', completed: 'ok', aborted: 'red' };

const storyPath = (projectId) => `/dashboard/projects/${projectId}/story`;
const generatePath = (projectId) => `/dashboard/projects/${projectId}/generate`;
const editorPath = (projectId, storyId) => `/dashboard/projects/${projectId}/stories/${storyId}/edit`;
const modulePath = (projectId, id) => (id === 'story' ? storyPath(projectId) : `/dashboard/projects/${projectId}/${id}`);

const quiet = (promise) => Promise.resolve(promise).catch(() => null);
const imageOf = (record) => {
  const im = record?.images;
  if (!im) return null;
  return (im.active === 'uploaded' ? im.uploaded?.src : im.master?.src) || im.master?.src || im.uploaded?.src || null;
};

/**
 * Everything the production line shows, per module: how far it is and a few images. Read from what the project's
 * stories already have (storyboards, characters, places, sketches, clips). The storyboards come first; the images and
 * counts follow.
 */
function useProduction(projectId, stories) {
  const [boards, setBoards] = useState(null);
  const [deep, setDeep] = useState(null);

  useEffect(() => {
    if (!stories) return undefined;
    let live = true;
    setDeep(null);
    (async () => {
      const sbs = (await quiet(listStoryboards(projectId))) || [];
      if (!live) return;
      setBoards(sbs);
      const per = await Promise.all(
        sbs.map(async ({ storyId }) => {
          const [chars, places, sketches, clips] = await Promise.all([
            quiet(getCharacterRecords(projectId, storyId)),
            quiet(getLocationRecords(projectId, storyId)),
            quiet(getSceneSketches(projectId, storyId)),
            quiet(listVideoClips(projectId, storyId)),
          ]);
          return { chars: Object.values(chars || {}), places: Object.values(places || {}), sketches: Object.values(sketches || {}), clips: clips || [] };
        }),
      );
      if (!live) return;
      const sum = { chars: 0, charsDone: 0, places: 0, placesDone: 0, scenes: 0, sketched: 0, clipped: 0, charImages: [], placeImages: [], sketchImages: [] };
      per.forEach((r) => {
        sum.chars += r.chars.length;
        sum.places += r.places.length;
        r.chars.forEach((c) => {
          const src = imageOf(c);
          if (!src) return;
          sum.charsDone += 1;
          sum.charImages.push({ src, alt: c.name });
        });
        r.places.forEach((l) => {
          const src = imageOf(l);
          if (!src) return;
          sum.placesDone += 1;
          sum.placeImages.push({ src, alt: l.name });
        });
        sum.scenes += r.sketches.length;
        r.sketches.forEach((rec, i) => {
          const made = rec?.sketches || [];
          if (!made.length) return;
          sum.sketched += 1;
          const chosen = made.find((k) => k.id === rec.selected) || made[0];
          if (chosen?.src) sum.sketchImages.push({ src: chosen.src, alt: `Sketch of scene ${i + 1}` });
        });
        sum.clipped += new Set(r.clips.filter((c) => c.status === 'generated').map((c) => c.sceneId)).size;
      });
      setDeep(sum);
    })();
    return () => {
      live = false;
    };
  }, [projectId, stories]);

  return { boards, deep };
}

/** How each module stands: { state: done | now | todo | lock | loading, stat, value (0..1), count, images }. */
export function moduleStates(stories, boards, deep) {
  const n = stories?.length || 0;
  const b = boards ? boards.length : null;
  const scenes = boards ? boards.reduce((t, sb) => t + (sb.scenes || 0), 0) : 0;
  const frac = (done, total) => (total ? done / total : 0);
  const stateOf = (done, total) => (total > 0 && done >= total ? 'done' : done > 0 ? 'now' : 'todo');
  const locked = (text) => ({ state: 'lock', stat: 'Locked', value: 0, lockText: text });
  const out = {
    story: { state: n ? 'done' : 'todo', stat: n ? `${n} ${n === 1 ? 'story' : 'stories'}` : 'No story yet', value: n ? 1 : 0, count: `${n}` },
  };
  if (!stories) out.story = { state: 'loading', stat: 'Checking…', value: 0 };
  if (!n && stories) out.storyboard = locked('Needs a story first');
  else if (b == null) out.storyboard = { state: 'loading', stat: 'Checking…', value: 0 };
  else out.storyboard = { state: stateOf(b, n), stat: b ? `${scenes} ${scenes === 1 ? 'scene' : 'scenes'}${n > 1 ? ` · ${b} of ${n} stories` : ''}` : 'Not made yet', value: frac(b, n), count: `${b}/${n}` };

  const noBoard = b === 0;
  if (noBoard || (stories && !n)) {
    ['characters', 'environment', 'sketches'].forEach((k) => {
      out[k] = locked('Needs a storyboard first');
    });
    out.animation = locked('Needs a sketch first');
    return out;
  }
  if (!deep) {
    ['characters', 'environment', 'sketches', 'animation'].forEach((k) => {
      out[k] = { state: 'loading', stat: 'Checking…', value: 0 };
    });
    return out;
  }
  out.characters = { state: stateOf(deep.charsDone, deep.chars), stat: deep.chars ? `${deep.charsDone} of ${deep.chars} with a look` : 'No characters found', value: frac(deep.charsDone, deep.chars), count: `${deep.charsDone}/${deep.chars}`, images: deep.charImages };
  out.environment = { state: stateOf(deep.placesDone, deep.places), stat: deep.places ? `${deep.placesDone} of ${deep.places} with a look` : 'No places found', value: frac(deep.placesDone, deep.places), count: `${deep.placesDone}/${deep.places}`, images: deep.placeImages };
  out.sketches = { state: stateOf(deep.sketched, deep.scenes), stat: deep.scenes ? `${deep.sketched} of ${deep.scenes} scenes` : 'No scenes yet', value: frac(deep.sketched, deep.scenes), count: `${deep.sketched}/${deep.scenes}`, images: deep.sketchImages };
  out.animation =
    deep.sketched === 0
      ? locked('Needs a sketch first')
      : { state: stateOf(deep.clipped, deep.scenes), stat: `${deep.clipped} of ${deep.scenes} scenes have a clip`, value: frac(deep.clipped, deep.scenes), count: `${deep.clipped}/${deep.scenes}` };
  return out;
}

/**
 * One project, for its creator: a banner (title, description, status switch, Edit / Delete); how to build it
 * ("Layer by layer" shows the production line of six modules, "One-click generation" opens the workshop); the stories
 * (each opens in a reader, with Open Chat and Edit Story); and on the side its timeline, progress and recent work.
 */
export default function ProjectPage({ projectId }) {
  const toast = useToast();
  const { navigate } = useRouter();
  const { data: project, error, reload } = useResource(() => getProject(projectId), [projectId]);
  const stories = useResource(() => listProjectStories(projectId), [projectId]);
  // the newest one-click film (made on the server), for the One-click workshop card
  const films = useResource(() => (isLive ? listOneClickFilms(projectId).catch(() => []) : Promise.resolve([])), [projectId]);
  const { boards, deep } = useProduction(projectId, stories.data);
  const [reading, setReading] = useState(null); // the story open in the reader (its summary)
  const [deleting, setDeleting] = useState(false);
  const [changing, setChanging] = useState(null); // the status being saved
  const [mode, setMode] = useState(null); // the way of building, once the project has loaded
  useEffect(() => {
    if (project) setMode(project.buildMode || null);
  }, [project]);
  useDocumentTitle(project?.title || 'Project');

  const chooseMode = async (next) => {
    setMode(next);
    try {
      await setProjectBuildMode(project.id, next);
    } catch (err) {
      toast(err.message, 'error');
    }
    if (next === 'oneclick') navigate(generatePath(project.id));
  };

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

  // a project that does not exist (deleted, or another account's): say so, and drop it from the search's recent places
  const missing = error?.status === 404;
  useEffect(() => {
    if (missing) forgetPlaces(`/dashboard/projects/${projectId}`);
  }, [missing, projectId]);

  const backLink = (
    <Link to="/dashboard/projects" className={s.back}>
      <IconChevronLeft width={16} height={16} /> My Projects
    </Link>
  );

  if (!project) {
    return (
      <div className={s.page} aria-busy={!error}>
        {backLink}
        {missing ? (
          <Notice message="This project isn't available. It may have been deleted, or it belongs to another account." />
        ) : (
          error && <Notice message={error.message} onRetry={reload} />
        )}
      </div>
    );
  }

  const client = project.projectType === 'client';
  const latestFilm = films.data?.[0] || null; // the newest one-click film, if any
  const filmState = (f) => (f.status === 'done' ? 'ready' : ['queued', 'running'].includes(f.status) ? 'being made' : f.status === 'cancelled' ? 'stopped' : 'not finished');
  const states = moduleStates(stories.data, boards, deep);
  const focus = MODULES.find((m) => ['now', 'todo'].includes(states[m.id]?.state))?.id;
  const progress = Math.round((MODULES.reduce((t, m) => t + (states[m.id]?.value || 0), 0) / MODULES.length) * 100);
  const recent = [
    ...(stories.data || []).map((st) => ({ key: `s${st.id}`, color: 'story', icon: IconBook, text: `Story “${st.title}” updated`, at: st.updatedAt })),
    ...(boards || []).map((sb) => ({ key: `b${sb.storyId}`, color: 'storyboard', icon: IconStoryboard, text: `Storyboard of “${sb.storyTitle}” saved`, at: sb.updatedAt })),
  ]
    .filter((r) => r.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 4);

  return (
    <div className={cx(s.page, palette)}>
      {backLink}

      {/* ------------------------------------------------------------------ the banner */}
      <CoverArt seed={`p${project.id}`} className={x.banner}>
        <div className={x.bannerText}>
          <p className={x.bannerEyebrow}>{client ? `${PROJECT_TYPES.client}${project.clientName ? ` · ${project.clientName}` : ''}` : PROJECT_TYPES.personal}</p>
          <h1 className={x.bannerTitle}>{project.title}</h1>
          <p className={x.bannerLead}>{project.description || 'No description yet. Use Edit to add one.'}</p>
        </div>
        <div className={x.statusSwitch} role="group" aria-label="Project status">
          {Object.entries(PROJECT_STATUSES).map(([id, st]) => {
            const on = project.status === id;
            return (
              <button key={id} type="button" className={cx(x.statusOption, on && x.statusOn)} aria-pressed={on} disabled={Boolean(changing)} onClick={() => changeStatus(id)}>
                <Dot color={STATUS_COLORS[id]} />
                {changing === id ? 'Saving…' : st.label}
              </button>
            );
          })}
        </div>
        <div className={x.bannerButtons}>
          <button type="button" className={x.glassButton} onClick={() => navigate(`/dashboard/projects/${project.id}/edit`)}>
            <IconPencil width={16} height={16} /> Edit
          </button>
          <button type="button" className={cx(x.glassButton, x.glassDanger)} onClick={() => setDeleting(true)} aria-label="Delete project" title="Delete project">
            <IconTrash width={16} height={16} />
          </button>
        </div>
      </CoverArt>

      <div className={x.layout}>
        <div className={x.main}>
          {/* ------------------------------------------------------------------ how to build */}
          <div className={x.buildRow} role="group" aria-label="How do you want to build?">
            {BUILD_OPTIONS.map((option) => {
              const on = mode === option.id;
              return (
                <button key={option.id} type="button" className={cx(x.buildTile, on && x.buildOn)} aria-pressed={on} onClick={() => chooseMode(option.id)}>
                  <StageIcon color={option.color} icon={option.icon} />
                  <span className={x.buildText}>
                    <b>{option.title}</b>
                    <span>{option.text}</span>
                  </span>
                  <span className={x.buildCheck} aria-hidden="true">
                    {on && <IconCheck width={14} height={14} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
          {!mode && <p className={x.hint}>Choose how you want to build this project. You can switch at any time.</p>}

          {mode === 'layers' && (
            <section aria-labelledby="ind-line">
              <div className={x.sectionHead}>
                <h2 id="ind-line" className={x.sectionTitle}>
                  Your production line
                </h2>
                <span className={x.muted}>Each module opens when the one before it has work</span>
              </div>
              <ul className={x.modules}>
                {MODULES.map((m) => (
                  <ModuleCard key={m.id} module={m} st={states[m.id]} focus={focus === m.id} onOpen={() => navigate(modulePath(project.id, m.id))} />
                ))}
              </ul>
            </section>
          )}

          {mode === 'oneclick' && (
            <div className={cx(x.card, x.workshop)}>
              <StageIcon color="story" icon={IconBolt} />
              <span className={x.workshopText}>
                <b>One-click workshop</b>
                <span className={x.muted}>
                  {latestFilm ? `Your film${latestFilm.story ? `: ${latestFilm.story.title}` : ''}, ${filmState(latestFilm)}, ${timeAgo(latestFilm.updatedAt)}` : 'Describe your idea and get a finished film.'}
                </span>
              </span>
              <Button icon={IconBolt} onClick={() => navigate(generatePath(project.id))}>
                {latestFilm ? 'Open Workshop' : 'Start Generating'}
              </Button>
            </div>
          )}

          {/* ------------------------------------------------------------------ stories */}
          <section className={cx(x.card, x.stories)} aria-labelledby="ind-stories">
            <div className={x.sectionHead}>
              <h2 id="ind-stories" className={x.sectionTitle}>
                Stories
              </h2>
              {stories.data?.length > 0 && (
                <Button variant="secondary" icon={IconPlus} onClick={() => navigate(storyPath(project.id))}>
                  New Story
                </Button>
              )}
            </div>
            {stories.error ? (
              <Notice message={stories.error.message} onRetry={stories.reload} />
            ) : !stories.data ? (
              <p className={x.muted}>Loading stories...</p>
            ) : stories.data.length === 0 ? (
              <div className={s.storyEmpty}>
                <p className={s.storyEmptyTitle}>No stories yet</p>
                <p className={s.muted}>Create one with AI, or import a story you have already written.</p>
                <Button icon={IconPlus} onClick={() => navigate(storyPath(project.id))}>
                  Create Story
                </Button>
              </div>
            ) : (
              <ul className={x.storyList} aria-label="Stories">
                {stories.data.map((story) => (
                  <li key={story.id} className={x.storyItem}>
                    <CoverArt seed={`s${story.id}`} sun={false} className={x.storyArt} />
                    <span className={x.storyText}>
                      <span className={x.storyTitle}>{story.title}</span>
                      <span className={x.storyMeta}>
                        <Chip color={story.source === 'import' ? 'storyboard' : 'brand'}>{STORY_SOURCES[story.source]}</Chip>
                        <span>{story.words.toLocaleString('en-IN')} words</span>
                        <span>
                          {story.versionCount} {story.versionCount === 1 ? 'version' : 'versions'}
                        </span>
                        <span>Updated {timeAgo(story.updatedAt)}</span>
                      </span>
                    </span>
                    <button type="button" className={x.storyOpen} onClick={() => setReading(story)} aria-label={`Open Story: ${story.title}`}>
                      Open Story <IconArrowRight width={16} height={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ------------------------------------------------------------------ the side */}
        <aside className={x.side} aria-label="Project timeline and progress">
          <Timeline project={project} client={client} />
          <section className={cx(x.card, x.sideCard)} aria-labelledby="ind-progress">
            <h2 id="ind-progress" className={x.cardTitle}>
              Progress
            </h2>
            <div className={x.progress}>
              <Ring value={progress} label={`${progress}%`} sub="done" size={100} />
              <ul className={x.legend}>
                {MODULES.map((m) => (
                  <li key={m.id}>
                    <Dot color={m.id} />
                    <span>{m.title}</span>
                    <b>{states[m.id]?.state === 'lock' ? '–' : states[m.id]?.count ?? '…'}</b>
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <section className={cx(x.card, x.sideCard)} aria-labelledby="ind-recent">
            <h2 id="ind-recent" className={x.cardTitle}>
              Recent
            </h2>
            {recent.length === 0 ? (
              <p className={x.muted}>Nothing yet. Your work shows up here.</p>
            ) : (
              <ul className={x.recent}>
                {recent.map((r) => (
                  <li key={r.key}>
                    <StageIcon color={r.color} icon={r.icon} small />
                    <span>
                      <b>{r.text}</b>
                      <span className={x.muted}>{timeAgo(r.at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
          forgetPlaces(`/dashboard/projects/${project.id}`);
          toast('Project deleted');
          navigate('/dashboard/projects', { replace: true });
        }}
      />
    </div>
  );
}

/** One module of the production line: its colour, where it stands, a few images, and Open / Continue. */
function ModuleCard({ module: m, st, focus, onOpen }) {
  const state = st?.state || 'loading';
  const locked = state === 'lock';
  const chip =
    state === 'done' ? (
      <Chip color="ok" icon={IconCheck}>
        Done
      </Chip>
    ) : state === 'now' ? (
      <Chip color={m.id}>In progress</Chip>
    ) : state === 'todo' ? (
      <Chip color="gray">Ready to start</Chip>
    ) : locked ? (
      <Chip color="gray">Locked</Chip>
    ) : null;
  // the module cards show no pictures, only their count and progress
  const images = [];
  return (
    <li className={cx(x.module, stageColor(m.id), focus && x.moduleFocus, locked && x.moduleLocked)}>
      <span className={x.moduleStripe} aria-hidden="true" />
      <div className={x.moduleTop}>
        <StageIcon color={m.id} icon={m.icon} />
        {chip}
      </div>
      <h3 className={x.moduleTitle}>{m.title}</h3>
      <p className={x.moduleText}>{locked && st?.lockText ? st.lockText : m.text}</p>
      {images.length > 0 && (
        <div className={x.thumbs}>
          {images.map((im) => (
            <img key={im.src} src={im.src} alt={im.alt} className={x.thumb} loading="lazy" />
          ))}
        </div>
      )}
      {state === 'now' && st?.value > 0 && (
        <div className={x.moduleBar} aria-hidden="true">
          <i style={{ width: `${Math.round(st.value * 100)}%` }} />
        </div>
      )}
      <div className={x.moduleFoot}>
        <span className={x.moduleStat}>{st?.stat || 'Checking…'}</span>
        {!locked && (
          <Button variant={focus ? 'primary' : 'secondary'} onClick={onOpen} aria-label={`Open ${m.title}`}>
            {focus ? (state === 'now' ? 'Continue' : 'Start') : 'Open'}
          </Button>
        )}
      </div>
    </li>
  );
}

/** Start date, today and deadline on one line, and what kind of project it is. */
function Timeline({ project, client }) {
  const parse = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`) : null);
  const start = parse(project.startedDate);
  const end = parse(project.deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = 86400000;
  let pct = null;
  let middle = '';
  if (start && end && end > start) pct = Math.max(0, Math.min(100, ((today - start) / (end - start)) * 100));
  if (start && today < start) middle = `Starts in ${Math.round((start - today) / day)} d`;
  else if (end && today > end) middle = `${Math.round((today - end) / day)} d late`;
  else if (end) middle = `${Math.round((end - today) / day)} days left`;
  else if (start) middle = `Day ${Math.round((today - start) / day) + 1}`;
  const late = end && today > end && !['completed', 'aborted'].includes(project.status);
  return (
    <section className={cx(x.card, x.sideCard)} aria-labelledby="ind-timeline">
      <h2 id="ind-timeline" className={x.cardTitle}>
        Timeline
      </h2>
      <div className={x.track} aria-hidden="true">
        {pct != null && <i style={{ width: `${pct}%` }} />}
        {pct != null && <span style={{ left: `${pct}%` }} />}
      </div>
      <div className={x.trackLabels}>
        <span>
          <span className={x.muted}>Start</span>
          <b>{formatDate(project.startedDate) || 'Not set'}</b>
        </span>
        {middle && (
          <span className={x.trackMiddle}>
            <span className={x.muted}>Today</span>
            <b className={late ? x.late : x.today}>{middle}</b>
          </span>
        )}
        <span className={x.trackEnd}>
          <span className={x.muted}>Deadline</span>
          <b>{formatDate(project.deadline) || 'Not set'}</b>
        </span>
      </div>
      <p className={x.kind}>
        {client ? (
          <>
            Client project · <b>{project.clientName || '-'}</b>
          </>
        ) : (
          'Personal project'
        )}
      </p>
    </section>
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