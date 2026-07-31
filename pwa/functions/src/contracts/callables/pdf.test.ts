import { describe, it, expect } from 'vitest';
import { generatePacketInputSchema } from './pdf.js';

/**
 * Regression: "Generate packet" returned 400 for a week (#194 → 2026-07-31).
 *
 * The client wrapper sent `{ eventId, version }` unconditionally, so the no-version path put
 * `version: undefined` on the wire. The Firebase callable client encodes with
 * `if (data == null) return null` — loose equality — so that arrived as `null`, and the then
 * `.optional()` schema rejected it with invalid-argument. Save-to-Drive kept working because it
 * always passes an explicit version, which is why the break went unnoticed.
 *
 * The schema must accept all three spellings of "no version given".
 */
describe('generatePacketInputSchema — version', () => {
  it.each([
    ['omitted', { eventId: 'evt-1' }],
    ['undefined', { eventId: 'evt-1', version: undefined }],
    ['null (what an undefined property becomes on the wire)', { eventId: 'evt-1', version: null }],
  ])('accepts version %s', (_label, input) => {
    expect(generatePacketInputSchema.safeParse(input).success).toBe(true);
  });

  it('accepts an explicit version', () => {
    const parsed = generatePacketInputSchema.safeParse({ eventId: 'evt-1', version: 3 });
    expect(parsed.success && parsed.data.version).toBe(3);
  });

  // Still a real schema, not a rubber stamp — the handler uses the value as a version number.
  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['a string', '2'],
  ])('still rejects %s', (_label, version) => {
    expect(generatePacketInputSchema.safeParse({ eventId: 'evt-1', version }).success).toBe(false);
  });

  it('still requires eventId', () => {
    expect(generatePacketInputSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(generatePacketInputSchema.safeParse({ eventId: '' }).success).toBe(false);
  });
});
