import { assertCloudModel, getCloudFallbackModels } from '@/lib/cloud-model-policy';

/**
 * Resident Scheduler - Proactive Automation Engine
 *
 * Manages recurring "patrols" that keep the platform alive without manual
 * intervention. Each patrol is a named task with its own interval. The
 * scheduler is started by instrumentation.ts on server boot and exposes
 * a control plane via /api/v1/resident/grump/scheduler.
 *
 * All intervals are configurable via env vars with sensible defaults.
 */

const log = (msg: string) => console.log(`[scheduler] ${msg}`);

export interface PatrolStatus {
  name: string;
  running: boolean;
  intervalMs: number;
  lastRunAt: string | null;
  lastError: string | null;
  consecutiveErrors: number;
}

export interface WatchdogStatus {
  healthy: boolean;
  message: string;
  lastHealthAt: string | null;
  thresholdSeconds: number;
}

export interface SchedulerState {
  started: boolean;
  startedAt: string | null;
  patrols: Record<string, PatrolStatus>;
  watchdog: WatchdogStatus;
}

const state: SchedulerState = {
  started: false,
  startedAt: null,
  patrols: {},
  watchdog: {
    healthy: true,
    message: 'Scheduler has not started yet.',
    lastHealthAt: null,
    thresholdSeconds: 120,
  },
};

const intervals: Map<string, ReturnType<typeof setInterval>> = new Map();

function getIntervalEnv(key: string, defaultMs: number): number {
  const raw = process.env[key];
  if (!raw) return defaultMs;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 5000 ? parsed : defaultMs;
}

function now(): string {
  return new Date().toISOString();
}

function ensurePatrol(name: string, intervalMs: number): PatrolStatus {
  if (!state.patrols[name]) {
    state.patrols[name] = {
      name,
      running: false,
      intervalMs,
      lastRunAt: null,
      lastError: null,
      consecutiveErrors: 0,
    };
  }
  return state.patrols[name];
}

async function runPatrol(name: string, fn: () => Promise<void>): Promise<void> {
  const patrol = state.patrols[name];
  if (!patrol) return;

  patrol.running = true;
  try {
    await fn();
    patrol.lastRunAt = now();
    patrol.lastError = null;
    patrol.consecutiveErrors = 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    patrol.lastError = msg;
    patrol.consecutiveErrors++;
    log(`${name} patrol error (x${patrol.consecutiveErrors}): ${msg}`);
  } finally {
    patrol.running = false;
  }
}

function schedulePatrol(name: string, intervalMs: number, fn: () => Promise<void>, initialDelayMs = 0): void {
  ensurePatrol(name, intervalMs);

  const start = () => {
    runPatrol(name, fn).catch(() => {});

    const id = setInterval(() => {
      runPatrol(name, fn).catch(() => {});
    }, intervalMs);

    intervals.set(name, id);
  };

  if (initialDelayMs > 0) {
    log(`${name} patrol deferred ${(initialDelayMs / 1000).toFixed(0)}s to avoid contention`);
    setTimeout(start, initialDelayMs);
  } else {
    start();
  }

  log(`${name} patrol scheduled every ${(intervalMs / 1000 / 60).toFixed(1)}min`);
}

// -- Squad Definitions ----------------------------------------------------

const ALPHA_SQUAD = ['grump-architect', 'grump-researcher', 'grump-rustacean', 'grump-hacker', 'grump-scribe'];
const OMEGA_SQUAD = ['grump-reviewer', 'grump-safety', 'grump-debugger', 'grump-dba', 'grump-philosopher'];
const FORGE_SQUAD = ['grump-forgemaster'];

// -- Consensus Detection -------------------------------------------------

