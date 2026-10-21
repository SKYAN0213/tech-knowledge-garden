#!/usr/bin/env python3
"""Private Drive payload catalog, content-addressed packing and verified cache eviction."""

import argparse
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sqlite3
import stat
import tempfile
import zipfile
import gzip
import uuid

CONTROL = ".storage"
SCHEMA = "research-cold-storage/v1"
HASH = re.compile(r"^[a-f0-9]{64}$")
EXCLUDED = {CONTROL, "node_modules", ".git", "runtime", "venv", ".venv", "__pycache__"}
HOT_NAMES = {"state.json", "summary.json", "input.json", "manifest.json", "archive-manifest.json",
             "package-receipt.json", "drive-location.json", "drive-location-v2.json", "receipt.json",
             "candidate-backlog.json", "stdout.log", "stderr.log", "journal.jsonl", "verification.json"}


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def timestamp(value):
    if re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC", value):
        return dt.datetime.strptime(value, "%Y-%m-%d %H:%M:%S UTC").replace(tzinfo=dt.timezone.utc)
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Storage timestamp requires a timezone")
    return parsed


def digest_file(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def safe(root, relative):
    if not isinstance(relative, str):
        raise ValueError("Storage path must be a string")
    p = PurePosixPath(relative)
    if not isinstance(relative, str) or p.is_absolute() or not p.parts or ".." in p.parts or "\\" in relative or str(p) != relative:
        raise ValueError("Storage path must be normalized and relative")
    target = root
    for part in p.parts:
        target = target / part
        if target.is_symlink():
            raise ValueError("Symlink in storage path")
    return target


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".storage-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(value, f, ensure_ascii=False, separators=(",", ":"))
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def connect(root):
    control = safe(root, CONTROL)
    control.mkdir(exist_ok=True)
    db = sqlite3.connect(str(safe(root, CONTROL + "/catalog.sqlite")), timeout=30)
    db.row_factory = sqlite3.Row
    db.executescript("""
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL,
        mode INTEGER NOT NULL, mtime_ns TEXT NOT NULL, scope TEXT, cached_at TEXT);
      CREATE INDEX IF NOT EXISTS files_hash ON files(sha256);
      CREATE INDEX IF NOT EXISTS files_scope ON files(scope);
      CREATE TABLE IF NOT EXISTS objects(sha256 TEXT PRIMARY KEY, bytes INTEGER NOT NULL,
        bundle_id TEXT NOT NULL, member TEXT);
      CREATE INDEX IF NOT EXISTS objects_bundle ON objects(bundle_id);
      CREATE TABLE IF NOT EXISTS bundles(id TEXT PRIMARY KEY, kind TEXT NOT NULL, sha256 TEXT NOT NULL,
        bytes INTEGER NOT NULL, local_path TEXT, file_id TEXT, parent_id TEXT, name TEXT,
        verified_at TEXT, modified_time TEXT, legacy_verified_at TEXT, legacy_receipt TEXT);
      CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, path TEXT NOT NULL, sha256 TEXT,
        bundle_id TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL);
    """)
    return db


@contextlib.contextmanager
def exclusive(root):
    path = safe(root, CONTROL + "/mutation.lock")
    path.parent.mkdir(exist_ok=True)
    fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        os.write(fd, json.dumps({"pid": os.getpid(), "started_at": now()}).encode())
        os.fsync(fd)
        yield
    finally:
        os.close(fd)
        path.unlink()


def immutable_bytes(path, data):
    fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "wb") as out:
        out.write(data)
        out.flush()
        os.fsync(out.fileno())


