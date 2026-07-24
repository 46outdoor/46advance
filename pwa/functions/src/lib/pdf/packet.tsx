/**
 * 46-branded PDF packet (tech-facing). Pure renderer: the function maps Firestore →
 * PacketData (dates pre-formatted) and calls renderPacket(). @react-pdf/renderer (no
 * headless browser). Field labels are humanized from keys (shared registry sharing is a
 * follow-up).
 */
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';

const BRAND = '#0a0a0a';
const ACCENT = '#f04040';
const INK = '#262626';
const MUTED = '#525763';
const LINE = '#d4d4d4';

// Interior-page frame (reconstructed from the 2026 RTC Advance design): a thin red rectangle inset
// from the page edge, with the 46 mark centered breaking the bottom edge. Points (72 = 1 inch).
const FRAME_INSET = 32; // page edge → border (~0.44in, matching the design)
const CONTENT_PAD = 52; // page edge → content (clears the border with breathing room)

export type PacketContent = Record<string, unknown>;

export interface PacketAdvance {
  artistName: string;
  performanceDate?: string | null;
  stage?: string | null;
  notes?: string | null;
  additions?: string | null;
  concerns?: string | null;
  pending?: string | null;
  sections: Record<string, { status: string }>;
  content: Record<string, PacketContent>;
}

export interface PacketStage {
  name: string;
  production: Record<string, PacketContent>;
  advances: PacketAdvance[];
}

/**
 * A resolved logo for the packet: `headerDataUri` is the light-background (onLight) variant as a
 * base64 data URI, or null when it couldn't be resolved. Used for the festival mark on the cover's
 * white area and the 46 mark in the interior page frame — both sit on white.
 */
export interface PacketLogo {
  headerDataUri: string | null;
}

export interface PacketData {
  event: { name: string; venue?: string | null; dateRange?: string | null };
  departments: { id: string; name: string }[];
  eventProduction: {
    info: PacketContent;
    contacts: { role: string; name: string; phone: string; email: string }[];
    links: { label: string; url: string }[];
  };
  stages: PacketStage[];
  /** Branding logos pre-resolved to data URIs: the show mark (the event's festival logo or a
   *  per-event override — rendered on the cover) and the shared 46 company marks (the small mark
   *  in the interior page frame). */
  logos: { eventLogo: PacketLogo | null; markLogos: PacketLogo[] };
  /** Full-bleed cover background as a data URI (the 46 brand cover; a per-festival override is a
   *  planned extension). Null falls back to the built-in dark cover. */
  coverImageDataUri: string | null;
  /** The packet type label (from `config/packets.typeLabel`), shown on the cover. */
  typeLabel: string;
  generatedAt: string;
  /** 1-based packet version, shown on the cover. */
  version: number;
}

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  complete: 'Complete',
};

