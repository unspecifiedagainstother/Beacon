// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * File metadata detection and removal, without external libraries.
 *
 * Every stripper takes the original bytes and returns a cleaned copy plus a
 * human-readable list of what it found. Where the container has internal
 * offsets (PDF xref tables, MP4 chunk offsets) metadata is overwritten in
 * place at the same length instead of removed, so the file stays valid.
 *
 *   JPEG   EXIF/XMP (APP1), IPTC (APP13), other APPn except ICC/Adobe, COM
 *   PNG    tEXt, zTXt, iTXt, eXIf, tIME
 *   WebP   EXIF and XMP chunks (and their VP8X flags)
 *   GIF    comment and application extensions (except looping)
 *   PDF    Info dictionary values, XMP packets
 *   OOXML  docProps/core.xml, app.xml, custom.xml (docx, xlsx, pptx, ...)
 *   ODF    meta.xml (odt, ods, odp, ...); entry timestamps in both
 *   MP3    ID3v2 and ID3v1 tags
 *   MP4    udta/meta/XMP boxes, creation/modification times (mp4, m4a, mov)
 */

// Byte-level container parsing: bit operations and in-place writes into the
// working copy are the point of this file.
/* oxlint-disable no-bitwise, no-param-reassign */

export type MetadataKind =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'gif'
  | 'pdf'
  | 'zip-office'
  | 'mp3'
  | 'mp4';

export type MetadataResult = {
  kind: MetadataKind | undefined;
  /** What was found, e.g. "camera details and location (EXIF)". */
  found: Array<string>;
  /** Cleaned bytes; the input itself when nothing was found or unsupported. */
  data: Uint8Array<ArrayBuffer>;
  /** Something could not be removed (see `notes`). */
  partial: boolean;
  notes: Array<string>;
};

const latin1 = (
  bytes: Uint8Array<ArrayBuffer>,
  start = 0,
  end = bytes.length
) => {
  let out = '';
  for (let i = start; i < end; i += 1) {
    out += String.fromCharCode(bytes[i] ?? 0);
  }
  return out;
};

const u16be = (b: Uint8Array<ArrayBuffer>, o: number) =>
  ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
const u32be = (b: Uint8Array<ArrayBuffer>, o: number) =>
  (((b[o] ?? 0) << 24) |
    ((b[o + 1] ?? 0) << 16) |
    ((b[o + 2] ?? 0) << 8) |
    (b[o + 3] ?? 0)) >>>
  0;
