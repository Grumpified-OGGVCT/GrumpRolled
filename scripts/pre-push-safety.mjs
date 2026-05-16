#!/usr/bin/env node

/**
 * Pre-push safety harness — catches common builder mistakes before they hit the remote.
 *
 * Checks:
 *   1. Hardcoded localhost URLs (should use env vars)
 *   2. Plaintext API keys / secrets in tracked files
 *   3. ignoreBuildErrors: true in next.config.ts
 *   4. Squad manifest with real keys tracked in git
 *   5. .env files accidentally staged
 *   6. Core infra commits missing VerifiedPattern references
 *
 * Usage:
 *   node scripts/pre-push-safety.mjs          # check staged + working tree
 *   node scripts/pre-push-safety.mjs --all    # check entire repo
 *   node scripts/pre-push-safety.mjs --staged # check staged only
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let errors = 0;
let warnings = 0;

function fail(rule, detail) {
  errors++;
  console.error(`${RED}${BOLD}[FAIL] ${rule}${RESET}`);
  console.error(`       ${detail}`);
}

function warn(rule, detail) {
  warnings++;
  console.warn(`${YELLOW}${BOLD}[WARN] ${rule}${RESET}`);
  console.warn(`       ${detail}`);
}

function pass(rule) {
  console.log(`${GREEN}[PASS]${RESET} ${rule}`);
}

// ─── Get file list ──────────────────────────────────────────────────────────

function getFiles(mode) {
  if (mode === '--all') {
    return execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
  }

  // staged + unstaged (default)
  const staged = execSync('git diff --cached --name-only', { cwd: ROOT, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);

  if (mode === '--staged') return staged;

  const unstaged = execSync('git diff --name-only', { cwd: ROOT, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);

  const untracked = execSync('git ls-files --others --exclude-standard', { cwd: ROOT, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);

  return [...new Set([...staged, ...unstaged, ...untracked])];
}

function readFileSafe(relPath) {
  const fullPath = resolve(ROOT, relPath);
  if (!existsSync(fullPath)) return null;
  try {
    return readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }
}

// ─── Check 1: Hardcoded localhost ───────────────────────────────────────────

function checkHardcodedLocalhost(files) {
  console.log(`\n${BOLD}─── Check 1: Hardcoded localhost URLs ───${RESET}`);

  const sourceFiles = files.filter((f) =>
    /\.(ts|tsx|js|mjs|jsx)$/.test(f) &&
    !f.includes('node_modules') &&
    !f.includes('.next')
  );

  let found = 0;
  for (const file of sourceFiles) {
    const content = readFileSafe(file);
    if (!content) continue;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Flag hardcoded localhost URLs that aren't in comments or env fallbacks
      if (
        (line.includes("'http://localhost") || line.includes('"http://localhost')) &&
        !line.includes('process.env.') &&
        !line.includes('||') &&
        !line.trim().startsWith('//') &&
        !line.trim().startsWith('*')
      ) {
        found++;
        fail('Hardcoded localhost', `${file}:${i + 1} — ${line.trim()}`);
      }
    }
  }

  if (found === 0) pass('No hardcoded localhost URLs found');
}

// ─── Check 2: Plaintext keys in tracked files ───────────────────────────────

const KEY_PATTERNS = [
  { name: 'API key (gr_live_)', pattern: /gr_live_[a-f0-9]{32}/gi },
  { name: 'API key (sk-)', pattern: /sk-[a-zA-Z0-9]{32,}/g },
  { name: 'API key (co_)', pattern: /co_[a-zA-Z0-9_]{20,}/g },
  { name: 'JWT-like token', pattern: /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}/g },
  { name: 'Private key header', pattern: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/g },
  { name: 'Connection string', pattern: /postgresql:\/\/[^:@]+:[^@]+@/g },
];

function checkPlaintextKeys(files) {
  console.log(`\n${BOLD}─── Check 2: Plaintext secrets in tracked files ───${RESET}`);

  // Skip known-safe files
  const skipPatterns = [
    /\.example\./,
    /\.example$/,
    /\.test\./,
    /\.spec\./,
    /node_modules/,
    /\.next/,
    /\.git/,
    /package-lock/,
    /pnpm-lock/,
    /yarn\.lock/,
  ];

  const checkFiles = files.filter((f) => {
    if (f === 'scripts/squad-manifest.json') return true; // explicitly check
    return !skipPatterns.some((p) => p.test(f));
  });

  let found = 0;
  for (const file of checkFiles) {
    const content = readFileSafe(file);
    if (!content) continue;

    for (const { name, pattern } of KEY_PATTERNS) {
      pattern.lastIndex = 0;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
        if (line.includes('YOUR_') || line.includes('EXAMPLE') || line.includes('placeholder')) continue;

        const match = pattern.exec(line);
        if (match) {
          found++;
          const masked = match[0].length > 20
            ? match[0].slice(0, 8) + '...' + match[0].slice(-4)
            : match[0];
          fail(`${name}`, `${file}:${i + 1} — ${masked}`);
        }
      }
    }
  }

  if (found === 0) pass('No plaintext secrets found');
}

// ─── Check 3: ignoreBuildErrors ─────────────────────────────────────────────

function checkIgnoreBuildErrors() {
  console.log(`\n${BOLD}─── Check 3: TypeScript build safety ───${RESET}`);

  const config = readFileSafe('next.config.ts');
  if (!config) {
    warn('Missing next.config.ts', 'Could not verify build settings');
    return;
  }

  if (config.includes('ignoreBuildErrors: true')) {
    fail('ignoreBuildErrors: true', 'next.config.ts — type errors will deploy to production');
  } else {
    pass('ignoreBuildErrors is not forced true');
  }

  if (config.includes('reactStrictMode: false')) {
    warn('reactStrictMode: false', 'next.config.ts — may hide render-side bugs');
  } else {
    pass('reactStrictMode is enabled');
  }
}

// ─── Check 4: Squad manifest tracking ───────────────────────────────────────

function checkSquadManifest() {
  console.log(`\n${BOLD}─── Check 4: Squad manifest security ───${RESET}`);

  try {
    const tracked = execSync('git ls-files scripts/squad-manifest.json', { cwd: ROOT, encoding: 'utf8' }).trim();
    if (tracked) {
      fail('Squad manifest tracked', 'scripts/squad-manifest.json should not be in git (contains API keys)');
      return;
    }
  } catch {
    // git command failed
  }

  pass('Squad manifest is not tracked in git');
}

// ─── Check 5: Environment file staging ──────────────────────────────────────

function checkEnvFiles() {
  console.log(`\n${BOLD}─── Check 5: Environment file safety ───${RESET}`);

  try {
    const staged = execSync('git diff --cached --name-only', { cwd: ROOT, encoding: 'utf8' });
    const envFiles = staged
      .split('\n')
      .filter((f) => /\.env(?!\.example)/.test(f) && !f.includes('.example'));

    if (envFiles.length > 0) {
      for (const f of envFiles) {
        fail('Staged env file', `${f} — .env files should never be committed`);
      }
    } else {
      pass('No .env files staged for commit');
    }
  } catch {
    pass('No .env files staged');
  }
}

// ─── Check 6: Pattern gatekeeping for core infra changes ───────────────────

const CORE_INFRA_PATHS = [
  'next.config.ts',
  'prisma/schema.prisma',
  'src/middleware.ts',
  'src/lib/db.ts',
  'src/lib/auth.ts',
  'src/lib/admin.ts',
  'src/lib/queue.ts',
  'src/lib/rate-limit.ts',
  'src/lib/capability-economy.ts',
  'src/lib/forge-voting.ts',
  'src/lib/forge-gates.ts',
  'src/lib/events.ts',
  'src/lib/content-safety.ts',
];

function checkPatternGatekeeping() {
  console.log(`\n${BOLD}─── Check 6: Pattern gatekeeping (core infra) ───${RESET}`);

  try {
    // Get the commits being pushed (not yet on remote)
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    let range;

    try {
      execSync(`git rev-parse --verify origin/${currentBranch}`, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'ignore',
      });
      range = `origin/${currentBranch}..HEAD`;
    } catch {
      // No remote tracking branch yet — check all unpushed commits
      range = 'HEAD';
    }

    // Get commits and their changed files
    const commitInfo = execSync(
      `git log ${range} --format="COMMIT %H %s" --name-only`,
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();

    if (!commitInfo) {
      pass('No new commits to push (or range is empty)');
      return;
    }

    const blocks = commitInfo.split('COMMIT ');
    let violations = 0;

    for (const block of blocks) {
      if (!block.trim()) continue;
      const lines = block.trim().split('\n');
      const hashAndMsg = lines[0].match(/^([a-f0-9]+)\s(.+)$/);
      if (!hashAndMsg) continue;

      const hash = hashAndMsg[1];
      const message = hashAndMsg[2];
      const changedFiles = lines.slice(1).filter(Boolean);

      const touchesCore = changedFiles.some((f) =>
        CORE_INFRA_PATHS.some((p) => f === p || f.startsWith(p + '/'))
      );

      if (touchesCore) {
        // Require at least one pattern reference in the commit message
        const hasPatternRef = /#\d{4,}|pattern[:#]\s*\d{4,}|\[pattern\]|VP-\d+/i.test(message);
        if (!hasPatternRef) {
          violations++;
          fail(
            'Missing pattern reference',
            `Commit ${hash.slice(0, 8)} touches core infra but has no pattern reference in message.\n` +
            `       Files: ${changedFiles.filter(f => CORE_INFRA_PATHS.some(p => f === p || f.startsWith(p + '/'))).join(', ')}\n` +
            `       Message: "${message}"\n` +
            `       Add a pattern reference like "[pattern] <id>" or "VP-<id>" or refer to a pattern by name`
          );
        }
      }
    }

    if (violations === 0) pass('Core infra commits reference safety patterns');
  } catch (err) {
    warn('Could not check pattern gatekeeping', err.message || String(err));
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

const mode = process.argv[2] || '';
const files = getFiles(mode);

if (files.length === 0) {
  console.log(`${YELLOW}No files to check.${RESET}`);
  process.exit(0);
}

console.log(`${BOLD}Pre-Push Safety Harness${RESET}`);
console.log(`Checking ${files.length} files (mode: ${mode || 'staged+unstaged'})\n`);

checkHardcodedLocalhost(files);
checkPlaintextKeys(files);
checkIgnoreBuildErrors();
checkSquadManifest();
checkEnvFiles();
checkPatternGatekeeping();

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${BOLD}─── Summary ───${RESET}`);
console.log(`  Errors:   ${errors > 0 ? RED + errors + RESET : GREEN + '0' + RESET}`);
console.log(`  Warnings: ${warnings > 0 ? YELLOW + warnings + RESET : '0'}`);

if (errors > 0) {
  console.log(`\n${RED}${BOLD}PUSH BLOCKED — fix ${errors} error(s) before pushing${RESET}`);
  process.exit(1);
} else {
  console.log(`\n${GREEN}${BOLD}SAFE TO PUSH${RESET}`);
  process.exit(0);
}
