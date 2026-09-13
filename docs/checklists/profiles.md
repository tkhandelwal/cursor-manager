# Intake profiles and risk tiers

Complete this checklist at stage 0. Re-open intake whenever the specification or implementation contradicts it.

## Product

- Spec ID:
- Product class:
- PM:
- Named human merger:
- Date:

## Risk tier

Select one:

- [ ] **T0 — prototype/internal dogfood:** no public users; short evidence is acceptable.
- [ ] **T1 — public free:** full core evidence and public-product obligations.
- [ ] **T2 — paid/accounts:** T1 plus users and/or money controls.
- [ ] **T3 — high impact:** T2 plus applicable regulated pack and stronger assurance.

Risk tier changes evidence depth, not the ten-stage lifecycle.

## Profiles

### Core — always on

- [ ] Core lifecycle enabled.

### AI

- [ ] On
- [ ] Off — reason:

Turn on when the product uses models, LLMs, embeddings, RAG, agents, or generated decisions a user may trust. If any appears later while off, halt implementation and re-open intake.

### Commercial

- [ ] On
- [ ] Off — T0 internal/prototype reason:

Turn on for anything offered publicly, free or paid. T1–T3 public products cannot turn it off.

### Regulated packs

- [ ] None — reason:
- [ ] Health
- [ ] Finance
- [ ] Government
- [ ] Children
- [ ] Enterprise trust (for contractual DPA, SSO, SOC 2, HIPAA, or similar obligations)
- [ ] Employment/credit/high-impact decisions — governing regime:

Turn on when the use case, buyer, data, or contract invokes the pack. Discovery during later stages halts the run and re-opens intake.

## Capability flags

Mark each yes/no and provide a reason for no when ambiguity exists:

- [ ] Users/accounts
- [ ] PII or telemetry
- [ ] Money
- [ ] Email
- [ ] Public UI
- [ ] Hosting
- [ ] Mobile IAP
- [ ] Marketplace/Directory listing
- [ ] SSO or DPA

## Approval

- Decision: `APPROVED` / `CHANGES REQUIRED`
- PM name:
- Date:
- Evidence/notes:
