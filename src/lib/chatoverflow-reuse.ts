import {
  fetchChatOverflowAnswers,
  listChatOverflowQuestions,
  searchChatOverflowQuestions,
  type ChatOverflowAnswerCandidate,
  type ChatOverflowQuestionCandidate,
} from '@/lib/chatoverflow-client';
import { computeQuestionDedupKey } from '@/lib/agent-discovery';

type ReuseAnswer = {
  id: string;
  body: string;
  status: string;
  author_username: string;
  score: number;
  created_at: string;
  url: string;
};

export type ChatOverflowReuseCandidate = {
  question: ChatOverflowQuestionCandidate;
  reuse_score: number;
  lexical_overlap: number;
  dedup_key_match: boolean;
  top_answers: ReuseAnswer[];
};

function normalizeTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function jaccardScore(left: string, right: string) {
  const leftSet = new Set(normalizeTokens(left));
  const rightSet = new Set(normalizeTokens(right));
  if (leftSet.size === 0 || rightSet.size === 0) return 0;

  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1;
  }
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function rankAnswers(answers: ChatOverflowAnswerCandidate[]) {
  return [...answers].sort((left, right) => {
    const statusRank = (status: string) => (status === 'success' ? 3 : status === 'attempt' ? 2 : 1);
    if (statusRank(right.status) !== statusRank(left.status)) {
      return statusRank(right.status) - statusRank(left.status);
    }
    return right.score - left.score;
  });
}

export async function findChatOverflowReuseCandidates(query: string, limit = 5): Promise<ChatOverflowReuseCandidate[]> {
  const searchResults = await searchChatOverflowQuestions(query, limit);
  const candidatePool = searchResults.length > 0 ? searchResults : await listChatOverflowQuestions(Math.max(limit * 2, 10));
  const localDedupKey = computeQuestionDedupKey(query);

  const enriched = await Promise.all(
    candidatePool.map(async (result) => {
      const lexicalOverlap = jaccardScore(query, `${result.title} ${result.body}`);
      const dedupKeyMatch = computeQuestionDedupKey(`${result.title} ${result.body}`) === localDedupKey;
      const topAnswers = rankAnswers(await fetchChatOverflowAnswers(result.id, 5)).slice(0, 3).map((answer) => ({
        id: answer.id,
        body: answer.body,
        status: answer.status,
        author_username: answer.author_username,
        score: answer.score,
        created_at: answer.created_at,
        url: answer.url,
      }));
      const reuseScore = Number((lexicalOverlap * 0.6 + (dedupKeyMatch ? 0.3 : 0) + Math.min(result.score, 20) / 200 + Math.min(result.answer_count, 10) / 100).toFixed(3));

      return {
        question: result,
        reuse_score: reuseScore,
        lexical_overlap: Number(lexicalOverlap.toFixed(3)),
        dedup_key_match: dedupKeyMatch,
        top_answers: topAnswers,
      };
    })
  );

  return enriched.sort((left, right) => right.reuse_score - left.reuse_score).slice(0, limit);
}