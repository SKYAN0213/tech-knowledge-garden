import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { spawn } from "node:child_process"
import {
  configureDriveAuth,
  driveAuthStatus,
  loginDrive,
  logoutDrive,
  recoverDriveLock,
} from "./research/drive-auth.mjs"
import { driveStorageAction } from "./research/drive-storage.mjs"

const repo = fileURLToPath(new URL("../", import.meta.url))
const usage = `Local Drive (development transfers are explicit; regular operation remains gated):
  node scripts/research-drive.mjs auth configure --client /absolute/desktop-client.json [--mode readwrite|readonly]
  node scripts/research-drive.mjs auth login [--open-browser]
  node scripts/research-drive.mjs auth status
  node scripts/research-drive.mjs auth logout
  node scripts/research-drive.mjs auth recover --lock auth|storage --owner UUID
  node scripts/research-drive.mjs storage status|pull|push [--bundle-id ID] [--limit 1] [--regular]
  node scripts/research-drive.mjs storage import --file-id ID --sha256 SHA
  All commands accept --root PRIVATE_ROOT (default .local). Tokens are never printed.`

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      root: { type: "string" },
      client: { type: "string" },
      mode: { type: "string" },
      "open-browser": { type: "boolean", default: false },
      regular: { type: "boolean", default: false },
      "bundle-id": { type: "string" },
      limit: { type: "string" },
      "file-id": { type: "string" },
      sha256: { type: "string" },
      lock: { type: "string" },
      owner: { type: "string" },
      help: { type: "boolean", default: false },
    },
  })
  if (values.help) console.log(usage)
  else {
    if (positionals.length !== 2) throw Error(usage)
    const [group, action] = positionals
    const root = path.resolve(repo, values.root || ".local")
    let result
    if (group === "auth") {
      if (action === "configure" && values.client)
        result = await configureDriveAuth(
          root,
          path.resolve(values.client),
          values.mode || "readwrite",
        )
      else if (action === "status") result = driveAuthStatus(root)
      else if (action === "logout") result = await logoutDrive(root)
      else if (action === "recover") result = recoverDriveLock(root, values.lock, values.owner)
      else if (action === "login")
        result = await loginDrive(root, {
          onAuthorization: (url) => {
            console.error("Open this Google authorization URL in your browser:\n" + url)
            if (values["open-browser"]) {
              const command =
                process.platform === "darwin"
                  ? "open"
                  : process.platform === "win32"
                    ? "explorer.exe"
                    : "xdg-open"
              const child = spawn(command, [url], { stdio: "ignore", shell: false })
              child.on("error", () => console.error("Open the authorization URL above manually."))
              child.unref()
            }
          },
        })
      else throw Error(usage)
    } else if (group === "storage") {
      result = await driveStorageAction(repo, root, `remote-${action}`, {
        regular: values.regular,
        ...(values["bundle-id"] ? { bundle_id: values["bundle-id"] } : {}),
        ...(values.limit ? { limit: Number(values.limit) } : {}),
        ...(values["file-id"] ? { file_id: values["file-id"] } : {}),
        ...(values.sha256 ? { expected_sha256: values.sha256 } : {}),
      })
    } else throw Error(usage)
    console.log(JSON.stringify(result, null, 2))
  }
} catch (error) {
  console.error(
    JSON.stringify({
      status: "failed",
      code: error.code || "DRIVE_COMMAND_FAILED",
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    }),
  )
  process.exitCode = 1
}
