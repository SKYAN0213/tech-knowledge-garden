import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { spawn } from "node:child_process"
import { atomicWrite, safePath, readJSON, withLock } from "./run-state.mjs"
import { sha256 } from "./contracts.mjs"
import { SearxSearch } from "./search.mjs"

const LEGACY_SEARCH_ENGINES = ["google", "bing", "duckduckgo", "naver", "wikipedia"]
const PREVIOUS_SEARCH_ENGINES = [...LEGACY_SEARCH_ENGINES, "brave"]
const EXPERIMENTAL_SEARCH_ENGINES = [...PREVIOUS_SEARCH_ENGINES, "mwmbl"]
const PREVIOUS_ACTIVE_SEARCH_ENGINES = [...LEGACY_SEARCH_ENGINES, "mwmbl"]
export const SEARCH_ENGINES = [...PREVIOUS_ACTIVE_SEARCH_ENGINES, "yahoo"]
export function prepareSearchConfig(root, port = 8888) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw Error("Invalid local search port")
  const relative = `runtime/search/config-${port}.json`
  let config = readJSON(root, relative)
  if (!config) {
    config = {
      use_default_settings: { engines: { keep_only: SEARCH_ENGINES } },
      general: { debug: false, instance_name: "Local research search" },
      server: {
        port,
        bind_address: "127.0.0.1",
        secret_key: crypto.randomBytes(48).toString("hex"),
        limiter: false,
        public_instance: false,
        image_proxy: false,
      },
      search: { formats: ["html", "json"], autocomplete: "", default_lang: "auto" },
      outgoing: { request_timeout: 12.0 },
      engines: SEARCH_ENGINES.map((name) => ({ name, disabled: false })),
    }
    atomicWrite(root, relative, config)
  }
  const configuredEngines = config.engines?.map((engine) => engine.name)
  const configuredAllowlist = config.use_default_settings?.engines?.keep_only
  const legacyEngineLists = [
    LEGACY_SEARCH_ENGINES,
    PREVIOUS_SEARCH_ENGINES,
    EXPERIMENTAL_SEARCH_ENGINES,
    PREVIOUS_ACTIVE_SEARCH_ENGINES,
  ]
  const isLegacyConfig = legacyEngineLists.some(
    (engines) =>
      JSON.stringify(configuredEngines) === JSON.stringify(engines) &&
      JSON.stringify(configuredAllowlist) === JSON.stringify(engines),
  )
  if (
    isLegacyConfig &&
    config.server?.bind_address === "127.0.0.1" &&
    config.server.port === port &&
    config.server.public_instance === false &&
    config.general?.debug === false &&
    typeof config.server.secret_key === "string" &&
    config.server.secret_key.length >= 32 &&
    config.search?.formats?.includes("json") &&
    config.engines.every((engine) => !engine.api_key && !engine.tokens)
  ) {
    config.use_default_settings.engines.keep_only = SEARCH_ENGINES
    config.engines = SEARCH_ENGINES.map((name) => ({ name, disabled: false }))
    atomicWrite(root, relative, config)
  }
  if (
    config.server?.bind_address !== "127.0.0.1" ||
    config.server.port !== port ||
    config.server.public_instance !== false ||
    config.general?.debug !== false ||
    typeof config.server.secret_key !== "string" ||
    config.server.secret_key.length < 32 ||
    !config.search?.formats?.includes("json") ||
    JSON.stringify(config.use_default_settings?.engines?.keep_only) !==
      JSON.stringify(SEARCH_ENGINES) ||
    config.engines?.some((e) => !SEARCH_ENGINES.includes(e.name) || e.api_key || e.tokens)
  )
    throw Error("Local search configuration violates private/free policy")
  const file = safePath(root, relative)
  if (fs.statSync(file).mode & 0o077) throw Error("Search secret file must be private (0600)")
  return {
    path: file,
    sha256: sha256(fs.readFileSync(file)),
    port,
    engines: SEARCH_ENGINES,
    secret: "SET",
  }
}

// One owned, loopback-only process per search execution. No launchd/cron registration.
export async function withLocalSearch(root, action, { port = 8888, startup_ms = 20000 } = {}) {
  return withLock(root, "search-service", async () => {
    const config = prepareSearchConfig(root, port)
    // venv executables intentionally link to the trusted Python runtime; source files do not.
    const python = process.env.RESEARCH_PYTHON || path.resolve(root, "runtime/venv/bin/python")
    if (!fs.existsSync(python)) throw Error("Research Python environment is missing")
    const owner = crypto.randomUUID()
    const log = safePath(root, "runtime/search/service.log")
    const fd = fs.openSync(log, "a", 0o600)
    let child
    try {
      child = spawn(
        python,
        [
          "integrations/research-worker/search.py",
          "--settings",
          config.path,
          "--port",
          String(port),
        ],
        {
          env: {
            ...process.env,
            TKG_SEARCH_OWNER: owner,
            TKG_SEARCH_CONFIG_HASH: config.sha256,
            SEARXNG_SETTINGS_PATH: config.path,
            SEARXNG_BIND_ADDRESS: "127.0.0.1",
            SEARXNG_PORT: String(port),
            SEARXNG_PUBLIC_INSTANCE: "false",
            SEARXNG_DEBUG: "false",
          },
          stdio: ["ignore", fd, fd],
        },
      )
    } finally {
      fs.closeSync(fd)
    }
    let terminal = null
    const exited = new Promise((resolve) => {
      child.once("error", (e) => {
        terminal = { error: e.message }
        resolve(terminal)
      })
      child.once("close", (code, signal) => {
        terminal = { code, signal }
        resolve(terminal)
      })
    })
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    let health
    try {
      const started = performance.now()
      while (performance.now() - started < startup_ms) {
        if (terminal) throw Error("Local search worker stopped before readiness")
        try {
          const r = await fetch(`http://127.0.0.1:${port}/tkg-healthz`, {
            redirect: "error",
            signal: AbortSignal.timeout(800),
          })
          if (r.ok) {
            const h = await r.json()
            if (
              h.service === "tech-knowledge-search/v1" &&
              h.owner === owner &&
              h.config_sha256 === config.sha256 &&
              h.pid === child.pid
            ) {
              health = h
              break
            }
          }
        } catch (e) {
          if (!/fetch failed|timeout|aborted/i.test(e.message)) throw e
        }
        await delay(250)
      }
      if (!health)
        throw Error("Local search startup/readiness deadline exceeded; inspect private service log")
      atomicWrite(root, "registry-state/search-service.json", {
        ...health,
        started_at: new Date().toISOString(),
        state: "running",
        log_path: "runtime/search/service.log",
      })
      return await action(new SearxSearch({ url: `http://127.0.0.1:${port}` }), health)
    } finally {
      if (!terminal) child.kill("SIGTERM")
      await Promise.race([exited, delay(3000)])
      if (!terminal) {
        child.kill("SIGKILL")
        await exited
      }
      atomicWrite(root, "registry-state/search-service.json", {
        service: "tech-knowledge-search/v1",
        owner,
        pid: child.pid ?? null,
        state: "stopped",
        stopped_at: new Date().toISOString(),
        terminal,
        config_sha256: config.sha256,
        version: health?.version || null,
      })
    }
  })
}
