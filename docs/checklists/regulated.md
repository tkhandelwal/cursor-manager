# Regulated profile packs

Use this checklist when any regulated pack is on. This is an engineering evidence map, not legal advice or certification. Record the governing jurisdiction, named compliance/legal owner, authoritative control set, and counsel decision. Active rows cannot be N/A.

## Shared regulated evidence

| Stage | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Jurisdiction, covered users, intended/excluded uses, and legal owner are named |  |  |
| 2 | Applicable law/contract and control set are mapped to harms and residual-risk acceptance |  |  |
| 3 | Sensitive-data inventory, purpose, basis, minimization, retention, residency, deletion, and subprocessors are approved |  |  |
| 4 | Data flow, tenant boundaries, privileged access, audit integrity, and third-party threats are modeled |  |  |
| 5 | Encryption, key ownership, least privilege, audit logging, backup, recovery, and breach workflow are designed |  |  |
| 6 | Controls are implemented with traceable evidence; production data is excluded from development by default |  |  |
| 7 | Control, access, isolation, restore, incident, accessibility, and abuse tests required by the pack pass |  |  |
| 8 | Required contracts/assessments are executed by their authority holders before covered production use |  |  |
| 9 | Audit, incident, request, retention, vendor, and training obligations have owners and clocks |  |  |
| 10 | Regulatory/contract changes and incidents trigger impact review and re-approval |  |  |

## Health

Activate for health data, diagnosis/treatment support, wellness recommendations users may rely on, or a buyer requiring HIPAA/health controls.

- [ ] Product classification distinguishes wellness, clinical decision support, medical device, and covered-service use.
- [ ] HIPAA covered-entity/business-associate status and BAA need are decided by counsel.
- [ ] PHI is identified; minimum-necessary access, disclosure, consent/authorization, amendment, export, and deletion/retention rules are implemented.
- [ ] Every PHI subprocessor is approved and under the required agreement before receiving PHI.
- [ ] Clinical safety owner, evidence standard, contraindication/escalation behavior, and human review are named.
- [ ] Recommendations are tested across foreseeable populations and unsafe reliance/failure modes.
- [ ] Breach detection, assessment, notification clocks, and evidence preservation are exercised.
- [ ] Covered production use is blocked while BAA, classification, or required authority approval is `WAITING`.

## Finance

- [ ] Financial activity and advice classification, licensing, KYC/AML, sanctions, recordkeeping, and consumer-protection obligations are decided by counsel.
- [ ] No client-controlled price, account, beneficiary, or entitlement authority reaches a trusted transaction.
- [ ] Fraud, reconciliation, dispute, segregation, approval, audit, and suspicious-activity workflows are tested.
- [ ] Automated credit or eligibility decisions include notice, explanation, appeal, fairness, and human-review controls where required.

## Government

- [ ] Required authorization baseline, data classification, residency/sovereignty, accessibility, records, and procurement obligations are named.
- [ ] Hosting and supplier eligibility match the required authorization boundary.
- [ ] Section 508/WCAG evidence and a VPAT/ACR are prepared when required; do not claim certification.
- [ ] Incident reporting, vulnerability disclosure, software bill of materials, and supply-chain evidence meet the contract.

## Children

- [ ] Age threshold, audience, parental consent, guardian rights, advertising/analytics limits, and deletion duties are decided by counsel.
- [ ] Data collection defaults to the minimum and does not rely on dark patterns.
- [ ] Age assurance and parental workflows avoid collecting disproportionate additional data.
- [ ] Safety, reporting, moderation, and escalation paths are tested for the actual age group.

## Enterprise trust

- [ ] DPA, subprocessor list, data residency, retention, deletion, breach notice, and security schedule match implementation.
- [ ] SSO, lifecycle provisioning, RBAC, tenant isolation, audit export, and support access are tested when contracted.
- [ ] SOC 2/ISO claims link to current evidence and scope; marketing does not imply an unearned certification.
- [ ] Customer security commitments have owners, expiry/review dates, and change notification.

## Employment, credit, and high-impact eligibility

- [ ] Decision type, affected parties, jurisdiction, prohibited factors, notice, explanation, appeal, and human-review duties are decided by counsel.
- [ ] Inputs and proxies are reviewed for lawful relevance; protected-class and disparate-impact evaluations use an approved method.
- [ ] Users can correct source data and contest consequential outcomes without being routed through the same automated decision.
- [ ] Model/data changes, overrides, complaints, outcome disparities, and adverse-action clocks are monitored and auditable.

## Approval

- Active pack(s):
- Governing jurisdiction/control set:
- Compliance/legal owner:
- Residual-risk authority:
- Decision: `APPROVED` / `WAITING` / `CHANGES REQUIRED`
- Date:
- Evidence:
