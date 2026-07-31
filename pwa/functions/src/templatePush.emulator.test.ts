/**
 * Emulator-backed tests for pushTemplateProduction: pushing a master template's production
 * content onto events that already exist. Covers the admin gate, dry-run preview vs apply, the
 * additive (merge) write contract, name-based stage matching, and the `include` selection.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { beforeEach, describe, expect, it } from 'vitest';
import { pushTemplateProduction } from './index';
import { authContext, callableRequest, clearEmulators, testEnv } from './testing/emulatorHarness';
import type { TemplatePushChange } from './contracts/callables/templates';

if (getApps().length === 0) initializeApp();
const db = getFirestore();

const ADMIN = authContext('admin-uid', { admin: true, approved: true });
const APPROVED = authContext('plain-uid', { approved: true });

const TEMPLATE_ID = 'tpl-house';
const EVENT_ID = 'evt-1';
const EVENT_PRODUCTION = `events/${EVENT_ID}/production/record`;
const STAGE_PRODUCTION = `events/${EVENT_ID}/stages/stage-main/production/record`;

/** The template's blueprint: two stages, only one of which the event has. */
const seedTemplate = () =>
  db.doc(`templates/${TEMPLATE_ID}`).set({
    name: '46 House Package',
    isDefault: true,
    stages: [
      { id: 't1', name: 'Main Stage', order: 0 },
      { id: 't2', name: 'Second Stage', order: 1 },
    ],
    eventProduction: {
      info: { siteContact: 'Pat Reilly', wifi: 'house-wifi' },
      contacts: [{ role: 'PM', name: 'Alex', phone: '555-0100', email: 'alex@example.com' }],
      links: [{ label: 'Site map', url: 'https://example.com/map' }],
    },
    stageProduction: {
      t1: {
        content: {
          audio: { foh_console: 'S6L', main_pa: 'K2' },
          staging: { main_deck: '40x32' },
        },
      },
      t2: { content: { audio: { foh_console: 'CL5' } } },
    },
  });

/**
 * An event created BEFORE the template changed. Its stage is named with different casing
 * (matching is by trimmed/lowercased name), and both records carry event-local content the
 * template knows nothing about.
 */
const seedEvent = async () => {
  await db.doc(`events/${EVENT_ID}`).set({ name: 'Alpha Festival', status: 'draft' });
  await db.doc(EVENT_PRODUCTION).set({
    info: { siteContact: 'Old Contact', localNote: 'keep me' },
    contacts: [],
    links: [],
  });
  await db.doc(`events/${EVENT_ID}/stages/stage-main`).set({ name: 'main stage', order: 0 });
  await db.doc(STAGE_PRODUCTION).set({
    content: { audio: { foh_console: 'X32', local_field: 'keep me' } },
    sections: { audio: { status: 'draft' } },
  });
};

/** `auth: null` calls the callable unauthenticated (an explicit `undefined` would take the default). */
const push = (over: Record<string, unknown> = {}, auth: typeof ADMIN | null = ADMIN) =>
  testEnv.wrap(pushTemplateProduction)(
    callableRequest(
      { templateId: TEMPLATE_ID, eventIds: [EVENT_ID], dryRun: false, ...over },
      auth ?? undefined,
    ),
  );

const change = (changes: TemplatePushChange[], key: string, stageName: string | null = null) =>
  changes.find((c) => c.key === key && c.stageName === stageName);

