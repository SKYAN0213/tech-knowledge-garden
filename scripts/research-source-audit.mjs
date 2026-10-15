import { parseArgs } from "node:util"
import { auditSourceRoutes } from "./research/source-route-audit.mjs"
const { values } = parseArgs({ options: { run: { type: "string" }, root: { type: "string" }, channel: { type: "string", multiple: true }, concurrency: { type: "string", default: "6" } } })
try {
  const report = await auditSourceRoutes({ runId: values.run, root: values.root, channels: values.channel || [], concurrency: Number(values.concurrency) })
  console.log(JSON.stringify({ run_id: report.run_id, status: report.status, examined_routes: report.examined_routes, report: `runs/${report.run_id}/route-audit/report.json`, statuses: Object.fromEntries([...new Set(report.routes.map((row) => row.status))].map((status) => [status, report.routes.filter((row) => row.status === status).length])) }, null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
