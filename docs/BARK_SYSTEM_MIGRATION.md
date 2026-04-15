# GrumpRolled Bark System – Migration & Deployment Steps

## Executive Summary

The bark system is **code-complete**. All implementation files are ready. To activate it, you need to:

1. **Push schema migrations** (~30 seconds)
2. **Execute seeding** (~10 seconds)
3. **Validate** with smoke tests (~3 minutes)
4. **Deploy** to production

---

## Phase 1: Database Migration (Immediate – 30 seconds)

### Pre-Check

```bash
# Verify Prisma is up to date
npm run db:generate

# Check current state
sqlite3 ./prisma/e2e.db ".tables"
# Should show: Bark, BarkUsageLog (after migration)
```

### Execute Migration

```bash
npm run db:push
```

**Expected output:**

```
✔ Your database is now in sync with your schema. Done in 123ms
```

**What it does:**
- Creates `Bark` table (200 rows pre-seeded schema)
- Creates `BarkUsageLog` table with TTL index
- No data loss (new tables only)

### Verify

```bash
sqlite3 ./prisma/e2e.db "SELECT COUNT(*) as table_count FROM sqlite_master WHERE type='table';"
# Should increase by 2 (Bark + BarkUsageLog)
```

---

## Phase 2: Seed Barks (Immediate – 10 seconds)

### Execute Seeding

```bash
npm run seed:barks
```

**Expected output:**

```
🚀 Seeding GrumpRolled Bark Database...

📝 Inserting 204 barks...

   ✓ Inserted batch 1/5
   ✓ Inserted batch 2/5
   ✓ Inserted batch 3/5
   ✓ Inserted batch 4/5
   ✓ Inserted batch 5/5

✅ SEEDING COMPLETE!

   Total barks: 204
   Barks by tag:
     • ai-llm: 20
     • agents: 20
     • code: 20
     • creative: 20
     • default: 20
     • forum: 20
     • governance: 20
     • math: 20
     • ops: 20
     • reasoning: 20

💡 Next: Try posting a question to /api/v1/llm/answer
```

### Individual Verification

```bash
# Count total barks
sqlite3 ./prisma/e2e.db "SELECT COUNT(*) FROM Bark;" 
# Should return: 204

# Count by tag
sqlite3 ./prisma/e2e.db "SELECT tag, COUNT(*) FROM Bark GROUP BY tag ORDER BY tag;"
# Should show: 20 per tag

# Check if isGenerated flag is false (hand-crafted)
sqlite3 ./prisma/e2e.db "SELECT COUNT(*) FROM Bark WHERE isGenerated=false;"
# Should return: 204
```

---

## Phase 3: Validate & Test (3 minutes)

### 3.1 Lint & Build

```bash
npm run lint
npm run build
```

**Expected:** No errors, green output.

### 3.2 Start Dev Server

```bash
npm run dev
```

Server runs on `http://localhost:3000`

### 3.3 Smoke Test #1: Basic Bark Injection

```bash
# Terminal 2
curl -X POST http://localhost:3000/api/v1/llm/answer \
  -H "Content-Type: application/json" \
  -d '{"question":"How do I debug a Node.js app?","userId":"test-user-001"}' \
  | jq '.answer' | head -3
```

**Expected:** Answer includes a bark prefix/suffix before/after the main answer.

### 3.4 Smoke Test #2: Topic Classification

```bash
# Code question → expect 'code' bark
curl -X POST http://localhost:3000/api/v1/llm/answer \
  -H "Content-Type: application/json" \
  -d '{"question":"How do I optimize a Python function?","userId":"test-user-002"}' \
  | jq '.bark.tag'
# Should return: "code"

# Ops question → expect 'ops' bark
curl -X POST http://localhost:3000/api/v1/llm/answer \
  -H "Content-Type: application/json" \
  -d '{"question":"How do I deploy to Kubernetes?","userId":"test-user-003"}' \
  | jq '.bark.tag'
# Should return: "ops"
```

### 3.5 Smoke Test #3: Never-Repeat Within 24h

```bash
# Ask 5 times with same user → should get 5 different barks (no repeats)
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/v1/llm/answer \
    -H "Content-Type: application/json" \
    -d "{\"question\":\"How do I write a function? (attempt $i)\",\"userId\":\"test-repeat-user\"}" \
    | jq '.bark.id'
done
# All 5 should be unique IDs
```

### 3.6 Verification: Check Response Structure

```bash
curl -X POST http://localhost:3000/api/v1/llm/answer \
  -H "Content-Type: application/json" \
  -d '{"question":"What is machine learning?","userId":"final-test"}' \
  | jq '.' 
```

**Expected fields in response:**
- `question` (your query)
- `answer` (includes bark + signature + factual content)
- `bark` object:
  - `id` (unique identifier)
  - `tag` (topic: default, code, ops, etc.)
  - `mood` (gruff, witty, etc.)
  - `isGenerated` (false = hand-crafted, true = LLM-generated)
- `quality_gate.bark_injected: true`
- All original triple-pass fields (confidence, verification_summary, etc.)

---

## Phase 4: Optional Cleanup & Tuning (5 minutes)

### Clear & Re-seed (if needed)

```bash
npm run seed:barks --clear
```

This drops and recreates all bark entries.

### Add Custom Barks

Edit `src/lib/bark-seed.ts` and add new quips to your favorite topics:

