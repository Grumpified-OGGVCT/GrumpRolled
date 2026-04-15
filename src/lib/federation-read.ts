import { db } from '@/lib/db';
import {
  fetchChatOverflowReadBundle,
  type ChatOverflowAnswerSnapshot,
  type ChatOverflowProfileSnapshot,
  type ChatOverflowQuestionSnapshot,
} from '@/lib/chatoverflow-client';
import {
  fetchMoltbookReadBundle,
  type MoltbookPostSnapshot,
  type MoltbookProfileSnapshot,
} from '@/lib/moltbook-client';
import { isFederatedIdentityPlatform } from '@/lib/federation-platforms';

const PROFILE_SUMMARY = 'PROFILE_SUMMARY';
const QUESTION = 'QUESTION';
const ANSWER = 'ANSWER';
const POST = 'POST';
const MAX_CACHE_AGE_MS = 30 * 60 * 1000;

export type FederatedSummary = {
  platform: 'CHATOVERFLOW' | 'MOLTBOOK';
  profile: ChatOverflowProfileSnapshot | MoltbookProfileSnapshot | null;
  recent_questions: ChatOverflowQuestionSnapshot[];
  recent_answers: ChatOverflowAnswerSnapshot[];
  recent_posts: MoltbookPostSnapshot[];
  fetched_at: string | null;
};

function parseSnapshot<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function syncFederatedRead(agentId: string, platform: string, externalUsername: string): Promise<FederatedSummary | null> {
  if (!isFederatedIdentityPlatform(platform)) {
    return null;
  }

  const fetchedAt = new Date();

  if (platform === 'CHATOVERFLOW') {
    const bundle = await fetchChatOverflowReadBundle(externalUsername);

    await db.$transaction(async (tx) => {
      await tx.externalActivity.deleteMany({
        where: {
          agentId,
          platform,
          activityType: { in: [PROFILE_SUMMARY, QUESTION, ANSWER, POST] },
        },
      });

      await tx.externalActivity.create({
        data: {
          agentId,
          platform,
          activityType: PROFILE_SUMMARY,
          externalId: bundle.profile.external_user_id,
          title: `${bundle.profile.username} profile`,
          url: bundle.profile.profile_url,
          snapshotData: JSON.stringify(bundle.profile),
          fetchedAt,
        },
      });

      if (bundle.recent_questions.length > 0) {
        await tx.externalActivity.createMany({
          data: bundle.recent_questions.map((question) => ({
            agentId,
            platform,
            activityType: QUESTION,
            externalId: question.id,
            title: question.title,
            url: question.url,
            snapshotData: JSON.stringify(question),
            fetchedAt,
          })),
        });
      }

      if (bundle.recent_answers.length > 0) {
        await tx.externalActivity.createMany({
          data: bundle.recent_answers.map((answer) => ({
            agentId,
            platform,
            activityType: ANSWER,
            externalId: answer.id,
            title: `Answer ${answer.id}`,
            url: answer.url,
            snapshotData: JSON.stringify(answer),
            fetchedAt,
          })),
        });
      }
    });

    return {
      platform,
      profile: bundle.profile,
      recent_questions: bundle.recent_questions,
      recent_answers: bundle.recent_answers,
      recent_posts: [],
      fetched_at: fetchedAt.toISOString(),
    };
  }

  const bundle = await fetchMoltbookReadBundle(externalUsername);

  await db.$transaction(async (tx) => {
    await tx.externalActivity.deleteMany({
      where: {
        agentId,
        platform,
        activityType: { in: [PROFILE_SUMMARY, QUESTION, ANSWER, POST] },
      },
    });

    await tx.externalActivity.create({
      data: {
        agentId,
        platform,
        activityType: PROFILE_SUMMARY,
        externalId: bundle.profile.external_user_id,
        title: `${bundle.profile.username} profile`,
        url: bundle.profile.profile_url,
        snapshotData: JSON.stringify(bundle.profile),
        fetchedAt,
      },
    });

    if (bundle.recent_posts.length > 0) {
      await tx.externalActivity.createMany({
        data: bundle.recent_posts.map((post) => ({
          agentId,
          platform,
          activityType: POST,
          externalId: post.id,
          title: post.title,
          url: post.url,
          snapshotData: JSON.stringify(post),
          fetchedAt,
        })),
      });
    }
  });

  return {
    platform,
    profile: bundle.profile,
    recent_questions: [],
    recent_answers: [],
    recent_posts: bundle.recent_posts,
    fetched_at: fetchedAt.toISOString(),
  };
}

export async function getFederatedSummary(agentId: string, platform: string): Promise<FederatedSummary | null> {
  if (!isFederatedIdentityPlatform(platform)) {
    return null;
  }

  const rows = await db.externalActivity.findMany({
    where: { agentId, platform },
    orderBy: { fetchedAt: 'desc' },
  });

  if (rows.length === 0) {
    return null;
  }

  const profileRow = rows.find((row) => row.activityType === PROFILE_SUMMARY);
  const questionRows = rows.filter((row) => row.activityType === QUESTION).slice(0, 5);
  const answerRows = rows.filter((row) => row.activityType === ANSWER).slice(0, 5);
  const postRows = rows.filter((row) => row.activityType === POST).slice(0, 5);

  return {
    platform,
    profile: profileRow ? parseSnapshot<ChatOverflowProfileSnapshot | MoltbookProfileSnapshot>(profileRow.snapshotData) : null,
    recent_questions: questionRows
      .map((row) => parseSnapshot<ChatOverflowQuestionSnapshot>(row.snapshotData))
      .filter((row): row is ChatOverflowQuestionSnapshot => Boolean(row)),
    recent_answers: answerRows
      .map((row) => parseSnapshot<ChatOverflowAnswerSnapshot>(row.snapshotData))
      .filter((row): row is ChatOverflowAnswerSnapshot => Boolean(row)),
    recent_posts: postRows
      .map((row) => parseSnapshot<MoltbookPostSnapshot>(row.snapshotData))
      .filter((row): row is MoltbookPostSnapshot => Boolean(row)),
    fetched_at: profileRow?.fetchedAt.toISOString() || null,
  };
}

export async function ensureFederatedSummary(agentId: string, platform: string, externalUsername: string, forceRefresh = false): Promise<FederatedSummary | null> {
  const cached = await getFederatedSummary(agentId, platform);
  if (!forceRefresh && cached?.fetched_at) {
    const ageMs = Date.now() - new Date(cached.fetched_at).getTime();
    if (ageMs < MAX_CACHE_AGE_MS) {
      return cached;
    }
  }

  return syncFederatedRead(agentId, platform, externalUsername);
}