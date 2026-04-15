#!/usr/bin/env node
/**
 * Seed the Bark database with 200+ hand-crafted quips
 *
 * Usage:
 *   npm run seed:barks
 *   or
 *   node scripts/seed-barks.mjs
 *
 * This script:
 * 1. Connects to your SQLite database (via Prisma)
 * 2. Clears existing Bark entries (optional --clear flag)
 * 3. Inserts all barks from bark-seed.ts
 * 4. Logs stats per tag
 * 5. Verifies insertion
 */

import { PrismaClient } from '@prisma/client';
import { getAllBarks } from '../src/lib/bark-seed.js';

const db = new PrismaClient();
const CLEAR_EXISTING = process.argv.includes('--clear');

async function seedBarks() {
  console.log('🚀 Seeding GrumpRolled Bark Database...\n');

  try {
    // Optional: Clear existing barks
    if (CLEAR_EXISTING) {
      console.log('🧹 Clearing existing barks...');
      const deleted = await db.bark.deleteMany({});
      console.log(`   Deleted ${deleted.count} existing barks.\n`);
    }

    // Get all barks from seed file
    const barksToInsert = getAllBarks();
    console.log(`📝 Inserting ${barksToInsert.length} barks...\n`);

    // Insert in batches (avoid overwhelming the DB)
    const BATCH_SIZE = 50;
    let inserted = 0;

    for (let i = 0; i < barksToInsert.length; i += BATCH_SIZE) {
      const batch = barksToInsert.slice(i, i + BATCH_SIZE);
      await db.bark.createMany({
        data: batch,
        skipDuplicates: true, // If a bark already exists, skip it
      });
      inserted += batch.length;
      console.log(`   ✓ Inserted batch ${Math.ceil(inserted / BATCH_SIZE)}/${Math.ceil(barksToInsert.length / BATCH_SIZE)}`);
    }

    // Verify insertion and report stats
    const allBarks = await db.bark.findMany();
    const statsByTag = {};

    for (const bark of allBarks) {
      statsByTag[bark.tag] = (statsByTag[bark.tag] || 0) + 1;
    }

    console.log(`\n✅ SEEDING COMPLETE!\n`);
    console.log(`   Total barks: ${allBarks.length}`);
    console.log(`   Barks by tag:`);
    for (const [tag, count] of Object.entries(statsByTag).sort()) {
      console.log(`     • ${tag}: ${count}`);
    }

    console.log(`\n💡 Next: Try posting a question to /api/v1/llm/answer`);
    console.log(`   Example:`);
    console.log(`     curl -X POST http://localhost:4692/api/v1/llm/answer \\`);
    console.log(`       -H "Content-Type: application/json" \\`);
    console.log(`       -d '{"question":"How do I deploy a Node.js app?","userId":"test-user"}'`);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

seedBarks();
