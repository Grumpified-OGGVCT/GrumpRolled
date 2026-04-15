#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function findLatestLogicalExport() {
  const dir = resolve(process.cwd(), 'artifacts', 'sqlite-snapshots');
  if (!existsSync(dir)) {
    fail(`SQLite snapshot artifacts directory not found at ${dir}`);
  }

  const candidates = readdirSync(dir)
    .filter((name) => /^sqlite-logical-export-.*\.json$/.test(name))
    .sort();

  if (candidates.length === 0) {
    fail('No sqlite-logical-export-*.json files found. Run npm run db:sqlite:export:logical first.');
  }

  return join(dir, candidates[candidates.length - 1]);
}

const inputFlagIndex = process.argv.indexOf('--input');
const inputPath = inputFlagIndex >= 0 && process.argv[inputFlagIndex + 1]
  ? resolve(process.cwd(), process.argv[inputFlagIndex + 1])
  : findLatestLogicalExport();

if (!existsSync(inputPath)) {
  fail(`Logical export file not found at ${inputPath}`);
}

const logicalExport = JSON.parse(readFileSync(inputPath, 'utf8'));
const dataset = logicalExport.dataset || {};

const bundle = {
  source_export_path: inputPath,
  source_exported_at: logicalExport.exported_at || null,
  prepared_at: new Date().toISOString(),
  import_order: [
    'identity',
    'forums',
    'forum_membership',
    'content_discussion',
    'content_qa',
    'invites',
    'knowledge',
  ],
  groups: {
    identity: {
      agents: dataset.agents || [],
    },
    forums: {
      forums: dataset.forums || [],
    },
    forum_membership: {
      agent_forums: dataset.agent_forums || [],
    },
    content_discussion: {
      grumps: dataset.grumps || [],
      replies: dataset.replies || [],
      votes: (dataset.votes || []).filter((row) => ['GRUMP', 'REPLY'].includes(row.targetType)),
    },
    content_qa: {
      questions: dataset.questions || [],
      answers: dataset.answers || [],
      votes: (dataset.votes || []).filter((row) => ['QUESTION', 'ANSWER'].includes(row.targetType)),
    },
    invites: {
      invite_codes: dataset.invite_codes || [],
      invite_redemptions: dataset.invite_redemptions || [],
      invite_action_logs: dataset.invite_action_logs || [],
    },
    knowledge: {
      verified_patterns: dataset.verified_patterns || [],
      knowledge_contributions: dataset.knowledge_contributions || [],
    },
  },
};

bundle.counts = Object.fromEntries(
  Object.entries(bundle.groups).map(([groupName, groupData]) => [
    groupName,
    Object.fromEntries(Object.entries(groupData).map(([key, value]) => [key, value.length])),
  ]),
);

const outputDir = resolve(process.cwd(), 'artifacts', 'sqlite-snapshots');
mkdirSync(outputDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputPath = join(outputDir, `postgres-import-bundle-${timestamp}.json`);
const outputJson = `${JSON.stringify(bundle, null, 2)}\n`;
writeFileSync(outputPath, outputJson);

pass(`import bundle written to ${outputPath}`);
pass(`import bundle sha256=${createHash('sha256').update(outputJson).digest('hex')}`);