import { parseArgs } from "node:util"
import { spawnSync } from "node:child_process"
import { DEFAULT_ROOT } from "./research/run-state.mjs"
import { verifyPublicReadback, archivePublicReadback } from "./research/public-readback.mjs"

try {
  const { values } = parseArgs({
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      run: { type: "string" },
      "preview-run": { type: "string" },
      commit: { type: "string" },
      "actions-run": { type: "string" },
      archive: { type: "boolean", default: false },
      repository: { type: "string" },
    },
  })
  if (values.archive) {
    if (values["actions-run"]) throw Error("Archive uses stored deployment evidence")
    console.log(
      JSON.stringify(
        await archivePublicReadback({
          root: values.root,
          run: values.run,
          previewRun: values["preview-run"],
          commit: values.commit,
          repository: values.repository || process.cwd(),
        }),
        null,
        2,
      ),
    )
  } else {
    if (values.repository) throw Error("--repository is only supported for archival verification")
    if (!/^\d+$/.test(values["actions-run"] || "")) throw Error("Exact --actions-run required")
    const result = spawnSync(
      "gh",
      [
        "run",
        "view",
        values["actions-run"],
        "--repo",
        "SKYAN0213/tech-knowledge-garden",
        "--json",
        "status,conclusion,headSha,jobs,url",
      ],
      { encoding: "utf8", timeout: 30_000 },
    )
    if (result.status !== 0) throw Error("Cannot confirm the requested deployment from GitHub")
    const receipt = await verifyPublicReadback({
      root: values.root,
      run: values.run,
      previewRun: values["preview-run"],
      commit: values.commit,
      deployment: JSON.parse(result.stdout),
    })
    console.log(
      JSON.stringify(
        {
          path: receipt.path,
          status: receipt.status,
          commit: receipt.commit,
          files: receipt.files.length,
          reader_equivalent: receipt.reader_equivalent,
          drive_verified: false,
          browser_verified: false,
          public_written: false,
        },
        null,
        2,
      ),
    )
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
