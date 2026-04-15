# GitHub Issue Triage Design

This design extracts the few useful automation patterns from MoltBot and adapts them to GrumpRolled doctrine.

## Source Pattern

The MoltBot workflow is useful in one narrow way: it treats GitHub issue automation as a small operational loop instead of a platform-wide intelligence layer.

Useful raw pattern elements:

- event-scoped triggers
- separate reply and labeling steps
- short repository-context prompt injection
- lightweight first-response behavior for obvious low-risk support cases

Not portable as-is:

- unconditional auto-reply to all new issues and comments
- direct model call inside workflow with no draft or approval boundary
- naive keyword labeling treated as real classification
- no durable audit model beyond posted comments

## Keep / Adapt / Ignore

| Pattern | Decision | Why |
| --- | --- | --- |
| Narrow GitHub event triggers (`issues.opened`, `issue_comment.created`) | Keep | Good boundary for repo-support automation. |
| Separate classify/label step from response step | Keep | Matches GrumpRolled governance and makes rollback safer. |
| Inject repository context into triage prompt | Adapt | Keep concise and factual; avoid broad persona roleplay. |
| Auto-label obvious issue classes | Adapt | Replace naive keywords with bounded heuristics plus confidence thresholds. |
| Auto-reply to every issue/comment | Ignore | Violates GrumpRolled approval and doctrine boundaries. |
| Direct model invocation inside GitHub Actions as final responder | Ignore | Needs draft-only mode, audit trail, and explicit escalation lanes. |
| “Friendly and professional” generic support-bot persona | Ignore | Too generic; GrumpRolled should use capability/governance framing. |

## Target Workflow

The clean GrumpRolled issue-triage workflow is three-stage, not one-stage.

1. Intake
   - Trigger on new issue or new human comment.
   - Normalize payload.
   - Ignore bot-originated events.
2. Triage classification
   - Assign a bounded class such as `bug`, `question`, `feature`, `docs`, `governance`, `security`, `needs-repro`, `owner-review`.
   - Emit labels only when confidence is high.
   - Record the event, classification, confidence, and actor.
3. Draft response or escalate
   - `AUTO_LABEL_ONLY`: add labels, no reply.
   - `DRAFT_ONLY`: generate a proposed reply for maintainer review, do not post automatically.
   - `AUTO_REPLY_LOW_RISK`: only for narrow, documented, low-risk operational cases.
   - `ESCALATE_OWNER`: security, identity, trust, governance, migration, or policy-sensitive issues.

## Approval Boundary

Allowed to automate:

- event intake
- coarse classification
- low-risk label application
- draft generation
- maintainer-facing summaries

Requires explicit approval:

- replies touching trust, identity, federation, security, migration, moderation, or policy
- replies that present uncertain technical guidance as final truth
- any workflow that changes repository governance state

Must never be automatic:

- silent moderation or issue closure
- authoritative security guidance without human review
- identity or trust assertions about external platforms

## Suggested Data Shape

Minimal durable triage record:

```json
{
  "source": "github",
  "event_type": "issues.opened",
  "repo": "GrumpRolled",
  "issue_number": 42,
  "actor": "username",
  "classification": "bug",
  "confidence": 0.86,
  "decision": "DRAFT_ONLY",
  "labels_applied": ["bug", "needs-triage"],
  "reply_draft_created": true,
  "escalation_reason": null,
  "created_at": "2026-04-01T00:00:00.000Z"
}
```

## Initial Rule Set

Use explicit decision classes:

- `AUTO_LABEL_ONLY`
- `DRAFT_ONLY`
- `AUTO_REPLY_LOW_RISK`
- `ESCALATE_OWNER`
- `SKIP`

Initial routing rules:

- Reproducible bug with missing reproduction data: `DRAFT_ONLY`
- Basic usage question with known docs answer: `AUTO_REPLY_LOW_RISK`
- Security bug, auth issue, trust issue, identity migration issue: `ESCALATE_OWNER`
- Feature request lacking use case detail: `DRAFT_ONLY`
- Bot noise or duplicate automation chatter: `SKIP`

## Operational Notes

- Keep the first version GitHub-native and small.
- Do not let repo-support automation bleed into product-runtime automation.
- Post drafts into a maintainer-visible lane first if ambiguity is non-trivial.
- Keep every automated label/reply decision auditable.

## Implementation Recommendation

If this is implemented later, build it as:

1. classifier module
2. decision policy module
3. GitHub workflow wrapper
4. optional draft sink for maintainer review

Do not start with one large GitHub Action that classifies, reasons, replies, and mutates labels in one opaque block.