```typescript
export const BARKS_BY_TAG = {
  code: [
    // existing 20 quips...
    "That code is more brittle than wafer cookies.",
    "Your logic is fundamentally sound, but the execution needs work.",
  ],
  // ... other topics
};
```

Then re-seed:

```bash
npm run seed:barks --clear
```

---

## Phase 5: Deploy to Production (Automatic)

### Git Workflow

```bash
git status
# Should show 4-5 modified/new files:
# - src/lib/bark-engine.ts
# - src/lib/bark-seed.ts
# - scripts/seed-barks.mjs
# - prisma/schema.prisma
# - src/app/api/v1/llm/answer/route.ts
# - package.json

git add .
git commit -m "feat: Add GrumpRolled bark system (never-repeating, context-aware quips)"
git push origin main
```

### CI/CD Check

Most CI/CD (GitHub Actions, Vercel, Render, etc.) automatically:
1. Runs `npm run lint` ✅
2. Runs `npm run build` ✅
3. Runs `npm run test` (if applicable) ✅

If any step fails, the deployment stops (safety gate).

### Production Deployment

Once CI passes:
1. GitHub/Vercel/Render auto-deploys to `main` environment
2. Database migrations run via deployment hooks (if configured)
3. New barks available to all users

**⚠️ Important:** Production database migration may need manual approval:

```bash
# If using managed Prisma (Vercel/Render):
# 1. Go to your deployment dashboard
# 2. Run migration command from deployment UI
# 3. Or use Prisma Cloud: https://console.prisma.io

# If using direct database access:
# SSH to production, run:
npm run db:push
npm run seed:barks
```

---

## Rollback (If Needed)

### Revert to Previous Commit

```bash
git revert HEAD
git push origin main
```

This creates a new commit that **undoes** the bark system without deleting code.

### Database Rollback (SQLite)

```bash
# Backup current DB
cp ./prisma/dev.db ./prisma/dev.db.backup

# Reset to pre-bark state
npm run db:reset
```

This deletes ALL data, so be careful. For production, restore from backup.

---

## Monitoring Post-Deployment

### Key Metrics

Track these queries to monitor bark health:

```sql
-- Daily bark usage
SELECT DATE(usedAt) as day, COUNT(*) as barks_used
FROM BarkUsageLog
GROUP BY DATE(usedAt)
ORDER BY day DESC
LIMIT 7;

-- Most-used bark
SELECT bark.text, COUNT(*) as usage_count
FROM BarkUsageLog
JOIN Bark ON BarkUsageLog.barkId = Bark.id
GROUP BY barkId
ORDER BY usage_count DESC
LIMIT 5;

-- Generated vs hand-crafted ratio
SELECT isGenerated, COUNT(*) FROM Bark GROUP BY isGenerated;
```

### Expected Behavior

- **Barks per day:** Should increase as user base grows
- **Most-used barks:** Should rotate (variety = healthy system)
- **Generated barks:** Should start low, increase only if pool exhausted for topic
- **No repeats:** Per-user, within 24h sliding window

---

## FAQ

**Q: Do I need to migrate existing databases?**  
A: Only if you have production data. Dev/test DBs reset cleanly. For production, backup first, then `npm run db:push`.

**Q: What if the seed fails?**  
A: Check:
- Prisma client generated: `npm run db:generate`
- Database file exists: `ls -la ./prisma/dev.db`
- Disk space available: `df -h`

Then retry: `npm run seed:barks`

**Q: Can I test with a different user ID each time?**  
A: Yes. Each `userId` gets its own 24h sliding window. Same userId will never repeat within 24h.

**Q: How many QPS can the bark system handle?**  
A: Should handle 100+ requests/second (disk I/O bottleneck in SQLite at scale). For higher throughput, upgrade to PostgreSQL with connection pooling.

**Q: Can I customize the bark topics?**  
A: Yes. See "Future Enhancements" in [BARK_SYSTEM_IMPLEMENTATION.md](BARK_SYSTEM_IMPLEMENTATION.md).

**Q: TTS is showing 404 errors. What's wrong?**  
A: See [TTS_INTEGRATION_GUIDE.md](TTS_INTEGRATION_GUIDE.md) — Mimic 3 service might not be running or CORS misconfigured.

---

## Handoff Checklist

Before declaring the bark system "production-ready," verify:

- [ ] Database migrations applied
- [ ] 204 barks seeded successfully
- [ ] 5 smoke tests pass (bark injection, topic classification, never-repeat)
- [ ] Lint & build green
- [ ] Commit pushed to main
- [ ] CI/CD pipeline green
- [ ] Manual testing on production (curl endpoint)
- [ ] Bark metadata visible in response
- [ ] Signature appended correctly
- [ ] No regressions to existing triple-pass answer logic

---

## Next Steps

Once bark system is live:

1. **Monitor** – Track bark usage and diversity (queries above)
2. **Iterate** – Add new bark topics, refine topic classification
3. **Voice** – Optionally add TTS (see [TTS_INTEGRATION_GUIDE.md](TTS_INTEGRATION_GUIDE.md))
4. **Analytics** – Build dashboard to visualize bark usage
5. **User Feedback** – Collect user reactions, upvote/downvote barks

---

**Status: READY FOR DEPLOYMENT** ✅

All code complete. Follow the steps above to activate the bark system in your environment.

Questions? See [BARK_SYSTEM_IMPLEMENTATION.md](BARK_SYSTEM_IMPLEMENTATION.md) for deep technical details.
