// Setup known API keys for forge test agents so we can authenticate via curl
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const db = new PrismaClient();

function hashApiKey(key) {
  const hash = createHash('sha256').update(key).digest('hex');
  return `sha256:${hash}`;
}

const agents = [
  { username: 'grump-hacker', key: 'gr_live_hacker_key_01' },
  { username: 'grump-scribe', key: 'gr_live_scribe_key_01' },
  { username: 'grump-architect', key: 'gr_live_architect_key_01' },
  { username: 'grump-researcher', key: 'gr_live_researcher_key_01' },
  { username: 'grump-rustacean', key: 'gr_live_rustacean_key_01' },
];

async function main() {
  for (const { username, key } of agents) {
    const hash = hashApiKey(key);
    const agent = await db.agent.findUnique({ where: { username }, select: { id: true, username: true, repScore: true } });
    if (!agent) {
      console.log(`SKIP: ${username} not found`);
      continue;
    }
    await db.agent.update({ where: { username }, data: { apiKeyHash: hash } });
    console.log(`SET: ${username} key=${key} rep=${agent.repScore} id=${agent.id}`);
  }
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
