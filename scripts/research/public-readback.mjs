import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { sha256, PUBLIC_ROOTS } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"

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
  assertDeploymentProof(deployment, commit)
  if (
    preview?.schema !== "private-reader-preview/v1" ||
    !Array.isArray(preview.editions) ||
    !preview.editions.length ||
    !Array.isArray(preview.knowledge) ||
    !Array.isArray(preview.consistency?.articles) ||
    !preview.consistency.articles.length
  )
    throw Error("Verified reader preview required")
  if (preview.navigation && preview.navigation.path !== "Knowledge/00 Tech Encyclopedia Index.md")
    throw Error("Authoring navigation must use the canonical encyclopedia index")
  const mapping = JSON.parse(fs.readFileSync(safePath(repository, ".local/site-notes.json")))
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
    if (sha256(fs.readFileSync(safePath(repository, local))) !== row.sha256)
      throw Error("Approved preview authoring bytes changed: " + row.path)
    github.add(local)
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
      const data = fs.readFileSync(safePath(repository, local))
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
  const reader = fs.readFileSync(safePath(repository, "public/reader.js"), "utf8")
  const modules = [...reader.matchAll(modulePattern)].map((x) => x[0].slice(2))
  if (modules.length !== 1) throw Error("One reviewed connection-map bundle required")
  const bytes = fs.readFileSync(safePath(repository, "public/" + modules[0]))
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
}) {
  runId(run)
  const directory = `runs/${run}/public-readback`
  const plan = readJSON(root, directory + "/plan.json")
  const receipt = readJSON(root, directory + "/receipt.json")
  const preview = readJSON(root, `runs/${previewRun}/preview-manifest.json`)
  if (
    !plan ||
    !receipt ||
    plan.commit !== commit ||
    receipt.preview_run !== previewRun ||
    receipt.commit !== commit ||
    receipt.status !== "public_artifact_bytes_verified" ||
    receipt.verified !== true ||
    receipt.reader_equivalent !== true ||
    JSON.stringify(
      publicReadbackPlan({ repository, preview, commit, deployment: plan.deployment }),
    ) !== JSON.stringify(plan)
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
  const localReader = fs.readFileSync(safePath(repository, "public/reader.js"), "utf8")
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
