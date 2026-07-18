import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { groupEventDocumentsByDay, parseEventDocument, type EventDocument } from './eventDocument';

const minimal = { fileId: 'f1', name: 'Map.pdf', webViewLink: 'https://drive/x', uploadedBy: 'u1' };

describe('parseEventDocument', () => {
  it('parses a minimal doc with defaults (event-wide, octet-stream)', () => {
    const doc = parseEventDocument('f1', minimal);
    expect(doc.day).toBeNull();
    expect(doc.mimeType).toBe('application/octet-stream');
    expect(doc.categoryId).toBeNull();
  });

  it('parses a day-keyed doc with timestamps', () => {
    const doc = parseEventDocument('f1', {
      ...minimal,
      day: '2026-07-14',
      categoryId: 'cat-1',
      uploadedAt: Timestamp.fromMillis(Date.UTC(2026, 6, 1)),
    });
    expect(doc.day).toBe('2026-07-14');
    expect(doc.uploadedAt?.getTime()).toBe(Date.UTC(2026, 6, 1));
  });

  it('rejects an invalid day key and enforces id == fileId', () => {
    expect(() => parseEventDocument('f1', { ...minimal, day: '2026-02-31' })).toThrow();
    expect(() => parseEventDocument('other', minimal)).toThrow(/must equal its fileId/);
  });
});

describe('groupEventDocumentsByDay', () => {
  const doc = (id: string, day: string | null, name = `${id}.pdf`): EventDocument => ({
    id,
    fileId: id,
    name,
    displayName: null,
    mimeType: 'application/pdf',
    iconLink: null,
    webViewLink: 'https://drive/x',
    day,
    categoryId: null,
    uploadedBy: 'u1',
    uploadedAt: null,
  });

  it('groups by day ascending with event-wide last; titles sorted within groups', () => {
    const groups = groupEventDocumentsByDay([
      doc('c', null),
      doc('b', '2026-07-15'),
      doc('z', '2026-07-14', 'zebra.pdf'),
      doc('a', '2026-07-14', 'alpha.pdf'),
    ]);
    expect(groups.map((g) => g.day)).toEqual(['2026-07-14', '2026-07-15', null]);
    expect(groups[0].documents.map((d) => d.name)).toEqual(['alpha.pdf', 'zebra.pdf']);
  });

  it('returns [] for no documents', () => {
    expect(groupEventDocumentsByDay([])).toEqual([]);
  });
});
