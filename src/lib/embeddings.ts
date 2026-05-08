import { db } from '@/lib/db';

const EMBEDDING_MODEL = 'nomic-embed-text';
const EMBEDDING_DIM = 768;
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
  });

  if (!response.ok) {
    throw new Error(`Embedding generation failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { embedding: number[] };
  return {
    embedding: data.embedding,
    tokenCount: data.embedding.length,
  };
}

function formatVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export async function storeContentEmbedding(
  contentId: string,
  contentType: 'QUESTION' | 'PATTERN' | 'FORUM' | 'ANSWER',
  text: string
): Promise<void> {
  const { embedding } = await generateEmbedding(text);
  const vector = formatVector(embedding);

  await db.$executeRawUnsafe(
    `INSERT INTO "ContentEmbedding" ("id", "contentId", "contentType", "embedding", "embeddingModel", "tokenCount", "createdAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3::vector, $4, $5, NOW())
     ON CONFLICT ("contentId", "contentType") DO UPDATE SET
       "embedding" = EXCLUDED."embedding",
       "embeddingModel" = EXCLUDED."embeddingModel",
       "tokenCount" = EXCLUDED."tokenCount"`,
    contentId,
    contentType,
    vector,
    EMBEDDING_MODEL,
    embedding.length
  );
}

export interface SearchResult {
  contentId: string;
  contentType: string;
  similarity: number;
  snippet: string;
}

export async function semanticSearch(
  query: string,
  options: {
    contentType?: string;
    limit?: number;
    threshold?: number;
  } = {}
): Promise<SearchResult[]> {
  const { contentType, limit = 20, threshold = 0.3 } = options;
  const { embedding } = await generateEmbedding(query);
  const vector = formatVector(embedding);

  const contentTypeFilter = contentType
    ? `AND ce."contentType" = '${contentType}'`
    : '';

  const results = await db.$queryRawUnsafe<Array<{
    contentId: string;
    contentType: string;
    similarity: number;
    snippet: string;
  }>>(
    `SELECT
       ce."contentId",
       ce."contentType",
       1 - (ce.embedding <=> $1::vector) AS similarity,
       CASE
         WHEN ce."contentType" = 'QUESTION' THEN COALESCE(q.title, '')
         WHEN ce."contentType" = 'PATTERN' THEN COALESCE(p.title, '')
         WHEN ce."contentType" = 'FORUM' THEN COALESCE(f.name, '')
         WHEN ce."contentType" = 'ANSWER' THEN COALESCE(LEFT(a.body, 200), '')
         ELSE ''
       END AS snippet
     FROM "ContentEmbedding" ce
     LEFT JOIN "Question" q ON ce."contentId" = q.id AND ce."contentType" = 'QUESTION'
     LEFT JOIN "VerifiedPattern" p ON ce."contentId" = p.id AND ce."contentType" = 'PATTERN'
     LEFT JOIN "Forum" f ON ce."contentId" = f.id AND ce."contentType" = 'FORUM'
     LEFT JOIN "Answer" a ON ce."contentId" = a.id AND ce."contentType" = 'ANSWER'
     WHERE 1 - (ce.embedding <=> $1::vector) >= $2
     ${contentTypeFilter}
     ORDER BY similarity DESC
     LIMIT $3`,
    vector,
    threshold,
    limit
  );

  return results;
}

export async function hasContentEmbedding(contentId: string, contentType: string): Promise<boolean> {
  const result = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) as count FROM "ContentEmbedding" WHERE "contentId" = $1 AND "contentType" = $2`,
    contentId,
    contentType
  );
  return Number(result[0]?.count || 0) > 0;
}

export async function generateAndStoreQuestionEmbedding(questionId: string, title: string, body: string): Promise<void> {
  await storeContentEmbedding(questionId, 'QUESTION', `${title}\n${body}`);
}

export async function generateAndStorePatternEmbedding(patternId: string, title: string, description: string): Promise<void> {
  await storeContentEmbedding(patternId, 'PATTERN', `${title}\n${description}`);
}

export async function generateAndStoreForumEmbedding(forumId: string, name: string, description: string): Promise<void> {
  await storeContentEmbedding(forumId, 'FORUM', `${name}\n${description || ''}`);
}

export async function backfillEmbeddings(contentType: string, limit = 50): Promise<number> {
  let rows: Array<{ id: string; title?: string; body?: string; name?: string; description?: string; text?: string }> = [];

  switch (contentType) {
    case 'QUESTION':
      rows = await db.$queryRawUnsafe<Array<{ id: string; title: string; body: string }>>(
        `SELECT q.id, q.title, q.body FROM "Question" q
         WHERE q.is_deleted = false
         AND NOT EXISTS (SELECT 1 FROM "ContentEmbedding" ce WHERE ce."contentId" = q.id AND ce."contentType" = 'QUESTION')
         LIMIT $1`, limit
      );
      break;
    case 'PATTERN':
      rows = await db.$queryRawUnsafe<Array<{ id: string; title: string; description: string }>>(
        `SELECT p.id, p.title, p.description FROM "VerifiedPattern" p
         WHERE p."publishedAt" IS NOT NULL AND p."deprecatedAt" IS NULL
         AND NOT EXISTS (SELECT 1 FROM "ContentEmbedding" ce WHERE ce."contentId" = p.id AND ce."contentType" = 'PATTERN')
         LIMIT $1`, limit
      );
      break;
    case 'FORUM':
      rows = await db.$queryRawUnsafe<Array<{ id: string; name: string; description: string }>>(
        `SELECT f.id, f.name, f.description FROM "Forum" f
         WHERE NOT EXISTS (SELECT 1 FROM "ContentEmbedding" ce WHERE ce."contentId" = f.id AND ce."contentType" = 'FORUM')
         LIMIT $1`, limit
      );
      break;
  }

  let count = 0;
  for (const row of rows) {
    try {
      const text = [row.title || row.name, row.body || row.description || ''].filter(Boolean).join('\n');
      if (text.length > 10) {
        await storeContentEmbedding(row.id, contentType as 'QUESTION' | 'PATTERN' | 'FORUM', text);
        count++;
      }
    } catch {
      // skip embedding failures, continue with remaining rows
    }
  }

  return count;
}
