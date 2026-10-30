import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import timeAgo from '../timeAgo.js';
import { IconAlert, IconCheck, IconChevronDown, IconClose, IconFilm, IconImage, IconPlus, IconSparkles } from '../ui/DashIcons.jsx';
import Notice from '../ui/Notice.jsx';
import { useToast } from '../ui/Toast.jsx';
import CinemorOrb from './CinemorOrb.jsx';
import { download } from './filmExport.js';
import {
  analyzeOneClickSource,
  cancelOneClickFilm,
  continueOneClickFilm,
  downloadFilm,
  filmUrl,
  getOneClickFilm,
  getOneClickOptions,
  getProject,
  isLive,
  listOneClickFilms,
  readOneClickSource,
  sketchImageUrl,
  startOneClickFilm,
} from './individualApi.js';
import { clock } from './oneClick.js';
import { IconArrowLeft } from './parts.jsx';
import { IconArrowUp, IconBolt, IconDocument, IconExport, IconUpload } from './StoryIcons.jsx';
import s from './OneClick.module.css';

const POLL_MS = 3000;
const MAX_SOURCES = 6; // files per film (e.g. a few page photos)
const MAX_MATERIAL = 60000; // characters of material sent with a film
const SOURCE_ACCEPT = '.pdf,.docx,.pptx,.ppt,.txt,.md,.jpg,.jpeg,.png,.webp,application/pdf,image/*,text/plain';
const KIND_NAME = { pdf: 'PDF', document: 'Word', slides: 'Slides', text: 'Text', image: 'Picture' };
const SCENE_SECONDS = 6; // a scene's length on the timeline until its clip is made
const making = (film) => film && ['queued', 'running'].includes(film.status);

// how much of the whole run each step is, for the percentage under the viewer
const WEIGHT = { story: 10, storyboard: 10, characters: 9, locations: 7, sketches: 20, clips: 38, assembling: 6 };
function percentOf(film) {
  if (!film) return 0;
  if (film.status === 'done') return 100;
  let done = 0;
  film.steps.forEach((st) => {
    const w = WEIGHT[st.key] || 0;
    if (st.state === 'done' || st.state === 'skipped') done += w;
    else if (st.state === 'active') done += w * (st.count?.total ? Math.min(0.95, (st.count.done + 0.35) / st.count.total) : 0.4);
  });
  return Math.max(2, Math.min(99, Math.round(done)));
}

const load = async (projectId) => {
  if (!isLive) {
    const project = await getProject(projectId);
    return { project, options: null, film: null, films: [] };
  }
  const [project, options, films] = await Promise.all([getProject(projectId), getOneClickOptions(projectId), listOneClickFilms(projectId)]);
  const film = films[0] ? await getOneClickFilm(projectId, films[0].id) : null;
  return { project, options, film, films };
};

/**
 * One-click generation (/dashboard/projects/:id/generate): one prompt -> a finished film.
 *
 * First a single prompt window in the middle, under the Cinemor logo: an idea and/or an uploaded script (TXT / DOCX),
 * the video model (Wan 3.0, Veo 3.1, Seedance, Kling...), the story model, the look, the language and the length.
 * "Generate" starts the film on the server (one_click_routes.py), which makes, one after the other, the story, the
 * storyboard, the characters and places, a sketch of every scene, a clip of every scene and the joined film. The page
 * turns into the workshop and follows it:
 *   top      back, the project and film name, the status, Stop, New film, Download
 *   middle   the viewer (the newest sketch while it works; the film when it is ready) and, on the right, Cinemor AI:
 *            the steps as it works, and a message box to ask for a change (it makes a new version of the film)
 *   bottom   the timeline: play controls, the time, and the scenes as clips (click one to jump to it)
 * Everything a film is made of is ordinary project content, so it can also be opened module by module later.
 */
export default function OneClickPage({ projectId }) {
  const { data, error, reload } = useResource(() => load(projectId), [projectId]);
  useDocumentTitle(data ? `Generate: ${data.project.title}` : 'One-click generation');
  if (!data) {
    return (
      <div className={s.page} aria-busy={!error}>
        <Link to={`/dashboard/projects/${projectId}`} className={s.back}>
          <IconArrowLeft width={16} height={16} /> Back to Project
        </Link>
        {error && <Notice message={error.message} onRetry={reload} />}
      </div>
    );
  }
  if (!isLive) {
    return (
      <div className={s.page}>
        <Link to={`/dashboard/projects/${projectId}`} className={s.back}>
          <IconArrowLeft width={16} height={16} /> Back to Project
        </Link>
        <section className={s.offline}>
          <IconFilm width={22} height={22} aria-hidden="true" />
          <h1 className={s.offlineTitle}>One-click films are made on the Cinemor server</h1>
          <p className={s.offlineText}>The story, scenes, pictures and video clips are all made there. Sign in to Cinemor to use it.</p>
        </section>
      </div>
    );
  }
  return <Generator project={data.project} options={data.options} initialFilm={data.film} initialFilms={data.films} />;
}

