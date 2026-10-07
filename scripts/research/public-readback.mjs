import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { sha256, PUBLIC_ROOTS } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { assertArticleFreeLegacyPreview } from "./legacy-transition.mjs"

const SITE = "https://skyan0213.github.io/tech-knowledge-garden/"
const GITHUB = "https://raw.githubusercontent.com/SKYAN0213/tech-knowledge-garden/"
const LIMIT = 16 * 1024 * 1024
const modulePattern = /\.\/chunks\/connection-map-[A-Z0-9]+\.js/g
const runId = (value) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value || "")) throw Error("Invalid readback run ID")
}
const relativePath = (value) => {
  if (
    typeof value !== "string" ||
    value.includes("\\") ||
    value.split("/").some((p) => !p || p.startsWith(".")) ||
    !/\.(?:html|json|xml|css|js|md)$/.test(value)
  )
    throw Error("Invalid public artifact path")
  return value
}
const encoded = (value) => value.split("/").map(encodeURIComponent).join("/")

export function assertDeploymentProof(proof, commit) {
  if (
    !/^[a-f0-9]{40}$/.test(commit || "") ||
    proof?.status !== "completed" ||
    proof.conclusion !== "success" ||
    proof.headSha !== commit ||
    !/^https:\/\/github\.com\/SKYAN0213\/tech-knowledge-garden\/actions\/runs\/\d+$/.test(
      proof.url || "",
    ) ||
    !Array.isArray(proof.jobs) ||
    !["build", "deploy"].every((name) =>
      proof.jobs.some(
        (job) => job.name === name && job.status === "completed" && job.conclusion === "success",
      ),
    )
  )
    throw Error("Successful build and deployment for the exact commit required")
}

// This checks publication bytes, never approves articles or writes to the public site.
export function publicReadbackPlan({ repository, preview, commit, deployment }) {
  return readbackPlan({
    preview,
    commit,
    deployment,
    read: (file) => fs.readFileSync(safePath(repository, file)),
  })
}

