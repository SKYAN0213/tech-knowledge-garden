import { parseArgs } from "node:util"
import {
  runtimeInstallPlan,
  installResearchRuntime,
  verifyResearchRuntime,
} from "./research/runtime-install.mjs"

try {
  const { values: v, positionals } = parseArgs({
    strict: true,
    allowPositionals: true,
    options: {
      root: { type: "string" },
      python: { type: "string" },
      "searx-checkout": { type: "string" },
      "ocr-model": { type: "string" },
      port: { type: "string" },
    },
  })
  const mode = positionals[0]
  if (positionals.length !== 1 || !["plan", "install", "verify"].includes(mode) || !v.root)
    throw Error(
      "Use plan|install --root PRIVATE --python ABSOLUTE --ocr-model FILE [--searx-checkout PINNED_CHECKOUT], or verify --root PRIVATE [--port PORT]",
    )
  if (mode !== "verify" && v.port) throw Error("--port is only supported for verify")
  if (mode === "verify" && (v.python || v["ocr-model"] || v["searx-checkout"]))
    throw Error("Verify uses the existing installation input")
  if (v.port && !/^\d+$/.test(v.port)) throw Error("Integer search port required")
  const options = {
    root: v.root,
    python: v.python,
    searxCheckout: v["searx-checkout"],
    ocrModel: v["ocr-model"],
  }
  const result =
    mode === "plan"
      ? runtimeInstallPlan(options)
      : mode === "install"
        ? await installResearchRuntime(options, { emit: (e) => console.error(JSON.stringify(e)) })
        : await verifyResearchRuntime({ root: v.root, port: v.port ? Number(v.port) : 8891 })
  console.log(JSON.stringify(result, null, 2))
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
}
