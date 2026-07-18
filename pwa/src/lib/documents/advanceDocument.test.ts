import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { advanceDocumentPayload, parseAdvanceDocument } from './advanceDocument';

const minimal = { fileId: 'f1', name: 'Rider.pdf', webViewLink: 'https://drive/x', addedBy: 'u1' };

describe('parseAdvanceDocument', () => {
  it('parses a minimal doc with defaults (packet off, octet-stream mime)', () => {
    const doc = parseAdvanceDocument('f1', minimal);
    expect(doc.id).toBe('f1');
    expect(doc.includePacket).toBe(false);
    expect(doc.mimeType).toBe('application/octet-stream');
    expect(doc.displayName).toBeNull();
    expect(doc.categoryId).toBeNull();
    expect(doc.addedAt).toBeNull();
  });

  it('parses full fields and timestamps', () => {
    const doc = parseAdvanceDocument('f1', {
      ...minimal,
      displayName: 'Stage Plot 2026',
      mimeType: 'application/pdf',
      categoryId: 'cat-1',
      includePacket: true,
      addedAt: Timestamp.fromMillis(Date.UTC(2026, 6, 1)),
    });
    expect(doc.displayName).toBe('Stage Plot 2026');
    expect(doc.includePacket).toBe(true);
    expect(doc.addedAt?.getTime()).toBe(Date.UTC(2026, 6, 1));
  });

  it('rejects missing required fields', () => {
    expect(() => parseAdvanceDocument('x', { ...minimal, fileId: '' })).toThrow();
    expect(() => parseAdvanceDocument('x', { ...minimal, name: undefined })).toThrow();
    expect(() => parseAdvanceDocument('x', { ...minimal, addedBy: '' })).toThrow();
  });

  it('enforces the id == fileId invariant', () => {
    expect(() => parseAdvanceDocument('other-id', minimal)).toThrow(/must equal its fileId/);
  });
});

describe('advanceDocumentPayload', () => {
  it('copies the display fields from a library doc', () => {
    const payload = advanceDocumentPayload({
      fileId: 'f1',
      name: 'Rider.pdf',
      displayName: null,
      mimeType: 'application/pdf',
      iconLink: null,
      webViewLink: 'https://drive/x',
      categoryId: 'cat-1',
    });
    expect(payload).toEqual({
      fileId: 'f1',
      name: 'Rider.pdf',
      displayName: null,
      mimeType: 'application/pdf',
      iconLink: null,
      webViewLink: 'https://drive/x',
      categoryId: 'cat-1',
    });
  });
});
