import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  EVENT_ROLES,
  EVENT_ROLE_LABELS,
  eventMemberInputSchema,
  eventRoleSchema,
  formatEventRole,
  parseEventMember,
} from './roles';

describe('roles schema', () => {
  it('accepts every declared event role', () => {
    for (const role of EVENT_ROLES) {
      expect(eventRoleSchema.parse(role)).toBe(role);
    }
  });

  it('rejects unknown roles (incl. the global admin claim)', () => {
    expect(() => eventRoleSchema.parse('admin')).toThrow();
    expect(() => eventRoleSchema.parse('owner')).toThrow();
  });

  it('input schema only accepts a valid role', () => {
    expect(eventMemberInputSchema.parse({ role: 'tech' })).toEqual({ role: 'tech' });
    expect(() => eventMemberInputSchema.parse({ role: 'nope' })).toThrow();
  });
});

describe('parseEventMember', () => {
  it('normalizes a Firestore timestamp to a Date', () => {
    const ts = Timestamp.fromDate(new Date('2026-06-21T00:00:00Z'));
    const member = parseEventMember({ role: 'production-manager', addedBy: 'admin-1', addedAt: ts });
    expect(member.role).toBe('production-manager');
    expect(member.addedBy).toBe('admin-1');
    expect(member.addedAt).toBeInstanceOf(Date);
    expect(member.addedAt?.toISOString()).toBe('2026-06-21T00:00:00.000Z');
  });

  it('treats a missing/null timestamp as null', () => {
    expect(parseEventMember({ role: 'tech', addedBy: 'x' }).addedAt).toBeNull();
    expect(parseEventMember({ role: 'tech', addedBy: 'x', addedAt: null }).addedAt).toBeNull();
  });

  it('throws on a malformed doc', () => {
    expect(() => parseEventMember({ role: 'tech' })).toThrow(); // missing addedBy
    expect(() => parseEventMember({ role: 'wrong', addedBy: 'x' })).toThrow();
  });
});

describe('formatEventRole', () => {
  it('renders a human label for every role (no kebab-case leaks)', () => {
    for (const role of EVENT_ROLES) {
      expect(formatEventRole(role)).toBe(EVENT_ROLE_LABELS[role]);
      expect(formatEventRole(role)).not.toContain('-');
    }
  });

  it('maps production-manager to "Production Manager"', () => {
    expect(formatEventRole('production-manager')).toBe('Production Manager');
  });
});
