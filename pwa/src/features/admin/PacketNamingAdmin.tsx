/**
 * Admin: the packet config (`config/packets`) — the filename convention (`filenamePattern`) and the
 * `{type}` label (`typeLabel`). The server fills the tokens + sanitizes when generating a packet or
 * saving one to Drive. Follows the DocumentLibraryAdmin pattern: local draft, explicit save.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import {
  DEFAULT_PACKET_FILENAME_PATTERN,
  DEFAULT_PACKET_TYPE_LABEL,
  PACKET_FILENAME_TOKENS,
  getPacketConfig,
  packetConfigKey,
  setPacketConfig,
} from '@/lib/packets/packet-config-service';

const logger = createLogger('PacketNaming');

export function PacketNamingAdmin() {
  const queryClient = useQueryClient();
  const configQuery = useQuery({ queryKey: packetConfigKey(), queryFn: getPacketConfig });
  const [pattern, setPattern] = useState('');
  const [typeLabel, setTypeLabel] = useState('');

  // Hydrate the local draft once the config loads (and on refetch).
  useEffect(() => {
    if (configQuery.data) {
      setPattern(configQuery.data.filenamePattern);
      setTypeLabel(configQuery.data.typeLabel);
    }
  }, [configQuery.data]);

  const save = useMutation({
    mutationFn: () =>
      setPacketConfig({
        filenamePattern: pattern.trim() || DEFAULT_PACKET_FILENAME_PATTERN,
        typeLabel: typeLabel.trim() || DEFAULT_PACKET_TYPE_LABEL,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: packetConfigKey() }),
    onError: (err) => logger.error('Failed to save packet config', err),
  });

  const effectivePattern = pattern.trim() || DEFAULT_PACKET_FILENAME_PATTERN;
  const effectiveType = typeLabel.trim() || DEFAULT_PACKET_TYPE_LABEL;
  const dirty =
    effectivePattern !== (configQuery.data?.filenamePattern ?? DEFAULT_PACKET_FILENAME_PATTERN) ||
    effectiveType !== (configQuery.data?.typeLabel ?? DEFAULT_PACKET_TYPE_LABEL);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-brand">Packet filename</h2>
      <p className="text-sm text-ink-muted">
        The naming convention for generated PDF packets — used both when a packet is downloaded and
        when it&rsquo;s saved to Drive. Drive folders themselves are never renamed.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Filename pattern</span>
        <input
          className="min-h-11 w-full max-w-xl rounded border border-line bg-surface px-3 py-2 font-mono text-sm text-ink outline-none focus:border-brand sm:min-h-0"
          value={pattern}
          placeholder={DEFAULT_PACKET_FILENAME_PATTERN}
          onChange={(e) => {
            save.reset();
            setPattern(e.target.value);
          }}
        />
      </label>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {PACKET_FILENAME_TOKENS.map((t) => (
          <div key={t.token} className="contents">
            <dt className="font-mono text-ink">{t.token}</dt>
            <dd className="text-ink-muted">{t.description}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-ink-muted">
        Default <span className="font-mono">{DEFAULT_PACKET_FILENAME_PATTERN}</span> →{' '}
        <span className="font-mono">BOTB 07-10-26 v1 — {DEFAULT_PACKET_TYPE_LABEL}.pdf</span> (the
        version starts at v1 and bumps when you save a new version). Blank tokens drop cleanly;
        characters a filename can&rsquo;t contain are stripped.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Packet type label</span>
        <input
          className="min-h-11 w-full max-w-xl rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand sm:min-h-0"
          value={typeLabel}
          placeholder={DEFAULT_PACKET_TYPE_LABEL}
          onChange={(e) => {
            save.reset();
            setTypeLabel(e.target.value);
          }}
        />
        <span className="mt-1 block text-xs text-ink-muted">
          Fills the <span className="font-mono">{'{type}'}</span> token. This is the label for the
          full packet; department-specific packets will get their own labels later.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={save.isPending || !dirty}
          onClick={() => save.mutate()}
          className="inline-flex min-h-11 items-center rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 sm:min-h-0"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        {dirty && (
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-accent sm:min-h-0"
            onClick={() => {
              save.reset();
              setPattern(DEFAULT_PACKET_FILENAME_PATTERN);
              setTypeLabel(DEFAULT_PACKET_TYPE_LABEL);
            }}
          >
            Reset to defaults
          </button>
        )}
        {save.isSuccess && <span className="text-sm text-status-complete">Saved.</span>}
        {save.isError && <span className="text-sm text-accent">Could not save.</span>}
      </div>
    </div>
  );
}
