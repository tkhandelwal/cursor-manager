# Gate record

Copy this template to `docs/runs/<spec-id>/GATE-RECORD.md`. It is append-only: correct mistakes with a new superseding row, never by silently rewriting an accepted decision.

## Run identity

- Spec ID:
- Product:
- Product class:
- Risk tier: `T0` / `T1` / `T2` / `T3`
- Active profiles: `core` plus `AI`, `commercial`, and regulated packs as applicable
- Capability flags:
- PM:
- Named human merger:
- Production authority:
- Repository / worktree:

## Stage decisions

Allowed decisions:

- `APPROVED` — evidence is accepted and the next stage may start.
- `CHANGES REQUIRED` — do not advance.
- `WAITING` — external dependency has an owner; do not bypass it.
- `SUPERSEDED` — a later row replaces an earlier decision.

| Record ID | Stage | Decision | Risk tier / profiles | Signer and authority | UTC date | Evidence paths / URLs | Conditions, waits, or supersedes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G-0001 | 0 — Intake |  |  |  |  | `docs/checklists/profiles.md` |  |

## Required gate rules

1. Chat approval alone does not advance a stage.
2. The signer must be a human with the stated authority. An agent cannot sign.
3. Legal acceptance, KYC, production deployment, and release merge require the actual authority holder.
4. Universal core rows cannot be N/A.
5. Profile and capability rows can be N/A only when off, with a typed reason in evidence.
6. If specifications or implementation contradict intake, record `CHANGES REQUIRED`, re-open stage 0, and append the revised intake decision.
7. Agents never merge `main` or a release branch and never enable production.
8. `WAITING` is not approval. Record owner, expected evidence, and next review date.
