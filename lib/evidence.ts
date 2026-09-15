import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

export type EvidenceIssue = {
  path: string
  message: string
}

export const ALLOWED_DECISIONS = ["APPROVED", "CHANGES REQUIRED", "WAITING", "SUPERSEDED"] as const

export const ALLOWED_STATUSES = ["PASS", "WAITING", "BLOCKED"] as const

export type RequiredArtifact = {
  path: string
  mustInclude: string[]
}

export const REQUIRED_ARTIFACTS: RequiredArtifact[] = [
  {
    path: "docs/PIPELINE.md",
    mustInclude: ["/conductor", "## Enforcement", "npm run evidence", "does not approve gates"],
  },
  {
    path: "docs/ARC-STATUS.md",
    mustInclude: ["Agreed delivery plan", "Evidence automation"],
  },
  {
    path: "docs/checklists/profiles.md",
    mustInclude: ["Product class", "Risk tier", "Capability flags"],
  },
  {
    path: "docs/checklists/commercializable-app.md",
    mustInclude: ["Universal commercial rows"],
  },
  {
    path: "docs/checklists/ai-assurance.md",
    mustInclude: ["Held-out evaluation set"],
  },
  {
    path: "docs/checklists/regulated.md",
    mustInclude: ["engineering evidence map"],
  },
  {
    path: "docs/gates/GATE-RECORD.md",
    mustInclude: ["Named human merger", "APPROVED", "WAITING", "SUPERSEDED"],
  },
  {
    path: "docs/gates/BRANCH-PROTECTION.md",
    mustInclude: ["main-conductor-protection", "23189136", "verify"],
  },
  {
    path: ".github/pull_request_template.md",
    mustInclude: ["Gate record", "Named human merger"],
  },
  {
    path: ".github/workflows/ci.yml",
    mustInclude: ["npm test", "npm run evidence"],
  },
  {
    path: ".cursor/rules/pipeline-gates.mdc",
    mustInclude: ["policy, not enforcement"],
  },
  {
    path: "README.md",
    mustInclude: ["/conductor"],
  },
  {
    path: "plugin/commands/conductor.md",
    mustInclude: ["Do not resubmit"],
  },
  {
    path: "package.json",
    mustInclude: ['"evidence"'],
  },
]

const IDENTITY_LABELS = [
  "Spec ID",
  "Product class",
  "Risk tier",
  "Active profiles",
  "Capability flags",
  "PM",
  "Named human merger",
]

const GATE_HEADERS = [
  "Record ID",
  "Stage",
  "Decision",
  "Risk tier / profiles",
  "Signer and authority",
  "UTC date",
  "Evidence paths / URLs",
  "Conditions, waits, or supersedes",
]

export function formatEvidenceReport(issues: EvidenceIssue[]): string {
  if (issues.length === 0) {
    return "Evidence artifacts and gate metadata are structurally valid. Unsigned stages are allowed."
  }
  const lines = issues.map((issue) => `- ${issue.path}: ${issue.message}`)
  return `Evidence check failed (${issues.length} issues):\n${lines.join("\n")}`
}

export function collectEvidenceIssues(input: {
  files: Record<string, string | null>
  pathExists?: (repoPath: string) => boolean
}): EvidenceIssue[] {
  const issues: EvidenceIssue[] = []
  const { files, pathExists } = input

  const exists = (repoPath: string): boolean => {
    if (pathExists) {
      return pathExists(repoPath)
    }
    return typeof files[repoPath] === "string"
  }

  for (const artifact of REQUIRED_ARTIFACTS) {
    const body = files[artifact.path]
    if (typeof body !== "string") {
      issues.push({ path: artifact.path, message: "missing required artifact" })
      continue
    }
    for (const marker of artifact.mustInclude) {
      if (!body.includes(marker)) {
        issues.push({
          path: artifact.path,
          message: `missing required marker ${JSON.stringify(marker)}`,
        })
      }
    }
  }

  for (const [path, body] of Object.entries(files)) {
    if (typeof body !== "string") {
      continue
    }
    if (isGateRecordPath(path)) {
      issues.push(...validateGateRecord(path, body, exists))
    }
    issues.push(...validateChecklistStatuses(path, body))
  }

  return issues
}

