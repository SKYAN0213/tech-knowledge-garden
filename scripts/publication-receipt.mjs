import crypto from "node:crypto"
import { atomicCreate } from "./research/run-state.mjs"

function branchHash(output, branch) {
  const lines = output.trim().split(/\r?\n/).filter(Boolean)
  const matches = lines
    .map((line) => line.match(/^([a-f0-9]{40}|[a-f0-9]{64})\s+(.+)$/))
    .filter((match) => match?.[2] === `refs/heads/${branch}`)
  if (matches.length > 1) throw Error("Remote branch readback returned duplicate refs")
  return matches[0]?.[1] || null
}

function readRemote(runGit, remote, branch) {
  return branchHash(runGit(["ls-remote", remote, `refs/heads/${branch}`]), branch)
}

export function pushAndVerify({
  root,
  remote = "origin",
  branch = "main",
  runGit,
  now = () => new Date().toISOString(),
  attemptId = crypto.randomUUID(),
}) {
  if (!root || typeof runGit !== "function") throw Error("Publication root and git runner required")
  if (!/^[a-zA-Z0-9_.-]+$/.test(remote) || !/^[a-zA-Z0-9_.-]+$/.test(branch))
    throw Error("Invalid publication remote or branch")
  if (!/^[a-zA-Z0-9_.-]+$/.test(attemptId)) throw Error("Invalid publication attempt ID")

  const localCommit = runGit(["rev-parse", "HEAD"])
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(localCommit))
    throw Error("Invalid local publication commit hash")
  const remoteBefore = readRemote(runGit, remote, branch)
  const alreadyCurrent = remoteBefore === localCommit
  let pushError = false
  if (!alreadyCurrent) {
    try {
      runGit(["push", remote, branch], { stdio: "inherit" })
    } catch {
      pushError = true
    }
  }

  let remoteAfter = null
  let readbackError = false
  try {
    remoteAfter = readRemote(runGit, remote, branch)
  } catch {
    readbackError = true
  }
  const status = readbackError
    ? "readback_unavailable"
    : remoteAfter === localCommit
      ? alreadyCurrent
        ? "remote_already_current"
        : pushError
          ? "remote_confirmed_after_push_error"
          : "remote_confirmed"
      : pushError
        ? "push_not_confirmed"
        : "remote_mismatch"
  const receipt = {
    schema: "publication-push-receipt/v1",
    attempt_id: attemptId,
    created_at: now(),
    remote,
    branch,
    local_commit: localCommit,
    remote_before_sha: remoteBefore,
    remote_after_sha: remoteAfter,
    push_command_error: pushError,
    readback_error: readbackError,
    status,
  }
  atomicCreate(root, `publication/push-attempts/${attemptId}.json`, receipt)
  if (
    !["remote_confirmed", "remote_confirmed_after_push_error", "remote_already_current"].includes(
      status,
    )
  )
    throw Error(`Publication push is not confirmed: ${status}; receipt ${receipt.attempt_id}`)
  return receipt
}
