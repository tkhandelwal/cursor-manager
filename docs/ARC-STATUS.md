# Cursor Manager delivery status

Updated: 2026-09-15

This file is the source of truth for the conductor rollout. A completed implementation step requires repository evidence and the relevant gate record; chat agreement alone does not advance it.

## Agreed delivery plan

1. **Directory plugin — complete.** Cursor Manager is listed at [cursor.directory/plugins/cursor-manager](https://cursor.directory/plugins/cursor-manager). Recheck only; do not resubmit.
2. **Profiled SSDLC documentation — complete locally.** The universal ten-stage spine, T0–T3 tiers, profiles, capability flags, checklists, and gate record are documented.
3. **Scoped conductor policy — complete locally.** The opt-in Cursor rule and PR template document human gates, CI, and branch protection. Rules remain policy, not a security boundary.
4. **Pilot run — complete locally.** Conventional/non-AI and AI + commercial dry-runs passed activation, typed N/A, halt-and-reopen intake, Stage 6 AI entry, money controls, regulated Health activation, and irreducible-wait assertions. No human gate was signed.
5. **Conductor command — complete locally.** Opt-in `/conductor` starts or resumes a run from git records. Policy only; not a security boundary. Do not resubmit the Directory listing.
6. **Evidence automation — complete.** `npm run evidence` and `npm test` validate required artifacts and gate-record metadata. CI runs a dedicated `npm run evidence` step. Unsigned stages still pass; the check is not a human-gate substitute.
7. **Optional product UX — complete locally.** Session Guard includes in-page navigation and a native delivery snapshot. Cursor Canvas remains a separate chat-side artifact because its runtime cannot be embedded in the Next.js app.
8. **Commercialize Cursor Manager — deferred.** The Directory plugin stays free. Sponsorship or a paid tier remains an evaluation, not this step.

## First-slice evidence

- `docs/PIPELINE.md`
- `docs/checklists/profiles.md`
- `docs/checklists/commercializable-app.md`
- `docs/checklists/ai-assurance.md`
- `docs/checklists/regulated.md`
- `docs/gates/GATE-RECORD.md`
- `.github/pull_request_template.md`
- `.cursor/rules/pipeline-gates.mdc`
- README conductor entry
- Quality gates: `npm run lint`, `npm test`, and `npm run evidence`.
- Evidence check: `lib/evidence.ts`, `lib/evidence-cli.ts`, `lib/evidence.test.ts`.
- Accessibility gate: `components/accessibility.test.tsx` runs axe WCAG A/AA checks on
  the primary Session Guard shell in `dark`, `light`, and `accessible` themes.
- Dashboard nav: `lib/dashboard.ts`, `components/dashboard-nav.tsx`, and region ids on each panel.
- Pilot evidence: `docs/runs/PILOT-CONVENTIONAL-PLUGIN/PILOT-REPORT.md` and `docs/runs/PILOT-AI-COMMERCIAL/PILOT-REPORT.md`.
- Branch protection: `docs/gates/BRANCH-PROTECTION.md` and [ruleset 23189136](https://github.com/tkhandelwal/cursor-manager/rules/23189136).

## Open / deferred

- Legal documents must come from counsel or a named legal-document provider; the conductor does not invent final legal text.
- The live GitHub ruleset cannot stop an agent that holds the `tkhandelwal` token from merging. That remains policy, not a security boundary.
- Live KYC, legal formation, tax/bank registration, DNS propagation, store review, procurement, counsel review, and external penetration tests remain irreducible waits.
- The native Session Guard delivery panel mirrors this record; it is a dated snapshot, not live pipeline state. Cursor Canvas remains chat-side.
- Cursor Manager billing and Directory resubmission remain deferred.
- The local five-agent cap is this repository’s convention, not a Cursor Cloud platform limit.
