import { useState } from 'react';
import { deleteFile, uploadFile, validateUpload } from '@/lib/storage/uploads';
import type { Logo } from '@/lib/branding/logo';

interface Props {
  logo: Logo;
  /** Storage path prefix, e.g. `branding/<id>` or `templates/<id>/logo`. */
  pathPrefix: string;
  onChange: (logo: Logo) => void;
  disabled?: boolean;
}

const VARIANTS = [
  { key: 'onDark', label: 'For dark backgrounds', hint: 'white / light mark', swatch: 'bg-brand' },
  { key: 'onLight', label: 'For light backgrounds', hint: 'dark / color mark', swatch: 'bg-surface border border-line' },
] as const;

/** Dual-variant logo upload (onDark + onLight); previews each on its target background. */
export function LogoUploader({ logo, pathPrefix, onChange, disabled }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (variant: 'onDark' | 'onLight', file: File | undefined): Promise<void> => {
    if (!file) return;
    const err = validateUpload(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setBusy(variant);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const uploaded = await uploadFile(`${pathPrefix}/${variant}-${Date.now()}.${ext}`, file);
      const prev = logo[variant];
      onChange({ ...logo, [variant]: { path: uploaded.path, url: uploaded.url } });
      if (prev) await deleteFile(prev.path).catch(() => undefined);
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (variant: 'onDark' | 'onLight'): Promise<void> => {
    const prev = logo[variant];
    onChange({ ...logo, [variant]: null });
    if (prev) await deleteFile(prev.path).catch(() => undefined);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {VARIANTS.map((v) => {
        const img = logo[v.key];
        return (
          <div key={v.key} className="rounded border border-line p-3">
            <div className="mb-2 text-xs font-semibold text-ink">
              {v.label} <span className="font-normal text-ink-muted">({v.hint})</span>
            </div>
            {img ? (
              <div className="space-y-2">
                <div className={`flex items-center justify-center rounded p-3 ${v.swatch}`}>
                  <img src={img.url} alt="" className="max-h-12 w-auto" />
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => void remove(v.key)}
                    className="text-xs text-ink-muted transition-colors hover:text-accent"
                  >
                    Remove
                  </button>
                )}
              </div>
            ) : (
              <input
                type="file"
                accept=".png,.jpg,.jpeg"
                disabled={disabled || busy === v.key}
                onChange={(e) => void pick(v.key, e.target.files?.[0])}
                className="text-xs"
              />
            )}
            {busy === v.key && <p className="mt-1 text-xs text-ink-muted">Uploading…</p>}
          </div>
        );
      })}
      {error && <p className="text-sm text-accent sm:col-span-2">{error}</p>}
    </div>
  );
}
