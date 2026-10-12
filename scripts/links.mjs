import path from "node:path"
const MAP = "Knowledge Maps/AI Technology Knowledge Map"
const decode = (s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
const normalize = (s) =>
  decode(s).normalize("NFC").replace(/\.md$/, "").replace(/^\.\//, "").toLowerCase()
export function makeResolver(notes) {
  const byPath = new Map(notes.map((n) => [normalize(n.path), n]))
  const aliases = new Map()
  for (const n of notes)
    for (const a of [path.basename(n.path), n.meta.title, ...(n.meta.aliases || [])].filter(
      Boolean,
    )) {
      const key = normalize(a)
      if (!aliases.has(key)) aliases.set(key, new Set())
      aliases.get(key).add(n)
    }
  return (raw, current) => {
    const [file, ...rest] = raw.split("#"),
      hash = rest.join("#")
    let note = !file
      ? byPath.get(normalize(current))
      : byPath.get(normalize(file)) ||
        byPath.get(normalize(path.posix.join(path.posix.dirname(current), file)))
    if (!note) {
      const candidates = aliases.get(normalize(file))
      if (candidates?.size === 1) note = [...candidates][0]
      else if (candidates?.size > 1) throw Error("Ambiguous link: " + raw)
    }
    if (!note) throw Error("Unresolved link: " + raw + " from " + current)
    return { note, hash }
  }
}
export function projectLinks(body, current, resolve, publicPaths, { verifiedSources = [] } = {}) {
  // Code is literal; only prose links participate in the note resolver.
  return body
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`+[^`]*?`+)/g)
    .map((part) => {
      if (part.startsWith("`") || part.startsWith("~~~")) return part
      part = part.replace(
        /(?<!!)\[([^\[\]]+)\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g,
        (all, label, destination, offset, prose) => {
          const target = destination.replace(/^<|>$/g, "")
          if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(target)) return all
          // A reviewed source ledger may cite an older article that has not
          // been projected into this publication. Keep its label and the exact
          // verified source on that line; do not invent a public News page.
          if (/(?:^|\/)News\/[a-f0-9]{16}\.md(?:#[^\s]*)?$/.test(target)) {
            try {
              resolve(target, current)
            } catch (error) {
              if (!String(error.message).startsWith("Unresolved link: ")) throw error
              const start = prose.lastIndexOf("\n", offset) + 1
              const end = prose.indexOf("\n", offset)
              const line = prose.slice(start, end < 0 ? undefined : end)
              const cited = [...line.matchAll(/\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/g)]
                .some((match) => verifiedSources.includes(match[1]))
              if (cited) return label
              throw error
            }
          }
          return `[[${target}|${label}]]`
        },
      )
      return part.replace(/(!?)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, embed, target, label) => {
        const { note, hash } = resolve(target, current)
        let p = note.path.replace(/^Editions\//, "Briefings/")
        if (note.meta.entry_type === "index") p = MAP
        if (!publicPaths.has(p)) return label || note.meta.title || path.basename(p)
        if (embed) throw Error("Note embed requires explicit projection: " + target)
        return `[[${p}${hash ? "#" + hash : ""}|${!label || label === note.meta.title || label === path.basename(note.path) ? note.meta.label || label || note.meta.title || path.basename(p) : label}]]`
      })
    })
    .join("")
}
