import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ALLOWED_DECISIONS,
  REQUIRED_ARTIFACTS,
  collectEvidenceIssues,
  collectFromFs,
  formatEvidenceReport,
} from "./evidence"

const filledArtifacts = (): Record<string, string | null> => {
  const files: Record<string, string | null> = {}
  for (const artifact of REQUIRED_ARTIFACTS) {
    files[artifact.path] = artifact.mustInclude.join("\n")
  }
  files["docs/gates/GATE-RECORD.md"] = unsignedGateRecord()
  return files
}

function unsignedGateRecord(): string {
  return `# Gate record

## Run identity

- Spec ID:
- Product:
- Product class:
- Risk tier: \`T0\` / \`T1\` / \`T2\` / \`T3\`
- Active profiles:
- Capability flags:
- PM:
- Named human merger:
- Production authority:
- Repository / worktree:

## Stage decisions

Allowed decisions:

- \`APPROVED\`
- \`CHANGES REQUIRED\`
- \`WAITING\`
- \`SUPERSEDED\`

| Record ID | Stage | Decision | Risk tier / profiles | Signer and authority | UTC date | Evidence paths / URLs | Conditions, waits, or supersedes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G-0001 | 0 — Intake |  |  |  |  | \`docs/checklists/profiles.md\` |  |
`
}

test("required artifacts are named paths with content markers", () => {
  const paths = REQUIRED_ARTIFACTS.map((artifact) => artifact.path)
  assert.ok(paths.includes("docs/PIPELINE.md"))
  assert.ok(paths.includes("docs/gates/GATE-RECORD.md"))
  assert.ok(paths.includes(".github/workflows/ci.yml"))
  assert.ok(paths.includes("plugin/commands/conductor.md"))
  for (const artifact of REQUIRED_ARTIFACTS) {
    assert.ok(artifact.mustInclude.length > 0, `${artifact.path} needs markers`)
  }
})

test("missing required artifacts are defects", () => {
  const files = filledArtifacts()
  files["docs/PIPELINE.md"] = null
  const issues = collectEvidenceIssues({ files })
  assert.ok(issues.some((issue) => issue.path === "docs/PIPELINE.md" && /missing/i.test(issue.message)))
})

test("required artifacts that omit mandated markers are defects", () => {
  const files = filledArtifacts()
  files["docs/PIPELINE.md"] = "no markers here"
  const issues = collectEvidenceIssues({ files })
  assert.ok(issues.some((issue) => issue.path === "docs/PIPELINE.md" && /marker/i.test(issue.message)))
})

test("unsigned gate rows do not fail the check", () => {
  const issues = collectEvidenceIssues({ files: filledArtifacts() })
  assert.deepEqual(issues, [])
})

test("an unsigned later stage is allowed because policy is not enforcement", () => {
  const files = filledArtifacts()
  files["docs/runs/demo/GATE-RECORD.md"] = `# Gate record

## Run identity

- Spec ID: demo
- Product: Demo
- Product class: plugin-only
- Risk tier: T1
- Active profiles: core
- Capability flags: none
- PM: Ada
- Named human merger: Ada
- Production authority:
- Repository / worktree: .

## Stage decisions

- \`APPROVED\`
- \`CHANGES REQUIRED\`
- \`WAITING\`
- \`SUPERSEDED\`

| Record ID | Stage | Decision | Risk tier / profiles | Signer and authority | UTC date | Evidence paths / URLs | Conditions, waits, or supersedes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G-0001 | 6 — Implementation |  | T1 / core |  |  | \`docs/PIPELINE.md\` |  |
`
  assert.deepEqual(collectEvidenceIssues({ files }), [])
})

test("unknown gate decisions are malformed metadata", () => {
  const files = filledArtifacts()
  files["docs/runs/demo/GATE-RECORD.md"] = unsignedGateRecord().replace(
    "| G-0001 | 0 — Intake |  |",
    "| G-0001 | 0 — Intake | OK |",
  )
  const issues = collectEvidenceIssues({ files })
  assert.ok(issues.some((issue) => /OK/.test(issue.message)))
  for (const allowed of ALLOWED_DECISIONS) {
    assert.ok(!issues.some((issue) => issue.message.includes(`invalid ${allowed}`)))
  }
})

test("APPROVED rows require a human signer, date, and evidence", () => {
  const files = filledArtifacts()
  files["docs/runs/demo/GATE-RECORD.md"] = unsignedGateRecord().replace(
    "| G-0001 | 0 — Intake |  |  |  |  | `docs/checklists/profiles.md` |  |",
    "| G-0001 | 0 — Intake | APPROVED | T1 / core |  |  |  |  |",
  )
  const issues = collectEvidenceIssues({ files })
  assert.ok(issues.some((issue) => /signer/i.test(issue.message)))
  assert.ok(issues.some((issue) => /date/i.test(issue.message)))
  assert.ok(issues.some((issue) => /evidence/i.test(issue.message)))
})

