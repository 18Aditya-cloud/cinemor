/**
 * Export a one-click draft.
 *
 * Video: every scene drawn as it looks in the workshop's preview (its colours, the slow moving light, "Scene N of M",
 * the scene's heading) with the scene's text as subtitles, timed like the timeline, scenes dissolving into each other.
 * It is made in the browser: frames are drawn on a canvas and encoded with WebCodecs into an MP4 (H.264 where the
 * browser has it, else VP9). A browser without WebCodecs records the canvas in real time instead (MediaRecorder).
 * There is no sound yet: narration arrives with the Voice module.
 *
 * Script: the story as text, split into the same scenes, with their times.
 */
import { clock, scenesOf, totalOf } from './oneClick.js';
import { writeMp4 } from './mp4.js';

export const FPS = 30;
export const HUES = [262, 222, 292, 196, 318, 248, 172, 280, 210, 334];
const FADE = 0.6; // seconds a scene takes to dissolve into the next
const EDGE_FADE = 0.5; // from black at the start, to black at the end
const TITLE_END = 3.6; // the film's title shows over the first seconds

const SERIF = "'Instrument Serif', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif";
const SANS = "Manrope, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

const safeName = (title) => (title || 'Cinemor film').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'Cinemor film';

/** Save a file to the user's computer. */
export function download(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ------------------------------------------------------------------ the script */

export function scriptFile(story) {
  const scenes = scenesOf(story.content);
  const lines = [story.title, `${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'}, ${clock(totalOf(scenes))}`, ''];
  scenes.forEach((sc) => {
    lines.push(`SCENE ${sc.no}  (${clock(sc.start)} - ${clock(sc.start + sc.duration)})`, sc.text.trim(), '');
  });
  return { blob: new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }), fileName: `${safeName(story.title)} - script.txt` };
}

/* ------------------------------------------------------------------ drawing a frame */