describe('pushTemplateProduction', () => {
  beforeEach(async () => {
    await clearEmulators();
    await db.doc(`users/${APPROVED.uid}`).set({ approved: true });
    await seedTemplate();
    await seedEvent();
  });

  it('rejects unauthenticated calls', async () => {
    await expect(push({}, null)).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects an approved non-admin (admin only)', async () => {
    await expect(push({}, APPROVED)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects an unknown template without writing anything', async () => {
    await expect(push({ templateId: 'nope' })).rejects.toMatchObject({ code: 'not-found' });
    expect((await db.doc(EVENT_PRODUCTION).get()).get('info')).toEqual({
      siteContact: 'Old Contact',
      localNote: 'keep me',
    });
  });

  it('dryRun previews every change and writes nothing', async () => {
    const res = await push({ dryRun: true });
    expect(res.dryRun).toBe(true);
    expect(res.events).toHaveLength(1);
    const [diff] = res.events;
    expect(diff.eventId).toBe(EVENT_ID);
    expect(diff.eventName).toBe('Alpha Festival');

    // Event production: two info fields + both whole-array units.
    expect(change(diff.changes, 'siteContact')).toMatchObject({
      scope: 'eventProduction',
      departmentId: null,
      from: 'Old Contact',
      to: 'Pat Reilly',
    });
    expect(change(diff.changes, 'wifi')).toMatchObject({ from: '', to: 'house-wifi' });
    // contacts/links are single whole-array changes carrying entry COUNTS, not per-entry diffs.
    expect(change(diff.changes, 'contacts')).toMatchObject({ from: '0', to: '1' });
    expect(change(diff.changes, 'links')).toMatchObject({ from: '0', to: '1' });
    // Stage production, attributed to the matched EVENT stage's name.
    expect(change(diff.changes, 'foh_console', 'main stage')).toMatchObject({
      scope: 'stageProduction',
      departmentId: 'audio',
      from: 'X32',
      to: 'S6L',
    });
    expect(change(diff.changes, 'main_deck', 'main stage')?.departmentId).toBe('staging');

    // Nothing on disk moved.
    const production = await db.doc(EVENT_PRODUCTION).get();
    expect(production.get('info')).toEqual({ siteContact: 'Old Contact', localNote: 'keep me' });
    expect(production.get('contacts')).toEqual([]);
    expect(production.get('updatedAt')).toBeUndefined();
    const stage = await db.doc(STAGE_PRODUCTION).get();
    expect(stage.get('content')).toEqual({ audio: { foh_console: 'X32', local_field: 'keep me' } });
    expect(stage.get('updatedAt')).toBeUndefined();
  });

  it('apply writes exactly the previewed changes', async () => {
    const preview = await push({ dryRun: true });
    const applied = await push();
    expect(applied.dryRun).toBe(false);
    expect(applied.events[0].changes).toEqual(preview.events[0].changes);

    const production = await db.doc(EVENT_PRODUCTION).get();
    expect(production.get('info')).toMatchObject({ siteContact: 'Pat Reilly', wifi: 'house-wifi' });
    expect(production.get('contacts')).toEqual([
      { role: 'PM', name: 'Alex', phone: '555-0100', email: 'alex@example.com' },
    ]);
    expect(production.get('links')).toEqual([
      { label: 'Site map', url: 'https://example.com/map' },
    ]);
    expect(production.get('updatedAt')).toBeDefined();

    const stage = await db.doc(STAGE_PRODUCTION).get();
    expect(stage.get('content')).toMatchObject({
      audio: { foh_console: 'S6L', main_pa: 'K2' },
      staging: { main_deck: '40x32' },
    });
    expect(stage.get('updatedAt')).toBeDefined();
  });

  it('never clobbers content the event has but the template does not', async () => {
    await push();
    // Event-local info key survives alongside the pushed ones.
    expect((await db.doc(EVENT_PRODUCTION).get()).get('info')).toEqual({
      siteContact: 'Pat Reilly',
      localNote: 'keep me',
      wifi: 'house-wifi',
    });
    const stage = await db.doc(STAGE_PRODUCTION).get();
    // Event-local department field survives inside the department the template DID write.
    expect(stage.get('content').audio).toEqual({
      foh_console: 'S6L',
      main_pa: 'K2',
      local_field: 'keep me',
    });
    // Sibling fields on the record (section state machine) are untouched.
    expect(stage.get('sections')).toEqual({ audio: { status: 'draft' } });
  });

  it('reports an unmatched template stage in skippedStages and creates no stage', async () => {
    const res = await push();
    expect(res.events[0].skippedStages).toEqual(['Second Stage']);
    const stages = await db.collection(`events/${EVENT_ID}/stages`).get();
    expect(stages.docs).toHaveLength(1);
    expect(stages.docs[0].id).toBe('stage-main');
    // No stray production record for the unmatched stage anywhere under the event.
    expect(res.events[0].changes.some((c) => c.stageName === 'Second Stage')).toBe(false);
  });

  it('include.stageProduction:false leaves the stage half untouched', async () => {
    const res = await push({ include: { stageProduction: false } });
    expect(res.events[0].changes.every((c) => c.scope === 'eventProduction')).toBe(true);
    expect(res.events[0].skippedStages).toEqual([]);
    expect((await db.doc(EVENT_PRODUCTION).get()).get('info')).toMatchObject({
      siteContact: 'Pat Reilly',
    });
    const stage = await db.doc(STAGE_PRODUCTION).get();
    expect(stage.get('content')).toEqual({ audio: { foh_console: 'X32', local_field: 'keep me' } });
    expect(stage.get('updatedAt')).toBeUndefined();
  });

  it('include.production:false leaves the event production record untouched', async () => {
    const res = await push({ include: { production: false } });
    expect(res.events[0].changes.every((c) => c.scope === 'stageProduction')).toBe(true);
    const production = await db.doc(EVENT_PRODUCTION).get();
    expect(production.get('info')).toEqual({ siteContact: 'Old Contact', localNote: 'keep me' });
    expect(production.get('updatedAt')).toBeUndefined();
    expect((await db.doc(STAGE_PRODUCTION).get()).get('content').audio.foh_console).toBe('S6L');
  });

  it('creates the production record for an event that has none', async () => {
    await db.doc(EVENT_PRODUCTION).delete();
    const res = await push();
    // With nothing on disk, every template value is a change (`from` empty).
    expect(change(res.events[0].changes, 'siteContact')).toMatchObject({
      from: '',
      to: 'Pat Reilly',
    });
    const production = await db.doc(EVENT_PRODUCTION).get();
    expect(production.exists).toBe(true);
    expect(production.get('info')).toEqual({ siteContact: 'Pat Reilly', wifi: 'house-wifi' });
    expect(production.get('contacts')).toHaveLength(1);
  });

  it('skips a requested event that no longer exists (no throw, no entry)', async () => {
    const res = await push({ eventIds: ['ghost-event', EVENT_ID] });
    expect(res.events.map((e) => e.eventId)).toEqual([EVENT_ID]);
    expect((await db.doc('events/ghost-event').get()).exists).toBe(false);
    expect((await db.collection('events/ghost-event/production').get()).empty).toBe(true);
  });

  it('a second apply is a no-op — zero changes writes nothing (updatedAt unchanged)', async () => {
    await push();
    const first = (await db.doc(EVENT_PRODUCTION).get()).get('updatedAt');
    const firstStage = (await db.doc(STAGE_PRODUCTION).get()).get('updatedAt');

    const res = await push();
    expect(res.events[0].changes).toEqual([]);
    expect((await db.doc(EVENT_PRODUCTION).get()).get('updatedAt')).toEqual(first);
    expect((await db.doc(STAGE_PRODUCTION).get()).get('updatedAt')).toEqual(firstStage);
  });

  it('handles a template with no stageProduction at all', async () => {
    await db.doc(`templates/${TEMPLATE_ID}`).update({ stageProduction: {} });
    const res = await push();
    expect(res.events[0].changes.every((c) => c.scope === 'eventProduction')).toBe(true);
    expect(res.events[0].skippedStages).toEqual(['Second Stage']); // still matched by name
    const stage = await db.doc(STAGE_PRODUCTION).get();
    expect(stage.get('content')).toEqual({ audio: { foh_console: 'X32', local_field: 'keep me' } });
  });
});
