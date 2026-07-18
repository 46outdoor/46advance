import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { appendPacketAttachments, MAX_EMBED_BYTES, type PacketAttachment } from './attachments.js';

/** A minimal n-page PDF buffer. */
async function makePdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([612, 792]);
  return Buffer.from(await doc.save());
}

/** A real 1×1 transparent PNG. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const att = (over: Partial<PacketAttachment> = {}): PacketAttachment => ({
  artistName: 'Jelly Roll',
  title: 'Rider.pdf',
  mimeType: 'application/pdf',
  fileId: 'f1',
  ...over,
});

async function pageCount(buffer: Buffer): Promise<number> {
  return (await PDFDocument.load(buffer)).getPageCount();
}

describe('appendPacketAttachments', () => {
  it('returns the base unchanged with nothing to attach', async () => {
    const base = await makePdf(3);
    const out = await appendPacketAttachments(base, [], async () => {
      throw new Error('unused');
    });
    expect(out).toBe(base);
  });

  it('appends a divider page plus merged PDF pages and image pages, per artist', async () => {
    const base = await makePdf(2);
    const twoPager = await makePdf(2);
    const out = await appendPacketAttachments(
      base,
      [
        att({ fileId: 'pdf-1' }),
        att({ fileId: 'img-1', title: 'Stage.png', mimeType: 'image/png' }),
        att({ fileId: 'pdf-2', artistName: 'Other Act', title: 'Plot.pdf' }),
      ],
      async (fileId, mimeType) =>
        mimeType === 'image/png' ? { data: PNG_1X1, mimeType } : { data: twoPager, mimeType: 'application/pdf' },
    );
    // base 2 + (divider + 2 pdf pages + 1 image) for Jelly Roll + (divider + 2 pdf pages) for Other Act
    expect(await pageCount(out)).toBe(2 + 4 + 3);
  });

  it('lists (but does not embed) oversized, preflighted, unsupported, unreadable, and unfetchable files', async () => {
    const base = await makePdf(1);
    const out = await appendPacketAttachments(
      base,
      [
        att({ fileId: 'big' }),
        att({ fileId: 'preflighted' }),
        att({ fileId: 'video', mimeType: 'video/mp4' }),
        att({ fileId: 'corrupt' }),
        att({ fileId: 'gone' }),
      ],
      async (fileId) => {
        if (fileId === 'big') return { data: Buffer.alloc(MAX_EMBED_BYTES + 1), mimeType: 'application/pdf' };
        if (fileId === 'preflighted') return { tooLarge: true };
        if (fileId === 'video') return { data: Buffer.from('x'), mimeType: 'video/mp4' };
        if (fileId === 'corrupt') return { data: Buffer.from('not a pdf'), mimeType: 'application/pdf' };
        throw new Error('fetch failed');
      },
    );
    // base 1 + one divider page listing all five; nothing embedded.
    expect(await pageCount(out)).toBe(2);
  });

  it('paginates a long divider list instead of truncating it', async () => {
    const base = await makePdf(1);
    const attachments = Array.from({ length: 60 }, (_, i) =>
      att({ fileId: `f${i}`, title: `Doc ${i}`, mimeType: 'video/mp4' }),
    );
    const out = await appendPacketAttachments(base, attachments, async () => ({
      data: Buffer.from('x'),
      mimeType: 'video/mp4',
    }));
    // 60 unsupported entries (title + note each) exceed one LETTER page — the divider
    // must continue onto extra pages rather than dropping entries.
    expect(await pageCount(out)).toBeGreaterThanOrEqual(4);
  });
});
