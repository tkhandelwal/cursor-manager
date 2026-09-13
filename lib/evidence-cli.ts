import { collectFromFs, formatEvidenceReport } from "./evidence"

const issues = collectFromFs(process.cwd())
const report = formatEvidenceReport(issues)
if (issues.length > 0) {
  console.error(report)
  process.exit(1)
}
console.log(report)
