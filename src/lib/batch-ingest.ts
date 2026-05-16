import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

import { db } from '@/lib/db';
import { storeContentEmbedding } from '@/lib/embeddings';
import { type ImportPatternPayload } from '@/lib/external-ingest';
import { type DeltaImportItem } from '@/lib/knowledge-deltas';
import { classifySourceTier, computeConfidence } from '@/lib/knowledge';

// ── Types ───────────────────────────────────────────────────────────────────

export type ContentType = 'PATTERN' | 'DELTA';

export interface BatchIngestConfig {
  /** Root directory to scan for documents. */
  sourceDir: string;
  /**
   * Glob-style file pattern. Supports simple wildcards:
   *   '*.md'       – all markdown files in sourceDir
   *   '**​/*.md'    – all markdown files recursively
   *   '*.{md,txt}' – markdown and text files in sourceDir
   * Default: '**​/*.md'
   */
  filePattern?: string;
  /** Maximum characters per chunk. Default: 4000. */
  chunkSize?: number;
  /** Overlap characters between consecutive chunks. Default: 200. */
  chunkOverlap?: number;
  /** Knowledge-unit type for embedding storage and promotion payloads. */
  contentType: ContentType;
  /** Tags applied to every chunk. */
  defaultTags?: string[];
  /** Source repository identifier applied to every chunk. */
  defaultSourceRepo?: string;
  /** If true, scan and report without persisting anything. */
  dryRun?: boolean;
}

export interface BatchIngestReport {
  /** Number of files that matched and were read. */
  filesProcessed: number;
  /** Chunks that were newly stored (embedded + persisted). */
  chunksStored: number;
  /** Chunks skipped because a matching content hash already existed. */
  chunksDeduped: number;
  /** Per-file / per-chunk errors collected during the run. */
  errors: BatchIngestError[];
  /** Wall-clock duration of the ingest run in milliseconds. */
  elapsedMs: number;
}

export interface BatchIngestError {
  file: string;
  chunkIndex?: number;
  message: string;
}

export interface DocumentChunk {
  /** The chunk's text content. */
  content: string;
  /** SHA-256 hex digest of the chunk content (used for dedup). */
  contentHash: string;
  /** Absolute path to the source file. */
  sourceFile: string;
  /** Relative path from sourceDir to the source file. */
  sourcePath: string;
  /** 0-based position of this chunk within the document. */
  chunkIndex: number;
  /** Total number of chunks produced from the document. */
  totalChunks: number;
}

export interface ChunkMetadata {
  defaultTags?: string[];
  defaultSourceRepo?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_CHUNK_SIZE = 4000;
const DEFAULT_CHUNK_OVERLAP = 200;
const DEFAULT_FILE_PATTERN = '**/*.md';

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Match a filename against a simple glob pattern.
 * Supports *, **, ?, and {a,b} alternation in the final path segment.
 */
function matchGlob(filename: string, pattern: string): boolean {
  // Normalize backslashes for cross-platform
  const normalizedFile = filename.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // If pattern starts with **​/, it means recursive — match against any prefix
  const parts = normalizedPattern.split('/');
  const fileParts = normalizedFile.split('/');

  // Handle ** prefix: **​/*.md matches anything at any depth
  if (parts[0] === '**') {
    const suffix = parts.slice(1).join('/');
    const fileTail = fileParts.slice(-(parts.length - 1)).join('/');
    return matchSingleLevel(fileTail, suffix);
  }

  // Single-level match (no **)
  if (parts.length === 1) {
    // Just a filename pattern
    const fileName = fileParts[fileParts.length - 1];
    return matchSingleLevel(fileName, parts[0]);
  }

  // Exact path depth match needed
  if (fileParts.length !== parts.length) return false;

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '**') continue;
    if (!matchSingleLevel(fileParts[i], parts[i])) return false;
  }
  return true;
}

function matchSingleLevel(name: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex specials
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
    .replace(/\{([^}]+)\}/g, (_, alts: string) => `(${alts.split(',').map(a => a.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('|')})`);
  return new RegExp(`^${regexStr}$`).test(name);
}

/**
 * Recursively collect files matching the glob pattern.
 */