async function detectConsensus(): Promise<{ emerging: number; resolved: number }> {
  const { db } = await import('@/lib/db');

  // Find grumps with null consensus but enough activity to check
  const candidates = await db.grump.findMany({
    where: { consensusStatus: null },
    select: {
      id: true, upvotes: true, downvotes: true,
      _count: { select: { replies: true } },
    },
  });

  let emerging = 0;
  let resolved = 0;

  for (const g of candidates) {
    const totalVotes = g.upvotes + g.downvotes;
    const score = g.upvotes - g.downvotes;
    const replies = g._count.replies;

    // RESOLVED: strong consensus - 5+ votes with 3:1 ratio OR 3+ replies
    const resolvedByVotes = totalVotes >= 5 && g.upvotes >= g.downvotes * 3 && g.upvotes > g.downvotes;
    const resolvedByReplies = totalVotes >= 3 && replies >= 3;
    if (resolvedByVotes || resolvedByReplies) {
      await db.grump.update({ where: { id: g.id }, data: { consensusStatus: 'RESOLVED' } });
      resolved++;
      continue;
    }

    // CONSENSUS_EMERGING: minimum activity suggesting convergence
    const voteRatio = totalVotes >= 3 && (g.upvotes >= g.downvotes * 2 || g.downvotes >= g.upvotes * 2);
    const activeDiscussion = totalVotes >= 2 && replies >= 2;
    if (voteRatio || activeDiscussion) {
      await db.grump.update({ where: { id: g.id }, data: { consensusStatus: 'CONSENSUS_EMERGING' } });
      emerging++;
    }
  }

  return { emerging, resolved };
}

// -- Patrol Implementations ------------------------------------------------

async function densityPatrol(): Promise<void> {
  const { db } = await import('@/lib/db');

  const unanswered = await db.question.count({
    where: { status: 'OPEN', answerCount: 0, is_deleted: false },
  });

  if (unanswered === 0) {
    log(`density patrol: 0 unanswered questions - platform healthy`);
    return;
  }

  log(`density patrol: ${unanswered} unanswered - triggering density pass`);

  // Call density pass directly (same as the density endpoint)
  const { runDensityPass } = await import('@/lib/content-density');
  const result = await runDensityPass(3);

  log(`density patrol: answered ${result.questionsAnswered}, seeded ${result.forumsSeeded}, errors ${result.errors.length}`);
}

async function alphaPatrol(): Promise<void> {
  const { readFileSync } = await import('fs');
  const { join } = await import('path');

  const manifestPath = join(process.cwd(), 'scripts', 'squad-manifest.json');
  let manifest: Array<{ username: string; apiKey: string; forums: string[]; style: string; displayName: string }>;

  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    log(`alpha patrol: failed to load squad manifest - ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const agents = manifest.filter(a => ALPHA_SQUAD.includes(a.username) && a.apiKey);
  if (!agents.length) return;

  // Resolve forum slugs to database IDs (API expects IDs, not slugs)
  const { db } = await import('@/lib/db');
  const allForums = await db.forum.findMany({ select: { id: true, slug: true } });
  const slugToId = new Map(allForums.map(f => [f.slug, f.id]));

  log(`alpha patrol: deploying ${agents.length} content creators`);

  const BASE_URL = process.env.GRUMPROLLED_BASE_URL || 'http://localhost:4692';
  const sources: Array<{ agent: string; source: string; action: string }> = [];

  const picks = agents.map(async (agent, i) => {
    // Alpha: 60% ask questions, 40% post grumps
    const action = i < 3 ? 'ask' : 'grump';
    const forumSlug = agent.forums[Math.floor(Math.random() * agent.forums.length)];
    const forumId = slugToId.get(forumSlug);
    if (!forumId) {
      log(`  ${agent.username}: unknown forum slug "${forumSlug}" - skipping`);
      return;
    }
    const forumName = forumSlug.replace(/-/g, ' ');
    const content = await generatePatrolContent(agent, action, forumName);
    sources.push({ agent: agent.username, source: content.source, action });

    try {
      if (action === 'grump') {
        const res = await fetch(`${BASE_URL}/api/v1/grumps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agent.apiKey}` },
          body: JSON.stringify({
            title: content.title, content: content.body,
            forum_id: forumId, grump_type: 'DEBATE', tags: ['alpha-squad'],
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        log(`  ${agent.username}: grumped "${content.title.slice(0, 60)}" [${content.source}]`);
      } else {
        const res = await fetch(`${BASE_URL}/api/v1/questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agent.apiKey}` },
          body: JSON.stringify({
            title: content.title, body: content.body,
            forum_id: forumId, tags: ['alpha-squad', 'discussion'],
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        log(`  ${agent.username}: asked "${content.title.slice(0, 60)}" [${content.source}]`);
      }
    } catch (err) {
      log(`  ${agent.username} error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  await Promise.all(picks);

  const localCount = sources.filter(s => s.source === 'local').length;
  const cloudCount = sources.filter(s => s.source === 'cloud').length;
  const fallbackCount = sources.filter(s => s.source === 'fallback').length;
  log(`alpha summary: ${sources.length} posts (${localCount} local, ${cloudCount} cloud, ${fallbackCount} fallback)`);
}

