import { layoutGraph, edgeLabels } from "./layout.mjs"
const base = document.body.dataset.base || ""
const el = (tag, attrs = {}, text) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  if (text !== undefined) e.textContent = text
  return e
}
const searchDialog = document.querySelector("#search-dialog"),
  search = document.querySelector("#site-search")
let searchData
const searchResults = document.querySelector("#search-results")
async function showSearch() {
  searchDialog.showModal()
  search.focus()
  try {
    searchData ||= await fetch(base + "/reader-index.json").then((r) => {
      if (!r.ok) throw Error()
      return r.json()
    })
    renderSearch()
  } catch {
    searchResults.textContent = "검색 데이터를 불러오지 못했습니다."
  }
}
function renderSearch() {
  if (!searchData) return
  const query = search.value.normalize("NFC").toLowerCase().trim()
  searchResults.replaceChildren()
  if (!query) return
  const terms = query.split(/\s+/)
  const rows = searchData
    .map((n) => {
      const title = (n.title + " " + n.aliases.join(" ") + " " + n.keywords.join(" ")).toLowerCase()
      const all = title + " " + n.text.toLowerCase()
      return {
        ...n,
        score: terms.every((t) => all.includes(t))
          ? terms.reduce((s, t) => s + (title.includes(t) ? 5 : 1), 0)
          : 0,
      }
    })
    .filter((n) => n.score)
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
    .slice(0, 40)
  for (const n of rows) {
    const a = el("a", { href: n.url }, n.title)
    a.prepend(el("small", {}, n.type + " · " + n.date.slice(0, 10) + " "))
    searchResults.append(a)
  }
  if (!rows.length) searchResults.textContent = "검색 결과 없음"
}
document.querySelector("#search-open")?.addEventListener("click", showSearch)
search?.addEventListener("input", renderSearch)
searchDialog?.addEventListener("click", (e) => {
  if (e.target === searchDialog) searchDialog.close()
})
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault()
    if (!searchDialog.open) showSearch()
  }
})
document.querySelector("#copy-feed")?.addEventListener("click", async () => {
  const input = document.querySelector("#feed-url"),
    status = document.querySelector("#copy-status")
  try {
    await navigator.clipboard.writeText(input.value)
    status.textContent = "복사했습니다."
  } catch {
    input.focus()
    input.select()
    status.textContent = "주소를 선택했습니다. 복사해 주세요."
  }
})

const root = document.querySelector("#knowledge-map")
if (root)
  initGraph().catch(() => {
    root.textContent = "지도를 불러오지 못했습니다."
  })
