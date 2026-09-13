# Zero-to-hero product conductor

This is a human-governed software product lifecycle. Agents draft and verify work between gates; humans approve every transition. Git is the durable state store.

Cursor Manager is the score, not a plugin dispatcher. Use relevant installed skills when available. If a required skill is missing, stop and name it instead of silently rebuilding it.

## Start a run

In Agent chat, run **`/conductor`**. It reads git records, asks for intake if missing, and resumes the current unsigned stage. Create `docs/runs/<spec-id>/`, copy `docs/gates/GATE-RECORD.md` into it, and complete intake before accepting later artifacts. For a product in another repository, copy `.cursor/rules/pipeline-gates.mdc` there and scope its globs to that product's run records and source tree.

1. Product class: `plugin-only`, `free-web`, `paid-web`, `mobile-iap`, `marketplace-extension`, `b2b-enterprise`, `internal-tool`, or `prototype`.
2. Risk tier: T0–T3.
3. Active profiles: core, AI, commercial, and any regulated packs.
4. Capability flags: users, PII/telemetry, money, email, public UI, hosting, IAP, Directory listing, SSO/DPA.
5. Spec ID, PM, and named human merger.

Definitions and activation rules live in `docs/checklists/profiles.md`; regulated evidence lives in `docs/checklists/regulated.md`. An unmarked skip of a core row is a defect. A profile or flag row may be N/A only with a typed reason.

## Lifecycle and gates

| Stage | Required core evidence | Profile evidence | Human gate |
| --- | --- | --- | --- |
| 0. Intake | Class, tier, profiles, flags, owners | Activated packs | PM |
| 1. Requirements and use cases | Problem, ICP/JTBD, scope, abuse cases, metric, kill criteria | Commercial offer/channel; AI intended and excluded uses | PM |
| 2. Risk and hazard analysis | Harmed parties, likelihood, severity | Liability, AI harm taxonomy, regulated control set | PM + risk owner |
| 3. Data strategy and governance | Data inventory, minimization, retention | PII basis/subprocessors; AI provenance, licensing, holdout set | Data owner |
| 4. Threat modeling | Data flow and STRIDE or equivalent | Money replay/tamper; AI injection, poisoning, extraction, agency | Security owner |
| 5. Secure design and architecture | Isolation, least privilege, kill switch, rollback, exclusions | Money/consent/backup design; AI guardrails and model fallback | Architect + PM |
| 6. Implementation | Secure code, lockfiles, secret/SAST/SCA checks | Flagged product features; AI versioning and eval harness | PM scope approval + named human merger |
| 7. Validation | Unit/integration, E2E or typed skip, audit and secret scan | Accessibility; auth/money abuse tests; AI red-team and eval regression | PM + security owner |
| 8. Deploy | Signed artifact, SBOM, staged rollout, rollback, observability | Commercial live obligations; AI model card and threshold alerts | Production authority |
| 9. Operate | Paging, incident communications, service objective | Billing/DSR metrics; AI drift and abuse monitoring | Ops owner |
| 10. Change management | Deprecation, changelog, RCA feedback | Customer notice; AI prompt/model re-evaluation | Change authority |

Record every accepted transition in the run-specific `docs/runs/<spec-id>/GATE-RECORD.md`. Chat approval alone does not advance the stage. Agents never merge a release branch.

## Sequencing

Stages 1–5 are serial. After stage 5, implementation and the test-mode commercial skeleton may run in parallel, subject to the five-local-agent cap. The skeleton can establish test-mode billing, legal-document source, support inbox, DNS plan, and scrubbed observability; it cannot claim live approval.

When AI is active, stage 6 cannot start until stage 3 has an accepted held-out evaluation set and the evaluation harness/pass-fail thresholds are committed. Supplying them does not replace the stage 5 human approval.

Stage 10 returns to stage 3 when data, models, prompts, or processors change. Other changes return to stage 5 unless the risk owner selects an earlier stage.

## Skill catalog

Invoke only skills installed in the current Cursor environment and only when their trigger applies:

- Discovery/specification: Superpowers brainstorming and writing plans, Mobbin, Atlassian.
- Architecture/security: architecture patterns, threat modeling, Auth0 when users exist, Stripe when money exists, RevenueCat for IAP, Azure when selected.
- Implementation: `ce-work`, TDD, frontend design, shadcn, named shell themes, accessibility.
- Verification: repository tests, security review for users/money/PII/AI tool use, Bugbot or code review when a human requests it.
- Operations: Sentry and selected cloud/provider tooling.

The agent must report a missing required capability. Plugins cannot call other plugins, and rules are policy—not a security boundary.

## Irreducible waits

Agent-generated drafts may take hours. Live KYC, legal-entity formation, tax or bank registration, counsel review, DNS/email propagation, app-store review, procurement, and external penetration tests may not. Record these as `WAITING` with owner and evidence; never mark them N/A to advance a gate.

## Enforcement

- Repository records: `docs/ARC-STATUS.md`, the applicable checklists, and gate records.
- CI: tests, lint, build, and project-specific evidence checks.
- Branch protection: require CI, review by the named human role, and disallow agent merges.
- Cursor rule: `.cursor/rules/pipeline-gates.mdc` guides conductor work but cannot enforce security or branch policy.

The optional Session Guard dashboard and chat-side Canvas are companions, not pipeline state or product hosting.
