---
name: conductor
description: Start or resume a human-gated zero-to-hero product run from git records
---

Start or resume a product-conductor run. Git is the state store. Do the work; do not only list the docs.

1. Read `docs/PIPELINE.md`, `docs/ARC-STATUS.md`, `docs/checklists/profiles.md`, and every `docs/runs/*/GATE-RECORD.md` in this workspace (or the product worktree the user named). If those files are missing, copy the templates from this plugin's repository (`docs/gates/GATE-RECORD.md`, `docs/checklists/`, `.cursor/rules/pipeline-gates.mdc`) into the product repo before continuing.
2. Report the current run: spec ID, class, risk tier, active profiles, flags, latest gate decision, and open `WAITING` items. If several runs exist, ask which spec ID to resume.
3. If intake is missing or contradicted, stop later-stage work. Collect class, T0–T3 tier, profiles (core always on; AI / commercial / regulated packs), capability flags, spec ID, PM, and named human merger. Draft `docs/runs/<spec-id>/GATE-RECORD.md` and a filled `profiles.md` copy in that run folder. Do not mark the intake `APPROVED`.
4. Work only the current stage. Do not start stage N+1 without an `APPROVED` human-signed row for stage N. When AI is on, do not start stage 6 without an accepted stage-3 holdout set and committed eval thresholds.
5. Use installed skills that match the flags. If a required skill is missing, halt and name it. Do not reimplement Stripe, Auth0, or other plugin skills. This command cannot invoke another plugin.
6. Typed N/A is allowed only on profile-off or flag-off rows. Universal core rows cannot be N/A. External approvals (KYC, legal formation, tax, DNS, store review, counsel, pen-test) are `WAITING` with an owner, never N/A.
7. If spec or code contradicts a disabled profile or flag, halt and re-open intake (`CHANGES REQUIRED`).
8. Agents draft commits and PRs. Agents do not sign gates, merge `main` or release branches, accept legal terms, complete KYC, or enable production.
9. After drafting, tell the PM which gate row they must sign, and that chat approval does not advance the stage.

This command is policy, not a security control. Do not resubmit the Cursor Directory listing.
