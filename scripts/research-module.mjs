import { moduleCLI } from "./research/module-cli.mjs"
moduleCLI(process.argv.slice(2))
  .then((result) => {
    console.log(JSON.stringify(result, null, 2))
    if (result.state === "failed" || result.state === "interrupted") process.exitCode = 1
  })
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
