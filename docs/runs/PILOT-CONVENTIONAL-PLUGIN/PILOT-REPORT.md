# Pilot: conventional public plugin

- Date: 2026-09-13
- Mode: governance dry-run; no human gate signed
Scenario: public free Cursor command/rule/skill bundle with an existing Directory listing and no custom UI, AI, accounts, PII, money, email, or hosting.

## Simulated intake

- Product class: `plugin-only`
- Risk tier: T1
- Profiles: core + commercial; AI off; regulated off
- Flags on: Marketplace/Directory listing
- Flags off: users, PII/telemetry, money, email, public UI, hosting, IAP, SSO/DPA
- AI evidence: one checklist-level `N/A — AI profile off`

This is not an approved stage-0 record. Spec ID, PM, and human merger must be named in a real run.

## Assertions

| Assertion | Result | Evidence |
| --- | --- | --- |
| A Directory command/rule/skill bundle is `plugin-only` | PASS | `docs/checklists/profiles.md` — Product class definitions |
| T1 public product activates commercial | PASS | `docs/checklists/profiles.md` — Commercial |
| Host-rendered command text does not activate Public UI | PASS | `docs/checklists/profiles.md` — Capability flags |
| AI off records one typed N/A and demands no model card/eval | PASS | `docs/checklists/ai-assurance.md` introduction |
| Directory flag activates packaging/listing evidence | PASS | `docs/checklists/commercializable-app.md` — Marketplace or Cursor Directory |
| Existing unchanged listing is rechecked, not resubmitted | PASS | Same section |
| Late LLM requirement halts and re-opens intake | PASS | `docs/checklists/profiles.md` — AI; gate-record rule 6 |

## Contradiction injection

Injected change: add an LLM call while AI remains off.

Expected and observed policy response: stop implementation; record `CHANGES REQUIRED`; re-open stage 0; turn on AI only through a superseding human-approved intake; apply the AI assurance checklist. Commercial remains on.

## Verdict

PASS. The conventional path avoids irrelevant AI artifacts without weakening public-product or Directory obligations.