export function collectFromFs(root: string): EvidenceIssue[] {
  const files: Record<string, string | null> = {}
  for (const artifact of REQUIRED_ARTIFACTS) {
    files[artifact.path] = readIfPresent(join(root, artifact.path))
  }
  for (const path of listRunGateRecords(root)) {
    files[path] = readIfPresent(join(root, path))
  }
  return collectEvidenceIssues({
    files,
    pathExists: (repoPath) => existsSync(join(root, repoPath)),
  })
}

function readIfPresent(absPath: string): string | null {
  return existsSync(absPath) ? readFileSync(absPath, "utf8") : null
}

function listRunGateRecords(root: string): string[] {
  const runsDir = join(root, "docs", "runs")
  if (!existsSync(runsDir)) {
    return []
  }
  const records: string[] = []
  for (const entry of readdirSync(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    const relative = `docs/runs/${entry.name}/GATE-RECORD.md`
    if (existsSync(join(root, relative))) {
      records.push(relative)
    }
  }
  return records
}

function isGateRecordPath(path: string): boolean {
  return /(^|\/)GATE-RECORD\.md$/.test(path.replace(/\\/g, "/"))
}

function validateGateRecord(
  path: string,
  markdown: string,
  exists: (repoPath: string) => boolean,
): EvidenceIssue[] {
  const issues: EvidenceIssue[] = []
  for (const label of IDENTITY_LABELS) {
    if (!markdown.includes(`${label}:`)) {
      issues.push({ path, message: `missing identity field ${label}` })
    }
  }

  const tables = parseMarkdownTables(markdown)
  const gateTable = tables.find((table) => headerIndex(table.headers, "Record ID") >= 0)
  if (!gateTable) {
    issues.push({ path, message: "missing stage-decision table" })
    return issues
  }

  for (const header of GATE_HEADERS) {
    if (headerIndex(gateTable.headers, header) < 0) {
      issues.push({ path, message: `missing table column ${header}` })
    }
  }

  const idIdx = headerIndex(gateTable.headers, "Record ID")
  const decisionIdx = headerIndex(gateTable.headers, "Decision")
  const signerIdx = headerIndex(gateTable.headers, "Signer and authority")
  const dateIdx = headerIndex(gateTable.headers, "UTC date")
  const evidenceIdx = headerIndex(gateTable.headers, "Evidence paths / URLs")
  const conditionsIdx = headerIndex(gateTable.headers, "Conditions, waits, or supersedes")
  if (idIdx < 0 || decisionIdx < 0) {
    return issues
  }

  for (const row of gateTable.rows) {
    const recordId = row[idIdx]?.trim() ?? ""
    const decision = row[decisionIdx]?.trim() ?? ""
    const signer = signerIdx >= 0 ? (row[signerIdx]?.trim() ?? "") : ""
    const date = dateIdx >= 0 ? (row[dateIdx]?.trim() ?? "") : ""
    const evidence = evidenceIdx >= 0 ? (row[evidenceIdx]?.trim() ?? "") : ""
    const conditions = conditionsIdx >= 0 ? (row[conditionsIdx]?.trim() ?? "") : ""
    const prefix = recordId || "unnamed row"

    if (decision && !isAllowedDecision(decision)) {
      issues.push({ path, message: `${prefix} has unknown decision ${decision}` })
      continue
    }

    if (decision === "APPROVED") {
      if (!signer) {
        issues.push({ path, message: `${prefix} APPROVED row is missing a signer` })
      } else if (/\bagent\b/i.test(signer)) {
        issues.push({ path, message: `${prefix} APPROVED signer cannot be an agent` })
      }
      if (!date) {
        issues.push({ path, message: `${prefix} APPROVED row is missing a date` })
      }
      if (!evidence) {
        issues.push({ path, message: `${prefix} APPROVED row is missing evidence` })
      }
    }

    if (decision === "WAITING" && !/\bowner\b/i.test(conditions)) {
      issues.push({ path, message: `${prefix} WAITING row is missing an owner in conditions` })
    }

    if (decision === "CHANGES REQUIRED" && !signer) {
      issues.push({ path, message: `${prefix} CHANGES REQUIRED row is missing a signer` })
    }

    if (decision === "SUPERSEDED" && !conditions) {
      issues.push({ path, message: `${prefix} SUPERSEDED row is missing the replaced record` })
    }

    for (const evidencePath of extractRepoPaths(evidence)) {
      if (!exists(evidencePath)) {
        issues.push({ path, message: `${prefix} evidence path does not exist: ${evidencePath}` })
      }
    }
  }

  return issues
}

function validateChecklistStatuses(path: string, markdown: string): EvidenceIssue[] {
  const issues: EvidenceIssue[] = []
  for (const table of parseMarkdownTables(markdown)) {
    const statusIdx = headerIndex(table.headers, "Status")
    if (statusIdx < 0) {
      continue
    }
    table.rows.forEach((row, index) => {
      const status = row[statusIdx]?.trim() ?? ""
      if (!status) {
        return
      }
      if (isAllowedStatus(status)) {
        return
      }
      issues.push({
        path,
        message: `row ${index + 1} has malformed status ${status}; use PASS, WAITING, BLOCKED, or typed N/A`,
      })
    })
  }
  return issues
}

function isAllowedDecision(value: string): boolean {
  return (ALLOWED_DECISIONS as readonly string[]).includes(value)
}

function isAllowedStatus(value: string): boolean {
  if ((ALLOWED_STATUSES as readonly string[]).includes(value)) {
    return true
  }
  return /^N\/A\s+—\s+\S/.test(value)
}

function extractRepoPaths(cell: string): string[] {
  const fromTicks = [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1])
  const fromBare = [...cell.matchAll(/(?:^|\s)((?:docs|\.cursor|\.github|plugin|lib|components)\/[A-Za-z0-9._/-]+)/g)].map(
    (match) => match[1],
  )
  const unique = new Set<string>()
  for (const candidate of [...fromTicks, ...fromBare]) {
    if (/^https?:\/\//i.test(candidate)) {
      continue
    }
    unique.add(candidate.replace(/\\/g, "/"))
  }
  return [...unique]
}

type MarkdownTable = {
  headers: string[]
  rows: string[][]
}

function parseMarkdownTables(markdown: string): MarkdownTable[] {
  const lines = markdown.split(/\r?\n/)
  const tables: MarkdownTable[] = []
  let index = 0
  while (index < lines.length) {
    const headerCells = splitRow(lines[index] ?? "")
    const separatorCells = splitRow(lines[index + 1] ?? "")
    if (headerCells.length < 2 || !isSeparatorRow(separatorCells)) {
      index += 1
      continue
    }
    const rows: string[][] = []
    index += 2
    while (index < lines.length) {
      const cells = splitRow(lines[index] ?? "")
      if (cells.length < 2 || isSeparatorRow(cells)) {
        break
      }
      rows.push(cells)
      index += 1
    }
    tables.push({ headers: headerCells, rows })
  }
  return tables
}

function splitRow(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed.startsWith("|")) {
    return []
  }
  const parts = trimmed.split("|")
  return parts.slice(1, trimmed.endsWith("|") ? -1 : undefined).map((cell) => cell.trim())
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell))
}

function headerIndex(headers: string[], name: string): number {
  return headers.findIndex((header) => header.toLowerCase() === name.toLowerCase())
}
