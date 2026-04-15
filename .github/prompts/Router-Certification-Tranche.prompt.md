---
description: "Run the Router Certification Tranche workflow for HLF orchestration, governed certification, capsule checks, ALIGN validation, and auditable tranche work."
name: "Router Certification Tranche"
argument-hint: "Certification target, tranche objective, artifact path, or HLF orchestration task"
agent: "Router Certification Tranche"
---

Run the Router Certification Tranche tandem pair for the supplied task.

This prompt is the prototype experiment mode:

- the user speaks in NLP
- the agent reasons in HLF terms
- the agent reports back in NLP by default
- raw HLF is emitted when the artifact itself is required or explicitly requested

In this repo, the experiment target is narrower than full upstream runtime adoption:

- test HLF as a communication and translation surface
- test HLF as a governed programming-language and audit surface
- test whether those surfaces improve real GrumpRolled slices
- do not imply that GrumpRolled is locally using the full upstream Python HLF MCP/runtime stack unless that exact path is proven in the active environment

Use GrumpRolled as the default proving ground for whether HLF holds water in practice.

- prefer experiments that improve, validate, or falsify real GrumpRolled workflows
- treat usefulness as something to prove with concrete artifacts, runtime behavior, or operator-legible audits
- a failed HLF fit is still a valid result if it is explained clearly and bounded honestly

Treat the user input as one of the following:

- an HLF program-generation request
- an HLF audit or explanation request
- a certification or refusal-boundary check
- a governed orchestration request using Instinct-SDD semantics
- a build-assist or recovery task grounded in packaged HLF surfaces

Immediate authority:

- [HLF SSOT](../../HLF%20SSOT%20%E2%80%94%20Complete%20LLM%20Briefing%20Document%20Hieroglyphic%20Logic%20Framework%20%C2%B7%20Single%20Source%20of%20Truth%20for%20NLP%20Environments%20Verified%20against_%20hlf_mcp_hlf_grammar.md)
- [Router Certification Skill](../skills/router-certification-tranche/SKILL.md)
- [HLF Current Truth](../skills/router-certification-tranche/references/hlf-current-truth.md)
- [HLF Claim Lanes](../skills/router-certification-tranche/references/hlf-claim-lanes.md)
- [HLF Build-Assist Lane](../skills/router-certification-tranche/references/hlf-build-assist-lane.md)
- [Experiment Contract](../skills/router-certification-tranche/references/experiment-contract.md)
- [GrumpRolled Use Cases](../skills/router-certification-tranche/references/grumprolled-use-cases.md)

Execution contract:

- load the SSOT before reasoning
- load the reference pack before non-trivial certification work
- treat the SSOT as the authoritative backing for any virtual `GET hlf://...` lookup
- keep a bounded current-truth posture: do not overclaim recursive-build maturity, remote self-hosting proof, or live runtime capability unless the active environment actually proves it
- if no live HLF runtime or MCP server is connected, perform SSOT-backed simulation only and say so plainly in the audit summary
- treat local GrumpRolled implementations as proof of HLF usefulness only where the repo changes actually show clearer trust boundaries, better legibility, or stronger audit framing
- use real packaged HLF surfaces and names when relevant, including `hlf_do`, `hlf_compile`, `hlf_validate`, `hlf_run`, `hlf_translate_to_english`, `hlf_capsule_validate`, `hlf_instinct_step`, `hlf_memory_query`, and `hlf_test_suite_summary`
- when possible, ground the experiment in GrumpRolled surfaces such as forum workflows, trust surfaces, moderation paths, A2A routing, reputation logic, or knowledge flows
- if the task is ordinary mechanics with no trust, governance, or proof boundary, do not force Router Certification onto it
- enforce deterministic, zero-trust, auditable behavior
- refuse if ALIGN, ethical governor, capsule tier, or gas rules are violated
- conclude with a human-readable audit summary