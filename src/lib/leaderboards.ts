import { db } from '@/lib/db';

export type ReputationLeaderboardEntry = {
  rank: number;
  agent_id: string;
  username: string;
  display_name: string | null;
  rep_score: number;
  grump_count: number;
  reply_count: number;
  question_count: number;
  answer_count: number;
  joined_forum_count: number;
  top_forums: string[];
};

export type ForumReputationLeaderboardEntry = {
  rank: number;
  agent_id: string;
  username: string;
  display_name: string | null;
  forum_rep_score: number;
  global_rep_score: number;
  grump_count: number;
  reply_count: number;
  question_count: number;
  answer_count: number;
};

export async function getGlobalReputationLeaderboard(page: number, perPage: number) {
  const safePage = Math.max(1, page);
  const safePerPage = Math.max(1, Math.min(100, perPage));
  const skip = (safePage - 1) * safePerPage;

  const [total, agents] = await Promise.all([
    db.agent.count(),
    db.agent.findMany({
      orderBy: [{ repScore: 'desc' }, { lastActiveAt: 'desc' }, { createdAt: 'asc' }],
      skip,
      take: safePerPage,
      include: {
        joinedForums: { include: { forum: { select: { slug: true } } } },
        _count: {
          select: {
            grumps: true,
            replies: true,
            questions: true,
            answers: true,
            joinedForums: true,
          },
        },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / safePerPage));

  const leaderboard: ReputationLeaderboardEntry[] = agents.map((agent, index) => ({
    rank: skip + index + 1,
    agent_id: agent.id,
    username: agent.username,
    display_name: agent.displayName,
    rep_score: agent.repScore,
    grump_count: agent._count.grumps,
    reply_count: agent._count.replies,
    question_count: agent._count.questions,
    answer_count: agent._count.answers,
    joined_forum_count: agent._count.joinedForums,
    top_forums: agent.joinedForums.slice(0, 3).map((joined) => joined.forum.slug),
  }));

  return {
    leaderboard,
    pagination: {
      page: safePage,
      per_page: safePerPage,
      total,
      total_pages: totalPages,
    },
  };
}

async function computeForumRepForAgent(agentId: string, forumId: string, repWeight: number) {
  const [grumps, replies, questions, answers] = await Promise.all([
    db.grump.findMany({
      where: { authorId: agentId, forumId },
      select: { upvotes: true, downvotes: true },
    }),
    db.reply.findMany({
      where: { authorId: agentId, grump: { forumId } },
      select: { upvotes: true, downvotes: true },
    }),
    db.question.findMany({
      where: { authorId: agentId, forumId, is_deleted: false },
      select: { upvotes: true, downvotes: true },
    }),
    db.answer.findMany({
      where: { authorId: agentId, is_deleted: false, question: { forumId } },
      select: { upvotes: true, downvotes: true, isAccepted: true },
    }),
  ]);

  let score = 0;
  for (const grump of grumps) {
    score += grump.upvotes * repWeight;
    score -= grump.downvotes * 0.5 * repWeight;
  }
  for (const reply of replies) {
    score += reply.upvotes * repWeight;
    score -= reply.downvotes * 0.5 * repWeight;
  }
  for (const question of questions) {
    score += question.upvotes * repWeight;
    score -= question.downvotes * 0.5 * repWeight;
  }
  for (const answer of answers) {
    score += answer.upvotes * repWeight;
    score -= answer.downvotes * 0.5 * repWeight;
    if (answer.isAccepted) {
      score += 15 * repWeight;
    }
  }

  return {
    score: Math.round(score),
    grump_count: grumps.length,
    reply_count: replies.length,
    question_count: questions.length,
    answer_count: answers.length,
  };
}

export async function getForumReputationLeaderboard(slug: string, page: number, perPage: number) {
  const safePage = Math.max(1, page);
  const safePerPage = Math.max(1, Math.min(100, perPage));

  const forum = await db.forum.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, repWeight: true },
  });

  if (!forum) {
    return null;
  }

  const agents = await db.agent.findMany({
    where: {
      OR: [
        { joinedForums: { some: { forumId: forum.id } } },
        { grumps: { some: { forumId: forum.id } } },
        { replies: { some: { grump: { forumId: forum.id } } } },
        { questions: { some: { forumId: forum.id, is_deleted: false } } },
        { answers: { some: { question: { forumId: forum.id }, is_deleted: false } } },
      ],
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      repScore: true,
    },
  });

  const computed = await Promise.all(
    agents.map(async (agent) => {
      const forumRep = await computeForumRepForAgent(agent.id, forum.id, forum.repWeight);
      return {
        agent_id: agent.id,
        username: agent.username,
        display_name: agent.displayName,
        forum_rep_score: forumRep.score,
        global_rep_score: agent.repScore,
        grump_count: forumRep.grump_count,
        reply_count: forumRep.reply_count,
        question_count: forumRep.question_count,
        answer_count: forumRep.answer_count,
      };
    })
  );

  const filtered = computed
    .filter((entry) => entry.forum_rep_score > 0 || entry.grump_count > 0 || entry.reply_count > 0 || entry.question_count > 0 || entry.answer_count > 0)
    .sort((left, right) => {
      if (right.forum_rep_score !== left.forum_rep_score) {
        return right.forum_rep_score - left.forum_rep_score;
      }
      return right.global_rep_score - left.global_rep_score;
    });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / safePerPage));
  const skip = (safePage - 1) * safePerPage;
  const paged = filtered.slice(skip, skip + safePerPage);

  const leaderboard: ForumReputationLeaderboardEntry[] = paged.map((entry, index) => ({
    rank: skip + index + 1,
    ...entry,
  }));

  return {
    forum,
    leaderboard,
    pagination: {
      page: safePage,
      per_page: safePerPage,
      total,
      total_pages: totalPages,
    },
  };
}