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
 * A resolved logo for the packet: each variant is a base64 data URI (or null when that
 * variant couldn't be resolved). `coverDataUri` is the mark for the dark cover; `headerDataUri`
 * is the mark for the white content header. They may reference the same image.
 */
export interface PacketLogo {
  coverDataUri: string | null;
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
  /** Branding logos pre-resolved to data URIs: the event mark (rendered centered + larger)
   *  and the shared company marks (flanking, smaller). */
  logos: { eventLogo: PacketLogo | null; markLogos: PacketLogo[] };
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
  cover: { backgroundColor: BRAND, color: '#fff', padding: 0, height: '100%', justifyContent: 'flex-end' },
  coverSlash: {
    position: 'absolute',
    top: 120,
    left: -120,
    width: 900,
    height: 70,
    backgroundColor: ACCENT,
    transform: 'rotate(-32deg)',
  },
  coverInner: { padding: 48 },
  brandMark: { fontSize: 28, fontWeight: 'bold', letterSpacing: 2 },
  coverTitle: { fontSize: 34, fontWeight: 'bold', marginTop: 16 },
  coverSub: { fontSize: 12, color: '#cfcfcf', marginTop: 8 },
  // Logo rows mirror the app's LogoRow ratios (src/components/branding/LogoRow.tsx):
  // event = 2× mark height, marks in equal fixed-width slots, adjacent gap ≈ event/2.
  coverLogos: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
  coverEventLogo: { height: 46, marginHorizontal: 12, objectFit: 'contain' },
  coverMarkLogo: { height: 23, width: 84, marginHorizontal: 12, objectFit: 'contain' },
  page: { padding: 40, fontSize: 9, color: INK, fontFamily: 'Helvetica' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingBottom: 6,
    marginBottom: 12,
  },
  headerTitle: { fontSize: 11, fontWeight: 'bold', color: BRAND },
  headerMeta: { fontSize: 8, color: MUTED },
  headerText: { flex: 1 },
  headerLogos: { flexDirection: 'row', alignItems: 'center', marginLeft: 12 },
  headerEventLogo: { height: 22, marginHorizontal: 6, objectFit: 'contain' },
  headerMarkLogo: { height: 11, width: 40, marginHorizontal: 6, objectFit: 'contain' },
  h1: { fontSize: 16, fontWeight: 'bold', color: BRAND, marginBottom: 8 },
  h2: { fontSize: 12, fontWeight: 'bold', color: BRAND, marginTop: 12, marginBottom: 4 },
  h3: { fontSize: 10, fontWeight: 'bold', color: ACCENT, marginTop: 8, marginBottom: 2 },
  row: { flexDirection: 'row', marginBottom: 2 },
  rowLabel: { width: 130, color: MUTED },
  rowValue: { flex: 1 },
  para: { marginBottom: 3 },
  muted: { color: MUTED },
  footer: { position: 'absolute', bottom: 20, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', color: MUTED, fontSize: 8 },
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

/** Order the branding row: company marks split to each side of the larger, centered event mark. */
function arrangeLogos(eventUri: string | null, markUris: string[]): { src: string; isEvent: boolean }[] {
  if (!eventUri && markUris.length === 0) return [];
  const split = Math.ceil(markUris.length / 2);
  return [
    ...markUris.slice(0, split).map((src) => ({ src, isEvent: false })),
    ...(eventUri ? [{ src: eventUri, isEvent: true }] : []),
    ...markUris.slice(split).map((src) => ({ src, isEvent: false })),
  ];
}

function PageHeader({ data }: { data: PacketData }) {
  const meta = [data.event.venue, data.event.dateRange].filter(Boolean).join(' · ');
  const items = arrangeLogos(
    data.logos.eventLogo?.headerDataUri ?? null,
    data.logos.markLogos.map((l) => l.headerDataUri).filter((u): u is string => u !== null),
  );
  return createElement(View, { style: s.header, fixed: true }, [
    createElement(View, { style: s.headerText, key: 'tx' }, [
      createElement(Text, { style: s.headerTitle, key: 't' }, `${data.event.name} — Production Packet`),
      createElement(Text, { style: s.headerMeta, key: 'm' }, meta),
    ]),
    items.length > 0
      ? createElement(
          View,
          { style: s.headerLogos, key: 'logos' },
          ...items.map((it, i) =>
            createElement(Image, { src: it.src, style: it.isEvent ? s.headerEventLogo : s.headerMarkLogo, key: i }),
          ),
        )
      : null,
  ]);
}

function Footer() {
  return createElement(View, { style: s.footer, fixed: true }, [
    createElement(Text, { key: 'b' }, '46 Advance'),
    createElement(Text, {
      key: 'p',
      render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
        `${pageNumber} / ${totalPages}`,
    }),
  ]);
}

function buildPacketDocument(data: PacketData) {
  const deptName = new Map(data.departments.map((d) => [d.id, d.name]));

  const coverItems = arrangeLogos(
    data.logos.eventLogo?.coverDataUri ?? null,
    data.logos.markLogos.map((l) => l.coverDataUri).filter((u): u is string => u !== null),
  );
  const cover = createElement(Page, { size: 'LETTER', key: 'cover' }, [
    createElement(View, { style: s.cover, key: 'c' }, [
      createElement(View, { style: s.coverSlash, key: 'slash' }),
      createElement(View, { style: s.coverInner, key: 'inner' }, [
        createElement(Text, { style: s.brandMark, key: 'm' }, '46 / ADVANCE'),
        createElement(Text, { style: s.coverTitle, key: 't' }, data.event.name),
        createElement(
          Text,
          { style: s.coverSub, key: 'sub' },
          [data.event.venue, data.event.dateRange].filter(Boolean).join('  ·  '),
        ),
        createElement(Text, { style: s.coverSub, key: 'g' }, `Production packet · v${data.version} · generated ${data.generatedAt}`),
        coverItems.length > 0
          ? createElement(
              View,
              { style: s.coverLogos, key: 'logos' },
              ...coverItems.map((it, i) =>
                createElement(Image, { src: it.src, style: it.isEvent ? s.coverEventLogo : s.coverMarkLogo, key: i }),
              ),
            )
          : null,
      ]),
    ]),
  ]);

  // Event production page.
  const ep = data.eventProduction;
  const eventProductionPage = createElement(Page, { size: 'LETTER', style: s.page, key: 'ep' }, [
    createElement(PageHeader, { data, key: 'h' }),
    createElement(Footer, { key: 'f' }),
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
      createElement(PageHeader, { data, key: 'h' }),
      createElement(Footer, { key: 'f' }),
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
