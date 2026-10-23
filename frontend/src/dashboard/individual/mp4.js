/**
 * A small MP4 writer for one video track, used by the film export.
 *
 * The browser's encoder (WebCodecs) gives encoded frames; this puts them in an .mp4 file that video players open:
 * the file header (ftyp), the index of every frame (moov) and the frames themselves (mdat). The index comes before
 * the frames, so the video can start playing before it has fully loaded.
 *
 *   codec  'avc' (H.264, plays everywhere) or 'vp9'
 *   config the encoder's decoderConfig.description for H.264 (the avcC record); for VP9, { profile, level, bitDepth }
 *   samples [{ data: Uint8Array, key: boolean }] in order, at a constant frame rate
 */
const TIMESCALE = 90000; // ticks per second for the video track

const text = (s) => [...s].map((c) => c.charCodeAt(0));
const u8 = (n) => [n & 255];
const u16 = (n) => [(n >> 8) & 255, n & 255];
const u32 = (n) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const zeros = (n) => new Array(n).fill(0);

/** A box: its size, its four-letter type, then its contents (numbers or nested boxes). */
function box(type, ...parts) {
  const body = parts.flat(Infinity);
  return [...u32(body.length + 8), ...text(type), ...body];
}
const fullBox = (type, version, flags, ...parts) => box(type, u8(version), u8(flags >> 16), u16(flags & 0xffff), ...parts);

const MATRIX = [...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];

function sampleEntry(codec, width, height, config) {
  const visual = [
    ...zeros(6),
    ...u16(1), // data reference index
    ...zeros(16),
    ...u16(width),
    ...u16(height),
    ...u32(0x00480000), // 72 dpi
    ...u32(0x00480000),
    ...u32(0),
    ...u16(1), // one frame per sample
    ...zeros(32), // compressor name
    ...u16(0x0018), // colour, no alpha
    ...u16(0xffff),
  ];
  if (codec === 'avc') return box('avc1', visual, box('avcC', [...new Uint8Array(config)]));
  // VP9: profile, level, 8-bit 4:2:0, BT.709 colours
  const { profile = 0, level = 40, bitDepth = 8 } = config || {};
  const vpcC = fullBox('vpcC', 1, 0, u8(profile), u8(level), u8((bitDepth << 4) | (1 << 1)), u8(1), u8(1), u8(1), u16(0));
  return box('vp09', visual, vpcC);
}

function moov({ codec, width, height, config, sizes, keys, frameDuration, dataOffset }) {
  const count = sizes.length;
  const mediaDuration = count * frameDuration;
  const movieDuration = Math.round((mediaDuration / TIMESCALE) * 1000);
  const mvhd = fullBox('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(movieDuration), u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(2));
  const tkhd = fullBox('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(movieDuration), zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width * 65536), u32(height * 65536));
  const mdhd = fullBox('mdhd', 0, 0, u32(0), u32(0), u32(TIMESCALE), u32(mediaDuration), u16(0x55c4), u16(0));
  const hdlr = fullBox('hdlr', 0, 0, u32(0), text('vide'), zeros(12), text('Cinemor video'), u8(0));
  const vmhd = fullBox('vmhd', 0, 1, u16(0), zeros(6));
  const dinf = box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1)));
  const stsd = fullBox('stsd', 0, 0, u32(1), sampleEntry(codec, width, height, config));
  const stts = fullBox('stts', 0, 0, u32(1), u32(count), u32(frameDuration));
  const keyList = keys.map((k, i) => (k ? i + 1 : 0)).filter(Boolean);
  const stss = fullBox('stss', 0, 0, u32(keyList.length), keyList.map(u32));
  const stsc = fullBox('stsc', 0, 0, u32(1), u32(1), u32(count), u32(1)); // every frame in one chunk
  const stsz = fullBox('stsz', 0, 0, u32(0), u32(count), sizes.map(u32));
  const stco = fullBox('stco', 0, 0, u32(1), u32(dataOffset));
  const stbl = box('stbl', stsd, stts, stss, stsc, stsz, stco);
  const trak = box('trak', tkhd, box('mdia', mdhd, hdlr, box('minf', vmhd, dinf, stbl)));
  return box('moov', mvhd, trak);
}

/** The finished .mp4 file as a Blob. */
export function writeMp4({ codec, width, height, fps, config, samples }) {
  const ftyp = box('ftyp', text('isom'), u32(512), text('isom'), text('iso2'), text(codec === 'avc' ? 'avc1' : 'vp09'), text('mp41'));
  const sizes = samples.map((smp) => smp.data.byteLength);
  const keys = samples.map((smp) => smp.key);
  const frameDuration = Math.round(TIMESCALE / fps);
  const base = { codec, width, height, config, sizes, keys, frameDuration };
  // the index's size does not depend on where the frames start, so measure it once, then write it with the real offset
  const size = moov({ ...base, dataOffset: 0 }).length;
  const total = sizes.reduce((a, b) => a + b, 0);
  const head = new Uint8Array([...ftyp, ...moov({ ...base, dataOffset: ftyp.length + size + 8 }), ...u32(total + 8), ...text('mdat')]);
  return new Blob([head, ...samples.map((smp) => smp.data)], { type: 'video/mp4' });
}
