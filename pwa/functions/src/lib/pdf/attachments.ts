/**
 * Packet attachments (Documents PR 5 — planning/DOCUMENTS_FEATURE.md decision 1).
 * Appends each advance's "include in packet" documents to the rendered packet: per
 * artist, a divider page listing the attached documents (with a note for anything not
 * embedded), then the content — PDF pages copied at native size/orientation, images as
 * LETTER pages fitted within margins. Files over the size cap, of unsupported types,
 * or that fail to fetch/parse are LISTED on the divider, never dropped silently.
 * Pure pdf-lib with an injected byte fetcher — unit-testable without Drive.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

export interface PacketAttachment {
  artistName: string;
  title: string;
  mimeType: string;
  fileId: string;
}

export type AttachmentFetcher = (
  fileId: string,
  mimeType: string,
) => Promise<{ data: Buffer; mimeType: string } | { tooLarge: true }>;

/** Embedding cap per file — larger files are listed with an open-in-app note. */
export const MAX_EMBED_BYTES = 10 * 1024 * 1024;

const LETTER: [number, number] = [612, 792];
const MARGIN = 36;
const INK = rgb(0.08, 0.08, 0.08);
const MUTED = rgb(0.45, 0.45, 0.45);
const BRAND = rgb(0.94, 0.25, 0.25);

interface FetchedAttachment {
  title: string;
  note: string | null;
  content: { kind: 'pdf'; src: PDFDocument } | { kind: 'image'; bytes: Buffer; mime: string } | null;
}

/** Fetch + classify one attachment (PDFs parse here, once); failures become divider
 * notes, never throws. The fetcher preflights sizes where it can (`tooLarge`); the
 * post-hoc length check covers exported Google-native docs, which have no size until
 * exported. */
async function fetchAttachment(att: PacketAttachment, fetchBytes: AttachmentFetcher): Promise<FetchedAttachment> {
  try {
    const result = await fetchBytes(att.fileId, att.mimeType);
    if ('tooLarge' in result) {
      return { title: att.title, note: 'not embedded — file too large; open it in the app', content: null };
    }
    const { data, mimeType } = result;
    if (data.length > MAX_EMBED_BYTES) {
      return { title: att.title, note: 'not embedded — file too large; open it in the app', content: null };
    }
    if (mimeType === 'application/pdf') {
      try {
        const src = await PDFDocument.load(data);
        return { title: att.title, note: null, content: { kind: 'pdf', src } };
      } catch {
        return { title: att.title, note: 'not embedded — unreadable PDF; open it in the app', content: null };
      }
    }
    if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
      return { title: att.title, note: null, content: { kind: 'image', bytes: data, mime: mimeType } };
    }
    return { title: att.title, note: 'not embedded — unsupported type; open it in the app', content: null };
  } catch {
    return { title: att.title, note: 'not embedded — could not fetch; open it in the app', content: null };
  }
}

/** The artist's divider page(s): heading + one line per attached document, paginating
 * (with a "continued" heading) rather than truncating long lists. */
function drawDividerPages(
  doc: PDFDocument,
  artist: string,
  items: readonly FetchedAttachment[],
  fonts: { regular: PDFFont; bold: PDFFont },
): void {
  const startPage = (continued: boolean): { page: ReturnType<PDFDocument['addPage']>; y: number } => {
    const page = doc.addPage(LETTER);
    let y = LETTER[1] - MARGIN - 24;
    page.drawText('Attached documents', { x: MARGIN, y, size: 11, font: fonts.bold, color: BRAND });
    y -= 26;
    page.drawText(continued ? `${artist} (continued)` : artist, { x: MARGIN, y, size: 20, font: fonts.bold, color: INK });
    y -= 30;
    return { page, y };
  };
  let { page, y } = startPage(false);
  for (const item of items) {
    if (y < MARGIN + 34) ({ page, y } = startPage(true));
    page.drawText(`•  ${item.title}`, { x: MARGIN, y, size: 12, font: fonts.regular, color: INK });
    y -= 16;
    if (item.note) {
      page.drawText(item.note, { x: MARGIN + 14, y, size: 9, font: fonts.regular, color: MUTED });
      y -= 14;
    }
    y -= 4;
  }
}

/** Append one image as its own LETTER page, fitted within margins, centered. */
async function appendImagePage(doc: PDFDocument, bytes: Buffer, mime: string): Promise<void> {
  const image = mime === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const maxW = LETTER[0] - MARGIN * 2;
  const maxH = LETTER[1] - MARGIN * 2;
  const scale = Math.min(maxW / image.width, maxH / image.height, 1);
  const w = image.width * scale;
  const h = image.height * scale;
  const page = doc.addPage(LETTER);
  page.drawImage(image, { x: (LETTER[0] - w) / 2, y: (LETTER[1] - h) / 2, width: w, height: h });
}

/**
 * Append the packet's attachments to the rendered base PDF, grouped by artist in the
 * given order (divider page, then that artist's content). Returns the base unchanged
 * when there's nothing to attach.
 */
export async function appendPacketAttachments(
  basePdf: Buffer,
  attachments: readonly PacketAttachment[],
  fetchBytes: AttachmentFetcher,
): Promise<Buffer> {
  if (attachments.length === 0) return basePdf;
  const doc = await PDFDocument.load(basePdf);
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const groups = new Map<string, PacketAttachment[]>();
  for (const att of attachments) {
    const group = groups.get(att.artistName);
    if (group) group.push(att);
    else groups.set(att.artistName, [att]);
  }

  for (const [artist, group] of groups) {
    // Sequential fetches — an artist's documents download one at a time so a large
    // selection can't stack every file in memory simultaneously.
    const fetched: FetchedAttachment[] = [];
    for (const att of group) fetched.push(await fetchAttachment(att, fetchBytes));
    drawDividerPages(doc, artist, fetched, fonts);
    for (const item of fetched) {
      if (!item.content) continue;
      if (item.content.kind === 'image') {
        await appendImagePage(doc, item.content.bytes, item.content.mime);
      } else {
        const pages = await doc.copyPages(item.content.src, item.content.src.getPageIndices());
        for (const page of pages) doc.addPage(page);
      }
    }
  }

  return Buffer.from(await doc.save());
}
