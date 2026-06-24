import { describe, expect, it } from 'vitest';
import { contactInputSchema, contactSubtitle, mailtoHref, parseContact, telHref } from './contact';

describe('parseContact', () => {
  it('normalizes a minimal doc', () => {
    const c = parseContact('c1', { name: 'Pat Lee', createdBy: 'u1' });
    expect(c.id).toBe('c1');
    expect(c.name).toBe('Pat Lee');
    expect(c.role).toBeNull();
    expect(c.phone).toBeNull();
  });

  it('keeps provided fields', () => {
    const c = parseContact('c2', {
      name: 'Sam',
      role: 'Audio Lead',
      company: 'SoundCo',
      phone: '555-1234',
      email: 'sam@x.com',
      createdBy: 'u1',
    });
    expect(c.role).toBe('Audio Lead');
    expect(c.company).toBe('SoundCo');
  });
});

describe('contactInputSchema', () => {
  it('requires a name', () => {
    expect(contactInputSchema.safeParse({ name: '  ' }).success).toBe(false);
  });

  it('accepts an empty email', () => {
    expect(contactInputSchema.safeParse({ name: 'A', email: '' }).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(contactInputSchema.safeParse({ name: 'A', email: 'not-an-email' }).success).toBe(false);
  });

  it('accepts a valid email', () => {
    expect(contactInputSchema.safeParse({ name: 'A', email: 'a@b.com' }).success).toBe(true);
  });
});

describe('href helpers', () => {
  it('builds a tel href from a messy phone', () => {
    expect(telHref('(555) 123-4567')).toBe('tel:5551234567');
    expect(telHref('+1 555 123 4567')).toBe('tel:+15551234567');
  });

  it('returns null tel for empty/blank', () => {
    expect(telHref(null)).toBeNull();
    expect(telHref('abc')).toBeNull();
  });

  it('builds a mailto href', () => {
    expect(mailtoHref('a@b.com')).toBe('mailto:a@b.com');
    expect(mailtoHref(null)).toBeNull();
  });
});

describe('contactSubtitle', () => {
  it('joins role and company', () => {
    expect(contactSubtitle({ role: 'PM', company: 'X' })).toBe('PM · X');
  });

  it('collapses empties', () => {
    expect(contactSubtitle({ role: 'PM', company: null })).toBe('PM');
    expect(contactSubtitle({ role: null, company: null })).toBe('');
  });
});
