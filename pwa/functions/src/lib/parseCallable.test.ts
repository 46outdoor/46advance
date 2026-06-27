import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseCallableData } from './parseCallable';

const schema = z.object({ uid: z.string().min(1), approved: z.boolean() });

describe('parseCallableData', () => {
  it('returns typed data for valid input', () => {
    expect(parseCallableData(schema, { uid: 'u1', approved: true })).toEqual({ uid: 'u1', approved: true });
  });

  it('throws an invalid-argument HttpsError on a field mismatch', () => {
    let err: unknown;
    try {
      parseCallableData(schema, { uid: '', approved: 'yes' });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'invalid-argument' });
  });

  it('throws an invalid-argument HttpsError on a non-object payload', () => {
    let err: unknown;
    try {
      parseCallableData(schema, undefined);
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'invalid-argument' });
  });
});