function collectFiles(sourceDir: string, pattern: string): string[] {
  const fullPattern = pattern.replace(/\\/g, '/');
  const isRecursive = fullPattern.startsWith('**/');
  const effectivePattern = isRecursive ? fullPattern.slice(3) : fullPattern;

  const results: string[] = [];

  function walk(dir: string, relativePrefix: string) {
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // skip unreadable directories
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (isRecursive) {
          walk(fullPath, relPath);
        }
      } else if (entry.isFile()) {
        const matchAgainst = isRecursive ? relPath : entry.name;
        if (matchGlob(matchAgainst, isRecursive ? fullPattern : effectivePattern)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(sourceDir, '');
  return results.sort();
}

// ── Chunking ────────────────────────────────────────────────────────────────

/**
 * Split a long document into overlapping chunks.
 *
 * Strategy:
 * 1. Split the text into paragraphs (double-newline boundaries).
 * 2. Accumulate paragraphs until they approach `size` characters.
 * 3. Start each subsequent chunk `overlap` characters back from the
 *    previous chunk's end so context bridges across chunk boundaries.
 * 4. If a single paragraph exceeds `size`, split it mid-sentence.
 */
export function chunkDocument(
  text: string,
  size: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_CHUNK_OVERLAP,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.length <= size) {
    return [trimmed];
  }

  const paragraphs = trimmed.split(/\n\n+/);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const para of paragraphs) {
    const paraLen = para.length;

    // If this single paragraph is enormous, split it
    if (paraLen > size) {
      // Flush current chunk first
      if (current.length > 0) {
        chunks.push(current.join('\n\n'));
        current = [];
        currentLen = 0;
      }
      // Split the oversized paragraph into overlapping sub-chunks
      const subChunks = splitLongParagraph(para, size, overlap);
      chunks.push(...subChunks);
      continue;
    }

    // Would adding this paragraph exceed the size limit?
    const separatorLen = current.length > 0 ? 2 : 0;
    if (currentLen + separatorLen + paraLen > size && current.length > 0) {
      chunks.push(current.join('\n\n'));

      // Build overlap: keep some trailing content from the finished chunk
      const finishedText = current.join('\n\n');
      if (overlap > 0 && finishedText.length > overlap) {
        const overlapText = finishedText.slice(-overlap);
        // Start new chunk with overlap content
        current = [overlapText];
        currentLen = overlapText.length;
      } else {
        current = [];
        currentLen = 0;
      }
    }

    current.push(para);
    currentLen = current.reduce((sum, p) => sum + p.length, 0) + (current.length - 1) * 2;
  }

  if (current.length > 0) {
    chunks.push(current.join('\n\n'));
  }

  return chunks;
}

/**
 * Split a single paragraph that exceeds chunkSize into overlapping sub-chunks.
 */
function splitLongParagraph(text: string, size: number, overlap: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const sentence of sentences) {
    const sepLen = current.length > 0 ? 1 : 0;
    if (currentLen + sepLen + sentence.length > size && current.length > 0) {
      chunks.push(current.join(' '));

      const finishedText = current.join(' ');
      if (overlap > 0 && finishedText.length > overlap) {
        const overlapText = finishedText.slice(-overlap);
        current = [overlapText];
        currentLen = overlapText.length;
      } else {
        current = [];
        currentLen = 0;
      }
    }
    current.push(sentence);
    currentLen = current.reduce((s, p) => s + p.length, 0) + (current.length - 1);
  }

  if (current.length > 0) {
    chunks.push(current.join(' '));
  }

  return chunks.length > 0 ? chunks : [text];
}

// ── Conversion helpers ──────────────────────────────────────────────────────

/**
 * Map a document chunk to an ImportPatternPayload for the existing
 * external-ingest promotion pipeline (promotePatternCandidate).
 */
