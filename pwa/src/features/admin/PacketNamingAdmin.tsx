/**
 * Admin: the packet filename convention (`config/packets.filenamePattern`). The server fills
 * the tokens + sanitizes when generating a packet or saving one to Drive. Follows the
 * DocumentLibraryAdmin pattern: local draft, explicit save.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import {
  DEFAULT_PACKET_FILENAME_PATTERN,
  PACKET_FILENAME_TOKENS,
  getPacketFilenamePattern,
  packetConfigKey,
  setPacketFilenamePattern,
} from '@/lib/packets/packet-config-service';

const logger = createLogger('PacketNaming');

export function PacketNamingAdmin() {
  const queryClient = useQueryClient();
  const patternQuery = useQuery({ queryKey: packetConfigKey(), queryFn: getPacketFilenamePattern });
  const [pattern, setPattern] = useState('');

  // Hydrate the local draft once the config loads (and on refetch).
  useEffect(() => {
    if (patternQuery.data !== undefined) setPattern(patternQuery.data);
  }, [patternQuery.data]);

  const save = useMutation({
    mutationFn: () => setPacketFilenamePattern(pattern.trim() || DEFAULT_PACKET_FILENAME_PATTERN),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: packetConfigKey() }),
    onError: (err) => logger.error('Failed to save packet filename pattern', err),
  });

  const effective = pattern.trim() || DEFAULT_PACKET_FILENAME_PATTERN;
  const dirty = effective !== (patternQuery.data ?? DEFAULT_PACKET_FILENAME_PATTERN);

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
        <span className="font-mono">BOTB Summerfest 2026 — Advance Packet.pdf</span>. A blank short
        code drops cleanly; characters a filename can&rsquo;t contain are stripped.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={save.isPending || !dirty}
          onClick={() => save.mutate()}
          className="inline-flex min-h-11 items-center rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 sm:min-h-0"
        >
          {save.isPending ? 'Saving…' : 'Save pattern'}
        </button>
        {pattern.trim() && pattern.trim() !== DEFAULT_PACKET_FILENAME_PATTERN && (
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-accent sm:min-h-0"
            onClick={() => {
              save.reset();
              setPattern(DEFAULT_PACKET_FILENAME_PATTERN);
            }}
          >
            Reset to default
          </button>
        )}
        {save.isSuccess && <span className="text-sm text-status-complete">Saved.</span>}
        {save.isError && <span className="text-sm text-accent">Could not save.</span>}
      </div>
    </div>
  );
}