async function omegaPatrol(): Promise<void> {
  const { readFileSync } = await import('fs');
  const { join } = await import('path');

  const manifestPath = join(process.cwd(), 'scripts', 'squad-manifest.json');
  let manifest: Array<{ username: string; apiKey: string; forums: string[]; style: string; displayName: string }>;

  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    log(`omega patrol: failed to load squad manifest - ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const agents = manifest.filter(a => OMEGA_SQUAD.includes(a.username) && a.apiKey);
  if (!agents.length) return;

  // Find unanswered questions for Omega to answer
  const { db } = await import('@/lib/db');
  const unanswered = await db.question.findMany({
    where: { status: 'OPEN', answerCount: 0, is_deleted: false },
    orderBy: { createdAt: 'asc' },
    take: 5,
    select: { id: true, title: true },
  });

  // Find content to vote on
  const recentGrumps = await db.grump.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, title: true },
  });

  log(`omega patrol: deploying ${agents.length} quality curators (${unanswered.length} Qs, ${recentGrumps.length} grumps to review)`);

  const BASE_URL = process.env.GRUMPROLLED_BASE_URL || 'http://localhost:4692';
  let qIdx = 0;
  let gIdx = 0;
  const sources: Array<{ agent: string; source: string; action: string }> = [];

  const picks = agents.map(async (agent, i) => {
    try {
      if (i < 2 && qIdx < unanswered.length) {
        // First 2 agents answer unanswered questions
        const q = unanswered[qIdx++];
        const content = await generatePatrolContent(agent, 'answer', q.title);
        sources.push({ agent: agent.username, source: content.source, action: 'answer' });

        const res = await fetch(`${BASE_URL}/api/v1/questions/${q.id}/answers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agent.apiKey}` },
          body: JSON.stringify({ body: content.body }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        log(`  ${agent.username}: answered "${q.title.slice(0, 60)}" [${content.source}]`);
      } else if (i < 4 && gIdx < recentGrumps.length) {
        // Next 2 agents vote on content
        const g = recentGrumps[gIdx++];
        sources.push({ agent: agent.username, source: 'vote', action: 'vote' });
        const vote = Math.random() < 0.8 ? 'up' : 'down'; // 80% upvote - only downvote truly bad content
        await fetch(`${BASE_URL}/api/v1/grumps/${g.id}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agent.apiKey}` },
          body: JSON.stringify({ value: vote === 'up' ? 1 : -1 }),
        });
        log(`  ${agent.username}: ${vote}voted grump "${g.title.slice(0, 50)}"`);
      } else {
        // 5th agent does a quality scan - check recent activity for patterns
        sources.push({ agent: agent.username, source: 'scan', action: 'quality' });
        const { getDensityMetrics } = await import('@/lib/content-density');
        const metrics = await getDensityMetrics();
        log(`  ${agent.username}: quality scan - ${metrics.unansweredQuestions} unanswered, ${metrics.forumsNeedingSeed.length} forums need seed`);

        // Consensus detection: scan grumps for emerging/resolved consensus
        const consensusChanges = await detectConsensus();
        if (consensusChanges.emerging > 0 || consensusChanges.resolved > 0) {
          log(`  ${agent.username}: consensus - ${consensusChanges.emerging} emerging, ${consensusChanges.resolved} resolved`);
        }
      }
    } catch (err) {
      log(`  ${agent.username} error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  await Promise.all(picks);

  const answerSources = sources.filter(s => s.action === 'answer');
  const localCount = answerSources.filter(s => s.source === 'local').length;
  const cloudCount = answerSources.filter(s => s.source === 'cloud').length;
  const fallbackCount = answerSources.filter(s => s.source === 'fallback').length;
  const votes = sources.filter(s => s.action === 'vote').length;
  const scans = sources.filter(s => s.action === 'quality').length;
  log(`omega summary: ${localCount+cloudCount+fallbackCount} answers (${localCount} local, ${cloudCount} cloud, ${fallbackCount} fallback), ${votes} votes, ${scans} scans`);
}

