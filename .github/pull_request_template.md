## Product conductor

- Spec ID:
- Stage:
- Risk tier: `T0` / `T1` / `T2` / `T3`
- Active profiles:
- Capability flags changed:
- Gate record:
- Named human merger:

## Change

- What changed:
- Acceptance evidence:
- Checklist rows changed:
- Tests / quality gates:
- Rollback:

## Human gate

- [ ] Prior stage has an `APPROVED` human-signed gate record.
- [ ] Universal core rows are complete; none are N/A.
- [ ] Profile-off and flag-off rows use typed N/A reasons.
- [ ] Any profile/flag contradiction re-opened intake.
- [ ] External dependencies are `WAITING` with an owner, not N/A.
- [ ] No agent will merge a release branch or enable production.

Decision and signer are recorded in the run’s `GATE-RECORD.md`; checking boxes here does not approve the gate.
