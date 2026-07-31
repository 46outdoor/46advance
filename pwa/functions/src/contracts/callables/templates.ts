/**
 * Callable contract schemas — templates domain (pushTemplateProduction).
 *
 * Pushing a master template's production content onto events that already exist. Deliberately
 * narrower than create-from-template: only the production record and the per-stage house
 * packages. Roles and schedule templates are excluded because they'd change who can see a live
 * show, and seed days into schedules that already have real content.
 *
 * Field labels are NOT resolved here — the field registry lives client-side
 * (`src/lib/advances/fields.ts`) and the functions runtime has no copy, so changes carry raw
 * keys and the client renders them. Pure Zod — see ./auth.ts header.
 */
import { z } from 'zod';

/** Which production content the push writes. Both default true; the caller narrows. */
export const templatePushIncludeSchema = z.object({
  /** `events/{id}/production/record` — info fields, production contacts, reference links. */
  production: z.boolean().default(true),
  /** `events/{id}/stages/{stageId}/production/record` — the per-stage house packages. */
  stageProduction: z.boolean().default(true),
});
export type TemplatePushInclude = z.infer<typeof templatePushIncludeSchema>;

/**
 * One field-level difference. `from` is the target event's current value, `to` the template's —
 * both rendered as text so the preview needs no type knowledge. An empty `from` means unset.
 *
 * `contacts` and `links` are whole-array units rather than per-entry diffs: they're ordered
 * lists with no stable identity, so an element-wise diff would be noise. For those, `from`/`to`
 * carry entry counts and the push replaces the array outright.
 */
export const templatePushChangeSchema = z.object({
  scope: z.enum(['eventProduction', 'stageProduction']),
  /** Set only when scope is `stageProduction` — the event stage matched by name. */
  stageName: z.string().nullable(),
  /** Set only when scope is `stageProduction`. */
  departmentId: z.string().nullable(),
  /** Field key within the section, or the literal `contacts` / `links` array units. */
  key: z.string(),
  from: z.string(),
  to: z.string(),
});
export type TemplatePushChange = z.infer<typeof templatePushChangeSchema>;

export const templatePushEventDiffSchema = z.object({
  eventId: z.string(),
  eventName: z.string(),
  changes: z.array(templatePushChangeSchema),
  /**
   * Template stages with no same-named stage on this event. Stage ids differ between a template
   * and the events seeded from it, so matching is by (trimmed, lowercased) name — and a template
   * stage that matches nothing is reported here rather than created. The push never adds stages
   * to an existing event.
   */
  skippedStages: z.array(z.string()),
});
export type TemplatePushEventDiff = z.infer<typeof templatePushEventDiffSchema>;

/**
 * One callable serves both preview and apply so the two can't drift: `dryRun` computes the diff
 * and writes nothing, and apply recomputes it identically before writing. Targets are always an
 * explicit list — there is intentionally no "push to every event" mode, because the write isn't
 * reversible.
 */
export const pushTemplateProductionInputSchema = z.object({
  templateId: z.string().min(1),
  eventIds: z.array(z.string().min(1)).min(1).max(25),
  include: templatePushIncludeSchema.optional(),
  dryRun: z.boolean(),
});
export type PushTemplateProductionInput = z.infer<typeof pushTemplateProductionInputSchema>;

export const pushTemplateProductionOutputSchema = z.object({
  /** Echoes the request so a caller can't mistake a preview for a completed write. */
  dryRun: z.boolean(),
  events: z.array(templatePushEventDiffSchema),
});
export type PushTemplateProductionOutput = z.infer<typeof pushTemplateProductionOutputSchema>;
