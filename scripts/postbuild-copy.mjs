import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const standaloneRoot = join(root, '.next', 'standalone');
const standaloneNext = join(standaloneRoot, '.next');

if (!existsSync(standaloneRoot)) {
  console.log('No standalone output found; skipping postbuild copy.');
  process.exit(0);
}

if (!existsSync(standaloneNext)) {
  mkdirSync(standaloneNext, { recursive: true });
}

const staticSource = join(root, '.next', 'static');
const staticTarget = join(standaloneNext, 'static');
if (existsSync(staticSource)) {
  cpSync(staticSource, staticTarget, { recursive: true, force: true });
}

const publicSource = join(root, 'public');
const publicTarget = join(standaloneRoot, 'public');
if (existsSync(publicSource)) {
  cpSync(publicSource, publicTarget, { recursive: true, force: true });
}

console.log('Postbuild asset copy complete.');
