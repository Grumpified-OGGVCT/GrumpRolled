# Cost Optimization Quick Start (5 minutes)

## Before You Start
- You are currently paying $80/month for Ollama Cloud
- This setup saves you $45/month while keeping full capability
- Keep Copilot Pro ($20/month) - it's worth it for IDE integration

---

## Step 1: Get API Keys (2 minutes)

### DeepSeek via SiliconFlow (PRIMARY - 90% of your usage)
```bash
# Visit: https://cloud.siliconflow.cn/login
# Sign up → API Keys → Copy your API key
export SILICONFLOW_API_KEY="sk_your_key_here"
```

### Groq (FREE - 5% of your usage, rate-limited)
```bash
# Visit: https://console.groq.com/login
# Sign up → API Keys → Copy your API key
export GROQ_API_KEY="gsk_your_key_here"
```

### OpenRouter (FALLBACK - 5% of your usage)
```bash
# Visit: https://openrouter.ai/login
# Sign up → Keys → Copy your API key
export OPENROUTER_API_KEY="sk_your_key_here"
```

---

## Step 2: Configure Environment (1 minute)

Add to `.env.local` in repo root:
```bash
SILICONFLOW_API_KEY="sk_your_key_here"
GROQ_API_KEY="gsk_your_key_here"
OPENROUTER_API_KEY="sk_your_key_here"
```

---

## Step 3: Test Health Check (1 minute)

```bash
curl http://localhost:3000/api/v1/provider-health
```

Expected response:
```json
{
  "summary": {
    "all_online": true,
    "online_count": 3,
    "status": "healthy"
  },
  "providers": [
    { "name": "DeepSeek-R1 — PRIMARY", "status": "online", "allocation": 90 },
    { "name": "Groq (FREE)", "status": "online", "allocation": 5 },
    { "name": "OpenRouter — FALLBACK", "status": "online", "allocation": 5 }
  ]
}
```

---

## Step 4: Check Cost Savings (1 minute)

```bash
curl http://localhost:3000/api/v1/cost-info
```

Expected output shows:
```json
{
  "current_situation": {
    "ollama_cloud_monthly": 80,
    "recommended_hybrid_monthly": 35,
    "monthly_savings": 45,
    "savings_percent": 56
  }
}
```

---

## Step 5: Start Using (0 minutes - automatic)

The forum now:
- Routes reasoning tasks to DeepSeek (cheap)
- Routes fast tasks to Groq (free)
- Falls back to OpenRouter if needed
- Tracks costs in every response

No code changes needed. All LLM calls go through the cost-optimized router automatically.

---

## Verify It's Working

Make an LLM request to the forum and check the response includes:
```json
{
  "cost_info": {
    "provider_route": "DeepSeek-R1 (SiliconFlow) — PRIMARY",
    "monthly_savings_vs_ollama_cloud": 56,
    "reference": "See /docs/COST_OPTIMIZED_LLM_SETUP.md for provider strategy"
  }
}
```

---

## Monthly Cost Tracking

Run this once per month to verify savings:
```bash
curl http://localhost:3000/api/v1/cost-info | jq '.current_situation'
```

Expected: `$35/month` vs your old `$80/month` = **$45 savings**

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Health check shows offline | Check `.env.local` has correct API keys |
| Requests slow | DeepSeek can be slower; Groq is faster but rate-limited |
| Costs higher than $35 | You're using more tokens; scale allocation percentages |
| Want to use just one provider | Edit `PROVIDER_CONFIGS` in `src/lib/llm-provider-router.ts` |

---

## Done! 

You've now:
- ✅ Set up 3 providers with automatic fallback
- ✅ Saved $45/month vs Ollama Cloud
- ✅ Kept Copilot Pro for IDE integration
- ✅ Got visibility into all costs

**Total monthly spend: ~$55** (vs old $80 + $20 = $100)  
**Monthly savings: $45 (56% reduction)**
