# Provider API Truth Audit

Date: 2026-04-01
Status: corrective audit
Scope: LLM provider router, routed execution assumptions, provider/model/service truth alignment

## Summary

The current router/runtime work made useful progress on failover, inventory, and operator review, but it also flattened real provider and model-surface distinctions too aggressively.

That flattening is the exact failure the user called out:

- real provider APIs are not interchangeable just because many expose OpenAI-compatible chat endpoints
- free-tier access is not equivalent to provider-level free eligibility
- model families such as Qwen are absent from the explicit catalog and therefore not represented truthfully
- Ollama sidecar/runtime behavior is still mixed with routed-provider semantics in ways that can mislead future work

This artifact records the exact truth gaps and the corrective path.

## Findings

### 1. Provider identity and service identity are conflated

Evidence:

- [src/lib/llm-provider-router.ts](src/lib/llm-provider-router.ts#L16) restricts routed providers to `deepseek | mistral | groq | openrouter`.
- [src/lib/ollama-cloud.ts](src/lib/ollama-cloud.ts#L91) constructs `OLLAMA_PROVIDER` using `id: 'openrouter'` even though the name is `Ollama Cloud — ACTIVE ANSWER BACKEND`.

Why this is wrong:

- Ollama Cloud is not OpenRouter.
- SiliconFlow-hosted DeepSeek is not the same thing as DeepSeek direct service semantics.
- Aggregators, direct providers, and sidecars are different service classes with different API and quota semantics.

Impact:

- transparency payloads can become semantically misleading
- future routing work can accidentally treat service substitution as provider equivalence

### 2. Chat execution assumes too much OpenAI-compatibility

Evidence:

- [src/lib/ollama-cloud.ts](src/lib/ollama-cloud.ts#L438) sends all routed execution to `${route.provider.baseUrl}/chat/completions`.

Why this is fragile:

- some providers are OpenAI-compatible but not perfectly shape-compatible
- request/response quirks, headers, error formats, tool semantics, and model naming differ by service
- a provider adapter boundary should encode these differences explicitly instead of assuming uniformity

Impact:

- hidden runtime incompatibilities
- future providers/models can appear “supported” before they actually are

### 3. Free-tier truth is currently heuristic, not authoritative

Evidence:

- [src/lib/llm-provider-router.ts](src/lib/llm-provider-router.ts#L755) marks all Groq as free-tier and all DeepSeek as free-tier at provider level.
- [src/lib/llm-provider-router.ts](src/lib/llm-provider-router.ts#L758) infers OpenRouter free eligibility by regex on model IDs.

Why this is wrong:

- free access is often model-specific, account-specific, promotion-specific, and quota-specific
- “provider has free tier” is not enough to claim “this model is a safe free-primary lane”
- the user specifically called out mixed free and paid availability across providers and models

Impact:

- free-first routing can become inaccurate if it relies on guessed model status
- operator expectations drift away from real service limits

### 4. Dynamic model classification is too guess-heavy

Evidence:

- [src/lib/llm-provider-router.ts](src/lib/llm-provider-router.ts#L731) infers quality from model-name regex.
- [src/lib/llm-provider-router.ts](src/lib/llm-provider-router.ts#L766) infers roles from model-name regex.
- [src/lib/llm-provider-router.ts](src/lib/llm-provider-router.ts#L794) creates dynamic entries from `/models` and classifies them heuristically.

Why this is weak:

- model IDs do not reliably encode actual reasoning strength, context, or free-tier status
- hosted variants and provider-renamed aliases break inference quality
- model family truth should be catalog-backed first, heuristic second

Impact:

- misprioritized routes
- incorrect assumptions about long-context and verifier suitability

### 5. Qwen is absent from explicit catalog truth

Evidence:

- no Qwen entries were found in the routed provider code or provider docs during this audit pass

Why this matters:

- Qwen is a real model family the user explicitly expects to be represented in the provider/model/service picture
- even if Qwen is only reachable through aggregators or specific hosts, the catalog should at least acknowledge it as a known model family with explicit activation status

Impact:

- the current router truth is incomplete relative to the user’s intended model landscape

### 6. Current docs still overstate configured provider reality

Evidence:

- live safe probe showed zero configured routed providers and only the approval-required Ollama sidecar configured in the current environment
- older docs still describe configured provider success more strongly than the runtime currently supports

Why this matters:

- “adapter exists” is not “service configured”
- “route available in code” is not “provider operational in this environment”

Impact:

- activation readiness can be overstated

## Corrective Direction

### Phase A: Separate service host, provider family, and model family

Introduce explicit distinctions for:

- service host: `siliconflow`, `mistral-direct`, `groq-openai`, `openrouter`, `ollama-cloud`
- provider family: `deepseek`, `mistral`, `meta-llama`, `qwen`, etc.
- model identity: exact routable model ID per service host

Do not widen the current routed union blindly. Add a catalog layer first.

### Phase B: Add provider adapter contracts

Replace the “all providers use `/chat/completions` the same way” assumption with per-service adapters that define:

- chat endpoint path
- auth/header requirements
- model-discovery support and parser
- response-shape parser
- tool/function support level
- rate-limit and quota semantics

### Phase C: Add model-family catalog truth

Create a server-side catalog artifact that tracks:

- model family name
- supported service hosts
- free-tier status source: `authoritative | promotional | heuristic | unknown`
- routed activation status: `active | inactive | unsupported | approval-required`
- notes on paid-only vs free-limited behavior

This is where Qwen should appear even before full routed activation.

### Phase D: Reduce heuristic routing authority

Heuristics may remain as fallback, but only after:

- explicit catalog entries are checked first
- service-host adapter truth is applied
- free-tier status is marked with confidence/source

### Phase E: Correct Ollama sidecar classification

Ollama Cloud / Ollama sidecar must stop impersonating `openrouter` identity in runtime transparency structures.

It should become its own service-host classification, even if it remains outside the routed provider union for now.

## Immediate Next Steps

1. Add a catalog artifact for service-host truth and model-family truth.
2. Add explicit `qwen` model-family entries as cataloged truth, not necessarily routed support.
3. Refactor provider execution behind service adapters instead of one generic `/chat/completions` assumption.
4. Correct Ollama transparency identity so it is not labeled as `openrouter`.
5. Update docs that still say “configured” when they only mean “supported in code”.

## Approval Boundary

The system may catalog providers, service hosts, model families, free-tier confidence, and adapter readiness automatically.

The system must not automatically claim routed support, free-tier primacy, or production readiness for a provider/model/service combination until the host adapter and activation state are explicitly reviewed and approved.
