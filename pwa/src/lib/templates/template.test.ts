import { describe, it, expect } from 'vitest';
import { emptyTemplateInput, parseTemplate } from './template';

describe('parseTemplate', () => {
  it('normalizes a full blueprint doc', () => {
    const t = parseTemplate('tpl-1', {
      name: 'RTC Standard',
      departmentIds: ['audio', 'staging'],
      stages: [{ id: 's1', name: 'Main', order: 0 }],
      eventProduction: { info: { crew_parking: 'Lot B' }, contacts: [], links: [] },
      stageProduction: { s1: { content: { audio: { foh_console: 'DM7' } } } },
      members: [{ uid: 'pm-1', role: 'production-manager' }],
    });
    expect(t.name).toBe('RTC Standard');
    expect(t.departmentIds).toEqual(['audio', 'staging']);
    expect(t.stages[0]).toEqual({ id: 's1', name: 'Main', order: 0 });
    expect(t.eventProduction.info.crew_parking).toBe('Lot B');
    expect(t.stageProduction.s1.content.audio.foh_console).toBe('DM7');
    expect(t.members[0]).toEqual({ uid: 'pm-1', role: 'production-manager' });
  });

  it('fills defaults for a minimal doc', () => {
    const t = parseTemplate('x', { name: 'Bare' });
    expect(t.departmentIds).toEqual([]);
    expect(t.stages).toEqual([]);
    expect(t.eventProduction).toEqual({ info: {}, contacts: [], links: [] });
    expect(t.stageProduction).toEqual({});
    expect(t.members).toEqual([]);
  });

  it('rejects a bad member role', () => {
    expect(() => parseTemplate('x', { name: 'N', members: [{ uid: 'u', role: 'owner' }] })).toThrow();
  });

  it('emptyTemplateInput is a valid starting point', () => {
    expect(emptyTemplateInput().name).toBe('');
    expect(emptyTemplateInput().stages).toEqual([]);
  });
});
