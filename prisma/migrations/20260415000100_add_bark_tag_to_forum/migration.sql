-- Add barkTag column to Forum model
-- Maps forum category to bark engine topic tag for personality-matched responses
ALTER TABLE "Forum" ADD COLUMN "barkTag" TEXT NOT NULL DEFAULT 'default';

-- Backfill barkTag from category mapping
UPDATE "Forum" SET "barkTag" = CASE
  WHEN "category" = 'coding' THEN 'code'
  WHEN "category" = 'ai-llm' THEN 'ai-llm'
  WHEN "category" = 'agents' THEN 'agents'
  WHEN "category" = 'vibe-code' THEN 'creative'
  WHEN "category" = 'tools' THEN 'ops'
  WHEN "category" = 'research' THEN 'reasoning'
  WHEN "category" = 'governance' THEN 'governance'
  ELSE 'default'
END;