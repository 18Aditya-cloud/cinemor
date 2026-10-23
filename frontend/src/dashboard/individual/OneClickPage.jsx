import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link } from '../../router/router.jsx';
import { listModels } from '../../services/storyApi.js';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import timeAgo from '../timeAgo.js';
import { IconCheck, IconChevronDown, IconClose, IconPlus } from '../ui/DashIcons.jsx';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import Notice from '../ui/Notice.jsx';
import { useToast } from '../ui/Toast.jsx';
import CinemorOrb from './CinemorOrb.jsx';
import { ATTACH_ACCEPT, MAX_ATTACHMENTS, readAttachment } from './attachments.js';
import { addStoryMessages, getProject, getProjectStory, importProjectStory, listProjectStories, rewriteProjectStory, writeProjectStory } from './individualApi.js';
import { clock, LENGTHS, sceneAt, sceneCount, scenesOf, totalOf } from './oneClick.js';
import { IconArrowLeft } from './parts.jsx';
import { IconArrowUp, IconBolt, IconDocument, IconExport, IconUpload } from './StoryIcons.jsx';
import { download, exportVideo, HUES, scriptFile } from './filmExport.js';
import { IMPORT_ACCEPT, readStoryFile } from './storyImport.js';
import { DEFAULT_SETTINGS, toRequest, wordsIn } from './storyOptions.js';
import s from './OneClick.module.css';

