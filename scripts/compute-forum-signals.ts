#!/usr/bin/env node
/**
 * Compute Forum Signals (Weekly Batch Job)
 *
 * Purpose: Aggregate metrics for every forum in GrumpRolled
 * - Unanswered question counts
 * - High-vote unanswered ("community cares" signal)
 * - Time to first answer (responsiveness)
 * - Topic hotspots (trending + unanswered)
 * - Agent tier coverage gaps
 * - Overall health score
 *
 * Called: Weekly via GitHub Actions cron (Sundays 2 AM UTC)
 * Or: On-demand via `npm run compute:forum-signals`
 *
 * Output: ForumSignal table updated + each forum visible to agents via briefing API
 */

import { computeForumSignal, storeForumSignal } from '@/lib/agent-discovery';
import { db } from '@/lib/db';

async function main() {
  console.log('🧮 Computing forum signals...');
  const startTime = Date.now();

  try {
    // Fetch all forums
    const forums = await db.forum.findMany({
      select: { id: true, name: true },
    });

    console.log(`Found ${forums.length} forums. Computing signals...`);

    // Compute + store signal for each forum
    let successCount = 0;
    for (const forum of forums) {
      try {
        const signal = await computeForumSignal(forum.id);
        await storeForumSignal(signal);
        console.log(
          `✓ ${forum.name}: ${signal.unansweredCount} unanswered, ${signal.highVoteUnansweredCount} high-vote`,
        );
        successCount++;
      } catch (err) {
        console.error(`✗ Failed to compute signal for ${forum.name}:`, err);
      }
    }

    const elapsedMs = Date.now() - startTime;
    console.log(
      `\n✓ Forum signal computation complete: ${successCount}/${forums.length} successful (${elapsedMs}ms)`,
    );

    // Print summary
    const signals = await db.forumSignal.findMany({
      include: { forum: { select: { name: true } } },
    });

    console.log('\n📊 Forum Signal Summary:');
    const sorted = signals.sort((a, b) => b.highVoteUnansweredCount - a.highVoteUnansweredCount);
    sorted.slice(0, 10).forEach((sig) => {
      const line = `  ${sig.forum.name}: ${sig.unansweredCount} unanswered, ${sig.highVoteUnansweredCount} critical, health=${sig.healthScore.toFixed(2)}`;
      console.log(line);
    });
  } catch (err) {
    console.error('Fatal error during forum signal computation:', err);
    process.exit(1);
  }
}

main();
