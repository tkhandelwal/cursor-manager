# AI assurance checklist

Use only when the AI profile is on. When AI is off, record one checklist-level `N/A — AI profile off` in the gate record; do not manufacture model artifacts. If a model, LLM, embedding, RAG flow, agent, or generated decision appears later, halt and re-open intake.

Each active row requires `PASS`, `WAITING`, or `BLOCKED` and an evidence path. Active AI rows cannot be N/A.

| Stage | Required AI evidence | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Intended uses, excluded uses, users, affected non-users, and prohibited reliance are explicit |  |  |
| 1 | Measurable product and AI-quality success/kill criteria are set |  |  |
| 2 | Harm taxonomy records severity, likelihood, affected party, mitigation, and residual-risk owner |  |  |
| 2 | High-impact automated decisions have a named human review and appeal path |  |  |
| 3 | Every training, tuning, retrieval, and evaluation corpus has provenance, license, purpose, retention, and PII classification |  |  |
| 3 | Held-out evaluation set exists before implementation or tuning begins |  |  |
| 3 | Leakage and contamination risks between training/tuning and holdout data are addressed |  |  |
| 4 | Threat model covers direct and indirect prompt injection, retrieval poisoning, sensitive-data disclosure, model extraction, denial of wallet/service, tool abuse, and excessive agency |  |  |
| 5 | Model/provider choice, trust boundary, data-use terms, fallback, and portability decision are recorded |  |  |
| 5 | Guardrails and human-in-the-loop points are tied to named risks—not described generically |  |  |
| 5 | Model-path kill switch is separate from the application kill switch |  |  |
| 5 | Tool calls use allowlists, least privilege, bounded inputs/outputs, and confirmation for consequential actions |  |  |
| 6 | Model, system prompt, templates, tools, retrieval configuration, and evaluation dataset versions are traceable to the release |  |  |
| 6 | Evaluation harness and pass/fail thresholds are committed before tuning starts |  |  |
| 6 | Model output is treated as untrusted input before rendering, execution, storage, or tool use |  |  |
| 7 | Functional quality, hallucination, refusal, safety, latency, and cost are measured against the held-out set |  |  |
| 7 | Red-team suite covers jailbreaks, injection, exfiltration, poisoning, unsafe tools, and domain harms |  |  |
| 7 | Security and quality regressions block release in CI at the agreed risk-tier depth |  |  |
| 7 | Human review tests verify escalation, override, appeal, and safe failure |  |  |
| 8 | Model card names version, provider, intended/excluded uses, limitations, evaluations, residual risks, and owner |  |  |
| 8 | Rollout is staged; rollback restores model, prompt, tools, and retrieval configuration together |  |  |
| 8 | Production alerts cover evaluation thresholds, unsafe output, drift, abuse, latency, and cost |  |  |
| 9 | Drift, hallucination, refusal, abuse, and human-override rates have thresholds and owners |  |  |
| 9 | Model-degradation incident runbook is distinct from service-outage response |  |  |
| 9 | Feedback and production traces have privacy, access, and retention controls |  |  |
| 10 | Every model, prompt, tool, or retrieval change is classified and re-evaluated before production |  |  |
| 10 | Material data/model changes re-enter stage 3; architecture changes re-enter stage 5 |  |  |
| 10 | Incidents update threat models, tests, thresholds, and prohibited-use guidance |  |  |

## Gate summary

- AI profile: `ON`
- AI owner:
- Model/provider:
- Evaluation suite/version:
- Model card:
- Residual risks accepted by:
- Decision: `APPROVED` / `CHANGES REQUIRED`
- Date:
