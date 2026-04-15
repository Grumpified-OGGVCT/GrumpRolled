# GrumpRolled Bark System – Complete Implementation Guide

## Overview

You now have a **charismatic, never-repeating agent personality system** that:

✅ **Never repeats** – Barks tracked per-user with 24h sliding window  
✅ **Context-aware** – Topic classification (code, ops, ai-llm, agents, forum, etc.)  
✅ **Dynamic fallback** – LLM generates fresh barks if pool exhausted  
✅ **Signature style** – Gruff drill-sergeant tone, witty but truthful  
✅ **Integrated** – Injected into every LLM answer response  
✅ **Optional voice** – Custom TTS with your own voice (Mimic 3 guide included)  

---

## Architecture at a Glance

```
User Question
    ↓
/api/v1/llm/answer (POST)
    ↓
answerWithTriplePass() [fact-first, web search, verification]
    ↓
selectBark(userId, question) [topic-aware, never-repeating]
    ↓
injectBark(answer, bark) [random prefix/suffix]
    ↓
GRUMPIFIED_SIGNATURE appended
    ↓
Response + bark metadata (for analytics)
```

---

## Files Created/Modified

### New Files

| File | Purpose |
|------|---------|
| `src/lib/bark-engine.ts` | Core bark system: selection, injection, dynamic generation |
| `src/lib/bark-seed.ts` | 200+ hand-crafted quips by topic (default, code, ops, ai-llm, agents, forum, reasoning, math, creative, governance) |
| `scripts/seed-barks.mjs` | Seed script to populate database |
| `docs/TTS_INTEGRATION_GUIDE.md` | Complete Mimic 3 TTS setup (voice recording → deployment) |
| `docs/BARK_SYSTEM_IMPLEMENTATION.md` | This file |

### Modified Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `Bark` model + `BarkUsageLog` for tracking |
| `src/app/api/v1/llm/answer/route.ts` | Integrated bark selection + injection into response pipeline |
| `package.json` | Added `seed:barks` script |

---

## Quick Start (5 min)

### Step 1: Push Database Migrations

```bash
npm run db:push
```

This creates the `Bark` and `BarkUsageLog` tables.

### Step 2: Seed Barks (200+ quips)

```bash
npm run seed:barks
```

You should see:

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
     • default: 20
     • code: 20
     • ops: 20
     • ai-llm: 20
     • agents: 20
     • creative: 20
     • forum: 20
     • governance: 20
     • math: 20
     • reasoning: 20
```

### Step 3: Test the LLM Answer Endpoint

```bash
npm run dev
```

Then in another terminal:

```bash
curl -X POST http://localhost:3000/api/v1/llm/answer \
  -H "Content-Type: application/json" \
  -d '{"question":"How do I optimize a Python function?","userId":"test-user-123"}'
