/**
 * Bridge between the pure contract schemas (functions/src/contracts) and Firebase
 * callables: validate `request.data` against a schema and throw an
 * `invalid-argument` HttpsError (not a raw ZodError) on mismatch, so the client
 * receives a clean Functions error. Returns the parsed, typed input.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import type { ZodType } from 'zod';

export function parseCallableData<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new HttpsError('invalid-argument', `Invalid request data — ${detail}`);
  }
  return result.data;
}