export function convertChunkToPatternImport(
  chunk: DocumentChunk,
  metadata: ChunkMetadata = {},
): ImportPatternPayload {
  const fileName = basename(chunk.sourceFile);
  const title = `${fileName} [chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks}]`;
  const tags = [
    ...(metadata.defaultTags ?? []),
    'batch-ingest',
    fileName.toLowerCase().replace(/\.[^.]+$/, ''),
  ];

  const sourceTier = classifySourceTier({
    sourceRepo: metadata.defaultSourceRepo,
    sourcePath: chunk.sourcePath,
    isOfficial: false,
  });

  return {
    title,
    description: chunk.content,
    pattern_type: 'WORKFLOW',
    category: 'coding',
    tags,
    code_snippet: undefined,
    language: undefined,
    source_repo: metadata.defaultSourceRepo,
    source_path: chunk.sourcePath,
    source_commit: undefined,
    source_url: undefined,
    source_fingerprint: `sha256:${chunk.contentHash}`,
    is_official: false,
    fact_check_score: 0.7,
    execution_score: 0.6,
    citation_score: 0.8,
    expert_score: 0.5,
    community_score: 0.5,
    novelty_class: 'NEW_SIGNAL',
    delta_summary: `Batch-imported document chunk from ${chunk.sourcePath} (${chunk.chunkIndex + 1}/${chunk.totalChunks}).`,
    provenance: {
      source_file: chunk.sourceFile,
      source_path: chunk.sourcePath,
      content_hash: chunk.contentHash,
      chunk_index: chunk.chunkIndex,
      total_chunks: chunk.totalChunks,
      ingest_method: 'batch-document-ingestion',
    },
  };
}

/**
 * Map a document chunk to a DeltaImportItem for the existing
 * external-ingest delta promotion pipeline (promoteDeltaCandidate).
 */
export function convertChunkToDeltaImport(
  chunk: DocumentChunk,
  metadata: ChunkMetadata = {},
): DeltaImportItem {
  const fileName = basename(chunk.sourceFile);
  const title = `${fileName} [chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks}]`;
  const topicTags = [
    ...(metadata.defaultTags ?? []),
    'batch-ingest',
    fileName.toLowerCase().replace(/\.[^.]+$/, ''),
  ];

  const sourceTier = classifySourceTier({
    sourceRepo: metadata.defaultSourceRepo,
    sourcePath: chunk.sourcePath,
    isOfficial: false,
  });

  const confidence = computeConfidence({
    sourceTier,
    factCheckScore: 0.7,
    executionScore: 0.6,
    citationScore: 0.8,
    expertScore: 0.5,
    communityScore: 0.5,
  });

  return {
    title,
    source_kind: 'DOC_CHUNK',
    source_url: undefined,
    source_repo: metadata.defaultSourceRepo,
    source_path: chunk.sourcePath,
    source_commit: undefined,
    source_fingerprint: `sha256:${chunk.contentHash}`,
    topic_tags: topicTags,
    forums: ['core-engineering'],
    primary_mechanism: chunk.content,
    delta_check: {
      status: 'MINOR_REFINEMENT',
      delta_summary: `Batch-imported document chunk from ${chunk.sourcePath} (${chunk.chunkIndex + 1}/${chunk.totalChunks}).`,
    },
    rules_and_constraints: {
      logic_gates: ['Review extracted document chunk for accuracy against source material.'],
      dependencies: ['Source document must remain accessible for verification.'],
      failure_modes: ['Chunk may lose context from surrounding sections due to size-based splitting.'],
    },
    decision_recommendation: 'QUEUE_REVIEW',
    evidence_units: [
      {
        type: 'EXTRACT',
        label: `Chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks}`,
        body: chunk.content,
      },
    ],
    scoring: {
      fact_check_score: 0.7,
      execution_score: 0.6,
      citation_score: 0.8,
      expert_score: 0.5,
      community_score: 0.5,
    },
    is_official: false,
    confidence_shift: 0,
    delta_magnitude: 1,
  };
}

// ── Main ingest entry point ─────────────────────────────────────────────────

/**
 * Scan a directory for documents, chunk them, deduplicate by content hash,
 * generate embeddings, and persist.
 *
 * Returns a {@link BatchIngestReport} with counts and any errors encountered.
 *
 * @example
 * ```ts
 * const report = await ingestBatchFiles({
 *   sourceDir: './docs/patterns',
 *   contentType: 'PATTERN',
 *   defaultTags: ['hlf', 'governance'],
 *   defaultSourceRepo: 'hlf_mcp',
 * });
 * console.log(report);
 * ```
 */