async function initGraph() {
  const response = await fetch(base + "/knowledge-graph.json")
  if (!response.ok) throw Error("Graph unavailable")
  const graph = await response.json()
  let nodes = graph.nodes.map((n) => ({ ...n })),
    selected = null,
    onlyNeighbors = false
  const toolbar = el("div", { class: "map-toolbar" }),
    input = el("input", {
      type: "search",
      "aria-label": "지식 키워드 검색",
      placeholder: "키워드 검색",
    }),
    results = el("div", { class: "map-results" })
  toolbar.append(input)
  const button = (label, action) => {
    const b = el("button", {}, label)
    b.addEventListener("click", action)
    toolbar.append(b)
    return b
  }
  const neighbor = button("연결만 보기", () => {
    onlyNeighbors = !onlyNeighbors
    neighbor.setAttribute("aria-pressed", String(onlyNeighbors))
    paint()
    fit()
  })
  neighbor.disabled = true
  neighbor.setAttribute("aria-pressed", "false")
  button("전체", () => {
    selected = null
    onlyNeighbors = false
    neighbor.disabled = true
    neighbor.setAttribute("aria-pressed", "false")
    history.replaceState({}, "", location.pathname)
    paint()
    fit()
    details()
  })
  button("자동 배치", () => {
    nodes = layoutGraph(graph)
    paint()
    fit()
  })
  const stage = el("div", { class: "map-stage" }),
    aside = el("aside", { class: "map-detail", "aria-label": "선택한 개념", "aria-live": "polite" })
  const ns = "http://www.w3.org/2000/svg",
    svgEl = (tag, attrs) => {
      const n = document.createElementNS(ns, tag)
      for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v)
      return n
    }
  const svg = svgEl("svg", {
    "aria-label": "연결 관계에 따른 자동 배치 지도",
    role: "group",
    tabindex: "0",
  })
  const zoom = el("div", { class: "map-zoom" })
  for (const [label, action] of [
    ["확대", () => scale(0.8)],
    ["축소", () => scale(1.25)],
    ["화면 맞춤", () => fit()],
  ]) {
    const b = el(
      "button",
      { "aria-label": label },
      label === "확대" ? "+" : label === "축소" ? "−" : "맞춤",
    )
    b.addEventListener("click", action)
    zoom.append(b)
  }
  stage.append(svg, zoom)
  const layout = el("div", { class: "map-layout" })
  layout.append(stage, aside)
  root.append(toolbar, results, layout)
  let view = [-900, -700, 1800, 1400]
  const apply = () => svg.setAttribute("viewBox", view.join(" "))
  const ids = () =>
    new Set([
      selected,
      ...graph.edges
        .filter((e) => e.source === selected || e.target === selected)
        .flatMap((e) => [e.source, e.target]),
    ])
  const visible = () => (onlyNeighbors && selected ? nodes.filter((n) => ids().has(n.id)) : nodes)
  function fit() {
    const list = selected ? nodes.filter((n) => ids().has(n.id)) : visible()
    if (!list.length) return
    const x0 = Math.min(...list.map((n) => n.x - n.width / 2)) - 65,
      y0 = Math.min(...list.map((n) => n.y - 45)) - 65,
      x1 = Math.max(...list.map((n) => n.x + n.width / 2)) + 65,
      y1 = Math.max(...list.map((n) => n.y + 45)) + 65
    const ratio = stage.clientWidth / stage.clientHeight
    let w = x1 - x0,
      h = y1 - y0
    if (w / h < ratio) w = h * ratio
    else h = w / ratio
    view = [(x0 + x1 - w) / 2, (y0 + y1 - h) / 2, w, h]
    apply()
  }
  function scale(f, point) {
    const p = point || [view[0] + view[2] / 2, view[1] + view[3] / 2]
    if (view[2] * f < 250 || view[2] * f > 12000) return
    view = [p[0] + (view[0] - p[0]) * f, p[1] + (view[1] - p[1]) * f, view[2] * f, view[3] * f]
    apply()
  }
  function details() {
    aside.replaceChildren()
    if (!selected) {
      aside.append(el("h2", {}, "지식 지도"))
      const groups = new Map()
      for (const n of nodes) {
        if (!groups.has(n.group)) groups.set(n.group, [])
        groups.get(n.group).push(n)
      }
      for (const [group, list] of groups) {
        aside.append(el("h3", {}, group))
        for (const n of list) {
          const b = el("button", { class: "concept-pick" }, n.label)
          b.addEventListener("click", () => select(n.id))
          aside.append(b)
        }
      }
      return
    }
    const n = nodes.find((n) => n.id === selected)
    aside.append(
      el("h2", {}, n.label),
      el("p", {}, n.definition),
      el("a", { href: base + "/" + n.slug }, "개념 읽기 →"),
      el("p", { class: "keywords" }, n.keywords.join(" · ")),
    )
    for (const edge of graph.edges.filter((e) => e.source === selected || e.target === selected)) {
      const other = nodes.find(
        (n) => n.id === (edge.source === selected ? edge.target : edge.source),
      )
      const row = el("div", { class: "relation" }),
        b = el(
          "button",
          {},
          `${edge.source === selected ? "→" : "←"} ${edgeLabels[edge.type]} · ${other.label}`,
        )
      b.addEventListener("click", () => select(other.id))
      row.append(b, el("p", {}, edge.reason))
      const citations = el("p", { class: "evidence" })
      citations.append(
        document.createTextNode(edge.basis === "inference" ? "해석 근거: " : "원문: "),
      )
      edge.evidence.forEach((u, i) => {
        citations.append(
          el(
            "a",
            { href: u, target: "_blank", rel: "noopener" },
            new URL(u).hostname.replace(/^www\./, ""),
          ),
        )
        if (i < edge.evidence.length - 1) citations.append(" · ")
      })
      row.append(citations)
      aside.append(row)
    }
  }
  function select(id) {
    if (!nodes.some((n) => n.id === id)) return
    selected = id
    neighbor.disabled = false
    history.replaceState({}, "", location.pathname + "?focus=" + encodeURIComponent(id))
    paint()
    details()
    fit()
  }
  function paint() {
    svg.replaceChildren()
    const neighbors = ids(),
      shown = new Set(visible().map((n) => n.id)),
      lookup = new Map(nodes.map((n) => [n.id, n]))
    const defs = svgEl("defs"),
      marker = svgEl("marker", {
        id: "arrow",
        viewBox: "0 0 10 10",
        refX: "8",
        refY: "5",
        markerWidth: "6",
        markerHeight: "6",
        orient: "auto-start-reverse",
      })
    marker.append(svgEl("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "context-stroke" }))
    defs.append(marker)
    svg.append(defs)
    for (const e of graph.edges) {
      if (!shown.has(e.source) || !shown.has(e.target)) continue
      const a = lookup.get(e.source),
        b = lookup.get(e.target),
        dx = b.x - a.x,
        dy = b.y - a.y
      const trim = (n) =>
        Math.min(
          (n.width / 2 + 9) / Math.max(Math.abs(dx), 0.001),
          (n.height / 2 + 9) / Math.max(Math.abs(dy), 0.001),
          0.45,
        )
      const ta = trim(a),
        tb = trim(b),
        active = selected && (e.source === selected || e.target === selected)
      const line = svgEl("line", {
        x1: a.x + dx * ta,
        y1: a.y + dy * ta,
        x2: b.x - dx * tb,
        y2: b.y - dy * tb,
        class: "graph-edge " + (active ? "active" : selected ? "dim" : ""),
        "data-source": e.source,
        "data-target": e.target,
        "data-type": e.type,
        "marker-end": "url(#arrow)",
      })
      const title = svgEl("title")
      title.textContent = `${a.label} → ${edgeLabels[e.type]} → ${b.label}: ${e.reason}`
      line.append(title)
      svg.append(line)
    }
    for (const n of visible()) {
      const g = svgEl("g", {
        transform: `translate(${n.x},${n.y})`,
        class:
          "graph-node " +
          (selected === n.id ? "selected" : selected && !neighbors.has(n.id) ? "dim" : ""),
        "data-node": n.id,
        role: "button",
        tabindex: "0",
        "aria-label": n.label,
        "aria-pressed": String(selected === n.id),
      })
      g.append(svgEl("rect", { x: -n.width / 2, y: -29, width: n.width, height: 58, rx: 29 }))
      const t = svgEl("text", { "text-anchor": "middle", y: "5" })
      t.textContent = n.label
      g.append(t)
      g.addEventListener("click", () => {
        if (!suppressClick) select(n.id)
      })
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          select(n.id)
        }
      })
      svg.append(g)
    }
    apply()
  }
  input.addEventListener("input", () => {
    const q = input.value.normalize("NFC").toLowerCase().trim()
    results.replaceChildren()
    if (!q) return
    const found = nodes.filter((n) =>
      [n.label, n.title, ...n.keywords, ...n.aliases].join(" ").toLowerCase().includes(q),
    )
    for (const n of found) {
      const b = el("button", {}, n.label)
      b.addEventListener("click", () => {
        select(n.id)
        input.value = ""
        results.replaceChildren()
      })
      results.append(b)
    }
    if (!found.length) results.textContent = "검색 결과 없음"
  })
  const point = (e) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse())
    return [p.x, p.y]
  }
  let drag = null,
    suppressClick = false
  svg.addEventListener("pointerdown", (e) => {
    const id = e.target.closest("[data-node]")?.getAttribute("data-node")
    suppressClick = false
    drag = {
      id,
      start: point(e),
      client: [e.clientX, e.clientY],
      view: [...view],
      node: id ? { ...nodes.find((n) => n.id === id) } : null,
      moved: false,
    }
    svg.setPointerCapture(e.pointerId)
  })
  svg.addEventListener("pointermove", (e) => {
    if (!drag) return
    const p = point(e)
    drag.moved ||= Math.hypot(e.clientX - drag.client[0], e.clientY - drag.client[1]) > 5
    if (drag.id) {
      const n = nodes.find((n) => n.id === drag.id)
      n.x = drag.node.x + p[0] - drag.start[0]
      n.y = drag.node.y + p[1] - drag.start[1]
      paint()
    } else {
      const w = stage.clientWidth,
        h = stage.clientHeight
      view[0] = drag.view[0] - ((e.clientX - drag.client[0]) * view[2]) / w
      view[1] = drag.view[1] - ((e.clientY - drag.client[1]) * view[3]) / h
      apply()
    }
  })
  svg.addEventListener("pointerup", () => {
    suppressClick = !!drag?.moved
    if (drag?.id && !drag.moved) select(drag.id)
    drag = null
  })
  svg.addEventListener("pointercancel", () => (drag = null))
  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault()
      scale(Math.exp(Math.max(-100, Math.min(100, e.deltaY)) * 0.003), point(e))
    },
    { passive: false },
  )
  svg.addEventListener("keydown", (e) => {
    if (e.target !== svg) return
    const d = { ArrowLeft: [-50, 0], ArrowRight: [50, 0], ArrowUp: [0, -50], ArrowDown: [0, 50] }[
      e.key
    ]
    if (d) {
      e.preventDefault()
      view[0] += d[0]
      view[1] += d[1]
      apply()
    }
    if (e.key === "+") scale(0.8)
    if (e.key === "-") scale(1.25)
  })
  paint()
  fit()
  details()
  new ResizeObserver(() => fit()).observe(stage)
  const initial = new URLSearchParams(location.search).get("focus")
  if (initial) select(initial)
  root.dataset.ready = "true"
}
