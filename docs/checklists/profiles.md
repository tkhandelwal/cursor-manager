# Intake profiles and risk tiers

Complete this checklist at stage 0. Re-open intake whenever the specification or implementation contradicts it.

## Product

- Spec ID:
- Product class:
- PM:
- Named human merger:
- Date:

## Product class definitions

- `plugin-only`: command, rule, hook, or skill delivered inside a host, with no separately hosted customer application. A Directory-listed command/rule/skill bundle stays `plugin-only`.
- `marketplace-extension`: a packaged extension with its own executable UI/code whose host marketplace distribution, permissions, review, or commerce is the primary product concern.
- `free-web` / `paid-web`: separately hosted browser product without/with paid access.
- `mobile-iap`: mobile product using app-store purchases.
- `b2b-enterprise`: enterprise selling motion with contractual trust requirements.
- `internal-tool`: restricted to one organization and not offered publicly.
- `prototype`: evaluation artifact with no public or production users.

## Risk tier

Select one:

- [ ] **T0 — prototype/internal dogfood:** no public users; short evidence is acceptable.
- [ ] **T1 — public free:** full core evidence and public-product obligations.
- [ ] **T2 — paid/accounts:** T1 plus users and/or money controls.
- [ ] **T3 — high impact:** T2 plus an applicable regulated pack and stronger assurance. Health, finance, government, children, employment/credit decisions, or similarly consequential recommendations require T3. Enterprise trust alone may remain T2 when it adds contractual controls but no high-impact use.

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

`Public UI` means a graphical surface offered to external users, including web, mobile, desktop, or custom extension views. Host-rendered slash-command text with no custom interactive view does not activate it. Accessibility requirements still apply to any UI the product owns.

## Approval

- Decision: `APPROVED` / `CHANGES REQUIRED`
- PM name:
- Date:
- Evidence/notes:
