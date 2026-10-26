// Semantic Common 0.1.1. Built-ins only; no authority to review or publish.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { isIP } from "node:net";

export const VERSION = "0.1.1";
export const CONTRACT_VERSION = "0.1.0";
export const MAX_WATCH_EVENT_BYTES = 1024 * 1024;
export const MAX_BYTES = 64 * 1024 * 1024;
const schema = JSON.parse(
  fs.readFileSync(
    new URL("./semantic-bundle.schema.json", import.meta.url),
    "utf8",
  ),
);
export class BundleError extends Error {}
export const sha256 = (data) =>
  crypto.createHash("sha256").update(data).digest("hex");
export const normalizeSearch = (text) =>
  text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\n]+/g, " ")
    .replace(/^[ \t\n]+|[ \t\n]+$/g, "");
const fail = (message) => {
  throw new BundleError(message);
};
const whitespace =
  /[ \t\n\r\f\v\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/u;
function shape(value, rule, at = "$") {
  if (rule.$ref)
    return shape(value, schema.$defs[rule.$ref.split("/").at(-1)], at);
  if (rule.anyOf) {
    for (const option of rule.anyOf) {
      try {
        shape(value, option, at);
        return;
      } catch (e) {
        if (!(e instanceof BundleError)) throw e;
      }
    }
    fail(at + ": invalid nullable value");
  }
  if (rule.enum && !rule.enum.includes(value)) fail(at + ": invalid enum");
  const kind = rule.type;
  const valid = {
    object:
      value !== null && typeof value === "object" && !Array.isArray(value),
    array: Array.isArray(value),
    string: typeof value === "string",
    boolean: typeof value === "boolean",
    null: value === null,
  };
  if (kind && !valid[kind]) fail(at + ": invalid " + kind);
  if (kind === "object") {
    if (
      Object.keys(value).length !== rule.required.length ||
      rule.required.some((k) => !Object.hasOwn(value, k))
    )
      fail(at + ": missing or unknown keys");
    for (const [key, item] of Object.entries(value))
      shape(item, rule.properties[key], at + "." + key);
  }
  if (kind === "array") {
    if (
      value.length < (rule.minItems ?? 0) ||
      value.length > (rule.maxItems ?? 100000)
    )
      fail(at + ": array length");
    value.forEach((item, i) => shape(item, rule.items, `${at}[${i}]`));
  }
  if (kind === "string") {
    const chars = [...value];
    if (
      chars.length < (rule.minLength ?? 0) ||
      chars.length > (rule.maxLength ?? MAX_BYTES)
    )
      fail(at + ": string length");
    if (
      rule.pattern &&
      new RegExp(rule.pattern, "u").exec(value)?.[0] !== value
    )
      fail(at + ": pattern");
    if (
      chars.some(
        (c) => c.codePointAt(0) >= 0xd800 && c.codePointAt(0) <= 0xdfff,
      )
    )
      fail(at + ": lone surrogate");
  }
}
function unique(items, label) {
  if (new Set(items).size !== items.length) fail("duplicate " + label);
}
function relative(value) {
  return (
    value &&
    !/[\\:]/.test(value) &&
    value.split("/").every((p) => p && p !== "." && p !== "..")
  );
}
export function validateBundle(
  bundle,
  { sourceId, requirePublic = false } = {},
) {
  shape(bundle, schema);
  if (sourceId !== undefined && bundle.source.id !== sourceId)
    fail("unregistered source");
  if (bundle.coverage.status === "complete" && bundle.coverage.omissions.length)
    fail("complete coverage cannot omit records");
  for (const key of ["records", "relations", "evidence"])
    unique(
      bundle[key].map((r) => r.id),
      key + " IDs",
    );
  unique(
    bundle.records.map((r) => JSON.stringify([r.kind, r.native_id])),
    "native identities",
  );
  const records = new Map(bundle.records.map((r) => [r.id, r])),
    evidence = new Map(bundle.evidence.map((r) => [r.id, r])),
    outgoing = new Set();
  for (const item of bundle.evidence)
    if (item.record_id !== null) {
      const r = records.get(item.record_id);
      if (
        !r ||
        item.source_native_id !== r.native_id ||
        item.source_revision !== r.provenance.revision ||
        item.source_bytes_sha256 !== r.provenance.bytes_sha256 ||
        !r.text.includes(item.quote)
      )
        fail("evidence source/revision/quote mismatch");
    }
  for (const rel of bundle.relations) {
    if (!records.has(rel.source_id) || !records.has(rel.target_id))
      fail("dangling relation");
    if (
      rel.predicate.split(":")[0] !== bundle.source.project ||
      rel.directed !== (rel.predicate !== "garden:associated")
    )
      fail("native relation namespace/direction mismatch");
    const kinds = {
        "wiki:broader": [["concept"], ["concept"]],
        "wiki:instance_of": [["entity", "event", "procedure"], ["concept"]],
        "wiki:part_of": [["entity"], ["entity"]],
        "wiki:depends_on": [["procedure"], ["procedure"]],
        ...Object.fromEntries(
          [
            "garden:topic",
            "garden:application",
            "garden:comparison_evaluation",
            "garden:context_background",
          ].map((p) => [p, [["article", "claim"], ["concept"]]]),
        ),
      },
      expected = kinds[rel.predicate];
    if (
      rel.source_id === rel.target_id ||
      (expected &&
        (!expected[0].includes(records.get(rel.source_id).kind) ||
          !expected[1].includes(records.get(rel.target_id).kind)))
    )
      fail("native relation subject kinds/self link");
    if (![...rel.reason].some((c) => !whitespace.test(c)))
      fail("relation requires reason");
    unique(rel.evidence_ids, "relation evidence");
    unique(rel.native_evidence_ids, "native relation evidence");
    if (rel.evidence_ids.some((e) => !evidence.has(e)))
      fail("dangling relation evidence");
    if (["declared", "reviewed"].includes(rel.status))
      outgoing.add(rel.source_id);
  }
  for (const r of records.values()) {
    const p = r.provenance,
      review = r.review;
    if (p.path !== null && !relative(p.path)) fail("non-relative source path");
    unique(p.urls, "source URLs");
    for (const url of [...p.urls, ...(p.url === null ? [] : [p.url])]) {
      if (
        !/^https?:\/\//.test(url) ||
        whitespace.test(url) ||
        /[\\\x00-\x1f\x7f]/.test(url)
      )
        fail("unsafe display URL");
      const match =
        /^https?:\/\/(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(?::([0-9]{1,5}))?(?:[/?#].*)?$/u.exec(
          url,
        );
      if (
        !match ||
        match[0] !== url ||
        (match[2] !== undefined && Number(match[2]) > 65535)
      )
        fail("unsafe display URL host");
      const host = match[1];
      if (host.startsWith("[")) {
        if (isIP(host.slice(1, -1)) !== 6) fail("unsafe display URL host");
      } else if (
        /^(?:[0-9]+|0[xX][a-fA-F0-9]+)$/.test(
          host.replace(/\.$/, "").split(".").at(-1),
        )
      ) {
        if (isIP(host) !== 4) fail("unsafe display URL host");
      } else if (
        host.replace(/\.$/, "").length > 253 ||
        host
          .replace(/\.$/, "")
          .split(".")
          .some(
            (label) =>
              !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label),
          )
      )
        fail("unsafe display URL host");
    }
    unique(
      p.fingerprints.map((f) => f.profile),
      "fingerprint profile",
    );
    unique(r.aliases, "aliases");
    unique(r.evidence_ids, "record evidence");
    if (r.evidence_ids.some((e) => !evidence.has(e)))
      fail("dangling record evidence");
    if (
      review.evidence === "verified" &&
      !r.evidence_ids.some((e) => evidence.get(e).verification === "verified")
    )
      fail("verified record requires verified evidence");
    if (
      (review.semantic === "reviewed_links" && !outgoing.has(r.id)) ||
      (review.semantic === "reviewed_none" && outgoing.has(r.id))
    )
      fail("semantic review/relations mismatch");
    if (
      requirePublic &&
      !["approved", "published"].includes(review.publication)
    )
      fail("nonpublic record in public export");
  }
  return bundle;
}

// Scan JSON keys before JSON.parse can discard duplicates. JSON.parse still checks grammar.
export function parseJSON(data) {
  if (data.length > MAX_BYTES) fail("bundle too large");
  const s = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
    data,
  );
  let i = 0;
  const ws = () => {
    while (/[ \r\n\t]/.test(s[i] ?? "\x00")) i++;
  };
  const str = () => {
    const start = i++;
    while (i < s.length) {
      const c = s[i++];
      if (c === "\\") i++;
      else if (c === '"') return JSON.parse(s.slice(start, i));
    }
    fail("unterminated JSON");
  };
  const value = (depth) => {
    if (depth > 100) fail("JSON depth");
    ws();
    if (s[i] === '"') {
      str();
      return;
    }
    if (s[i] === "{") {
      i++;
      ws();
      const keys = new Set();
      if (s[i] === "}") {
        i++;
        return;
      }
      for (;;) {
        ws();
        if (s[i] !== '"') fail("JSON key");
        const k = str();
        if (keys.has(k)) fail("duplicate JSON key");
        keys.add(k);
        ws();
        if (s[i++] !== ":") fail("JSON colon");
        value(depth + 1);
        ws();
        const c = s[i++];
        if (c === "}") return;
        if (c !== ",") fail("JSON object");
      }
    }
    if (s[i] === "[") {
      i++;
      ws();
      if (s[i] === "]") {
        i++;
        return;
      }
      for (;;) {
        value(depth + 1);
        ws();
        const c = s[i++];
        if (c === "]") return;
        if (c !== ",") fail("JSON array");
      }
    }
    const start = i;
    while (i < s.length && !/[ \r\n\t,\]}]/.test(s[i])) i++;
    if (start === i) fail("JSON value");
  };
  value(0);
  ws();
  if (i !== s.length) fail("trailing JSON");
  const parsed = JSON.parse(s);
  const finite = (v) => {
    if (typeof v === "number" && !Number.isFinite(v)) fail("nonfinite JSON");
    if (v && typeof v === "object") for (const x of Object.values(v)) finite(x);
  };
  finite(parsed);
  return parsed;
}
function read(root, relativePath) {
  let cursor = root;
  for (const part of relativePath.split("/")) {
    cursor = path.join(cursor, part);
    if (fs.lstatSync(cursor).isSymbolicLink()) fail("symlink in bundle");
  }
  const namedBefore = fs.lstatSync(cursor);
  if (
    !namedBefore.isFile() ||
    namedBefore.nlink !== 1 ||
    namedBefore.size > MAX_BYTES
  )
    fail("bundle must be a regular single-link bounded file");
  const fd = fs.openSync(
    cursor,
    fs.constants.O_RDONLY |
      (fs.constants.O_NOFOLLOW ?? 0) |
      (fs.constants.O_NONBLOCK ?? 0),
  );
  try {
    const before = fs.fstatSync(fd);
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.ino !== namedBefore.ino ||
      before.dev !== namedBefore.dev ||
      before.size > MAX_BYTES
    )
      fail("bundle too large/not a file");
    const chunks = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.alloc(Math.min(65536, MAX_BYTES + 1 - total));
      const size = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (!size) break;
      chunks.push(chunk.subarray(0, size));
      total += size;
      if (total > MAX_BYTES) fail("bundle too large");
    }
    const data = Buffer.concat(chunks, total),
      after = fs.fstatSync(fd),
      named = fs.lstatSync(cursor);
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ino !== named.ino ||
      before.dev !== named.dev ||
      named.nlink !== 1 ||
      fs.realpathSync(cursor) !== cursor ||
      data.length > MAX_BYTES
    )
      fail("bundle changed during read");
    return data;
  } finally {
    fs.closeSync(fd);
  }
}
export function loadBundle(root, options = {}) {
  root = path.resolve(root);
  if (fs.realpathSync(root) !== root) fail("symlink bundle root");
  const pointer = parseJSON(read(root, "current.json"));
  if (
    !pointer ||
    Object.keys(pointer).sort().join("|") !==
      "bundle_id|manifest_sha256|schema" ||
    pointer.schema !== "semantic-bundle-pointer/v1" ||
    !/^[a-f0-9]{64}$/.test(pointer.bundle_id) ||
    !/^[a-f0-9]{64}$/.test(pointer.manifest_sha256)
  )
    fail("invalid pointer");
  const base = "bundles/" + pointer.bundle_id + "/",
    manifestData = read(root, base + "manifest.json");
  if (sha256(manifestData) !== pointer.manifest_sha256)
    fail("manifest SHA mismatch");
  const manifest = parseJSON(manifestData),
    data = read(root, base + "bundle.json");
  if (
    !manifest ||
    Object.keys(manifest).sort().join("|") !==
      "bundle_id|contract_version|files|schema|source_id" ||
    manifest.schema !== "semantic-bundle-manifest/v1" ||
    manifest.contract_version !== CONTRACT_VERSION ||
    manifest.bundle_id !== pointer.bundle_id ||
    sha256(data) !== pointer.bundle_id ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== 1 ||
    Object.keys(manifest.files[0]).sort().join("|") !== "bytes|path|sha256" ||
    manifest.files[0].path !== "bundle.json" ||
    manifest.files[0].bytes !== data.length ||
    manifest.files[0].sha256 !== sha256(data)
  )
    fail("bundle manifest mismatch");
  const bundle = validateBundle(parseJSON(data), options);
  if (manifest.source_id !== bundle.source.id) fail("manifest source mismatch");
  return { bundle, manifest, pointer };
}
const encode = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n");
function createImmutable(root, relativePath, data) {
  let fd;
  try {
    fd = fs.openSync(path.join(root, relativePath), "wx", 0o600);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    if (!read(root, relativePath).equals(data))
      fail("immutable bundle overwritten");
    return;
  }
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
export function writeBundle(root, bundle) {
  validateBundle(bundle);
  root = path.resolve(root);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  if (fs.realpathSync(root) !== root) fail("symlink bundle root");
  const data = encode(bundle);
  if (data.length > MAX_BYTES) fail("bundle too large");
  const bundleId = sha256(data),
    bundles = path.join(root, "bundles"),
    base = "bundles/" + bundleId + "/";
  fs.mkdirSync(bundles, { recursive: true, mode: 0o700 });
  if (fs.realpathSync(bundles) !== bundles) fail("symlink bundle directory");
  const manifest = {
    schema: "semantic-bundle-manifest/v1",
    contract_version: CONTRACT_VERSION,
    source_id: bundle.source.id,
    bundle_id: bundleId,
    files: [{ path: "bundle.json", bytes: data.length, sha256: bundleId }],
  };
  const files = [
      ["bundle.json", data],
      ["manifest.json", encode(manifest)],
    ],
    stage = fs.mkdtempSync(path.join(bundles, ".stage-"));
  try {
    for (const [name, bytes] of files) createImmutable(stage, name, bytes);
    try {
      fs.renameSync(stage, path.join(root, base));
    } catch (e) {
      if (
        !fs.existsSync(path.join(root, base)) ||
        fs.realpathSync(path.join(root, base)) !==
          path.join(root, base).replace(/\/$/, "")
      )
        throw e;
      for (const [name, bytes] of files)
        if (!read(root, base + name).equals(bytes))
          fail("immutable bundle overwritten");
    }
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true });
  }
  const pointer = {
      schema: "semantic-bundle-pointer/v1",
      bundle_id: bundleId,
      manifest_sha256: sha256(encode(manifest)),
    },
    temp = ".current-" + crypto.randomUUID();
  try {
    createImmutable(root, temp, encode(pointer));
    fs.renameSync(path.join(root, temp), path.join(root, "current.json"));
  } finally {
    if (fs.existsSync(path.join(root, temp)))
      fs.unlinkSync(path.join(root, temp));
  }
  return pointer;
}
