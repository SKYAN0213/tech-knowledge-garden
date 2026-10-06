import { assertSchema, sha256 } from "./contracts.mjs"

export const REFERENCE_PROTOCOL = "source-evidence-ref/v1"
export const QUOTE_PROTOCOL = "verbatim-quote/v1"
export const referenceInstruction = `Select evidence only by the evidence_ref IDs supplied beside each source block. Each ID addresses the exact source span between its start/end UTF-16 offsets. Do not rewrite quotes, parse IDs or block IDs. Supported or contradicted requires at least one reference. Read all source text and context; choosing a reference does not establish that a claim is true. Never cite outside the supplied sources/window.`

// Keep full original block context. Spans address lossless, bounded substrings;
// even a large block is never truncated or given a fabricated block locator.
export function assessmentReferences(sources, quoteSchema, protocol = QUOTE_PROTOCOL, claims = []) {
  if (![QUOTE_PROTOCOL, REFERENCE_PROTOCOL].includes(protocol))
    throw Error("Unknown assessment response protocol")
  if (protocol === QUOTE_PROTOCOL)
    return { sources, schema: quoteSchema, resolve: (output) => output }
  const catalog = []
  const supplied = sources.map((source) => ({
    ...source,
    blocks: source.blocks.map((block) => {
      const refs = []
      for (let start = 0; start < block.text.length;) {
        let end = Math.min(start + 3000, block.text.length)
        if (end < block.text.length && /[\uD800-\uDBFF]/.test(block.text[end - 1])) end--
        const evidence_ref = `e${catalog.length + 1}`
        catalog.push({
          evidence_ref,
          parse_id: source.parse_id,
          block_id: block.block_id,
          quote: block.text.slice(start, end),
        })
        refs.push({ evidence_ref, start, end })
        start = end
      }
      return { ...block, evidence_refs: refs }
    }),
  }))
  const blocks = sources.flatMap((s) => s.blocks.map((b) => `${s.parse_id}:${b.block_id}`))
  if (!catalog.length || new Set(blocks).size !== blocks.length)
    throw Error("Unique source evidence blocks required")
  const schema = structuredClone(quoteSchema)
  if (claims.length)
    schema.properties.assessments.items.properties.claim_id = {
      type: "string",
      enum: claims.map((c) => c.claim_id),
    }
  schema.properties.assessments.items.properties.evidence.items = {
    type: "object",
    additionalProperties: false,
    required: ["evidence_ref"],
    properties: { evidence_ref: { type: "string", enum: catalog.map((e) => e.evidence_ref) } },
  }
  return {
    sources: supplied,
    schema,
    catalog_sha256: sha256(JSON.stringify(catalog)),
    schema_sha256: sha256(JSON.stringify(schema)),
    resolve(output) {
      assertSchema(output, schema)
      return {
        ...output,
        assessments: output.assessments.map((row) => {
          const ids = row.evidence.map((e) => e.evidence_ref)
          if (new Set(ids).size !== ids.length)
            throw Error("Duplicate assessment evidence reference")
          return {
            ...row,
            evidence: ids.map((id) => {
              const { evidence_ref, ...citation } = catalog.find((e) => e.evidence_ref === id)
              return citation
            }),
          }
        }),
      }
    },
  }
}

// Historical code hashes describe the implementation that produced a frozen
// response, not today's reader. Only code provenance may differ; source,
// claims, policy, protocol, request plan and every checkpoint stay bound.
export function historicalAssessmentInput(current, historical) {
  if (!historical) throw Error("Frozen assessment input required")
  const bound = structuredClone(current)
  for (const key of Object.keys(bound)) {
    if (
      key.endsWith("_sha256") &&
      /implementation|validator|parser|contracts|source_context|references/.test(key)
    ) {
      if (!/^[a-f0-9]{64}$/.test(historical[key] || ""))
        throw Error("Invalid historical assessment code provenance")
      bound[key] = historical[key]
    }
  }
  if (bound.dependencies) {
    if (
      JSON.stringify(Object.keys(bound.dependencies)) !==
      JSON.stringify(Object.keys(historical.dependencies || {}))
    )
      throw Error("Historical assessment dependencies changed")
    for (const key of Object.keys(bound.dependencies)) {
      if (!/^[a-f0-9]{64}$/.test(historical.dependencies[key] || ""))
        throw Error("Invalid historical assessment dependency provenance")
      bound.dependencies[key] = historical.dependencies[key]
    }
  }
  if (JSON.stringify(bound) !== JSON.stringify(historical))
    throw Error("Historical assessment source, claims, policy or request changed")
  return bound
}
