import { useCallback, useEffect, useId, useRef, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import Button from '../ui/Button.jsx';
import { IconBook, IconCheck, IconFilm, IconImage, IconPlay, IconRefresh, IconSparkles } from '../ui/DashIcons.jsx';
import Notice from '../ui/Notice.jsx';
import { useToast } from '../ui/Toast.jsx';
import CinemorOrb from './CinemorOrb.jsx';
import { download } from './filmExport.js';
import {
  assembleFilm,
  clipUrl,
  downloadFilm,
  filmUrl,
  getProject,
  getSceneSketches,
  getStoryboard,
  isLive,
  latestAnimationJob,
  listAnimationScenes,
  listProjectStories,
  listStoryboards,
  listVideoClips,
  startAnimation,
} from './individualApi.js';
import { IconArrowLeft } from './parts.jsx';
import { IconExport } from './StoryIcons.jsx';
import cs from './CharacterStudio.module.css';
import a from './AnimationStudio.module.css';

/**
 * AI Animation (a Creative Module, "Layer by layer"): every scene of the storyboard becomes a short video clip, and
 * the clips are joined into the film.
 *
 *   /dashboard/projects/:id/animation             picks a story
 *   /dashboard/projects/:id/animation/:storyId    that story's scenes, clips and film
 *
 * The backend does the work (POST .../video-generation): it plans each scene, asks the chosen video model for a clip
 * (using the scene's sketch as the first frame when the model takes one), and joins the clips into one MP4 when every
 * scene has one. This page starts that, follows it while it runs, plays the clips and the film, and can join the
 * clips again (for example after making one scene again).
 */
const base = (projectId) => `/dashboard/projects/${projectId}/animation`;

// the video models the backend offers (app/core/config.py, OPENROUTER_VIDEO_MODELS)
export const VIDEO_MODELS = [
  { id: 'heygen/heygen-video-1', name: 'HeyGen Video 1' },
  { id: 'alibaba/wan-3.0', name: 'Wan 3.0' },
  { id: 'kwaivgi/kling-v3.0-std', name: 'Kling 3.0' },
  { id: 'minimax/hailuo-3-max', name: 'Hailuo 3 Max' },

  { id: 'alibaba/wan-3.0-prime', name: 'Wan 3.0 Prime' },
  { id: 'x-ai/grok-imagine-video-1.5-lite', name: 'Grok Imagine Video 1.5 Lite' },
];

const RUNNING = new Set(['queued', 'planning', 'generating']);
const POLL = 4000;

async function load(projectId) {
  const [project, stories, boards] = await Promise.all([getProject(projectId), listProjectStories(projectId), listStoryboards(projectId)]);
  return { project, stories, boards };
}

export default function AnimationStudioPage({ projectId, storyId = null }) {
  const { navigate } = useRouter();
  const { data, error, reload } = useResource(() => load(projectId), [projectId]);
  useDocumentTitle(data ? `AI Animation: ${data.project.title}` : 'AI Animation');
  const back = `/dashboard/projects/${projectId}`;

  const chosen = data && (data.stories.find((st) => st.id === storyId) ? storyId : data.boards[0]?.storyId ?? data.stories[0]?.id ?? null);
  useEffect(() => {
    if (data && chosen && chosen !== storyId) navigate(`${base(projectId)}/${chosen}`, { replace: true });
  }, [data, chosen, storyId, projectId, navigate]);

  const head = (
    <div className={cs.pageHead}>
      <Link to={back} className={cs.back}>
        <IconArrowLeft width={16} height={16} /> Back to Project
      </Link>
      <div className={cs.titleRow}>
        <h1 className={cs.pageTitle}>AI Animation</h1>
        {data && <p className={cs.pageSub}>{data.project.title}</p>}
      </div>
    </div>
  );

  if (!isLive) {
    return (
      <div className={cs.page}>
        {head}
        <section className={cs.empty}>
          <span className={cs.emptyIcon} aria-hidden="true">
            <IconFilm width={22} height={22} />
          </span>
          <h2 className={cs.emptyTitle}>AI Animation runs on the Cinemor server</h2>
          <p className={cs.emptyText}>Every scene becomes a video clip there, and the clips are joined into your film. Sign in to Cinemor to use it.</p>
        </section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={cs.page} aria-busy={!error}>
        {head}
        {error && <Notice message={error.message} onRetry={reload} />}
      </div>
    );
  }

  if (data.stories.length === 0) {
    return (
      <div className={cs.page}>
        {head}
        <section className={cs.empty}>
          <span className={cs.emptyIcon} aria-hidden="true">
            <IconBook width={22} height={22} />
          </span>
          <h2 className={cs.emptyTitle}>Write a story first</h2>
          <p className={cs.emptyText}>The film is made from a story’s storyboard. Create a story with AI or import yours, then come back here.</p>
          <Button onClick={() => navigate(`/dashboard/projects/${projectId}/story`)}>Open Story</Button>
        </section>
      </div>
    );
  }

  return (
    <div className={cs.page}>
      {head}
      <StoryPicker stories={data.stories} boards={data.boards} chosen={chosen} onPick={(id) => navigate(`${base(projectId)}/${id}`)} />
      {chosen && <Studio key={chosen} projectId={projectId} storyId={chosen} story={data.stories.find((st) => st.id === chosen)} />}
    </div>
  );
}

function StoryPicker({ stories, boards, chosen, onPick }) {
  const uid = useId();
  return (
    <section className={cs.picker} aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`} className={cs.sectionLabel}>
        Story <span className={cs.count}>{stories.length}</span>
      </h2>
      <div className={cs.storyList} role="radiogroup" aria-labelledby={`${uid}-h`}>
        {stories.map((st) => {
          const board = boards.find((b) => b.storyId === st.id);
          const on = st.id === chosen;
          return (
            <button key={st.id} type="button" role="radio" aria-checked={on} className={cx(cs.storyCard, on && cs.storyCardOn)} onClick={() => onPick(st.id)}>
              <span className={cs.storyIcon} aria-hidden="true">
                <IconBook width={17} height={17} />
              </span>
              <span className={cs.storyText}>
                <span className={cs.storyName}>{st.title}</span>
                <span className={cs.storyMeta}>{board ? `${board.scenes} scenes in the storyboard` : 'No storyboard yet'}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ====================================================================================== one story */
/** The newest clip of each scene (the one the film uses): { [sceneId]: clip }. */
function newestClips(clips) {
  const by = {};
  clips.forEach((c) => {
    const cur = by[c.sceneId];
    if (!cur || c.version > cur.version || (c.version === cur.version && c.id > cur.id)) by[c.sceneId] = c;
  });
  return by;
}
const seconds = (n) => (n ? `${n} s` : '');

function Studio({ projectId, storyId, story }) {
  const { navigate } = useRouter();
  const toast = useToast();
  const uid = useId();
  const { data, error, reload } = useResource(
    () => Promise.all([getStoryboard(projectId, storyId), listAnimationScenes(projectId, storyId), listVideoClips(projectId, storyId), latestAnimationJob(projectId, storyId), getSceneSketches(projectId, storyId).catch(() => ({}))]),
    [projectId, storyId],
  );
  const [job, setJob] = useState(undefined); // the newest generation job (after this page started or followed one)
  const [clips, setClips] = useState(null);
  const [model, setModel] = useState(VIDEO_MODELS[0].id);
  const [mode, setMode] = useState('all'); // 'all' | 'selected'
  const [picked, setPicked] = useState(() => new Set());
  const [starting, setStarting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [err, setErr] = useState('');
  const [film, setFilm] = useState(null); // object URL of the finished film
  const [playing, setPlaying] = useState(null); // { sceneNo, title, url } a clip shown in the player
  const filmFor = useRef(null);

  const board = data?.[0];
  const scenes = data?.[1] || [];
  const nowJob = job === undefined ? data?.[3] ?? null : job;
  const nowClips = clips || data?.[2] || [];
  const sketches = data?.[4] || {};
  const byScene = newestClips(nowClips);
  const running = Boolean(nowJob && RUNNING.has(nowJob.status));

  // the film: shown once the newest job has one
  const showFilm = useCallback(
    async (j, refresh = false) => {
      if (!j || j.status !== 'completed') return;
      if (!refresh && filmFor.current === j.id) return;
      filmFor.current = j.id;
      try {
        setFilm(await filmUrl(projectId, storyId, j.id, refresh));
      } catch {
        setFilm(null);
      }
    },
    [projectId, storyId],
  );
  useEffect(() => {
    showFilm(nowJob);
  }, [nowJob, showFilm]);

  // while the server works, look again every few seconds
  useEffect(() => {
    if (!running) return undefined;
    let live = true;
    const timer = setInterval(async () => {
      try {
        const [j, c] = await Promise.all([latestAnimationJob(projectId, storyId), listVideoClips(projectId, storyId)]);
        if (!live) return;
        setJob(j);
        setClips(c);
        if (j && !RUNNING.has(j.status)) {
          if (j.status === 'completed') toast('Your film is ready');
          else toast(j.error || 'Some scenes could not be made', 'error');
        }
      } catch {
        /* try again next time */
      }
    }, POLL);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [running, projectId, storyId, toast]);

  if (!data) return error ? <Notice message={error.message} onRetry={reload} /> : <div className={cs.loading} aria-busy="true" />;

  if (!board || scenes.length === 0) {
    return (
      <section className={cs.empty}>
        <span className={cs.emptyIcon} aria-hidden="true">
          <IconFilm width={22} height={22} />
        </span>
        <h2 className={cs.emptyTitle}>Make a storyboard first</h2>
        <p className={cs.emptyText}>The film is made scene by scene from “{story?.title}”’s storyboard. Sketches of the scenes help too: they become the first frame of each clip.</p>
        <Button onClick={() => navigate(`/dashboard/projects/${projectId}/storyboard/${storyId}`)}>Open Storyboard</Button>
      </section>
    );
  }

  const ready = scenes.filter((sc) => byScene[sc.id]?.status === 'generated');
  const total = nowJob?.total || 0;
  const pct = running ? Math.max(4, Math.round(((nowJob.done + nowJob.failed) / Math.max(1, total)) * 100)) : 0;
  const togglePick = (id) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const start = async () => {
    setErr('');
    const ids = scenes.filter((sc) => picked.has(sc.id)).map((sc) => sc.id);
    if (mode === 'selected' && !ids.length) {
      setErr('Choose the scenes to make (tick them in the list below).');
      return;
    }
    setStarting(true);
    try {
      const j = await startAnimation(projectId, storyId, { mode, sceneIds: ids, model });
      setJob(j);
      setPlaying(null);
      toast(mode === 'all' ? 'Making a clip for every scene' : `Making ${ids.length === 1 ? '1 clip' : `${ids.length} clips`}`);
    } catch (e) {
      setErr(e.message || 'The clips could not be started. Please try again.');
    }
    setStarting(false);
  };

  const join = async () => {
    if (!nowJob) return;
    setErr('');
    setJoining(true);
    try {
      const j = await assembleFilm(
        projectId,
        storyId,
        nowJob.id,
        ready.map((sc) => sc.id),
      );
      setJob(j);
      await showFilm(j, true);
      setPlaying(null);
      toast(ready.length === scenes.length ? 'Film joined' : `Film joined from ${ready.length} of ${scenes.length} scenes`);
    } catch (e) {
      setErr(e.message || 'The clips could not be joined. Please try again.');
    }
    setJoining(false);
  };

  const play = async (sc) => {
    const clip = byScene[sc.id];
    if (!clip || clip.status !== 'generated') return;
    try {
      setPlaying({ sceneNo: sc.no, title: sc.title, url: await clipUrl(projectId, storyId, clip.id) });
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const save = async () => {
    try {
      download(await downloadFilm(projectId, storyId, nowJob.id), `${(story?.title || 'film').replace(/[\\/:*?"<>|]+/g, '').trim() || 'film'} - film.mp4`);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const status = running
    ? nowJob.status === 'queued' || nowJob.status === 'planning'
      ? 'Planning the scenes…'
      : `Making the clips · ${nowJob.done} of ${total} ready`
    : nowJob?.status === 'failed'
      ? nowJob.error || 'Some scenes could not be made.'
      : film
        ? 'Your film is ready'
        : ready.length
          ? `${ready.length} of ${scenes.length} scenes have a clip`
          : 'No clips yet';

  return (
    <>
      <div className={a.top}>
        {/* ---------------------------------------------------------------- the player */}
        <section className={a.playerCard} aria-label="Film">
          <div className={cx(a.screenWrap, running && a.screenBusy)}>
            {running && <span className={cs.edgeGlow} aria-hidden="true" />}
            <div className={a.screen}>
              {playing ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video key={playing.url} className={a.video} src={playing.url} controls autoPlay playsInline aria-label={`Scene ${playing.sceneNo} clip`} />
              ) : running ? (
                <div className={a.making}>
                  <CinemorOrb busy />
                </div>
              ) : film ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video key={film} className={a.video} src={film} poster={mainSketch(sketches[String(scenes[0]?.no)])?.src} controls playsInline aria-label={`${story?.title || 'Story'}: the film`} />
              ) : (
                <div className={a.placeholder}>
                  <span className={a.placeholderIcon} aria-hidden="true">
                    <IconFilm width={26} height={26} />
                  </span>
                  <p>Your film appears here</p>
                  <span>Make the clips, and they are joined into one film.</span>
                </div>
              )}
              {playing && (
                <span className={a.screenTag}>
                  Scene {playing.sceneNo}: {playing.title}
                </span>
              )}
            </div>
            {running && <span className={cs.edgeLight} aria-hidden="true" />}
          </div>
          <div className={a.statusRow}>
            <p className={cx(a.status, nowJob?.status === 'failed' && !running && a.statusBad)} role="status">
              {status}
            </p>
            {running && <span className={a.pct}>{pct}%</span>}
            {playing && (
              <button type="button" className={cs.linkButton} onClick={() => setPlaying(null)}>
                {film ? 'Back to the film' : 'Close the clip'}
              </button>
            )}
          </div>
          {running && (
            <div className={a.bar} role="progressbar" aria-label="Making the clips" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <span style={{ width: `${pct}%` }} />
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- make it */}
        <section className={cx(cs.card, a.controls)} aria-labelledby={`${uid}-make`}>
          <div>
            <h2 id={`${uid}-make`} className={cs.cardTitle}>
              Make the clips
            </h2>
            <p className={cs.cardSub}>Each scene becomes a short clip, following its sketch, characters and place.</p>
          </div>
          <div className={cs.field}>
            <label htmlFor={`${uid}-model`} className={cs.label}>
              Video model
            </label>
            <select id={`${uid}-model`} className={cs.input} value={model} onChange={(e) => setModel(e.target.value)} disabled={running || starting}>
              {VIDEO_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className={a.modes} role="radiogroup" aria-label="Which scenes">
            {[
              ['all', 'Every scene', `${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'}`],
              ['selected', 'Chosen scenes', picked.size ? `${picked.size} chosen` : 'Tick them below'],
            ].map(([id, label, hint]) => (
              <button key={id} type="button" role="radio" aria-checked={mode === id} className={cx(a.mode, mode === id && a.modeOn)} onClick={() => setMode(id)} disabled={running || starting}>
                <span className={a.modeDot} aria-hidden="true" />
                <span className={a.modeText}>
                  <span className={a.modeName}>{label}</span>
                  <span className={a.modeHint}>{hint}</span>
                </span>
              </button>
            ))}
          </div>
          {err && (
            <p className={cs.error} role="alert">
              {err}
            </p>
          )}
          <Button icon={IconSparkles} onClick={start} loading={starting} disabled={running} className={cs.wideButton}>
            {running ? 'Making the clips…' : ready.length ? 'Make clips again' : 'Make the clips'}
          </Button>
          <hr className={cs.rule} />
          <div className={a.filmActions}>
            <Button variant="secondary" icon={IconRefresh} onClick={join} loading={joining} disabled={running || !nowJob || ready.length === 0}>
              {film ? 'Join the clips again' : 'Join the clips'}
            </Button>
            <Button variant="secondary" icon={IconExport} onClick={save} disabled={!film || running}>
              Download film
            </Button>
          </div>
          <p className={cs.note}>The film is joined automatically when every scene has a clip. Join again after making a scene again.</p>
        </section>
      </div>

      {/* ---------------------------------------------------------------- the scenes */}
      <section className={cs.castSection} aria-labelledby={`${uid}-scenes`}>
        <div className={cs.sectionHead}>
          <h2 id={`${uid}-scenes`} className={cs.sectionTitle}>
            Scenes <span className={cs.count}>{scenes.length}</span>
          </h2>
          <p className={cs.sectionSub}>
            {ready.length} of {scenes.length} with a clip
          </p>
        </div>
        <ul className={a.scenes} aria-label="Scenes">
          {scenes.map((sc) => {
            const clip = byScene[sc.id];
            const sketch = mainSketch(sketches[String(sc.no)]);
            const busy = running && (!nowJob.sceneIds || nowJob.sceneIds.includes(sc.id)) && clip?.status !== 'generated';
            const state = busy ? 'busy' : clip?.status === 'generated' ? 'ready' : clip?.status === 'failed' ? 'failed' : 'none';
            const on = picked.has(sc.id);
            return (
              <li key={sc.id} className={cx(a.scene, playing?.sceneNo === sc.no && a.sceneOn)}>
                <button type="button" className={a.thumb} onClick={() => play(sc)} disabled={state !== 'ready'} aria-label={state === 'ready' ? `Play scene ${sc.no}: ${sc.title}` : `Scene ${sc.no}: ${sc.title}`}>
                  {sketch ? <img src={sketch.src} alt="" /> : <IconImage width={22} height={22} aria-hidden="true" className={a.thumbIcon} />}
                  {state === 'ready' && (
                    <span className={a.playMark} aria-hidden="true">
                      <IconPlay width={16} height={16} />
                    </span>
                  )}
                  {state === 'busy' && <span className={a.thumbBusy} aria-hidden="true" />}
                  <span className={a.sceneNo}>Scene {sc.no}</span>
                </button>
                <div className={a.sceneBody}>
                  <p className={a.sceneTitle}>{sc.title}</p>
                  {sc.summary && <p className={a.sceneText}>{sc.summary}</p>}
                  <div className={a.sceneFoot}>
                    <span className={cx(a.chip, a[`chip_${state}`])}>
                      {state === 'busy' ? 'Making the clip…' : state === 'ready' ? `Clip ready${clip.seconds ? ` · ${seconds(clip.seconds)}` : ''}` : state === 'failed' ? 'Clip failed' : 'No clip yet'}
                    </span>
                    <label className={cx(a.pick, on && a.pickOn)}>
                      <input type="checkbox" checked={on} onChange={() => togglePick(sc.id)} disabled={running} />
                      <span className={a.pickBox} aria-hidden="true">
                        {on && <IconCheck width={12} height={12} strokeWidth={3} />}
                      </span>
                      Choose
                    </label>
                  </div>
                  {state === 'failed' && clip.error && <p className={a.sceneError}>{clip.error}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

const mainSketch = (record) => (record?.sketches?.length ? record.sketches.find((k) => k.id === record.selected) || record.sketches[0] : null);
