import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function usage() {
  console.log('Usage: node scripts/record-hlf-evaluation.mjs <path-to-json-entry>');
  console.log('Appends one JSON object to artifacts/analysis/hlf-usage-evaluations.jsonl');
}

const inputPath = process.argv[2];

if (!inputPath || inputPath === '--help' || inputPath === '-h') {
  usage();
  process.exit(inputPath ? 0 : 1);
}

const resolvedInput = resolve(process.cwd(), inputPath);
if (!existsSync(resolvedInput)) {
  console.error(`Input file not found: ${resolvedInput}`);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(resolvedInput, 'utf8'));
} catch (error) {
  console.error(`Failed to parse JSON from ${resolvedInput}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const requiredFields = [
  'evaluation_id',
  'date',
  'slice',
  'claim_summary',
  'observed_reality_summary',
  'claim_accuracy',
  'pros',
  'cons',
  'expansion_opportunities',
  'recommendation',
  'artifact_paths',
  'verification',
  'limitations',
];

const missing = requiredFields.filter((field) => !(field in parsed));
if (missing.length > 0) {
  console.error(`Missing required fields: ${missing.join(', ')}`);
  process.exit(1);
}

const outputPath = resolve(process.cwd(), 'artifacts/analysis/hlf-usage-evaluations.jsonl');
mkdirSync(dirname(outputPath), { recursive: true });
appendFileSync(outputPath, `${JSON.stringify(parsed)}\n`, 'utf8');

console.log(`Recorded HLF evaluation entry to ${outputPath}`);