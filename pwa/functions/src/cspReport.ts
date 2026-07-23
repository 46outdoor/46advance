import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { checkRateLimit, makeRateLimitKey } from './lib/security/rateLimit.js';

/**
 * CSP violation report sink (WS-I). The report-only Content-Security-Policy (firebase.json)
 * points its `report-uri` here; the browser POSTs a JSON violation report whenever the policy
 * would block something. We log the salient fields (structured) so violations are reviewable in
 * Cloud Logging — the observation step before switching the policy from report-only to enforcing.
 *
 * Public + unauthenticated by design (the browser sends reports with no credentials). Guarded by a
 * body-size cap and a per-instance rate limit so it can't be used to flood logs; nothing is stored.
 */
const MAX_BODY_BYTES = 8 * 1024;

export const cspReport = onRequest({ maxInstances: 2 }, (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('');
    return;
  }
  // In-memory limit is fine here — it only bounds log volume, not correctness.
  const key = makeRateLimitKey(['cspReport', req.ip]);
  if (!checkRateLimit(key, 60, 60_000).allowed) {
    res.status(429).send('');
    return;
  }
  const raw = req.rawBody ?? Buffer.alloc(0);
  if (raw.length > MAX_BODY_BYTES) {
    res.status(413).send('');
    return;
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw.toString('utf8') || '{}') as Record<string, unknown>;
  } catch {
    // Malformed report — accept quietly so the browser doesn't retry.
    res.status(204).send('');
    return;
  }
  // `report-uri` sends { "csp-report": {...} }; the newer Reporting API nests differently.
  const report = (parsed['csp-report'] ?? parsed) as Record<string, unknown>;
  logger.warn('CSP violation', {
    blockedUri: report['blocked-uri'] ?? report['blockedURL'],
    violatedDirective: report['violated-directive'] ?? report['effectiveDirective'],
    documentUri: report['document-uri'] ?? report['documentURL'],
    sourceFile: report['source-file'],
    lineNumber: report['line-number'],
  });
  res.status(204).send('');
});
