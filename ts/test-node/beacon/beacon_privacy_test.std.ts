// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  crc32,
  detectKind,
  stripMetadata,
} from '../../beacon/util/metadata.std.ts';
import {
  analyzeLink,
  isTrustedSite,
  siteOf,
  toUnicodeHost,
} from '../../beacon/util/linkSafety.std.ts';
import {
  decryptExport,
  encryptExport,
  isEncryptedExport,
} from '../../beacon/util/encryptedExport.std.ts';
import {
  addBeaconAsyncFilter,
  applyBeaconAsyncFilter,
} from '../../beacon/core/filters.std.ts';

const enc = (s: string) => new TextEncoder().encode(s);
const bytes = (...parts: Array<Array<number> | string>) => {
  const out: Array<number> = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      for (const ch of part) {
        out.push(ch.charCodeAt(0));
      }
    } else {
      out.push(...part);
    }
  }
  return new Uint8Array(out);
};
const text = (b: Uint8Array<ArrayBuffer>) => String.fromCharCode(...b);

describe('beacon metadata stripping', () => {
  it('removes EXIF and comments from JPEG but keeps ICC', () => {
    const exif = [0xff, 0xe1, 0x00, 0x0a, ...enc('Exif\0\0GPS')].slice(0, 12);
    const icc = [0xff, 0xe2, 0x00, 0x0e, ...enc('ICC_PROFILE\0')];
    const com = [0xff, 0xfe, 0x00, 0x06, ...enc('hey!')];
    const sos = [0xff, 0xda, 0x00, 0x02, 1, 2, 3, 0xff, 0xd9];
    const input = bytes([0xff, 0xd8], exif, icc, com, sos);
    const result = stripMetadata(input);
    assert.strictEqual(result.kind, 'jpeg');
    assert.isAbove(result.found.length, 0);
    const out = text(result.data);
    assert.notInclude(out, 'Exif');
    assert.notInclude(out, 'hey!');
    assert.include(out, 'ICC_PROFILE');
    assert.deepEqual([...result.data.slice(-9)], sos);
  });

  it('removes PNG text chunks', () => {
    const chunk = (type: string, data: string) => {
      const len = data.length;
      return bytes(
        [0, 0, Math.floor(len / 256), len % 256],
        type,
        data,
        [0, 0, 0, 0]
      );
    };
    const input = new Uint8Array([
      ...bytes('\x89PNG\r\n\x1a\n'),
      ...chunk('IHDR', '1234567890123'),
      ...chunk('tEXt', 'Author\0Jo'),
      ...chunk('IDAT', 'xx'),
      ...chunk('IEND', ''),
    ]);
    const result = stripMetadata(input);
    assert.strictEqual(result.kind, 'png');
    assert.notInclude(text(result.data), 'Author');
    assert.include(text(result.data), 'IDAT');
  });

  it('blanks the PDF Info dictionary in place', () => {
    const pdf = [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Outlines 2 0 R >> endobj',
      '2 0 obj << /Title (Chapter one) >> endobj',
      '3 0 obj << /Author (Jo Bloggs) /Producer <4142> /Title (Secret plan) >> endobj',
      'trailer << /Root 1 0 R /Info 3 0 R >>',
      '%%EOF',
    ].join('\n');
    const input = enc(pdf);
    const result = stripMetadata(input);
    const out = text(result.data);
    assert.strictEqual(result.data.length, input.length, 'length preserved');
    assert.notInclude(out, 'Jo Bloggs');
    assert.notInclude(out, 'Secret plan');
    assert.include(out, '<0000>');
    assert.include(out, 'Chapter one', 'outline titles untouched');
  });

  it('replaces docProps in an OOXML zip', () => {
    const entries = [
      { name: '[Content_Types].xml', data: enc('<Types/>') },
      {
        name: 'docProps/core.xml',
        data: enc('<cp><dc:creator>Jo</dc:creator></cp>'),
      },
    ];
    const locals: Array<Uint8Array<ArrayBuffer>> = [];
    const centrals: Array<Uint8Array<ArrayBuffer>> = [];
    let offset = 0;
    for (const { name, data } of entries) {
      const nameBytes = enc(name);
      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint32(14, crc32(data), true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint32(16, crc32(data), true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      locals.push(local, data);
      centrals.push(central);
      offset += local.length + data.length;
    }
    const cdSize = centrals.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, 2, true);
    ev.setUint16(10, 2, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    const zip = new Uint8Array(
      [...locals, ...centrals, end].map(part => [...part]).flat()
    );

    assert.strictEqual(detectKind(zip, 'a.docx'), 'zip-office');
    const result = stripMetadata(zip, 'a.docx');
    const out = text(result.data);
    assert.notInclude(out, '<dc:creator>Jo');
    assert.include(out, 'coreProperties');
    assert.include(out, '<Types/>');
  });

  it('removes ID3 tags from MP3', () => {
    const id3 = bytes('ID3', [3, 0, 0, 0, 0, 0, 4], 'TIT2');
    const frames = bytes([0xff, 0xfb, 0x90, 0x00]);
    const v1 = new Uint8Array(128);
    v1.set(enc('TAGTitle'));
    const input = new Uint8Array([...id3, ...frames, ...v1]);
    const result = stripMetadata(input, 'song.mp3');
    assert.deepEqual([...result.data], [...frames]);
  });

  it('turns MP4 udta into free and zeroes dates', () => {
    const box = (type: string, body: Uint8Array<ArrayBuffer>) => {
      const out = new Uint8Array(8 + body.length);
      new DataView(out.buffer).setUint32(0, out.length);
      out.set(enc(type), 4);
      out.set(body, 8);
      return out;
    };
    const mvhd = box(
      'mvhd',
      new Uint8Array([0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8])
    );
    const udta = box('udta', enc('©xyz+51.5-0.1'));
    const moov = box('moov', new Uint8Array([...mvhd, ...udta]));
    const ftyp = box('ftyp', enc('isom'));
    const input = new Uint8Array([...ftyp, ...moov]);
    const result = stripMetadata(input, 'clip.mp4');
    const out = text(result.data);
    assert.strictEqual(result.data.length, input.length);
    assert.notInclude(out, 'udta');
    assert.notInclude(out, '+51.5');
    assert.include(out, 'free');
    assert.include(result.found, 'recording date');
  });

  it('leaves unknown files alone', () => {
    const input = enc('just some text');
    const result = stripMetadata(input, 'notes.txt');
    assert.isUndefined(result.kind);
    assert.strictEqual(result.data, input);
  });
});

const warningsOf = (url: string, linkText?: string): Array<string> =>
  analyzeLink(url, linkText)?.warnings ?? [];

describe('beacon link safety', () => {
  it('flags lookalike and risky links', () => {
    assert.include(warningsOf('https://xn--pple-43d.com/'), 'punycode');
    assert.include(warningsOf('http://example.com/'), 'not-https');
    assert.include(warningsOf('https://bit.ly/abc'), 'shortener');
    assert.include(warningsOf('https://10.0.0.1/'), 'ip-address');
    assert.include(
      warningsOf('https://paypal.com@evil.example/'),
      'credentials'
    );
    assert.include(
      warningsOf('https://evil.example/', 'paypal.com/login'),
      'text-mismatch'
    );
    assert.deepEqual(warningsOf('https://signal.org/blog'), []);
  });

  it('decodes punycode for display', () => {
    assert.strictEqual(toUnicodeHost('xn--pple-43d.com'), 'аpple.com');
    assert.strictEqual(toUnicodeHost('xn--mnchen-3ya.de'), 'münchen.de');
  });

  it('computes sites and trust', () => {
    assert.strictEqual(siteOf('www.bbc.co.uk'), 'bbc.co.uk');
    assert.strictEqual(siteOf('a.b.example.com'), 'example.com');
    assert.isTrue(isTrustedSite('support.signal.org', ['signal.org']));
    assert.isFalse(isTrustedSite('notsignal.org', ['signal.org']));
  });
});

describe('beacon encrypted exports', () => {
  it('round-trips and rejects a wrong password', async () => {
    const file = await encryptExport('{"a":1}', 'correct horse', 'log', 1000);
    assert.isTrue(isEncryptedExport(JSON.parse(JSON.stringify(file))));
    assert.strictEqual(await decryptExport(file, 'correct horse'), '{"a":1}');
    let threw = false;
    try {
      await decryptExport(file, 'wrong');
    } catch {
      threw = true;
    }
    assert.isTrue(threw);
  });

  it('authenticates the label', async () => {
    const file = await encryptExport('x', 'pw', 'log', 1000);
    let threw = false;
    try {
      await decryptExport({ ...file, label: 'other' }, 'pw');
    } catch {
      threw = true;
    }
    assert.isTrue(threw);
  });
});

describe('beacon async filters', () => {
  it('chains async filters and allows cancel', async () => {
    const dispose1 = addBeaconAsyncFilter(
      'send.verify',
      async allowed => allowed
    );
    const dispose2 = addBeaconAsyncFilter('send.verify', () => false);
    const result = await applyBeaconAsyncFilter('send.verify', true, {
      conversationIds: [],
      serviceIds: [],
      source: 'MessageSend',
    });
    assert.isFalse(result);
    dispose1();
    dispose2();
  });
});
