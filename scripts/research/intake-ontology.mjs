import { canonicalURL } from "../garden.mjs"
import { titleDayKey } from "../article-identity.mjs"

function sharesReviewedApproval(a, b) {
  const approvalA = a.approval
  const approvalB = b.approval
  const sha256 = /^[a-f0-9]{64}$/
  return (
    a.review_status === "verified" &&
    b.review_status === "verified" &&
    /^[a-f0-9]{16,64}$/.test(a.event_id || "") &&
    a.event_id === b.event_id &&
    typeof approvalA?.approved_run === "string" &&
    approvalA.approved_run.length > 0 &&
    approvalA.approved_run === approvalB?.approved_run &&
    sha256.test(approvalA.article_sha256 || "") &&
    approvalA.article_sha256 === approvalB?.article_sha256 &&
    approvalA.source_version_id === a.article_source_version_id &&
    approvalB.source_version_id === b.article_source_version_id &&
    typeof approvalA.parse_id === "string" &&
    approvalA.parse_id === a.article_parse_id &&
    typeof approvalB.parse_id === "string" &&
    approvalB.parse_id === b.article_parse_id &&
    sha256.test(approvalA.article_content_sha256 || "") &&
    approvalA.article_content_sha256 === a.article_content_sha256 &&
    approvalB.article_content_sha256 === b.article_content_sha256 &&
    !a.source_revision_alert &&
    !b.source_revision_alert
  )
}

// A private projection of the candidate ledger. Similarity is a review lead,
// never an event identity or an editorial approval.
export function projectIntakeOntology(candidates) {
  if (!Array.isArray(candidates)) throw Error("Candidate inventory required")
  const nodes = []
  const relations = []
  const keys = new Set()
  const candidateByKey = new Map()
  const urls = new Map()
  const content = new Map()
  const titles = new Map()
  const crossLanguagePublisherDays = new Map()
  for (const candidate of [...candidates].sort((a, b) => a.key.localeCompare(b.key))) {
    if (!candidate.key || keys.has(candidate.key) || !Array.isArray(candidate.source_urls))
      throw Error("Unique candidate keys and source URLs required")
    keys.add(candidate.key)
    candidateByKey.set(candidate.key, candidate)
    nodes.push({
      id: `candidate:${candidate.key}`,
      type: "Candidate",
      key: candidate.key,
      review_status: candidate.review_status,
      source_revision_alert: Boolean(candidate.source_revision_alert),
      published_at: candidate.source_published_at || null,
    })
    for (const raw of candidate.source_urls) {
      const url = canonicalURL(raw)
      const languages = [
        ...new Set((candidate.discovery || []).map((item) => item.language).filter(Boolean)),
      ]
      const publisherDay =
        candidate.source_published_at && languages.length
          ? `${new URL(url).hostname.replace(/^www\./, "")}|${candidate.source_published_at}`
          : null
      if (publisherDay) {
        if (!crossLanguagePublisherDays.has(publisherDay))
          crossLanguagePublisherDays.set(publisherDay, new Map())
        const group = crossLanguagePublisherDays.get(publisherDay)
        if (!group.has(candidate.key)) group.set(candidate.key, new Set())
        for (const language of languages) group.get(candidate.key).add(language)
      }
      const prior = urls.get(url)
      if (prior && prior !== candidate.key)
        relations.push({
          from: `candidate:${prior}`,
          type: "sharedCanonicalSourceCandidate",
          to: `candidate:${candidate.key}`,
          basis: url,
          decision: "review_required",
        })
      urls.set(url, candidate.key)
      const sourceId = `source:${url}`
      if (!nodes.some((node) => node.id === sourceId))
        nodes.push({ id: sourceId, type: "Source", url })
      relations.push({ from: `candidate:${candidate.key}`, type: "discoveredAt", to: sourceId })
    }
    if (candidate.article_source_version_id) {
      const versionId = `source-version:${candidate.article_source_version_id}`
      if (!nodes.some((node) => node.id === versionId))
        nodes.push({
          id: versionId,
          type: "SourceVersion",
          source_version_id: candidate.article_source_version_id,
        })
      relations.push({ from: `candidate:${candidate.key}`, type: "observedVersion", to: versionId })
    }
    if (candidate.event_id) {
      const eventId = `event:${candidate.event_id}`
      if (!nodes.some((node) => node.id === eventId))
        nodes.push({ id: eventId, type: "Event", event_id: candidate.event_id })
      relations.push({
        from: `candidate:${candidate.key}`,
        type: "linkedEvent",
        to: eventId,
        basis: candidate.approval
          ? "editorial_approval"
          : candidate.identity
            ? "source_identity_review"
            : "existing_event_id",
      })
    }
    const fingerprint = candidate.article_content_sha256
    if (fingerprint) {
      // Identical extracted bodies remain a duplicate lead even when publishers
      // assign different dates. The relation is review-only; it never merges events.
      const group = fingerprint
      if (!content.has(group)) content.set(group, [])
      content.get(group).push(candidate.key)
    }
    const titleKey = titleDayKey(candidate.title, candidate.source_published_at)
    if (titleKey) {
      if (!titles.has(titleKey)) titles.set(titleKey, [])
      titles.get(titleKey).push(candidate.key)
    }
  }
  for (const [basis, group] of content)
    if (group.length > 1)
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          relations.push({
            from: `candidate:${group[i]}`,
            type: "sameExtractedContentCandidate",
            to: `candidate:${group[j]}`,
            basis,
            decision: "review_required",
          })
  for (const [basis, group] of titles)
    if (group.length > 1)
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          relations.push({
            from: `candidate:${group[i]}`,
            type: "sameTitleDayCandidate",
            to: `candidate:${group[j]}`,
            basis,
            decision: "review_required",
          })
  for (const [basis, candidatesByKey] of crossLanguagePublisherDays) {
    const group = [...candidatesByKey].sort(([a], [b]) => a.localeCompare(b))
    if (group.length > 1)
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++) {
          const languagesA = group[i][1]
          const languagesB = group[j][1]
          if (
            ![...languagesA].some((language) => [...languagesB].some((other) => other !== language))
          )
            continue
          relations.push({
            from: `candidate:${group[i][0]}`,
            type: "samePublisherDayCrossLanguageCandidate",
            to: `candidate:${group[j][0]}`,
            basis,
            decision: sharesReviewedApproval(
              candidateByKey.get(group[i][0]),
              candidateByKey.get(group[j][0]),
            )
              ? "same_approved_event"
              : "review_required",
          })
        }
  }
  return {
    schema: "research-intake-ontology/v1",
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    relations: relations.sort((a, b) =>
      `${a.from}|${a.type}|${a.to}`.localeCompare(`${b.from}|${b.type}|${b.to}`),
    ),
  }
}

