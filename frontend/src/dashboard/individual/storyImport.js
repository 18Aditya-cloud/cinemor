/**
 * "Import Existing Story": read a story file in the browser and return { title, content }.
 *
 *   .txt   read as text
 *   .docx  a Word file is a zip; word/document.xml inside it holds the text. It is unzipped here with the browser's
 *          own DecompressionStream, so no extra library is needed.
 *
 * PDF is not read here: getting the text out of a PDF reliably needs a PDF library (or the backend). When the backend
 * gets an upload route, send the file there instead and accept .pdf too.
 */
export const IMPORT_ACCEPT = '.txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_BYTES = 5 * 1024 * 1024;

const fail = (message) => Object.assign(new Error(message), { status: 422 });

/** "the-deep.docx" -> "The deep" */
function titleFromName(name) {
  const base = String(name || 'Imported story')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Imported story';
}

// Tidy the text: Windows line breaks, trailing spaces, and no more than one empty line in a row.
const tidy = (text) =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export async function readStoryFile(file) {
  if (!file) throw fail('Choose a file to import.');
  if (file.size > MAX_BYTES) throw fail('That file is larger than 5 MB. Import a smaller file.');
  const name = file.name || '';
  const ext = name.toLowerCase().split('.').pop();
  let content;
  if (ext === 'txt') content = await file.text();
  else if (ext === 'docx') content = await readDocx(file);
  else if (ext === 'pdf') throw fail('PDF files can’t be imported yet. Save it as a TXT or DOCX file and import that.');
  else throw fail('Import a TXT or DOCX file.');
  content = tidy(content);
  if (!content) throw fail('That file has no text in it.');
  return { title: titleFromName(name), content, fileName: name };
}

/* ------------------------------------------------------------------------------------------- Word (.docx) */
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function readDocx(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const xml = await unzipEntry(bytes, 'word/document.xml');
  if (!xml) throw fail('That doesn’t look like a Word document. Import a TXT or DOCX file.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw fail('That Word document could not be read.');
  const paragraphs = [];
  for (const p of doc.getElementsByTagNameNS(W, 'p')) {
    let line = '';
    // walk the paragraph in order: text, tabs and line breaks
    const walker = doc.createTreeWalker(p, NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.namespaceURI !== W) continue;
      if (node.localName === 't') line += node.textContent;
      else if (node.localName === 'tab') line += '\t';
      else if (node.localName === 'br' || node.localName === 'cr') line += '\n';
    }
    paragraphs.push(line);
  }
  return paragraphs.join('\n');
}

/** Find one file inside a zip and return its text (or '' if it isn't there). */
async function unzipEntry(bytes, wanted) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // the "end of central directory" record sits at the very end (followed by an optional comment)
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return '';
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  for (let n = 0; n < count && at + 46 <= bytes.length; n += 1) {
    if (view.getUint32(at, true) !== 0x02014b50) return '';
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (name === wanted) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      if (method === 0) return decoder.decode(data);
      if (method !== 8 || typeof DecompressionStream === 'undefined') throw fail('This browser can’t open Word files. Import a TXT file instead.');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return decoder.decode(await new Response(stream).arrayBuffer());
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  return '';
}
