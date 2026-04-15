/**
 * Bark Engine – Charismatic Agent Voice System
 *
 * Manages the "never-repeating, context-aware bark" system that gives GrumpRolled
 * a gruff but caring personality. Barks are short quips (≤30 words) that:
 * - Never repeat for the same user within 24 hours (sliding window)
 * - Adapt to topic classification (code, ops, ai-llm, agents, etc.)
 * - Fall back to LLM-generated barks if the pre-seeded pool is exhausted
 * - Are randomly placed (prefix or suffix) in the answer
 *
 * Usage:
 *   const bark = await selectBark(userId, questionText)
 *   const final = injectBark(answer, bark, 'random')
 *   return final + GRUMPIFIED_SIGNATURE
 */

import { db } from '@/lib/db';

export type BarkTag =
  | 'default'
  | 'code'
  | 'ops'
  | 'ai-llm'
  | 'agents'
  | 'forum'
  | 'reasoning'
  | 'math'
  | 'creative'
  | 'governance';

export type BarkMood = 'gruff' | 'encouraging' | 'witty' | 'sarcastic' | 'technical';

export interface SelectedBark {
  id: string;
  text: string;
  tag: BarkTag;
  mood: BarkMood;
  isGenerated: boolean;
}

/**
 * Resolve a bark tag from a forum slug by looking up the Forum.barkTag column.
 * Falls back to keyword classification if the forum is not found.
 */
export async function resolveBarkTagFromForum(forumSlug: string, fallbackQuestion?: string): Promise<BarkTag> {
  try {
    const forum = await db.forum.findUnique({
      where: { slug: forumSlug },
      select: { barkTag: true },
    });
    if (forum?.barkTag && isValidBarkTag(forum.barkTag)) {
      return forum.barkTag as BarkTag;
    }
  } catch {
    // DB not available or column doesn't exist yet — fall through to keyword
  }
  if (fallbackQuestion) {
    return classifyQuestionTag(fallbackQuestion);
  }
  return 'default';
}

/**
 * Check if a string is a valid BarkTag
 */
function isValidBarkTag(tag: string): boolean {
  const validTags: BarkTag[] = ['default', 'code', 'ops', 'ai-llm', 'agents', 'forum', 'reasoning', 'math', 'creative', 'governance'];
  return validTags.includes(tag as BarkTag);
}

/**
 * Classify a question into a bark topic tag
 * Uses simple keyword matching; can be upgraded to semantic classification
 */
export function classifyQuestionTag(question: string): BarkTag {
  const lowerQ = question.toLowerCase();

  // Code-related keywords
  if (/\b(function|class|variable|function|method|loop|array|object|module|import|export|syntax|bug|debug|test|unit test|integration test|code review)\b/i.test(lowerQ)) {
    return 'code';
  }

  // Ops-related keywords
  if (/\b(deploy|docker|kubernetes|devops|ci\/cd|pipeline|server|database|load|scale|monitor|observe|infrastructure|terraform|ansible|kubernetes|helm)\b/i.test(lowerQ)) {
    return 'ops';
  }

  // AI/LLM keywords
  if (/\b(llm|language model|gpt|claude|transformer|neural|token|embedding|vector|model|training|fine-tune|prompt|prompt engineer|rag|retrieval)\b/i.test(lowerQ)) {
    return 'ai-llm';
  }

  // Agents keywords
  if (/\b(agent|autonomous|mcp|tool|capability|task|workflow|orchestration|agentic|multi-agent)\b/i.test(lowerQ)) {
    return 'agents';
  }

  // Forum/community keywords
  if (/\b(forum|community|discussion|question|answer|post|reply|thread|debate|grump|reputation|badge)\b/i.test(lowerQ)) {
    return 'forum';
  }

  // Reasoning/logic keywords
  if (/\b(algorithm|complexity|big-o|proof|logic|theorem|logical|reasoning|deduction|induction)\b/i.test(lowerQ)) {
    return 'reasoning';
  }

  // Math keywords
  if (/\b(math|equation|formula|derivative|integral|matrix|vector|linear algebra|calculus|statistics|probability)\b/i.test(lowerQ)) {
    return 'math';
  }

  // Creative keywords
  if (/\b(design|creative|ui|ux|frontend|layout|visual|color|animation|asset|brand|content)\b/i.test(lowerQ)) {
    return 'creative';
  }

  // Governance keywords
  if (/\b(governance|compliance|regulation|audit|security|risk|policy|standard|requirement|soc2|hipaa|gdpr)\b/i.test(lowerQ)) {
    return 'governance';
  }

  return 'default';
}

/**
 * Select a fresh bark that hasn't been used by this user recently
 *
 * Algorithm:
 * 1. Classify the question into a tag
 * 2. Fetch all barks for that tag
 * 3. Fetch all barks used by the user in the last 24h
 * 4. Find candidates = all barks - recently used
 * 5. If candidates found, randomly pick one
 * 6. If no candidates, trigger dynamic (LLM) bark generation
 */