export function relatedCandidateKeys(ontology, key) {
  if (ontology?.schema !== "research-intake-ontology/v1") throw Error("Intake ontology required")
  const id = `candidate:${key}`
  return ontology.relations
    .filter(
      (relation) =>
        [
          "sameExtractedContentCandidate",
          "samePublisherDayCrossLanguageCandidate",
          "sameTitleDayCandidate",
          "sharedCanonicalSourceCandidate",
        ].includes(relation.type) &&
        (relation.from === id || relation.to === id),
    )
    .map((relation) =>
      (relation.from === id ? relation.to : relation.from).slice("candidate:".length),
    )
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort()
}

export function summarizeIntakeOntology(ontology) {
  if (ontology?.schema !== "research-intake-ontology/v1") throw Error("Intake ontology required")
  const nodeCounts = Object.fromEntries(
    [...new Set(ontology.nodes.map((node) => node.type))]
      .sort()
      .map((type) => [type, ontology.nodes.filter((node) => node.type === type).length]),
  )
  const relationCounts = Object.fromEntries(
    [...new Set(ontology.relations.map((relation) => relation.type))]
      .sort()
      .map((type) => [
        type,
        ontology.relations.filter((relation) => relation.type === type).length,
      ]),
  )
  const reviewRelations = ontology.relations
    .filter((relation) => relation.decision === "review_required")
    .map((relation) => ({
      from: relation.from.slice("candidate:".length),
      type: relation.type,
      to: relation.to.slice("candidate:".length),
      basis: relation.basis,
    }))
  return {
    schema: ontology.schema,
    node_counts: nodeCounts,
    relation_counts: relationCounts,
    review_required_count: reviewRelations.length,
    review_relations: reviewRelations,
  }
}
