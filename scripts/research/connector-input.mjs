import { createInterface } from "node:readline"

// A shared, bounded JSON-line channel for connector-backed sessions. EOF is an
// error, never a completed Drive write. Remote credentials stay with the caller.
export function connectorInput(input = process.stdin) {
  const lines = createInterface({ input, crlfDelay: Infinity }),
    queue = []
  let waiter,
    closed = false
  const keepAlive = setInterval(() => {}, 1000)
  lines.on("line", (line) => {
    if (waiter) {
      const next = waiter
      waiter = null
      next.resolve(line)
    } else if (queue.length >= 16) {
      lines.close()
    } else queue.push(line)
  })
  lines.on("close", () => {
    closed = true
    if (waiter) {
      waiter.reject(Error("Connector input closed"))
      waiter = null
    }
  })
  return {
    async read(type, fields) {
      if (waiter) throw Error("Only one connector input request may be pending")
      const line = queue.length
        ? queue.shift()
        : closed
          ? (() => {
              throw Error("Connector input closed")
            })()
          : await new Promise((resolve, reject) => {
              waiter = { resolve, reject }
            })
      if (Buffer.byteLength(line) > 4096) throw Error("Connector message too long")
      const message = JSON.parse(line)
      if (
        message.type !== type ||
        Object.keys(message).sort().join() !== ["type", ...fields].sort().join() ||
        fields.some((field) => typeof message[field] !== "string" || !message[field])
      )
        throw Error("Exact connector input message required")
      return message
    },
    close() {
      clearInterval(keepAlive)
      lines.close()
    },
  }
}
