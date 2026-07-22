import { describe, expect, it, vi } from 'vitest';
import { type calendar_v3 } from 'googleapis';
import { deterministicCalendarEventId, insertCalendarEventIdempotent } from './calendarEvents';

type InsertFn = (p: calendar_v3.Params$Resource$Events$Insert) => Promise<{ data: calendar_v3.Schema$Event }>;
type GetFn = (p: calendar_v3.Params$Resource$Events$Get) => Promise<{ data: calendar_v3.Schema$Event }>;

function fakeCalendar(insert: InsertFn, get?: GetFn): calendar_v3.Calendar {
  return { events: { insert, get } } as unknown as calendar_v3.Calendar;
}

describe('deterministicCalendarEventId', () => {
  it('is stable per seed and a valid base32hex calendar id', () => {
    const a = deterministicCalendarEventId('advance-x-123');
    expect(deterministicCalendarEventId('advance-x-123')).toBe(a);
    expect(a).toMatch(/^[0-9a-v]{5,1024}$/); // Google's event-id charset
    expect(deterministicCalendarEventId('advance-x-124')).not.toBe(a);
  });
});

describe('insertCalendarEventIdempotent', () => {
  it('returns the inserted event on success', async () => {
    const cal = fakeCalendar(async () => ({ data: { id: 'evt-1', hangoutLink: 'link' } }));
    const res = await insertCalendarEventIdempotent(cal, { calendarId: 'cal', requestBody: { id: 'evt-1' } });
    expect(res.id).toBe('evt-1');
    expect(res.hangoutLink).toBe('link');
  });

  it('on 409 (a retry hit an event a prior attempt created) fetches and returns the existing event', async () => {
    const get = vi.fn<GetFn>(async () => ({ data: { id: 'evt-1', hangoutLink: 'from-get' } }));
    const cal = fakeCalendar(async () => {
      throw { code: 409 };
    }, get);
    const res = await insertCalendarEventIdempotent(cal, { calendarId: 'cal', requestBody: { id: 'evt-1' } });
    expect(res.hangoutLink).toBe('from-get');
    expect(get).toHaveBeenCalledWith({ calendarId: 'cal', eventId: 'evt-1' });
  });

  it('rethrows a non-conflict error without fetching', async () => {
    const get = vi.fn<GetFn>();
    const cal = fakeCalendar(async () => {
      throw { code: 403 };
    }, get);
    await expect(
      insertCalendarEventIdempotent(cal, { calendarId: 'cal', requestBody: { id: 'evt-1' } }),
    ).rejects.toEqual({ code: 403 });
    expect(get).not.toHaveBeenCalled();
  });
});
