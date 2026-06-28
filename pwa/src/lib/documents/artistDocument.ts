/**
 * Artist document model (`artistDocuments/{fileId}`) — the standalone artist-document library.
 * Each is a Google Drive file (linked, not copied) tagged with the artist (from its per-artist
 * subfolder on import) and classified by a document category. Created server-side by
 * `importDriveFolder`; clients read, classify, and delete. Artists are matched to events by a
 * normalized name key (see `artistKey`).
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';

export interface ArtistDocument {
  id: string;
  fileId: string;
  name: string;
  mimeType: string;
  iconLink: string | null;
  webViewLink: string;
  /** Display name (subfolder); null for files imported from the folder root (unsorted). */
  artist: string | null;
  /** Normalized match key (lowercase, collapsed whitespace); null when unsorted. */
  artistKey: string | null;
  categoryId: string | null;
  importedBy: string;
  importedByEmail: string | null;
  importedAt: Date | null;
}

/** Normalize an artist name to a match key shared between import subfolders + advance names. */
export function artistKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const artistDocumentDocSchema = z.object({
  fileId: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().optional(),
  iconLink: z.string().nullable().optional(),
  webViewLink: z.string().min(1),
  artist: z.string().nullable().optional(),
  artistKey: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  importedBy: z.string().min(1),
  importedByEmail: z.string().nullable().optional(),
  importedAt: z.instanceof(Timestamp).nullable().optional(),
});

export function parseArtistDocument(id: string, data: unknown): ArtistDocument {
  const d = artistDocumentDocSchema.parse(data);
  return {
    id,
    fileId: d.fileId,
    name: d.name,
    mimeType: d.mimeType ?? 'application/octet-stream',
    iconLink: d.iconLink ?? null,
    webViewLink: d.webViewLink,
    artist: d.artist ?? null,
    artistKey: d.artistKey ?? null,
    categoryId: d.categoryId ?? null,
    importedBy: d.importedBy,
    importedByEmail: d.importedByEmail ?? null,
    importedAt: timestampToDate(d.importedAt ?? null),
  };
}

/** A distinct artist with a document count, derived from the library. */
export interface ArtistSummary {
  key: string;
  name: string;
  count: number;
}

/** Group documents into distinct artists (by key), sorted by name. Unsorted docs are excluded. */
export function artistsFromDocuments(docs: readonly ArtistDocument[]): ArtistSummary[] {
  const map = new Map<string, ArtistSummary>();
  for (const d of docs) {
    if (!d.artistKey || !d.artist) continue;
    const existing = map.get(d.artistKey);
    if (existing) existing.count += 1;
    else map.set(d.artistKey, { key: d.artistKey, name: d.artist, count: 1 });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
