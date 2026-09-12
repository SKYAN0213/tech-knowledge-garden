import http from "node:http"
import fs from "node:fs"
import path from "node:path"
const root = path.resolve("public"),
  prefix = "/tech-knowledge-garden"
http
  .createServer((req, res) => {
    let uri
    try {
      uri = decodeURIComponent(new URL(req.url, "http://localhost").pathname)
    } catch {
      res.writeHead(400)
      return res.end()
    }
    if (uri.startsWith(prefix)) uri = uri.slice(prefix.length)
    const p = path.resolve(root, "." + uri)
    if (p !== root && !p.startsWith(root + path.sep)) {
      res.writeHead(403)
      return res.end()
    }
    const target = [p, p + ".html", path.join(p, "index.html")].find(
      (p) => fs.existsSync(p) && fs.statSync(p).isFile(),
    )
    if (!target) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" })
      return res.end(fs.readFileSync(path.join(root, "404.html")))
    }
    const mime =
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".xml": "application/rss+xml",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      }[path.extname(target)] || "application/octet-stream"
    res.writeHead(200, { "Content-Type": mime + "; charset=utf-8", "Cache-Control": "no-store" })
    fs.createReadStream(target).pipe(res)
  })
  .listen(8088, "127.0.0.1", () =>
    console.log("Reader preview http://127.0.0.1:8088/tech-knowledge-garden/"),
  )
