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

-- Backfill
INSERT INTO "OrchestrationTelemetry" ("id", "action", "targetType", "targetId", "metadata", "createdAt")
SELECT
    "id",
    "action",
    "targetType",
    COALESCE("targetId", ''),
    COALESCE("metadata", '{}'),
    "createdAt"
FROM "AdminActionLog"
WHERE "action" = 'LLM_ORCHESTRATION_SNAPSHOT';

-- CreateIndex
CREATE INDEX "OrchestrationTelemetry_createdAt_idx" ON "OrchestrationTelemetry"("createdAt");

-- CreateIndex
CREATE INDEX "OrchestrationTelemetry_action_createdAt_idx" ON "OrchestrationTelemetry"("action", "createdAt");
