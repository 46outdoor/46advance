import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  checklistTemplateInputSchema,
  formatChecklistTimestamp,
  parseChecklistItem,
  parseChecklistTemplate,
  sortChecklistItems,
} from './checklist';

describe('parseChecklistItem', () => {
  it('parses a full doc', () => {
    const at = new Date('2026-08-03T19:41:00Z');
    const item = parseChecklistItem('i1', {
      text: 'Book crew bus',
      section: 'post-show',
      order: 3,
      completedAt: Timestamp.fromDate(at),
    });
    expect(item).toEqual({
      id: 'i1',
      text: 'Book crew bus',
      section: 'post-show',
      order: 3,
      completedAt: at,
    });
  });

  it('defaults section/order/completedAt (completedAt doubles as the done flag)', () => {
    const item = parseChecklistItem('i2', { text: 'Advance catering' });
    expect(item.section).toBe('main');
    expect(item.order).toBe(0);
    expect(item.completedAt).toBeNull();
  });

  it('rejects an empty text and an unknown section', () => {
    expect(() => parseChecklistItem('x', { text: '' })).toThrow();
    expect(() => parseChecklistItem('x', { text: 'ok', section: 'encore' })).toThrow();
  });
});

describe('sortChecklistItems', () => {
  it('sorts main before post-show, then by order', () => {
    const mk = (id: string, section: 'main' | 'post-show', order: number) =>
      parseChecklistItem(id, { text: id, section, order });
    const sorted = sortChecklistItems([
      mk('c', 'post-show', 0),
      mk('b', 'main', 1),
      mk('a', 'main', 0),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('formatChecklistTimestamp', () => {
  it('formats mm/dd h:mm AM/PM in the given timezone', () => {
    // 19:41 UTC on Aug 3 = 2:41 PM in Chicago (CDT, UTC-5).
    const at = new Date('2026-08-03T19:41:00Z');
    expect(formatChecklistTimestamp(at, 'America/Chicago')).toBe('08/03 2:41 PM');
  });

  it('empty for null', () => {
    expect(formatChecklistTimestamp(null, 'America/Chicago')).toBe('');
  });
});

describe('parseChecklistTemplate', () => {
  it('parses items with section defaults', () => {
    const tpl = parseChecklistTemplate('t1', {
      name: 'Standard show',
      items: [{ text: 'Confirm power' }, { text: 'Return radios', section: 'post-show' }],
    });
    expect(tpl.items).toEqual([
      { text: 'Confirm power', section: 'main' },
      { text: 'Return radios', section: 'post-show' },
    ]);
  });

  it('defaults items to empty (a just-created template)', () => {
    expect(parseChecklistTemplate('t2', { name: 'Blank' }).items).toEqual([]);
  });
});

describe('checklistTemplateInputSchema', () => {
  it('requires a name and non-empty item text', () => {
    expect(checklistTemplateInputSchema.safeParse({ name: '  ', items: [] }).success).toBe(false);
    expect(
      checklistTemplateInputSchema.safeParse({
        name: 'Show',
        items: [{ text: ' ', section: 'main' }],
      }).success,
    ).toBe(false);
    expect(
      checklistTemplateInputSchema.safeParse({
        name: 'Show',
        items: [{ text: 'Confirm power', section: 'main' }],
      }).success,
    ).toBe(true);
  });
});
