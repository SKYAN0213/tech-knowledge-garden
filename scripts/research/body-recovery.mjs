import fs from "node:fs"
import { renderDocument } from "./browser.mjs"
import { parseDocument, assertStoredEvidence } from "./parser.mjs"
import { sha256 } from "./contracts.mjs"

// Recovery is opt-in and only handles empty HTML extraction. Login/challenge,
// readable articles, PDF and already rendered documents never trigger it.
export function needsBodyRecovery(document, parsed) {
  return (
    !document.rendered_from &&
    /^text\/html(?:;|$)/i.test(document.mime_type || "") &&
    parsed.status === "partial" &&
    parsed.blocks.length === 0 &&
    parsed.quality?.reason === "body-not-extracted"
  )
}

export async function recoverEmptyHTML(root, run, fetcher, document, parsed, options = {}) {
  assertStoredEvidence(root, [document], [parsed])
  if (!needsBodyRecovery(document, parsed)) return { status: "not_needed", document, parse: parsed }
  const dependency = Object.fromEntries(
    [
      "scripts/research/browser.mjs",
      "scripts/research/body-recovery.mjs",
      "integrations/research-worker/browser.py",
    ].map((file) => [file, sha256(fs.readFileSync(file))]),
  )
  const allowed_hosts = options.browser_allowed_hosts || [new URL(document.final_url).hostname]
  if (
    !Array.isArray(allowed_hosts) ||
    !allowed_hosts.length ||
    allowed_hosts.length > 8 ||
    allowed_hosts.some(
      (host) =>
        typeof host !== "string" ||
        !/^[a-z0-9.-]+$/i.test(host) ||
        new URL("https://" + host).hostname !== host.toLowerCase(),
    ) ||
    !allowed_hosts.includes(new URL(document.final_url).hostname)
  )
    throw Error("Explicit bounded browser hosts required")
  const attempt = await run.stage(
    `render-${document.source_id}`,
    { document, dependency, allowed_hosts },
    async () => {
      try {
        return {
          status: "rendered",
          document: await renderDocument(root, fetcher, document, {
            allowed_hosts,
            timeout_ms: 60000,
          }),
        }
      } catch (error) {
        // Preserve a terminal observation for this exact attempt. Resume must not
        // repeat a blocked request; changed configuration requires a new run.
        if (
          !/^(Host outside channel policy|Browser time budget exceeded|Browser exited before result:|Source navigation outside captured document)/.test(
            error.message,
          )
        )
          throw error
        return { status: "render_failed", error: error.message }
      }
    },
  )
  if (attempt.status === "render_failed")
    return {
      status: "render_failed",
      document,
      parse: parsed,
      observation: { original_source_version_id: document.source_version_id, error: attempt.error },
    }
  const rendered = attempt.document
  const next = await run.stage(
    `render-parse-${document.source_id}`,
    {
      document: rendered,
      options,
      worker_sha256: sha256(fs.readFileSync("integrations/research-worker/worker.py")),
    },
    () => parseDocument(root, rendered, options),
  )
  assertStoredEvidence(root, [rendered], [next])
  const recovered =
    next.status === "extracted" &&
    next.blocks.length > 0 &&
    next.quality?.required_fields_present !== false
  return {
    status: recovered ? "recovered" : "rendered_unreadable",
    document: recovered ? rendered : document,
    parse: recovered ? next : parsed,
    observation: {
      original_source_version_id: document.source_version_id,
      rendered_source_version_id: rendered.source_version_id,
      render_id: rendered.render_id,
      parse_id: next.parse_id,
      parse_status: next.status,
      resource_failures: rendered.resource_failures,
    },
  }
}