export async function ingestBatchFiles(
  config: BatchIngestConfig,
): Promise<BatchIngestReport> {
  const startTime = Date.now();
  const {
    sourceDir,
    filePattern = DEFAULT_FILE_PATTERN,
    chunkSize = DEFAULT_CHUNK_SIZE,
    chunkOverlap = DEFAULT_CHUNK_OVERLAP,
    contentType,
    defaultTags = [],
    defaultSourceRepo,
    dryRun = false,
  } = config;

  const report: BatchIngestReport = {
    filesProcessed: 0,
    chunksStored: 0,
    chunksDeduped: 0,
    errors: [],
    elapsedMs: 0,
  };

  const absoluteDir = resolve(sourceDir);

  if (!existsSync(absoluteDir)) {
    report.errors.push({
      file: absoluteDir,
      message: `Source directory does not exist: ${absoluteDir}`,
    });
    report.elapsedMs = Date.now() - startTime;
    return report;
  }

  if (!statSync(absoluteDir).isDirectory()) {
    report.errors.push({
      file: absoluteDir,
      message: `Path is not a directory: ${absoluteDir}`,
    });
    report.elapsedMs = Date.now() - startTime;
    return report;
  }

  console.log(`[batch-ingest] Scanning ${absoluteDir} with pattern "${filePattern}"`);
  const files = collectFiles(absoluteDir, filePattern);

  if (files.length === 0) {
    console.log('[batch-ingest] No matching files found.');
    report.elapsedMs = Date.now() - startTime;
    return report;
  }

  console.log(`[batch-ingest] Found ${files.length} file(s). Starting ingest...`);

  // The ContentEmbedding table accepts these contentTypes.
  // Batch document chunks always map to 'PATTERN' embedding type internally
  // while the config's contentType determines which promotion payload shape to use.
  const embeddingContentType = 'PATTERN' as const;

  for (const filePath of files) {
    report.filesProcessed++;

    // Read file
    let rawContent: string;
    try {
      rawContent = readFileSync(filePath, 'utf-8');
    } catch (err) {
      report.errors.push({
        file: filePath,
        message: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
      });
      console.error(`[batch-ingest] ERROR reading ${filePath}: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    if (!rawContent.trim()) {
      console.log(`[batch-ingest] Skipping empty file: ${filePath}`);
      continue;
    }

    // Chunk
    const chunkTexts = chunkDocument(rawContent, chunkSize, chunkOverlap);
    const totalChunks = chunkTexts.length;
    const sourcePath = relative(absoluteDir, filePath);
    const metadata: ChunkMetadata = { defaultTags, defaultSourceRepo };

    console.log(`[batch-ingest] ${basename(filePath)} → ${totalChunks} chunk(s)`);

    for (let i = 0; i < chunkTexts.length; i++) {
      const chunkContent = chunkTexts[i];
      const contentHash = sha256(chunkContent);

      const chunk: DocumentChunk = {
        content: chunkContent,
        contentHash,
        sourceFile: filePath,
        sourcePath,
        chunkIndex: i,
        totalChunks,
      };

      // Dedup check: use contentHash as the contentId; upsert in storeContentEmbedding
      // handles re-ingestion of the same chunk naturally.
      const existing = await db.contentEmbedding.findUnique({
        where: {
          contentId_contentType: {
            contentId: contentHash,
            contentType: embeddingContentType,
          },
        },
        select: { id: true },
      });

      if (existing) {
        report.chunksDeduped++;
        console.log(`[batch-ingest]   chunk ${i + 1}/${totalChunks} — deduped (${contentHash.slice(0, 12)}...)`);
        continue;
      }

      if (dryRun) {
        report.chunksStored++;
        console.log(`[batch-ingest]   chunk ${i + 1}/${totalChunks} — would store (dry-run)`);
        continue;
      }

      // Generate embedding and store
      try {
        await storeContentEmbedding(contentHash, embeddingContentType, chunkContent);
        report.chunksStored++;
        console.log(`[batch-ingest]   chunk ${i + 1}/${totalChunks} — stored (${contentHash.slice(0, 12)}...)`);
      } catch (err) {
        report.errors.push({
          file: filePath,
          chunkIndex: i,
          message: `Embedding/storage failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        console.error(`[batch-ingest]   chunk ${i + 1}/${totalChunks} — ERROR: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  report.elapsedMs = Date.now() - startTime;

  console.log(
    `[batch-ingest] Complete. ` +
    `${report.filesProcessed} file(s), ` +
    `${report.chunksStored} stored, ` +
    `${report.chunksDeduped} deduped, ` +
    `${report.errors.length} error(s) ` +
    `(${report.elapsedMs}ms)`,
  );

  return report;
}