function Generator({ project, options, initialFilm, initialFilms }) {
  const toast = useToast();
  const back = `/dashboard/projects/${project.id}`;
  const [phase, setPhase] = useState(initialFilm ? 'workshop' : 'prompt');
  const [film, setFilm] = useState(initialFilm);
  const [films, setFilms] = useState(initialFilms);
  const [prompt, setPrompt] = useState('');
  // uploaded material: [{ key, name, kind, words, pages, note, text, state: 'reading' | 'ready' | 'error', error }]
  const [sources, setSources] = useState([]);
  const [detected, setDetected] = useState(null); // { format, label, title, reason } for the material
  const [detecting, setDetecting] = useState(false);
  const last = initialFilm?.settings;
  const has = (list, id) => list.some((x) => (x.id || x) === id);
  const [choice, setChoice] = useState({
    videoModel: last && has(options.videoModels, last.videoModel) ? last.videoModel : options.defaultVideoModel,
    textModel: last && has(options.textModels, last.textModel) ? last.textModel : options.textModels[0]?.id || '',
    style: last && has(options.styles, last.style) ? last.style : options.styles[0] || '',
    language: last && has(options.languages, last.language) ? last.language : 'English',
    length: last?.length || 'short',
    format: 'auto',
    review: Boolean(last?.review),
  });
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  // follow a film while it is being made
  const filmId = film?.id;
  const live = making(film);
  useEffect(() => {
    if (!live) return undefined;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const next = await getOneClickFilm(project.id, filmId);
        if (!alive) return;
        setFilm(next);
        if (!making(next)) {
          setFilms((list) => list.map((f) => (f.id === next.id ? next : f)));
          if (next.status === 'done') toast('Your film is ready');
          else if (next.status === 'failed') toast(next.error || 'The film could not be made.', 'error');
        }
      } catch {
        /* a missed poll: the next one tries again */
      }
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [live, filmId, project.id, toast]);

  const start = async ({ idea, withScript, settings }) => {
    setError('');
    setStarting(true);
    try {
      const made = await startOneClickFilm(project.id, { prompt: idea, script: withScript, ...settings });
      setFilm(made);
      setFilms((list) => [made, ...list]);
      setPhase('workshop');
      setPrompt('');
      setSources([]);
      setDetected(null);
      setStarting(false);
      return '';
    } catch (err) {
      const message = err.message || 'The film could not be started. Please try again.';
      setStarting(false);
      setError(message);
      return message;
    }
  };

  // all ready material as one text (each file under its name), for the film
  const ready = sources.filter((x) => x.state === 'ready');
  const material = ready.length
    ? {
        title: detected?.title || (ready.length === 1 ? ready[0].title : `${ready[0].title} and more`),
        content: (ready.length === 1 ? ready[0].text : ready.map((x) => `From ${x.name}:\n${x.text}`).join('\n\n')).slice(0, MAX_MATERIAL),
        kinds: ready.map((x) => x.kind),
      }
    : null;

  const generate = () => {
    const idea = prompt.trim();
    if (sources.some((x) => x.state === 'reading')) {
      setError('Your files are still being read. Generate again in a moment.');
      return;
    }
    if (!idea && !material) {
      setError('Describe what Cinemor should create, or add your material (a PDF, a document, slides or pictures).');
      return;
    }
    if (!choice.videoModel || !choice.textModel) {
      setError('No AI model is available right now.');
      return;
    }
    start({ idea, withScript: material, settings: choice });
  };

  // what kind of video fits the material: asked again whenever the set of ready files changes
  const readyKey = ready.map((x) => x.key).join(',');
  useEffect(() => {
    if (!readyKey) {
      setDetected(null);
      return undefined;
    }
    let alive = true;
    setDetecting(true);
    analyzeOneClickSource(project.id, { text: material?.content.slice(0, 8000) || '', prompt: prompt.trim() })
      .then((d) => alive && setDetected(d))
      .catch(() => alive && setDetected(null))
      .finally(() => alive && setDetecting(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyKey, project.id]);

  const addFiles = async (files) => {
    const list = [...(files || [])];
    if (!list.length) return;
    setError('');
    const room = MAX_SOURCES - sources.length;
    if (list.length > room) setError(`Add up to ${MAX_SOURCES} files.`);
    const added = list.slice(0, Math.max(0, room)).map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, name: file.name, file, state: 'reading' }));
    if (!added.length) return;
    setSources((cur) => [...cur, ...added]);
    await Promise.all(
      added.map(async (item) => {
        try {
          const read = await readOneClickSource(project.id, item.file);
          setSources((cur) => cur.map((x) => (x.key === item.key ? { ...x, ...read, file: undefined, state: 'ready' } : x)));
        } catch (err) {
          setSources((cur) => cur.map((x) => (x.key === item.key ? { ...x, file: undefined, state: 'error', error: err.message || 'This file could not be read.' } : x)));
        }
      }),
    );
  };

  // a change asked for in the workshop: a new version of the film, in the same format.
  //   a story from an idea: the same idea with the change added
  //   a story filmed from a script: the script again, the change as a direction for how it looks
  //   any other format (explainer, promo...): this version's script is the material, the change is the note
  const settingsOf = (f) => ({
    videoModel: f.settings.videoModel,
    textModel: f.settings.textModel,
    style: f.settings.style,
    language: f.settings.language,
    length: f.settings.length,
    format: f.settings.formatUsed || f.settings.format || 'auto',
    review: f.settings.review,
  });
  const reworks = (f) => f.settings.formatUsed && f.settings.formatUsed !== 'story';
  const scriptOf = (f) => ((f.settings.fromScript || reworks(f)) && f.story ? { title: f.story.title, content: f.story.content, kinds: f.settings.sourceKinds } : null);
  const change = async (text) => {
    if (!film) return false;
    const idea = reworks(film) ? text : film.settings.fromScript ? [film.prompt, text].filter(Boolean).join('. ') : `${film.prompt}\n\nChange for this version: ${text}`.trim();
    const failed = await start({ idea: idea.slice(0, 4000), withScript: scriptOf(film), settings: settingsOf(film) });
    if (failed) toast(failed, 'error');
    return !failed;
  };

  const retry = async () => {
    if (!film) return;
    const failed = await start({ idea: film.prompt, withScript: scriptOf(film), settings: settingsOf(film) });
    if (failed) toast(failed, 'error');
  };

  // the script was checked (maybe changed): film it
  const filmIt = async ({ title, content }) => {
    try {
      const next = await continueOneClickFilm(project.id, film.id, { title, content });
      setFilm(next);
      setFilms((list) => list.map((f) => (f.id === next.id ? next : f)));
      return true;
    } catch (err) {
      toast(err.message || 'The film could not be continued.', 'error');
      return false;
    }
  };
  const stop = async () => {
    try {
      const stopped = await cancelOneClickFilm(project.id, film.id);
      setFilm(stopped);
      setFilms((list) => list.map((f) => (f.id === stopped.id ? stopped : f)));
      toast('Stopped');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const open = async (id) => {
    try {
      setFilm(await getOneClickFilm(project.id, id));
    } catch (err) {
      toast(err.message, 'error');
    }
  };


  if (phase === 'prompt') {
    return (
      <PromptView
        back={back}
        project={project}
        options={options}
        choice={choice}
        onChoice={(patch) => setChoice((c) => ({ ...c, ...patch }))}
        prompt={prompt}
        onPrompt={(v) => {
          setPrompt(v);
          setError('');
        }}
        sources={sources}
        onFiles={addFiles}
        onRemoveSource={(key) => setSources((cur) => cur.filter((x) => x.key !== key))}
        detected={detected}
        detecting={detecting}
        error={error}
        busy={starting}
        onGenerate={generate}
        onBackToFilm={film ? () => setPhase('workshop') : null}
      />
    );
  }

  return (
    <Workshop
      back={back}
      project={project}
      film={film}
      films={films}
      busyStarting={starting}
      onChange={change}
      onRetry={retry}
      onFilmIt={filmIt}
      onStop={stop}
      onOpen={open}
      onNew={() => {
        setPrompt('');
        setError('');
        setPhase('prompt');
      }}
    />
  );
}

/* ====================================================================================== the prompt window */
function Pick({ label, value, onChange, items, wide = false }) {
  return (
    <label className={cx(s.modelPick, wide && s.modelPickWide)} title={label}>
      <span className="cm-sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {items.map((it) => (
          <option key={it.value} value={it.value}>
            {it.label}
          </option>
        ))}
      </select>
      <IconChevronDown width={15} height={15} aria-hidden="true" />
    </label>
  );
}

