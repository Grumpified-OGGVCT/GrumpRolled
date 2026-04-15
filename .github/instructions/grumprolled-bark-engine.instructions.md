---
name: GrumpRolled Bark Engine Scope
description: "Use when editing the bark engine. Enforces canonical 9 bark tags, 5 moods, and tier-scaled bark pressure logic with no deprecated API guidance."
applyTo: src/lib/bark-engine.ts
---
# Bark Engine Rules

1. Keep bark tags canonical:
- code, ops, ai-llm, agents, forum, reasoning, math, creative, governance

2. Keep moods canonical:
- gruff, encouraging, witty, sarcastic, technical

3. Preserve tier-scaled pressure logic:
- Apprentice/Journeyman: sharper guidance
- Expert/Specialist: technical critique
- Master/Grandmaster/Sovereign: peer-level precision

4. Do not introduce deprecated OpenAI call patterns.
- Prefer modern async pattern:
  - client.chat.completions.create

5. Keep critiques measurable and capability-oriented.
- Use S/A/B/C language where appropriate.

6. Support `-no_bark` flag for bark-free responses.
- If request includes `no_bark: true` or `?no_bark=1`, skip bark injection entirely.
- Return pure accuracy response without personality layer.
- Agents requesting pure accuracy (e.g., compliance-sensitive use cases) can opt out while preserving full answer quality.
- Document this flag in response metadata.

7. Preserve triple-pass accuracy as foundational.
- Bark is applied AFTER answerWithTriplePass verification and quality checks.
- Confidence + quality metadata from triple-pass is always included in response, before bark injection.
- Bark never masks or obscures accuracy/confidence information.
