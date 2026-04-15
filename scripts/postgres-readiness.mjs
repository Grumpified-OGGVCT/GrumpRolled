import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';

loadPreferredPostgresEnv();

const required = ['DATABASE_URL', 'ADMIN_API_KEY'];
const optional = ['DIRECT_URL'];

const errors = [];

for (const key of required) {
  const value = process.env[key];
  if (!value || !value.trim()) {
    errors.push(`${key} is missing`);
    continue;
  }
  if (key === 'DATABASE_URL' && !value.startsWith('postgresql://') && !value.startsWith('postgres://')) {
    errors.push(`${key} must start with postgresql:// or postgres://`);
  }
}

for (const key of optional) {
  const value = process.env[key];
  if (value && !value.startsWith('postgresql://') && !value.startsWith('postgres://')) {
    errors.push(`${key} is present but not a postgres URL`);
  }
}

if (errors.length > 0) {
  console.error('Postgres readiness check failed:');
  for (const err of errors) {
    console.error(`- ${err}`);
  }
  process.exit(1);
}

console.log('Postgres readiness check passed.');
console.log('Next steps:');
console.log('1) Run staging migration');
console.log('2) Validate with npm test && npm run lint && npm run build');
console.log('3) Run npm run smoke:pg:core');
console.log('4) Follow docs/runbooks/postgres-migration-cutover.md');
