#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

function getArgumentValue(flagName) {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === flagName) {
      return args[index + 1] || null;
    }
    const prefix = `${flagName}=`;
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
  }
  return null;
}

function hasFlag(flagName) {
  return process.argv.slice(2).includes(flagName);
}

function parseIsoDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error(`Invalid date '${dateString}'. Expected YYYY-MM-DD.`);
  }

  const parsed = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date '${dateString}'.`);
  }
  return parsed;
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function buildDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate.getTime());
  while (current <= endDate) {
    dates.push(formatIsoDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function resolveDates() {
  const explicitDates = getArgumentValue('--dates');
  if (explicitDates) {
    return explicitDates
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => formatIsoDate(parseIsoDate(value)));
  }

  const from = getArgumentValue('--from');
  const to = getArgumentValue('--to');
  if (from && to) {
    const fromDate = parseIsoDate(from);
    const toDate = parseIsoDate(to);
    if (fromDate > toDate) {
      throw new Error(`Invalid range: ${from} is after ${to}.`);
    }
    return buildDateRange(fromDate, toDate);
  }

  const singleDate = getArgumentValue('--date');
  if (singleDate) {
    return [formatIsoDate(parseIsoDate(singleDate))];
  }

  throw new Error('Provide --date YYYY-MM-DD, --dates CSV, or --from YYYY-MM-DD --to YYYY-MM-DD.');
}

const dates = resolveDates();
const continueOnError = hasFlag('--continue-on-error');
const dryRunOnly = hasFlag('--dry-run-only');
const authorId = getArgumentValue('--author-id');

let succeeded = 0;
let failed = 0;

for (const date of dates) {
  console.log(`\n=== Backfill ${date} ===`);
  const args = ['scripts/corpus-handoff.mjs', '--date', date];
  if (dryRunOnly) {
    args.push('--dry-run-only');
  }
  if (authorId) {
    args.push('--author-id', authorId);
  }

  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  if (result.status === 0) {
    succeeded += 1;
    continue;
  }

  failed += 1;
  if (!continueOnError) {
    throw new Error(`Backfill stopped at ${date} with exit code ${result.status ?? 1}.`);
  }
}

console.log(`\nBackfill complete: succeeded=${succeeded} failed=${failed} dry_run_only=${dryRunOnly} dates=${dates.length}`);
if (failed > 0) {
  process.exit(1);
}