function readbackPlan({ preview, commit, deployment, read }) {
  assertDeploymentProof(deployment, commit)
  if (
    preview?.schema !== "private-reader-preview/v1" ||
    !Array.isArray(preview.editions) ||
    !preview.editions.length ||
    !Array.isArray(preview.knowledge) ||
    !Array.isArray(preview.consistency?.articles)
  )
    throw Error("Verified reader preview required")
  const articleFree = preview.consistency.articles.length === 0
  if (articleFree) assertArticleFreeLegacyPreview(preview)
  if (preview.navigation && preview.navigation.path !== "Knowledge/00 Tech Encyclopedia Index.md")
    throw Error("Authoring navigation must use the canonical encyclopedia index")
  const mapping = JSON.parse(read(".local/site-notes.json"))
  const slugs = new Map(mapping.map((row) => [row.path + ".md", row.slug]))
  const web = new Set([
    "drive-sync.json",
    "briefing.xml",
    "reader-index.json",
    "knowledge-graph.json",
    "static/contentIndex.json",
    "reader.css",
    "reader.js",
  ])
  const github = new Set()
  for (const row of [
    ...preview.editions,
    ...preview.knowledge,
    ...(preview.navigation ? [preview.navigation] : []),
  ]) {
    relativePath(row.path)
    if (!PUBLIC_ROOTS.includes(row.path.split("/")[0])) throw Error("Private authoring path")
    const local = "vault/" + row.path
    if (sha256(read(local)) !== row.sha256)
      throw Error("Approved preview authoring bytes changed: " + row.path)
    github.add(local)
    if (articleFree && row.path.startsWith("Editions/")) {
      const slug = slugs.get(row.path.replace(/^Editions\//, "Briefings/"))
      if (!slug?.startsWith("briefings/")) throw Error("Missing historical briefing mapping")
      web.add(relativePath(slug + ".html"))
      github.add(relativePath(row.path.replace(/^Editions\//, "digest/")))
    }
    // Signals are authoring records, not reader pages.
    if (row.path.startsWith("Knowledge/") && row.path !== preview.navigation?.path) {
      const slug = slugs.get(row.path)
      if (!slug?.startsWith("knowledge/")) throw Error("Missing knowledge page mapping")
      web.add(relativePath(slug + ".html"))
    }
  }
  for (const article of preview.consistency.articles) {
    if (!/^[a-f0-9]{16}$/.test(article.event_id || "")) throw Error("Invalid event identity")
    web.add("news/" + article.event_id + ".html")
    github.add("vault/News/" + article.event_id + ".md")
    if (!Array.isArray(article.appearances) || !article.appearances.length)
      throw Error("Article briefing appearance required")
    for (const appearance of article.appearances) {
      if (
        !appearance.html?.startsWith("public/briefings/") ||
        !appearance.digest?.startsWith("digest/")
      )
        throw Error("Invalid briefing channel path")
      web.add(relativePath(appearance.html.slice(7)))
      github.add(relativePath(appearance.digest))
    }
  }
  const rows = []
  for (const [kind, paths] of [
    ["web", web],
    ["github", github],
  ]) {
    for (const file of [...paths].sort()) {
      relativePath(file)
      const local = kind === "web" ? "public/" + file : file
      const data = read(local)
      if (data.length > LIMIT) throw Error("Local publication artifact exceeds readback limit")
      rows.push({
        kind,
        path: file,
        local,
        bytes: data.length,
        sha256: sha256(data),
        url: kind === "web" ? SITE + encoded(file) : GITHUB + commit + "/" + encoded(file),
      })
    }
  }
  const reader = read("public/reader.js").toString("utf8")
  const modules = [...reader.matchAll(modulePattern)].map((x) => x[0].slice(2))
  if (modules.length !== 1) throw Error("One reviewed connection-map bundle required")
  const bytes = read("public/" + modules[0])
  return {
    schema: "publication-readback-plan/v1",
    commit,
    deployment,
    preview_sha256: sha256(Buffer.from(JSON.stringify(preview))),
    files: rows,
    reader_module: { local: "public/" + modules[0], bytes: bytes.length, sha256: sha256(bytes) },
  }
}

async function boundedRead(url, fetchImpl) {
  const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(30_000) })
  if (response.status !== 200) throw Error("Public artifact HTTP " + response.status)
  if (Number(response.headers.get("content-length")) > LIMIT) {
    await response.body?.cancel()
    throw Error("Public artifact exceeds readback limit")
  }
  const parts = []
  let size = 0
  for await (const chunk of response.body || []) {
    size += chunk.length
    if (size > LIMIT) throw Error("Public artifact exceeds readback limit")
    parts.push(Buffer.from(chunk))
  }
  return Buffer.concat(parts)
}

export async function verifyPublicReadback({
  root,
  run,
  previewRun,
  repository = process.cwd(),
  commit,
  deployment,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
}) {
  runId(run)
  runId(previewRun)
  return withLock(root, "public-readback-" + run, async () => {
    const previewFile = `runs/${previewRun}/preview-manifest.json`
    const preview = readJSON(root, previewFile)
    if (preview?.run_id !== previewRun) throw Error("Preview run identity mismatch")
    const plan = publicReadbackPlan({ repository, preview, commit, deployment })
    const directory = `runs/${run}/public-readback`
    const prior = readJSON(root, directory + "/plan.json")
    if (prior && JSON.stringify(prior) !== JSON.stringify(plan))
      throw Error("Publication readback inputs changed; use a new run")
    if (!prior) atomicCreate(root, directory + "/plan.json", plan)
    const observe = async (row, index) => {
      const stem = `${directory}/files/${index}`
      const saved = readJSON(root, stem + ".json")
      if (saved) {
        const bytes = fs.readFileSync(safePath(root, stem + ".bin"))
        if (
          saved.url !== row.url ||
          saved.kind !== row.kind ||
          saved.path !== row.path ||
          saved.status !== 200 ||
          !Number.isFinite(Date.parse(saved.observed_at)) ||
          sha256(bytes) !== saved.sha256 ||
          bytes.length !== saved.bytes ||
          saved.matches_local !== (sha256(bytes) === row.sha256)
        )
          throw Error("Stored public readback bytes changed")
        return { observation: saved, bytes }
      }
      const bytes = await boundedRead(row.url, fetchImpl)
      const observation = {
        kind: row.kind,
        path: row.path,
        url: row.url,
        status: 200,
        observed_at: now(),
        bytes: bytes.length,
        sha256: sha256(bytes),
        matches_local: sha256(bytes) === row.sha256,
      }
      // A process may stop between the raw bytes and metadata. Preserve the raw bytes;
      // a later network observation must match them rather than replacing them.
      const raw = safePath(root, stem + ".bin")
      if (fs.existsSync(raw)) {
        if (sha256(fs.readFileSync(raw)) !== observation.sha256)
          throw Error("Incomplete readback raw bytes conflict; use a new run")
      } else atomicCreate(root, stem + ".bin", bytes)
      atomicCreate(root, stem + ".json", observation)
      return { observation, bytes }
    }
    const results = []
    const failures = []
    for (let offset = 0; offset < plan.files.length; offset += 4) {
      const group = await Promise.allSettled(
        plan.files.slice(offset, offset + 4).map((row, i) => observe(row, offset + i)),
      )
      for (const [i, result] of group.entries()) {
        if (result.status === "fulfilled") results[offset + i] = result.value
        else failures.push({ path: plan.files[offset + i].path, reason: result.reason.message })
      }
    }
    if (failures.length) {
      atomicCreate(root, `${directory}/failures/${crypto.randomUUID()}.json`, {
        observed_at: now(),
        failures,
      })
      throw Error("Public readback incomplete; completed observations preserved")
    }
    const remoteReader =
      results[
        plan.files.findIndex((r) => r.path === "reader.js" && r.kind === "web")
      ].bytes.toString("utf8")
    const modules = [...remoteReader.matchAll(modulePattern)].map((x) => x[0].slice(2))
    if (modules.length !== 1) throw Error("Deployed reader map bundle is ambiguous")
    const module = await observe(
      { kind: "web", path: modules[0], url: SITE + modules[0], ...plan.reader_module },
      "map",
    )
    const localReader = fs.readFileSync(safePath(repository, "public/reader.js"), "utf8")
    const readerEquivalent =
      remoteReader.replace(modulePattern, "./chunks/connection-map.js") ===
        localReader.replace(modulePattern, "./chunks/connection-map.js") &&
      module.observation.matches_local
    const verified =
      readerEquivalent &&
      results.every(
        (r, i) =>
          r.observation.matches_local ||
          (plan.files[i].path === "reader.js" && plan.files[i].kind === "web"),
      )
    if (
      JSON.stringify(
        publicReadbackPlan({
          repository,
          preview: readJSON(root, previewFile),
          commit,
          deployment,
        }),
      ) !== JSON.stringify(plan)
    )
      throw Error("Publication inputs changed during readback")
    const receipt = {
      schema: "publication-readback-receipt/v1",
      run_id: run,
      preview_run: previewRun,
      commit,
      actions_url: deployment.url,
      verified,
      status: verified ? "public_artifact_bytes_verified" : "public_artifact_mismatch",
      files: results.map((r) => r.observation),
      connection_map_module: module.observation,
      reader_equivalent: readerEquivalent,
      drive_verified: false,
      browser_verified: false,
      approval_created: false,
      public_written: false,
    }
    const saved = readJSON(root, directory + "/receipt.json")
    if (saved && JSON.stringify(saved) !== JSON.stringify(receipt))
      throw Error("Stored readback receipt changed")
    if (!saved) atomicCreate(root, directory + "/receipt.json", receipt)
    if (!verified)
      throw Error(
        "Deployed artifacts differ from the pinned publication; mismatch receipt preserved",
      )
    sealReadbackArchive({ root, run, previewRun, repository, commit })
    return { path: directory + "/receipt.json", ...receipt }
  })
}

// Recheck stored bytes for a resumed publication without another HTTP request.
// The original observation date remains visible; this is not a current-site poll.
export function loadVerifiedPublicReadback({
  root,
  run,
  previewRun,
  repository = process.cwd(),
  commit,
  historical = false,
  archive,
}) {
  runId(run)
  const directory = `runs/${run}/public-readback`
  const plan = readJSON(root, directory + "/plan.json")
  const receipt = readJSON(root, directory + "/receipt.json")
  const preview = readJSON(root, `runs/${previewRun}/preview-manifest.json`)
  const baseline = historical ? archive || readJSON(root, directory + "/archive.json") : null
  let expectedPlan, localReader
  if (historical) {
    if (
      baseline?.schema !== "publication-readback-archive/v1" ||
      baseline.run_id !== run ||
      baseline.preview_run !== previewRun ||
      baseline.commit !== commit ||
      baseline.plan_sha256 !== sha256(JSON.stringify(plan)) ||
      baseline.receipt_sha256 !== sha256(JSON.stringify(receipt)) ||
      baseline.preview_sha256 !== sha256(JSON.stringify(preview)) ||
      typeof baseline.reader !== "string" ||
      !Array.isArray(baseline.mapping)
    )
      throw Error("Exact historical readback archive required")
    // Reconstruct the original plan from observed bytes and the only two
    // local-only inputs. No latest vault/build files or HTTP requests are used.
    const captured = new Map((plan?.files || []).map((row, index) => [row.local, index]))
    const read = (file) => {
      if (file === ".local/site-notes.json") return Buffer.from(JSON.stringify(baseline.mapping))
      if (file === "public/reader.js") return Buffer.from(baseline.reader)
      if (file === plan.reader_module.local)
        return fs.readFileSync(safePath(root, directory + "/files/map.bin"))
      const index = captured.get(file)
      if (index === undefined) throw Error("Historical artifact is not in the pinned plan")
      return fs.readFileSync(safePath(root, `${directory}/files/${index}.bin`))
    }
    expectedPlan = readbackPlan({ preview, commit, deployment: plan.deployment, read })
    localReader = baseline.reader
  } else {
    expectedPlan = publicReadbackPlan({ repository, preview, commit, deployment: plan?.deployment })
    localReader = fs.readFileSync(safePath(repository, "public/reader.js"), "utf8")
  }
  if (
    !plan ||
    !receipt ||
    plan.commit !== commit ||
    receipt.preview_run !== previewRun ||
    receipt.commit !== commit ||
    receipt.status !== "public_artifact_bytes_verified" ||
    receipt.verified !== true ||
    receipt.reader_equivalent !== true ||
    receipt.schema !== "publication-readback-receipt/v1" ||
    receipt.run_id !== run ||
    plan.schema !== "publication-readback-plan/v1" ||
    JSON.stringify(expectedPlan) !== JSON.stringify(plan)
  )
    throw Error("Exact completed publication readback required")
  const read = (index, expected) => {
    const stem = `${directory}/files/${index}`
    const metadata = readJSON(root, stem + ".json")
    const bytes = fs.readFileSync(safePath(root, stem + ".bin"))
    if (
      !metadata ||
      metadata.kind !== expected.kind ||
      metadata.path !== expected.path ||
      metadata.url !== expected.url ||
      metadata.status !== 200 ||
      metadata.bytes !== bytes.length ||
      metadata.sha256 !== sha256(bytes) ||
      !Number.isFinite(Date.parse(metadata.observed_at)) ||
      metadata.matches_local !== (sha256(bytes) === expected.sha256)
    )
      throw Error("Stored publication observation or raw bytes changed")
    return { metadata, bytes }
  }
  const files = plan.files.map((row, i) => read(i, row))
  const reader =
    files[plan.files.findIndex((r) => r.kind === "web" && r.path === "reader.js")].bytes.toString(
      "utf8",
    )
  const modules = [...reader.matchAll(modulePattern)].map((x) => x[0].slice(2))
  if (modules.length !== 1) throw Error("Stored reader module is ambiguous")
  const module = read("map", {
    kind: "web",
    path: modules[0],
    url: SITE + modules[0],
    ...plan.reader_module,
  })
  if (
    !module.metadata.matches_local ||
    reader.replace(modulePattern, "./chunks/connection-map.js") !==
      localReader.replace(modulePattern, "./chunks/connection-map.js") ||
    files.some(
      (r, i) =>
        !r.metadata.matches_local &&
        !(plan.files[i].kind === "web" && plan.files[i].path === "reader.js"),
    ) ||
    JSON.stringify(receipt.files) !== JSON.stringify(files.map((r) => r.metadata)) ||
    JSON.stringify(receipt.connection_map_module) !== JSON.stringify(module.metadata) ||
    receipt.actions_url !== plan.deployment.url
  )
    throw Error("Stored public receipt does not match the verified artifacts")
  return { path: directory + "/receipt.json", ...receipt }
}

function sealReadbackArchive({ root, run, previewRun, repository, commit }) {
  const directory = `runs/${run}/public-readback`
  const file = directory + "/archive.json"
  const previous = readJSON(root, file)
  const plan = readJSON(root, directory + "/plan.json")
  const readerIndex = plan?.files?.findIndex(
    (row) => row.kind === "web" && row.path === "reader.js",
  )
  // Recover the exact original local reader from the observed deployed reader:
  // the sole allowed transformation is its pinned map-bundle import name.
  // Its hash must still equal the original plan, including every other byte.
  const reader = previous
    ? previous.reader
    : fs
        .readFileSync(safePath(root, `${directory}/files/${readerIndex}.bin`), "utf8")
        .replace(modulePattern, "./" + plan.reader_module.local.slice("public/".length))
  if (sha256(reader) !== plan.files[readerIndex].sha256)
    throw Error("Exact original reader bytes required for archive")
  const archive = previous || {
    schema: "publication-readback-archive/v1",
    run_id: run,
    preview_run: previewRun,
    commit,
    plan_sha256: sha256(JSON.stringify(readJSON(root, directory + "/plan.json"))),
    receipt_sha256: sha256(JSON.stringify(readJSON(root, directory + "/receipt.json"))),
    preview_sha256: sha256(
      JSON.stringify(readJSON(root, `runs/${previewRun}/preview-manifest.json`)),
    ),
    mapping: JSON.parse(fs.readFileSync(safePath(repository, ".local/site-notes.json"))),
    reader,
  }
  const proof = loadVerifiedPublicReadback({
    root,
    run,
    previewRun,
    repository,
    commit,
    historical: true,
    archive,
  })
  if (!previous) atomicCreate(root, file, archive)
  return {
    path: file,
    commit,
    status: "historical_public_bytes_verified",
    observed_at: proof.files
      .map((r) => r.observed_at)
      .sort()
      .at(-1),
    current_site_verified: false,
    new_regular_operation_counted: false,
  }
}

// Legacy receipts retain their raw observation time and original byte digests.
export async function archivePublicReadback(options) {
  runId(options.run)
  runId(options.previewRun)
  return withLock(options.root, "public-readback-" + options.run, () =>
    sealReadbackArchive({ repository: process.cwd(), ...options }),
  )
}
