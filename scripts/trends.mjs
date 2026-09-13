import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"

const text = (s) => typeof s === "string" && s.trim().length > 0
const day = (s) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s
const id = (s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)
const unique = (xs) => [...new Set(xs)]
const fail = (message) => {
  throw Error("Trend review: " + message)
}
function records(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => {
      const f = path.join(dir, e.name)
      if (e.isSymbolicLink()) fail("symlink " + f)
      if (e.isDirectory()) return records(f)
      if (!e.name.endsWith(".md")) return []
      const m = fs.readFileSync(f, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)
      if (!m) fail("missing metadata " + f)
      return [{ ...YAML.parse(m[1]), file: f }]
    })
}

// An explicit review ledger is different from no record. Raw authoring notes are never web pages.
export function loadTrends(vault, issues, { requireLatest = true } = {}) {
  const topics = records(path.join(vault, "TrendTopics"))
  const reviews = records(path.join(vault, "Signals"))
  const byTopic = new Map(),
    byIssue = new Map(issues.map((i, order) => [i.key, { ...i, order }])),
    byReview = new Map(),
    bySignal = new Map()
  for (const t of topics) {
    if (t.schema_version !== "tech-trend/v1" || !id(t.id) || byTopic.has(t.id))
      fail("invalid or duplicate topic " + t.file)
    for (const k of ["title", "question", "thesis", "watch_for", "disconfirming"])
      if (!text(t[k])) fail(`${t.id}: missing ${k}`)
    if (!day(t.reviewed)) fail(t.id + ": invalid review date")
    if (!Array.isArray(t.knowledge_notes) || !Array.isArray(t.lessons))
      fail(t.id + ": missing knowledge_notes/lessons")
    for (const k of t.knowledge_notes) {
      if (!/^Knowledge\/(?!.*(?:^|\/)\.\.(?:\/|$))[^\n]+$/.test(k))
        fail(t.id + ": invalid knowledge path")
      const f = path.join(vault, k + ".md")
      if (!fs.existsSync(f) || fs.lstatSync(f).isSymbolicLink())
        fail(t.id + ": missing knowledge " + k)
      const m = fs.readFileSync(f, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)
      if (!m || YAML.parse(m[1]).entry_type !== "concept")
        fail(t.id + ": knowledge must be an atomic concept")
    }
    byTopic.set(t.id, t)
  }
  for (const r of reviews) {
    const issue = byIssue.get(r.edition)
    if (r.schema_version !== "tech-signals/v1" || !issue || byReview.has(r.edition))
      fail("invalid or duplicate issue review " + r.file)
    if (
      r.date !== issue.date ||
      !day(r.reviewed) ||
      r.reviewed < r.date ||
      !["saved-coverage", "primary-research"].includes(r.review_basis)
    )
      fail("invalid review provenance " + r.file)
    if (!Array.isArray(r.observations)) fail("observations must be an explicit array " + r.file)
    const pairs = new Set()
    for (const s of r.observations) {
      const item = issue.items.find((i) => i.id === s.event_id)
      const pair = s.topic_id + ":" + s.event_id
      if (!id(s.id) || bySignal.has(s.id) || !byTopic.has(s.topic_id) || !item || pairs.has(pair))
        fail("invalid/duplicate observation or source event " + s.id)
      for (const k of ["change", "meaning", "limit", "next_check"])
        if (!text(s[k])) fail(`${s.id}: missing ${k}`)
      if (!["support", "challenge", "context"].includes(s.stance)) fail(s.id + ": invalid stance")
      pairs.add(pair)
      bySignal.set(s.id, {
        ...s,
        date: r.date,
        reviewed: r.reviewed,
        review_basis: r.review_basis,
        issue: r.edition,
        order: issue.order,
        article: item,
      })
    }
    byReview.set(r.edition, r)
  }
  for (const t of topics) {
    const lessonIds = new Set()
    for (const l of t.lessons) {
      const refs = (l.signal_ids || []).map((s) => bySignal.get(s))
      if (
        !id(l.id) ||
        lessonIds.has(l.id) ||
        !text(l.claim) ||
        !text(l.limit) ||
        !day(l.reviewed) ||
        l.reviewed > t.reviewed ||
        refs.some((s) => !s || s.topic_id !== t.id || s.reviewed > l.reviewed) ||
        unique(refs.map((s) => s?.event_id)).length < 2 ||
        unique(refs.map((s) => s?.date)).length < 2
      )
        fail(t.id + ": lesson needs reviewed evidence from two distinct events and dates: " + l.id)
      lessonIds.add(l.id)
    }
  }
  if (topics.length && requireLatest && issues.length && !byReview.has(issues.at(-1).key))
    fail("latest issue needs a Signals review (observations: [] is a valid reviewed result)")
  return {
    topics,
    reviews: byReview,
    signals: [...bySignal.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    issues: byIssue,
  }
}

export function trendSnapshot(data, issueKey) {
  const issue = data.issues.get(issueKey)
  if (!issue) fail("unknown snapshot issue " + issueKey)
  const signals = data.signals.filter((s) => s.order <= issue.order)
  const end = Date.parse(issue.date + "T00:00:00Z"),
    inDays = (date, start, stop) => {
      const age = (end - Date.parse(date + "T00:00:00Z")) / 86400000
      return age >= start && age < stop
    }
  const topics = data.topics
    .map((t) => {
      const history = signals.filter((s) => s.topic_id === t.id)
      const firstEvents = new Map()
      for (const s of history) if (!firstEvents.has(s.event_id)) firstEvents.set(s.event_id, s)
      const events = [...firstEvents.values()]
      const lessons = t.lessons.filter(
        (l) =>
          l.reviewed <= issue.date && l.signal_ids.every((id) => history.some((s) => s.id === id)),
      )
      return {
        ...t,
        history,
        latest: history.at(-1),
        events: events.length,
        days: unique(events.map((s) => s.date)).length,
        recent: events.filter((s) => inDays(s.date, 0, 7)).length,
        previous: events.filter((s) => inDays(s.date, 7, 14)).length,
        lessons,
      }
    })
    .filter((t) => t.history.length)
    .sort((a, b) => b.latest.order - a.latest.order || a.title.localeCompare(b.title))
  const windowIssues = [...data.issues.values()].filter(
    (i) => i.order <= issue.order && inDays(i.date, 0, 7),
  )
  return {
    date: issue.date,
    topics,
    today: signals
      .filter((s) => s.issue === issueKey)
      .sort(
        (a, b) =>
          issue.items.findIndex((i) => i.id === a.event_id) -
          issue.items.findIndex((i) => i.id === b.event_id),
      ),
    review: data.reviews.get(issueKey) || null,
    coverage: {
      reviewed: windowIssues.filter((i) => data.reviews.has(i.key)).length,
      total: windowIssues.length,
    },
  }
}

export const stanceLabel = (s) => ({ support: "관측", challenge: "반대·제약", context: "참고" })[s]
