# Pilot: paid AI commercial web app

- Date: 2026-09-13
- Mode: governance dry-run; no human gate signed
Scenario: T2 paid public web app with accounts, PII/telemetry, money, email, public UI, hosting, and an LLM/RAG recommendation path.

## Simulated intake

- Product class: `paid-web`
- Initial risk tier: T2
- Profiles: core + AI + commercial; regulated initially off
- Flags on: users/accounts, PII/telemetry, money, email, public UI, hosting
- Flags off with typed reasons: IAP, Marketplace/Directory, SSO/DPA

This is not an approved stage-0 record. PM, human merger, production authority, and real evidence owners must be named before a real run advances.

## Assertions

| Assertion | Result | Evidence |
| --- | --- | --- |
| LLM/RAG activates AI; public paid app activates commercial | PASS | `docs/checklists/profiles.md` — AI and Commercial |
| Stage 6 cannot start without accepted stage-3 holdout data and committed eval thresholds | PASS | `docs/PIPELINE.md` — Sequencing; `ai-assurance.md` stages 3 and 6 entry |
| Supplying AI entry evidence does not replace stage-5 human approval | PASS | `docs/PIPELINE.md` — Sequencing |
| Active money rows cannot be N/A | PASS | `commercializable-app.md` — Money; gate-record rule 5 |
| Validation demands bad-signature, replay, duplicate, tamper, grant, and revoke tests | PASS | `commercializable-app.md` — Money stage 7 |
| KYC, tax, and DNS remain `WAITING` with owners | PASS | `docs/PIPELINE.md` — Irreducible waits |
| Deploy requires a model card and production threshold alerts | PASS | `docs/checklists/ai-assurance.md` stage 8 |
| Healthcare recommendation discovered later halts and re-opens intake | PASS | `profiles.md` — Regulated packs; gate-record rule 6 |
| Healthcare recommendation raises the run to T3 and activates Health | PASS | `profiles.md` — T3; `regulated.md` — Health |

## Entry-condition injection

Initial state: no held-out evaluation set and no committed harness thresholds.

Expected and observed policy response: stage 6 is blocked. After both artifacts exist, implementation may start only after stage 5 has a human `APPROVED` record.

## Regulated-use injection

Injected change: recommendations are marketed for healthcare reliance.

Expected and observed policy response: halt; re-open intake; reassess to T3; activate the Health pack; require classification, HIPAA/BAA decision, PHI controls, clinical safety ownership, population/failure testing, breach clocks, and authority-held approvals. Unresolved BAA/classification approval is `WAITING`, not N/A.

## Verdict

PASS. AI entry controls, money controls, deployment evidence, external waits, and late regulated-use activation all behave as designed.
