/**
 * Run npm's advisory audit and enforce the workspace release-blocking policy.
 *
 * High/critical findings fail when their documented exception is missing or has
 * reached its review date. Current exceptions and lower-severity findings remain
 * visible in the summary without producing false failures for dependency-chain
 * nodes that npm misleadingly labels as independently fixable.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

export function collectAdvisories(report) {
  const advisories = new Map();
  for (const finding of Object.values(report.vulnerabilities ?? {})) {
    for (const cause of finding.via ?? []) {
      if (!cause || typeof cause !== 'object') continue;
      const ghsa = cause.url?.match(/GHSA-[a-z0-9-]+/i)?.[0]?.toUpperCase();
      const id = ghsa ?? (cause.source ? `NPM-${cause.source}` : undefined);
      if (!id) continue;
      advisories.set(id, {
        id,
        package: cause.name,
        title: cause.title,
        severity: cause.severity,
        url: cause.url,
      });
    }
  }
  return [...advisories.values()];
}

export function parseExceptions(markdown) {
  const exceptions = new Map();
  const sections = markdown.matchAll(
    /^### .*\((GHSA-[a-z0-9-]+)\)([\s\S]*?)(?=^### |^## |(?![\s\S]))/gim,
  );
  for (const section of sections) {
    const reviewBy = section[2].match(/\*\*Review by:\*\* (\d{4}-\d{2}-\d{2})/i)?.[1];
    if (reviewBy) exceptions.set(section[1].toUpperCase(), { reviewBy });
  }
  return exceptions;
}

export function applyPolicy(advisories, exceptions, today) {
  return advisories.map((advisory) => {
    const exception = exceptions.get(advisory.id);
    const status = !exception
      ? 'untracked'
      : today >= exception.reviewBy
        ? `expired ${exception.reviewBy}`
        : `accepted until ${exception.reviewBy}`;
    return {
      ...advisory,
      status,
      blocking: BLOCKING_SEVERITIES.has(advisory.severity) && !status.startsWith('accepted'),
    };
  });
}

function markdownSummary(label, findings) {
  const blocking = findings.filter((finding) => finding.blocking);
  const lines = [
    `## ${label} dependency audit`,
    '',
    blocking.length > 0
      ? `**RELEASE BLOCKED:** ${blocking.length} high/critical advisory exception(s) are missing or expired.`
      : '**Release policy:** every high/critical advisory has a current, documented disposition.',
    '',
  ];

  if (findings.length === 0) {
    lines.push('No vulnerabilities reported.', '');
    return lines.join('\n');
  }

  lines.push('| Advisory | Package | Severity | Disposition |', '| --- | --- | --- | --- |');
  for (const finding of findings) {
    const advisory = finding.url ? `[${finding.id}](${finding.url})` : finding.id;
    lines.push(
      `| ${advisory} | ${finding.package} | ${finding.severity} | ${finding.blocking ? `**BLOCKING — ${finding.status}**` : finding.status} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function parseLabel(argv) {
  const index = argv.indexOf('--label');
  return index >= 0 && argv[index + 1] ? argv[index + 1] : 'Workspace';
}

function main() {
  const label = parseLabel(process.argv.slice(2));
  const exceptionsPath = path.join(process.cwd(), 'SECURITY_EXCEPTIONS.md');
  const result = spawnSync('npm', ['audit', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (!result.stdout) {
    process.stderr.write(result.stderr || `${label}: npm audit returned no report.\n`);
    process.exitCode = 1;
    return;
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    process.stderr.write(`${label}: npm audit returned invalid JSON.\n${result.stderr}`);
    process.exitCode = 1;
    return;
  }

  if (
    report?.auditReportVersion !== 2 ||
    !report.vulnerabilities ||
    typeof report.vulnerabilities !== 'object'
  ) {
    process.stderr.write(`${label}: npm audit did not return a valid version 2 audit report.\n`);
    process.exitCode = 1;
    return;
  }

  let exceptions;
  try {
    exceptions = parseExceptions(readFileSync(exceptionsPath, 'utf8'));
  } catch (error) {
    process.stderr.write(`${label}: could not read ${exceptionsPath}: ${String(error)}\n`);
    process.exitCode = 1;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const findings = applyPolicy(collectAdvisories(report), exceptions, today);
  const summary = markdownSummary(label, findings);
  process.stdout.write(`${summary}\n`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }

  const blocking = findings.filter((finding) => finding.blocking);
  if (blocking.length > 0) {
    for (const finding of blocking) {
      process.stderr.write(
        `::error title=${label} dependency blocks release::${finding.id} (${finding.severity}) is ${finding.status}.\n`,
      );
    }
    process.exitCode = 1;
    return;
  }

  if (findings.length > 0) {
    process.stderr.write(
      `::warning title=${label} dependency advisories::${findings.length} active advisory disposition(s) are listed in the job summary.\n`,
    );
  }
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) main();
