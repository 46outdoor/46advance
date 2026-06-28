import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DOCUMENT_CATEGORIES,
  documentCategoryInputSchema,
  parseDocumentCategory,
} from './documentCategory';

describe('document categories', () => {
  it('ships the initial defaults with stable ids', () => {
    expect(DEFAULT_DOCUMENT_CATEGORIES.map((c) => c.id)).toEqual([
      'tech-rider',
      'stage-plot',
      'input-list',
      'media',
      'hospitality-rider',
      'contract',
      'other',
    ]);
  });

  it('parses a category doc and defaults order', () => {
    expect(parseDocumentCategory('media', { name: 'Media' })).toEqual({ id: 'media', name: 'Media', order: 0 });
  });

  it('requires a non-empty name on input', () => {
    expect(documentCategoryInputSchema.parse({ name: 'Promo Photos' }).name).toBe('Promo Photos');
    expect(() => documentCategoryInputSchema.parse({ name: '  ' })).toThrow();
  });
});
