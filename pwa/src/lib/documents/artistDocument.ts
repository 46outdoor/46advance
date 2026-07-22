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
  /** The Drive filename (unchanged in Drive). */
  name: string;
  /** In-app display title that overrides `name` for display — never renames the Drive file. */
  displayName: string | null;
  /** App-side notes about the document. */
  notes: string | null;
  /** Flagged outdated/obsolete in the app (the Drive file is untouched). */
  obsolete: boolean;
  /** When a manager last marked it "verified current"; null = never. Expires after 6 months. */
  verifiedAt: Date | null;
  mimeType: string;
  iconLink: string | null;
  webViewLink: string;
  /** Display name (subfolder); null for files imported from the folder root (unsorted). */
  artist: string | null;
  /** Normalized match key (lowercase, collapsed whitespace); null when unsorted. */
  artistKey: string | null;
  categoryId: string | null;
  /** The Drive folder the file lives in (upload target for that artist); null pre-backfill. */
  sourceFolderId: string | null;
  /** Set by the scheduled Drive sync when the file vanished from the library tree
   * (deleted or moved — indistinguishable); cleared if it reappears. */
  missingFromDrive: boolean;
  /** When the sync first flagged it missing; null when present (or pre-timestamp). */
  missingAt: Date | null;
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
  displayName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  obsolete: z.boolean().optional(),
  verifiedAt: z.instanceof(Timestamp).nullable().optional(),
  mimeType: z.string().optional(),
  iconLink: z.string().nullable().optional(),
  webViewLink: z.string().min(1),
  artist: z.string().nullable().optional(),
  artistKey: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  sourceFolderId: z.string().nullable().optional(),
  missingFromDrive: z.boolean().optional(),
  missingAt: z.instanceof(Timestamp).nullable().optional(),
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
    displayName: d.displayName ?? null,
    notes: d.notes ?? null,
    obsolete: d.obsolete === true,
    verifiedAt: timestampToDate(d.verifiedAt ?? null),
    mimeType: d.mimeType ?? 'application/octet-stream',
    iconLink: d.iconLink ?? null,
    webViewLink: d.webViewLink,
    artist: d.artist ?? null,
    artistKey: d.artistKey ?? null,
    categoryId: d.categoryId ?? null,
    sourceFolderId: d.sourceFolderId ?? null,
    missingFromDrive: d.missingFromDrive === true,
    missingAt: timestampToDate(d.missingAt ?? null),
    importedBy: d.importedBy,
    importedByEmail: d.importedByEmail ?? null,
    importedAt: timestampToDate(d.importedAt ?? null),
  };
}

/** Title shown in the app: the in-app override if set, else the Drive filename. */
export function documentTitle(doc: Pick<ArtistDocument, 'displayName' | 'name'>): string {
  return doc.displayName?.trim() || doc.name;
}

/** How long a "verified current" status lasts before it auto-resets to unverified. */
export const VERIFICATION_VALID_MONTHS = 6;

/** True if `verifiedAt` is set and still within the validity window (derived at read time). */
export function isVerifiedCurrent(verifiedAt: Date | null, now: Date): boolean {
  if (!verifiedAt) return false;
  const expires = new Date(verifiedAt);
  expires.setMonth(expires.getMonth() + VERIFICATION_VALID_MONTHS);
  return now < expires;
}

/** A distinct artist with a document count, derived from the library. */
export interface ArtistSummary {
  key: string;
  name: string;
  /** Total documents (includes any removed-from-Drive). */
  count: number;
  /** How many of `count` are flagged removed from Drive (a subset). */
  removedCount: number;
}

/** Sort key that ignores a leading "The " so "The Beatles" alphabetizes under "B". */
export function artistSortName(name: string): string {
  return name.replace(/^the\s+/i, '');
}

/** Group documents into distinct artists (by key), sorted by name (ignoring a leading "The").
 *  Unsorted docs are excluded. */
export function artistsFromDocuments(docs: readonly ArtistDocument[]): ArtistSummary[] {
  const map = new Map<string, ArtistSummary>();
  for (const d of docs) {
    if (!d.artistKey || !d.artist) continue;
    const existing = map.get(d.artistKey);
    if (existing) {
      existing.count += 1;
      if (d.missingFromDrive) existing.removedCount += 1;
    } else {
      map.set(d.artistKey, {
        key: d.artistKey,
        name: d.artist,
        count: 1,
        removedCount: d.missingFromDrive ? 1 : 0,
      });
    }
  }
  return [...map.values()].sort((a, b) =>
    artistSortName(a.name).localeCompare(artistSortName(b.name), undefined, { sensitivity: 'base' }),
  );
}

/**
 * Filter artist summaries by a search term (case-insensitive). By default matches on the artist
 * name only; when `includeFileNames` is true an artist ALSO matches if any of its documents' title
 * or Drive filename contains the term — useful for tracking down a misfiled document.
 */
export function filterArtists(
  artists: readonly ArtistSummary[],
  docs: readonly ArtistDocument[],
  query: string,
  includeFileNames: boolean,
): ArtistSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...artists];
  const fileMatchKeys = new Set<string>();
  if (includeFileNames) {
    for (const d of docs) {
      if (!d.artistKey) continue;
      const title = (d.displayName ?? d.name).toLowerCase();
      if (title.includes(q) || d.name.toLowerCase().includes(q)) fileMatchKeys.add(d.artistKey);
    }
  }
  return artists.filter((a) => a.name.toLowerCase().includes(q) || fileMatchKeys.has(a.key));
}
