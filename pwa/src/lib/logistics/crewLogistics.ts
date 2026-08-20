/**
 * Crew travel & lodging model (planning/CREW_TRAVEL_LODGING_PLAN.md §4.1):
 * `events/{eventId}/crewLogistics/{recordId}` — one flat record per person per stay/leg,
 * discriminated on `kind`. Types + Zod + parser + pure helpers live together (mirrors
 * @/lib/quotes/quote).
 *
 * Two deliberate shape choices, both load-bearing:
 * - `userId` is DENORMALIZED from the linked contact so the self-read rule and the
 *   crew-scoped query (`where('userId','==',uid)`) work without per-record joins. It is a
 *   server-verified authorization field, never a free client assertion (plan §4.2).
 * - Hotel check-in/out are DATE-ONLY facts on the hotel's local calendar ('YYYY-MM-DD' day
 *   keys), not instants — do not pass them through the browser's zone. Travel dep/arr are
 *   real instants (Timestamp) and each carries the IANA zone its wall clock is shown in.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';
import { isValidDateKey } from '@/lib/dates/parsing';

export const CREW_LOGISTICS_KINDS = ['lodging', 'travel'] as const;
export type CrewLogisticsKind = (typeof CREW_LOGISTICS_KINDS)[number];

export const TRAVEL_MODES = ['flight', 'drive', 'train', 'other'] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];
export const travelModeSchema = z.enum(TRAVEL_MODES);

export const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  flight: 'Flight',
  drive: 'Drive',
  train: 'Train',
  other: 'Other',
};

/** Fields shared by both kinds. */
interface CrewLogisticsBase {
  id: string;
  /** `events/{eventId}/contacts/{attachId}` — proves the person is on this event's roster. */
  eventContactId: string;
  /** The global directory contact (`contacts/{id}`); must match the attachment's reference. */
  contactId: string;
  /** Denormalized `contacts/{contactId}.userId` at write time; null when unlinked. */
  userId: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface LodgingRecord extends CrewLogisticsBase {
  kind: 'lodging';
  hotelName: string;
  address: string | null;
  hotelPhone: string | null;
  confirmation: string | null;
  /** Hotel-local calendar dates ('YYYY-MM-DD'), NOT instants. */
  checkInDate: string;
  checkOutDate: string;
  roomType: string | null;
  roomNumber: string | null;
}

export interface TravelRecord extends CrewLogisticsBase {
  kind: 'travel';
  mode: TravelMode;
  carrier: string | null;
  confirmation: string | null;
  from: string | null;
  to: string | null;
  departAt: Date | null;
  arriveAt: Date | null;
  /** IANA zone for the departure wall clock; required whenever `departAt` is set. */
  departTimeZone: string | null;
  /** IANA zone for the arrival wall clock; required whenever `arriveAt` is set. */
  arriveTimeZone: string | null;
}

export type CrewLogisticsRecord = LodgingRecord | TravelRecord;

/** True when `zone` names a real IANA time zone the runtime can format in. */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const dateKeySchema = z.string().refine(isValidDateKey, 'Use a real YYYY-MM-DD date.');
const zoneSchema = z.string().refine(isValidTimeZone, 'Use a valid IANA time zone.');

/** Nullable trimmed string that stores '' as null. */
const optionalText = z.string().nullable().optional();

const baseDocShape = {
  eventContactId: z.string().min(1),
  contactId: z.string().min(1),
  userId: z.string().nullable().optional(),
  notes: optionalText,
  createdBy: z.string().min(1),
  createdAt: z.instanceof(Timestamp).nullable().optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
};

const lodgingDocSchema = z.strictObject({
  ...baseDocShape,
  kind: z.literal('lodging'),
  hotelName: z.string().min(1),
  address: optionalText,
  hotelPhone: optionalText,
  confirmation: optionalText,
  checkInDate: dateKeySchema,
  checkOutDate: dateKeySchema,
  roomType: optionalText,
  roomNumber: optionalText,
});

const travelDocSchema = z.strictObject({
  ...baseDocShape,
  kind: z.literal('travel'),
  mode: travelModeSchema,
  carrier: optionalText,
  confirmation: optionalText,
  from: optionalText,
  to: optionalText,
  departAt: z.instanceof(Timestamp).nullable().optional(),
  arriveAt: z.instanceof(Timestamp).nullable().optional(),
  departTimeZone: zoneSchema.nullable().optional(),
  arriveTimeZone: zoneSchema.nullable().optional(),
});

/**
 * Cross-field invariants shared by the doc and input schemas. Lives at the union level
 * because `z.discriminatedUnion` only accepts bare objects — a `.refine()` wrapper
 * (ZodEffects) is rejected at the type level.
 */
function checkCrossFields(
  d:
    | { kind: 'lodging'; checkInDate: string; checkOutDate: string }
    | {
        kind: 'travel';
        departAt?: { getTime?: () => number; toMillis?: () => number } | null;
        arriveAt?: { getTime?: () => number; toMillis?: () => number } | null;
        departTimeZone?: string | null;
        arriveTimeZone?: string | null;
      },
  ctx: z.RefinementCtx,
): void {
  if (d.kind === 'lodging') {
    if (d.checkOutDate < d.checkInDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Check-out must be on or after check-in.',
        path: ['checkOutDate'],
      });
    }
    return;
  }
  const millis = (v: { getTime?: () => number; toMillis?: () => number } | null | undefined) =>
    v ? (v.toMillis?.() ?? v.getTime?.() ?? null) : null;
  if (d.departAt && !d.departTimeZone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A departure time needs its time zone.',
      path: ['departTimeZone'],
    });
  }
  if (d.arriveAt && !d.arriveTimeZone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'An arrival time needs its time zone.',
      path: ['arriveTimeZone'],
    });
  }
  const dep = millis(d.departAt);
  const arr = millis(d.arriveAt);
  if (dep !== null && arr !== null && arr < dep) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Arrival must be at or after departure.',
      path: ['arriveAt'],
    });
  }
}

