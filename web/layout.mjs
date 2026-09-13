import { UndirectedGraph } from "graphology"
import forceAtlas2 from "graphology-layout-forceatlas2"
import louvain from "graphology-communities-louvain"
export const palette = [
  "#e7ce82",
  "#82c7b4",
  "#86badd",
  "#beabc9",
  "#b4c882",
  "#dca783",
  "#94bebf",
  "#cfb2ba",
  "#a7b4da",
  "#bdd3a6",
]
export function toGraph(input, seedPositions = false) {
  const graph = new UndirectedGraph({ allowSelfLoops: false })
  const nodes = [...input.nodes].sort((a, b) => a.id.localeCompare(b.id, "en"))
  nodes.forEach((n, i) => {
    const angle = i * Math.PI * (3 - Math.sqrt(5)),
      radius = Math.sqrt(i + 1) * 8
    graph.addNode(n.id, {
      ...n,
      x: seedPositions || !Number.isFinite(n.x) ? Math.cos(angle) * radius : n.x,
      y: seedPositions || !Number.isFinite(n.y) ? Math.sin(angle) * radius : n.y,
      size: n.size || 2,
    })
  })
  for (const e of input.edges) {
    if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) throw Error("Unknown graph endpoint")
    if (e.source === e.target) throw Error("Self association")
    if (!graph.hasEdge(e.source, e.target))
      graph.addEdge(e.source, e.target, { ...e, weight: e.weight || 1 })
  }
  return graph
}
export function layoutGraph(input, iterations = 600) {
  const graph = toGraph(input, true)
  if (graph.order > 1)
    forceAtlas2.assign(graph, {
      iterations,
      settings: {
        ...forceAtlas2.inferSettings(graph),
        barnesHutOptimize: graph.order > 300,
        adjustSizes: true,
        gravity: 0.3,
        scalingRatio: 6,
        slowDown: 3,
        strongGravityMode: false,
        linLogMode: false,
      },
    })
  const communities = graph.order ? louvain(graph, { randomWalk: false, resolution: 0.85 }) : {}
  return graph.nodes().map((id) => {
    const n = graph.getNodeAttributes(id)
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) throw Error("Non-finite graph layout")
    return {
      ...n,
      community: communities[id] || 0,
      color: palette[(communities[id] || 0) % palette.length],
    }
  })
}
// Historical types remain readable in Obsidian, while the website uses undirected associations.
export const edgeLabels = {
  uses: "활용",
  implements: "구현",
  evaluates: "평가",
  observes: "관측",
  controls: "통제",
  scope: "속함",
  contrast: "대비",
  informs: "근거 제공",
}
