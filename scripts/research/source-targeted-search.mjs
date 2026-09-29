import { sha256 } from "./contracts.mjs"
import { researchSlots, validateSearchQueries } from "./search.mjs"

const sectorTerms = {
  ko: ["인공지능", "클라우드", "보안", "반도체", "로봇", "에너지", "바이오", "우주"],
  en: ["AI", "cloud", "security", "semiconductor", "robotics", "energy", "biotech", "space"],
  ja: [
    "人工知能",
    "クラウド",
    "セキュリティ",
    "半導体",
    "ロボット",
    "エネルギー",
    "バイオ",
    "宇宙",
  ],
  zh: ["人工智能", "云计算", "网络安全", "半导体", "机器人", "能源", "生物技术", "航天"],
  de: [
    "KI",
    "Cloud",
    "Sicherheit",
    "Halbleiter",
    "Robotik",
    "Energie",
    "Biotechnologie",
    "Raumfahrt",
  ],
}
const axisTerms = {
  ko: ["기술 연구", "실적 투자"],
  en: ["technology research", "earnings investment"],
  ja: ["技術ニュース", "決算ニュース"],
  zh: ["技术研究", "财报投资"],
  de: ["Technologie Forschung", "Investitionen Unternehmen"],
}

function sourceType(route) {
  if (
    route.watch_groups?.includes("companies") ||
    route.watch_groups?.includes("robot_manufacturers")
  )
    return "company"
  if (route.kind === "filing-ir" || route.kind === "regulator") return "regulator"
  if (
    route.watch_groups?.includes("institutions") ||
    ["research", "commercialization"].includes(route.kind)
  )
    return "institution"
  if (/press|media|journal/.test(route.kind || "")) return "press"
  return "other"
}

export function targetedSourceQueries(coverage, routes, day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "") || new Date(day).toISOString().slice(0, 10) !== day)
    throw Error("Valid targeted search day required")
  const slots = researchSlots()
  if (
    !Array.isArray(coverage) ||
    coverage.length !== slots.length ||
    slots.some(
      (slot) =>
        coverage.filter((cell) =>
          ["sector", "region", "axis"].every((key) => cell[key] === slot[key]),
        ).length !== 1,
    )
  )
    throw Error("Complete daily coverage grid required for targeted search")
  const queries = [],
    unresolved = []
  for (const [sectorIndex, slot] of slots.entries()) {
    const cell = coverage.find((item) =>
      ["sector", "region", "axis"].every((key) => item[key] === slot[key]),
    )
    if (cell.status === "partial") continue
    if (!["not_attempted", "failed"].includes(cell.status))
      throw Error("Invalid targeted search coverage status")
    const preferences =
      slot.axis === "기술·제품"
        ? ["institution", "press", "company", "regulator", "other"]
        : ["company", "regulator", "press", "institution", "other"]
    const candidates = routes
      .filter(
        (route) =>
          route.sectors?.includes(slot.sector) &&
          route.region === slot.region &&
          route.axis === slot.axis &&
          sectorTerms[route.language],
      )
      .map((route) => ({ route, type: sourceType(route), host: new URL(route.url).hostname }))
      .sort(
        (a, b) =>
          preferences.indexOf(a.type) - preferences.indexOf(b.type) ||
          sha256(`${day}:${slot.slot_id}:${a.route.channel_id}`).localeCompare(
            sha256(`${day}:${slot.slot_id}:${b.route.channel_id}`),
          ),
      )
    const first = candidates[0]
    const relevantTypes =
      slot.axis === "기술·제품"
        ? ["institution", "press", "company", "regulator"]
        : ["company", "regulator", "press"]
    const otherHost = (candidate) => candidate.host !== first?.host
    const second =
      candidates.find(
        (candidate) =>
          otherHost(candidate) &&
          candidate.type !== first?.type &&
          relevantTypes.includes(candidate.type),
      ) ||
      candidates.find((candidate) => otherHost(candidate) && candidate.type === first?.type) ||
      candidates.find(otherHost)
    const chosen = [first, second].filter(Boolean)
    if (!chosen.length) unresolved.push(slot.slot_id)
    for (const [n, { route, type, host }] of chosen.entries()) {
      const language = route.language
      const axis = slot.axis === "기술·제품" ? 0 : 1
      const sector = Math.floor(sectorIndex / 4)
      queries.push({
        ...slot,
        slot_id: `target-${slot.slot_id}-${n}`,
        scope: "registered-source",
        source_channel_id: route.channel_id,
        source_type: type,
        source_url: route.url,
        language,
        query: `site:${host} ${sectorTerms[language][sector]} ${axisTerms[language][axis]} ${day.slice(0, 4)}`,
      })
    }
  }
  if (queries.length) validateSearchQueries(queries)
  return { queries, unresolved }
}