```

**Expected response:**

```json
{
  "question": "How do I optimize a Python function?",
  "answer": "Your function is about as clean as a mud-run in a hurricane.\n\nTo optimize a Python function, focus on: [factual answer from Ollama]...\n\n— GrumpRolled, at your (digital) service",
  "bark": {
    "id": "clu...",
    "tag": "code",
    "mood": "gruff",
    "isGenerated": false
  },
  ...
}
```

**Note:** The bark appears randomly before or after the answer for variety.

---

## System Design Deep Dive

### 1. Topic Classification (bark-engine.ts)

The `classifyQuestionTag()` function uses keyword matching to categorize questions:

```typescript
export function classifyQuestionTag(question: string): BarkTag {
  const lowerQ = question.toLowerCase();

  if (/\b(function|class|variable|method|loop|array|object|module)\b/i.test(lowerQ)) {
    return 'code';
  }
  if (/\b(deploy|docker|kubernetes|devops|ci\/cd)\b/i.test(lowerQ)) {
    return 'ops';
  }
  // ... more tags
  return 'default';
}
```

**Expandable:** You can:
- Add new tags (e.g., 'database', 'mobile', 'frontend')
- Use semantic embeddings for more nuanced classification
- Integrate with your forum category system

### 2. Bark Selection Algorithm

```
1. Classify question → tag (e.g., 'code')
2. Fetch all barks for tag
3. Fetch user's recent barks (last 24 h)
4. Find candidates = all - recent
5. If empty: generate dynamic bark (LLM)
6. Else: pick random from candidates
7. Log usage with 24h TTL
```

**Why this approach?**
- **Never repeats:** 24h sliding window prevents fatigue
- **Per-user tracking:** Different users see different barks immediately
- **Graceful degradation:** Falls back to dynamic generation if pool exhausted
- **Analytics-ready:** Every bark logged for insights

### 3. Dynamic Bark Generation (Fallback)

When the pre-seeded pool for a topic is exhausted:

```typescript
async function generateDynamicBark(question: string, tag: BarkTag) {
  const model = await selectBestModel([]);
  
  const systemPrompt = `You are GrumpRolled's bark generator. 
  Write a SHORT (≤30 word), original, mildly insulting but good-natured bark 
  that fits the topic "${tag}"...`;
  
  const response = await chatCompletion(model.model, messages);
  
  // Save to DB for reuse (becomes pre-seeded for next time)
  const newBark = await db.bark.create({
    data: { text: response, tag, isGenerated: true, ... }
  });
  
  return newBark;
}
```

**This means:**
- Generated barks are stored and reused (same uniqueness guarantees)
- Your bark pool grows dynamically over time
- Each unique question potentially adds a new quip

### 4. Injection into Response

The bark is randomly positioned (prefix or suffix) for natural variation:

```typescript
export function injectBark(answer: string, bark: SelectedBark, placement: 'random' = 'random'): string {
  const actualPlacement = placement === 'random' ? (Math.random() < 0.5 ? 'prefix' : 'suffix') : placement;
  
  if (actualPlacement === 'prefix') {
    return `${bark.text}\n\n${answer}`;
  } else {
    return `${answer}\n\n${bark.text}`;
  }
}
```

**Why random placement?**
- Avoids predictable pattern
- Keeps readers engaged
- Feels more natural (like a coach coaching, not a script reading)

### 5. Signature for Brand Continuity

```typescript
export const GRUMPIFIED_SIGNATURE = '\n— GrumpRolled, at your (digital) service';
```

Always appended to remind users of the personality and reinforce the brand.

---

## Configuration & Tuning

### Adjust Bark Text Length

In `bark-engine.ts`, search for "≤ 30 word" comments and adjust:

```typescript
const systemPrompt = `... Write a SHORT (≤20 word), original bark ...`
```

Shorter = punchier; longer = more context.

### Add New Topic Tags

1. **Add to `BarkTag` type** (`bark-engine.ts`):
   ```typescript
   export type BarkTag = 'default' | 'code' | '... | 'newTopic';
   ```

2. **Add keyword patterns** in `classifyQuestionTag()`:
   ```typescript
   if (/\b(keyword1|keyword2|keyword3)\b/i.test(lowerQ)) {
     return 'newTopic';
   }
   ```

3. **Add quips** in `bark-seed.ts`:
   ```typescript
   export const BARKS_BY_TAG = {
     // ... existing
     newTopic: [
       "Your approach is half-baked.",
       "That idea has merit.",
       // ... 20+ more quips
     ]
   };
   ```

4. **Re-seed:**
   ```bash
   npm run seed:barks --clear
   ```

### Adjust Sliding Window (24h TTL)

In `selectBark()`, change the time window:

```typescript
const cutoffTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days instead of 24h
```

Longer windows = fewer repeats, but users wait longer to see variety.

### Disable Dynamic Generation (Use Pre-seeded Only)

In `selectBark()`, comment out the fallback:

```typescript
if (candidates.length === 0) {
  // return generateDynamicBark(question, tag);
  return pickRandomBark(allBarks, userId); // Fallback to any tag
}
```

Useful for predictability or to avoid LLM cost.

---

## Analytics & Monitoring

### Query: Most-Used Barks

```sql
SELECT bark.text, bark.tag, COUNT(*) as usage_count
FROM BarkUsageLog
GROUP BY barkId
ORDER BY usage_count DESC
LIMIT 20;
```

### Query: Least-Used Barks (Candidates for Removal)

```sql
SELECT bark.text, COUNT(*) as usage_count
FROM Bark
LEFT JOIN BarkUsageLog ON Bark.id = BarkUsageLog.barkId
GROUP BY barkId
HAVING usage_count < 5
ORDER BY usage_count ASC;
```

### Query: Usage Trend (Last 7 Days)

```sql
SELECT 
  DATE(usedAt) as day,
  COUNT(*) as daily_barks,
  COUNT(DISTINCT userId) as unique_users
