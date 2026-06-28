import { describe, expect, it } from 'vitest';
import {
  contactInitials,
  contactInputSchema,
  contactLastName,
  contactSubtitle,
  mailtoHref,
  matchesContactQuery,
  parseContact,
  photoCropStyle,
  sortContacts,
  telHref,
} from './contact';

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

describe('contactLastName', () => {
  it('returns the last word of the name', () => {
    expect(contactLastName({ name: 'Andrue Yanez' })).toBe('Yanez');
    expect(contactLastName({ name: 'Mary Jo Smith' })).toBe('Smith');
    expect(contactLastName({ name: 'Cher' })).toBe('Cher');
  });
});

describe('contactInitials', () => {
  it('takes the first + last initials, uppercased', () => {
    expect(contactInitials('Andrue Yanez')).toBe('AY');
    expect(contactInitials('mary jo smith')).toBe('MS');
    expect(contactInitials('Cher')).toBe('C');
  });

  it('falls back to ? for a blank name', () => {
    expect(contactInitials('   ')).toBe('?');
  });
});

describe('photoCropStyle', () => {
  it('scales + offsets the original so the crop region fills a square', () => {
    expect(photoCropStyle({ x: 300, y: 100, width: 400, height: 400, natW: 1000, natH: 600 })).toEqual({
      width: '250%',
      height: '150%',
      left: '-75%',
      top: '-25%',
    });
  });
});

describe('matchesContactQuery', () => {
  const c = parseContact('c', {
    name: 'Andrue Yanez',
    role: 'Stageline Tech',
    company: 'Stageline',
    phone: '520-979-5365',
    email: 'andru.yanez@example.com',
    createdBy: 'u',
  });

  it('matches everything for a blank query', () => {
    expect(matchesContactQuery(c, '')).toBe(true);
    expect(matchesContactQuery(c, '   ')).toBe(true);
  });

  it('matches name, phone, email, and role case-insensitively', () => {
    expect(matchesContactQuery(c, 'yanez')).toBe(true); // last name
    expect(matchesContactQuery(c, 'ANDRUE')).toBe(true); // first name
    expect(matchesContactQuery(c, '979')).toBe(true); // phone
    expect(matchesContactQuery(c, 'example.com')).toBe(true); // email
    expect(matchesContactQuery(c, 'tech')).toBe(true); // role/title
  });

  it('does not match the company-only field or absent terms', () => {
    const bob = parseContact('c2', { name: 'Bob', company: 'UniqueCorp', createdBy: 'u' });
    expect(matchesContactQuery(bob, 'uniquecorp')).toBe(false);
    expect(matchesContactQuery(c, 'zzz')).toBe(false);
  });
});

describe('sortContacts', () => {
  const make = (name: string) => parseContact(name, { name, createdBy: 'u' });
  const list = [make('Blake Posey'), make('Andrue Yanez'), make('Cale Conrad')];

  it('sorts by first name', () => {
    expect(sortContacts(list, 'first').map((c) => c.name)).toEqual([
      'Andrue Yanez',
      'Blake Posey',
      'Cale Conrad',
    ]);
  });

  it('sorts by last name', () => {
    expect(sortContacts(list, 'last').map((c) => c.name)).toEqual([
      'Cale Conrad',
      'Blake Posey',
      'Andrue Yanez',
    ]);
  });
});
