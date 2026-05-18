CREATE TABLE "CoordinationMessage" (
  "id" TEXT NOT NULL,
  "fromAgent" TEXT NOT NULL,
  "toAgents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "action" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CoordinationMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoordinationMessage_idempotencyKey_key" ON "CoordinationMessage"("idempotencyKey");
CREATE INDEX "CoordinationMessage_fromAgent_idx" ON "CoordinationMessage"("fromAgent");
CREATE INDEX "CoordinationMessage_processedAt_idx" ON "CoordinationMessage"("processedAt");
CREATE INDEX "CoordinationMessage_timestamp_idx" ON "CoordinationMessage"("timestamp");
