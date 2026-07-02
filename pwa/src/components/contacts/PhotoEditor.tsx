import { useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { useAuth } from '@/contexts/auth-context';
import { deleteFile, uploadFile, validateUpload } from '@/lib/storage/uploads';
import { downscaleImage } from '@/lib/storage/image';
import { ContactAvatar } from './ContactAvatar';
import type { ContactPhoto, CropRect } from '@/lib/contacts/contact';

interface Props {
  photo: ContactPhoto | null;
  name: string;
  onChange: (photo: ContactPhoto | null) => void | Promise<void>;
  /** Avatar size classes (default h-16 w-16). */
  size?: string;
}

/** Modal cropper: zoom/pan a round crop, reports the crop rectangle (natural pixels) on save. */
function CropModal({ src, onCancel, onSave }: { src: string; onCancel: () => void; onSave: (crop: CropRect) => void }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  const save = () => {
    if (!areaPixels || !natural) return;
    onSave({
      x: Math.round(areaPixels.x),
      y: Math.round(areaPixels.y),
      width: Math.round(areaPixels.width),
      height: Math.round(areaPixels.height),
      natW: natural.w,
      natH: natural.h,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand/70 p-4">
      <div className="w-full max-w-md rounded-lg bg-surface p-4 shadow-xl">
        <div className="relative h-64 w-full overflow-hidden rounded bg-ink">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_area, px) => setAreaPixels(px)}
            onMediaLoaded={(m) => setNatural({ w: m.naturalWidth, h: m.naturalHeight })}
          />
        </div>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          aria-label="Zoom"
          onChange={(e) => setZoom(Number(e.target.value))}
          className="mt-3 w-full"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded border border-line px-3 py-1.5 text-sm text-ink-muted hover:text-ink">
            Cancel
          </button>
          <button type="button" onClick={save} className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/** Avatar + upload/reframe/remove, with a round crop step. Stores the original + crop rectangle
 *  so reframing re-opens the cropper on the original (no re-upload). */
export function PhotoEditor({ photo, name, onChange, size = 'h-16 w-16' }: Props) {
  const { user } = useAuth();
  const [editing, setEditing] = useState<{ src: string; file: File | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (file: File | undefined) => {
    if (!file) return;
    const err = validateUpload(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setEditing({ src: URL.createObjectURL(file), file });
  };

  const cancel = () => {
    if (editing?.file) URL.revokeObjectURL(editing.src);
    setEditing(null);
  };

  const onCropSaved = async (crop: CropRect) => {
    if (!editing) return;
    if (editing.file && !user) {
      setError('You must be signed in to upload a photo.');
      return;
    }
    setBusy(true);
    try {
      if (editing.file && user) {
        const prev = photo;
        const ext = editing.file.name.split('.').pop()?.toLowerCase() || 'png';
        // Downscale large camera photos before upload; the ratio-based crop rect stays valid.
        const scaled = await downscaleImage(editing.file);
        // Uploader-scoped path (contacts/photos/{uid}/…) so storage.rules can confine writes.
        const uploaded = await uploadFile(`contacts/photos/${user.uid}/${Date.now()}.${ext}`, scaled);
        await onChange({ path: uploaded.path, url: uploaded.url, crop });
        if (prev) await deleteFile(prev.path).catch(() => undefined);
      } else if (photo) {
        await onChange({ ...photo, crop });
      }
      cancel();
    } catch {
      setError('Could not save the photo. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const prev = photo;
    await onChange(null);
    if (prev) await deleteFile(prev.path).catch(() => undefined);
  };

  return (
    <div>
      <div className="flex items-center gap-4">
        <ContactAvatar name={name || '?'} photo={photo} className={size} />
        <div className="text-sm">
          <label className="cursor-pointer font-semibold text-accent hover:underline">
            {photo ? 'Replace' : 'Upload photo'}
            <input
              type="file"
              accept=".png,.jpg,.jpeg"
              className="hidden"
              disabled={busy}
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </label>
          {photo && (
            <button type="button" onClick={() => setEditing({ src: photo.url, file: null })} className="ml-3 text-ink-muted hover:text-accent">
              Reframe
            </button>
          )}
          {photo && (
            <button type="button" onClick={() => void remove()} className="ml-3 text-ink-muted hover:text-accent">
              Remove
            </button>
          )}
          {busy && <span className="ml-3 text-ink-muted">Saving…</span>}
          {error && <p className="mt-1 text-accent">{error}</p>}
        </div>
      </div>
      {editing && <CropModal src={editing.src} onCancel={cancel} onSave={(c) => void onCropSaved(c)} />}
    </div>
  );
}
