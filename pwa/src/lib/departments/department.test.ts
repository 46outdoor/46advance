import { describe, it, expect } from 'vitest';
import { DEFAULT_DEPARTMENTS, departmentInputSchema, parseDepartment } from './department';

describe('departments', () => {
  it('ships the seven confirmed defaults with stable ids', () => {
    expect(DEFAULT_DEPARTMENTS.map((d) => d.id)).toEqual([
      'audio',
      'lighting',
      'video-led',
      'staging',
      'logistics',
      'labor',
      'artist-relations',
    ]);
  });

  it('parses a department doc and defaults order', () => {
    expect(parseDepartment('audio', { name: 'Audio' })).toEqual({ id: 'audio', name: 'Audio', order: 0 });
  });

  it('requires a non-empty name on input', () => {
    expect(departmentInputSchema.parse({ name: 'Catering' }).name).toBe('Catering');
    expect(() => departmentInputSchema.parse({ name: '  ' })).toThrow();
  });
});
