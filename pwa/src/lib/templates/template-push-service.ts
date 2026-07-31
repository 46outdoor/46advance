/**
 * Push a template's production content onto events that already exist (callable wrapper).
 *
 * Thin by design: the `pushTemplateProduction` callable owns every decision — which fields
 * differ, how template stages match event stages, and the write itself. One callable serves
 * both preview and apply so the two can't drift; the caller flips `dryRun`.
 *
 * Errors surface as the raw `FirebaseError` so callers can run them through
 * `describeCallableError` (`@/lib/errors/callableError`) at the point of display.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import type {
  PushTemplateProductionInput,
  PushTemplateProductionOutput,
} from '@contracts/callables/templates';

/**
 * Targets per call, mirroring `pushTemplateProductionInputSchema`'s `.max(25)`. Exported so
 * the UI can cap selection instead of letting the callable reject the whole request.
 */
export const PUSH_TARGET_LIMIT = 25;

/**
 * Preview (`dryRun: true`) or perform (`dryRun: false`) the push. A dry run writes nothing
 * and returns the same per-event diff the apply recomputes, so the preview a user approves
 * is the work that runs.
 */
export async function pushTemplateProduction(
  input: PushTemplateProductionInput,
): Promise<PushTemplateProductionOutput> {
  const callable = httpsCallable<PushTemplateProductionInput, PushTemplateProductionOutput>(
    functions,
    'pushTemplateProduction',
  );
  const result = await callable(input);
  return result.data;
}