test("an agent cannot be recorded as an APPROVED signer", () => {
  const files = filledArtifacts()
  files["docs/runs/demo/GATE-RECORD.md"] = unsignedGateRecord().replace(
    "| G-0001 | 0 — Intake |  |  |  |  | `docs/checklists/profiles.md` |  |",
    "| G-0001 | 0 — Intake | APPROVED | T1 / core | Cursor Agent / PM | 2026-09-13 | `docs/checklists/profiles.md` |  |",
  )
  const issues = collectEvidenceIssues({ files })
  assert.ok(issues.some((issue) => /agent/i.test(issue.message)))
})

test("WAITING rows require an owner in the conditions column", () => {
  const files = filledArtifacts()
  files["docs/runs/demo/GATE-RECORD.md"] = unsignedGateRecord().replace(
    "| G-0001 | 0 — Intake |  |  |  |  | `docs/checklists/profiles.md` |  |",
    "| G-0001 | 0 — Intake | WAITING | T1 / core | Ada / PM | 2026-09-13 | `docs/checklists/profiles.md` |  |",
  )
  const issues = collectEvidenceIssues({ files })
  assert.ok(issues.some((issue) => /owner/i.test(issue.message)))
})

test("WAITING rows with an owner pass", () => {
  const files = filledArtifacts()
  files["docs/runs/demo/GATE-RECORD.md"] = unsignedGateRecord().replace(
    "| G-0001 | 0 — Intake |  |  |  |  | `docs/checklists/profiles.md` |  |",
    "| G-0001 | 0 — Intake | WAITING | T1 / core | Ada / PM | 2026-09-13 | `docs/checklists/profiles.md` | Owner: counsel; DNS evidence; review 2026-10-01 |",
  )
  assert.deepEqual(collectEvidenceIssues({ files }), [])
})

test("repo-relative evidence paths must exist", () => {
  const files = filledArtifacts()
  files["docs/runs/demo/GATE-RECORD.md"] = unsignedGateRecord().replace(
    "`docs/checklists/profiles.md`",
    "`docs/missing-evidence.md`",
  )
  const issues = collectEvidenceIssues({ files })
  assert.ok(issues.some((issue) => /docs\/missing-evidence\.md/.test(issue.message)))
})

test("URL evidence is accepted without a local file", () => {
  const files = filledArtifacts()
  files["docs/runs/demo/GATE-RECORD.md"] = unsignedGateRecord().replace(
    "`docs/checklists/profiles.md`",
    "https://cursor.directory/plugins/cursor-manager",
  )
  assert.deepEqual(collectEvidenceIssues({ files }), [])
})

test("bare N/A status is malformed; typed N/A is allowed", () => {
  const files = filledArtifacts()
  files["docs/checklists/ai-assurance.md"] = `# AI
Held-out evaluation set

| Stage | Required AI evidence | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Intended uses | N/A |  |
`
  let issues = collectEvidenceIssues({ files })
  assert.ok(issues.some((issue) => /typed N\/A/i.test(issue.message)))

  files["docs/checklists/ai-assurance.md"] = `# AI
Held-out evaluation set

| Stage | Required AI evidence | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Intended uses | N/A — AI profile off |  |
`
  issues = collectEvidenceIssues({ files })
  assert.equal(
    issues.filter((issue) => issue.path === "docs/checklists/ai-assurance.md").length,
    0,
  )
})

test("empty checklist status is allowed because policy is not enforcement", () => {
  const files = filledArtifacts()
  files["docs/checklists/ai-assurance.md"] = `# AI
Held-out evaluation set

| Stage | Required AI evidence | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Intended uses |  |  |
`
  assert.equal(
    collectEvidenceIssues({ files }).filter((issue) => issue.path === "docs/checklists/ai-assurance.md").length,
    0,
  )
})

test("formatEvidenceReport lists each issue", () => {
  const report = formatEvidenceReport([
    { path: "docs/PIPELINE.md", message: "missing required artifact" },
    { path: "docs/runs/demo/GATE-RECORD.md", message: "G-0001 has unknown decision OK" },
  ])
  assert.match(report, /2 issues/)
  assert.match(report, /docs\/PIPELINE.md/)
  assert.match(report, /unknown decision/)
})

test("this repository's evidence tree is structurally valid", () => {
  const issues = collectFromFs(process.cwd())
  assert.deepEqual(issues, [], formatEvidenceReport(issues))
})
