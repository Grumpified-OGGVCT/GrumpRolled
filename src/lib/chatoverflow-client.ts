const CHATOVERFLOW_API_BASE = 'https://www.chatoverflow.dev/api';
const DEFAULT_TIMEOUT_MS = 10000;

type ChatOverflowCreateQuestionResponse = {
  id?: string;
  question_id?: string;
  title?: string;
};

type ChatOverflowUser = {
  id: string;
  username: string;
  question_count: number;
  answer_count: number;
  reputation: number;
  created_at: string;
};

type ChatOverflowQuestion = {
  id: string;
  title: string;
  body: string;
  forum_id: string;
  forum_name: string;
  author_id: string;
  author_username: string;
  upvote_count: number;
  downvote_count: number;
  score: number;
  answer_count: number;
  created_at: string;
  attachments?: unknown[];
};

type ChatOverflowAnswer = {
  id: string;
  body: string;
  question_id: string;
  author_id: string;
  author_username: string;
  status: string;
  upvote_count: number;
  downvote_count: number;
  score: number;
  created_at: string;
  attachments?: unknown[];
};

type ChatOverflowUsageEntry = {
  id: string;
  username: string;
  reputation: number;
  activity_score?: number;
  feedback_score?: number;
  contribution_score?: number;
  question_count?: number;
  answer_count?: number;
};

type ChatOverflowForum = {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  question_count?: number;
};

export type ChatOverflowProfileSnapshot = {
  platform: 'CHATOVERFLOW';
  external_user_id: string;
  username: string;
  reputation: number;
  question_count: number;
  answer_count: number;
  created_at: string;
  profile_url: string;
  usage: null | {
    activity_score: number;
    feedback_score: number;
    contribution_score: number;
  };
};

export type ChatOverflowQuestionSnapshot = {
  id: string;
  title: string;
  forum_name: string;
  score: number;
  answer_count: number;
  created_at: string;
  url: string;
};

export type ChatOverflowAnswerSnapshot = {
  id: string;
  question_id: string;
  status: string;
  score: number;
  created_at: string;
  url: string;
  preview: string;
};

export type ChatOverflowReadBundle = {
  profile: ChatOverflowProfileSnapshot;
  recent_questions: ChatOverflowQuestionSnapshot[];
  recent_answers: ChatOverflowAnswerSnapshot[];
};

export type ChatOverflowQuestionCandidate = {
  id: string;
  title: string;
  body: string;
  forum_name: string;
  author_username: string;
  score: number;
  answer_count: number;
  created_at: string;
  url: string;
};

export type ChatOverflowAnswerCandidate = {
  id: string;
  question_id: string;
  body: string;
  status: string;
  author_username: string;
  score: number;
  created_at: string;
  url: string;
};

async function fetchJson<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${CHATOVERFLOW_API_BASE}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`ChatOverflow API ${response.status} for ${path}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function normalizeQuestions(payload: unknown): ChatOverflowQuestion[] {
  if (Array.isArray(payload)) return payload as ChatOverflowQuestion[];
  if (payload && typeof payload === 'object' && 'questions' in payload) {
    const questions = (payload as { questions?: unknown }).questions;
    return Array.isArray(questions) ? (questions as ChatOverflowQuestion[]) : [];
  }
  return [];
}

function normalizeAnswers(payload: unknown): ChatOverflowAnswer[] {
  if (Array.isArray(payload)) return payload as ChatOverflowAnswer[];
  if (payload && typeof payload === 'object' && 'answers' in payload) {
    const answers = (payload as { answers?: unknown }).answers;
    return Array.isArray(answers) ? (answers as ChatOverflowAnswer[]) : [];
  }
  return [];
}

function normalizeUsage(payload: unknown): ChatOverflowUsageEntry[] {
  if (Array.isArray(payload)) return payload as ChatOverflowUsageEntry[];
  if (payload && typeof payload === 'object') {
    if ('users' in payload && Array.isArray((payload as { users?: unknown }).users)) {
      return (payload as { users: ChatOverflowUsageEntry[] }).users;
    }
    if ('leaderboard' in payload && Array.isArray((payload as { leaderboard?: unknown }).leaderboard)) {
      return (payload as { leaderboard: ChatOverflowUsageEntry[] }).leaderboard;
    }
  }
  return [];
}

function normalizeForums(payload: unknown): ChatOverflowForum[] {
  if (Array.isArray(payload)) return payload as ChatOverflowForum[];
  if (payload && typeof payload === 'object' && 'forums' in payload) {
    const forums = (payload as { forums?: unknown }).forums;
    return Array.isArray(forums) ? (forums as ChatOverflowForum[]) : [];
  }
  return [];
}

export function buildChatOverflowQuestionUrl(questionId: string) {
  return `https://www.chatoverflow.dev/humans/question/${questionId}`;
}

export async function searchChatOverflowQuestions(query: string, limit = 5): Promise<ChatOverflowQuestionCandidate[]> {
  const payload = await fetchJson<unknown>(`/questions?search=${encodeURIComponent(query)}&sort=top&page=1`);
  const questions = normalizeQuestions(payload);

  return questions.slice(0, limit).map((question) => ({
    id: question.id,
    title: question.title,
    body: question.body,
    forum_name: question.forum_name,
    author_username: question.author_username,
    score: question.score,
    answer_count: question.answer_count,
    created_at: question.created_at,
    url: buildChatOverflowQuestionUrl(question.id),
  }));
}

export async function listChatOverflowQuestions(limit = 10): Promise<ChatOverflowQuestionCandidate[]> {
  const payload = await fetchJson<unknown>('/questions?sort=top&page=1');
  const questions = normalizeQuestions(payload);

  return questions.slice(0, limit).map((question) => ({
    id: question.id,
    title: question.title,
    body: question.body,
    forum_name: question.forum_name,
    author_username: question.author_username,
    score: question.score,
    answer_count: question.answer_count,
    created_at: question.created_at,
    url: buildChatOverflowQuestionUrl(question.id),
  }));
}

export async function fetchChatOverflowAnswers(questionId: string, limit = 5): Promise<ChatOverflowAnswerCandidate[]> {
  const payload = await fetchJson<unknown>(`/questions/${encodeURIComponent(questionId)}/answers`);
  const answers = normalizeAnswers(payload);

  return answers.slice(0, limit).map((answer) => ({
    id: answer.id,
    question_id: answer.question_id,
    body: answer.body,
    status: answer.status,
    author_username: answer.author_username,
    score: answer.score,
    created_at: answer.created_at,
    url: buildChatOverflowQuestionUrl(answer.question_id),
  }));
}

export async function fetchChatOverflowReadBundle(username: string): Promise<ChatOverflowReadBundle> {
  const profile = await fetchJson<ChatOverflowUser>(`/users/username/${encodeURIComponent(username)}`);
  const [questionsPayload, answersPayload, usagePayload] = await Promise.all([
    fetchJson<unknown>(`/users/${encodeURIComponent(profile.id)}/questions`).catch(() => []),
    fetchJson<unknown>(`/users/${encodeURIComponent(profile.id)}/answers`).catch(() => []),
    fetchJson<unknown>('/users/usage').catch(() => []),
  ]);

  const usageEntry = normalizeUsage(usagePayload).find((entry) => entry.id === profile.id || entry.username === profile.username);
  const recentQuestions = normalizeQuestions(questionsPayload)
    .slice(0, 5)
    .map((question) => ({
      id: question.id,
      title: question.title,
      forum_name: question.forum_name,
      score: question.score,
      answer_count: question.answer_count,
      created_at: question.created_at,
      url: buildChatOverflowQuestionUrl(question.id),
    }));
  const recentAnswers = normalizeAnswers(answersPayload)
    .slice(0, 5)
    .map((answer) => ({
      id: answer.id,
      question_id: answer.question_id,
      status: answer.status,
      score: answer.score,
      created_at: answer.created_at,
      url: buildChatOverflowQuestionUrl(answer.question_id),
      preview: truncate(answer.body.replace(/\s+/g, ' ').trim(), 180),
    }));

  return {
    profile: {
      platform: 'CHATOVERFLOW',
      external_user_id: profile.id,
      username: profile.username,
      reputation: profile.reputation,
      question_count: profile.question_count,
      answer_count: profile.answer_count,
      created_at: profile.created_at,
      profile_url: `https://www.chatoverflow.dev/humans/user/${profile.id}`,
      usage: usageEntry
        ? {
            activity_score: Number(usageEntry.activity_score || 0),
            feedback_score: Number(usageEntry.feedback_score || 0),
            contribution_score: Number(usageEntry.contribution_score || 0),
          }
        : null,
    },
    recent_questions: recentQuestions,
    recent_answers: recentAnswers,
  };
}

async function sendJson<T>(
  path: string,
  payload: Record<string, unknown>,
  options: {
    method?: 'POST';
    apiBaseUrl?: string;
    bearerToken: string;
    timeoutMs?: number;
  }
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${options.apiBaseUrl || CHATOVERFLOW_API_BASE}${path}`, {
      method: options.method || 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.bearerToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`ChatOverflow API ${response.status} for ${path}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createChatOverflowQuestion(
  input: {
    title: string;
    body: string;
    forum_id: string;
  },
  options: {
    bearerToken: string;
    apiBaseUrl?: string;
  }
) {
  const response = await sendJson<ChatOverflowCreateQuestionResponse>('/questions', input, {
    bearerToken: options.bearerToken,
    apiBaseUrl: options.apiBaseUrl,
  });

  const id = response.id || response.question_id;
  if (!id) {
    throw new Error('ChatOverflow create question response did not include an id');
  }

  return {
    id,
    title: response.title || input.title,
  };
}

export async function listChatOverflowForums() {
  const payload = await fetchJson<unknown>('/forums');
  return normalizeForums(payload).map((forum) => ({
    id: forum.id,
    name: forum.name,
    slug: forum.slug || null,
    description: forum.description || null,
    question_count: Number(forum.question_count || 0),
  }));
}