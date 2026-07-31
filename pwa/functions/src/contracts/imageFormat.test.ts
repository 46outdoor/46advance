import { describe, it, expect } from 'vitest';
import { isEmbeddableImage, sniffImageFormat } from './imageFormat.js';

/**
 * Regression: an event logo was a WebP saved as `logo.png` with contentType `image/png`. Filename,
 * extension and stored contentType all claimed PNG; only the magic bytes told the truth. The PDF
 * renderer embeds PNG/JPEG only, so it threw "Incomplete or corrupt PNG file" — with no indication
 * of WHICH file — and silently omitted the logo. Packets shipped without their event mark.
 */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
/** "RIFF" + 4 size bytes + "WEBP" — the real bytes of the logo that broke production. */
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x30, 0x7d, 0x01, 0x00]),
  Buffer.from('WEBP', 'ascii'),
]);
const GIF = Buffer.from('GIF89a', 'ascii');

describe('sniffImageFormat', () => {
  it.each([
    ['PNG', PNG, 'png'],
    ['JPEG', JPEG, 'jpeg'],
    ['WebP', WEBP, 'webp'],
    ['GIF', GIF, 'gif'],
  ])('identifies %s', (_label, buffer, expected) => {
    expect(sniffImageFormat(buffer)).toBe(expected);
  });

  it('reports unknown for arbitrary bytes', () => {
    expect(sniffImageFormat(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBe('unknown');
  });

  // Truncated input must not throw — a partial read shouldn't crash packet generation.
  it.each([
    ['empty', Buffer.alloc(0)],
    ['one byte', Buffer.from([0x89])],
    ['PNG signature cut short', PNG.subarray(0, 4)],
    ['RIFF header without the WEBP marker', Buffer.from('RIFF', 'ascii')],
  ])('handles %s without throwing', (_label, buffer) => {
    expect(() => sniffImageFormat(buffer)).not.toThrow();
    expect(sniffImageFormat(buffer)).toBe('unknown');
  });

  // A RIFF container that isn't WebP (e.g. WAV) must not be mistaken for one.
  it('does not treat every RIFF container as WebP', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE', 'ascii'),
    ]);
    expect(sniffImageFormat(wav)).toBe('unknown');
  });
});

describe('isEmbeddableImage', () => {
  it('accepts only what the PDF renderer can embed', () => {
    expect(isEmbeddableImage(PNG)).toBe(true);
    expect(isEmbeddableImage(JPEG)).toBe(true);
    expect(isEmbeddableImage(WEBP)).toBe(false);
    expect(isEmbeddableImage(GIF)).toBe(false);
  });
});
