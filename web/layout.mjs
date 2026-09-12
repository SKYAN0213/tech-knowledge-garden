import { forceSimulation, forceManyBody, forceLink, forceX, forceY, forceCollide } from "d3-force"
function rectangleCollision(nodes) {
  return () => {
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j],
          dx = b.x + b.vx - a.x - a.vx,
          dy = b.y + b.vy - a.y - a.vy
        const ox = (a.width + b.width) / 2 + 24 - Math.abs(dx),
          oy = 84 - Math.abs(dy)
        if (ox > 0 && oy > 0) {
          if (ox < oy) {
            const d = ox * 0.45 * (dx < 0 ? -1 : 1)
            a.vx -= d
            b.vx += d
          } else {
            const d = oy * 0.45 * (dy < 0 ? -1 : 1)
            a.vy -= d
            b.vy += d
          }
        }
      }
  }
}
export function layoutGraph(input, iterations = 700) {
  const nodes = input.nodes
    .map((n) => ({ ...n, x: undefined, y: undefined, width: n.width || 220, height: 58 }))
    .sort((a, b) => a.id.localeCompare(b.id))
  const known = new Set(nodes.map((n) => n.id))
  const links = input.edges.map((e) => {
    if (!known.has(e.source) || !known.has(e.target)) throw Error("Unknown graph endpoint")
    return { ...e }
  })
  const adjacency = new Map(nodes.map((n) => [n.id, []]))
  for (const e of links) {
    adjacency.get(e.source).push(e.target)
    adjacency.get(e.target).push(e.source)
  }
  const components = [],
    membership = new Map()
  for (const n of nodes)
    if (!membership.has(n.id)) {
      const queue = [n.id],
        group = []
      membership.set(n.id, components.length)
      while (queue.length) {
        const id = queue.pop()
        group.push(id)
        for (const other of adjacency.get(id))
          if (!membership.has(other)) {
            membership.set(other, components.length)
            queue.push(other)
          }
      }
      components.push(group)
    }
  const centers = components.map((c, i) =>
    components.length === 1
      ? [0, 0]
      : [
          Math.cos((i * 2 * Math.PI) / components.length) * Math.max(600, components.length * 90),
          Math.sin((i * 2 * Math.PI) / components.length) * Math.max(600, components.length * 90),
        ],
  )
  const sim = forceSimulation(nodes)
    .stop()
    .force("charge", forceManyBody().strength(-450))
    .force(
      "links",
      forceLink(links)
        .id((n) => n.id)
        .distance((e) => (e.type === "scope" ? 150 : e.type === "contrast" ? 240 : 180))
        .strength((e) => (e.type === "contrast" ? 0.08 : 0.28)),
    )
    .force("collision", rectangleCollision(nodes))
    .force("x", forceX((n) => centers[membership.get(n.id)][0]).strength(0.08))
    .force("y", forceY((n) => centers[membership.get(n.id)][1]).strength(0.08))
  for (let i = 0; i < iterations; i++) sim.tick()
  // Final rectangle separation protects labels, even when adding disconnected concepts.
  for (let k = 0; k < 120; k++) {
    let moved = false
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j],
          dx = b.x - a.x,
          dy = b.y - a.y
        const ox = (a.width + b.width) / 2 + 20 - Math.abs(dx),
          oy = (a.height + b.height) / 2 + 24 - Math.abs(dy)
        if (ox > 0 && oy > 0) {
          moved = true
          if (ox < oy) {
            const d = ((ox + 0.1) / 2) * (dx < 0 ? -1 : 1)
            a.x -= d
            b.x += d
          } else {
            const d = ((oy + 0.1) / 2) * (dy < 0 ? -1 : 1)
            a.y -= d
            b.y += d
          }
        }
      }
    if (!moved) break
  }
  return nodes.map(({ vx, vy, index, ...n }) => n)
}
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