const u16le = (b: Uint8Array<ArrayBuffer>, o: number) =>
  (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
const u32le = (b: Uint8Array<ArrayBuffer>, o: number) =>
  ((b[o] ?? 0) |
    ((b[o + 1] ?? 0) << 8) |
    ((b[o + 2] ?? 0) << 16) |
    ((b[o + 3] ?? 0) << 24)) >>>
  0;

function concat(
  parts: ReadonlyArray<Uint8Array<ArrayBuffer>>
): Uint8Array<ArrayBuffer> {
  let total = 0;
  for (const part of parts) {
    total += part.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function result(
  kind: MetadataKind | undefined,
  data: Uint8Array<ArrayBuffer>,
  found: Array<string> = [],
  notes: Array<string> = []
): MetadataResult {
  return {
    kind,
    data,
    found: [...new Set(found)],
    partial: notes.length > 0,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export function detectKind(
  bytes: Uint8Array<ArrayBuffer>,
  fileName = ''
): MetadataKind | undefined {
  const head = latin1(bytes, 0, Math.min(bytes.length, 16));
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return 'jpeg';
  }
  if (head.startsWith('\x89PNG\r\n\x1a\n')) {
    return 'png';
  }
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') {
    return 'webp';
  }
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) {
    return 'gif';
  }
  if (head.startsWith('%PDF-')) {
    return 'pdf';
  }
  if (head.startsWith('ID3') || /\.mp3$/i.test(fileName)) {
    return 'mp3';
  }
  if (head.slice(4, 8) === 'ftyp') {
    return 'mp4';
  }
  if (
    head.startsWith('PK\x03\x04') &&
    /\.(docx|docm|xlsx|xlsm|pptx|pptm|odt|ods|odp|odg|epub|vsdx)$/i.test(
      fileName
    )
  ) {
    return 'zip-office';
  }
  return undefined;
}

/** File types Beacon cannot inspect but which commonly carry metadata. */
export function isUncleanableDocument(fileName: string): boolean {
  return /\.(doc|xls|ppt|rtf|heic|heif|tiff?|raw|cr2|nef|arw|dng|psd|ai|svg|flac|ogg|opus|wav|aiff?|mkv|avi|wmv|webm)$/i.test(
    fileName
  );
}

export function stripMetadata(
  input: Uint8Array<ArrayBuffer>,
  fileName = ''
): MetadataResult {
  const kind = detectKind(input, fileName);
  try {
    switch (kind) {
      case 'jpeg':
        return stripJpeg(input);
      case 'png':
        return stripPng(input);
      case 'webp':
        return stripWebp(input);
      case 'gif':
        return stripGif(input);
      case 'pdf':
        return stripPdf(input);
      case 'zip-office':
        return stripOfficeZip(input);
      case 'mp3':
        return stripMp3(input);
      case 'mp4':
        return stripMp4(input);
      default:
        return result(undefined, input);
    }
  } catch (error) {
    return result(
      kind,
      input,
      [],
      [
        `Could not parse the file: ${error instanceof Error ? error.message : String(error)}`,
      ]
    );
  }
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

function stripJpeg(input: Uint8Array<ArrayBuffer>): MetadataResult {
  const keep: Array<Uint8Array<ArrayBuffer>> = [input.subarray(0, 2)];
  const found: Array<string> = [];
  let offset = 2;

  while (offset + 4 <= input.length) {
    if (input[offset] !== 0xff) {
      throw new Error('bad JPEG marker');
    }
    const marker = input[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0xda) {
      // Start of scan: the rest is image data.
      keep.push(input.subarray(offset));
      break;
    }
    if (
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      marker === 0x01
    ) {
      keep.push(input.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    const length = u16be(input, offset + 2);
    const segment = input.subarray(offset, offset + 2 + length);
    const id = latin1(
      input,
      offset + 4,
      Math.min(offset + 4 + 30, input.length)
    );

    let drop = false;
    if (marker === 0xe1) {
      drop = true;
      found.push(
        id.startsWith('Exif')
          ? 'camera details, dates and possibly location (EXIF)'
          : 'XMP metadata'
      );
    } else if (marker === 0xed) {
      drop = true;
      found.push('IPTC/Photoshop data');
    } else if (marker === 0xfe) {
      drop = true;
      found.push('comment');
    } else if (marker >= 0xe2 && marker <= 0xef) {
      // ICC profile (APP2) and Adobe (APP14) affect how colours decode.
      const isIcc = marker === 0xe2 && id.startsWith('ICC_PROFILE');
      const isAdobe = marker === 0xee && id.startsWith('Adobe');
      if (!isIcc && !isAdobe) {
        drop = true;
        found.push('application data');
      }
    }
    if (!drop) {
      keep.push(segment);
    }
    offset += 2 + length;
  }

  return found.length
    ? result('jpeg', concat(keep), found)
    : result('jpeg', input);
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_DROP: Record<string, string> = {
  tEXt: 'text fields (author, software, ...)',
  zTXt: 'text fields (author, software, ...)',
  iTXt: 'text fields or XMP',
  eXIf: 'camera details and possibly location (EXIF)',
  tIME: 'last-modified time',
};

function stripPng(input: Uint8Array<ArrayBuffer>): MetadataResult {
  const keep: Array<Uint8Array<ArrayBuffer>> = [input.subarray(0, 8)];
  const found: Array<string> = [];
  let offset = 8;
  while (offset + 12 <= input.length) {
    const length = u32be(input, offset);
    const type = latin1(input, offset + 4, offset + 8);
    const end = offset + 12 + length;
    const label = PNG_DROP[type];
    if (label) {
      found.push(label);
    } else {
      keep.push(input.subarray(offset, end));
    }
    offset = end;
    if (type === 'IEND') {
      break;
    }
  }
  return found.length
    ? result('png', concat(keep), found)
    : result('png', input);
}

// ---------------------------------------------------------------------------
// WebP
// ---------------------------------------------------------------------------

function stripWebp(input: Uint8Array<ArrayBuffer>): MetadataResult {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  const found: Array<string> = [];
  let offset = 12;
  while (offset + 8 <= input.length) {
    const type = latin1(input, offset, offset + 4);
    const size = u32le(input, offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (type === 'EXIF') {
      found.push('camera details and possibly location (EXIF)');
    } else if (type === 'XMP ') {
      found.push('XMP metadata');
    } else {
      chunks.push(input.slice(offset, end));
    }
    offset = end;
  }
  if (!found.length) {
    return result('webp', input);
  }
  for (const chunk of chunks) {
    if (latin1(chunk, 0, 4) === 'VP8X' && chunk.length > 8) {
      // Clear the EXIF (0x08) and XMP (0x04) presence flags.
      chunk[8] = (chunk[8] ?? 0) & ~0x0c;
    }
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(input.subarray(0, 12));
  const riffSize = body.length + 4;
  header[4] = riffSize & 0xff;
  header[5] = (riffSize >>> 8) & 0xff;
  header[6] = (riffSize >>> 16) & 0xff;
  header[7] = (riffSize >>> 24) & 0xff;
  return result('webp', concat([header, body]), found);
}

// ---------------------------------------------------------------------------
// GIF
// ---------------------------------------------------------------------------

function skipSubBlocks(input: Uint8Array<ArrayBuffer>, offset: number): number {
  let o = offset;
  while (o < input.length) {
    const size = input[o] ?? 0;
    o += 1;
    if (size === 0) {
      return o;
    }
    o += size;
  }
  throw new Error('truncated GIF');
}

function stripGif(input: Uint8Array<ArrayBuffer>): MetadataResult {
  const found: Array<string> = [];
  const keep: Array<Uint8Array<ArrayBuffer>> = [];
  const flags = input[10] ?? 0;
  let offset = 13;
  if (flags & 0x80) {
    offset += 3 * (1 << ((flags & 0x07) + 1));
  }
  keep.push(input.subarray(0, offset));

  while (offset < input.length) {
    const block = input[offset];
    if (block === 0x3b) {
      keep.push(input.subarray(offset, offset + 1));
      break;
    }
    if (block === 0x21) {
      const label = input[offset + 1];
      const end = skipSubBlocks(input, offset + 2);
      if (label === 0xfe) {
        found.push('comment');
      } else if (label === 0xff) {
        const app = latin1(input, offset + 3, offset + 14);
        if (app.startsWith('NETSCAPE2.0') || app.startsWith('ANIMEXTS1.0')) {
          keep.push(input.subarray(offset, end));
        } else {
          found.push(
            app.startsWith('XMP Data') ? 'XMP metadata' : 'application data'
          );
        }
      } else {
        keep.push(input.subarray(offset, end));
      }
      offset = end;
    } else if (block === 0x2c) {
      const localFlags = input[offset + 9] ?? 0;
      let o = offset + 10;
      if (localFlags & 0x80) {
        o += 3 * (1 << ((localFlags & 0x07) + 1));
      }
      o += 1; // LZW minimum code size
      const end = skipSubBlocks(input, o);
      keep.push(input.subarray(offset, end));
      offset = end;
    } else {
      throw new Error('bad GIF block');
    }
  }
  return found.length
    ? result('gif', concat(keep), found)
    : result('gif', input);
}

// ---------------------------------------------------------------------------
// PDF — same-length, in-place
// ---------------------------------------------------------------------------

const PDF_INFO_KEYS = [
  'Author',
  'Creator',
  'Producer',
  'Title',
  'Subject',
  'Keywords',
  'CreationDate',
  'ModDate',
  'Company',
  'Manager',
  'SourceModified',
];

function blankRange(
  bytes: Uint8Array<ArrayBuffer>,
  start: number,
  end: number,
  fill = 0x20
) {
  for (let i = start; i < end; i += 1) {
    bytes[i] = fill;
  }
}

/** Blanks a PDF string value starting at `start`; returns true if non-empty. */
function blankPdfString(
  bytes: Uint8Array<ArrayBuffer>,
  start: number
): boolean {
  if (bytes[start] === 0x28) {
    // (literal) with nesting and backslash escapes
    let depth = 0;
    let i = start;
    for (; i < bytes.length; i += 1) {
      const c = bytes[i];
      if (c === 0x5c) {
        i += 1;
      } else if (c === 0x28) {
        depth += 1;
      } else if (c === 0x29) {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
    }
    const nonEmpty = i - start > 1 && /\S/.test(latin1(bytes, start + 1, i));
    blankRange(bytes, start + 1, i);
    return nonEmpty;
  }
  if (bytes[start] === 0x3c && bytes[start + 1] !== 0x3c) {
    const end = bytes.indexOf(0x3e, start);
    const nonEmpty =
      end - start > 1 && /[1-9a-f]/i.test(latin1(bytes, start + 1, end));
    blankRange(bytes, start + 1, end, 0x30); // '0' keeps it valid hex
    return nonEmpty;
  }
  return false;
}

function stripPdf(input: Uint8Array<ArrayBuffer>): MetadataResult {
  const bytes = input.slice();
  const text = latin1(bytes);
  const found: Array<string> = [];
  const notes: Array<string> = [];

  // 1. Info dictionaries named by every trailer / xref stream.
  const infoRefs = new Set<string>();
  for (const match of text.matchAll(/\/Info\s+(\d+)\s+(\d+)\s+R/g)) {
    infoRefs.add(`${match[1]} ${match[2]}`);
  }
  for (const ref of infoRefs) {
    const objRe = new RegExp(
      `(?:^|[\\s>])${ref.replace(' ', '\\s+')}\\s+obj\\b`,
      'g'
    );
    let located = false;
    for (const objMatch of text.matchAll(objRe)) {
      const objStart = objMatch.index ?? 0;
      const objEnd = text.indexOf('endobj', objStart);
      if (objEnd < 0) {
        continue;
      }
      located = true;
      const body = text.slice(objStart, objEnd);
      for (const key of PDF_INFO_KEYS) {
        const keyRe = new RegExp(`/${key}\\s*([(<])`, 'g');
        for (const keyMatch of body.matchAll(keyRe)) {
          const valueAt =
            objStart + (keyMatch.index ?? 0) + keyMatch[0].length - 1;
          if (blankPdfString(bytes, valueAt)) {
            found.push(
              key === 'CreationDate' || key === 'ModDate'
                ? 'creation and edit dates'
                : `${key.toLowerCase()} field`
            );
          }
        }
      }
    }
    if (!located) {
      notes.push(
        'The document info is stored compressed and could not be cleaned.'
      );
    }
  }

  // 2. XMP packets (normally stored uncompressed so tools can find them).
  const packetRe = /<\?xpacket begin=[\s\S]*?<\?xpacket end=['"][rw]['"]\?>/g;
  for (const match of text.matchAll(packetRe)) {
    const start = match.index ?? 0;
    const length = match[0].length;
    if (!/<rdf:Description[\s\S]*?(?:\/>|<\/rdf:Description>)/.test(match[0])) {
      continue;
    }
    const empty =
      '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"/>';
    const tail = '<?xpacket end="w"?>';
    if (empty.length + tail.length <= length) {
      const replacement =
        empty + ' '.repeat(length - empty.length - tail.length) + tail;
      for (let i = 0; i < length; i += 1) {
        bytes[start + i] = replacement.charCodeAt(i);
      }
    } else {
      blankRange(bytes, start, start + length);
    }
    found.push('XMP metadata (author, software, history)');
  }
  if (/\/Type\s*\/Metadata\s*\/Subtype\s*\/XML[^>]*\/Filter/.test(text)) {
    notes.push('A compressed XMP stream could not be cleaned.');
  }

  return found.length || notes.length
    ? result('pdf', found.length ? bytes : input, found, notes)
    : result('pdf', input);
}

// ---------------------------------------------------------------------------
// OOXML / ODF zip containers
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array<ArrayBuffer>): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const MINIMAL_PARTS: Record<string, { label: string; xml: string }> = {
  'docProps/core.xml': {
    label: 'author, last editor and edit dates',
    xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>',
  },
  'docProps/app.xml': {
    label: 'company, manager, editing time and software',
    xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"/>',
  },
  'docProps/custom.xml': {
    label: 'custom document properties',
    xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"/>',
  },
  'meta.xml': {
    label: 'author, edit dates, editing time and software',
    xml: '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2"><office:meta/></office:document-meta>',
  },
};

// 1980-01-01 00:00 in DOS format.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

function stripOfficeZip(input: Uint8Array<ArrayBuffer>): MetadataResult {
  // End of central directory: last 22..65557 bytes.
  let eocd = -1;
  for (
    let i = input.length - 22;
    i >= Math.max(0, input.length - 65557);
    i -= 1
  ) {
    if (u32le(input, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('no zip directory');
  }
  const count = u16le(input, eocd + 10);
  const cdOffset = u32le(input, eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) {
    return result(
      'zip-office',
      input,
      [],
      ['Very large (zip64) documents are not supported.']
    );
  }

  const encoder = new TextEncoder();
  const locals: Array<Uint8Array<ArrayBuffer>> = [];
  const centrals: Array<Uint8Array<ArrayBuffer>> = [];
  const found: Array<string> = [];
  let written = 0;
  let p = cdOffset;

  for (let n = 0; n < count; n += 1) {
    if (u32le(input, p) !== 0x02014b50) {
      throw new Error('bad zip directory');
    }
    const flags = u16le(input, p + 8);
    let method = u16le(input, p + 10);
    let crc = u32le(input, p + 16);
    let compressed = u32le(input, p + 20);
    let uncompressed = u32le(input, p + 24);
    const nameLength = u16le(input, p + 28);
    const extraLength = u16le(input, p + 30);
    const commentLength = u16le(input, p + 32);
    const localOffset = u32le(input, p + 42);
    const nameBytes = input.subarray(p + 46, p + 46 + nameLength);
    const name = new TextDecoder().decode(nameBytes);
    p += 46 + nameLength + extraLength + commentLength;

    if (flags & 0x01) {
      return result(
        'zip-office',
        input,
        [],
        ['Password-protected documents cannot be cleaned.']
      );
    }
    if (
      compressed === 0xffffffff ||
      uncompressed === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      return result(
        'zip-office',
        input,
        [],
        ['Very large (zip64) documents are not supported.']
      );
    }

    let data: Uint8Array<ArrayBuffer>;
    const replacement = MINIMAL_PARTS[name];
    if (replacement) {
      data = encoder.encode(replacement.xml);
      method = 0;
      crc = crc32(data);
      compressed = data.length;
      uncompressed = data.length;
      found.push(replacement.label);
    } else {
      const localNameLength = u16le(input, localOffset + 26);
      const localExtraLength = u16le(input, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      data = input.subarray(dataStart, dataStart + compressed);
    }

    const local = new Uint8Array(30 + nameLength);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, flags & ~0x08 & 0x0806, true); // keep UTF-8 + compression hints
    lv.setUint16(8, method, true);
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed, true);
    lv.setUint32(22, uncompressed, true);
    lv.setUint16(26, nameLength, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameLength);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, flags & ~0x08 & 0x0806, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressed, true);
    cv.setUint32(24, uncompressed, true);
    cv.setUint16(28, nameLength, true);
    cv.setUint32(42, written, true);
    central.set(nameBytes, 46);

    locals.push(local, data);
    centrals.push(central);
    written += local.length + data.length;
  }

  let centralSize = 0;
  for (const c of centrals) {
    centralSize += c.length;
  }
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, count, true);
  ev.setUint16(10, count, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, written, true);

  found.push('file timestamps inside the document');
  return result('zip-office', concat([...locals, ...centrals, end]), found);
}

// ---------------------------------------------------------------------------
// MP3
// ---------------------------------------------------------------------------

function stripMp3(input: Uint8Array<ArrayBuffer>): MetadataResult {
  let start = 0;
  let end = input.length;
  const found: Array<string> = [];
  // Several ID3v2 tags can be stacked.
  while (latin1(input, start, start + 3) === 'ID3') {
    const size =
      ((input[start + 6] ?? 0) << 21) |
      ((input[start + 7] ?? 0) << 14) |
      ((input[start + 8] ?? 0) << 7) |
      (input[start + 9] ?? 0);
    const footer = (input[start + 5] ?? 0) & 0x10 ? 10 : 0;
    start += 10 + size + footer;
    found.push('title, artist, cover art and other tags (ID3)');
  }
  if (end - start >= 128 && latin1(input, end - 128, end - 125) === 'TAG') {
    end -= 128;
    found.push('ID3v1 tag');
  }
  return found.length
    ? result('mp3', input.slice(start, end), found)
    : result('mp3', input);
}

// ---------------------------------------------------------------------------
// MP4 / MOV / M4A — in place: metadata boxes become zeroed 'free' boxes
// ---------------------------------------------------------------------------

const MP4_CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'edts']);

function stripMp4(input: Uint8Array<ArrayBuffer>): MetadataResult {
  const bytes = input.slice();
  const found: Array<string> = [];

  const freeBox = (offset: number, size: number) => {
    bytes[offset + 4] = 0x66; // f
    bytes[offset + 5] = 0x72; // r
    bytes[offset + 6] = 0x65; // e
    bytes[offset + 7] = 0x65; // e
    blankRange(bytes, offset + 8, offset + size, 0);
  };

  const zeroTimes = (offset: number) => {
    // Full box: version(1) flags(3), then creation + modification time.
    const version = bytes[offset + 8];
    const width = version === 1 ? 8 : 4;
    const from = offset + 12;
    const to = from + width * 2;
    const hadDate = bytes.subarray(from, to).some(byte => byte !== 0);
    blankRange(bytes, from, to, 0);
    return hadDate;
  };

  const walk = (start: number, end: number, depth: number) => {
    let offset = start;
    while (offset + 8 <= end) {
      let size = u32be(bytes, offset);
      const type = latin1(bytes, offset + 4, offset + 8);
      if (size === 1) {
        // 64-bit size; upper half must be 0 for anything we can hold.
        size = u32be(bytes, offset + 12) + u32be(bytes, offset + 8) * 2 ** 32;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < 8 || offset + size > end) {
        throw new Error('bad MP4 box');
      }

      if (
        type === 'udta' ||
        type === 'meta' ||
        (type === 'uuid' && depth === 0)
      ) {
        freeBox(offset, size);
        found.push(
          type === 'uuid'
            ? 'XMP metadata'
            : 'title, device, location and other tags'
        );
      } else if (type === 'mvhd' || type === 'tkhd' || type === 'mdhd') {
        if (zeroTimes(offset)) {
          found.push('recording date');
        }
      } else if (MP4_CONTAINERS.has(type)) {
        walk(offset + 8, offset + size, depth + 1);
      }
      offset += size;
    }
  };

  walk(0, bytes.length, 0);
  return found.length ? result('mp4', bytes, found) : result('mp4', input);
}