function PromptView({ back, project, options, choice, onChoice, prompt, onPrompt, sources, onFiles, onRemoveSource, detected, detecting, error, busy, onGenerate, onBackToFilm }) {
  const uid = useId();
  const box = useRef(null);
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    box.current?.focus();
  }, []);
  const video = options.videoModels.find((m) => m.id === choice.videoModel);
  const length = options.lengths.find((l) => l.id === choice.length);
  const hasMaterial = sources.length > 0;
  const formatItems = options.formats.map((f) => ({
    value: f.id,
    label: f.id === 'auto' ? `Format: Auto${detected && hasMaterial ? ` (${detected.label})` : ''}` : `Format: ${f.label}`,
  }));
  const chosenFormat = options.formats.find((f) => f.id === choice.format);
  return (
    <div className={s.promptPage}>
      <div className={s.promptTop}>
        <Link to={back} className={s.back}>
          <IconArrowLeft width={16} height={16} /> Back to Project
        </Link>
        {onBackToFilm && (
          <button type="button" className={s.linkButton} onClick={onBackToFilm}>
            Back to the current film
          </button>
        )}
      </div>

      <div className={s.promptCenter}>
        <CinemorOrb className={s.promptOrb} />
        <p className={s.eyebrow}>One-click generation · {project.title}</p>
        <h1 className={s.promptTitle}>What should Cinemor create?</h1>
        <p className={s.promptSub}>
          Describe your idea, or add any material: a story, a chapter, notes, a product sheet, slides or page photos. Cinemor picks the right kind of video, writes the script, draws every scene and films it.
        </p>

        <form
          className={cx(s.promptCard, dragging && s.promptDrop)}
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) onGenerate();
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer?.types?.includes('Files')) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            if (!event.dataTransfer?.files?.length) return;
            event.preventDefault();
            setDragging(false);
            onFiles(event.dataTransfer.files);
          }}
        >
          {hasMaterial && (
            <ul className={s.sourceList} aria-label="Your material">
              {sources.map((src) => (
                <li key={src.key} className={cx(s.scriptChip, src.state === 'error' && s.sourceBad)}>
                  <span className={s.scriptIcon} aria-hidden="true">
                    {src.state === 'reading' ? <span className={s.spinner} /> : src.kind === 'image' ? <IconImage width={18} height={18} /> : <IconDocument width={18} height={18} />}
                  </span>
                  <span className={s.scriptInfo}>
                    <span className={s.scriptName}>{src.name}</span>
                    <span className={s.scriptMeta}>
                      {src.state === 'reading'
                        ? src.name.match(/\.(png|jpe?g|webp)$/i)
                          ? 'Reading the picture…'
                          : 'Reading…'
                        : src.state === 'error'
                          ? src.error
                          : [KIND_NAME[src.kind] || 'File', src.pages ? `${src.pages} ${src.kind === 'slides' ? (src.pages === 1 ? 'slide' : 'slides') : src.pages === 1 ? 'page' : 'pages'}` : '', `${src.words.toLocaleString('en-IN')} words`, src.note].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <button type="button" className={s.scriptRemove} onClick={() => onRemoveSource(src.key)} aria-label={`Remove ${src.name}`}>
                    <IconClose width={15} height={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hasMaterial && (detecting || detected) && (
            <p className={s.detected} role="status">
              <IconSparkles width={15} height={15} aria-hidden="true" />
              {detecting ? (
                'Looking at your material…'
              ) : (
                <span>
                  Looks like <b>{detected.label.toLowerCase()}</b> material{detected.title ? `: “${detected.title}”` : ''}.{' '}
                  {choice.format === 'auto' ? `Cinemor will make ${articleOf(detected.label)} ${detected.label.toLowerCase()} video.` : `You chose ${chosenFormat?.label.toLowerCase()}.`}
                </span>
              )}
            </p>
          )}
          <label htmlFor={`${uid}-prompt`} className="cm-sr-only">
            Your idea
          </label>
          <textarea
            ref={box}
            id={`${uid}-prompt`}
            className={s.promptBox}
            rows={4}
            maxLength={4000}
            placeholder={
              hasMaterial
                ? 'Optional: how should the video be? e.g. "A 1-minute explainer for class 10 with a fun example" or "A punchy ad for Instagram".'
                : 'e.g. A young marine scientist discovers a mysterious signal from the deepest part of the Pacific Ocean.'
            }
            value={prompt}
            onChange={(event) => onPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!busy) onGenerate();
              }
            }}
          />
          <div className={s.promptBar}>
            <div className={s.promptOptions}>
              <button type="button" className={s.uploadButton} onClick={() => fileRef.current?.click()} disabled={sources.length >= MAX_SOURCES} title="PDF, Word, PowerPoint, text or pictures">
                <IconUpload width={15} height={15} /> {hasMaterial ? 'Add more' : 'Add material'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={SOURCE_ACCEPT}
                multiple
                hidden
                data-testid="script-file"
                onChange={(event) => {
                  const files = [...(event.target.files || [])];
                  event.target.value = '';
                  onFiles(files);
                }}
              />
              <span className={s.videoPick}>
                <IconFilm width={15} height={15} aria-hidden="true" />
                <Pick label="Video model" value={choice.videoModel} onChange={(v) => onChoice({ videoModel: v })} items={options.videoModels.map((m) => ({ value: m.id, label: m.name }))} />
              </span>
              <div className={s.segment} role="radiogroup" aria-label="Length">
                {options.lengths.map((l) => (
                  <button key={l.id} type="button" role="radio" aria-checked={choice.length === l.id} title={l.about} className={cx(s.segmentItem, choice.length === l.id && s.segmentOn)} onClick={() => onChoice({ length: l.id })}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" className={s.generate} disabled={busy}>
              {busy ? <span className={s.spinner} aria-hidden="true" /> : <IconBolt width={17} height={17} />} {busy ? 'Starting…' : 'Generate'}
            </button>
          </div>
          <div className={s.promptMore}>
            <Pick label="Format" value={choice.format} onChange={(v) => onChoice({ format: v })} items={formatItems} />
            <Pick label="Story model" value={choice.textModel} onChange={(v) => onChoice({ textModel: v })} items={options.textModels.map((m) => ({ value: m.id, label: `Story: ${m.name}` }))} />
            <Pick label="Look" value={choice.style} onChange={(v) => onChoice({ style: v })} items={options.styles.map((x) => ({ value: x, label: `Look: ${x}` }))} />
            <Pick label="Language" value={choice.language} onChange={(v) => onChoice({ language: v })} items={options.languages.map((x) => ({ value: x, label: `Language: ${x}` }))} />
            <label className={s.reviewToggle}>
              <input type="checkbox" checked={choice.review} onChange={(event) => onChoice({ review: event.target.checked })} />
              <span>Let me check the script before filming</span>
            </label>
          </div>
        </form>
        {error ? (
          <p className={s.error} role="alert">
            {error}
          </p>
        ) : (
          <p className={s.hint}>
            {!hasMaterial && 'Add a PDF, Word, PowerPoint, text file or page photos (up to 6). '}
            {video ? `${video.name}: ${video.note}. ` : ''}
            {length ? `A ${length.label.toLowerCase()} film is ${length.about}. ` : ''}
            Making it takes a few minutes; you can leave this page and come back.
          </p>
        )}
      </div>
    </div>
  );
}

const articleOf = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/* ====================================================================================== the workshop */
function useObjectUrl(loader, key) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!key) return undefined;
    loader()
      .then((u) => alive && setUrl(u))
      .catch(() => {
        /* the picture stays empty */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

function Workshop({ back, project, film, films, busyStarting, onChange, onRetry, onFilmIt, onStop, onOpen, onNew }) {
  const toast = useToast();
  const [videoLength, setVideoLength] = useState(0); // the finished film's real length, once it has loaded
  const scenes = useMemo(() => {
    let start = 0;
    const list = (film?.scenes || [])
      .filter((sc) => sc.inFilm)
      .map((sc) => {
        const duration = sc.clip?.status === 'generated' && sc.clip.seconds ? sc.clip.seconds : SCENE_SECONDS;
        const item = { ...sc, start, duration };
        start += duration;
        return item;
      });
    // the clips' planned lengths, scaled to the film's real length, so a click lands on its scene
    const scale = videoLength && start ? videoLength / start : 1;
    return list.map((sc) => ({ ...sc, start: sc.start * scale, duration: sc.duration * scale }));
  }, [film?.scenes, videoLength]);
  const total = scenes.length ? scenes[scenes.length - 1].start + scenes[scenes.length - 1].duration : 0;
  const ready = film?.status === 'done' && film.job?.filmReady;
  const busy = making(film);
  const videoRef = useRef(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [picked, setPicked] = useState(null); // a scene chosen on the timeline while there is no film yet
  const [downloading, setDownloading] = useState(false);

  const storyId = film?.story?.id;
  const jobId = film?.job?.id;
  const filmSrc = useObjectUrl(() => filmUrl(project.id, storyId, jobId), ready ? `${storyId}/${jobId}` : null);

  // the scene in the viewer: where the film is, the one picked, or the newest one drawn while it works
  const current = ready
    ? scenes.find((sc) => time >= sc.start && time < sc.start + sc.duration) || scenes[scenes.length - 1]
    : scenes.find((sc) => sc.no === picked) || [...scenes].reverse().find((sc) => sc.sketchId) || scenes[0];
  const sketchSrc = useObjectUrl(() => sketchImageUrl(project.id, storyId, current?.id, current?.sketchId), !ready && current?.sketchId ? `${current.id}/${current.sketchId}` : null);

  useEffect(() => {
    setTime(0);
    setPlaying(false);
    setPicked(null);
    setVideoLength(0);
  }, [film?.id]);

  const seek = useCallback(
    (t) => {
      const v = videoRef.current;
      const to = Math.min(total, Math.max(0, t));
      if (v && ready) v.currentTime = to;
      setTime(to);
    },
    [total, ready],
  );
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || !ready) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };
  const jump = (dir) => {
    if (!current) return;
    const i = scenes.findIndex((sc) => sc.no === current.no) + dir;
    if (i < 0) return ready ? seek(0) : setPicked(scenes[0]?.no ?? null);
    if (i >= scenes.length) return ready ? seek(total) : setPicked(scenes[scenes.length - 1]?.no ?? null);
    return ready ? seek(scenes[i].start) : setPicked(scenes[i].no);
  };

  // Space plays and pauses (not while typing)
  useEffect(() => {
    const onKey = (event) => {
      if (event.code !== 'Space' || event.target.closest?.('textarea, input, select, button, a, video, [contenteditable]')) return;
      event.preventDefault();
      togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const save = async () => {
    setDownloading(true);
    try {
      const blob = await downloadFilm(project.id, storyId, jobId);
      download(blob, `${(film.story?.title || 'cinemor-film').replace(/[^\w\- ]+/g, '').trim() || 'cinemor-film'}.mp4`);
    } catch (err) {
      toast(err.message || 'The film could not be downloaded.', 'error');
    }
    setDownloading(false);
  };

  const reviewing = film?.status === 'review';
  const status = !film ? 'Starting' : reviewing ? 'Waiting for your check' : busy ? 'Making your film' : film.status === 'done' ? (ready ? 'Film ready' : 'Done') : film.status === 'cancelled' ? 'Stopped' : 'Not finished';
  const canStop = (busy || reviewing) && !(film?.job && ['queued', 'planning', 'generating', 'assembling'].includes(film.job.status));
  const pct = percentOf(film);
  const active = film?.steps.find((st) => st.state === 'active');

  return (
    <div className={s.workshop}>
      {/* ---------------------------------------------------------------- top bar */}
      <header className={s.bar}>
        <div className={s.barLeft}>
          <Link to={back} className={s.iconLink} aria-label="Back to Project" title="Back to Project">
            <IconArrowLeft width={16} height={16} />
          </Link>
          <nav className={s.crumbs} aria-label="Film">
            <span className={s.projectName}>{project.title}</span>
            <IconChevronDown width={14} height={14} className={s.crumbSep} aria-hidden="true" />
            <span className={s.draftName}>{film?.story?.title || 'New film'}</span>
          </nav>
        </div>
        <div className={s.barRight}>
          <span className={cx(s.status, busy && s.statusBusy, film?.status === 'failed' && s.statusBad)} role="status">
            <span className={s.statusDot} aria-hidden="true" />
            <span className={s.statusText}>{status}</span>
          </span>
          {canStop && (
            <button type="button" className={s.barButton} onClick={onStop} aria-label="Stop making this film">
              <IconClose width={15} height={15} /> <span className={s.barLabel}>Stop</span>
            </button>
          )}
          <button type="button" className={s.barButton} onClick={onNew} disabled={busy || busyStarting} aria-label="New film">
            <IconPlus width={15} height={15} /> <span className={s.barLabel}>New film</span>
          </button>
          <button type="button" className={cx(s.barButton, s.exportButton)} onClick={save} disabled={!ready || downloading} aria-label="Download the film">
            {downloading ? <span className={s.spinner} aria-hidden="true" /> : <IconExport width={15} height={15} />} <span className={s.barLabel}>Download</span>
          </button>
        </div>
      </header>

      {/* ---------------------------------------------------------------- the viewer */}
      {reviewing ? (
        <ScriptReview film={film} onFilmIt={onFilmIt} onStop={onStop} />
      ) : (
      <section className={s.stage} aria-label="Preview">
        <div className={cx(s.frameWrap, busy && s.frameWrapBusy)}>
          {busy && <span className={s.edgeGlow} aria-hidden="true" />}
          <div className={s.frame}>
            {ready && filmSrc ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                ref={videoRef}
                key={filmSrc}
                className={s.filmVideo}
                src={filmSrc}
                controls
                playsInline
                onLoadedMetadata={(event) => Number.isFinite(event.currentTarget.duration) && setVideoLength(event.currentTarget.duration)}
                onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                aria-label={`${film.story?.title || 'Your film'}, the finished film`}
              />
            ) : sketchSrc ? (
              <div key={current?.id} className={s.sketchView}>
                <img src={sketchSrc} alt={`Scene ${current?.no}: ${current?.title}`} />
                <div className={s.sketchShade} aria-hidden="true" />
                <div className={s.sceneTop}>
                  <span className={s.sceneTag}>
                    Scene {current?.no} of {scenes.length}
                  </span>
                  {current?.clip?.status === 'generated' && <span className={s.sceneTime}>Filmed</span>}
                </div>
                <div className={s.lowerThird}>
                  <h2 className={s.sceneTitle}>{current?.title}</h2>
                  {current?.summary && (
                    <p className={s.caption}>
                      <span>{current.summary}</span>
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className={s.blank} />
            )}
            {busy && !sketchSrc && <RenderScreen />}
            {!busy && film && !ready && film.status !== 'done' && <StoppedCard film={film} onRetry={onRetry} busy={busyStarting} projectId={project.id} />}
          </div>
          {busy && <span className={s.edgeLight} aria-hidden="true" />}
        </div>
        {busy ? (
          <div className={s.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Making your film">
            <span className={s.progressLabel}>
              {active ? `${active.label}${active.count?.total ? ` (${Math.min(active.count.done + 1, active.count.total)} of ${active.count.total})` : ''}…` : 'Starting…'}
            </span>
            <span className={s.progressPct}>{pct}%</span>
          </div>
        ) : (
          <p className={s.stageNote}>{ready ? `Made with ${film.settings.videoModelName}. Each scene was filmed from its sketch, with sound.` : film?.status === 'done' ? 'The film is done.' : ' '}</p>
        )}
      </section>
      )}

      {/* ---------------------------------------------------------------- Cinemor AI */}
      <Agent film={film} films={films} projectId={project.id} total={total} sceneCount={scenes.length} busy={busy || reviewing || busyStarting} onSend={onChange} onOpen={onOpen} />

      {/* ---------------------------------------------------------------- the timeline */}
      <Timeline
        scenes={scenes}
        total={total}
        time={ready ? time : current?.start || 0}
        playing={playing}
        ready={ready}
        busy={busy}
        current={current}
        onSeek={(sc) => (ready ? seek(sc.start) : setPicked(sc.no))}
        onSeekTime={(t) => ready && seek(t)}
        onToggle={togglePlay}
        onJump={jump}
      />
    </div>
  );
}

/**
 * The script, written and waiting for the person's check (the film was started with "Let me check the script"):
 * its title and text can be changed; "Film it" goes on with the storyboard, pictures and clips.
 */
function ScriptReview({ film, onFilmIt, onStop }) {
  const uid = useId();
  const [title, setTitle] = useState(film.story?.title || '');
  const [content, setContent] = useState(film.story?.content || '');
  const [busy, setBusy] = useState(false);
  const words = (content.match(/\S+/g) || []).length;
  const changed = title !== (film.story?.title || '') || content !== (film.story?.content || '');
  const go = async () => {
    setBusy(true);
    const ok = await onFilmIt({ title: title.trim(), content: changed ? content : null });
    if (!ok) setBusy(false);
  };
  return (
    <section className={s.review} aria-labelledby={`${uid}-title`}>
      <div className={s.reviewHead}>
        <div>
          <p className={s.reviewKicker}>{film.settings.formatLabel || 'Script'} · check before filming</p>
          <h2 id={`${uid}-title`} className={s.reviewTitle}>
            Read the script
          </h2>
          <p className={s.reviewSub}>Fix any fact, line or scene now. Each paragraph becomes a scene; lines like Narrator: "…" are spoken.</p>
        </div>
        <div className={s.reviewActions}>
          <button type="button" className={s.barButton} onClick={onStop} disabled={busy}>
            Stop
          </button>
          <button type="button" className={s.generate} onClick={go} disabled={busy || words < 5}>
            {busy ? <span className={s.spinner} aria-hidden="true" /> : <IconFilm width={16} height={16} />} Film it
          </button>
        </div>
      </div>
      <label className={s.reviewLabel} htmlFor={`${uid}-name`}>
        Title
      </label>
      <input id={`${uid}-name`} className={s.reviewName} value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} disabled={busy} />
      <label className={s.reviewLabel} htmlFor={`${uid}-text`}>
        Script <span className={s.reviewCount}>{words.toLocaleString('en-IN')} words</span>
      </label>
      <textarea id={`${uid}-text`} className={s.reviewText} value={content} onChange={(event) => setContent(event.target.value)} disabled={busy} spellCheck />
    </section>
  );
}

/** What the viewer shows before the first sketch: the Cinemor mark, beating, with soft light moving behind it. */
function RenderScreen() {
  return (
    <div className={s.render} aria-hidden="true">
      <div className={s.aurora} />
      <div className={s.beat}>
        <span className={s.ripple} />
        <span className={cx(s.ripple, s.ripple2)} />
        <CinemorOrb size="lg" busy className={s.renderOrb} />
      </div>
    </div>
  );
}

/** A film that failed or was stopped: what happened, and the ways on. */
function StoppedCard({ film, onRetry, busy, projectId }) {
  const failed = film.status === 'failed';
  return (
    <div className={s.stopped} role={failed ? 'alert' : 'status'}>
      <span className={cx(s.stoppedIcon, failed && s.stoppedIconBad)} aria-hidden="true">
        {failed ? <IconAlert width={20} height={20} /> : <IconClose width={20} height={20} />}
      </span>
      <p className={s.stoppedTitle}>{failed ? 'The film could not be finished' : 'You stopped this film'}</p>
      {failed && film.error && <p className={s.stoppedText}>{film.error}</p>}
      <div className={s.stoppedActions}>
        <button type="button" className={s.generate} onClick={onRetry} disabled={busy}>
          <IconBolt width={16} height={16} /> Make it again
        </button>
        {film.story && (
          <Link to={`/dashboard/projects/${projectId}/animation/${film.story.id}`} className={s.stoppedLink}>
            Finish it in AI Animation
          </Link>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- Cinemor AI */
function Agent({ film, films, projectId, total, sceneCount, busy, onSend, onOpen }) {
  const uid = useId();
  const [text, setText] = useState('');
  const [tab, setTab] = useState('agent'); // 'agent' | 'details'
  const body = useRef(null);

  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [film?.status, film?.stage, film?.id]);

  const send = async () => {
    const value = text.trim();
    if (!value || busy || !film) return;
    setText('');
    const ok = await onSend(value);
    if (!ok) setText(value);
  };
  const cfg = film?.settings;
  const visibleSteps = (film?.steps || []).filter((st) => st.state !== 'skipped');

  return (
    <aside className={s.agent} aria-label="Cinemor AI">
      <div className={s.agentHead}>
        <CinemorOrb size="sm" busy={making(film)} className={s.agentOrb} />
        <span className={s.agentName}>Cinemor AI</span>
        <div className={s.agentTabs} role="tablist" aria-label="Panel">
          {[
            ['agent', 'Agent'],
            ['details', 'Details'],
          ].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={cx(s.agentTab, tab === id && s.agentTabOn)} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'details' ? (
        <div className={s.details}>
          <dl className={s.detailList}>
            <div>
              <dt>Film</dt>
              <dd>{film?.story?.title || '-'}</dd>
            </div>
            <div>
              <dt>Scenes</dt>
              <dd>{sceneCount || '-'}</dd>
            </div>
            <div>
              <dt>Length</dt>
              <dd>{total ? clock(total) : '-'}</dd>
            </div>
            <div>
              <dt>Video model</dt>
              <dd>{cfg?.videoModelName || '-'}</dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>{cfg?.formatLabel || (cfg?.format === 'auto' ? 'Auto' : '-')}</dd>
            </div>
            <div>
              <dt>Look</dt>
              <dd>{cfg?.style || '-'}</dd>
            </div>
            <div>
              <dt>Language</dt>
              <dd>{cfg?.language || '-'}</dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>{film ? timeAgo(film.createdAt) : '-'}</dd>
            </div>
          </dl>
          {film?.story && (
            <p className={s.detailsNote}>
              Everything in this film is in your project too. Open the{' '}
              <Link to={`/dashboard/projects/${projectId}/story/${film.story.id}`}>story</Link>,{' '}
              <Link to={`/dashboard/projects/${projectId}/storyboard/${film.story.id}`}>storyboard</Link> or{' '}
              <Link to={`/dashboard/projects/${projectId}/animation/${film.story.id}`}>clips</Link> to change one part by hand.
            </p>
          )}
          {films.length > 1 && (
            <div className={s.versions}>
              <p className={s.versionsTitle}>Versions</p>
              <ul>
                {films.map((f, i) => (
                  <li key={f.id}>
                    <button type="button" className={cx(s.versionItem, f.id === film?.id && s.versionOn)} onClick={() => onOpen(f.id)} aria-current={f.id === film?.id ? 'true' : undefined}>
                      <span>Version {films.length - i}</span>
                      <span className={s.versionMeta}>
                        {f.status === 'done' ? 'Ready' : making(f) ? 'Being made' : f.status === 'cancelled' ? 'Stopped' : 'Not finished'}, {timeAgo(f.createdAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div ref={body} className={s.agentBody} aria-live="polite">
          <p className={s.agentHello}>
            Hi, I’m Cinemor AI.
            <br />
            Tell me what to change and I’ll make a new version of the film.
          </p>
          {film && (
            <>
              <div className={s.bubble}>
                {film.prompt || (cfg.fromScript ? `Film my script${cfg.scriptTitle ? `: ${cfg.scriptTitle}` : ''}` : 'Make a film')}
                {cfg.fromScript && (
                  <span className={s.bubbleFiles}>
                    <span className={s.fileTag}>
                      <IconDocument width={13} height={13} aria-hidden="true" /> {cfg.scriptTitle || 'Script'}
                    </span>
                  </span>
                )}
              </div>
              <div className={s.aiBlock}>
                <p className={s.aiLine}>
                  {film.status === 'review'
                    ? `The ${cfg.formatLabel ? `${cfg.formatLabel.toLowerCase()} ` : ''}script is ready. Read it, change anything you like, then press Film it.`
                    : making(film)
                    ? `Got it. I’m making ${cfg.formatLabel ? `${articleOf(cfg.formatLabel)} ${cfg.formatLabel.toLowerCase()}` : 'your film'} with ${cfg.videoModelName}.`
                    : film.status === 'done'
                      ? 'Your film is ready.'
                      : film.status === 'cancelled'
                        ? 'Stopped. Nothing more is made for this version.'
                        : 'I could not finish this film.'}{' '}
                  {film.status === 'done' && (
                    <span className={s.aiMeta}>
                      {sceneCount} {sceneCount === 1 ? 'scene' : 'scenes'} · {clock(total)}
                    </span>
                  )}
                </p>
                <div className={s.steps}>
                  <p className={s.stepsTitle}>
                    <IconBolt width={14} height={14} aria-hidden="true" /> {film.story?.title || 'Your film'}
                  </p>
                  <ol className={s.stepList} aria-label="Progress">
                    {visibleSteps.map((st) => (
                      <li key={st.key} className={cx(s.step, s[`step_${st.state === 'waiting' ? 'pending' : st.state === 'failed' ? 'failed' : st.state}`])}>
                        <span className={s.stepMark} aria-hidden="true">
                          {st.state === 'done' ? <IconCheck width={11} height={11} strokeWidth={3.2} /> : st.state === 'active' ? <span className={s.stepPulse} /> : st.state === 'failed' ? <IconClose width={10} height={10} /> : null}
                        </span>
                        <span>
                          {st.label}
                          {st.count?.total ? <span className={s.stepCount}> {st.state === 'done' ? `${st.count.done - (st.count.failed || 0)}/${st.count.total}` : `${st.count.done}/${st.count.total}`}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                  {making(film) && film.detail && <p className={s.stepDetail}>{film.detail}</p>}
                </div>
                {film.status === 'failed' && film.error && <p className={s.agentError}>{film.error}</p>}
              </div>
            </>
          )}
        </div>
      )}

      <form
        className={s.agentComposer}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <label htmlFor={`${uid}-message`} className="cm-sr-only">
          Ask for a change
        </label>
        <textarea
          id={`${uid}-message`}
          className={s.agentBox}
          rows={3}
          maxLength={1500}
          placeholder={film?.status === 'review' ? 'Check the script first, then press Film it' : busy ? 'Cinemor is making your film…' : 'Ask for a change, e.g. "Make the ending more hopeful"'}
          value={text}
          disabled={busy || !film}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <button type="submit" className={s.agentSend} disabled={busy || !film || !text.trim()} aria-label="Make a new version with this change">
          {busy ? <span className={s.spinner} aria-hidden="true" /> : <IconArrowUp width={17} height={17} />}
        </button>
      </form>
      <p className={s.agentFoot}>Each change makes a new version of the film; earlier versions stay under Details.</p>
    </aside>
  );
}

/* ---------------------------------------------------------------------------------------- the timeline */
function Timeline({ scenes, total, time, playing, ready, busy, current, onSeek, onSeekTime, onToggle, onJump }) {
  const track = useRef(null);
  const span = Math.max(total, 30); // an empty timeline still shows 30 seconds
  const pct = (t) => `${(t / span) * 100}%`;
  const ticks = [];
  const every = span > 240 ? 30 : span > 90 ? 10 : 5;
  for (let t = 0; t < span; t += every) ticks.push(t);

  const seekFromPointer = (event) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || !total) return;
    onSeekTime(((event.clientX - box.left) / box.width) * span);
  };
  const stateOf = (sc) => (sc.clip?.status === 'generated' ? 'filmed' : sc.clip?.status === 'failed' ? 'failed' : sc.clip?.status === 'generating' ? 'filming' : sc.sketchId ? 'drawn' : 'waiting');
  const STATE_TEXT = { filmed: 'filmed', failed: 'could not be filmed', filming: 'being filmed', drawn: 'drawn', waiting: 'waiting' };

  return (
    <section className={s.timeline} aria-label="Timeline">
      <div className={s.transport}>
        <div className={s.controls}>
          <button type="button" className={s.control} onClick={() => onJump(-1)} disabled={!scenes.length} aria-label="Previous scene">
            <IconStep back />
          </button>
          <button type="button" className={cx(s.control, s.play)} onClick={onToggle} disabled={!ready} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <button type="button" className={s.control} onClick={() => onJump(1)} disabled={!scenes.length} aria-label="Next scene">
            <IconStep />
          </button>
        </div>
        <span className={s.timecode}>
          <strong>{clock(time)}</strong> / {clock(total)}
        </span>
        <span className={s.timelineInfo}>{scenes.length ? `${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'}${current ? ` · Scene ${current.no}` : ''}` : busy ? 'Planning the scenes…' : 'Empty'}</span>
      </div>

      <div
        ref={track}
        className={s.tracks}
        onPointerDown={(event) => {
          if (event.target.closest('button') || !ready) return;
          seekFromPointer(event);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (ready && event.buttons === 1 && event.currentTarget.hasPointerCapture?.(event.pointerId)) seekFromPointer(event);
        }}
      >
        <div className={s.ruler} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className={s.tick} style={{ left: pct(t) }}>
              {t % (every * 2) === 0 ? clock(t) : ''}
            </span>
          ))}
        </div>
        <div className={s.lane}>
          <span className={s.laneName}>Scenes</span>
          {scenes.map((sc) => {
            const state = stateOf(sc);
            return (
              <button
                key={sc.id}
                type="button"
                className={cx(s.clip, s[`clip_${state}`], current?.id === sc.id && s.clipOn)}
                style={{ left: pct(sc.start), width: `calc(${pct(sc.duration)} - 3px)` }}
                onClick={() => onSeek(sc)}
                title={`Scene ${sc.no}: ${sc.title} (${STATE_TEXT[state]})`}
                aria-label={`Scene ${sc.no}: ${sc.title}, ${STATE_TEXT[state]}`}
              >
                <span className={s.clipLabel}>
                  {sc.no} · {sc.title}
                </span>
              </button>
            );
          })}
        </div>
        {ready && <span className={s.playhead} style={{ left: pct(time) }} aria-hidden="true" />}
      </div>
    </section>
  );
}

const svg = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true, focusable: false };
function IconPlay() {
  return (
    <svg {...svg}>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}
function IconPause() {
  return (
    <svg {...svg}>
      <rect x="6" y="5" width="4.2" height="14" rx="1.2" />
      <rect x="13.8" y="5" width="4.2" height="14" rx="1.2" />
    </svg>
  );
}
function IconStep({ back = false }) {
  return (
    <svg {...svg} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={back ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}