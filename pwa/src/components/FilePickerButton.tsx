import { useState } from 'react';

interface FilePickerButtonProps {
  /** Button text, e.g. "Choose file". */
  label: string;
  accept?: string;
  disabled?: boolean;
  ariaLabel?: string;
  onFile: (file: File) => void;
}

/**
 * Brand-styled replacement for the browser's grey `<input type="file">`: a button-styled label
 * over a visually-hidden input (still keyboard-focusable and screen-reader labelled), showing the
 * chosen filename. Reset it by remounting with a changing `key`, as the callers already do.
 */
export function FilePickerButton({
  label,
  accept,
  disabled,
  ariaLabel,
  onFile,
}: FilePickerButtonProps) {
  const [name, setName] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <label
        className={`inline-flex min-h-11 cursor-pointer items-center rounded border border-line px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent focus-within:border-accent sm:min-h-0 ${
          disabled ? 'pointer-events-none opacity-50' : ''
        }`}
      >
        {label}
        <input
          type="file"
          accept={accept}
          disabled={disabled}
          aria-label={ariaLabel ?? label}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ''; // let the same file be re-picked
            if (file) {
              setName(file.name);
              onFile(file);
            }
          }}
        />
      </label>
      {name && <span className="max-w-[16rem] truncate text-sm text-ink-muted">{name}</span>}
    </span>
  );
}
