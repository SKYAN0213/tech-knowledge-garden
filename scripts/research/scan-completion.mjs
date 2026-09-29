import { mergeBacklog } from "./discovery.mjs"

export async function mergeCompletedScan(result, backlogFile, merge = mergeBacklog) {
  if (!result?.summary || !Array.isArray(result.candidates))
    throw Error("Stored list scan summary and candidates required")
  if (result.summary.status !== "window_scanned")
    return { status: "skipped", reason: result.summary.reason || "window_incomplete" }
  return { status: "merged", ...(await merge(backlogFile, result.candidates)) }
}
