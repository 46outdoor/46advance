import { useRef, useState } from 'react';
import { formatDate } from '@/lib/dates/formatting';
import { validateUpload } from '@/lib/storage/uploads';
import type { ProductionAttachment } from '@/lib/production/production';

interface Props {
  attachments: ProductionAttachment[];
  readOnly: boolean;
  uploading?: boolean;
  onUpload: (file: File) => void;
  onRemove: (attachment: ProductionAttachment) => void;
}

function sizeLabel(bytes: number): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Attachment list + upload (stage plots / CAD / site maps). */
export function AttachmentsEditor({ attachments, readOnly, uploading, onUpload, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = (file: File | undefined) => {
    if (!file) return;
    const err = validateUpload(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onUpload(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      {attachments.length === 0 && <p className="text-sm text-ink-muted">No attachments.</p>}
      <ul className="divide-y divide-line/60 text-sm">
        {attachments.map((a) => (
          <li key={a.path} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              <a className="text-accent underline" href={a.url} target="_blank" rel="noreferrer">
                {a.name}
              </a>
              <span className="ml-2 text-xs text-ink-muted">
                {sizeLabel(a.size)}
                {a.uploadedAt ? ` · ${formatDate(a.uploadedAt)}` : ''}
              </span>
            </span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => onRemove(a)}
                className="rounded border border-line px-2 py-0.5 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {!readOnly && (
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf"
            disabled={uploading}
            onChange={(e) => pick(e.target.files?.[0])}
            className="text-sm"
          />
          {uploading && <span className="text-sm text-ink-muted">Uploading…</span>}
          {error && <span className="text-sm text-accent">{error}</span>}
        </div>
      )}
    </div>
  );
}
