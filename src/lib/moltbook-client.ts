const MOLTBOOK_BASE_URL = 'https://www.moltbook.com';
const MOLTBOOK_API_BASE = `${MOLTBOOK_BASE_URL}/api/v1`;
const DEFAULT_TIMEOUT_MS = 10000;

type MoltbookProfileResponse = {
  success: boolean;
  agent: {
    id: string;
    name: string;
    description: string | null;
    karma: number;
    follower_count: number;
    following_count: number;
    posts_count: number;
    comments_count: number;
    is_verified: boolean;
    is_claimed: boolean;
    created_at: string;
  };
};

type MoltbookPostsResponse = {
  success: boolean;
  posts: Array<{
    id: string;
    title: string;
    score: number;
    comment_count: number;
    created_at: string;
    verification_status: string | null;
    submolt?: {
      name?: string | null;
    } | null;
  }>;
};

export type MoltbookProfileSnapshot = {
  platform: 'MOLTBOOK';
  external_user_id: string;
  username: string;
  verified: boolean;
  bio: string | null;
  karma: number | null;
  followers: number | null;
  following: number | null;
  joined_at: string | null;
  post_count: number | null;
  comment_count: number | null;
  profile_url: string;
};

export type MoltbookPostSnapshot = {
  id: string;
  title: string;
  preview: string | null;
  submolt: string | null;
  score: number | null;
  comment_count: number | null;
  created_at: string | null;
  url: string;
  verified: boolean;
};

export type MoltbookReadBundle = {
  profile: MoltbookProfileSnapshot;
  recent_posts: MoltbookPostSnapshot[];
};

async function fetchJson<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${MOLTBOOK_API_BASE}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Moltbook API ${response.status} for ${path}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchMoltbookReadBundle(username: string): Promise<MoltbookReadBundle> {
  const profileUrl = `${MOLTBOOK_BASE_URL}/u/${encodeURIComponent(username)}`;
  const [profilePayload, postsPayload] = await Promise.all([
    fetchJson<MoltbookProfileResponse>(`/agents/profile?name=${encodeURIComponent(username)}`),
    fetchJson<MoltbookPostsResponse>(`/posts?author=${encodeURIComponent(username)}&sort=new&limit=5`).catch(() => ({
      success: false,
      posts: [],
    })),
  ]);

  if (!profilePayload.success || !profilePayload.agent) {
    throw new Error(`Moltbook profile not found for ${username}`);
  }

  return {
    profile: {
      platform: 'MOLTBOOK',
      external_user_id: profilePayload.agent.id,
      username: profilePayload.agent.name,
      verified: Boolean(profilePayload.agent.is_verified || profilePayload.agent.is_claimed),
      bio: profilePayload.agent.description,
      karma: profilePayload.agent.karma,
      followers: profilePayload.agent.follower_count,
      following: profilePayload.agent.following_count,
      joined_at: profilePayload.agent.created_at,
      post_count: profilePayload.agent.posts_count,
      comment_count: profilePayload.agent.comments_count,
      profile_url: profileUrl,
    },
    recent_posts: (postsPayload.posts || []).slice(0, 5).map((post) => ({
      id: post.id,
      title: post.title,
      preview: post.content_preview || null,
      submolt: post.submolt?.name || null,
      score: post.score,
      comment_count: post.comment_count,
      created_at: post.created_at,
      url: `${MOLTBOOK_BASE_URL}/post/${post.id}`,
      verified: post.verification_status === 'verified',
    })),
  };
}