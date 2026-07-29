import { describe, expect, it } from 'vitest';
import { applyPolicy, collectAdvisories, parseExceptions } from './dependency-audit.mjs';

describe('dependency audit release policy', () => {
  it('collects unique root advisories instead of intermediate package effects', () => {
    const advisories = collectAdvisories({
      vulnerabilities: {
        vulnerable: {
          via: [
            {
              name: 'vulnerable',
              title: 'A real advisory',
              severity: 'high',
              url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
            },
          ],
        },
        intermediate: { via: ['vulnerable'] },
      },
    });

    expect(advisories).toEqual([
      {
        id: 'GHSA-AAAA-BBBB-CCCC',
        package: 'vulnerable',
        title: 'A real advisory',
        severity: 'high',
        url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
      },
    ]);
  });

  it('retains npm advisories without a GHSA URL so high findings fail closed', () => {
    const advisories = collectAdvisories({
      vulnerabilities: {
        vulnerable: {
          via: [
            {
              source: 12345,
              name: 'vulnerable',
              title: 'An npm advisory',
              severity: 'high',
            },
          ],
        },
      },
    });

    expect(advisories).toEqual([
      {
        id: 'NPM-12345',
        package: 'vulnerable',
        title: 'An npm advisory',
        severity: 'high',
        url: undefined,
      },
    ]);
  });

  it('parses advisory review dates from the exception document', () => {
    const exceptions = parseExceptions(`
### Example (GHSA-aaaa-bbbb-cccc)

- **Review by:** 2026-09-01

### Registry fallback (NPM-12345)

- **Review by:** 2026-10-01
`);

    expect(exceptions.get('GHSA-AAAA-BBBB-CCCC')).toEqual({ reviewBy: '2026-09-01' });
    expect(exceptions.get('NPM-12345')).toEqual({ reviewBy: '2026-10-01' });
  });

  it('blocks new and expired high findings but not current exceptions or moderate findings', () => {
    const findings = applyPolicy(
      [
        { id: 'GHSA-NEW', severity: 'high' },
        { id: 'GHSA-CURRENT', severity: 'critical' },
        { id: 'GHSA-EXPIRED', severity: 'high' },
        { id: 'GHSA-MODERATE', severity: 'moderate' },
      ],
      new Map([
        ['GHSA-CURRENT', { reviewBy: '2026-09-01' }],
        ['GHSA-EXPIRED', { reviewBy: '2026-07-01' }],
      ]),
      '2026-07-29',
    );

    expect(findings.map(({ id, blocking }) => ({ id, blocking }))).toEqual([
      { id: 'GHSA-NEW', blocking: true },
      { id: 'GHSA-CURRENT', blocking: false },
      { id: 'GHSA-EXPIRED', blocking: true },
      { id: 'GHSA-MODERATE', blocking: false },
    ]);
  });
});
