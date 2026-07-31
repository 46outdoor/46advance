import { describe, it, expect } from 'vitest';
import { savePacketToDriveInputSchema } from './googleDrive.js';

/**
 * Same defect as generatePacket (#212): the client wrapper sent `version` unconditionally, so the
 * no-version call put `undefined` on the wire, the callable client encoded that as `null`, and the
 * `.optional()` schema rejected it with invalid-argument → 400.
 *
 * Here the undefined path is a **first-ever save** — there's no replace/bump choice to make, so the
 * UI passes `number | undefined`. An event that already had a saved packet always passed a real
 * version, which is why this half went unnoticed alongside #212.
 */
describe('savePacketToDriveInputSchema — version', () => {
  const base = { eventId: 'evt-1', path: 'events/evt-1/packets/1.pdf' };

  it.each([
    ['omitted', base],
    ['undefined', { ...base, version: undefined }],
    ['null (a first save, once encoded)', { ...base, version: null }],
  ])('accepts version %s', (_label, input) => {
    expect(savePacketToDriveInputSchema.safeParse(input).success).toBe(true);
  });

  it('accepts an explicit version', () => {
    const parsed = savePacketToDriveInputSchema.safeParse({ ...base, version: 2 });
    expect(parsed.success && parsed.data.version).toBe(2);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 2.5],
    ['a string', '2'],
  ])('still rejects %s', (_label, version) => {
    expect(savePacketToDriveInputSchema.safeParse({ ...base, version }).success).toBe(false);
  });

  it('still requires eventId and path', () => {
    expect(savePacketToDriveInputSchema.safeParse({ path: base.path }).success).toBe(false);
    expect(savePacketToDriveInputSchema.safeParse({ eventId: base.eventId }).success).toBe(false);
  });
});