/** A scene's text cut into subtitles of a line or two, each shown for as long as its words take to say. */
function subtitlesOf(scene) {
  const words = scene.body.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const cues = [];
  let current = [];
  words.forEach((w, i) => {
    current.push(w);
    const end = /[.!?]["”’)]?$/.test(w) || (/[,;:]$/.test(w) && current.length >= 9);
    if (current.length >= 16 || (end && current.length >= 4) || i === words.length - 1) {
      cues.push(current.join(' '));
      current = [];
    }
  });
  const total = words.length || 1;
  let at = 0;
  return cues.map((cue) => {
    const share = (cue.split(' ').length / total) * scene.duration;
    const item = { text: cue, start: at, end: at + share };
    at += share;
    return item;
  });
}

/** The scenes, ready to draw (subtitles worked out once). */
export function prepare(story) {
  const scenes = scenesOf(story.content).map((sc) => {
    const heading = sc.text.split('\n')[0].trim();
    return { ...sc, heading: sc.body !== sc.text.trim() ? heading : '', cues: subtitlesOf(sc) };
  });
  return { title: story.title, scenes, total: totalOf(scenes) };
}

function wrap(ctx, words, maxWidth) {
  const lines = [];
  let line = '';
  words.split(' ').forEach((w) => {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  });
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// the background is painted small and scaled up: its soft gradients lose nothing, and it is many times faster
const BG_W = 480;
const BG_H = 270;
let bgCanvas = null;

function paintBackground(h, p) {
  if (!bgCanvas) {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = BG_W;
    bgCanvas.height = BG_H;
  }
  const g = bgCanvas.getContext('2d', { alpha: false });
  const W = BG_W;
  const H = BG_H;
  g.save();
  const zoom = 1 + 0.05 * p; // very slowly pushing in
  g.translate(W / 2, H / 2);
  g.scale(zoom, zoom);
  g.translate(-W / 2, -H / 2);
  const base = g.createLinearGradient(0, 0, W * 0.4, H);
  base.addColorStop(0, '#09080f');
  base.addColorStop(0.6, '#100c1c');
  base.addColorStop(1, '#06050a');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  const glow = (x, y, r, color) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  };
  glow(W * 0.12, 0, W * 0.66, `hsla(${h}, 66%, 38%, 0.72)`);
  glow(W * 0.92, H, W * 0.55, `hsla(${h + 36}, 72%, 44%, 0.5)`);
  glow(W * (0.25 + p * 0.5), H * 0.38, W * 0.32, `hsla(${h}, 90%, 76%, 0.16)`);
  g.restore();
  // darker at the bottom, for the text, and at the edges
  const shade = g.createLinearGradient(0, H * 0.4, 0, H);
  shade.addColorStop(0, 'rgba(4,3,8,0)');
  shade.addColorStop(1, 'rgba(4,3,8,0.8)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  const vignette = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = vignette;
  g.fillRect(0, 0, W, H);
  return bgCanvas;
}

/** One scene at `local` seconds into it. */
function drawScene(ctx, W, H, scene, count, local) {
  const h = HUES[(scene.no - 1) % HUES.length];
  const p = Math.min(1, Math.max(0, local / scene.duration));
  const u = W / 100; // 1% of the width

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(paintBackground(h, p), 0, 0, W, H);

  // "Scene 1 of 4" and the time
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${1.15 * u}px ${SANS}`;
  const tag = `Scene ${scene.no} of ${count}`;
  const tw = ctx.measureText(tag).width + 2.2 * u;
  roundRect(ctx, 3.4 * u, 3.2 * u, tw, 2.3 * u, 1.15 * u);
  ctx.fillStyle = 'rgba(8,7,14,0.5)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = Math.max(1, u * 0.08);
  ctx.stroke();
  ctx.fillStyle = 'rgba(244,241,255,0.86)';
  ctx.fillText(tag, 4.5 * u, 4.35 * u);
  ctx.textAlign = 'right';
  ctx.font = `700 ${1.1 * u}px ${SANS}`;
  ctx.fillStyle = 'rgba(244,241,255,0.55)';
  ctx.fillText(clock(scene.start + local), W - 3.6 * u, 4.35 * u);
  ctx.textAlign = 'left';

  // the heading (if the scene has one) and the subtitle of the moment
  const cue = scene.cues.find((c) => local >= c.start && local < c.end) || scene.cues[scene.cues.length - 1];
  ctx.textBaseline = 'alphabetic';
  let y = H - 5 * u;
  if (cue) {
    ctx.font = `600 ${1.75 * u}px ${SANS}`;
    const lines = wrap(ctx, cue.text, W * 0.72).slice(-3);
    const fade = Math.min(1, (local - cue.start) / 0.25, (cue.end - local) / 0.25 + (cue === scene.cues[scene.cues.length - 1] ? 1 : 0));
    ctx.globalAlpha = Math.max(0, Math.min(1, fade));
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = u * 0.5;
    ctx.fillStyle = 'rgba(244,241,255,0.94)';
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      ctx.fillText(lines[i], 4 * u, y);
      y -= 2.6 * u;
    }
    ctx.globalAlpha = 1;
  }
  if (scene.heading) {
    ctx.font = `400 ${4.2 * u}px ${SERIF}`;
    ctx.fillStyle = '#f4f1ff';
    ctx.fillText(scene.heading, 4 * u, y - 1.4 * u);
  }
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

/** The whole film at time `t` (seconds). */
export function drawFrame(ctx, W, H, film, t) {
  const { scenes, total } = film;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (!scenes.length) return;
  const k = Math.max(0, scenes.findIndex((sc) => t < sc.start + sc.duration));
  const index = t >= total ? scenes.length - 1 : k;
  const scene = scenes[index];
  const local = t - scene.start;
  if (index > 0 && local < FADE) {
    const prev = scenes[index - 1];
    drawScene(ctx, W, H, prev, scenes.length, prev.duration);
    ctx.globalAlpha = local / FADE;
  }
  drawScene(ctx, W, H, scene, scenes.length, local);
  ctx.globalAlpha = 1;
  // the film's title over the opening seconds
  const show = Math.min((t - 0.4) / 0.6, (TITLE_END - t) / 0.6, 1);
  if (film.title && show > 0) {
    const u = W / 100;
    ctx.globalAlpha = show;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `400 ${5.2 * u}px ${SERIF}`;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = u;
    ctx.fillStyle = '#f7f4ff';
    const lines = wrap(ctx, film.title, W * 0.7).slice(0, 2);
    lines.forEach((line, i) => ctx.fillText(line, W / 2, H * 0.42 + (i - (lines.length - 1) / 2) * 6 * u));
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
  // from black at the start and to black at the end
  const edge = Math.min(1, t / EDGE_FADE, (total - t) / EDGE_FADE);
  if (edge < 1) {
    ctx.fillStyle = `rgba(0,0,0,${1 - Math.max(0, edge)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

/* ------------------------------------------------------------------ encoding */

const CODECS = [
  { codec: 'avc', string: 'avc1.640028', width: 1920, height: 1080 },
  { codec: 'avc', string: 'avc1.4d0028', width: 1920, height: 1080 },
  { codec: 'avc', string: 'avc1.42001f', width: 1280, height: 720 },
  { codec: 'vp9', string: 'vp09.00.31.08', width: 1280, height: 720 },
];

async function pickCodec() {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  for (const c of CODECS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { supported } = await VideoEncoder.isConfigSupported(encoderConfig(c));
      if (supported) return c;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

function encoderConfig(c) {
  return {
    codec: c.string,
    width: c.width,
    height: c.height,
    bitrate: c.height >= 1080 ? 4_500_000 : 2_500_000,
    framerate: FPS,
    ...(c.codec === 'avc' ? { avc: { format: 'avc' } } : {}),
  };
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function fontsReady() {
  try {
    await Promise.all([document.fonts.load(`400 80px ${SERIF}`), document.fonts.load(`600 32px ${SANS}`), document.fonts.load(`700 20px ${SANS}`)]);
  } catch {
    /* the fallback fonts are fine */
  }
}

/**
 * Make the video. onProgress(0..1) is called as frames are made; isCancelled() is checked between frames.
 * Resolves to { blob, fileName, width, height, seconds } (or null when cancelled).
 */
export async function exportVideo(story, { onProgress = () => {}, isCancelled = () => false } = {}) {
  const film = prepare(story);
  if (!film.scenes.length) throw new Error('This draft has no scenes to export yet.');
  await fontsReady();
  const choice = await pickCodec();
  if (!choice) return recordInRealTime(film, story, { onProgress, isCancelled });

  const { width: W, height: H } = choice;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const samples = [];
  let description = null;
  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta?.decoderConfig?.description && !description) description = meta.decoderConfig.description;
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({ data, key: chunk.type === 'key' });
    },
    error: (err) => {
      failure = err;
    },
  });
  encoder.configure(encoderConfig(choice));

  const frames = Math.max(1, Math.round(film.total * FPS));
  try {
    for (let i = 0; i < frames; i += 1) {
      if (failure) throw failure;
      if (isCancelled()) return null;
      drawFrame(ctx, W, H, film, i / FPS);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
      frame.close();
      // let the encoder keep up, and the page stay responsive
      // eslint-disable-next-line no-await-in-loop
      while (encoder.encodeQueueSize > 6) await new Promise((resolve) => setTimeout(resolve, 4));
      if (i % 6 === 0) {
        onProgress(i / frames);
        // eslint-disable-next-line no-await-in-loop
        await nextTick();
      }
    }
    await encoder.flush();
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  if (failure) throw failure;
  if (choice.codec === 'avc' && !description) throw new Error('The video could not be encoded in this browser.');
  onProgress(1);
  const blob = writeMp4({ codec: choice.codec, width: W, height: H, fps: FPS, config: choice.codec === 'avc' ? description : { profile: 0, level: 31, bitDepth: 8 }, samples });
  return { blob, fileName: `${safeName(story.title)}.mp4`, width: W, height: H, seconds: film.total, codec: choice.codec };
}

/** Older browsers: play the film on a canvas and record it (takes as long as the film). */
async function recordInRealTime(film, story, { onProgress, isCancelled }) {
  if (typeof MediaRecorder === 'undefined') throw new Error('This browser cannot make videos. Please use a recent Chrome, Edge, Safari or Firefox.');
  const W = 1280;
  const H = 720;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 4_000_000 } : undefined);
  const parts = [];
  recorder.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const stopped = new Promise((resolve) => {
    recorder.onstop = resolve;
  });
  drawFrame(ctx, W, H, film, 0);
  recorder.start(1000);
  const started = performance.now();
  let cancelled = false;
  await new Promise((resolve) => {
    const tick = () => {
      const t = (performance.now() - started) / 1000;
      if (isCancelled()) {
        cancelled = true;
        return resolve();
      }
      drawFrame(ctx, W, H, film, Math.min(t, film.total));
      onProgress(Math.min(1, t / film.total));
      if (t >= film.total) return resolve();
      return requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((tr) => tr.stop());
  if (cancelled) return null;
  const mime = (recorder.mimeType || type || 'video/webm').split(';')[0];
  return { blob: new Blob(parts, { type: mime }), fileName: `${safeName(story.title)}.${mime.includes('mp4') ? 'mp4' : 'webm'}`, width: W, height: H, seconds: film.total };
}
