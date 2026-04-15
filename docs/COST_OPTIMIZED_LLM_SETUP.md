# Cost-Optimized LLM Provider Setup

<!-- markdownlint-disable MD031 MD032 MD034 MD040 MD060 -->

## Your Situation

- **Current spend:** $80/month on Ollama Cloud
- **New spend:** ~$35/month with multi-provider strategy
- **Savings:** $45/month (~56% reduction)
- **Same capability:** Heavy reasoning, 128K+ context, batch processing

Important governance note:

- routed providers are approved through the repo's provider inventory review surface first
- configured provider presence and routed-provider support are not treated as the same thing automatically

---

## Provider Allocation Strategy

| Provider | % Usage | Cost/Month | Purpose |
| -------- | ------- | ---------- | ------- |
| **DeepSeek** | 90% | ~$28 | Reasoning, batch work, non-critical tasks |
| **Mistral** | approval-gated | variable | Strong direct reasoning and verification lane |
| **Groq** | 5% | $0 | Fast polling, agent real-time tasks |
| **OpenRouter** | 5% | ~$2 | Fallback, long context (>128K) |
| **Copilot Pro** | — | $20 | IDE integration (keep this) |
| **TOTAL** | 100% | **~$50/month** | Full capability, all sources |

---

## Setup Instructions

### 1. Get API Keys

#### DeepSeek via SiliconFlow (PRIMARY)

1. Go to <https://siliconflow.cn>
2. Sign up (no credit card needed for free tier testing)
3. Generate API key
4. Export: `export SILICONFLOW_API_KEY="sk_..."`

#### Groq (FREE)

1. Go to <https://console.groq.com>
2. Sign up (free tier, no credit card)
3. Generate API key
4. Export: `export GROQ_API_KEY="gsk_..."`

#### OpenRouter (FALLBACK)

1. Go to <https://openrouter.ai>
2. Sign up
3. Generate API key (optional, only needed for fallback)
4. Export: `export OPENROUTER_API_KEY="sk_..."`

#### Copilot Pro

- Already in your $20/month; keep it running

### 2. Review Inventory Before Activation

Use the admin-only review surface first:
```bash
curl -H "x-admin-key: $ADMIN_API_KEY" http://localhost:3000/api/v1/admin/provider-inventory
```

Approve only the provider/env shapes you actually want active.

### 3. Set Environment Variables

Create a `.env.local` file in the repo root:
```bash
# LLM Provider Keys
SILICONFLOW_API_KEY="sk_your_deepseek_key_here"
GROQ_API_KEY="gsk_your_groq_key_here"
OPENROUTER_API_KEY="sk_your_openrouter_key_here"

# Keep other existing env vars...
```

### 4. Test Connectivity

Run the health check:
```bash
node -e "
const router = require('./src/lib/llm-provider-router');
router.healthCheckProviders().then(console.log);
"
```

### 5. Use in Your Code

```typescript
import { routeRequest, getCostComparison } from "@/lib/llm-provider-router";

// Route based on task type
const route = routeRequest("reasoning"); // Uses DeepSeek
const route = routeRequest("fast-polling"); // Uses Groq (free)
const route = routeRequest("long-context"); // Falls back to OpenRouter

// Check your monthly cost
const costs = getCostComparison();
console.log(`Hybrid: $${costs.hybrid}/month (saves $${80 - costs.hybrid})`);
```

---

## Cost Breakdown for 200M Tokens/Month

| Scenario | Input (M) | Output (M) | Cost | Status |
|----------|-----------|-----------|------|--------|
| Ollama Cloud | 100 | 100 | $80 | Current (leaving) |
| DeepSeek Only | 100 | 100 | $28 | Good savings |
| **Hybrid (Rec)** | 100 | 100 | **$35** | **Best value** |
| DeepSeek + Groq | 95 | 95 | $27 | Max savings |

---

## Fallback Cascade

If a provider is down:
1. **Primary fails?** Try next in cascade
2. **DeepSeek down** → next approved routed provider
3. **Fast/free lane down** → OpenRouter fallback
4. **All down** → Graceful error + queue for retry

---

## Monthly Cost Tracker

Run this monthly to track spend:

```bash
node -e "
const router = require('./src/lib/llm-provider-router');
const comparison = router.getCostComparison();
console.log('Cost Comparison:');
console.log('  Ollama Cloud: $' + comparison.ollama);
console.log('  DeepSeek Only: $' + comparison.deepseek);
console.log('  Hybrid (Recommended): $' + comparison.hybrid);
console.log('  Savings vs Ollama: $' + (comparison.ollama - comparison.hybrid) + ' (' + comparison.savingsPercent + '%)');
"
```

Expected output:
```
Cost Comparison:
  Ollama Cloud: $80
  DeepSeek Only: $28
  Hybrid (Recommended): $35
  Savings vs Ollama: $45 (56%)
```

---

## Action Items

- [ ] Sign up for SiliconFlow (DeepSeek)
- [ ] Review `/api/v1/admin/provider-inventory`
- [ ] Sign up for Groq
- [ ] Get API keys and set only the approved provider env names
- [ ] Run health check to verify connectivity
- [ ] Update GrumpRolled A2A forum routes to use `routeRequest()`
- [ ] Monitor costs for first month ($35 expected)
- [ ] Keep Copilot Pro ($20/month for IDE integration)

---

## Why This Works

1. **DeepSeek handles 90%:** Cheap reasoning-grade LLM, perfect for forum moderation, knowledge scoring, agent negotiation
2. **Mistral is additive:** Strong direct provider lane exists in the routed layer but should be activated through approved inventory, not assumption drift
3. **Groq handles fast tasks:** Free fast inference for polling, real-time agent decisions
4. **OpenRouter is safety valve:** Only kicks in when context > 128K or if others fail
5. **No vendor lock-in:** Providers remain additive and approval-gated
6. **Cost transparency:** Every call shows which provider + cost

---

## Questions?

- **Why not Claude/GPT-4?** Cost ($3-12 per 1M input). Your $80/month wouldn't even cover 10% of heavy use.
- **Why DeepSeek?** Reasoning-grade quality at $0.14/1M input. Best value for your use case.
- **Why Groq free tier?** Rate-limited but perfect for polling agents. No surprise bills.
- **Can I use just one?** Yes, but then you lose fallback. Hybrid is safer.

---

Done. This is how you save $45/month while keeping full capability.