def recover_mutation_lock(root, p):
    if p.get("expected_root") != str(root):
        raise ValueError("Expected storage root does not match")
    configured = policy(root)
    if configured.get("schema") != SCHEMA or configured.get("root") != str(root):
        raise ValueError("Storage policy root changed")
    expected_sha = p.get("expected_lock_sha256")
    expected_pid = p.get("expected_pid")
    if not isinstance(expected_sha, str) or not HASH.fullmatch(expected_sha):
        raise ValueError("Exact expected mutation lock SHA required")
    if type(expected_pid) is not int or expected_pid <= 0:
        raise ValueError("Exact expected mutation lock PID required")
    for key in ("operator", "reason"):
        if not isinstance(p.get(key), str) or not p[key].strip():
            raise ValueError("Mutation lock recovery requires operator and reason")
    lock = safe(root, CONTROL + "/mutation.lock")
    guard = safe(root, CONTROL + "/mutation-recovery.lock")
    # A persistent guard inode uses an OS lock, released even if recovery is killed.
    # Never unlink it: another process may already be waiting on the same inode.
    import fcntl
    guard_fd = os.open(str(guard), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        guard_stat = os.fstat(guard_fd)
        if not stat.S_ISREG(guard_stat.st_mode) or guard_stat.st_nlink != 1:
            raise ValueError("Mutation recovery guard must be a regular unaliased file")
        fcntl.flock(guard_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        def guard_unchanged():
            current = safe(root, CONTROL + "/mutation-recovery.lock").lstat()
            if (current.st_dev, current.st_ino, current.st_nlink) != (guard_stat.st_dev, guard_stat.st_ino, 1):
                raise ValueError("Mutation recovery guard changed; preserving owner lock")
        guard_unchanged()
        fd = os.open(str(lock), os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, "rb") as source:
            original_stat = os.fstat(source.fileno())
            if not stat.S_ISREG(original_stat.st_mode) or original_stat.st_nlink != 1:
                raise ValueError("Mutation lock must be a regular unaliased file")
            original = source.read()
        record = json.loads(original)
        if hashlib.sha256(original).hexdigest() != expected_sha or record.get("pid") != expected_pid:
            raise ValueError("Mutation lock identity does not match expected SHA/PID")
        if type(record.get("pid")) is not int or not isinstance(record.get("started_at"), str):
            raise ValueError("Mutation lock identity is malformed")
        timestamp(record["started_at"])
        try:
            os.kill(expected_pid, 0)
        except ProcessLookupError:
            pass
        except OSError as error:
            raise ValueError("Mutation lock owner visibility unknown; preserving lock") from error
        else:
            raise ValueError("Mutation lock owner is still running; preserving lock")
        def unchanged():
            guard_unchanged()
            current = safe(root, CONTROL + "/mutation.lock")
            with os.fdopen(os.open(str(current), os.O_RDONLY | os.O_NOFOLLOW), "rb") as source:
                current_stat = os.fstat(source.fileno())
                if (current_stat.st_dev, current_stat.st_ino, current_stat.st_mtime_ns, current_stat.st_size) != (original_stat.st_dev, original_stat.st_ino, original_stat.st_mtime_ns, original_stat.st_size) or source.read() != original:
                    raise ValueError("Mutation lock changed during recovery; preserving lock")
        unchanged()
        relative = CONTROL + "/mutation-lock-recoveries/" + uuid.uuid4().hex
        directory = safe(root, relative)
        directory.mkdir(parents=True)
        original_path = relative + "/original.lock"
        immutable_bytes(safe(root, original_path), original)
        receipt = {"schema": "research-storage-mutation-lock-recovery/v1", "root": str(root),
                   "expected_pid": expected_pid, "original_lock_sha256": expected_sha,
                   "original_lock_text": original.decode("utf-8"), "original_lock": record,
                   "original_lock_path": original_path, "operator": p["operator"], "reason": p["reason"],
                   "verification": {"kill_probe": "ESRCH", "identity_unchanged": True}, "checked_at": now()}
        immutable_bytes(directory / "prepared.json", (json.dumps(receipt) + "\n").encode())
        for durable in (directory, directory.parent, safe(root, CONTROL)):
            directory_fd = os.open(str(durable), os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        unchanged()
        lock.unlink()
        control_fd = os.open(str(safe(root, CONTROL)), os.O_RDONLY)
        try:
            os.fsync(control_fd)
        finally:
            os.close(control_fd)
        receipt.update(status="recovered", recovered_at=now())
        receipt_path = relative + "/receipt.json"
        immutable_bytes(safe(root, receipt_path), (json.dumps(receipt) + "\n").encode())
        directory_fd = os.open(str(directory), os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        return {"status": "recovered", "receipt_path": receipt_path, "expected_pid": expected_pid,
                "original_lock_sha256": expected_sha}
    finally:
        os.close(guard_fd)


def policy(root):
    path = safe(root, CONTROL + "/policy.json")
    return json.loads(path.read_text()) if path.exists() else {"schema": SCHEMA, "enabled": False,
        "cache_bytes": 2 * 1024 ** 3, "minimum_payload_bytes": 32768}


def initialize(root, p):
    value = policy(root)
    for key in ["cache_bytes", "minimum_payload_bytes"]:
        if key in p:
            if type(p[key]) is not int or p[key] < 0:
                raise ValueError("Invalid storage budget")
            value[key] = p[key]
    value.update(schema=SCHEMA, root=str(root), enabled=p.get("enabled", value["enabled"]))
    atomic_json(safe(root, CONTROL + "/policy.json"), value)
    return value


def active_native_locks(root, ignore_pid=None):
    live, held = [], []
    directories = {root / "locks", *root.glob("*/locks"), *root.glob("research/*/locks")}
    for p in (p for directory in directories for p in directory.glob("*.json")):
        if CONTROL in p.relative_to(root).parts:
            continue
        try:
            record = json.loads(p.read_text())
            pid = record.get("pid")
            alive = False
            if type(pid) is int and pid != ignore_pid:
                try:
                    os.kill(pid, 0)
                    alive = True
                except ProcessLookupError:
                    pass
            if alive:
                live.append(str(p.relative_to(root)))
            name = p.stem
            if name.startswith("run-"):
                held.append(str(p.parent.parent.relative_to(root) / "runs" / name[4:]))
            elif re.fullmatch(r"source-[a-f0-9]{20}", name):
                held.append(str(p.parent.parent.relative_to(root) / "documents" / name[7:]))
        except (ValueError, OSError):
            live.append(str(p.relative_to(root)))
    return live, held


def scope_for(relative):
    parts = PurePosixPath(relative).parts
    if "preview-workspace" in parts:
        return "/".join(parts[:parts.index("preview-workspace") + 1])
    return None


def eligible(relative, size, minimum):
    parts = PurePosixPath(relative).parts
    if any(x in EXCLUDED for x in parts) or any("credential" in x.lower() or "oauth" in x.lower() or "secret" in x.lower() for x in parts):
        return False
    if parts[-1] in HOT_NAMES or parts[-1].startswith(".") or parts[-1].endswith((".tmp", ".lock")):
        return False
    return bool(scope_for(relative)) or parts[-1] == "body.bin" or size >= minimum


def inventory(root, db, p):
    settings = initialize(root, p)
    live, held = active_native_locks(root, p.get("ignore_pid"))
    if live:
        raise ValueError("Active native locks; retain working data: " + ", ".join(live[:8]))
    count, total, changed = 0, 0, 0
    for directory, dirs, names in os.walk(root, followlinks=False):
        dirs[:] = [d for d in dirs if d not in EXCLUDED and not (Path(directory) / d).is_symlink()]
        for name in names:
            path = Path(directory) / name
            if path.is_symlink():
                continue
            rel = str(path.relative_to(root))
            st = path.stat()
            if not stat.S_ISREG(st.st_mode) or not eligible(rel, st.st_size, settings["minimum_payload_bytes"]) or any(rel == x or rel.startswith(x + "/") for x in held):
                continue
            old = db.execute("SELECT * FROM files WHERE path=?", (rel,)).fetchone()
            if old and old["bytes"] == st.st_size and int(old["mtime_ns"]) == st.st_mtime_ns:
                count += 1
                total += st.st_size
                continue
            sha = digest_file(path)
            after = path.stat()
            if (st.st_size, st.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise ValueError("Payload changed during inventory: " + rel)
            db.execute("INSERT OR REPLACE INTO files VALUES(?,?,?,?,?,?,?)",
                       (rel, sha, st.st_size, stat.S_IMODE(st.st_mode), str(st.st_mtime_ns), scope_for(rel), now()))
            count += 1
            total += st.st_size
            changed += 1
            if changed % 1000 == 0:
                db.commit()
    db.commit()
    return {"inventoried_files": count, "payload_bytes": total, "updated": changed,
            "protected_native_runs": held}


def import_legacy(root, db):
    count = 0
    for location in root.glob("research/local-ai/archive-staging/*/drive-location*.json"):
        record = json.loads(location.read_text())
        drive = record.get("drive", {})
        if drive.get("raw_sha256_verified") is not True or drive.get("shared") is not False:
            continue
        sha, size = record["package_sha256"], record["package_bytes"]
        manifest_path = root / "research/local-ai/runs" / record["archive_run"] / "archive-manifest.json"
        receipt_path = location.parent / "package-receipt.json"
        if not manifest_path.exists() or not receipt_path.exists():
            continue
        receipt = json.loads(receipt_path.read_text())
        if digest_file(manifest_path) != record["manifest_sha256"] or receipt.get("sha256") != sha:
            raise ValueError("Legacy archive manifest/receipt changed")
        bundle_id = "legacy-" + sha
        if db.execute("SELECT verified_at FROM bundles WHERE id=?", (bundle_id,)).fetchone():
            continue
        local = root / "research/local-ai" / receipt["path"]
        if local.exists() and (local.stat().st_size != size or digest_file(local) != sha):
            raise ValueError("Legacy package changed")
        db.execute("INSERT INTO bundles VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (bundle_id, "zip", sha, size, str(local.relative_to(root)), drive["file_id"], drive["parent_id"],
             drive["name"], None, None, record["verified_at"], str(location.relative_to(root))))
        manifest = json.loads(manifest_path.read_text())
        for f in manifest["files"]:
            member = "Sources/LocalAI/" + f["path"].removeprefix("documents/") if f["drive_root"] == "Sources" else "Research/LocalAI/" + f["path"]
            db.execute("INSERT OR IGNORE INTO objects VALUES(?,?,?,?)", (f["sha256"], f["bytes"], bundle_id, member))
        # The archive file itself is a separately addressable remote payload.
        direct = "direct-" + sha
        db.execute("INSERT OR IGNORE INTO bundles VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (direct, "direct", sha, size, str(local.relative_to(root)), drive["file_id"], drive["parent_id"],
             drive["name"], None, None, record["verified_at"], str(location.relative_to(root))))
        db.execute("INSERT OR IGNORE INTO objects VALUES(?,?,?,?)", (sha, size, direct, None))
        count += 1
    db.commit()
    return count


def pack(root, db, p):
    max_bytes = p.get("package_bytes", 64 * 1024 ** 2)
    if type(max_bytes) is not int or not 1024 <= max_bytes <= 128 * 1024 ** 2:
        raise ValueError("Invalid package budget")
    rows = db.execute("SELECT f.* FROM files f LEFT JOIN objects o ON f.sha256=o.sha256 WHERE o.sha256 IS NULL GROUP BY f.sha256 ORDER BY f.path").fetchall()
    groups, group, size = [], [], 0
    for row in rows:
        if group and size + row["bytes"] > max_bytes:
            groups.append(group)
            group, size = [], 0
        group.append(row)
        size += row["bytes"]
    if group:
        groups.append(group)
    directory = safe(root, CONTROL + "/packages")
    directory.mkdir(exist_ok=True)
    for group in groups:
        identity = hashlib.sha256("\n".join(r["sha256"] for r in group).encode()).hexdigest()
        bundle_id = "payload-" + identity
        destination = directory / (bundle_id + ".zip")
        fd, temp = tempfile.mkstemp(prefix=".package-", dir=directory)
        os.close(fd)
        try:
            with zipfile.ZipFile(temp, "w", zipfile.ZIP_DEFLATED, compresslevel=3) as z:
                for row in group:
                    source = safe(root, row["path"])
                    if digest_file(source) != row["sha256"]:
                        raise ValueError("Payload changed before packing: " + row["path"])
                    z.write(source, "objects/" + row["sha256"])
            sha = digest_file(Path(temp))
            size = Path(temp).stat().st_size
            if destination.exists():
                if digest_file(destination) != sha:
                    raise ValueError("Prepared package changed")
                Path(temp).unlink()
            else:
                os.replace(temp, destination)
            db.execute("INSERT INTO bundles VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (bundle_id, "zip", sha, size, str(destination.relative_to(root)), None,
                 p.get("parent_id"), destination.name, None, None, None, None))
            db.executemany("INSERT INTO objects VALUES(?,?,?,?)",
                [(r["sha256"], r["bytes"], bundle_id, "objects/" + r["sha256"]) for r in group])
            db.commit()
        finally:
            if os.path.exists(temp):
                os.unlink(temp)
    return {"new_packages": len(groups), "new_unique_objects": len(rows)}


def normalize_metadata(value):
    return {"id": value.get("id", value.get("file_id")), "name": value.get("title", value.get("name")),
            "size": int(value.get("size", value.get("file_size_bytes", -1))),
            "mime": value.get("mime_type", value.get("mimeType")),
            "parents": value.get("parent_ids", value.get("parents", [])),
            "modified": value.get("modified_time", value.get("modifiedTime")),
            "shared": value.get("shared"), "trashed": value.get("trashed", False)}


def remote_metadata(db, p):
    bundle = db.execute("SELECT * FROM bundles WHERE id=?", (p["bundle_id"],)).fetchone()
    if not bundle:
        raise ValueError("Unknown payload bundle")
    m = normalize_metadata(p["metadata"])
    observed = timestamp(p["observed_at"])
    if observed.tzinfo is None or abs((dt.datetime.now(dt.timezone.utc) - observed).total_seconds()) > 600:
        raise ValueError("Fresh remote metadata observation required")
    if not m["id"] or m["mime"] != "application/zip" or m["shared"] is not False or m["trashed"] or m["size"] != bundle["bytes"] or bundle["parent_id"] not in m["parents"] or (bundle["file_id"] and bundle["file_id"] != m["id"]):
        raise ValueError("Private Drive ID/parent/size does not match bundle")
    return bundle, m


def verify(root, db, p):
    bundle, m = remote_metadata(db, p)
    if p.get("download_path"):
        path = safe(root, p["download_path"])
        if digest_file(path) != bundle["sha256"] or path.stat().st_size != bundle["bytes"]:
            raise ValueError("Drive raw package differs from prepared bytes")
        if bundle["kind"] == "zip":
            with zipfile.ZipFile(path) as z:
                for row in db.execute("SELECT * FROM objects WHERE bundle_id=?", (bundle["id"],)):
                    h, length = hashlib.sha256(), 0
                    with z.open(row["member"]) as body:
                        for block in iter(lambda: body.read(1024 * 1024), b""):
                            length += len(block)
                            if length > row["bytes"]:
                                raise ValueError("Drive ZIP member exceeds catalog size")
                            h.update(block)
                    if length != row["bytes"] or h.hexdigest() != row["sha256"]:
                        raise ValueError("Drive ZIP member does not match catalog")
        proof = "current_raw_bytes"
    elif bundle["legacy_receipt"] and bundle["legacy_verified_at"] and m["modified"]:
        current = timestamp(m["modified"])
        verified = timestamp(bundle["legacy_verified_at"])
        record = json.loads(safe(root, bundle["legacy_receipt"]).read_text())
        if current > verified or record["package_sha256"] != bundle["sha256"] or record["drive"].get("raw_sha256_verified") is not True:
            raise ValueError("Changed legacy Drive bundle requires raw readback")
        proof = "preserved_raw_proof_and_unchanged_remote_metadata"
    else:
        raise ValueError("Actual downloaded Drive bytes required for a new bundle")
    db.execute("UPDATE bundles SET file_id=?,name=?,modified_time=?,verified_at=? WHERE id=?",
               (m["id"], m["name"], m["modified"], now(), bundle["id"]))
    db.commit()
    return {"bundle_id": bundle["id"], "verified": True, "verification_kind": proof, "file_id": m["id"]}


def pending(db):
    return {"downloads": [dict(r) for r in db.execute("SELECT r.*,b.file_id,b.parent_id,b.name,b.sha256 package_sha256,b.bytes package_bytes FROM requests r JOIN bundles b ON r.bundle_id=b.id WHERE r.status='pending' ORDER BY r.created_at")],
            "uploads": [dict(r) for r in db.execute("SELECT id,kind,sha256,bytes,local_path,file_id,parent_id,name,legacy_verified_at FROM bundles WHERE verified_at IS NULL ORDER BY id")]}


def hydrate(root, db, p):
    bundle = db.execute("SELECT * FROM bundles WHERE id=? AND verified_at IS NOT NULL", (p["bundle_id"],)).fetchone()
    if not bundle:
        raise ValueError("Hydration requires a verified Drive bundle")
    source = safe(root, p["download_path"])
    if digest_file(source) != bundle["sha256"] or source.stat().st_size != bundle["bytes"]:
        raise ValueError("Hydration raw package hash mismatch")
    paths = p.get("paths")
    if not isinstance(paths, list) or not paths:
        paths = [r[0] for r in db.execute("SELECT path FROM requests WHERE bundle_id=? AND status='pending'", (bundle["id"],))]
    if not paths:
        raise ValueError("Explicit paths or pending download requests required")
    if len(paths) > 1000:
        raise ValueError("Hydration native batch exceeds 1000 paths; use the storage CLI")
    restored, size = [], 0
    archive = zipfile.ZipFile(source) if bundle["kind"] == "zip" else None
    try:
        for rel in paths:
            row = db.execute("SELECT f.*,o.member FROM files f JOIN objects o ON f.sha256=o.sha256 WHERE f.path=? AND o.bundle_id=?", (rel, bundle["id"])).fetchone()
            if not row:
                raise ValueError("Requested path is not bound to this bundle")
            target = safe(root, rel)
            if target.exists():
                if digest_file(target) != row["sha256"]:
                    raise ValueError("Preserve changed local payload: " + rel)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                fd, name = tempfile.mkstemp(prefix=".hydrate-", dir=target.parent)
                try:
                    h, length = hashlib.sha256(), 0
                    with os.fdopen(fd, "wb") as out:
                        stream = archive.open(row["member"]) if archive else source.open("rb")
                        with stream:
                            for block in iter(lambda: stream.read(1024 * 1024), b""):
                                h.update(block)
                                length += len(block)
                                out.write(block)
                        out.flush()
                        os.fsync(out.fileno())
                    if length != row["bytes"] or h.hexdigest() != row["sha256"]:
                        raise ValueError("Hydrated member bytes mismatch")
                    os.chmod(name, row["mode"])
                    os.link(name, target)
                    os.utime(target, ns=(int(dt.datetime.now().timestamp() * 1e9), int(row["mtime_ns"])))
                    size += length
                finally:
                    if os.path.exists(name):
                        os.unlink(name)
            restored.append(rel)
            db.execute("UPDATE requests SET status='fulfilled' WHERE path=? AND bundle_id=?", (rel, bundle["id"]))
            db.execute("UPDATE files SET cached_at=? WHERE path=?", (now(), rel))
        db.commit()
    finally:
        if archive:
            archive.close()
    return {"restored": len(restored), "bytes": size, "paths": restored}


def evict(root, db, p):
    live, held = active_native_locks(root, p.get("ignore_pid"))
    if live:
        return {"evicted": 0, "held_by_active_locks": live}
    limit = p.get("cache_bytes", policy(root)["cache_bytes"])
    if type(limit) is not int or limit < 0:
        raise ValueError("Invalid cache limit")
    rows = db.execute("SELECT f.*,b.verified_at FROM files f LEFT JOIN objects o ON f.sha256=o.sha256 LEFT JOIN bundles b ON o.bundle_id=b.id WHERE f.cached_at IS NOT NULL").fetchall()
    candidates, total = [], 0
    for row in rows:
        path = safe(root, row["path"])
        if not path.is_file():
            db.execute("UPDATE files SET cached_at=NULL WHERE path=?", (row["path"],))
            continue
        st = path.stat()
        total += st.st_size
        if row["verified_at"] and st.st_size == row["bytes"] and st.st_mtime_ns == int(row["mtime_ns"]) and not any(row["path"].startswith(x + "/") for x in held):
            candidates.append((st.st_atime_ns, row, path))
    removed, freed, skipped = 0, 0, 0
    for _, row, path in sorted(candidates, key=lambda t: t[0]):
        if total <= limit:
            break
        if digest_file(path) != row["sha256"]:
            skipped += 1
            continue
        st = path.stat()
        if st.st_size != row["bytes"] or st.st_mtime_ns != int(row["mtime_ns"]):
            skipped += 1
            continue
        if not p.get("dry_run", False):
            path.unlink()
            db.execute("UPDATE files SET cached_at=NULL WHERE path=?", (row["path"],))
        removed += 1
        freed += row["bytes"]
        total -= row["bytes"]
    db.commit()
    return {"dry_run": p.get("dry_run", False), "evicted": removed, "freed_bytes": freed,
            "remaining_payload_bytes": total, "cache_limit_bytes": limit, "changed_files_preserved": skipped}


def status(root, db, p=None):
    stats = dict(db.execute("SELECT COUNT(*) files,COALESCE(SUM(bytes),0) logical_bytes,COUNT(DISTINCT sha256) distinct_contents FROM files").fetchone())
    stats.update(dict(db.execute("SELECT COUNT(*) bundles,SUM(verified_at IS NOT NULL) verified_bundles,SUM(verified_at IS NULL) pending_bundles FROM bundles").fetchone()))
    stats.update(dict(db.execute("SELECT COUNT(*) verified_files,COALESCE(SUM(f.bytes),0) verified_logical_bytes FROM files f JOIN objects o ON f.sha256=o.sha256 JOIN bundles b ON o.bundle_id=b.id WHERE b.verified_at IS NOT NULL").fetchone()))
    stats.update(dict(db.execute("SELECT COUNT(*) unarchived_files,COALESCE(SUM(f.bytes),0) unarchived_bytes FROM files f LEFT JOIN objects o ON f.sha256=o.sha256 LEFT JOIN bundles b ON o.bundle_id=b.id WHERE b.verified_at IS NULL").fetchone()))
    if p and p.get("bundle_id"):
        bundle = db.execute("SELECT * FROM bundles WHERE id=?", (p["bundle_id"],)).fetchone()
        if not bundle:
            raise ValueError("Unknown payload bundle")
        stats["bundle"] = dict(bundle)
    return {"schema": SCHEMA, "root": str(root), "policy": policy(root), **stats,
            "pending_downloads": db.execute("SELECT COUNT(*) FROM requests WHERE status='pending'").fetchone()[0]}


class StoragePending(ValueError):
    def __init__(self, request):
        self.storage_request = request
        super().__init__(json.dumps({"state": "waiting_for_storage", "storage_request": request}, separators=(",", ":")))


def storage_root(path):
    path = Path(path).absolute()
    for parent in [path.parent, *path.parents]:
        marker = parent / CONTROL / "policy.json"
        if marker.exists():
            safe(parent, CONTROL + "/policy.json")
            settings = json.loads(marker.read_text())
            if settings.get("schema") != SCHEMA or settings.get("root") != str(parent):
                raise ValueError("Storage root changed")
            return parent if settings.get("enabled") else None
    return None


def cold_reference(path):
    root = storage_root(path)
    if root is None:
        return None
    relative = str(Path(path).absolute().relative_to(root))
    safe(root, relative)
    with sqlite3.connect(str(safe(root, CONTROL + "/catalog.sqlite")), timeout=30) as db:
        db.row_factory = sqlite3.Row
        row = db.execute("SELECT f.path,f.sha256,f.bytes,o.bundle_id,o.member,b.file_id,b.parent_id,b.sha256 package_sha256 FROM files f JOIN objects o ON f.sha256=o.sha256 JOIN bundles b ON o.bundle_id=b.id WHERE f.path=? AND b.verified_at IS NOT NULL", (relative,)).fetchone()
        return dict(row) if row else None


def ensure_local(path, tree=False):
    """Prevent Python readers/enumerators from treating cold bytes as absent data."""
    path = Path(path).absolute()
    root = storage_root(path)
    if root is None:
        return path
    relative = str(path.relative_to(root))
    safe(root, relative)
    if path.is_file() and not tree:
        return path
    db = connect(root)
    try:
        query = "SELECT f.*,o.bundle_id,b.file_id,b.verified_at FROM files f LEFT JOIN objects o ON f.sha256=o.sha256 LEFT JOIN bundles b ON o.bundle_id=b.id WHERE "
        if tree:
            rows = db.execute(query + "(f.path=? OR substr(f.path,1,?)=?)", (relative, len(relative) + 1, relative + "/")).fetchall()
        else:
            rows = db.execute(query + "f.path=?", (relative,)).fetchall()
        missing = [r for r in rows if not safe(root, r["path"]).exists()]
        unverified = [r for r in missing if not r["verified_at"]]
        if unverified:
            raise ValueError("Indexed payload is missing without a verified Drive copy: " + unverified[0]["path"])
        if missing:
            for r in missing:
                identity = hashlib.sha256((r["path"] + ":" + r["sha256"]).encode()).hexdigest()
                db.execute("INSERT OR REPLACE INTO requests VALUES(?,?,?,?,?,?)", (identity, r["path"], r["sha256"], r["bundle_id"], now(), "pending"))
            db.commit()
            raise StoragePending({"root": str(root), "path": relative, "request_count": len(missing),
                "requests": [{"path": r["path"], "sha256": r["sha256"], "bundle_id": r["bundle_id"], "file_id": r["file_id"]} for r in missing[:20]]})
        return path
    finally:
        db.close()


def export_catalog(root, db):
    directory = safe(root, CONTROL + "/catalogs")
    directory.mkdir(exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".catalog-", dir=directory)
    os.close(fd)
    try:
        with open(temporary, "wb") as output:
            with gzip.GzipFile(fileobj=output, mode="wb", filename="", mtime=0, compresslevel=3) as stream:
                header = {"type": "header", "schema": "research-cold-storage-catalog/v1", "policy": policy(root)}
                stream.write((json.dumps(header, separators=(",", ":")) + "\n").encode())
                for table in ["bundles", "objects", "files"]:
                    for row in db.execute("SELECT * FROM " + table + " ORDER BY " + ("path" if table == "files" else "sha256" if table == "objects" else "id")):
                        value = dict(row)
                        if table == "files":
                            value["cached_at"] = None
                        if table == "bundles":
                            value["local_path"] = None
                        stream.write((json.dumps({"type": table, "value": value}, separators=(",", ":")) + "\n").encode())
        digest = digest_file(Path(temporary))
        destination = directory / ("cold-catalog-" + digest + ".jsonl.gz")
        if destination.exists():
            if digest_file(destination) != digest:
                raise ValueError("Existing catalog snapshot changed")
            Path(temporary).unlink()
        else:
            os.replace(temporary, destination)
        return {"path": str(destination.relative_to(root)), "sha256": digest,
                "bytes": destination.stat().st_size, "schema": "research-cold-storage-catalog/v1"}
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def import_catalog(root, db, p):
    if db.execute("SELECT COUNT(*) FROM files").fetchone()[0] or db.execute("SELECT COUNT(*) FROM bundles").fetchone()[0]:
        raise ValueError("Restore catalog only into an empty private store")
    source = safe(root, p["catalog_path"])
    if not HASH.fullmatch(p.get("expected_sha256", "")) or digest_file(source) != p["expected_sha256"]:
        raise ValueError("Downloaded catalog SHA mismatch")
    header = None
    counts = {"bundles": 0, "objects": 0, "files": 0}
    with gzip.open(source, "rt", encoding="utf-8") as stream:
        for line in stream:
            record = json.loads(line)
            if header is None:
                if record.get("type") != "header" or record.get("schema") != "research-cold-storage-catalog/v1":
                    raise ValueError("Unsupported catalog format")
                header = record
                continue
            table, row = record.get("type"), record.get("value")
            if table not in counts or not isinstance(row, dict):
                raise ValueError("Invalid catalog record")
            if table == "files":
                safe(root, row["path"])
                if not HASH.fullmatch(row["sha256"]):
                    raise ValueError("Invalid catalog file digest")
                row["cached_at"] = None
            columns = [r[1] for r in db.execute("PRAGMA table_info(" + table + ")")]
            if set(row) != set(columns):
                raise ValueError("Catalog column contract changed")
            db.execute("INSERT INTO " + table + " VALUES(" + ",".join("?" for _ in columns) + ")", [row[c] for c in columns])
            counts[table] += 1
    if header is None:
        raise ValueError("Catalog is empty")
    db.commit()
    initialize(root, {"cache_bytes": header["policy"]["cache_bytes"],
        "minimum_payload_bytes": header["policy"]["minimum_payload_bytes"], "enabled": True})
    return {"restored_catalog": counts, "root": str(root)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["recover-mutation-lock", "status", "prepare", "verify", "hydrate", "evict", "pending", "enable", "export", "import"])
    parser.add_argument("--root", required=True)
    args = parser.parse_args()
    requested_root = Path(os.path.abspath(args.root))
    root = requested_root.resolve(strict=True)
    p = json.load(__import__("sys").stdin)
    if args.action == "recover-mutation-lock":
        if requested_root != root:
            raise ValueError("Symlink in storage recovery root")
        print(json.dumps(recover_mutation_lock(root, p), ensure_ascii=False))
        return
    db = connect(root)
    try:
        if args.action in {"status", "pending"}:
            result = status(root, db, p) if args.action == "status" else pending(db)
        else:
            with exclusive(root):
                if args.action == "prepare":
                    result = inventory(root, db, p)
                    result["reused_legacy_bundles"] = import_legacy(root, db)
                    result.update(pack(root, db, p))
                    result.update(status(root, db))
                elif args.action == "verify":
                    result = verify(root, db, p)
                elif args.action == "hydrate":
                    result = hydrate(root, db, p)
                elif args.action == "enable":
                    if not db.execute("SELECT COUNT(*) FROM bundles WHERE verified_at IS NOT NULL").fetchone()[0]:
                        raise ValueError("Verify remote bundles before enabling read-through")
                    result = initialize(root, {**p, "enabled": True})
                elif args.action == "export":
                    result = export_catalog(root, db)
                elif args.action == "import":
                    result = import_catalog(root, db, p)
                else:
                    if not policy(root)["enabled"]:
                        raise ValueError("Enable verified read-through before evicting")
                    result = evict(root, db, p)
        print(json.dumps(result, ensure_ascii=False))
    finally:
        db.close()


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, sqlite3.Error, zipfile.BadZipFile) as error:
        print(json.dumps({"error": str(error)}), file=__import__("sys").stderr)
        raise SystemExit(1)
