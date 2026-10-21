import fs from "node:fs"
import { sha256, assertSchema } from "./contracts.mjs"
import { safePath } from "./run-state.mjs"

const text = { type: "string", minLength: 1, maxLength: 1500, pattern: "\\S" }
const evidence = {
  type: "object",
  additionalProperties: false,
  required: ["material_id", "block_id", "quote"],
  properties: {
    material_id: text,
    block_id: text,
    quote: { ...text, minLength: 8, maxLength: 4000 },
  },
}
export const compositionProfileSchema = {
  type: "object",
  additionalProperties: false,
  required: ["organizations", "topics", "information_units"],
  properties: {
    organizations: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "evidence"],
        properties: { name: { ...text, maxLength: 200 }, evidence },
      },
    },
    topics: { type: "array", maxItems: 8, uniqueItems: true, items: { ...text, maxLength: 200 } },
    information_units: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["statement", "evidence"],
        properties: { statement: text, evidence },
      },
    },
  },
}
const normalize = (s) => s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ")
export function validateCompositionProfile(profile, sources) {
  if (!profile) return
  assertSchema(profile, compositionProfileSchema)
  for (const row of [...profile.organizations, ...profile.information_units]) {
    const cite = row.evidence
    const source = sources.find((s) => s.material_id === cite.material_id)
    const block = source?.blocks.find((b) => b.block_id === cite.block_id)
    if (!block || !block.text.includes(cite.quote))
      throw Error("Composition assessment requires the exact original evidence")
    if (row.name && !normalize(cite.quote).includes(normalize(row.name)))
      throw Error("Composition organization must be named in its cited source")
  }
  for (const key of ["organizations", "topics", "information_units"]) {
    const values = profile[key].map((row) =>
      normalize(typeof row === "string" ? row : row.name || row.statement),
    )
    if (new Set(values).size !== values.length) throw Error("Duplicate composition assessment item")
  }
}
export function readBriefingCompositionPolicy(ctx) {
  const file = safePath(ctx.repo, "data/research-briefing-composition-policy.json")
  const value = JSON.parse(fs.readFileSync(file))
  if (
    value.schema !== "research-briefing-composition-policy/v1" ||
    !value.version ||
    Object.keys(value).some(
      (key) =>
        ![
          "schema",
          "version",
          "near_score_band",
          "organization_repeat_weight",
          "topic_repeat_weight",
        ].includes(key),
    ) ||
    ["near_score_band", "organization_repeat_weight", "topic_repeat_weight"].some(
      (key) => !Number.isInteger(value[key]) || value[key] < 0 || value[key] > 10,
    )
  )
    throw Error("Invalid briefing composition policy")
  return value
}

// Literal reviewed names and subjects are grouping hints, never entity aliases
// or technology/market growth claims. Only reviewed semantic information units
// can justify holding an otherwise eligible event for repeated briefing content.
export function selectBriefingComposition(ranked, candidates, profiles, policy, limits) {
  const byId = new Map(candidates.map((c) => [c.candidate_id, c]))
  // Reuse is a native approved article, not proof of prior publication. At
  // equal editorial scores prefer its completed work over another writer;
  // score bands, repetition penalties and duplicate-event checks still apply.
  const approvedReuse = (item) => {
    const candidate = byId.get(item.candidate_id)
    return candidate?.action === "reuse" && candidate.prior?.run_id ? 1 : 0
  }
  const remaining = [...ranked].sort(
    (a, b) =>
      b.score - a.score ||
      approvedReuse(b) - approvedReuse(a) ||
      a.candidate_id.localeCompare(b.candidate_id),
  )
  const selected = [],
    held = [],
    decisions = []
  const organizations = new Map(),
    topics = new Map(),
    sectors = new Map(),
    identities = new Set(),
    units = new Set()
  const dimensions = (item) => {
    const candidate = byId.get(item.candidate_id),
      profile = profiles.get(item.candidate_id)
    return {
      organizations: (profile
        ? profile.organizations.map((r) => r.name)
        : [candidate.identity.who]
      ).map(normalize),
      topics: (profile?.topics.length ? profile.topics : ["sector:" + item.sector]).map(normalize),
      units: profile?.information_units.map((u) => sha256(normalize(u.statement))) || [],
    }
  }
  const repeatPenalty = (item) => {
    const d = dimensions(item)
    return (
      d.organizations.reduce(
        (sum, key) => sum + (organizations.get(key) || 0) * policy.organization_repeat_weight,
        0,
      ) +
      d.topics.reduce((sum, key) => sum + (topics.get(key) || 0) * policy.topic_repeat_weight, 0)
    )
  }
  while (remaining.length) {
    // Quotas and identity checks apply before ranking the remaining eligible
    // alternatives. A blocked high-score item must not distort the score band.
    for (let i = remaining.length - 1; i >= 0; i--) {
      const item = remaining[i],
        candidate = byId.get(item.candidate_id),
        d = dimensions(item)
      const reason = identities.has(candidate.identity_key)
        ? "event_identity_collision_requires_review"
        : selected.length >= limits.max_articles
          ? "article_budget"
          : (sectors.get(item.sector) || 0) >= limits.max_per_sector
            ? "sector_budget"
            : d.units.length && d.units.every((u) => units.has(u))
              ? "no_additional_reviewed_information"
              : null
      if (reason) {
        held.push({ ...item, reason })
        remaining.splice(i, 1)
      }
    }
    if (!remaining.length) break
    const top = remaining[0]
    const alternatives = remaining.filter(
      (item) => item.priority === top.priority && top.score - item.score <= policy.near_score_band,
    )
    alternatives.sort(
      (a, b) =>
        repeatPenalty(a) - repeatPenalty(b) ||
        b.score - a.score ||
        approvedReuse(b) - approvedReuse(a) ||
        a.candidate_id.localeCompare(b.candidate_id),
    )
    const picked = alternatives[0],
      d = dimensions(picked)
    decisions.push({
      candidate_id: picked.candidate_id,
      score: picked.score,
      score_band_top: top.score,
      repeat_penalty: repeatPenalty(picked),
      additional_reviewed_units: d.units.filter((u) => !units.has(u)).length,
      reviewed_information_assessment: d.units.length > 0,
    })
    selected.push(picked)
    identities.add(byId.get(picked.candidate_id).identity_key)
    sectors.set(picked.sector, (sectors.get(picked.sector) || 0) + 1)
    for (const key of d.organizations) organizations.set(key, (organizations.get(key) || 0) + 1)
    for (const key of d.topics) topics.set(key, (topics.get(key) || 0) + 1)
    for (const key of d.units) units.add(key)
    remaining.splice(remaining.indexOf(picked), 1)
  }
  return {
    selected,
    held,
    composition: {
      schema: "research-briefing-composition/v1",
      policy,
      decisions,
      organization_counts: Object.fromEntries(organizations),
      topic_counts: Object.fromEntries(topics),
      reviewed_information_units: units.size,
      importance_scores_changed: false,
      public_analysis_created: false,
    },
  }
}