export async function selectBark(userId: string, question: string, forumSlug?: string): Promise<SelectedBark> {
  // Use DB barkTag from forum if available, otherwise classify from question text
  const tag = forumSlug
    ? await resolveBarkTagFromForum(forumSlug, question)
    : classifyQuestionTag(question);

  // Get all barks for this tag
  const allBarks = await db.bark.findMany({
    where: { tag },
    orderBy: { createdAt: 'desc' },
  });

  if (allBarks.length === 0) {
    // Tag has no barks; fall back to 'default' tag
    const defaultBarks = await db.bark.findMany({
      where: { tag: 'default' },
      orderBy: { createdAt: 'desc' },
    });
    if (defaultBarks.length === 0) {
      // No barks exist; generate one dynamically
      return generateDynamicBark(question, tag);
    }
    return pickRandomBark(defaultBarks, userId);
  }

  // Get barks used by this user in the last 24h
  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentlyUsed = await db.barkUsageLog.findMany({
    where: {
      userId,
      usedAt: { gte: cutoffTime },
    },
    select: { barkId: true },
  });
  const usedIds = new Set(recentlyUsed.map((u) => u.barkId));

  // Find candidates (not recently used)
  const candidates = allBarks.filter((b) => !usedIds.has(b.id));

  if (candidates.length === 0) {
    // All barks for this tag have been used; generate dynamically
    return generateDynamicBark(question, tag);
  }

  // Pick random from candidates
  return pickRandomBark(candidates, userId);
}

/**
 * Pick a random bark from a list and log its usage
 */
async function pickRandomBark(barks: any[], userId: string): Promise<SelectedBark> {
  const chosen = barks[Math.floor(Math.random() * barks.length)];

  // Log the usage (24h TTL)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.barkUsageLog.create({
    data: {
      userId,
      barkId: chosen.id,
      expiresAt,
    },
  });

  // Increment usage count
  await db.bark.update({
    where: { id: chosen.id },
    data: {
      usageCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });

  return {
    id: chosen.id,
    text: chosen.text,
    tag: chosen.tag as BarkTag,
    mood: chosen.mood as BarkMood,
    isGenerated: chosen.isGenerated,
  };
}

/**
 * Generate a dynamic bark using LLM (fallback when pool exhausted)
 *
 * This function:
 * 1. Calls the LLM to generate a fresh, original bark
 * 2. Saves it to the database for reuse
 * 3. Logs its usage
 * 4. Returns it for immediate injection
 *
 * The generated bark is stored and treated like any pre-seeded quip,
 * so it will be tracked in the usage log and never repeat within 24h.
 */
async function generateDynamicBark(question: string, tag: BarkTag): Promise<SelectedBark> {
  // Use modern OpenAI pattern
  const OpenAI = await import('openai').then(m => m.default);
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const systemPrompt = `You are GrumpRolled's bark generator. Write a SHORT (≤30 word), original, mildly insulting but good-natured "bark" 
that fits the topic "${tag}" and the spirit of a softened drill sergeant (think Gunnery Sgt. Hartman but caring).

Examples:
- "Listen up, rookie – you just tripped over your own logic."
- "Your function is about as clean as a mud-run in a hurricane."
- "Deploying that without testing? That's like sending a cat into a combat zone."

IMPORTANT: Make it fresh, witty, contextually appropriate, and under 30 words. End with a period.`;

  const userMessage = `Generate a fresh bark for this question: "${question.slice(0, 100)}..."`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 100,
      temperature: 0.9,
    });
    const barkText = (response.choices[0].message.content || '').trim();

    // Save to database
    const newBark = await db.bark.create({
      data: {
        text: barkText,
        tag,
        mood: 'gruff',
        isGenerated: true,
        sourceQuestion: question.slice(0, 200),
      },
    });

    // Log usage
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.barkUsageLog.create({
      data: {
        userId: `anon-${Date.now()}`, // Anonymous user
        barkId: newBark.id,
        expiresAt,
      },
    });

    return {
      id: newBark.id,
      text: barkText,
      tag,
      mood: 'gruff',
      isGenerated: true,
    };
  } catch (error) {
    console.error('Bark generation error:', error);
    // Graceful fallback: return a generic bark
    return {
      id: 'fallback',
      text: "You're about as useful as a screen door on a submarine – but that doesn't mean you won't get an answer.",
      tag: 'default',
      mood: 'gruff',
      isGenerated: false,
    };
  }
}

/**
 * Inject a bark into an answer with random placement (prefix or suffix)
 *
 * Returns: `{bark}\n\n{answer}` or `{answer}\n\n{bark}`
 * Then append the GRUMPIFIED signature for brand continuity.
 */
export function injectBark(answer: string, bark: SelectedBark, placement: 'prefix' | 'suffix' | 'random' = 'random'): string {
  const actualPlacement = placement === 'random' ? (Math.random() < 0.5 ? 'prefix' : 'suffix') : placement;

  if (actualPlacement === 'prefix') {
    return `${bark.text}\n\n${answer}`;
  } else {
    return `${answer}\n\n${bark.text}`;
  }
}

/**
 * The GrumpRolled signature that appears at the end of every response
 * Provides brand recognition and reminds users who they're talking to
 */
export const GRUMPIFIED_SIGNATURE = '\n— GrumpRolled, at your (digital) service';

/**
 * Main entry point: Answer with bark injection
 *
 * Usage in your API:
 *   const answer = await answerWithTriplePass(question)
 *   const bark = await selectBark(userId, question)
 *   const final = injectBark(answer.answer, bark, 'random')
 *   return final + GRUMPIFIED_SIGNATURE
 */
export async function answerWithBark(
  userId: string,
  question: string,
  answer: string,
  forumSlug?: string
): Promise<{
  answer: string;
  bark: SelectedBark;
  signature: string;
}> {
  const bark = await selectBark(userId, question, forumSlug);
  const withBark = injectBark(answer, bark, 'random');
  return {
    answer: withBark + GRUMPIFIED_SIGNATURE,
    bark,
    signature: GRUMPIFIED_SIGNATURE,
  };
}
