import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { atomicWrite } from "./run-state.mjs"
import { sha256 } from "./contracts.mjs"
import { assertURL } from "./fetch.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"

export async function renderDocument(root, fetcher, document, options = {}) {
  if (!["captured", "not_modified"].includes(document.fetch_status))
    throw Error("Browser requires a captured source; access blocks are not bypassed")
  assertURL(document.final_url)
  const result = await new Promise((resolve, reject) => {
    const python = process.env.RESEARCH_PYTHON || path.resolve(root, "runtime/venv/bin/python")
    const child = spawn(python, ["integrations/research-worker/browser.py"], {
      stdio: ["pipe", "pipe", "pipe"],
    })
    const lines = createInterface({ input: child.stdout }),
      failures = [],
      resources = []
    let received = false,
      stderr = ""
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      reject(Error("Browser time budget exceeded"))
    }, options.timeout_ms || 60000)
    child.stderr.on("data", (b) => {
      stderr = (stderr + b).slice(-2000)
    })
    child.once("error", (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.once("close", () => {
      clearTimeout(timer)
      if (!received) reject(Error("Browser exited before result: " + stderr))
    })
    lines.on("line", async (line) => {
      try {
        if (line.length > 10 * 1024 ** 2) throw Error("Browser output exceeds HTML budget")
        const message = JSON.parse(line)
        if (message.type === "fetch") {
          const resource = await fetchWithPolicy(root, fetcher, message.url, {
            allowed_hosts: options.allowed_hosts,
          })
          resources.push({
            url: message.url,
            source_version_id: resource.source_version_id,
            status: resource.fetch_status,
          })
          if (child.stdin.writable)
            child.stdin.write(
              JSON.stringify({
                request_id: message.request_id,
                status: ["captured", "not_modified"].includes(resource.fetch_status)
                  ? "captured"
                  : resource.fetch_status,
                body_path: resource.body_path,
                body_sha256: resource.body_sha256,
                mime_type: resource.mime_type,
                error: resource.error,
              }) + "\n",
            )
        } else if (message.type === "result") {
          received = true
          clearTimeout(timer)
          child.stdin.end()
          resolve({ ...message, resources, failures })
        } else if (message.type === "error") {
          received = true
          clearTimeout(timer)
          child.stdin.end()
          child.kill("SIGKILL")
          reject(Error(message.error))
        } else throw Error("Invalid browser protocol")
      } catch (e) {
        failures.push(e.message)
        child.kill("SIGKILL")
        clearTimeout(timer)
        reject(e)
      }
    })
    child.stdin.write(
      JSON.stringify({
        root: path.resolve(root),
        url: document.final_url,
        request_limit: 80,
        wait_selector: options.wait_selector,
      }) + "\n",
    )
  })
  const bytes = Buffer.from(result.html),
    hash = sha256(bytes),
    capture_id = sha256(JSON.stringify([document.source_version_id, hash, result.resources]))
  const body_path = `renders/${capture_id}/body.html`
  atomicWrite(root, body_path, bytes)
  atomicWrite(root, `renders/${capture_id}/manifest.json`, {
    capture_id,
    observed_at: new Date().toISOString(),
    original_source_version_id: document.source_version_id,
    body_sha256: hash,
    ...result,
    html: undefined,
  })
  // Render is derived evidence with its own version; original fetched bytes remain untouched.
  return {
    ...document,
    source_version_id: `${document.source_id}:render-${capture_id}`,
    body_path,
    body_sha256: hash,
    rendered_from: document.source_version_id,
    render_id: capture_id,
    resource_failures: result.resource_failures,
  }
}
