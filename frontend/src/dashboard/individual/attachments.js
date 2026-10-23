import { readStoryFile } from './storyImport.js';
import { wordsIn } from './storyOptions.js';

/**
 * Files added with the workshop's "+" button: scripts (TXT / DOCX, read as text) and reference images
 * (PNG / JPG / WEBP / GIF). An image is kept as a small JPEG preview (at most 720 px on its longest side), so the
 * chat can keep it without growing too large.
 */
export const ATTACH_ACCEPT = '.txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp,image/gif';
export const MAX_ATTACHMENTS = 5;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const PREVIEW_SIDE = 720;

const fail = (message) => Object.assign(new Error(message), { status: 422 });
const isImage = (file) => /^image\/(png|jpeg|webp|gif)$/.test(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name);

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(fail(`${file.name} could not be opened as an image.`));
    };
    img.src = url;
  });
}

async function readImage(file) {
  if (file.size > MAX_IMAGE_BYTES) throw fail(`${file.name} is too large. Images can be up to 15 MB.`);
  const { img, url } = await loadImage(file);
  try {
    const scale = Math.min(1, PREVIEW_SIDE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b0a12'; // transparent areas become dark, like the preview
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { kind: 'image', name: file.name, src: canvas.toDataURL('image/jpeg', 0.8) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A chosen file -> { kind: 'image', name, src } or { kind: 'script', name, words, content }. */
export async function readAttachment(file) {
  if (isImage(file)) return readImage(file);
  if (/\.(txt|docx)$/i.test(file.name) || file.type === 'text/plain') {
    const read = await readStoryFile(file);
    return { kind: 'script', name: read.fileName, words: wordsIn(read.content), content: read.content };
  }
  if (/\.pdf$/i.test(file.name)) throw fail('PDF files can’t be added yet. Save it as DOCX or TXT and add that instead.');
  throw fail(`${file.name} can’t be added. Add a script (TXT or DOCX) or an image (PNG, JPG, WEBP).`);
}
