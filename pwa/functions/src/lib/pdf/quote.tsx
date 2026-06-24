/**
 * 46-branded quote/estimate PDF (ROADMAP §9). Pure renderer: the function maps Firestore →
 * QuotePdfData and calls renderQuote(). @react-pdf/renderer (no headless browser); reuses
 * the brand idiom from packet.tsx (createElement, no JSX syntax).
 */
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';

const BRAND = '#0a0a0a';
const ACCENT = '#f04040';
const INK = '#262626';
const MUTED = '#525763';
const LINE = '#d4d4d4';

export interface QuotePdfLine {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface QuotePdfData {
  event: { name: string; venue?: string | null; dateRange?: string | null };
  artistName: string;
  quote: {
    title: string;
    statusLabel: string;
    notes?: string | null;
    decisionNote?: string | null;
    lines: QuotePdfLine[];
    total: string;
  };
  generatedAt: string;
}

const MONEY_FMT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const fmtMoney = (n: number): string => MONEY_FMT.format(n);

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: INK, fontFamily: 'Helvetica' },
  header: { borderBottomWidth: 2, borderBottomColor: ACCENT, paddingBottom: 8, marginBottom: 14 },
  brandMark: { fontSize: 18, fontWeight: 'bold', color: BRAND, letterSpacing: 1 },
  docType: { fontSize: 9, color: MUTED, marginTop: 2, textTransform: 'uppercase', letterSpacing: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  metaBlock: { maxWidth: 260 },
  title: { fontSize: 15, fontWeight: 'bold', color: BRAND, marginBottom: 2 },
  muted: { color: MUTED },
  statusPill: { fontSize: 9, fontWeight: 'bold', color: ACCENT, textTransform: 'uppercase', letterSpacing: 1 },
  table: { marginTop: 16, borderTopWidth: 1, borderTopColor: LINE },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 5 },
  thRow: { flexDirection: 'row', backgroundColor: '#f2f2f2', paddingVertical: 5 },
  cDesc: { flex: 1, paddingHorizontal: 6 },
  cQty: { width: 60, paddingHorizontal: 6, textAlign: 'right' },
  cUnit: { width: 80, paddingHorizontal: 6, textAlign: 'right' },
  cTotal: { width: 90, paddingHorizontal: 6, textAlign: 'right' },
  th: { fontSize: 8, fontWeight: 'bold', color: MUTED, textTransform: 'uppercase', letterSpacing: 1 },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  totalLabel: { width: 90, textAlign: 'right', paddingHorizontal: 6, color: MUTED },
  totalValue: { width: 90, textAlign: 'right', paddingHorizontal: 6, fontWeight: 'bold', color: BRAND, fontSize: 12 },
  section: { marginTop: 18 },
  h2: { fontSize: 10, fontWeight: 'bold', color: BRAND, marginBottom: 3 },
  para: { lineHeight: 1.4 },
  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', color: MUTED, fontSize: 8 },
});

function buildQuoteDocument(data: QuotePdfData) {
  const meta = [data.event.venue, data.event.dateRange].filter(Boolean).join('  ·  ');

  const tableHeader = createElement(View, { style: s.thRow, key: 'th' }, [
    createElement(View, { style: s.cDesc, key: 'd' }, createElement(Text, { style: s.th }, 'Description')),
    createElement(View, { style: s.cQty, key: 'q' }, createElement(Text, { style: s.th }, 'Qty')),
    createElement(View, { style: s.cUnit, key: 'u' }, createElement(Text, { style: s.th }, 'Unit')),
    createElement(View, { style: s.cTotal, key: 't' }, createElement(Text, { style: s.th }, 'Amount')),
  ]);

  const rows = data.quote.lines.map((line, i) =>
    createElement(View, { style: s.tr, key: `r${i}`, wrap: false }, [
      createElement(View, { style: s.cDesc, key: 'd' }, createElement(Text, {}, line.description)),
      createElement(View, { style: s.cQty, key: 'q' }, createElement(Text, {}, String(line.quantity))),
      createElement(View, { style: s.cUnit, key: 'u' }, createElement(Text, {}, fmtMoney(line.unitPrice))),
      createElement(View, { style: s.cTotal, key: 't' }, createElement(Text, {}, fmtMoney(line.total))),
    ]),
  );

  const page = createElement(Page, { size: 'LETTER', style: s.page, key: 'p' }, [
    createElement(View, { style: s.header, key: 'h' }, [
      createElement(Text, { style: s.brandMark, key: 'm' }, '46 / ADVANCE'),
      createElement(Text, { style: s.docType, key: 't' }, 'Quote / Estimate'),
    ]),

    createElement(View, { style: s.metaRow, key: 'meta' }, [
      createElement(View, { style: s.metaBlock, key: 'l' }, [
        createElement(Text, { style: s.title, key: 't' }, data.quote.title),
        createElement(Text, { style: s.muted, key: 'a' }, `Artist: ${data.artistName}`),
        createElement(Text, { style: s.muted, key: 'e' }, data.event.name),
        meta ? createElement(Text, { style: s.muted, key: 'm' }, meta) : null,
      ]),
      createElement(View, { key: 'r' }, [
        createElement(Text, { style: s.statusPill, key: 's' }, data.quote.statusLabel),
        createElement(Text, { style: s.muted, key: 'g' }, `Generated ${data.generatedAt}`),
      ]),
    ]),

    createElement(View, { style: s.table, key: 'table' }, [
      tableHeader,
      ...rows,
    ]),
    createElement(View, { style: s.totalRow, key: 'total' }, [
      createElement(Text, { style: s.totalLabel, key: 'l' }, 'Total'),
      createElement(Text, { style: s.totalValue, key: 'v' }, data.quote.total),
    ]),

    data.quote.notes
      ? createElement(View, { style: s.section, key: 'notes' }, [
          createElement(Text, { style: s.h2, key: 'h' }, 'Notes'),
          createElement(Text, { style: s.para, key: 'p' }, data.quote.notes),
        ])
      : null,
    data.quote.decisionNote
      ? createElement(View, { style: s.section, key: 'dec' }, [
          createElement(Text, { style: s.h2, key: 'h' }, 'Decision note'),
          createElement(Text, { style: s.para, key: 'p' }, data.quote.decisionNote),
        ])
      : null,

    createElement(View, { style: s.footer, key: 'f', fixed: true }, [
      createElement(Text, { key: 'b' }, '46 Advance'),
      createElement(Text, { key: 't' }, data.quote.title),
    ]),
  ]);

  return createElement(Document, {}, page);
}

/** Render a quote to a PDF buffer. */
export function renderQuote(data: QuotePdfData): Promise<Buffer> {
  return renderToBuffer(buildQuoteDocument(data));
}
