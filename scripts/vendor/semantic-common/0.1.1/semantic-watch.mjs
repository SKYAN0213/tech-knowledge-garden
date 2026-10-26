// OS notifications only. The consumer owns durable queue, locks and execution.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { parseJSON, MAX_WATCH_EVENT_BYTES } from "./semantic-common.mjs";

export function startWatcher(
  config,
  {
    emit = (event) => process.stdout.write(JSON.stringify(event) + "\n"),
    watch = fs.watch,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = {},
) {
  if (
    !config ||
    config.schema !== "semantic-watch-config/v1" ||
    config.debounce_ms !== 2000 ||
    !Array.isArray(config.roots) ||
    !config.roots.length ||
    config.roots.length > 64 ||
    Object.keys(config).some(
      (k) =>
        !["schema", "roots", "debounce_ms", "stop_on_stdin_end"].includes(k),
    ) ||
    (config.stop_on_stdin_end !== undefined &&
      typeof config.stop_on_stdin_end !== "boolean")
  )
    throw Error("invalid watcher config");
  const inside = (root, item) =>
    item === root || item.startsWith(root + path.sep);
  const ids = new Set(),
    paths = [];
  const roots = config.roots.map((r) => {
    if (
      !r ||
      Object.keys(r).sort().join("|") !==
        "extensions|id|ignore|path|recursive" ||
      typeof r.id !== "string" ||
      /^[A-Za-z0-9._-]{1,128}$/.exec(r.id)?.[0] !== r.id ||
      ids.has(r.id) ||
      !path.isAbsolute(r.path) ||
      path.resolve(r.path) !== r.path ||
      fs.realpathSync(r.path) !== r.path ||
      !fs.statSync(r.path).isDirectory() ||
      typeof r.recursive !== "boolean" ||
      !Array.isArray(r.extensions) ||
      r.extensions.some(
        (x) => typeof x !== "string" || /^\.[A-Za-z0-9]+$/.exec(x)?.[0] !== x,
      ) ||
      !Array.isArray(r.ignore) ||
      r.ignore.some(
        (x) =>
          typeof x !== "string" ||
          !path.isAbsolute(x) ||
          path.resolve(x) !== x ||
          !inside(r.path, x),
      ) ||
      paths.some((p) => inside(p, r.path) || inside(r.path, p))
    )
      throw Error("invalid/overlapping watcher root");
    ids.add(r.id);
    paths.push(r.path);
    return { ...r, watchers: [], retry: null, attempt: 0, generation: 0 };
  });
  let paused = false,
    closed = false,
    timer = null,
    sequence = 0;
  const pending = new Map(),
    reconciles = new Set();
  const send = (event) => {
    const payload = { schema: "semantic-watch-event/v1", ...event };
    if (
      Buffer.byteLength(JSON.stringify(payload) + "\n", "utf8") >
      MAX_WATCH_EVENT_BYTES
    )
      throw Error("watcher event exceeds UTF-8 byte limit");
    emit(payload);
  };
  function schedule(reason = "fs_event") {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (paused || closed) return;
    timer = setTimer(() => {
      timer = null;
      flush(reason);
    }, config.debounce_ms);
  }
  function flush(reason) {
    if (paused || closed || (!pending.size && !reconciles.size)) return;
    let changes = [...pending.values()].sort((a, b) =>
      (a.root_id + "/" + a.path).localeCompare(b.root_id + "/" + b.path),
    );
    const batch = {
      schema: "semantic-watch-event/v1",
      type: "batch",
      sequence: ++sequence,
      changes,
      reconcile_root_ids: [...reconciles].sort(),
      reason,
    };
    const costs = new Map();
    for (const change of changes)
      costs.set(
        change.root_id,
        (costs.get(change.root_id) || 0) +
          Buffer.byteLength(JSON.stringify(change), "utf8") +
          1,
      );
    const largest = [...costs].sort((a, b) => b[1] - a[1]);
    while (
      Buffer.byteLength(JSON.stringify(batch) + "\n", "utf8") >
      MAX_WATCH_EVENT_BYTES
    ) {
      const [id] = largest.shift();
      reconciles.add(id);
      changes = changes.filter((change) => change.root_id !== id);
      batch.changes = changes;
      batch.reconcile_root_ids = [...reconciles].sort();
    }
    send(batch);
    pending.clear();
    reconciles.clear();
  }
  function add(r, event, filename) {
    if (closed) return;
    r.attempt = 0;
    if (
      filename === null ||
      filename === undefined ||
      filename.toString() === ""
    ) {
      reconciles.add(r.id);
      pending.set(r.id + ":", {
        root_id: r.id,
        path: null,
        event: "reconcile",
      });
      schedule();
      return;
    }
    const relative = filename.toString().split(path.sep).join("/"),
      target = path.resolve(r.path, relative);
    if (!inside(r.path, target)) {
      send({
        type: "error",
        root_id: r.id,
        code: "PATH_OUTSIDE_ROOT",
        recoverable: false,
        attempt: 0,
      });
      return;
    }
    if (r.ignore.some((p) => inside(p, target))) return;
    if (r.extensions.length && !r.extensions.includes(path.extname(relative))) {
      // Directory changes must reconcile even when no file extension is present.
      if (event !== "rename") return;
      reconciles.add(r.id);
    }
    if (pending.size >= 4096) {
      for (const item of pending.values()) reconciles.add(item.root_id);
      reconciles.add(r.id);
      pending.clear();
    }
    pending.set(r.id + ":" + relative, {
      root_id: r.id,
      path: relative,
      event,
    });
    schedule();
  }
  function closeHandles(r) {
    r.generation++;
    for (const w of r.watchers.splice(0)) w.close();
  }
  function recover(r, error) {
    if (closed || r.retry !== null) return;
    closeHandles(r);
    reconciles.add(r.id);
    const delays = [100, 500, 2000],
      attempt = r.attempt++;
    send({
      type: "error",
      root_id: r.id,
      code: error?.code || "WATCH_FAILED",
      recoverable: attempt < delays.length,
      attempt: attempt + 1,
    });
    if (attempt >= delays.length) {
      schedule("recovery");
      return;
    }
    r.retry = setTimer(() => {
      r.retry = null;
      try {
        arm(r);
        reconciles.add(r.id);
        schedule("recovery");
      } catch (e) {
        recover(r, e);
      }
    }, delays[attempt]);
  }
  function arm(r) {
    closeHandles(r);
    if (
      fs.realpathSync(r.path) !== r.path ||
      !fs.statSync(r.path).isDirectory()
    )
      throw Object.assign(Error("watch root unavailable"), {
        code: "ROOT_UNAVAILABLE",
      });
    const generation = r.generation;
    const identity = fs.statSync(r.path);
    const current = () => !closed && r.generation === generation;
    const own = watch(
      r.path,
      { persistent: true, recursive: r.recursive, encoding: "utf8" },
      (event, filename) => {
        if (current()) add(r, event, filename);
      },
    );
    r.watchers.push(own);
    const parent = watch(
      path.dirname(r.path),
      { persistent: true, recursive: false, encoding: "utf8" },
      (event, filename) => {
        if (
          !current() ||
          (filename != null && filename.toString() !== path.basename(r.path))
        )
          return;
        if (filename != null) {
          try {
            const actual = fs.lstatSync(r.path);
            if (
              actual.dev === identity.dev &&
              actual.ino === identity.ino &&
              !actual.isSymbolicLink()
            )
              return;
          } catch (e) {
            if (e.code !== "ENOENT") {
              recover(r, e);
              return;
            }
          }
        }
        reconciles.add(r.id);
        try {
          arm(r);
          schedule("recovery");
        } catch (e) {
          recover(r, e);
        }
      },
    );
    r.watchers.push(parent);
    for (const watcher of [own, parent])
      watcher.on("error", (e) => {
        if (current()) recover(r, e);
      });
  }
  function stop() {
    if (closed) return;
    if (!paused) flush("fs_event");
    closed = true;
    if (timer !== null) clearTimer(timer);
    for (const r of roots) {
      closeHandles(r);
      if (r.retry !== null) clearTimer(r.retry);
    }
    send({ type: "stopped" });
  }
  function command(name) {
    if (closed) return;
    if (name === "stop") return stop();
    if (name === "pause") {
      paused = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
      return;
    }
    if (name !== "check" && name !== "resume")
      throw Error("unsupported watcher command");
    if (name === "resume") paused = false;
    for (const r of roots) {
      reconciles.add(r.id);
      if (r.retry !== null) {
        clearTimer(r.retry);
        r.retry = null;
      }
      try {
        arm(r);
        r.attempt = 0;
      } catch (e) {
        recover(r, e);
      }
    }
    if (timer !== null) clearTimer(timer);
    timer = null;
    flush(name);
  }
  try {
    for (const r of roots) arm(r);
  } catch (e) {
    for (const r of roots) closeHandles(r);
    throw e;
  }
  send({ type: "ready", root_ids: [...ids], debounce_ms: config.debounce_ms });
  return {
    command,
    stop,
    notify: (id, event, filename) => {
      const r = roots.find((r) => r.id === id);
      if (!r) throw Error("unregistered root");
      add(r, event, filename);
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  let service;
  try {
    if (
      +process.versions.node.split(".")[0] < 22 ||
      process.argv.length !== 4 ||
      process.argv[2] !== "--config" ||
      !path.isAbsolute(process.argv[3])
    )
      throw Error(
        "Usage: Node >=22 semantic-watch.mjs --config <absolute-json>",
      );
    const config = parseJSON(fs.readFileSync(process.argv[3]));
    service = startWatcher(config);
    const input = readline.createInterface({ input: process.stdin });
    input.on("line", (line) => {
      try {
        const item = parseJSON(Buffer.from(line));
        if (!item || Object.keys(item).join() !== "command")
          throw Error("invalid command");
        service.command(item.command);
        if (item.command === "stop") {
          input.close();
          process.stdin.destroy();
        }
      } catch (e) {
        process.stderr.write(e.message + "\n");
        service.stop();
        process.exitCode = 1;
        input.close();
        process.stdin.destroy();
      }
    });
    input.on("close", () => {
      if (config.stop_on_stdin_end !== false) service.stop();
    });
    for (const sig of ["SIGTERM", "SIGINT"])
      process.once(sig, () => {
        service.stop();
        input.close();
        process.stdin.destroy();
      });
    process.stdout.on("error", () => {
      service.stop();
      input.close();
      process.stdin.destroy();
      process.exitCode = 1;
    });
  } catch (e) {
    process.stderr.write(e.message + "\n");
    service?.stop();
    process.exitCode = 1;
  }
}