FROM BarkUsageLog
WHERE usedAt >= datetime('now', '-7 days')
GROUP BY DATE(usedAt)
ORDER BY day DESC;
```

### Dashboard Idea

Track:
- Barks per tag (distribution)
- Most-used bark (brand recognition)
- Dynamic bark generation frequency (indicates pool exhaustion for tag)
- Average barks per user session

---

## Optional: Custom Voice (TTS Integration)

See [TTS_INTEGRATION_GUIDE.md](TTS_INTEGRATION_GUIDE.md) for complete setup.

**TL;DR:**
1. Record 5–10 min of your voice (~20 clips)
2. Train Mimic 3 model (30 min on CPU, 5 min on GPU)
3. Deploy to Render/Fly/Railway (free tier sufficient)
4. Wire to frontend with `src/lib/tts-client.ts`
5. Add "Speak Answer" button

**Result:** Barks + answers spoken in your actual voice. 🎤

---

## Testing Checklist

- [ ] Database migrations applied (`npm run db:push`)
- [ ] Barks seeded successfully (`npm run seed:barks`)
- [ ] `POST /api/v1/llm/answer` returns response with bark
- [ ] Bark metadata included in response
- [ ] Bark never repeats in next 5 requests (same user)
- [ ] Different users see different barks immediately
- [ ] Bark topic matches question category (spot-check)
- [ ] Answer is factually correct (triple-pass verification still works)
- [ ] Signature appended to every response
- [ ] Build passes (`npm run build`)
- [ ] Lint passes (`npm run lint`)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Seed script fails** | Check Prisma is generated: `npm run db:generate`. Ensure DB is running. |
| **All responses get "default" bark** | Check `classifyQuestionTag()` keywords. Add more patterns. |
| **Bark repeats** | Verify `BarkUsageLog` table exists. Check TTL expiration logic (24h calculation). |
| **Circular import error** | Move LLM imports inside function (`await import()`) to avoid circular deps. |
| **LLM bark generation is slow** | Fall back to pre-seeded only (see config section above). |
| **Responses don't include bark** | Check middleware exports are correct. Verify `OllamaChatMessage` type matches. |

---

## Future Enhancements

1. **Mood-aware barks** – Track user sentiment, adjust harshness dynamically
2. **User preferences** – Let users set bark frequency (always, sometimes, never)
3. **Bark voting** – Users upvote/downvote barks; trending barks surface higher
4. **Multi-language barks** – Translate quips for international users
5. **Seasonal themes** – Holiday-specific barks (Christmas, New Year, etc.)
6. **Integration with Skill system** – Bark when user needs help with installed skill
7. **Persistent bark history** – Users can review all barks they've received
8. **A/B testing** – Compare bark effectiveness via engagement metrics

---

## Related Documentation

- [TTS_INTEGRATION_GUIDE.md](TTS_INTEGRATION_GUIDE.md) – Voice synthesis setup
- [Prism Schema](../prisma/schema.prisma) – Bark + BarkUsageLog models
- [/src/lib/bark-engine.ts](../src/lib/bark-engine.ts) – Core implementation
- [/src/lib/bark-seed.ts](../src/lib/bark-seed.ts) – Quip library

---

## Questions?

If bark generation fails or topics aren't classifying correctly:

1. Check logs: `npm run dev` with `console.log()` in `classifyQuestionTag()`
2. Verify database: `sqlite3 ./prisma/e2e.db "SELECT COUNT(*) FROM Bark;"`
3. Add debug endpoint: Create `GET /api/v1/debug/bark-classify?q=<question>`

---

**Happy grumping! May your barks be ever witty and your answers ever truthful.** 🚀

— The GrumpRolled Team
