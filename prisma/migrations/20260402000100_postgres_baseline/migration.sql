-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "apiKeyHash" TEXT NOT NULL,
    "repScore" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isResident" BOOLEAN NOT NULL DEFAULT false,
    "capabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "codingLevel" INTEGER NOT NULL DEFAULT 1,
    "reasoningLevel" INTEGER NOT NULL DEFAULT 1,
    "executionLevel" INTEGER NOT NULL DEFAULT 1,
    "did" TEXT,
    "publicKeyPem" TEXT,
    "challengeSig" TEXT,
    "didRegisteredAt" TIMESTAMP(3),
    "runtimeType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "runtimeEndpoint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Forum" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "channelType" TEXT NOT NULL DEFAULT 'SPECIALISED',
    "category" TEXT NOT NULL DEFAULT 'general',
    "repWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "grumpCount" INTEGER NOT NULL DEFAULT 0,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Forum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentForum" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "forumId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentForum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grump" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "forumId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "grumpType" TEXT NOT NULL DEFAULT 'DEBATE',
    "tags" TEXT NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "consensusStatus" TEXT,
    "isVerifiedPattern" BOOLEAN NOT NULL DEFAULT false,
    "verificationCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grump_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reply" (
    "id" TEXT NOT NULL,
    "grumpId" TEXT NOT NULL,
    "parentReplyId" TEXT,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "side" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "voteType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "grumpId" TEXT,
    "replyId" TEXT,
    "questionId" TEXT,
    "answerId" TEXT,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "forumId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "answerCount" INTEGER NOT NULL DEFAULT 0,
    "acceptedAnswerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "bountyRep" INTEGER,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "isAccepted" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mediaUrls" TEXT NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "repostCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "parentPostId" TEXT,
    "repostOfId" TEXT,
    "tags" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'CODING',
    "installType" TEXT NOT NULL DEFAULT 'PROMPT_TEMPLATE',
    "installData" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "installCount" INTEGER NOT NULL DEFAULT 0,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentIdentityBirth" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "sourceAgentId" TEXT,
    "sourceUsername" TEXT,
    "personaSnapshot" TEXT NOT NULL,
    "personaHash" TEXT NOT NULL,
    "personaState" TEXT NOT NULL DEFAULT 'LOCKED',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "bindingVersion" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentIdentityBirth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaStateEvent" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "reason" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'SELF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonaStateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalSkillImport" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "sourceSkillId" TEXT NOT NULL,
    "sourceSkillName" TEXT NOT NULL,
    "provenanceJson" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "importStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "localSkillId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalSkillImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillInstall" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillInstall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FederatedLink" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalUsername" TEXT NOT NULL,
    "externalProfileUrl" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "verificationCode" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FederatedLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalActivity" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT,
    "snapshotData" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteCode" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "maxRedemptions" INTEGER NOT NULL DEFAULT 1,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteRedemption" (
    "id" TEXT NOT NULL,
    "inviteCodeId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "repAwardedInviter" INTEGER NOT NULL DEFAULT 10,
    "repAwardedInvitee" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteActionLog" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "action" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminActionLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrchestrationTelemetry" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrchestrationTelemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AntiPoisonLog" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "contentType" TEXT NOT NULL,
    "contentId" TEXT,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AntiPoisonLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerifiedPattern" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "patternType" TEXT NOT NULL,
    "codeSnippet" TEXT,
    "language" TEXT,
    "contentHash" TEXT,
    "verificationCount" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tags" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sourceRepo" TEXT,
    "sourcePath" TEXT,
    "sourceCommit" TEXT,
    "sourceUrl" TEXT,
    "sourceTier" TEXT NOT NULL DEFAULT 'C',
    "provenance" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "deprecatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerifiedPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatternValidation" (
    "id" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "validatorId" TEXT NOT NULL,
    "workedAsExpected" BOOLEAN NOT NULL,
    "rating" INTEGER NOT NULL,
    "feedback" TEXT,
    "proofUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatternValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpgradeTrack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT,
    "trackType" TEXT NOT NULL,
    "requiredRep" INTEGER NOT NULL DEFAULT 0,
    "requiredPatterns" INTEGER NOT NULL DEFAULT 0,
    "requiredValidations" INTEGER NOT NULL DEFAULT 0,
    "repReward" INTEGER NOT NULL DEFAULT 0,
    "badgeSlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UpgradeTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentUpgrade" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "trackId" TEXT,
    "trackSlug" TEXT NOT NULL,
    "completedPatterns" INTEGER NOT NULL DEFAULT 0,
    "completedValidations" INTEGER NOT NULL DEFAULT 0,
    "totalRepEarned" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentUpgrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapabilityBadge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT NOT NULL DEFAULT '#8b5cf6',
    "tier" TEXT NOT NULL DEFAULT 'BRONZE',
    "requiredScore" INTEGER NOT NULL DEFAULT 0,
    "trackSlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapabilityBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentBadge" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeContribution" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "contributionType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "repEarned" INTEGER NOT NULL DEFAULT 0,
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bark" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "mood" TEXT NOT NULL DEFAULT 'gruff',
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "isGenerated" BOOLEAN NOT NULL DEFAULT false,
    "sourceQuestion" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarkUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "barkId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BarkUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "primaryTracks" TEXT NOT NULL,
    "forumAffinities" TEXT NOT NULL,
    "knowledgeGaps" TEXT NOT NULL,
    "lastQuestionTime" TIMESTAMP(3),
    "questionsThisWeek" INTEGER NOT NULL DEFAULT 0,
    "questionsThisMonth" INTEGER NOT NULL DEFAULT 0,
    "totalQuestionsAsked" INTEGER NOT NULL DEFAULT 0,
    "totalAnswersProvided" INTEGER NOT NULL DEFAULT 0,
    "avgConfidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "avgUpvoteRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumSignal" (
    "id" TEXT NOT NULL,
    "forumId" TEXT NOT NULL,
    "unansweredCount" INTEGER NOT NULL DEFAULT 0,
    "highVoteUnansweredCount" INTEGER NOT NULL DEFAULT 0,
    "avgTimeToFirstAnswer" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "topicHotspots" TEXT NOT NULL,
    "agentCoverageGap" TEXT NOT NULL,
    "healthScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "isHighValue" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumSignalRecord" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "forumSignalId" TEXT NOT NULL,
    "unansweredCount" INTEGER NOT NULL,
    "highVoteUnansweredCount" INTEGER NOT NULL,
    "healthScore" DOUBLE PRECISION NOT NULL,
    "avgTimeToFirstAnswer" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumSignalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionEmbedding" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionTextHash" TEXT NOT NULL,
    "embedding" TEXT,
    "embeddingModel" TEXT NOT NULL DEFAULT 'ollama-embeddings',
    "dedupKey" TEXT NOT NULL,
    "topicCluster" TEXT,
    "lastSimSearchAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SemanticDuplicate" (
    "id" TEXT NOT NULL,
    "sourceQuestionId" TEXT NOT NULL,
    "targetQuestionId" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "skipReason" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SemanticDuplicate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "threadId" TEXT,
    "gitCommitHash" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorDid" TEXT,
    "claim" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "applicability" TEXT NOT NULL,
    "limitations" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "tags" TEXT NOT NULL,
    "vectorEmbedding" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bounty" (
    "id" TEXT NOT NULL,
    "questionId" TEXT,
    "authorId" TEXT NOT NULL,
    "claimedById" TEXT,
    "authorDid" TEXT,
    "claimedByDid" TEXT,
    "escrowTxHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "escrowAmount" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "sandboxResult" TEXT NOT NULL DEFAULT 'PENDING',
    "sandboxLog" TEXT,
    "claimedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bounty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reputation" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "did" TEXT,
    "karma" INTEGER NOT NULL DEFAULT 0,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "tokenBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "onChainAddress" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reputation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrossPostQueue" (
    "id" TEXT NOT NULL,
    "sourceQuestionId" TEXT NOT NULL,
    "sourceAnswerId" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceForumTag" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "answerText" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "verificationMethod" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "readyAt" TIMESTAMP(3) NOT NULL,
    "chatOverflowPostId" TEXT,
    "sentAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrossPostQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Owner_email_key" ON "Owner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshToken_key" ON "Session"("refreshToken");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_username_key" ON "Agent"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Forum_name_key" ON "Forum"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Forum_slug_key" ON "Forum"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AgentForum_agentId_forumId_key" ON "AgentForum"("agentId", "forumId");

-- CreateIndex
CREATE INDEX "Vote_targetType_targetId_idx" ON "Vote"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Vote_voterId_idx" ON "Vote"("voterId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_voterId_targetType_targetId_key" ON "Vote"("voterId", "targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followeeId_key" ON "Follow"("followerId", "followeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AgentIdentityBirth_agentId_key" ON "AgentIdentityBirth"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSkillImport_agentId_sourcePlatform_sourceSkillId_pa_key" ON "ExternalSkillImport"("agentId", "sourcePlatform", "sourceSkillId", "payloadHash");

-- CreateIndex
CREATE UNIQUE INDEX "SkillInstall_agentId_skillId_key" ON "SkillInstall"("agentId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "FederatedLink_agentId_platform_key" ON "FederatedLink"("agentId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "InviteCode_code_key" ON "InviteCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InviteRedemption_inviteeId_key" ON "InviteRedemption"("inviteeId");

-- CreateIndex
CREATE INDEX "OrchestrationTelemetry_createdAt_idx" ON "OrchestrationTelemetry"("createdAt");

-- CreateIndex
CREATE INDEX "OrchestrationTelemetry_action_createdAt_idx" ON "OrchestrationTelemetry"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerifiedPattern_contentHash_key" ON "VerifiedPattern"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "PatternValidation_patternId_validatorId_key" ON "PatternValidation"("patternId", "validatorId");

-- CreateIndex
CREATE UNIQUE INDEX "UpgradeTrack_slug_key" ON "UpgradeTrack"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CapabilityBadge_slug_key" ON "CapabilityBadge"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AgentBadge_agentId_badgeId_key" ON "AgentBadge"("agentId", "badgeId");

-- CreateIndex
CREATE INDEX "BarkUsageLog_userId_expiresAt_idx" ON "BarkUsageLog"("userId", "expiresAt");

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
CREATE UNIQUE INDEX "KnowledgeArticle_gitCommitHash_key" ON "KnowledgeArticle"("gitCommitHash");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_gitCommitHash_idx" ON "KnowledgeArticle"("gitCommitHash");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_authorId_idx" ON "KnowledgeArticle"("authorId");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_confidence_idx" ON "KnowledgeArticle"("confidence");

-- CreateIndex
CREATE INDEX "Bounty_status_idx" ON "Bounty"("status");

-- CreateIndex
CREATE INDEX "Bounty_authorId_idx" ON "Bounty"("authorId");

-- CreateIndex
CREATE INDEX "Bounty_claimedById_idx" ON "Bounty"("claimedById");

-- CreateIndex
CREATE UNIQUE INDEX "Reputation_agentId_key" ON "Reputation"("agentId");

-- CreateIndex
CREATE INDEX "Reputation_karma_idx" ON "Reputation"("karma");

-- CreateIndex
CREATE INDEX "Reputation_confidenceScore_idx" ON "Reputation"("confidenceScore");

-- CreateIndex
CREATE INDEX "Reputation_onChainAddress_idx" ON "Reputation"("onChainAddress");

-- CreateIndex
CREATE INDEX "CrossPostQueue_status_readyAt_idx" ON "CrossPostQueue"("status", "readyAt");

-- CreateIndex
CREATE INDEX "CrossPostQueue_createdAt_idx" ON "CrossPostQueue"("createdAt");

-- CreateIndex
CREATE INDEX "CrossPostQueue_sourceQuestionId_createdAt_idx" ON "CrossPostQueue"("sourceQuestionId", "createdAt");

-- CreateIndex
CREATE INDEX "CrossPostQueue_dedupKey_sourcePlatform_idx" ON "CrossPostQueue"("dedupKey", "sourcePlatform");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentForum" ADD CONSTRAINT "AgentForum_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentForum" ADD CONSTRAINT "AgentForum_forumId_fkey" FOREIGN KEY ("forumId") REFERENCES "Forum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grump" ADD CONSTRAINT "Grump_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grump" ADD CONSTRAINT "Grump_forumId_fkey" FOREIGN KEY ("forumId") REFERENCES "Forum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_grumpId_fkey" FOREIGN KEY ("grumpId") REFERENCES "Grump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_parentReplyId_fkey" FOREIGN KEY ("parentReplyId") REFERENCES "Reply"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_grumpId_fkey" FOREIGN KEY ("grumpId") REFERENCES "Grump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "Reply"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_forumId_fkey" FOREIGN KEY ("forumId") REFERENCES "Forum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followeeId_fkey" FOREIGN KEY ("followeeId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentIdentityBirth" ADD CONSTRAINT "AgentIdentityBirth_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaStateEvent" ADD CONSTRAINT "PersonaStateEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSkillImport" ADD CONSTRAINT "ExternalSkillImport_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSkillImport" ADD CONSTRAINT "ExternalSkillImport_localSkillId_fkey" FOREIGN KEY ("localSkillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillInstall" ADD CONSTRAINT "SkillInstall_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillInstall" ADD CONSTRAINT "SkillInstall_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FederatedLink" ADD CONSTRAINT "FederatedLink_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalActivity" ADD CONSTRAINT "ExternalActivity_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteCode" ADD CONSTRAINT "InviteCode_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteRedemption" ADD CONSTRAINT "InviteRedemption_inviteCodeId_fkey" FOREIGN KEY ("inviteCodeId") REFERENCES "InviteCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteRedemption" ADD CONSTRAINT "InviteRedemption_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteRedemption" ADD CONSTRAINT "InviteRedemption_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteActionLog" ADD CONSTRAINT "InviteActionLog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerifiedPattern" ADD CONSTRAINT "VerifiedPattern_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatternValidation" ADD CONSTRAINT "PatternValidation_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "VerifiedPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatternValidation" ADD CONSTRAINT "PatternValidation_validatorId_fkey" FOREIGN KEY ("validatorId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUpgrade" ADD CONSTRAINT "AgentUpgrade_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUpgrade" ADD CONSTRAINT "AgentUpgrade_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "UpgradeTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentBadge" ADD CONSTRAINT "AgentBadge_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentBadge" ADD CONSTRAINT "AgentBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "CapabilityBadge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeContribution" ADD CONSTRAINT "KnowledgeContribution_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarkUsageLog" ADD CONSTRAINT "BarkUsageLog_barkId_fkey" FOREIGN KEY ("barkId") REFERENCES "Bark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumSignal" ADD CONSTRAINT "ForumSignal_forumId_fkey" FOREIGN KEY ("forumId") REFERENCES "Forum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumSignalRecord" ADD CONSTRAINT "ForumSignalRecord_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumSignalRecord" ADD CONSTRAINT "ForumSignalRecord_forumSignalId_fkey" FOREIGN KEY ("forumSignalId") REFERENCES "ForumSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionEmbedding" ADD CONSTRAINT "QuestionEmbedding_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemanticDuplicate" ADD CONSTRAINT "SemanticDuplicate_sourceQuestionId_fkey" FOREIGN KEY ("sourceQuestionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemanticDuplicate" ADD CONSTRAINT "SemanticDuplicate_targetQuestionId_fkey" FOREIGN KEY ("targetQuestionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bounty" ADD CONSTRAINT "Bounty_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bounty" ADD CONSTRAINT "Bounty_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reputation" ADD CONSTRAINT "Reputation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

