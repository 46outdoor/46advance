import { describe, it, expect } from 'vitest';
import { eventCalendarSummary, planCalendarRename } from './calendarSummary';

describe('eventCalendarSummary', () => {
  it('uses the short code when set (trimmed)', () => {
    expect(eventCalendarSummary('BOTB', 'Summerfest 2026')).toBe('BOTB — Summerfest 2026');
    expect(eventCalendarSummary('  BOTB  ', 'X')).toBe('BOTB — X');
  });

  it('falls back to the brand default when there is no short code', () => {
    expect(eventCalendarSummary(null, 'Summerfest')).toBe('46 Advance — Summerfest');
    expect(eventCalendarSummary('', 'Summerfest')).toBe('46 Advance — Summerfest');
    expect(eventCalendarSummary(undefined, 'Summerfest')).toBe('46 Advance — Summerfest');
  });
});

describe('planCalendarRename', () => {
  const base = { name: 'Fest', shortCode: 'BOTB', googleCalendarId: 'cal-1', googleCalendarOwnerUid: 'owner-1' };

  it('returns null when the event has no calendar', () => {
    expect(planCalendarRename({ ...base }, { ...base, googleCalendarId: '', name: 'New' })).toBeNull();
  });

  it('returns null when the owner is unknown', () => {
    expect(planCalendarRename({ ...base }, { ...base, googleCalendarOwnerUid: '', name: 'New' })).toBeNull();
  });

  it('returns null when neither name nor short code changed', () => {
    expect(planCalendarRename({ ...base }, { ...base, venue: 'somewhere' })).toBeNull();
  });

  it('plans a rename when the short code changes', () => {
    expect(planCalendarRename({ ...base }, { ...base, shortCode: 'RTC' })).toEqual({
      calendarId: 'cal-1',
      ownerUid: 'owner-1',
      summary: 'RTC — Fest',
    });
  });

  it('plans a rename when the name changes, honoring the short code', () => {
    expect(planCalendarRename({ ...base }, { ...base, name: 'Fall Fest' })?.summary).toBe('BOTB — Fall Fest');
  });

  it('plans the default summary when the short code is cleared', () => {
    expect(planCalendarRename({ ...base }, { ...base, shortCode: null })?.summary).toBe('46 Advance — Fest');
  });
});
