import fs from "node:fs"
import { performance } from "node:perf_hooks"
import { layoutGraph } from "../web/layout.mjs"

// Layout-only benchmark; synthetic nodes never enter the vault or the published graph.
const actual = JSON.parse(fs.readFileSync("public/knowledge-graph.json", "utf8"))
const synthetic = { nodes: [], edges: [] }
for (let i = 0; i < 1000; i++) {
  synthetic.nodes.push({ id: "fixture:" + i, size: i % 25 === 0 ? 6 : 2 })
  for (const offset of i % 5 === 0 ? [1, 2, 25] : [1, 2])
    synthetic.edges.push({
      source: "fixture:" + i,
      target: "fixture:" + ((i + offset) % 1000),
      weight: 1,
    })
}
const results = []
for (const [name, data] of [
  ["actual-archive", actual],
  ["synthetic-layout-only", synthetic],
]) {
  const start = performance.now()
  const nodes = layoutGraph(data, 600)
  results.push({
    name,
    nodes: nodes.length,
    edges: data.edges.length,
    iterations: 600,
    elapsedMs: Math.round(performance.now() - start),
    allFinite: nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
  })
}
console.log(
  JSON.stringify({ runtime: process.version, platform: process.platform, results }, null, 2),
)
