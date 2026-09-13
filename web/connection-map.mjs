import Sigma from "sigma"
import { UndirectedGraph } from "graphology"
import { relatedNews, normalizeTerm, resolveFocus } from "./graph-model.mjs"
const el = (tag, attrs = {}, text) => {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  if (text !== undefined) node.textContent = text
  return node
}
const kindName = { concept: "전문 용어" }
let graphRequest
export async function mountConnections(root) {
  const base = document.body.dataset.base || "",
    version = document.body.dataset.assets || "2"
  const full = root.dataset.mode === "full",
    mapURL = base + "/knowledge-maps/ai-technology-knowledge-map"
  graphRequest ||= fetch(base + "/knowledge-graph.json?v=" + version, { cache: "no-cache" })
    .then((r) => {
      if (!r.ok) throw Error("Connection data unavailable")
      return r.json()
    })
    .catch((e) => {
      graphRequest = null
      throw e
    })
  const data = await graphRequest,
    byId = new Map(data.nodes.map((n) => [n.id, n])),
    graph = new UndirectedGraph({ allowSelfLoops: false })
  for (const n of data.nodes) graph.addNode(n.id, { ...n })
  for (const e of data.edges)
    graph.addEdgeWithKey(e.id, e.source, e.target, { ...e, size: 0.85, color: "#56666c" })
  let selected = null,
    hovered = null,
    onlyNeighbors = false,
    renderer,
    worker,
    dragging,
    dragOrigin,
    dragMoved = false,
    newsLimit = 12
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches
  const toolbar = el("div", { class: "connection-toolbar" }),
    query = el("input", {
      type: "search",
      class: "graph-query",
      "aria-label": "전문 용어 검색",
      placeholder: "전문 용어 검색",
      autocomplete: "off",
    })
  const results = el("div", { class: "graph-search-results", "aria-label": "지도 검색 결과" })
  const stage = el("div", { class: "connection-stage" }),
    canvas = el("div", {
      class: "connection-canvas",
      tabindex: "0",
      role: "img",
      "aria-label": "전문 용어 연결 지도. 방향키로 이동하고 더하기와 빼기로 확대를 조절합니다.",
    })
  const detail = el("aside", {
    class: "connection-detail",
    "aria-label": "관련 뉴스",
    "aria-live": "polite",
  })
  const status = el("p", { class: "graph-status", role: "status" }),
    directory = el("details", { class: "node-directory" }),
    directoryList = el("div", { class: "node-list" })
  directory.append(el("summary", {}, "용어 목록 · " + data.nodes.length), directoryList)
  const button = (label, fn, parent = toolbar) => {
    const b = el("button", { type: "button" }, label)
    b.addEventListener("click", fn)
    parent.append(b)
    return b
  }
  toolbar.append(query)
  const neighborsButton = button("연결만", () => {
    onlyNeighbors = !onlyNeighbors
    neighborsButton.setAttribute("aria-pressed", String(onlyNeighbors))
    refresh()
  })
  neighborsButton.disabled = true
  neighborsButton.setAttribute("aria-pressed", "false")
  button("전체", () => {
    select(null)
    renderer?.getCamera().animatedReset({ duration: reducedMotion ? 0 : 250 })
  })
  const layoutButton = button("다시 배치", () => recompute())
  const fullLink = !full ? el("a", { href: mapURL, class: "map-expand" }, "크게 보기 ↗") : null
  if (fullLink) toolbar.append(fullLink)
  const layout = el("div", { class: "connection-layout" }),
    controls = el("div", { class: "connection-controls" }),
    zoom = el("output", { "aria-label": "지도 확대 비율" }, "100%")
  button(
    "+",
    () => renderer?.getCamera().animatedZoom({ duration: reducedMotion ? 0 : 180 }),
    controls,
  ).setAttribute("aria-label", "지도 확대")
  button(
    "−",
    () => renderer?.getCamera().animatedUnzoom({ duration: reducedMotion ? 0 : 180 }),
    controls,
  ).setAttribute("aria-label", "지도 축소")
  button(
    "맞춤",
    () => renderer?.getCamera().animatedReset({ duration: reducedMotion ? 0 : 180 }),
    controls,
  )
  controls.append(zoom)
  stage.append(canvas, controls)
  layout.append(stage, detail)
  const legend = el("div", { class: "connection-legend" })
  legend.append(el("span", { "data-kind": "concept" }, "전문 용어 " + data.nodes.length))
  legend.append(el("span", { class: "edge-count" }, "연결 " + data.edges.length))
  root.replaceChildren(toolbar, results, layout, legend, status, directory)
  function refresh() {
    renderer?.refresh()
    root.dataset.selectedNode = selected || ""
  }
  function focusNode(id) {
    if (!renderer) return
    const display = renderer.getNodeDisplayData(id)
    if (display)
      renderer
        .getCamera()
        .animate({ x: display.x, y: display.y, ratio: 0.42 }, { duration: reducedMotion ? 0 : 300 })
  }
  function select(id, focus = false) {
    if (id && !byId.has(id)) return
    selected = id
    newsLimit = 12
    neighborsButton.disabled = !id || !renderer
    if (!id) {
      onlyNeighbors = false
      neighborsButton.setAttribute("aria-pressed", "false")
    }
    if (full) {
      const u = new URL(location.href)
      id ? u.searchParams.set("focus", id) : u.searchParams.delete("focus")
      history.replaceState({}, "", u)
    }
    if (fullLink) fullLink.href = mapURL + (id ? "?focus=" + encodeURIComponent(id) : "")
    refresh()
    showNews()
    updateDirectory()
    if (focus && id) focusNode(id)
  }
  function story(article, showVia = true) {
    const row = el("div", { class: "map-story" }),
      a = el("a", { href: base + "/" + article.slug }, article.title)
    row.append(el("time", { datetime: article.date }, article.date), a)
    if (article.description)
      row.append(
        el("p", {}, article.description.replace(/`([^`]+)`/g, "$1").replace(/[,;\s]+$/, "")),
      )
    if (showVia && article.via)
      row.append(
        el(
          "span",
          { class: "story-via" },
          article.distance === 1 ? article.via : article.via + " 연결",
        ),
      )
    return row
  }
  function showNews() {
    detail.replaceChildren()
    const node = selected && byId.get(selected)
    const stories = node
      ? relatedNews(data, selected)
      : [...data.articles].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6)
    if (node) {
      detail.append(
        el("span", { class: "selected-kind" }, kindName[node.kind]),
        el("h2", {}, node.label),
      )
      if (node.definition) detail.append(el("p", { class: "node-definition" }, node.definition))
      detail.append(
        el("a", { class: "concept-reading", href: base + "/" + node.slug }, "용어 읽기 ↗"),
      )
      detail.append(el("h3", {}, "관련 뉴스 · " + stories.length))
    } else detail.append(el("h2", {}, "최근 뉴스"))
    for (const article of stories.slice(0, newsLimit)) detail.append(story(article, !!node))
    if (!stories.length)
      detail.append(el("p", { class: "empty-news" }, "현재 연결된 뉴스가 없습니다."))
    if (stories.length > newsLimit)
      button(
        "뉴스 더 보기",
        () => {
          newsLimit += 12
          showNews()
        },
        detail,
      )
    if (node) {
      const related = graph.neighbors(selected).map((id) => byId.get(id))
      if (related.length) {
        const links = el("div", { class: "related-node-links" })
        detail.append(el("h3", {}, "연결된 용어"), links)
        for (const n of related) button(n.label, () => select(n.id, true), links)
      }
    }
    detail.scrollTop = 0
  }
  function updateDirectory() {
    directoryList.replaceChildren()
    for (const n of data.nodes) {
      const b = button(
        n.label,
        () => {
          select(n.id, true)
          canvas.focus()
        },
        directoryList,
      )
      b.setAttribute("aria-pressed", String(n.id === selected))
      b.dataset.kind = n.kind
    }
  }
  query.addEventListener("input", () => {
    results.replaceChildren()
    const q = normalizeTerm(query.value)
    if (!q) return
    const rows = data.nodes
      .filter((n) => normalizeTerm([n.label, n.title, ...n.aliases].join(" ")).includes(q))
      .sort(
        (a, b) =>
          Number(normalizeTerm(b.label) === q) - Number(normalizeTerm(a.label) === q) ||
          b.degree - a.degree,
      )
      .slice(0, 12)
    for (const n of rows)
      button(
        n.label + " · " + kindName[n.kind],
        () => {
          select(n.id, true)
          query.value = ""
          results.replaceChildren()
          query.focus()
        },
        results,
      )
    if (!rows.length) results.append(el("p", {}, "검색 결과 없음"))
  })
  query.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const b = results.querySelector("button")
      if (b) {
        e.preventDefault()
        b.click()
      }
    }
    if (e.key === "Escape") {
      query.value = ""
      results.replaceChildren()
    }
  })
  function drawLabel(ctx, node, settings) {
    if (!node.label) return
    const label = node.label.length > 34 ? node.label.slice(0, 33) + "…" : node.label
    ctx.font = `${settings.labelSize}px ${settings.labelFont}`
    ctx.lineWidth = 4
    ctx.strokeStyle = "#0b1117"
    ctx.lineJoin = "round"
    ctx.strokeText(label, node.x + node.size + 5, node.y + 4)
    ctx.fillStyle = "#d9e4e4"
    ctx.fillText(label, node.x + node.size + 5, node.y + 4)
  }
  try {
    renderer = new Sigma(graph, canvas, {
      allowInvalidContainer: false,
      enableCameraRotation: false,
      minCameraRatio: 0.05,
      maxCameraRatio: 2.5,
      stagePadding: full ? 42 : 24,
      labelFont: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif',
      labelSize: 12,
      labelColor: { color: "#d9e4e4" },
      labelDensity: 1,
      labelGridCellSize: 90,
      labelRenderedSizeThreshold: 0,
      defaultEdgeType: "line",
      defaultNodeType: "circle",
      renderEdgeLabels: false,
      minEdgeThickness: 0.5,
      hideLabelsOnMove: true,
      zIndex: true,
      defaultDrawNodeLabel: drawLabel,
      defaultDrawNodeHover: (ctx, node, settings) => {
        ctx.save()
        ctx.shadowColor = node.color
        ctx.shadowBlur = 16
        ctx.fillStyle = node.color
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.size + 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        drawLabel(ctx, node, settings)
      },
      nodeReducer: (id, attrs) => {
        const data = { ...attrs },
          active = selected || hovered
        if (active) {
          const near = id === active || graph.hasEdge(active, id)
          if (!near) {
            data.color = "#273039"
            data.label = ""
            data.hidden = onlyNeighbors
          }
          if (id === active) {
            data.size = Math.max(7, attrs.size * 1.3)
            data.color = "#f2df99"
            data.highlighted = true
            data.forceLabel = true
            data.zIndex = 2
          } else if (near) {
            data.forceLabel = attrs.kind === "concept"
            data.zIndex = 1
          }
        }
        return data
      },
      edgeReducer: (id, attrs) => {
        const data = { ...attrs },
          active = selected || hovered
        if (active) {
          const [a, b] = graph.extremities(id),
            near = a === active || b === active
          data.color = near ? "#9eafa8" : "#1b252c"
          data.size = near ? 0.95 : 0.4
          data.hidden = onlyNeighbors && !near
        }
        return data
      },
    })
    root.dataset.engine = "sigma-webgl"
    renderer.on("clickNode", ({ node }) => {
      if (!dragMoved) select(node)
    })
    renderer.on("enterNode", ({ node }) => {
      hovered = node
      canvas.style.cursor = "pointer"
      refresh()
    })
    renderer.on("leaveNode", () => {
      hovered = null
      canvas.style.cursor = "grab"
      refresh()
    })
    renderer.on("clickStage", () => {
      if (!dragMoved) select(null)
    })
    renderer.on("downNode", ({ node, event }) => {
      dragging = node
      dragOrigin = { x: event.x, y: event.y }
      dragMoved = false
      renderer.getCamera().disable()
      if (!renderer.getCustomBBox()) renderer.setCustomBBox(renderer.getBBox())
    })
    const drag = (point, event) => {
      if (!dragging || !point) return
      dragMoved ||= Math.hypot(point.x - dragOrigin.x, point.y - dragOrigin.y) > 4
      const p = renderer.viewportToGraph(point)
      graph.mergeNodeAttributes(dragging, p)
      event.preventSigmaDefault()
      event.original.preventDefault()
      event.original.stopPropagation()
    }
    renderer.getMouseCaptor().on("mousemovebody", (e) => drag(e, e))
    renderer.getTouchCaptor().on("touchmovebody", (e) => drag(e.touches[0], e))
    const endDrag = () => {
      dragging = null
      renderer.getCamera().enable()
      setTimeout(() => {
        dragMoved = false
      }, 0)
    }
    renderer.getMouseCaptor().on("mouseup", endDrag)
    renderer.getTouchCaptor().on("touchup", endDrag)
    renderer.getCamera().on("updated", (state) => {
      zoom.value = Math.round(100 / state.ratio) + "%"
    })
    canvas.addEventListener("keydown", (e) => {
      const camera = renderer.getCamera(),
        state = camera.getState(),
        distance = state.ratio * 0.07
      const offsets = {
        ArrowLeft: [-distance, 0],
        ArrowRight: [distance, 0],
        ArrowUp: [0, distance],
        ArrowDown: [0, -distance],
      }
      if (offsets[e.key]) {
        e.preventDefault()
        camera.setState({ x: state.x + offsets[e.key][0], y: state.y + offsets[e.key][1] })
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault()
        camera.animatedZoom({ duration: 0 })
      }
      if (e.key === "-") {
        e.preventDefault()
        camera.animatedUnzoom({ duration: 0 })
      }
      if (e.key === "Escape") select(null)
    })
  } catch {
    renderer?.kill()
    renderer = null
    canvas.replaceChildren(
      el(
        "p",
        { class: "graph-fallback" },
        "이 브라우저에서는 그래픽 지도를 표시할 수 없습니다. 용어 목록에서 관련 뉴스를 볼 수 있습니다.",
      ),
    )
    root.dataset.engine = "list"
    directory.open = true
    for (const b of controls.querySelectorAll("button")) b.disabled = true
    layoutButton.disabled = true
  }
  function recompute() {
    if (!renderer) return
    worker?.terminate()
    layoutButton.disabled = true
    layoutButton.setAttribute("aria-busy", "true")
    status.textContent = "연결 관계에 따라 배치 중…"
    const fail = () => {
      status.textContent = "다시 배치하지 못했습니다. 현재 지도를 유지합니다."
      layoutButton.disabled = false
      layoutButton.removeAttribute("aria-busy")
      worker?.terminate()
    }
    try {
      worker = new Worker(base + "/map-layout.worker.js?v=" + version, { type: "module" })
    } catch {
      fail()
      return
    }
    worker.onerror = fail
    worker.onmessage = ({ data: result }) => {
      if (result.error) {
        fail()
        return
      }
      renderer.setCustomBBox(null)
      for (const n of result.nodes)
        graph.mergeNodeAttributes(n.id, { x: n.x, y: n.y, color: n.color })
      renderer.refresh()
      renderer.getCamera().animatedReset({ duration: reducedMotion ? 0 : 250 })
      status.textContent = "배치 완료"
      layoutButton.disabled = false
      layoutButton.removeAttribute("aria-busy")
      worker.terminate()
      worker = null
    }
    worker.postMessage(data)
  }
  const initial = resolveFocus(
    data,
    full ? new URLSearchParams(location.search).get("focus") : root.dataset.focus,
  )
  select(initial)
  if (initial) focusNode(initial)
  root.dataset.ready = "true"
  window.addEventListener("pagehide", (event) => {
    worker?.terminate()
    worker = null
    layoutButton.disabled = !renderer
    layoutButton.removeAttribute("aria-busy")
    if (!event.persisted) renderer?.kill()
  })
}
