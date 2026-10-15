import test from "node:test"
import assert from "node:assert/strict"
import { reconcilePaperVersions } from "../scripts/research/knowledge-links.mjs"

// Synthetic identity contracts, never native source reviews or research gold.
// Production callers validate each appearance's source-bound paper review
// before using the resulting identity projection.
const appearance = (work_id, identifiers) => ({ work_id, identifiers })
const ordered = (rows) => [...rows].sort(([a], [b]) => a.localeCompare(b))
const permutations = (items) =>
  items.length
    ? items.flatMap((item, i) =>
        permutations(items.filter((_, j) => i !== j)).map((rest) => [item, ...rest]),
      )
    : [[]]

test("paper identity reuses normalized arXiv versions and DOI spelling without changing original appearances", () => {
  const papers = [
      appearance("arxiv-study", ["arxiv:2609.12345v1"]),
      appearance("arxiv-study", ["arxiv:2609.12345v4"]),
      appearance("doi-study", ["doi:10.1234/Study"]),
      appearance("doi-study", ["doi:10.1234/study"]),
    ],
    before = structuredClone(papers)
  assert.deepEqual(reconcilePaperVersions(papers), [
    ["arxiv:2609.12345", "arxiv-study"],
    ["doi:10.1234/study", "doi-study"],
  ])
  assert.deepEqual(papers, before)
})

test("reviewed bridging appearances connect paper identifiers transitively in every input order", () => {
  const papers = [
      appearance("one-study", ["arxiv:2609.12345v1"]),
      appearance("one-study", ["doi:10.1234/study"]),
      appearance("one-study", ["url:https://papers.example.org/Study.pdf?version=A"]),
      appearance("one-study", ["arxiv:2609.12345v4", "doi:10.1234/Study"]),
      appearance("one-study", [
        "doi:10.1234/study",
        "url:https://papers.example.org/Study.pdf?version=A",
      ]),
    ],
    expected = ordered([
      ["arxiv:2609.12345", "one-study"],
      ["doi:10.1234/study", "one-study"],
      ["url:https://papers.example.org/Study.pdf?version=A", "one-study"],
    ])
  for (const input of permutations(papers))
    assert.deepEqual(ordered(reconcilePaperVersions(input)), expected)
})

test("a shared work ID rejects disjoint paper identifier components without a reviewed bridging appearance", () => {
  const disjoint = [
    [
      appearance("same-study", ["arxiv:2609.12345v1"]),
      appearance("same-study", ["arxiv:2609.54321v2"]),
    ],
    [
      appearance("same-study", ["arxiv:2609.12345v1"]),
      appearance("same-study", ["doi:10.1234/study"]),
    ],
    [
      appearance("same-study", ["doi:10.1234/first", "arxiv:2609.12345v1"]),
      appearance("same-study", ["doi:10.1234/first"]),
      appearance("same-study", ["doi:10.1234/second"]),
    ],
    [
      appearance("same-study", ["url:https://papers.example.org/Study.pdf?version=A"]),
      appearance("same-study", ["url:https://papers.example.org/Study.pdf?version=a"]),
    ],
  ]
  for (const papers of disjoint)
    assert.throws(
      () => reconcilePaperVersions(papers),
      /Paper work identity conflict.*source-reviewed bridging appearance/,
    )
})

test("a bridging appearance cannot assign one normalized identifier to different work IDs", () => {
  for (const [first, second] of [
    ["arxiv:2609.12345v1", "arxiv:2609.12345v2"],
    ["doi:10.1234/Study", "doi:10.1234/study"],
    ["url:https://PAPERS.example.org/Study.pdf", "url:https://papers.example.org/Study.pdf"],
  ])
    assert.throws(
      () =>
        reconcilePaperVersions([
          appearance("first-study", [first, "doi:10.1234/another"]),
          appearance("second-study", [second]),
        ]),
      /Paper version identity conflict/,
    )
})