const load = async (projectId) => {
  const [project, models, stories] = await Promise.all([getProject(projectId), listModels(), listProjectStories(projectId)]);
  const latest = stories.filter((st) => st.oneClick).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
  const draft = latest ? await getProjectStory(projectId, latest.id) : null;
  return { project, models, draft };
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MIN_FIRST_STEP = 3200; // the generation screen always plays for a while, even when the AI answers quickly

const CREATE_STEPS = [
  { id: 'story', label: 'Writing the story' },
  { id: 'scenes', label: 'Planning the scenes' },
  { id: 'timeline', label: 'Laying out the timeline' },
];
const SCRIPT_STEPS = [
  { id: 'story', label: 'Reading your script' },
  { id: 'scenes', label: 'Planning the scenes' },
  { id: 'timeline', label: 'Laying out the timeline' },
];
const ADAPT_STEPS = [
  { id: 'story', label: 'Adapting your script' },
  { id: 'scenes', label: 'Planning the scenes' },
  { id: 'timeline', label: 'Laying out the timeline' },
];
const CHANGE_STEPS = [
  { id: 'story', label: 'Rewriting the story' },
  { id: 'scenes', label: 'Updating the scenes' },
  { id: 'timeline', label: 'Refreshing the timeline' },
];

/**
 * One-click generation (/dashboard/projects/:id/generate).
 *
 * First a single prompt window in the middle, under the Cinemor logo: an idea, and/or an uploaded script (TXT / DOCX).
 * "Generate" turns the page into the workshop. It is all in one go: changes are asked for in Cinemor AI's message box,
 * not edited by hand.
 *   top      back, the project and draft name, the status, New
 *   middle   the preview (the current scene) and, on the right, Cinemor AI: the steps as it works, and a message box
 *            for changes ("make the ending happier")
 *   bottom   the timeline: play controls, the time, and the scenes as clips (click one to jump to it)
 * The draft is a story of the project (it is in the Stories list and has its own chat), so it opens here again later.
 * Characters, environments, voice and animation arrive with their modules; until then the preview shows each scene.
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
  return <Generator project={data.project} models={data.models} initialDraft={data.draft} />;
}

function Generator({ project, models, initialDraft }) {
  const toast = useToast();
  const back = `/dashboard/projects/${project.id}`;
  const [phase, setPhase] = useState(initialDraft ? 'workshop' : 'prompt');
  const [story, setStory] = useState(initialDraft);
  const [prompt, setPrompt] = useState('');
  const [script, setScript] = useState(null); // an uploaded script: { title, content, fileName }
  const [model, setModel] = useState(initialDraft?.settings?.model && models.some((m) => m.id === initialDraft.settings.model) ? initialDraft.settings.model : models[0]?.id || '');
  const [length, setLength] = useState(initialDraft?.settings?.length || 'medium');
  const [error, setError] = useState('');
  // { kind: 'create' | 'change', steps: [{ id, label, state }], message, progress: { from, to, since }, done }
  // progress: the percentage moves from `from` towards `to` (easing, never quite reaching it) from the time `since`
  const [run, setRun] = useState(null);
  const [revealed, setRevealed] = useState(Infinity); // how many clips are on the timeline (they appear one by one)
  const [revealKey, setRevealKey] = useState(0); // a new value plays the preview's reveal
  const modelName = models.find((m) => m.id === model)?.name || 'AI';

  const stepTo = (steps, id, state) => steps.map((st) => (st.id === id ? { ...st, state } : st));

  const progress = (from, to) => ({ from, to, since: performance.now() });

  /**
   * The steps after the story is written: plan the scenes, lay the clips out one by one, and hold 100% for a moment
   * before the preview is revealed.
   */
  const finish = async (written, base, startedAt) => {
    const left = MIN_FIRST_STEP - (performance.now() - startedAt);
    if (left > 0) await wait(left);
    let steps = stepTo(base, 'story', 'done');
    steps = stepTo(steps, 'scenes', 'active');
    setRun((r) => ({ ...r, steps, progress: progress(72, 86) }));
    setStory(written);
    setRevealed(0);
    await wait(950);
    steps = stepTo(stepTo(steps, 'scenes', 'done'), 'timeline', 'active');
    const count = scenesOf(written.content).length;
    for (let i = 1; i <= count; i += 1) {
      const at = 86 + Math.round((13 * i) / count);
      setRun((r) => ({ ...r, steps, progress: { from: at, to: at, since: 0 } }));
      setRevealed(i);
      // eslint-disable-next-line no-await-in-loop
      await wait(240);
    }
    steps = stepTo(steps, 'timeline', 'done');
    setRun((r) => ({ ...r, steps, done: true, progress: { from: 100, to: 100, since: 0 } }));
    await wait(1100);
    setRevealKey((k) => k + 1);
    setRun(null);
    setRevealed(Infinity);
  };

  /**
   * Generate. With an idea only, Cinemor writes the story. With a script, the script is the story; with a script and
   * an idea, Cinemor adapts the script following the idea ("make it a one-minute trailer").
   */
  const generate = async () => {
    const idea = prompt.trim();
    if (!idea && !script) {
      setError('Describe what Cinemor should create, or upload your script.');
      return;
    }
    const settings = { ...DEFAULT_SETTINGS, model, wordCount: LENGTHS.find((l) => l.id === length)?.words || 700 };
    let request = null;
    try {
      if (!model && (idea || !script)) throw new Error('No AI model is available right now.');
      if (!script) request = toRequest(settings, idea);
    } catch (err) {
      setError(err.message);
      return;
    }
    setError('');
    const message = script ? { role: 'user', kind: 'message', text: idea || `Make my script into a film: ${script.fileName}`, file: script.fileName } : { role: 'user', kind: 'message', text: idea };
    const plan = script ? (idea ? ADAPT_STEPS : SCRIPT_STEPS) : CREATE_STEPS;
    const steps = plan.map((st, i) => ({ ...st, state: i === 0 ? 'active' : 'pending' }));
    const before = story; // the draft that was open, to go back to if this fails
    setStory(null);
    setRevealed(0);
    const startedAt = performance.now();
    setRun({ kind: 'create', steps, message, chatFrom: 0, progress: progress(0, 70) });
    setPhase('workshop');
    try {
      const meta = { oneClick: true, length, fromScript: Boolean(script) };
      let created;
      if (!script) {
        created = await writeProjectStory(project.id, { request, settings, chat: [message], meta, modelName });
      } else {
        // the script becomes the draft; with an idea too, Cinemor then adapts it
        created = await importProjectStory(project.id, { title: script.title, content: script.content, fileName: script.fileName, meta, chat: idea ? [] : [message] });
        if (idea) created = await rewriteProjectStory(project.id, created.id, { instruction: idea, chat: [message], model, language: 'English' });
      }
      setPrompt('');
      setScript(null);
      await finish(created, steps, startedAt);
      toast('Draft saved to the project');
    } catch (err) {
      // back to the prompt, with the idea and the script still there
      setRun(null);
      setRevealed(Infinity);
      setStory(before);
      setPhase('prompt');
      setError(err.message || 'The draft could not be made. Please try again.');
    }
  };

  const pickScript = async (file) => {
    if (!file) return;
    try {
      setScript(await readStoryFile(file));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  /** A message in the workshop: change the draft. */
  /**
   * A message in the workshop. Text (and any attached script) changes the draft. Reference images are kept with the
   * message for the Characters and Environment modules; sent on their own, they are saved without changing the draft.
   */
  const change = async ({ text, attachments = [] }) => {
    const scripts = attachments.filter((a) => a.kind === 'script');
    const images = attachments.filter((a) => a.kind === 'image');
    const kept = attachments.map((a) => (a.kind === 'image' ? { kind: 'image', name: a.name, src: a.src } : { kind: 'script', name: a.name, words: a.words }));

    if (!text && !scripts.length) {
      try {
        const label = images.length === 1 ? 'Reference image' : `${images.length} reference images`;
        setStory(
          await addStoryMessages(project.id, story.id, [
            { role: 'user', kind: 'message', text: label, attachments: kept },
            { role: 'event', text: `Saved as ${images.length === 1 ? 'a reference' : 'references'} for the Characters and Environment modules` },
          ]),
        );
        toast(images.length === 1 ? 'Reference image saved' : 'Reference images saved');
        return true;
      } catch (err) {
        toast(err.message);
        return false;
      }
    }

    const material = scripts.map((sc) => `\n\nUse this material (${sc.name}):\n${sc.content}`).join('');
    const instruction = `${text || 'Rework the draft using the attached script.'}${material}`;
    const message = { role: 'user', kind: 'message', text: text || `Use ${scripts.map((sc) => sc.name).join(', ')}`, attachments: kept };
    const steps = CHANGE_STEPS.map((st, i) => ({ ...st, state: i === 0 ? 'active' : 'pending' }));
    const startedAt = performance.now();
    setRun({ kind: 'change', steps, message, chatFrom: story.chat?.length ?? 0, progress: progress(0, 70) });
    try {
      const updated = await rewriteProjectStory(project.id, story.id, { instruction, chat: [message], model, language: 'English' });
      await finish(updated, steps, startedAt);
      return true;
    } catch (err) {
      setRun(null);
      toast(err.message || 'The draft could not be changed. Please try again.');
      return false;
    }
  };

  if (phase === 'prompt') {
    return (
      <PromptView
        back={back}
        project={project}
        models={models}
        model={model}
        onModel={setModel}
        length={length}
        onLength={setLength}
        prompt={prompt}
        onPrompt={(v) => {
          setPrompt(v);
          setError('');
        }}
        script={script}
        onScript={pickScript}
        onRemoveScript={() => setScript(null)}
        error={error}
        onGenerate={generate}
        onBackToDraft={story ? () => setPhase('workshop') : null}
      />
    );
  }

  return (
    <Workshop
      back={back}
      project={project}
      story={story}
      run={run}
      revealed={revealed}
      revealKey={revealKey}
      onChange={change}
      onNew={() => {
        setPrompt('');
        setError('');
        setPhase('prompt');
      }}
    />
  );
}

/* ====================================================================================== the prompt window */
function PromptView({ back, project, models, model, onModel, length, onLength, prompt, onPrompt, script, onScript, onRemoveScript, error, onGenerate, onBackToDraft }) {
  const uid = useId();
  const box = useRef(null);
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    box.current?.focus();
  }, []);
  return (
    <div className={s.promptPage}>
      <div className={s.promptTop}>
        <Link to={back} className={s.back}>
          <IconArrowLeft width={16} height={16} /> Back to Project
        </Link>
        {onBackToDraft && (
          <button type="button" className={s.linkButton} onClick={onBackToDraft}>
            Back to the current draft
          </button>
        )}
      </div>

      <div className={s.promptCenter}>
        <CinemorOrb className={s.promptOrb} />
        <p className={s.eyebrow}>One-click generation · {project.title}</p>
        <h1 className={s.promptTitle}>What should Cinemor create?</h1>
        <p className={s.promptSub}>Describe your idea in a sentence or two, or upload a script you already have. Cinemor plans the scenes and lays out your film in the workshop.</p>

        <form
          className={cx(s.promptCard, dragging && s.promptDrop)}
          onSubmit={(event) => {
            event.preventDefault();
            onGenerate();
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
            onScript(event.dataTransfer.files[0]);
          }}
        >
          {script && (
            <div className={s.scriptChip}>
              <span className={s.scriptIcon} aria-hidden="true">
                <IconDocument width={18} height={18} />
              </span>
              <span className={s.scriptInfo}>
                <span className={s.scriptName}>{script.fileName}</span>
                <span className={s.scriptMeta}>Your script · {wordsIn(script.content).toLocaleString('en-IN')} words</span>
              </span>
              <button type="button" className={s.scriptRemove} onClick={onRemoveScript} aria-label={`Remove ${script.fileName}`}>
                <IconClose width={15} height={15} />
              </button>
            </div>
          )}
          <label htmlFor={`${uid}-prompt`} className="cm-sr-only">
            Your idea
          </label>
          <textarea
            ref={box}
            id={`${uid}-prompt`}
            className={s.promptBox}
            rows={4}
            maxLength={10000}
            placeholder={
              script
                ? 'Optional: how should Cinemor use your script? e.g. "Make it a one-minute trailer". Leave empty to use it as it is.'
                : 'e.g. A young marine scientist discovers a mysterious signal from the deepest part of the Pacific Ocean.'
            }
            value={prompt}
            onChange={(event) => onPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onGenerate();
              }
            }}
          />
          <div className={s.promptBar}>
            <div className={s.promptOptions}>
              <button type="button" className={s.uploadButton} onClick={() => fileRef.current?.click()}>
                <IconUpload width={15} height={15} /> {script ? 'Change script' : 'Upload script'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={IMPORT_ACCEPT}
                hidden
                data-testid="script-file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  onScript(file);
                }}
              />
              <label className={s.modelPick}>
                <span className="cm-sr-only">AI model</span>
                <select value={model} onChange={(event) => onModel(event.target.value)}>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <IconChevronDown width={15} height={15} aria-hidden="true" />
              </label>
              <div className={s.segment} role="radiogroup" aria-label="Length">
                {LENGTHS.map((l) => (
                  <button key={l.id} type="button" role="radio" aria-checked={length === l.id} className={cx(s.segmentItem, length === l.id && s.segmentOn)} onClick={() => onLength(l.id)}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" className={s.generate}>
              <IconBolt width={17} height={17} /> Generate
            </button>
          </div>
        </form>
        {error ? (
          <p className={s.error} role="alert">
            {error}
          </p>
        ) : (
          <p className={s.hint}>{script ? 'Your script becomes the film draft · add a note above to have Cinemor adapt it' : 'Enter to generate · Upload a TXT or DOCX script if you have one'}</p>
        )}
      </div>
    </div>
  );
}

/* ====================================================================================== the workshop */
function Workshop({ back, project, story, run, revealed, revealKey, onChange, onNew }) {
  const allScenes = useMemo(() => scenesOf(story?.content), [story?.content]);
  const scenes = allScenes.slice(0, Number.isFinite(revealed) ? revealed : allScenes.length);
  const total = totalOf(allScenes);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const busy = Boolean(run);
  const current = sceneAt(allScenes, time);

  // a new draft starts from the beginning
  useEffect(() => {
    setTime(0);
    setPlaying(false);
  }, [story?.id, story?.versions?.length]);

  // playback
  useEffect(() => {
    if (!playing) return undefined;
    let frame;
    let last = performance.now();
    const tick = (now) => {
      const step = (now - last) / 1000;
      last = now;
      setTime((t) => {
        const next = t + step;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, total]);

  const seek = useCallback((t) => setTime(Math.min(total, Math.max(0, t))), [total]);
  const jump = (dir) => {
    if (!current) return;
    const index = current.no - 1 + dir;
    if (index < 0) seek(0);
    else if (index >= allScenes.length) seek(total);
    else seek(allScenes[index].start);
  };
  const togglePlay = () => {
    if (!allScenes.length || busy) return;
    if (time >= total) setTime(0);
    setPlaying((p) => !p);
  };

  // Space plays and pauses (not while typing)
  useEffect(() => {
    const onKey = (event) => {
      if (event.code !== 'Space' || event.target.closest?.('textarea, input, select, button, a, [contenteditable]')) return;
      event.preventDefault();
      togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const status = run ? (run.done ? 'Ready' : run.kind === 'create' ? 'Generating' : 'Updating') : 'Draft ready';
  const [exporting, setExporting] = useState(false);

  return (
    <div className={s.workshop}>
      {/* ---------------------------------------------------------------- top bar */}
      <header className={s.bar}>
        <div className={s.barLeft}>
          <Link to={back} className={s.iconLink} aria-label="Back to Project" title="Back to Project">
            <IconArrowLeft width={16} height={16} />
          </Link>
          <nav className={s.crumbs} aria-label="Draft">
            <span className={s.projectName}>{project.title}</span>
            <IconChevronDown width={14} height={14} className={s.crumbSep} aria-hidden="true" />
            <span className={s.draftName}>{story ? story.title : 'New draft'}</span>
          </nav>
        </div>
        <div className={s.barRight}>
          <span className={cx(s.status, busy && s.statusBusy)} role="status">
            <span className={s.statusDot} aria-hidden="true" />
            <span className={s.statusText}>{status}</span>
          </span>
          <button type="button" className={s.barButton} onClick={onNew} disabled={busy} aria-label="New draft">
            <IconPlus width={15} height={15} /> <span className={s.barLabel}>New draft</span>
          </button>
          <button
            type="button"
            className={cx(s.barButton, s.exportButton)}
            onClick={() => {
              setPlaying(false);
              setExporting(true);
            }}
            disabled={busy || !allScenes.length}
            aria-label="Export"
          >
            <IconExport width={15} height={15} /> <span className={s.barLabel}>Export</span>
          </button>
        </div>
      </header>
      {story && <ExportDialog open={exporting} onClose={() => setExporting(false)} story={story} scenes={allScenes} />}

      {/* ---------------------------------------------------------------- the viewer */}
      <section className={s.stage} aria-label="Preview">
        <div className={cx(s.frameWrap, busy && s.frameWrapBusy)}>
          {busy && <span className={s.edgeGlow} aria-hidden="true" />}
          <div className={s.frame}>
            {current && (!busy || scenes.length > 0) ? <SceneView scene={current} count={allScenes.length} time={time} /> : <div className={s.blank} />}
            {busy && <RenderScreen run={run} />}
            {!busy && revealKey > 0 && <Dissolve key={revealKey} />}
          </div>
          {busy && <span className={cx(s.edgeLight, run.done && s.edgeDone)} aria-hidden="true" />}
        </div>
        {busy ? <RenderProgress run={run} /> : <p className={s.stageNote}>Scene preview. Characters, voice and animation arrive with their modules.</p>}
      </section>

      {/* ---------------------------------------------------------------- Cinemor AI */}
      <Agent story={story} run={run} onSend={onChange} />

      {/* ---------------------------------------------------------------- the timeline */}
      <Timeline
        scenes={scenes}
        allScenes={allScenes}
        total={total}
        time={time}
        playing={playing}
        busy={busy}
        current={current}
        onSeek={(t) => {
          setPlaying(false);
          seek(t);
        }}
        onToggle={togglePlay}
        onJump={jump}
      />
    </div>
  );
}


/** One scene in the viewer: a tag with its place in the film, its time, and a lower third with its title and text. */
function SceneView({ scene, count, time }) {
  const progressIn = Math.min(1, Math.max(0, (time - scene.start) / scene.duration));
  return (
    <div key={scene.no} className={s.scene} style={{ '--h': HUES[(scene.no - 1) % HUES.length] }}>
      <div className={s.sceneLight} style={{ '--p': progressIn }} aria-hidden="true" />
      <div className={s.sceneTop}>
        <span className={s.sceneTag}>
          Scene {scene.no} of {count}
        </span>
        <span className={s.sceneTime}>{clock(scene.start)}</span>
      </div>
      <div className={s.lowerThird}>
        <h2 className={s.sceneTitle}>{scene.title}</h2>
        <p className={s.caption}>
          <span>{scene.body.replace(/\s+/g, ' ')}</span>
        </p>
      </div>
    </div>
  );
}

/** The live percentage: eases towards the run's target and never goes back. */
function usePercent(progress) {
  const [value, setValue] = useState(progress?.from || 0);
  const shown = useRef(value);
  useEffect(() => {
    if (!progress) return undefined;
    let frame;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(500, now - last);
      last = now;
      const elapsed = progress.since ? now - progress.since : Infinity;
      const target = progress.from + (progress.to - progress.from) * (1 - Math.exp(-elapsed / 4200));
      // glide towards the target by time, not frames (a slow device lands on it as quickly), never going back
      const gap = target - shown.current;
      if (gap > 0) shown.current = Math.min(100, target, shown.current + Math.max(gap * (1 - Math.exp(-dt / 200)), dt * 0.012));
      setValue(shown.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [progress]);
  return Math.round(value);
}

/** What the viewer shows while Cinemor works: only the Cinemor mark, beating, with soft light moving behind it. */
function RenderScreen({ run }) {
  return (
    <div className={cx(s.render, run.done && s.renderDone)} aria-hidden="true">
      <div className={s.aurora} />
      <div className={s.beat}>
        <span className={s.ripple} />
        <span className={cx(s.ripple, s.ripple2)} />
        <CinemorOrb size="lg" busy={!run.done} className={s.renderOrb} />
      </div>
    </div>
  );
}

/** Under the viewer while Cinemor works: the step it is on and how far along it is. */
function RenderProgress({ run }) {
  const pct = usePercent(run.progress);
  const index = Math.max(0, run.steps.findIndex((st) => st.state === 'active'));
  const label = run.done ? (run.kind === 'create' ? 'Your film draft is ready' : 'Your draft is updated') : `${run.steps[index]?.label || 'Preparing'}…`;
  return (
    <div className={cx(s.progress, run.done && s.progressDone)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Building your film draft">
      <span className={s.progressLabel}>{label}</span>
      <span className={s.progressPct}>{pct}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ export */

const EXPORTS = [
  { id: 'video', label: 'Video', format: 'MP4', text: 'Every scene with its heading and its text as subtitles, timed like the timeline.' },
  { id: 'script', label: 'Script', format: 'TXT', text: 'The story split into its scenes, with the time each one starts and ends.' },
];

const sizeOf = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Export: pick Video or Script. A video is made right here in the browser (a progress bar shows how far along it
 * is, and it can be cancelled); when it is ready it downloads, and can be downloaded again.
 */
function ExportDialog({ open, onClose, story, scenes }) {
  const uid = useId();
  const [kind, setKind] = useState('video');
  const [state, setState] = useState({ step: 'pick' }); // pick | making { pct } | done { file } | error { message }
  const cancelled = useRef(false);

  useEffect(() => {
    if (open) {
      setState({ step: 'pick' });
      cancelled.current = false;
    } else cancelled.current = true;
  }, [open]);

  const start = async () => {
    if (kind === 'script') {
      const file = scriptFile(story);
      download(file.blob, file.fileName);
      setState({ step: 'done', file });
      return;
    }
    cancelled.current = false;
    setState({ step: 'making', pct: 0 });
    try {
      let shown = -1;
      const file = await exportVideo(story, {
        isCancelled: () => cancelled.current,
        onProgress: (p) => {
          const pct = Math.floor(p * 100);
          if (pct !== shown) {
            shown = pct;
            setState((st) => (st.step === 'making' ? { step: 'making', pct } : st));
          }
        },
      });
      if (!file) return; // cancelled
      download(file.blob, file.fileName);
      setState({ step: 'done', file });
    } catch (err) {
      if (!cancelled.current) setState({ step: 'error', message: err?.message || 'The video could not be made. Please try again.' });
    }
  };

  const cancel = () => {
    cancelled.current = true;
    setState({ step: 'pick' });
  };
  const length = clock(totalOf(scenes));

  return (
    <Modal open={open} onClose={onClose} title="Export" subtitle={story.title} icon={IconExport}>
      {state.step === 'making' ? (
        <div className={s.exportBody}>
          <div className={s.exportWorking}>
            <p className={s.exportHeading}>Making your video</p>
            <p className={s.exportHint}>Keep this window open. It takes a little while for a longer film.</p>
            <div className={s.exportBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.pct} aria-label="Making your video">
              <span style={{ width: `${state.pct}%` }} />
            </div>
            <p className={s.exportPct}>{state.pct}%</p>
          </div>
          <div className={s.exportActions}>
            <Button variant="secondary" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : state.step === 'done' ? (
        <div className={s.exportBody}>
          <div className={s.exportDone} role="status">
            <span className={s.exportTick} aria-hidden="true">
              <IconCheck width={18} height={18} strokeWidth={2.6} />
            </span>
            <div>
              <p className={s.exportHeading}>{state.file.blob.type.startsWith('video') ? 'Your video is downloaded' : 'Your script is downloaded'}</p>
              <p className={s.exportHint}>
                {state.file.fileName} ({sizeOf(state.file.blob.size)})
              </p>
            </div>
          </div>
          <div className={s.exportActions}>
            <Button variant="secondary" onClick={() => download(state.file.blob, state.file.fileName)}>
              Download again
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className={s.exportBody}>
          <fieldset className={s.exportOptions}>
            <legend className={s.exportLegend}>What do you want to download?</legend>
            {EXPORTS.map((x) => (
              <label key={x.id} className={cx(s.exportOption, kind === x.id && s.exportOptionOn)}>
                <input type="radio" name={`${uid}-kind`} value={x.id} checked={kind === x.id} onChange={() => setKind(x.id)} />
                <span className={s.exportIcon} aria-hidden="true">
                  {x.id === 'video' ? <IconPlay /> : <IconDocument width={18} height={18} />}
                </span>
                <span className={s.exportText}>
                  <span className={s.exportName}>
                    {x.label} <span className={s.exportFormat}>{x.format}</span>
                  </span>
                  <span className={s.exportDesc}>{x.text}</span>
                  <span className={s.exportMeta}>{x.id === 'video' ? `HD video, ${length}, ${sceneCount(scenes.length)}` : sceneCount(scenes.length)}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {kind === 'video' && <p className={s.exportNote}>The video has no sound yet. Narration, characters and animation are added as those modules arrive.</p>}
          {state.step === 'error' && (
            <p className={s.exportError} role="alert">
              {state.message}
            </p>
          )}
          <div className={s.exportActions}>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button icon={IconExport} onClick={start}>
              {kind === 'video' ? 'Export video' : 'Download script'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** The pixel dissolve that plays when a draft appears (squares of light fading away at random). */
function Dissolve() {
  const [done, setDone] = useState(false);
  const cells = useMemo(() => Array.from({ length: 16 * 9 }, (_, i) => ({ i, delay: Math.round(((i * 7919) % 97) * 9 + ((i % 16) / 16) * 380), tone: (i * 31) % 3 })), []);
  useEffect(() => {
    const timer = setTimeout(() => setDone(true), 1600);
    return () => clearTimeout(timer);
  }, []);
  if (done) return null;
  return (
    <div className={s.dissolve} aria-hidden="true">
      {cells.map((c) => (
        <span key={c.i} className={cx(s.cell, s[`tone${c.tone}`])} style={{ animationDelay: `${c.delay}ms` }} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- Cinemor AI */
function Agent({ story, run, onSend }) {
  const uid = useId();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]); // added with "+": scripts and reference images
  const [attachError, setAttachError] = useState('');
  const [viewing, setViewing] = useState(null); // a reference image opened large
  const fileRef = useRef(null);
  const [tab, setTab] = useState('agent'); // 'agent' | 'details'
  const body = useRef(null);
  const all = story?.chat || [];
  // while a run is on, its message is shown with the live steps; what it has already saved waits until it finishes
  const chat = run ? all.slice(0, run.chatFrom) : all;
  const busy = Boolean(run);

  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [chat.length, run]);

  const addFiles = async (files) => {
    setAttachError('');
    const list = [...files];
    const room = MAX_ATTACHMENTS - attachments.length;
    if (list.length > room) setAttachError(`Up to ${MAX_ATTACHMENTS} files per message.`);
    const added = [];
    for (const file of list.slice(0, Math.max(0, room))) {
      try {
        // eslint-disable-next-line no-await-in-loop
        added.push(await readAttachment(file));
      } catch (err) {
        setAttachError(err.message);
      }
    }
    if (added.length) setAttachments((current) => [...current, ...added]);
  };

  const send = async () => {
    const value = text.trim();
    if ((!value && !attachments.length) || busy || !story) return;
    const sent = attachments;
    setText('');
    setAttachments([]);
    setAttachError('');
    const ok = await onSend({ text: value, attachments: sent });
    if (!ok) {
      setText(value);
      setAttachments(sent);
    }
  };
  const references = all.flatMap((m) => m.attachments || []).filter((a) => a.kind === 'image');

  const scenesFor = (no) => {
    const v = story?.versions.find((x) => x.no === no);
    return v ? scenesOf(v.content) : [];
  };
  const lastAi = [...chat].reverse().find((m) => m.role === 'ai');

  return (
    <aside className={s.agent} aria-label="Cinemor AI">
      <div className={s.agentHead}>
        <CinemorOrb size="sm" busy={busy} className={s.agentOrb} />
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
        <dl className={s.details}>
          <div>
            <dt>Draft</dt>
            <dd>{story?.title || '-'}</dd>
          </div>
          <div>
            <dt>Scenes</dt>
            <dd>{story ? scenesOf(story.content).length : '-'}</dd>
          </div>
          <div>
            <dt>Length</dt>
            <dd>{story ? clock(totalOf(scenesOf(story.content))) : '-'}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{story?.versions.length || '-'}</dd>
          </div>
          <div>
            <dt>AI model</dt>
            <dd>{story?.model || '-'}</dd>
          </div>
          <div>
            <dt>Reference images</dt>
            <dd>{references.length || 'None yet'}</dd>
          </div>
          <div>
            <dt>Last saved</dt>
            <dd>{story ? timeAgo(story.updatedAt) : '-'}</dd>
          </div>
          <p className={s.detailsNote}>Characters, environments, voice and animation will appear here as those modules arrive.</p>
        </dl>
      ) : (
        <div ref={body} className={s.agentBody} aria-live="polite">
          <p className={s.agentHello}>
            Hi, I’m Cinemor AI.
            <br />
            Tell me what to change and I’ll update the draft.
          </p>
          {chat.map((m) =>
            m.role === 'user' ? (
              <UserNote key={m.id} message={m} onView={setViewing} />
            ) : m.role === 'ai' ? (
              <AiNote key={m.id} first={m.version === 1} fromScript={Boolean(story.settings?.fromScript)} scenes={scenesFor(m.version)} version={m.version} latest={m === lastAi && !busy} />
            ) : (
              <p key={m.id} className={s.event}>
                {m.text}
                {m.version ? ` · version ${m.version}` : ''}
              </p>
            ),
          )}
          {run && (
            <>
              <UserNote message={run.message} onView={setViewing} />
              <div className={s.aiBlock}>
                <p className={s.aiLine}>{run.kind === 'create' ? 'Got it. I’m creating your film draft.' : 'Got it. I’m updating the draft.'}</p>
                <Steps steps={run.steps} title={story?.title || 'Film draft'} />
              </div>
            </>
          )}
        </div>
      )}

      {(attachError || attachments.some((a) => a.kind === 'image')) && (
        <p className={cx(s.attachNote, attachError && s.attachNoteBad)} role={attachError ? 'alert' : undefined}>
          {attachError || 'Images are kept as references for characters and environments. The story AI reads your text.'}
        </p>
      )}
      <form
        className={s.agentComposer}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        {attachments.length > 0 && (
          <ul className={s.attachList} aria-label="Attached files">
            {attachments.map((a, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <li key={`${a.name}-${i}`} className={cx(s.attach, a.kind === 'image' && s.attachImage)}>
                {a.kind === 'image' ? <img src={a.src} alt={a.name} /> : <IconDocument width={15} height={15} aria-hidden="true" />}
                {a.kind === 'script' && <span className={s.attachName}>{a.name}</span>}
                <button type="button" className={s.attachRemove} onClick={() => setAttachments((list) => list.filter((_, k) => k !== i))} aria-label={`Remove ${a.name}`}>
                  <IconClose width={12} height={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label htmlFor={`${uid}-message`} className="cm-sr-only">
          Message
        </label>
        <textarea
          id={`${uid}-message`}
          className={s.agentBox}
          rows={3}
          maxLength={4000}
          placeholder={!story ? 'Cinemor is working…' : attachments.length ? 'Add a note, e.g. "Use this look for Maya"' : 'Write your message, e.g. "Make the ending more hopeful"'}
          value={text}
          disabled={busy || !story}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <button type="button" className={s.agentAdd} onClick={() => fileRef.current?.click()} disabled={busy || !story || attachments.length >= MAX_ATTACHMENTS} aria-label="Add a script or a reference image" title="Add a script (TXT, DOCX) or a reference image">
          <IconPlus width={17} height={17} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ATTACH_ACCEPT}
          multiple
          hidden
          data-testid="agent-file"
          onChange={(event) => {
            const files = event.target.files;
            if (files?.length) addFiles(files);
            event.target.value = '';
          }}
        />
        <button type="submit" className={s.agentSend} disabled={busy || !story || (!text.trim() && !attachments.length)} aria-label="Send">
          {busy ? <span className={s.spinner} aria-hidden="true" /> : <IconArrowUp width={17} height={17} />}
        </button>
      </form>
      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} wide title={viewing?.name || 'Reference image'} subtitle="Reference image">
        {viewing && <img className={s.lightbox} src={viewing.src} alt={viewing.name} />}
      </Modal>
    </aside>
  );
}

/** What the creator sent: the text, and any reference images (open them large) and scripts. */
function UserNote({ message, onView }) {
  const files = message.attachments || [];
  return (
    <div className={s.bubble}>
      {message.text}
      {files.length > 0 && (
        <span className={s.bubbleFiles}>
          {files.map((a, i) =>
            a.kind === 'image' ? (
              // eslint-disable-next-line react/no-array-index-key
              <button key={i} type="button" className={s.thumb} onClick={() => onView(a)} aria-label={`Open ${a.name}`}>
                <img src={a.src} alt="" />
              </button>
            ) : (
              // eslint-disable-next-line react/no-array-index-key
              <span key={i} className={s.fileTag}>
                <IconDocument width={13} height={13} aria-hidden="true" /> {a.name}
              </span>
            ),
          )}
        </span>
      )}
    </div>
  );
}

function AiNote({ first, fromScript, scenes, version, latest }) {
  return (
    <div className={s.aiBlock}>
      <p className={s.aiLine}>
        {first ? 'Your draft is ready.' : 'The draft is updated.'} <span className={s.aiMeta}>Version {version}</span>
      </p>
      {latest && (
        <Steps
          done
          title={`${sceneCount(scenes.length)} · ${clock(totalOf(scenes))}`}
          steps={[
            { id: 'story', label: !first ? 'Story rewritten' : fromScript ? 'Script read' : 'Story written', state: 'done' },
            { id: 'scenes', label: `${sceneCount(scenes.length)} planned`, state: 'done' },
            { id: 'timeline', label: 'Timeline laid out', state: 'done' },
          ]}
        />
      )}
    </div>
  );
}

function Steps({ steps, title, done = false }) {
  return (
    <div className={s.steps}>
      <p className={s.stepsTitle}>
        <IconBolt width={14} height={14} aria-hidden="true" /> {title}
      </p>
      <ol className={s.stepList} aria-label={done ? 'Done' : 'Progress'}>
        {steps.map((st) => (
          <li key={st.id} className={cx(s.step, s[`step_${st.state}`])}>
            <span className={s.stepMark} aria-hidden="true">
              {st.state === 'done' ? <IconCheck width={11} height={11} strokeWidth={3.2} /> : st.state === 'active' ? <span className={s.stepPulse} /> : null}
            </span>
            {st.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- the timeline */
function Timeline({ scenes, allScenes, total, time, playing, busy, current, onSeek, onToggle, onJump }) {
  const track = useRef(null);
  const span = Math.max(total, 30); // an empty timeline still shows 30 seconds
  const pct = (t) => `${(t / span) * 100}%`;
  const ticks = [];
  const every = span > 240 ? 30 : span > 90 ? 10 : 5;
  for (let t = 0; t < span; t += every) ticks.push(t);

  const seekFromPointer = (event) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || !total) return;
    onSeek(((event.clientX - box.left) / box.width) * span);
  };

  return (
    <section className={s.timeline} aria-label="Timeline">
      <div className={s.transport}>
        <div className={s.controls}>
          <button type="button" className={s.control} onClick={() => onSeek(0)} disabled={!allScenes.length} aria-label="Go to start">
            <IconSkip back />
          </button>
          <button type="button" className={s.control} onClick={() => onJump(-1)} disabled={!allScenes.length} aria-label="Previous scene">
            <IconStep back />
          </button>
          <button type="button" className={cx(s.control, s.play)} onClick={onToggle} disabled={!allScenes.length || busy} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <button type="button" className={s.control} onClick={() => onJump(1)} disabled={!allScenes.length} aria-label="Next scene">
            <IconStep />
          </button>
          <button type="button" className={s.control} onClick={() => onSeek(total)} disabled={!allScenes.length} aria-label="Go to end">
            <IconSkip />
          </button>
        </div>
        <span className={s.timecode}>
          <strong>{clock(time)}</strong> / {clock(total)}
        </span>
        <span className={s.timelineInfo}>{allScenes.length ? `${sceneCount(allScenes.length)}${current ? ` · Scene ${current.no}` : ''}` : busy ? 'Building…' : 'Empty'}</span>
      </div>

      <div
        ref={track}
        className={s.tracks}
        onPointerDown={(event) => {
          if (event.target.closest('button')) return;
          seekFromPointer(event);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1 && event.currentTarget.hasPointerCapture?.(event.pointerId)) seekFromPointer(event);
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
          {scenes.map((sc) => (
            <button
              key={sc.no}
              type="button"
              className={cx(s.clip, current?.no === sc.no && s.clipOn)}
              style={{ left: pct(sc.start), width: `calc(${pct(sc.duration)} - 3px)` }}
              onClick={() => onSeek(sc.start)}
              title={`Scene ${sc.no}: ${sc.title}`}
            >
              <span className={s.clipLabel}>
                {sc.no} · {sc.title}
              </span>
            </button>
          ))}
        </div>
        <div className={cx(s.lane, s.laneSoon)}>
          <span className={s.laneName}>Voice</span>
          <span className={s.laneSoonText}>Narration arrives with the Voice module</span>
        </div>
        {allScenes.length > 0 && <span className={s.playhead} style={{ left: pct(time) }} aria-hidden="true" />}
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
function IconSkip({ back = false }) {
  return (
    <svg {...svg} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={back ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="m7 6 6 6-6 6M17 6v12" />
    </svg>
  );
}
