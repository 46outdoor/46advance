import { useState } from 'react';
import { FilePickerButton } from '@/components/FilePickerButton';
import {
  deleteFile,
  uploadFile,
  validateImageUpload,
  type UploadedFile,
} from '@/lib/storage/uploads';
import type { Logo } from '@/lib/branding/logo';

interface Props {
  logo: Logo;
  /** Storage path prefix, e.g. `branding/<id>` or `templates/<id>/logo`. */
  pathPrefix: string;
  /**
   * Persist (immediate-save parent) or stage (draft parent) the new logo. The uploader AWAITS it
   * and, if it rejects, deletes the just-uploaded object so a failed save can't orphan it (F-5).
   * The uploader never deletes the previous object — the parent owns that (see `supersededLogoPaths`),
   * so a cancelled/failed edit never destroys the already-persisted logo.
   */
  onChange: (logo: Logo) => void | Promise<void>;
  disabled?: boolean;
}

// `ariaLabel` is spelled out per variant: the two pickers sit side by side, so a bare
// "Choose file" gives a screen reader no way to tell them apart.
const VARIANTS = [
  {
    key: 'onDark',
    label: 'For dark backgrounds',
    hint: 'white / light mark',
    swatch: 'bg-brand',
    ariaLabel: 'Choose a logo file for dark backgrounds',
  },
  {
    key: 'onLight',
    label: 'For light backgrounds',
    hint: 'dark / color mark',
    swatch: 'bg-surface border border-line',
    ariaLabel: 'Choose a logo file for light backgrounds',
  },
] as const;

/** Dual-variant logo upload (onDark + onLight); previews each on its target background. */
export function LogoUploader({ logo, pathPrefix, onChange, disabled }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (variant: 'onDark' | 'onLight', file: File): Promise<void> => {
    // Byte-level check, not just the extension: every logo in the app lands in a PDF packet, and
    // the renderer embeds PNG/JPEG only — a mislabelled WebP would upload fine and silently render
    // as a missing logo. See `validateImageUpload`.
    const err = await validateImageUpload(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setBusy(variant);
    let uploaded: UploadedFile | undefined;
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      uploaded = await uploadFile(`${pathPrefix}/${variant}-${Date.now()}.${ext}`, file);
      // Persist/stage the new ref FIRST; the parent deletes the superseded object only once this
      // resolves durably. The previous logo is never touched here.
      await onChange({ ...logo, [variant]: { path: uploaded.path, url: uploaded.url } });
    } catch {
      // Upload or the parent's durable save failed. If we uploaded, drop the new object so a failed
      // save can't orphan it (F-5); the previous logo stays intact.
      if (uploaded) await deleteFile(uploaded.path).catch(() => undefined);
      setError('Upload failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (variant: 'onDark' | 'onLight'): Promise<void> => {
    // Stage/persist the removal; the parent deletes the removed object once that's durable.
    try {
      await onChange({ ...logo, [variant]: null });
    } catch {
      setError('Could not save. Please try again.');
    }
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
              <FilePickerButton
                label="Choose file"
                accept=".png,.jpg,.jpeg"
                disabled={disabled || busy === v.key}
                ariaLabel={v.ariaLabel}
                onFile={(file) => void pick(v.key, file)}
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
