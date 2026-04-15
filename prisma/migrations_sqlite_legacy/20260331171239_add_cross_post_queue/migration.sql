-- CreateTable
CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "primaryTracks" TEXT NOT NULL,
    "forumAffinities" TEXT NOT NULL,
    "knowledgeGaps" TEXT NOT NULL,
    "lastQuestionTime" DATETIME,
    "questionsThisWeek" INTEGER NOT NULL DEFAULT 0,
    "questionsThisMonth" INTEGER NOT NULL DEFAULT 0,
    "totalQuestionsAsked" INTEGER NOT NULL DEFAULT 0,
    "totalAnswersProvided" INTEGER NOT NULL DEFAULT 0,
    "avgConfidenceScore" REAL NOT NULL DEFAULT 0.0,
    "avgUpvoteRatio" REAL NOT NULL DEFAULT 0.0,
    "enrolledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentProfile_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ForumSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "forumId" TEXT NOT NULL,
    "unansweredCount" INTEGER NOT NULL DEFAULT 0,
    "highVoteUnansweredCount" INTEGER NOT NULL DEFAULT 0,
    "avgTimeToFirstAnswer" REAL NOT NULL DEFAULT 0.0,
    "topicHotspots" TEXT NOT NULL,
    "agentCoverageGap" TEXT NOT NULL,
    "healthScore" REAL NOT NULL DEFAULT 0.5,
    "isHighValue" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "ForumSignal_forumId_fkey" FOREIGN KEY ("forumId") REFERENCES "Forum" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ForumSignalRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentProfileId" TEXT NOT NULL,
    "forumSignalId" TEXT NOT NULL,
    "unansweredCount" INTEGER NOT NULL,
    "highVoteUnansweredCount" INTEGER NOT NULL,
    "healthScore" REAL NOT NULL,
    "avgTimeToFirstAnswer" REAL NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForumSignalRecord_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ForumSignalRecord_forumSignalId_fkey" FOREIGN KEY ("forumSignalId") REFERENCES "ForumSignal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionEmbedding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "questionTextHash" TEXT NOT NULL,
    "embedding" TEXT,
    "embeddingModel" TEXT NOT NULL DEFAULT 'ollama-embeddings',
    "dedupKey" TEXT NOT NULL,
    "topicCluster" TEXT,
    "lastSimSearchAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionEmbedding_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SemanticDuplicate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceQuestionId" TEXT NOT NULL,
    "targetQuestionId" TEXT NOT NULL,
    "similarity" REAL NOT NULL,
    "skipReason" TEXT,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SemanticDuplicate_sourceQuestionId_fkey" FOREIGN KEY ("sourceQuestionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SemanticDuplicate_targetQuestionId_fkey" FOREIGN KEY ("targetQuestionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrossPostQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceQuestionId" TEXT NOT NULL,
    "sourceAnswerId" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceForumTag" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "answerText" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "verificationMethod" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "readyAt" DATETIME NOT NULL,
    "chatOverflowPostId" TEXT,
    "sentAt" DATETIME,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastAttemptAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_agentId_key" ON "AgentProfile"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumSignal_forumId_key" ON "ForumSignal"("forumId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionEmbedding_questionId_key" ON "QuestionEmbedding"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionEmbedding_questionTextHash_key" ON "QuestionEmbedding"("questionTextHash");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionEmbedding_dedupKey_key" ON "QuestionEmbedding"("dedupKey");

-- CreateIndex
CREATE INDEX "CrossPostQueue_status_readyAt_idx" ON "CrossPostQueue"("status", "readyAt");

-- CreateIndex
CREATE INDEX "CrossPostQueue_createdAt_idx" ON "CrossPostQueue"("createdAt");

-- CreateIndex
CREATE INDEX "CrossPostQueue_sourceQuestionId_createdAt_idx" ON "CrossPostQueue"("sourceQuestionId", "createdAt");

-- CreateIndex
CREATE INDEX "CrossPostQueue_dedupKey_sourcePlatform_idx" ON "CrossPostQueue"("dedupKey", "sourcePlatform");
