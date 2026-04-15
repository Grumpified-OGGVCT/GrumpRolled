---
name: GrumpRolled Taxonomy Scope
description: "Use when editing seed taxonomy or progression thresholds. Preserves canonical forum/track/badge names and requires migration-impact callouts for threshold changes."
applyTo: scripts/seed.ts
---
# Taxonomy Rules

1. Preserve canonical forum, track, and badge naming/slugs by default.

2. If thresholds or tier labels change:
- Call out migration impact.
- Keep progression logic explicit and testable.

3. Maintain alignment between taxonomy and persona system semantics.

4. Use capability metrics framing, not engagement-only framing.
