import { assertSchema, sha256 } from "./contracts.mjs"

export const REFERENCE_PROTOCOL = "source-evidence-ref/v1"
export const QUOTE_PROTOCOL = "verbatim-quote/v1"
export const CLAIM_SPAN_FORMAT = "claim-source-span/v1"
export const referenceInstruction = `Select evidence only by the evidence_ref IDs supplied beside each source block. Each ID addresses the exact source span between its start/end UTF-16 offsets. Do not rewrite quotes, parse IDs or block IDs. Supported or contradicted requires at least one reference. Read all source text and context; choosing a reference does not establish that a claim is true. Never cite outside the supplied sources/window.`
export const claimSpanInstruction = `Candidate quote_span start/end offsets address the exact quoted text in the supplied source block, using UTF-16 offsets. Read that text and the full surrounding block. These candidate pointers are untrusted, not evidence of truth. A quote outside this window supplies no source text here; assess only the supplied window. Unmatched quotes are candidate text, not source text.`

// Completed requests keep their original input format. A new reference request
// can avoid repeating source quotes without changing the stored candidate facts.
export function assessmentClaimFormat(protocol, frozen, requested) {
  const format = frozen
    ? frozen.claim_evidence_format || null
    : requested !== undefined
      ? requested
      : protocol === REFERENCE_PROTOCOL
        ? CLAIM_SPAN_FORMAT
        : null
  if (
    ![null, CLAIM_SPAN_FORMAT].includes(format) ||
    (requested !== undefined && requested !== format) ||
    (format && protocol !== REFERENCE_PROTOCOL)
  )
    throw Error("Claim evidence format changed or unsupported")
  return format
}

export function assessmentClaimContext(claims, sources, format, { windowed = false } = {}) {
  if (format === null) return claims
  if (format !== CLAIM_SPAN_FORMAT) throw Error("Unknown claim evidence format")
  return claims.map((claim) => ({
    ...claim,
    evidence: claim.evidence.map(({ quote, ...identity }) => {
      const source = sources.find(
          (s) =>
            s.parse_id === identity.parse_id &&
            s.source_id === identity.source_id &&
            s.source_version_id === identity.source_version_id,
        ),
        block = source?.blocks.find((b) => b.block_id === identity.block_id),
        start = block?.text.indexOf(quote) ?? -1
      if (start >= 0)
        return {
          ...identity,
          quote_span: { start, end: start + quote.length },
          quote_sha256: sha256(quote),
          ...(block.text.indexOf(quote, start + 1) >= 0 ? { repeated_quote: true } : {}),
        }
      // Never leak a candidate's other-window quote into this source window.
      // Invalid citations remain invalid; their structural checks still use
      // the unchanged original candidates, not this prompt projection.
      return windowed && source && !block
        ? { ...identity, quote_scope: "outside-window", quote_sha256: sha256(quote) }
        : { ...identity, quote, quote_scope: "unmatched" }
    }),
  }))
}

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

// Diagnostics describe the validator at collection time. Reuse them only from
// the exact packet-bound historical record; claims are still checked by today's
// validateEvidence/recordFactReview before any approval. Model judgments, source
// locators and checkpoint provenance may never be substituted here.
export function historicalDiagnosticRecord(
  current,
  historical,
  { expectedSha256, validatorChanged = false, rows = "assessments" } = {},
) {
  if (JSON.stringify(current) === JSON.stringify(historical)) return current
  if (
    !validatorChanged ||
    !/^[a-f0-9]{64}$/.test(expectedSha256 || "") ||
    sha256(JSON.stringify(historical)) !== expectedSha256 ||
    !["assessments", "claims"].includes(rows) ||
    !Array.isArray(current?.[rows]) ||
    current[rows].length !== historical?.[rows]?.length
  )
    throw Error("Stored historical diagnostics differ from their bound record")
  const replay = structuredClone(current)
  for (let i = 0; i < replay[rows].length; i++) {
    const old = historical[rows][i],
      diagnostic = old?.structural
    if (
      !diagnostic ||
      Object.keys(diagnostic).length !== 4 ||
      diagnostic.status !== "unreviewed" ||
      diagnostic.reviewed_at !== null ||
      !Array.isArray(diagnostic.problems) ||
      diagnostic.problems.some((value) => typeof value !== "string" || !value.trim()) ||
      new Set(diagnostic.problems).size !== diagnostic.problems.length ||
      diagnostic.structural_pass !== (diagnostic.problems.length === 0)
    )
      throw Error("Invalid frozen structural diagnostics")
    replay[rows][i].structural = structuredClone(diagnostic)
    if (rows === "assessments") {
      // Whole-source assessments derive attention from structure and verdict;
      // window assessments always require explicit whole-source fact review.
      const attention = Array.isArray(old.window_assessments)
        ? true
        : !diagnostic.structural_pass || old.verdict !== "supported"
      if (old.requires_attention !== attention) throw Error("Invalid frozen assessment attention")
      replay[rows][i].requires_attention = attention
    }
  }
  if (JSON.stringify(replay) !== JSON.stringify(historical))
    throw Error("Historical model assessment or source binding changed")
  return replay
}