function humanize(key: string): string {
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function valueText(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function contentRows(content: PacketContent): { label: string; value: string }[] {
  return Object.entries(content)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false)
    .map(([k, v]) => ({ label: humanize(k), value: valueText(v) }));
}

const s = StyleSheet.create({
  // ---- Cover ----
  coverImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' },
  // Fallback dark cover (when no cover image resolves).
  coverFallback: { backgroundColor: BRAND, height: '100%' },
  coverFallbackSlash: {
    position: 'absolute',
    top: 120,
    left: -120,
    width: 900,
    height: 70,
    backgroundColor: ACCENT,
    transform: 'rotate(-32deg)',
  },
  // Event identity block, sitting in the cover's lower-right white area, right-aligned.
  coverBlock: { position: 'absolute', right: 46, bottom: 54, left: 150, alignItems: 'flex-end' },
  coverLogo: { maxHeight: 74, maxWidth: 300, marginBottom: 14, objectFit: 'contain' },
  coverTitle: { fontSize: 22, fontWeight: 'bold', color: BRAND, textAlign: 'right' },
  coverMeta: { fontSize: 11, color: INK, marginTop: 6, textAlign: 'right' },
  coverSub: { fontSize: 9, color: MUTED, marginTop: 8, textAlign: 'right' },
  // ---- Interior page frame ----
  page: { padding: CONTENT_PAD, fontSize: 9, color: INK, fontFamily: 'Helvetica' },
  // Full-page anchor so the border + mark position relative to the page (not a collapsed wrapper).
  frameRoot: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  frameBorder: {
    position: 'absolute',
    top: FRAME_INSET,
    left: FRAME_INSET,
    right: FRAME_INSET,
    bottom: FRAME_INSET,
    borderWidth: 1.2,
    borderColor: ACCENT,
    borderStyle: 'solid',
  },
  // White pad + mark that straddles the bottom border, so the 46 mark "breaks" the frame.
  frameMarkWrap: {
    position: 'absolute',
    bottom: FRAME_INSET - 11,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  frameMarkPad: { backgroundColor: '#fff', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  frameMarkImg: { height: 22, width: 46, objectFit: 'contain' },
  frameMarkText: { fontSize: 16, fontWeight: 'bold', color: BRAND, letterSpacing: 1 },
  // ---- Interior header / footer ----
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingBottom: 6,
    marginBottom: 12,
  },
  headerTitle: { fontSize: 11, fontWeight: 'bold', color: BRAND },
  headerMeta: { fontSize: 8, color: MUTED, marginTop: 2 },
  headerText: { flex: 1 },
  headerPageNo: { fontSize: 8, color: MUTED, marginLeft: 12 },
  h1: { fontSize: 16, fontWeight: 'bold', color: BRAND, marginBottom: 8 },
  h2: { fontSize: 12, fontWeight: 'bold', color: BRAND, marginTop: 12, marginBottom: 4 },
  h3: { fontSize: 10, fontWeight: 'bold', color: ACCENT, marginTop: 8, marginBottom: 2 },
  row: { flexDirection: 'row', marginBottom: 2 },
  rowLabel: { width: 130, color: MUTED },
  rowValue: { flex: 1 },
  para: { marginBottom: 3 },
  muted: { color: MUTED },
});

function Rows({ rows }: { rows: { label: string; value: string }[] }) {
  if (rows.length === 0) return createElement(Text, { style: s.muted }, '—');
  return createElement(
    View,
    {},
    ...rows.map((r, i) =>
      createElement(View, { style: s.row, key: i }, [
        createElement(Text, { style: s.rowLabel, key: 'l' }, r.label),
        createElement(Text, { style: s.rowValue, key: 'v' }, r.value),
      ]),
    ),
  );
}

/** First resolved company mark (for the interior frame's 46 mark), or null. */
function firstMarkUri(data: PacketData): string | null {
  for (const l of data.logos.markLogos) {
    if (l.headerDataUri) return l.headerDataUri;
  }
  return null;
}

/** Running header (fixed on every content page): event title + meta, with the page number at right. */
function PageHeader({ data }: { data: PacketData }) {
  const meta = [data.event.venue, data.event.dateRange].filter(Boolean).join(' · ');
  return createElement(View, { style: s.header, fixed: true }, [
    createElement(View, { style: s.headerText, key: 'tx' }, [
      createElement(Text, { style: s.headerTitle, key: 't' }, `${data.event.name} — ${data.typeLabel}`),
      meta ? createElement(Text, { style: s.headerMeta, key: 'm' }, meta) : null,
    ]),
    createElement(Text, {
      style: s.headerPageNo,
      key: 'p',
      render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
        `${pageNumber} / ${totalPages}`,
    }),
  ]);
}

/**
 * Interior page frame (fixed on every content page): the thin red border inset from the page edge,
 * with the 46 mark centered breaking the bottom edge. Reconstructed in vector; the mark uses the
 * resolved 46 company mark when available, else a text fallback.
 */
function PageFrame({ data }: { data: PacketData }) {
  const mark = firstMarkUri(data);
  return createElement(View, { style: s.frameRoot, fixed: true }, [
    createElement(View, { style: s.frameBorder, key: 'b' }),
    createElement(
      View,
      { style: s.frameMarkWrap, key: 'm' },
      createElement(
        View,
        { style: s.frameMarkPad },
        mark
          ? createElement(Image, { src: mark, style: s.frameMarkImg })
          : createElement(Text, { style: s.frameMarkText }, '46 /'),
      ),
    ),
  ]);
}

function buildPacketDocument(data: PacketData) {
  const deptName = new Map(data.departments.map((d) => [d.id, d.name]));

  const cover = createElement(Page, { size: 'LETTER', key: 'cover' }, [
    // Full-bleed cover background: the 46 brand cover, or the dark fallback.
    data.coverImageDataUri
      ? createElement(Image, { src: data.coverImageDataUri, style: s.coverImage, key: 'bg' })
      : createElement(View, { style: s.coverFallback, key: 'bg' }, [
          createElement(View, { style: s.coverFallbackSlash, key: 'slash' }),
        ]),
    // Event identity in the cover's lower-right white area.
    createElement(View, { style: s.coverBlock, key: 'block' }, [
      data.logos.eventLogo?.headerDataUri
        ? createElement(Image, { src: data.logos.eventLogo.headerDataUri, style: s.coverLogo, key: 'logo' })
        : null,
      createElement(Text, { style: s.coverTitle, key: 't' }, data.event.name),
      [data.event.venue, data.event.dateRange].filter(Boolean).length > 0
        ? createElement(
            Text,
            { style: s.coverMeta, key: 'meta' },
            [data.event.venue, data.event.dateRange].filter(Boolean).join('  ·  '),
          )
        : null,
      createElement(
        Text,
        { style: s.coverSub, key: 'sub' },
        `${data.typeLabel} · v${data.version} · generated ${data.generatedAt}`,
      ),
    ]),
  ]);

  // Event production page.
  const ep = data.eventProduction;
  const eventProductionPage = createElement(Page, { size: 'LETTER', style: s.page, key: 'ep' }, [
    createElement(PageFrame, { data, key: 'f' }),
    createElement(PageHeader, { data, key: 'h' }),
    createElement(Text, { style: s.h1, key: 'h1' }, 'Festival production'),
    createElement(Text, { style: s.h2, key: 'i' }, 'Site / production info'),
    createElement(Rows, { rows: contentRows(ep.info), key: 'ir' }),
    createElement(Text, { style: s.h2, key: 'c' }, 'Contacts'),
    ep.contacts.length === 0
      ? createElement(Text, { style: s.muted, key: 'cn' }, '—')
      : createElement(
          View,
          { key: 'cl' },
          ...ep.contacts.map((c, i) =>
            createElement(
              Text,
              { style: s.para, key: i },
              `${c.role ? c.role + ': ' : ''}${c.name}${c.phone ? '  ·  ' + c.phone : ''}${c.email ? '  ·  ' + c.email : ''}`,
            ),
          ),
        ),
    createElement(Text, { style: s.h2, key: 'l' }, 'Reference links'),
    ep.links.length === 0
      ? createElement(Text, { style: s.muted, key: 'ln' }, '—')
      : createElement(
          View,
          { key: 'll' },
          ...ep.links.map((l, i) => createElement(Text, { style: s.para, key: i }, `${l.label || l.url}: ${l.url}`)),
        ),
  ]);

  // One page per stage.
  const stagePages = data.stages.map((stage, si) =>
    createElement(Page, { size: 'LETTER', style: s.page, key: `stage-${si}` }, [
      createElement(PageFrame, { data, key: 'f' }),
      createElement(PageHeader, { data, key: 'h' }),
      createElement(Text, { style: s.h1, key: 'h1' }, `Stage: ${stage.name}`),
      createElement(Text, { style: s.h2, key: 'ph' }, 'Production (house package)'),
      ...data.departments.map((d) => {
        const rows = contentRows(stage.production[d.id] ?? {});
        if (rows.length === 0) return createElement(View, { key: `pp-${d.id}` });
        return createElement(View, { key: `pp-${d.id}` }, [
          createElement(Text, { style: s.h3, key: 't' }, d.name),
          createElement(Rows, { rows, key: 'r' }),
        ]);
      }),
      createElement(Text, { style: s.h2, key: 'ah' }, 'Artist advances'),
      stage.advances.length === 0
        ? createElement(Text, { style: s.muted, key: 'an' }, 'No artist advances.')
        : createElement(
            View,
            { key: 'al' },
            ...stage.advances.map((a, ai) => createElement(AdvanceBlock, { advance: a, deptName, key: ai })),
          ),
    ]),
  );

  return createElement(Document, {}, [cover, eventProductionPage, ...stagePages]);
}

function AdvanceBlock({ advance, deptName }: { advance: PacketAdvance; deptName: Map<string, string> }) {
  const sub = [advance.stage, advance.performanceDate].filter(Boolean).join('  ·  ');
  const summary: { label: string; value: string }[] = [];
  if (advance.additions) summary.push({ label: 'Additions', value: advance.additions });
  if (advance.concerns) summary.push({ label: 'Concerns', value: advance.concerns });
  if (advance.pending) summary.push({ label: 'Pending', value: advance.pending });

  const deptIds = Array.from(
    new Set([...Object.keys(advance.sections), ...Object.keys(advance.content)]),
  );

  return createElement(View, { style: { marginTop: 6, marginBottom: 6 }, wrap: false }, [
    createElement(Text, { style: { fontSize: 11, fontWeight: 'bold', color: INK }, key: 'n' }, advance.artistName),
    sub ? createElement(Text, { style: s.muted, key: 'sub' }, sub) : null,
    summary.length > 0 ? createElement(Rows, { rows: summary, key: 'sum' }) : null,
    ...deptIds.map((id) => {
      const status = advance.sections[id]?.status;
      const rows = contentRows(advance.content[id] ?? {});
      return createElement(View, { key: `d-${id}` }, [
        createElement(
          Text,
          { style: s.h3, key: 't' },
          `${deptName.get(id) ?? id}${status ? `  (${STATUS_LABEL[status] ?? status})` : ''}`,
        ),
        rows.length > 0 ? createElement(Rows, { rows, key: 'r' }) : null,
      ]);
    }),
  ]);
}

/** Render a packet to a PDF buffer. */
export function renderPacket(data: PacketData): Promise<Buffer> {
  return renderToBuffer(buildPacketDocument(data));
}
