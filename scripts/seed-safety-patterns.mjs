#!/usr/bin/env node

/**
 * Seeds builder safety patterns into the VerifiedPattern system.
 * These patterns encode the pre-push safety rules so the platform's own
 * governance mechanisms apply to the agents building it.
 *
 * Usage:
 *   node scripts/seed-safety-patterns.mjs
 *   node scripts/seed-safety-patterns.mjs --dry-run
 */

const BASE_URL = process.env.GRUMPROLLED_BASE_URL || process.env.GRUMPROLLED_API_BASE || 'http://127.0.0.1:4692';
const ADMIN_KEY = process.env.ADMIN_KEY;

if (!ADMIN_KEY) {
  console.error('ADMIN_KEY environment variable is required');
  process.exit(1);
}

const patterns = [
  {
    title: 'No Hardcoded Localhost URLs',
    description:
      'Source files must not contain hardcoded localhost URLs. Use environment variables (e.g. GRUMPROLLED_BASE_URL, OLLAMA_HOST) with fallback defaults instead. Hardcoded URLs break in deployed environments.',
    patternType: 'BEST_PRACTICE',
    codeSnippet: `// BAD:
  const BAD_BASE_URL = 'http://127.0.0.1:4692';
  const res = await fetch(\`\${BAD_BASE_URL}/api/v1/agents\`);

// GOOD:
const BASE_URL = process.env.GRUMPROLLED_BASE_URL || process.env.GRUMPROLLED_API_BASE || 'http://127.0.0.1:4692';
const res = await fetch(\`\${BASE_URL}/api/v1/agents\`);`,
    language: 'typescript',
    tags: ['security', 'configuration', 'deployment', 'pre-push'],
    category: 'coding',
    isOfficial: true,
    sourceRepo: 'grumprolled',
  },
  {
    title: 'No Plaintext API Keys in Tracked Files',
    description:
      'API keys, connection strings, private keys, and JWT tokens must never appear in git-tracked files. Use .env files (gitignored), example templates with placeholders, and secret scanning in pre-push hooks.',
    patternType: 'BEST_PRACTICE',
    codeSnippet: `// BAD — committed to git:
{ "apiKey": "gr_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6" }

// GOOD:
// 1. Real key in .env (gitignored): GRUMPROLLED_API_KEY=gr_live_...
// 2. Example file (tracked): squad-manifest.example.json with "gr_live_YOUR_API_KEY_HERE"
// 3. Pre-push scan: node scripts/pre-push-safety.mjs`,
    language: 'typescript',
    tags: ['security', 'secrets', 'pre-push', 'gitignore'],
    category: 'coding',
    isOfficial: true,
    sourceRepo: 'grumprolled',
  },
  {
    title: 'TypeScript Build Safety: No Forced ignoreBuildErrors',
    description:
      'next.config.ts must not set ignoreBuildErrors: true unconditionally. Type errors that pass CI will deploy to production. Use environment-conditional: only ignore in development, enforce in production.',
    patternType: 'BEST_PRACTICE',
    codeSnippet: `// BAD:
typescript: { ignoreBuildErrors: true }

// GOOD:
typescript: { ignoreBuildErrors: process.env.NODE_ENV !== 'production' }`,
    language: 'typescript',
    tags: ['typescript', 'build', 'nextjs', 'pre-push', 'production'],
    category: 'coding',
    isOfficial: true,
    sourceRepo: 'grumprolled',
  },
  {
    title: 'React StrictMode Must Be Enabled',
    description:
      'next.config.ts must not disable reactStrictMode. StrictMode catches render-side bugs early including side-effects in render, unsafe lifecycle methods, and deprecated APIs.',
    patternType: 'BEST_PRACTICE',
    codeSnippet: `// BAD:
reactStrictMode: false

// GOOD:
reactStrictMode: true`,
    language: 'typescript',
    tags: ['react', 'nextjs', 'build', 'pre-push'],
    category: 'coding',
    isOfficial: true,
    sourceRepo: 'grumprolled',
  },
  {
    title: 'Pre-Push Safety Harness',
    description:
      'Every repository must have a pre-push safety harness that blocks pushes containing hardcoded URLs, plaintext secrets, build configuration errors, and accidentally staged environment files. Install as a git hook.',
    patternType: 'WORKFLOW',
    codeSnippet: `#!/bin/sh
# .git/hooks/pre-push
node scripts/pre-push-safety.mjs --staged`,
    language: 'bash',
    tags: ['devops', 'git', 'pre-push', 'safety', 'ci-cd'],
    category: 'tools',
    isOfficial: true,
    sourceRepo: 'grumprolled',
  },
  {
    title: 'Timing-Safe Admin Key Comparison',
    description:
      'Admin key validation must use crypto.timingSafeEqual() to prevent timing attacks. Plain string comparison leaks character-by-character timing information to attackers.',
    patternType: 'BEST_PRACTICE',
    codeSnippet: `import { timingSafeEqual } from 'node:crypto';

export function validateAdminKey(key: string): boolean {
  const expected = process.env.ADMIN_KEY || '';
  if (!expected) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}`,
    language: 'typescript',
    tags: ['security', 'crypto', 'admin', 'authentication'],
    category: 'coding',
    isOfficial: true,
    sourceRepo: 'grumprolled',
  },
  {
    title: 'Environment File Git Safety',
    description:
      '.env files containing secrets must never be committed to git. Always add .env patterns to .gitignore, create .example template files with placeholders, and verify with pre-push scanning.',
    patternType: 'BEST_PRACTICE',
    codeSnippet: `# .gitignore — block all .env, allow only examples:
.env
.env.local
.env*
!.env.example
!.env.local.example`,
    language: 'bash',
    tags: ['security', 'gitignore', 'environment', 'pre-push'],
    category: 'coding',
    isOfficial: true,
    sourceRepo: 'grumprolled',
  },
];

const dryRun = process.argv.includes('--dry-run');

async function seed() {
  let created = 0;
  let skipped = 0;

  for (const pattern of patterns) {
    if (dryRun) {
      console.log(`[DRY-RUN] Would create: ${pattern.title}`);
      created++;
      continue;
    }

    try {
      const res = await fetch(`${BASE_URL}/api/v1/knowledge/patterns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': ADMIN_KEY,
        },
        body: JSON.stringify({
          title: pattern.title,
          description: pattern.description,
          pattern_type: pattern.patternType,
          code_snippet: pattern.codeSnippet,
          language: pattern.language,
          tags: pattern.tags,
          category: pattern.category,
          is_official: pattern.isOfficial,
          source_repo: pattern.sourceRepo,
        }),
      });

      if (res.status === 201 || res.status === 200) {
        const data = await res.json();
        console.log(`[CREATED] ${pattern.title} (id: ${data.id || data.data?.id || '?'})`);
        created++;
      } else if (res.status === 409) {
        console.log(`[SKIPPED] ${pattern.title} (already exists)`);
        skipped++;
      } else {
        const body = await res.text();
        console.error(`[FAILED] ${pattern.title} (${res.status}): ${body.slice(0, 200)}`);
      }
    } catch (err) {
      console.error(`[ERROR] ${pattern.title}: ${err.message}`);
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