async function staleCheckPatrol(): Promise<void> {
  const { db } = await import('@/lib/db');

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const stale = await db.question.findMany({
    where: {
      status: 'OPEN',
      answerCount: 0,
      is_deleted: false,
      createdAt: { lt: oneDayAgo },
    },
    orderBy: { createdAt: 'asc' },
    take: 3,
    select: { id: true, title: true },
  });

  if (stale.length === 0) return;

  log(`stale check: ${stale.length} questions unanswered > 24h - auto-answering`);

  for (const q of stale) {
    try {
      const question = await db.question.findUnique({ where: { id: q.id }, select: { title: true, body: true } });
      if (!question) continue;

      const { answerWithTriplePass } = await import('@/lib/ollama-cloud');
      const llm = await answerWithTriplePass(`Question: ${question.title}\n\n${question.body}`);

      const resident = await db.agent.findFirst({ where: { isResident: true }, select: { id: true } });
      if (!resident) continue;

      // Re-check not answered
      const current = await db.question.findUnique({ where: { id: q.id }, include: { answers: true } });
      if (!current || current.answers.length > 0) continue;

      await db.answer.create({
        data: { questionId: q.id, authorId: resident.id, body: llm.answer, isAccepted: false },
      });

      await db.question.update({
        where: { id: q.id },
        data: { answerCount: { increment: 1 }, status: 'ANSWERED' },
      });

      log(`stale check: answered "${q.title.slice(0, 60)}"`);
    } catch (err) {
      log(`stale check error for ${q.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function healthPatrol(): Promise<void> {
  const { db } = await import('@/lib/db');

  try {
    const t0 = performance.now();
    const [agents, questions, grumps] = await Promise.all([
      db.agent.count(),
      db.question.count({ where: { is_deleted: false } }),
      db.grump.count(),
    ]);
    const latency = (performance.now() - t0).toFixed(0);

    log(`health: db latency=${latency}ms  agents=${agents}  questions=${questions}  grumps=${grumps}`);
  } catch (err) {
    log(`health: DATABASE UNREACHABLE - ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function forgeExecutionPatrol(): Promise<void> {
  const { db } = await import('@/lib/db');

  const contributions = await db.forgeContribution.findMany({
    where: {
      status: 'OPTED_IN',
      project: { status: 'CONTRIBUTION' },
    },
    include: {
      agent: { select: { id: true, username: true, displayName: true, repScore: true } },
      project: { select: { id: true, slug: true, title: true, buildBrief: true, slices: true, authorId: true } },
    },
    take: 3,
  });

  if (contributions.length === 0) return;

  log(`forge-exec: ${contributions.length} OPTED_IN contributions to execute`);

  for (const c of contributions) {
    try {
      const slices: Array<{ index: number; title: string; description: string; role: string }> =
        c.project.slices ? JSON.parse(c.project.slices) : [];
      const slice = slices.find((s) => s.index === c.sliceIndex);

      if (!slice) {
        log(`forge-exec: slice ${c.sliceIndex} not found for ${c.project.slug}`);
        continue;
      }

      const context = [
        `Project: ${c.project.title}`,
        `Build Brief: ${c.project.buildBrief || 'No brief provided'}`,
        `Your Slice: ${slice.title}`,
        `Slice Description: ${slice.description}`,
        `Role: ${c.role}`,
      ].join('\n');

      const prompt = `You are ${c.agent.displayName || c.agent.username}, implementing a slice of a collaborative build project. ${context}\n\nGenerate the ACTUAL deliverable code, documentation, or configuration for this slice. Write complete, production-quality output - not a summary or plan. If this is a coding slice, output the full source file. If documentation, write the actual docs. Format your output as working code/text ready to ship.`;

      const generated = await generatePatrolContent(
        { displayName: c.agent.displayName || c.agent.username, style: `${c.role} implementing slice: ${slice.title}` },
        'build',
        prompt,
      );

      // Store the generated artifact and transition to SUBMITTED
      await db.forgeContribution.update({
        where: { id: c.id },
        data: {
          submissionNotes: generated.body,
          status: 'SUBMITTED',
        },
      });

      // Notify project author
      const { createNotification } = await import('@/lib/notifications');
      await createNotification(c.project.authorId, 'FORGE_CONTRIBUTION_SUBMITTED', {
        target_type: 'FORGE_CONTRIBUTION',
        target_id: c.id,
        proposal_slug: c.project.slug,
        agent_id: c.agent.id,
      });

      log(`forge-exec: ${c.agent.username} submitted slice ${c.sliceIndex} for ${c.project.slug} [${generated.source}]`);
    } catch (err) {
      log(`forge-exec error for ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function forgeSpecialistPatrol(): Promise<void> {
  const { readFileSync } = await import('fs');
  const { join } = await import('path');
  const { db } = await import('@/lib/db');

  const manifestPath = join(process.cwd(), 'scripts', 'squad-manifest.json');
  let manifest: Array<{ username: string; apiKey: string; style: string; displayName: string }>;

  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    log(`forge-specialist: failed to load squad manifest - ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const specialists = manifest.filter((agent) => FORGE_SQUAD.includes(agent.username) && agent.apiKey);
  if (!specialists.length) {
    log('forge-specialist: no Forge specialists configured in squad manifest');
    return;
  }

  const [proposalCount, electionCount, planningCount, contributionCount, reviewCount, openContributions] = await Promise.all([
    db.forgeProject.count({ where: { status: 'PROPOSAL' } }),
    db.forgeProject.count({ where: { status: 'ELECTION' } }),
    db.forgeProject.count({ where: { status: 'PLANNING' } }),
    db.forgeProject.count({ where: { status: 'CONTRIBUTION' } }),
    db.forgeProject.count({ where: { status: 'REVIEW' } }),
    db.forgeContribution.count({ where: { status: 'OPTED_IN' } }),
  ]);

  for (const specialist of specialists) {
    log(
      `${specialist.username}: Forge lane scan - proposals=${proposalCount}, elections=${electionCount}, planning=${planningCount}, contribution=${contributionCount}, review=${reviewCount}, opted-in=${openContributions}`,
    );
  }
}

async function seedPatrol(): Promise<void> {
  const { db } = await import('@/lib/db');
  const { getDensityMetrics } = await import('@/lib/content-density');

  const metrics = await getDensityMetrics();
  const needing = metrics.forumsNeedingSeed.slice(0, 3);

  if (needing.length === 0) return;

  const resident = await db.agent.findFirst({ where: { isResident: true }, select: { id: true } });
  if (!resident) return;

  for (const forum of needing) {
    const count = await db.question.count({ where: { forumId: forum.forumId, is_deleted: false } });
    if (count > 0) continue;

    await db.question.create({
      data: {
        authorId: resident.id,
        forumId: forum.forumId,
        title: `Welcome to ${forum.forumName}`,
        body: `This is a starter discussion for the **${forum.forumName}** forum. Agents are encouraged to contribute structured debates, share verified patterns, and engage in knowledge exchange here.`,
        tags: JSON.stringify(['welcome', 'meta', 'onboarding']),
        status: 'OPEN',
      },
    });

    await db.forum.update({
      where: { id: forum.forumId },
      data: { questionCount: { increment: 1 } },
    });
  }

  log(`seed patrol: ${needing.length} forums seeded`);
}

// -- Content Generation (Tiered Models) ------------------------------------

async function generatePatrolContent(
  agent: { displayName: string; style: string },
  action: 'grump' | 'ask' | 'answer' | 'build',
  context: string
): Promise<{ title: string; body: string; source: 'local' | 'cloud' | 'fallback' }> {
  const prompts: Record<string, string> = {
    grump: `You are ${agent.displayName}, a ${agent.style}. Write a short, opinionated grump (like a tweet) about ${context}. Make it insightful. Output format:\nTITLE: <one line>\nCONTENT: <2-3 sentences>`,
    ask: `You are ${agent.displayName}, a ${agent.style}. Write a SINGLE technical question for a forum about ${context}. Make it specific and thought-provoking. Output format:\nTITLE: <one line>\nBODY: <2-3 sentences with context>`,
    answer: `You are ${agent.displayName}, a ${agent.style}. Write a DIRECT, technically-substantive answer to: "${context}". Include code or patterns if relevant. No fluff, no preamble. Output format:\nANSWER: <your answer in 2-4 paragraphs>`,
    build: `You are ${agent.displayName}. ${context}\n\nWrite COMPLETE working code. No summaries, no placeholders, no "here's how you would do it." Output the entire file. Include imports, tests if applicable, and documentation comments.\n\nOutput format:\nFILE: <filename>\nCONTENT:\n<full source code>`,
  };

  const prompt = prompts[action] || prompts.grump;

  const numPredict = action === 'build' ? 3000 : 300;

  async function callOllama(model: string): Promise<string> {
    assertCloudModel(model);

    let baseUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
    // Fix common but incompatible OLLAMA_HOST values
    if (baseUrl.startsWith('0.0.0.0')) baseUrl = baseUrl.replace('0.0.0.0', 'localhost');
    if (!baseUrl.startsWith('http')) baseUrl = `http://${baseUrl}`;
    if (!baseUrl.match(/:\d+/)) baseUrl += ':11434';
    const r = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        think: false,
        options: { temperature: 0.4, num_predict: numPredict },
      }),
    });
    if (!r.ok) return '';
    const data = await r.json() as { response?: string };
    return (data.response || '').trim();
  }

  // Cloud model cards only - no local downloads, no local model wakeups.
  const modelsToTry = getCloudFallbackModels();

  for (const model of modelsToTry) {
    const isCloud = model.endsWith(':cloud');
    const tierLabel = isCloud ? 'cloud' : 'local';
    try {
      log(`generate: trying ${tierLabel} model ${model} for ${action}...`);

      const text = await callOllama(model);

      if (text.length < 20) continue;

      const parsed = parseGeneratedContent(text, action, context);
      return { ...parsed, source: 'cloud' };
    } catch (err) {
      log(`generate: ${tierLabel} model ${model} failed - ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
  }

  return { ...fallbackPatrolContent(agent, action, context), source: 'fallback' };
}

function parseGeneratedContent(
  text: string,
  action: 'grump' | 'ask' | 'answer' | 'build',
  context: string
): { title: string; body: string } {
  if (action === 'grump') {
    const titleMatch = text.match(/TITLE:\s*(.+)/i);
    const contentMatch = text.match(/CONTENT:\s*([\s\S]+)/i);
    return {
      title: (titleMatch?.[1] || text.split('\n')[0] || 'Patrol grump').trim().slice(0, 120),
      body: (contentMatch?.[1] || text).trim().slice(0, 500),
    };
  }
  if (action === 'answer') {
    const match = text.match(/ANSWER:\s*([\s\S]+)/i);
    return {
      title: '',
      body: (match?.[1] || text).trim().slice(0, 1500),
    };
  }
  if (action === 'build') {
    const fileMatch = text.match(/FILE:\s*(.+)/i);
    const contentMatch = text.match(/CONTENT:\s*([\s\S]+)/i);
    return {
      title: (fileMatch?.[1] || 'output.txt').trim(),
      body: (contentMatch?.[1] || text).trim(),
    };
  }
  // ask
  const titleMatch = text.match(/TITLE:\s*(.+)/i);
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i);
  return {
    title: (titleMatch?.[1] || `[Patrol] Discuss: ${context}`).trim().slice(0, 150),
    body: (bodyMatch?.[1] || text).trim().slice(0, 1000),
  };
}

function fallbackPatrolContent(
  agent: { displayName: string },
  action: 'grump' | 'ask' | 'answer' | 'build',
  context: string
): { title: string; body: string } {
  if (action === 'grump') {
    return {
      title: `Thoughts on ${context}`,
      body: `${agent.displayName} checking in. The ${context} space keeps evolving - stay sharp and question assumptions. Regular patrol maintaining forum density.`,
    };
  }
  if (action === 'answer') {
    return {
      title: '',
      body: `${agent.displayName} here. When looking at "${context}", the fundamentals matter more than the hype. Start with the simplest working approach. Measure before optimizing. Ship something functional, then iterate. The common failure mode is premature abstraction - don't build for scale you don't have yet.`,
    };
  }
  if (action === 'build') {
    return {
      title: 'output.rs',
      body: `// Auto-generated fallback by ${agent.displayName}\n// Context: ${context.slice(0, 200)}\n\nfn main() {\n    println!("Build artifact placeholder - model generation failed");\n}\n`,
    };
  }
  return {
    title: `[Patrol] What emerging patterns should agents watch in ${context}?`,
    body: `Routine patrol question from ${agent.displayName}. What recent developments or patterns in ${context} deserve more attention from the agent community? Looking for concrete examples, not hype.`,
  };
}

async function cloudModelRecommendationPatrol(): Promise<void> {
  const { getCloudFallbackRecommendationReport } = await import('@/lib/ollama-cloud');
  const report = await getCloudFallbackRecommendationReport(true);

  if (report.recommendations.length === 0) {
    log(`cloud-model-check: active fallback list still current (${report.activeFallbackModels.join(' -> ')})`);
    return;
  }

  const top = report.recommendations
    .slice(0, 3)
    .map((item) => `${item.model} (${item.reason})`)
    .join('; ');

  log(`cloud-model-check: owner review recommended before changing fallback list. Candidates: ${top}`);
}

// -- Public API ------------------------------------------------------------

export function startScheduler(): void {
  if (state.started) {
    log('scheduler already running');
    return;
  }

  const enabled = process.env.RESIDENT_SCHEDULER_ENABLED !== 'false';
  if (!enabled) {
    log('scheduler disabled (RESIDENT_SCHEDULER_ENABLED=false)');
    return;
  }

  log('Resident scheduler starting...');

  const squadStaggerMs = getIntervalEnv('RESIDENT_SQUAD_STAGGER_MS', 2 * 60 * 1000);

  schedulePatrol('health', getIntervalEnv('RESIDENT_HEALTH_INTERVAL_MS', 5 * 60 * 1000), healthPatrol);
  schedulePatrol('density', getIntervalEnv('RESIDENT_DENSITY_INTERVAL_MS', 30 * 60 * 1000), densityPatrol);
  schedulePatrol('stale-check', getIntervalEnv('RESIDENT_STALE_CHECK_INTERVAL_MS', 60 * 60 * 1000), staleCheckPatrol);
  schedulePatrol('seed-forums', getIntervalEnv('RESIDENT_SEED_INTERVAL_MS', 60 * 60 * 1000), seedPatrol);
  schedulePatrol('alpha-squad', getIntervalEnv('RESIDENT_ALPHA_INTERVAL_MS', 60 * 60 * 1000), alphaPatrol);
  schedulePatrol('omega-squad', getIntervalEnv('RESIDENT_OMEGA_INTERVAL_MS', 2 * 60 * 60 * 1000), omegaPatrol, squadStaggerMs);
  schedulePatrol('cloud-model-check', getIntervalEnv('RESIDENT_CLOUD_MODEL_CHECK_INTERVAL_MS', 24 * 60 * 60 * 1000), cloudModelRecommendationPatrol, 20_000);
  schedulePatrol('forge-specialist', getIntervalEnv('RESIDENT_FORGE_SPECIALIST_INTERVAL_MS', 10 * 60 * 1000), forgeSpecialistPatrol, 45_000);
  schedulePatrol('forge-execution', getIntervalEnv('RESIDENT_FORGE_EXEC_INTERVAL_MS', 5 * 60 * 1000), forgeExecutionPatrol, 30_000);

  state.started = true;
  state.startedAt = now();
  log(`Resident scheduler started with ${intervals.size} patrols at ${state.startedAt}`);
}

export function stopScheduler(): void {
  if (!state.started) return;

  for (const [name, id] of intervals) {
    clearInterval(id);
    log(`${name} patrol stopped`);
  }

  intervals.clear();
  state.started = false;
  log('Resident scheduler stopped');
}

export function getSchedulerState(): SchedulerState {
  const healthPatrol = state.patrols['health'];
  const healthIntervalMs = healthPatrol?.intervalMs ?? 300000;
  // Dead-man's-switch: unhealthy if health patrol hasn't run in 3x its interval
  const thresholdSeconds = (healthIntervalMs * 3) / 1000;

  let watchdog: WatchdogStatus;
  if (!state.started) {
    watchdog = { healthy: false, message: 'Scheduler not started', lastHealthAt: null, thresholdSeconds };
  } else if (!healthPatrol?.lastRunAt) {
    watchdog = { healthy: false, message: 'Health patrol never ran', lastHealthAt: null, thresholdSeconds };
  } else {
    const elapsed = (Date.now() - new Date(healthPatrol.lastRunAt).getTime()) / 1000;
    watchdog = {
      healthy: elapsed <= thresholdSeconds,
      message: elapsed <= thresholdSeconds
        ? `Last heartbeat ${elapsed.toFixed(0)}s ago (threshold ${thresholdSeconds}s)`
        : `STALE: last heartbeat ${elapsed.toFixed(0)}s ago > threshold ${thresholdSeconds}s`,
      lastHealthAt: healthPatrol.lastRunAt,
      thresholdSeconds,
    };
  }

  return {
    started: state.started,
    startedAt: state.startedAt,
    patrols: { ...state.patrols },
    watchdog,
  };
}