const crewLogisticsDocSchema = z
  .discriminatedUnion('kind', [lodgingDocSchema, travelDocSchema])
  .superRefine(checkCrossFields);

/** Validate + normalize a raw crewLogistics doc. Throws on malformed/unknown-key shapes. */
export function parseCrewLogistics(id: string, data: unknown): CrewLogisticsRecord {
  const doc = crewLogisticsDocSchema.parse(data);
  const base: CrewLogisticsBase = {
    id,
    eventContactId: doc.eventContactId,
    contactId: doc.contactId,
    userId: doc.userId ?? null,
    notes: doc.notes ?? null,
    createdBy: doc.createdBy,
    createdAt: timestampToDate(doc.createdAt ?? null),
    updatedAt: timestampToDate(doc.updatedAt ?? null),
  };
  if (doc.kind === 'lodging') {
    return {
      ...base,
      kind: 'lodging',
      hotelName: doc.hotelName,
      address: doc.address ?? null,
      hotelPhone: doc.hotelPhone ?? null,
      confirmation: doc.confirmation ?? null,
      checkInDate: doc.checkInDate,
      checkOutDate: doc.checkOutDate,
      roomType: doc.roomType ?? null,
      roomNumber: doc.roomNumber ?? null,
    };
  }
  return {
    ...base,
    kind: 'travel',
    mode: doc.mode,
    carrier: doc.carrier ?? null,
    confirmation: doc.confirmation ?? null,
    from: doc.from ?? null,
    to: doc.to ?? null,
    departAt: timestampToDate(doc.departAt ?? null),
    arriveAt: timestampToDate(doc.arriveAt ?? null),
    departTimeZone: doc.departTimeZone ?? null,
    arriveTimeZone: doc.arriveTimeZone ?? null,
  };
}

/** Trim to null: form fields treat whitespace-only as empty. */
const inputText = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()
  .optional();

const lodgingInputSchema = z.strictObject({
  kind: z.literal('lodging'),
  hotelName: z.string().trim().min(1, 'Hotel name is required.'),
  address: inputText,
  hotelPhone: inputText,
  confirmation: inputText,
  checkInDate: dateKeySchema,
  checkOutDate: dateKeySchema,
  roomType: inputText,
  roomNumber: inputText,
  notes: inputText,
});

const travelInputSchema = z.strictObject({
  kind: z.literal('travel'),
  mode: travelModeSchema,
  carrier: inputText,
  confirmation: inputText,
  from: inputText,
  to: inputText,
  departAt: z.date().nullable().optional(),
  arriveAt: z.date().nullable().optional(),
  departTimeZone: zoneSchema.nullable().optional(),
  arriveTimeZone: zoneSchema.nullable().optional(),
  notes: inputText,
});

/** Client form input for create/edit; the target person is supplied separately. */
export const crewLogisticsInputSchema = z
  .discriminatedUnion('kind', [lodgingInputSchema, travelInputSchema])
  .superRefine(checkCrossFields);
export type CrewLogisticsInput = z.infer<typeof crewLogisticsInputSchema>;

/** Sort: lodging by check-in, travel by departure; dated before undated; ties by created order. */
export function compareCrewLogistics(a: CrewLogisticsRecord, b: CrewLogisticsRecord): number {
  const key = (r: CrewLogisticsRecord): number | undefined =>
    r.kind === 'lodging'
      ? Date.parse(`${r.checkInDate}T00:00:00Z`)
      : (r.departAt?.getTime() ?? undefined);
  const ak = key(a);
  const bk = key(b);
  if (ak !== undefined && bk !== undefined && ak !== bk) return ak - bk;
  if (ak !== undefined && bk === undefined) return -1;
  if (ak === undefined && bk !== undefined) return 1;
  return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
}
