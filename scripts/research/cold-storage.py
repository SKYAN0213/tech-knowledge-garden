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
EXCLUSION_BYTES = (Path(__file__).resolve().parents[2] / "data/research-storage-exclusions.json").read_bytes()
EXCLUSION_POLICY = json.loads(EXCLUSION_BYTES)
EXCLUDED = set(EXCLUSION_POLICY["directories"])
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



# Direct CLI only. Neither collection.storage nor the planner offers this action.
def repair_missing_fixture_records(root, p):
    import subprocess
    if p.get("expected_root") != str(root):
        raise ValueError("Exact repair root required")
    settings = policy(root)
    if settings.get("schema") != SCHEMA or settings.get("root") != str(root):
        raise ValueError("Repair storage policy root changed")
    if any(not isinstance(p.get(k), str) or not p[k].strip() for k in ("operator", "reason")):
        raise ValueError("Repair requires explicit operator and reason")
    operation = p.get("operation_id", "")
    if not re.fullmatch(r"[a-f0-9]{32}", operation):
        raise ValueError("Exact fresh repair operation ID required")
    def encoded(value):
        return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()
    def digest(value):
        return hashlib.sha256(encoded(value)).hexdigest()
    manifest_ref = p.get("manifest", {})
    manifest_path = safe(root, manifest_ref.get("path"))
    if not isinstance(manifest_ref.get("sha256"), str) or not HASH.fullmatch(manifest_ref["sha256"]):
        raise ValueError("Pinned repair manifest SHA required")
    def regular_bytes(file):
        fd = os.open(str(file), os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, "rb") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                raise ValueError("Repair evidence must be a regular unaliased file")
            return stream.read()
    manifest_bytes = regular_bytes(manifest_path)
    if hashlib.sha256(manifest_bytes).hexdigest() != manifest_ref["sha256"]:
        raise ValueError("Repair manifest changed")
    manifest = json.loads(manifest_bytes)
    rows = manifest.get("rows")
    keys = {"path", "sha256", "bytes", "mode", "mtime_ns", "scope", "cached_at"}
    if (manifest.get("schema") != "research-missing-fixture-repair/v1" or
        manifest.get("root") != str(root) or not isinstance(rows, list) or not rows or
        len(rows) > 1000 or manifest.get("expected_count") != len(rows) or
        any(not isinstance(r, dict) or set(r) != keys for r in rows) or
        rows != sorted(rows, key=lambda r: r["path"]) or
        len({r["path"] for r in rows}) != len(rows) or
        manifest.get("rowset_sha256") != digest(rows)):
        raise ValueError("Exact sorted complete repair rowset required")
    pattern = re.compile(r"^research/(mcp-module-test-[A-Za-z0-9]{6})/module-jobs/(module-mcp-(?:inventory|compact-inventory|check-[a-f0-9-]{36}))/result\.json$")
    scopes = set()
    for row in rows:
        matched = pattern.fullmatch(row["path"])
        if not matched or not HASH.fullmatch(row["sha256"]) or type(row["bytes"]) is not int or row["bytes"] < 0:
            raise ValueError("Repair is limited to exact deleted MCP fixture result metadata")
        scopes.add("research/" + matched[1])
    def fsync_directory(directory):
        fd = os.open(str(directory), os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    owners = manifest.get("owners")
    if not isinstance(owners, list) or {o.get("scope") for o in owners} != scopes or len(owners) != len(scopes):
        raise ValueError("Every exact fixture scope requires pinned native owner evidence")
    owner_checks = []
    for owner in owners:
        scope_path = safe(root, owner["scope"])
        if owner.get("identity") == "owner_identity_unavailable":
            if scope_path.exists():
                raise ValueError("Unavailable historical owner only allowed for absent fixture scope")
            owner_checks.append({"scope": owner["scope"], "identity": "owner_identity_unavailable"})
            continue
        pid = owner.get("pid")
        if type(pid) is not int or pid <= 0:
            raise ValueError("Exact retained fixture owner PID required")
        proof = owner.get("state", {})
        raw = regular_bytes(safe(root, proof.get("path")))
        state = json.loads(raw)
        job_ids = {pattern.fullmatch(r["path"])[2] for r in rows if r["path"].startswith(owner["scope"] + "/")}
        job = state.get("job_id")
        if (hashlib.sha256(raw).hexdigest() != proof.get("sha256") or state.get("schema") != "research-module-job/v1" or
            state.get("pid") != pid or job not in job_ids or
            proof["path"] != owner["scope"] + "/module-jobs/" + job + "/state.json" or
            not any(r["sha256"] == state.get("result", {}).get("sha256") and r["path"] == owner["scope"] + "/module-jobs/" + job + "/result.json" for r in rows)):
            raise ValueError("Retained fixture owner evidence does not bind native job/PID/result")
        check = {"scope": owner["scope"], "identity": "retained_native_owner", "pid": pid, "state": proof}
        input_ref = owner.get("input")
        if input_ref:
            input_raw = regular_bytes(safe(root, input_ref["path"]))
            native_input = json.loads(input_raw)
            if (hashlib.sha256(input_raw).hexdigest() != input_ref["sha256"] or
                native_input.get("schema") != "research-module-job-input/v1" or
                native_input.get("job_id") != job or
                native_input.get("context", {}).get("root") != str(scope_path) or
                state.get("input_sha256") != hashlib.sha256(json.dumps(native_input, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()):
                raise ValueError("Retained fixture input binding changed")
            check["input"] = input_ref
        owner_checks.append(check)
    process_evidence = []
    def writers_absent():
        live, _ = active_native_locks(root)
        if live:
            raise ValueError("Native writer locks present; repair refused")
        scan = subprocess.run(["ps", "-axww", "-o", "pid=,stat=,command="], capture_output=True, text=True, timeout=10, check=True)
        lines = [line for line in scan.stdout.splitlines() if line.strip()]
        if scan.stderr.strip() or not lines or any(not re.match(r"^\s*[0-9]+\s+[A-Za-z+<>=NsLlXsWwZzIitpRrDUuHVv-]+\s+\S", line) for line in lines):
            raise ValueError("Process visibility unknown")
        related_native = []
        for line in lines:
            pid, process_state, command = line.strip().split(None, 2)
            if int(pid) == os.getpid():
                continue
            if re.search(r"(?:<unknown>|<access denied>|^\?+$|\[permission denied\])", command, re.IGNORECASE):
                raise ValueError("Incomplete process argv visibility")
            if any(str(root / scope) in command for scope in scopes):
                raise ValueError("Fixture scope writer still visible")
            if re.search(r"(?:integrations/research-mcp/(?:test|operator)|(?:server|operator)\.test\.mjs|(?:^|/)node(?:\s+[^\n]*)?\s--test(?:\s|$)|(?:^|/)npm\s+(?:run\s+)?test(?:[:\s]|$))", command):
                raise ValueError("MCP fixture test parent/operator is active")
            if re.search(r"research-mcp|research/module-worker|research-module", command):
                related_native.append({"pid": int(pid), "state": process_state,
                                       "argv_sha256": hashlib.sha256(command.encode()).hexdigest()})
        process_evidence.append({"argv": ["ps", "-axww", "-o", "pid=,stat=,command="],
                                 "stdout_sha256": hashlib.sha256(scan.stdout.encode()).hexdigest(),
                                 "row_count": len(lines), "status": scan.returncode,
                                 "stderr_bytes": len(scan.stderr.encode()), "related_native": related_native,
                                 "checked_at": now(), "matching_scope_writers": 0, "matching_test_parents": 0})
        for owner in owner_checks:
            if owner["identity"] == "owner_identity_unavailable":
                if safe(root, owner["scope"]).exists():
                    raise ValueError("Deleted fixture scope was recreated")
                continue
            try:
                os.kill(owner["pid"], 0)
            except ProcessLookupError:
                continue
            except OSError as error:
                raise ValueError("Fixture owner visibility unknown") from error
            raise ValueError("Fixture owner still alive or PID reused")
    return _repair_missing_rows_transaction(
        root, p, settings=settings, manifest_ref=manifest_ref, manifest_bytes=manifest_bytes,
        rows=rows, owner_checks=owner_checks, process_evidence=process_evidence,
        writers_absent=writers_absent)


def _repair_encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def _repair_digest(value):
    return hashlib.sha256(_repair_encoded(value)).hexdigest()


def _repair_regular_bytes(file):
    fd = os.open(str(file), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise ValueError("Repair evidence must be a regular unaliased file")
        return stream.read()


def _repair_fsync_directory(directory):
    fd = os.open(str(directory), os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _repair_catalog_fingerprints(db, rows, marker_key):
    # Streaming logical hashes, not a whole-database backup. Include meta and
    # extension tables so a trigger cannot change unrelated values unnoticed.
    targets = {r["path"] for r in rows}
    result = {"__schema__": {"sha256": _repair_digest([dict(r) for r in db.execute("SELECT type,name,sql FROM sqlite_master ORDER BY type,name")])}}
    for entry in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
        table = entry[0]
        quoted = '"' + table.replace('"', '""') + '"'
        columns = [r[1] for r in db.execute("PRAGMA table_info(" + quoted + ")")]
        order = ",".join('"' + c.replace('"', '""') + '"' for c in columns)
        h, count = hashlib.sha256(), 0
        for row in db.execute("SELECT * FROM " + quoted + " ORDER BY " + order):
            value = dict(row)
            if (table == "files" and value.get("path") in targets) or (table == "meta" and value.get("key") == marker_key):
                continue
            # Persistent SQLite internals (including sqlite_sequence/stat*)
            # are preservation data too. Encode BLOB values without loss.
            value = {k: ({"sqlite_blob_sha256": hashlib.sha256(bytes(v)).hexdigest(), "bytes": len(v)}
                         if isinstance(v, (bytes, bytearray, memoryview)) else v) for k, v in value.items()}
            h.update(_repair_encoded(value))
            count += 1
        result[table] = {"rows": count, "sha256": h.hexdigest()}
    return result


def _repair_missing_rows_transaction(root, p, *, settings, manifest_ref, manifest_bytes,
                                     rows, owner_checks, process_evidence, writers_absent,
                                     native_contract=None):
    # Shared durable engine only; caller-specific target/owner admission stays
    # in each separate direct-CLI validator.
    encoded, digest = _repair_encoded, _repair_digest
    regular_bytes, fsync_directory = _repair_regular_bytes, _repair_fsync_directory
    manifest_path = safe(root, manifest_ref["path"])
    db_path = safe(root, CONTROL + "/catalog.sqlite")
    info = db_path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError("Repair catalog must be a regular unaliased existing file")
    for suffix in ("-wal", "-shm"):
        sidecar = safe(root, CONTROL + "/catalog.sqlite" + suffix)
        if sidecar.exists():
            side_info = sidecar.lstat()
            if not stat.S_ISREG(side_info.st_mode) or side_info.st_nlink != 1:
                raise ValueError("Repair catalog sidecar is aliased")
    # Caller holds the existing mutation.lock before opening this existing DB.
    db = sqlite3.connect(db_path.as_uri() + "?mode=rw", uri=True, timeout=0)
    db.row_factory = sqlite3.Row
    if native_contract:
        db.execute("PRAGMA synchronous=FULL")
    operation = p["operation_id"]
    key = ("missing-native-fixture-repair:" if native_contract else "missing-fixture-repair:") + operation
    relative = CONTROL + ("/native-fixture-metadata-repairs/" if native_contract else "/fixture-metadata-repairs/") + operation
    directory = safe(root, relative)
    try:
        marker = db.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        if p.get("readback_only") is True:
            if not marker:
                raise ValueError("No committed repair marker")
            before_raw = regular_bytes(safe(root, relative + "/before.json"))
            if native_contract:
                intent = regular_bytes(directory / "commit-intent.json")
                if marker[0] != intent.decode("utf-8"):
                    raise ValueError("Native repair commit marker differs from its durable intent")
            value = json.loads(marker[0])
            if value["manifest_sha256"] != manifest_ref["sha256"] or value["before_sha256"] != hashlib.sha256(before_raw).hexdigest():
                raise ValueError("Repair commit evidence changed")
            if any(db.execute("SELECT 1 FROM files WHERE path=?", (r["path"],)).fetchone() for r in rows):
                raise ValueError("Committed repair paths were recreated; inspect explicitly")
            if native_contract:
                native_contract["evidence_check"]()
                writers_absent()
                native_contract["catalog_check"](db, committed=True)
                expected_native = json.loads(before_raw)["native_fixture_evidence"]["operational_reference_audit"]
                if native_contract["native_reference_audit"] != expected_native:
                    raise ValueError("Operational native reference census changed since commit")
                expected_locks = json.loads(before_raw)["native_fixture_evidence"]["inactive_native_lock_audit"]
                if native_contract["inactive_native_lock_audit"] != expected_locks:
                    raise ValueError("Preserved Native locks changed since commit")
                if _repair_catalog_fingerprints(db, rows, key) != value["unrelated_catalog"]:
                    raise ValueError("Unrelated catalog changed since native fixture commit")
            readback = {"status": "committed_readback", "commit_marker": value, "receipt_directory": relative, "checked_at": now()}
            immutable_bytes(directory / ("readback-" + uuid.uuid4().hex + ".json"), encoded(readback))
            fsync_directory(directory)
            return readback
        if marker or directory.exists():
            raise ValueError("Prior repair attempt exists; preserve it and use explicit readback")
        def validate():
            current_policy = json.loads(regular_bytes(safe(root, CONTROL + "/policy.json"))) if native_contract else policy(root)
            if digest_file(manifest_path) != manifest_ref["sha256"] or current_policy != settings:
                raise ValueError("Repair manifest or policy changed")
            current = db_path.lstat()
            if (current.st_dev, current.st_ino, current.st_nlink) != (info.st_dev, info.st_ino, 1):
                raise ValueError("Repair catalog identity changed")
            writers_absent()
            if native_contract:
                native_contract["evidence_check"]()
                native_contract["catalog_check"](db)
            for owner in owner_checks:
                for proof in [owner[k] for k in ("state", "input") if k in owner]:
                    if hashlib.sha256(regular_bytes(safe(root, proof["path"]))).hexdigest() != proof["sha256"]:
                        raise ValueError("Fixture owner proof changed")
            for row in rows:
                target = safe(root, row["path"])
                if target.exists():
                    raise ValueError("Repair payload exists; preserve it")
                actual = db.execute("SELECT path,sha256,bytes,mode,mtime_ns,scope,cached_at FROM files WHERE path=?", (row["path"],)).fetchone()
                if not actual or dict(actual) != row:
                    raise ValueError("Repair catalog row changed")
                if db.execute("SELECT 1 FROM objects WHERE sha256=?", (row["sha256"],)).fetchone() or db.execute("SELECT 1 FROM requests WHERE path=? OR sha256=?", (row["path"], row["sha256"])).fetchone():
                    raise ValueError("Archived or requested payload cannot be repaired")
        db.execute("BEGIN IMMEDIATE")
        validate()
        directory.mkdir(parents=True, mode=0o700)
        counts_before = {table: db.execute("SELECT COUNT(*) FROM " + table).fetchone()[0] for table in ("files", "objects", "bundles", "requests")}
        unrelated = _repair_catalog_fingerprints(db, rows, key) if native_contract else None
        before = {"counts": counts_before, "schema": "research-fixture-metadata-repair-before/v1", "operation_id": operation,
                  "root": str(root), "operator": p["operator"], "reason": p["reason"], "manifest": manifest_ref,
                  "rows": rows, "rowset_sha256": digest(rows), "policy": settings,
                  "schema_sql": [dict(r) for r in db.execute("SELECT type,name,sql FROM sqlite_master ORDER BY type,name")],
                  "owners": owner_checks, "owner_probe": "ESRCH for retained owners only; historical identity unavailable for absent scopes", "process_evidence": process_evidence.copy(), "checked_at": now()}
        if native_contract:
            before["schema"] = "research-native-fixture-metadata-repair-before/v1"
            before["native_fixture_evidence"] = native_contract["evidence"]
            before["owner_probe"] = "Historical PID not retained; no ESRCH/termination claim. Exact absent scopes, terminal check records and fresh process visibility only."
            before["unrelated_catalog"] = unrelated
        before_bytes = encoded(before)
        immutable_bytes(directory / "input.json", encoded(p))
        immutable_bytes(directory / "manifest.json", manifest_bytes)
        immutable_bytes(directory / "before.json", before_bytes)
        if native_contract:
            for name, data in native_contract["snapshots"].items():
                immutable_bytes(directory / name, data)
        for durable in (directory, directory.parent, safe(root, CONTROL)):
            fsync_directory(durable)
        validate()
        immutable_bytes(directory / "precommit-process-evidence.json", encoded(process_evidence))
        fsync_directory(directory)
        deleted = 0
        for row in rows:
            deleted += db.execute("DELETE FROM files WHERE path IS ? AND sha256 IS ? AND bytes IS ? AND mode IS ? AND mtime_ns IS ? AND scope IS ? AND cached_at IS ?", tuple(row[k] for k in ("path", "sha256", "bytes", "mode", "mtime_ns", "scope", "cached_at"))).rowcount
        if deleted != len(rows):
            raise ValueError("Repair rowcount changed; rollback required")
        counts_after = {table: db.execute("SELECT COUNT(*) FROM " + table).fetchone()[0] for table in counts_before}
        if any(counts_after[t] != counts_before[t] - (deleted if t == "files" else 0) for t in counts_before):
            raise ValueError("Repair changed unrelated catalog counts")
        value = {"counts_before": counts_before, "counts_after": counts_after, "schema": "research-fixture-metadata-repair-commit/v1", "operation_id": operation,
                 "manifest_sha256": manifest_ref["sha256"], "rowset_sha256": digest(rows),
                 "before_sha256": hashlib.sha256(before_bytes).hexdigest(), "deleted": deleted, "committed_at": now()}
        if native_contract:
            after_unrelated = _repair_catalog_fingerprints(db, rows, key)
            if after_unrelated != unrelated:
                raise ValueError("Repair changed unrelated catalog values; rollback required")
            value["schema"] = "research-native-fixture-metadata-repair-commit/v1"
            value["unrelated_catalog"] = after_unrelated
            value["review"] = p["review"]
        marker_payload = encoded(value)
        if native_contract:
            # Prepared intent is not proof of commit; the exact DB value must
            # survive triggers and round-trip after commit before a receipt.
            immutable_bytes(directory / "commit-intent.json", marker_payload)
            fsync_directory(directory)
        db.execute("INSERT INTO meta(key,value) VALUES(?,?)", (key, marker_payload.decode()))
        if native_contract:
            own_marker = db.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
            if not own_marker or own_marker[0] != marker_payload.decode():
                raise ValueError("Native repair commit marker was deleted or changed; rollback required")
        if native_contract and _repair_catalog_fingerprints(db, rows, key) != unrelated:
            raise ValueError("Commit marker trigger changed unrelated catalog values; rollback required")
        db.commit()
        if native_contract:
            own_marker = db.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
            if not own_marker or own_marker[0] != marker_payload.decode():
                raise ValueError("Native repair committed marker round-trip failed; inspect durable intent")
        remaining = [r["path"] for r in rows if db.execute("SELECT 1 FROM files WHERE path=?", (r["path"],)).fetchone()]
        if remaining:
            raise ValueError("Repair readback changed after commit; inspect marker")
        receipt = {"status": "repaired", "commit_marker": value, "before": relative + "/before.json",
                   "remaining_target_rows": 0, "receipt_at": now()}
        immutable_bytes(directory / "receipt.json", encoded(receipt))
        fsync_directory(directory)
        return {**receipt, "receipt_path": relative + "/receipt.json"}
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()



# One historical D2 native fixture cohort, not a general metadata deletion API.
NATIVE_FIXTURE_PREFIX = "research/parallel-semantic-20261023-v1/results/D2/iterations/iteration6-private-completed-receipt-reuse-20261023-v1/tmp"
NATIVE_FIXTURE_CHECKS = NATIVE_FIXTURE_PREFIX.rsplit("/", 1)[0] + "/checks.json"
NATIVE_FIXTURE_SOURCE_ROOT = "/Volumes/X5Storage/Projects/Personal/Apps/tech-knowledge-garden/.local"
NATIVE_FIXTURE_ROWSET_SHA = "9f6a5a3bb1b464f5c4154d9b2cb04212e9ef351e366a231047703a1aa552f6e1"
NATIVE_FIXTURE_AUDIT_SHA = "e73bb0622622acac4c683d72217e52940bde802ad8bf294852456d57ddef5830"
NATIVE_FIXTURE_CHECKS_SHA = "113ce50fb79dc44b69286edf3bc370ebba4b793d8ff4cafa7c6d6775c794a8cf"
NATIVE_FIXTURE_RECOVERY_SHA = "4db20767131cf4b136e55030294608474fa9f0e65c1291651b967c9f10e40c48"
NATIVE_FIXTURE_REFERENCE_SCOPE = "native-controls-with-derived-preview-separation/v1"
NATIVE_FIXTURE_REFERENCE_FORMATS_SHA = "63295e766520c5a381be6405ea2df7c5fc21d04370911fb0fd7fd7ecfd593b80"
NATIVE_FIXTURE_REFERENCE_HARDLINKS_SHA = "b3fc8f6c77e47612cc07470708d782ac7a8fb7ad3e1053f6d166ed71bfdb69c6"
NATIVE_FIXTURE_REFERENCE_FORMAT_RULES = {
    "empty_bytes": "Exactly zero bytes; no JSON value exists.",
    "json_value_stream": "Consume all standard JSON values and inter-value JSON whitespace; inspect every key and value. No unknown trailing bytes.",
    "json_with_literal_trailing_newline": "Exactly one complete standard JSON value followed by the two literal bytes 5c6e; inspect the complete JSON value. No general suffix tolerance.",
}


def _native_fixture_reference_values(raw, format_name="single_json"):
    # Reference inspection only, never a Native authority/approval JSON reader.
    # Keep every object pair, including overwritten duplicate keys/values.
    def reject_constant(value):
        raise ValueError("Nonstandard JSON constant in Native reference control: " + value)
    decoder = json.JSONDecoder(
        parse_constant=reject_constant,
        object_pairs_hook=lambda pairs: [value for pair in pairs for value in pair])
    if format_name == "empty_bytes":
        if raw != b"":
            raise ValueError("Pinned empty Native reference control is not exactly zero bytes")
        return []
    if format_name == "json_with_literal_trailing_newline":
        if not raw.endswith(b"\\n"):
            raise ValueError("Pinned Native reference control lacks its exact literal 5c6e tail")
        raw = raw[:-2]
    text = raw.decode("utf-8")
    if format_name in ("single_json", "json_with_literal_trailing_newline"):
        return [decoder.decode(text)]
    if format_name != "json_value_stream":
        raise ValueError("Unknown historical Native reference format")
    values, offset = [], 0
    while offset < len(text):
        while offset < len(text) and text[offset] in " \t\r\n":
            offset += 1
        if offset == len(text):
            break
        value, offset = decoder.raw_decode(text, offset)
        values.append(value)
    if not values:
        raise ValueError("Pinned Native JSON value stream has no JSON value")
    return values


def _derived_preview_reference_path(relative):
    # preview.mjs creates only this derived code/vault renderer workspace;
    # RunState and preview-manifest.json remain outside it and are controls.
    return bool(re.fullmatch(r"(?:research/local-ai|local-ai)/runs/[^/]+/preview-workspace(?:/.*)?", relative))


def _native_fixture_reference_hardlink_bytes(file, entry):
    # Only the control census calls this after exact evidence/Q0/group admission.
    # All evidence, policy, DB, lock and derived proofs retain nlink=1 readers.
    expected = {k: entry[k] for k in ("device", "inode", "nlink", "bytes", "mtime_ns", "ctime_ns", "mode")}
    def check(info):
        actual = {"device": str(info.st_dev), "inode": str(info.st_ino), "nlink": info.st_nlink,
                  "bytes": info.st_size, "mtime_ns": str(info.st_mtime_ns),
                  "ctime_ns": str(info.st_ctime_ns), "mode": stat.S_IMODE(info.st_mode)}
        if not stat.S_ISREG(info.st_mode) or actual != expected:
            raise ValueError("Exact Native reference hardlink identity changed")
    check(file.lstat())
    fd = os.open(str(file), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        check(os.fstat(stream.fileno()))
        raw = stream.read()
        check(os.fstat(stream.fileno()))
        check(file.lstat())
    if len(raw) != entry["bytes"] or hashlib.sha256(raw).hexdigest() != entry["sha256"]:
        raise ValueError("Exact Native reference hardlink bytes/SHA changed")
    return raw


NATIVE_FIXTURE_REFERENCE_ROOTS = tuple(
    prefix + "/" + name for prefix in ("research/local-ai", "local-ai")
    for name in ("reasoning-tasks", "runs", "event-workflows", "module-jobs"))


def repair_missing_native_fixture_records(root, p):
    """Direct CLI only: exact299 historical synthetic metadata, never real payload."""
    import subprocess
    if set(p) - {"expected_root", "operator", "reason", "operation_id", "manifest", "review", "readback_only"}:
        raise ValueError("Unknown native fixture repair parameter")
    if p.get("expected_root") != str(root) or root.resolve(strict=True) != root:
        raise ValueError("Exact unaliased native fixture repair root required")
    if "readback_only" in p and type(p["readback_only"]) is not bool:
        raise ValueError("Explicit boolean readback_only required")
    if any(not isinstance(p.get(k), str) or not p[k].strip() for k in ("operator", "reason")):
        raise ValueError("Explicit native fixture operator/reason required")
    if not re.fullmatch(r"[a-f0-9]{32}", p.get("operation_id", "")):
        raise ValueError("Fresh exact native fixture operation ID required")

    snapshots, evidence_refs = {}, []
    def pinned(ref, snapshot):
        if not isinstance(ref, dict) or set(ref) != {"path", "sha256"} or not isinstance(ref["sha256"], str) or not HASH.fullmatch(ref["sha256"]):
            raise ValueError("Exact native fixture evidence ref required")
        raw = _repair_regular_bytes(safe(root, ref["path"]))
        if hashlib.sha256(raw).hexdigest() != ref["sha256"]:
            raise ValueError("Native fixture evidence SHA changed")
        snapshots[snapshot] = raw
        evidence_refs.append(dict(ref))
        return json.loads(raw)

    manifest_ref = p.get("manifest")
    manifest = pinned(manifest_ref, "native-manifest.json")
    policy_path = safe(root, CONTROL + "/policy.json")
    policy_raw = _repair_regular_bytes(policy_path)
    settings = json.loads(policy_raw)
    if (settings.get("schema") != SCHEMA or settings.get("root") != str(root) or
        manifest.get("schema") != "research-missing-native-fixture-repair/v1" or
        manifest.get("root") != str(root) or manifest.get("operation_id") != p["operation_id"] or
        manifest.get("policy_sha256") != hashlib.sha256(policy_raw).hexdigest() or
        manifest.get("reference_scope") != NATIVE_FIXTURE_REFERENCE_SCOPE):
        raise ValueError("Exact native fixture root/policy binding required")
    rows = manifest.get("rows")
    keys = {"path", "sha256", "bytes", "mode", "mtime_ns", "scope", "cached_at"}
    if (not isinstance(rows, list) or len(rows) != 299 or manifest.get("expected_count") != 299 or
        manifest.get("unique_content_count") != 99 or
        any(not isinstance(r, dict) or set(r) != keys for r in rows) or
        rows != sorted(rows, key=lambda r: r["path"]) or len({r["path"] for r in rows}) != 299 or
        len({r["sha256"] for r in rows}) != 99 or
        manifest.get("rowset_sha256") != NATIVE_FIXTURE_ROWSET_SHA or
        _repair_digest(rows) != NATIVE_FIXTURE_ROWSET_SHA):
        raise ValueError("Only the exact frozen299/99 native fixture rowset is admitted")
    scopes = set()
    pattern = re.compile("^" + re.escape(NATIVE_FIXTURE_PREFIX) + r"/(knowledge-integration-[A-Za-z0-9]{6})/(?:documents|local-ai|reasoning-tasks|runs)/.+$")
    for row in rows:
        matched = pattern.fullmatch(row["path"])
        if not matched or not HASH.fullmatch(row["sha256"]) or type(row["bytes"]) is not int or row["bytes"] < 0:
            raise ValueError("Native fixture path boundary changed")
        safe(root, row["path"])
        scopes.add(NATIVE_FIXTURE_PREFIX + "/" + matched[1])
    if len(scopes) != 113:
        raise ValueError("Exact113 historical fixture scopes required")

    audit_ref = manifest.get("rowset_evidence")
    if not isinstance(audit_ref, dict) or audit_ref.get("sha256") != NATIVE_FIXTURE_AUDIT_SHA:
        raise ValueError("Frozen D2 rowset evidence required")
    audit = pinned(audit_ref, "d2-rowset-evidence.json")
    if (audit.get("schema") != "d2-missing-test-catalog-rowset/v1" or audit.get("audit_only") is not True or
        audit.get("root") != NATIVE_FIXTURE_SOURCE_ROOT or audit.get("rows") != rows):
        raise ValueError("D2 synthetic cohort evidence differs")
    recovery_ref = manifest.get("recovery_evidence")
    if not isinstance(recovery_ref, dict) or recovery_ref.get("sha256") != NATIVE_FIXTURE_RECOVERY_SHA:
        raise ValueError("Frozen exact-SHA recovery investigation required")
    recovery = pinned(recovery_ref, "d2-recovery-investigation.json")
    if (recovery.get("schema") != "d2-missing-fixture-recovery-result/v1" or
        recovery.get("status") != "read_only_diagnosis_complete_no_supported_repair" or
        recovery.get("expected_unique_contents") != 99 or recovery.get("affected_paths") != 299 or
        recovery.get("existing_raw_copies_found_in_checked_scope") != 0 or
        recovery.get("actual_recovery_or_catalog_mutation") is not False):
        raise ValueError("Exact bounded recovery investigation differs")
    checks_ref = manifest.get("checks")
    if checks_ref != {"path": NATIVE_FIXTURE_CHECKS, "sha256": NATIVE_FIXTURE_CHECKS_SHA}:
        raise ValueError("Exact original iteration6 check ref required")
    checks = pinned(checks_ref, "historical-checks.json")
    if (checks.get("schema") != "tkg-d2-check-evidence/v1" or
        checks.get("synthetic_fixture_submissions_only") is not True or checks.get("actual_model_calls") != 0 or
        checks.get("operational_writes") != 0 or checks.get("canonical_native_runs_revalidated_in_iteration6") != 0 or
        checks.get("tmpdir") != NATIVE_FIXTURE_SOURCE_ROOT + "/" + NATIVE_FIXTURE_PREFIX):
        raise ValueError("Historical synthetic-only scope is not established")
    terminal = checks.get("checks")
    if not isinstance(terminal, list) or not terminal or any(type(c.get("exit_code")) is not int for c in terminal):
        raise ValueError("Historical terminal check records required")
    terminal_evidence = []
    for i, check in enumerate(terminal):
        if "log" in check:
            name = check["log"]
            if not isinstance(name, str) or "/" in name or name in ("", ".", ".."):
                raise ValueError("Historical log path changed")
            ref = {"path": NATIVE_FIXTURE_CHECKS.rsplit("/", 1)[0] + "/" + name, "sha256": check["log_sha256"]}
            raw = _repair_regular_bytes(safe(root, ref["path"]))
            if hashlib.sha256(raw).hexdigest() != ref["sha256"]:
                raise ValueError("Historical terminal log changed")
            snapshots["historical-log-%d.bin" % i] = raw
            evidence_refs.append(ref)
            terminal_evidence.append({"name": check["name"], "exit_code": check["exit_code"], "log": ref})
    if manifest.get("historical_owner_identity") != "not_retained" or manifest.get("historical_owner_termination_proven") is not False:
        raise ValueError("Historical PID limitation must be explicit; termination is not established")
    formats_ref = manifest.get("historical_reference_formats")
    if not isinstance(formats_ref, dict) or formats_ref.get("sha256") != NATIVE_FIXTURE_REFERENCE_FORMATS_SHA:
        raise ValueError("Exact pinned historical Native reference-format evidence required")
    formats_evidence = pinned(formats_ref, "historical-reference-formats.json")
    format_files = formats_evidence.get("files")
    if (formats_evidence.get("schema") != "research-native-fixture-historical-reference-formats/v1" or
        formats_evidence.get("root") != NATIVE_FIXTURE_SOURCE_ROOT or
        formats_evidence.get("expected_count") != 57 or
        formats_evidence.get("rules") != NATIVE_FIXTURE_REFERENCE_FORMAT_RULES or
        not isinstance(format_files, list) or len(format_files) != 57 or
        any(not isinstance(x, dict) or set(x) != {"path", "sha256", "bytes", "format"} or
            not isinstance(x.get("path"), str) or not isinstance(x.get("sha256"), str) or
            not HASH.fullmatch(x["sha256"]) or type(x.get("bytes")) is not int or x["bytes"] < 0 or
            not isinstance(x.get("format"), str) or x["format"] not in NATIVE_FIXTURE_REFERENCE_FORMAT_RULES for x in format_files) or
        format_files != sorted(format_files, key=lambda x: x["path"]) or
        len({x["path"] for x in format_files}) != 57 or
        {name: sum(x["format"] == name for x in format_files) for name in NATIVE_FIXTURE_REFERENCE_FORMAT_RULES} !=
        {"empty_bytes": 42, "json_value_stream": 14, "json_with_literal_trailing_newline": 1}):
        raise ValueError("Exact sorted57 historical Native reference-format vector/rules required")
    if manifest.get("historical_reference_formats_files_sha256") != _repair_digest(format_files):
        raise ValueError("Pinned historical Native reference-format vector digest required")
    declared_formats = {x["path"]: (i, x) for i, x in enumerate(format_files)}
    for entry in format_files:
        safe(root, entry["path"])
        if (not entry["path"].endswith(".json") or _derived_preview_reference_path(entry["path"]) or
            not any(entry["path"].startswith(prefix + "/") for prefix in NATIVE_FIXTURE_REFERENCE_ROOTS)):
            raise ValueError("Historical reference-format file is outside genuine Native JSON controls")
    hardlinks_ref = manifest.get("reference_hardlinks")
    if not isinstance(hardlinks_ref, dict) or hardlinks_ref.get("sha256") != NATIVE_FIXTURE_REFERENCE_HARDLINKS_SHA:
        raise ValueError("Exact pinned Native reference hardlink-group evidence required")
    hardlinks_evidence = pinned(hardlinks_ref, "reference-hardlink-groups.json")
    hardlink_groups = hardlinks_evidence.get("groups")
    hardlink_keys = {"path", "sha256", "bytes", "device", "inode", "nlink", "mtime_ns", "ctime_ns", "mode"}
    if (hardlinks_evidence.get("schema") != "research-native-fixture-reference-hardlink-groups/v1" or
        hardlinks_evidence.get("root") != NATIVE_FIXTURE_SOURCE_ROOT or
        hardlinks_evidence.get("expected_group_count") != 3 or hardlinks_evidence.get("expected_path_count") != 6 or
        not isinstance(hardlink_groups, list) or len(hardlink_groups) != 3 or
        any(not isinstance(group, list) or len(group) != 2 or
            any(not isinstance(x, dict) or set(x) != hardlink_keys or not isinstance(x.get("path"), str) or
                not isinstance(x.get("sha256"), str) or not HASH.fullmatch(x["sha256"]) or
                type(x.get("bytes")) is not int or x["bytes"] < 0 or
                type(x.get("nlink")) is not int or x["nlink"] != len(group) or
                type(x.get("mode")) is not int or not 0 <= x["mode"] <= 0o7777 or
                any(not isinstance(x.get(k), str) or not re.fullmatch(r"[0-9]+", x[k])
                    for k in ("device", "inode", "mtime_ns", "ctime_ns")) for x in group)
            for group in hardlink_groups)):
        raise ValueError("Exact complete3/6 Native reference hardlink groups required")
    hardlink_rows = [entry for group in hardlink_groups for entry in group]
    if (hardlink_groups != sorted(hardlink_groups, key=lambda g: g[0]["path"]) or
        any(group != sorted(group, key=lambda x: x["path"]) or
            any({k: x[k] for k in hardlink_keys - {"path"}} !=
                {k: group[0][k] for k in hardlink_keys - {"path"}} for x in group) for group in hardlink_groups) or
        len({x["path"] for x in hardlink_rows}) != 6 or
        len({(g[0]["device"], g[0]["inode"]) for g in hardlink_groups}) != 3 or
        manifest.get("reference_hardlinks_groups_sha256") != _repair_digest(hardlink_groups)):
        raise ValueError("Pinned complete Native reference hardlink identities/vector required")
    declared_hardlinks = {x["path"]: (i, x) for i, x in enumerate(hardlink_rows)}
    for entry in hardlink_rows:
        safe(root, entry["path"])
        if (not entry["path"].endswith(".json") or entry["path"] in declared_formats or
            _derived_preview_reference_path(entry["path"]) or
            not any(entry["path"].startswith(prefix + "/") for prefix in NATIVE_FIXTURE_REFERENCE_ROOTS)):
            raise ValueError("Reference hardlink is outside the exact genuine control scope")
    derived = manifest.get("derived_preview_workspaces")
    if (not isinstance(derived, list) or
        any(not isinstance(x, dict) or set(x) != {"path", "state", "workspace_result"} or
            not isinstance(x.get("path"), str) for x in derived) or
        derived != sorted(derived, key=lambda x: x["path"]) or
        len({x["path"] for x in derived}) != len(derived)):
        raise ValueError("Exact approved derived-preview contract set required")
    approved_derived = {x["path"] for x in derived}
    for i, entry in enumerate(derived):
        matched = re.fullmatch(r"(research/local-ai|local-ai)/runs/([^/]+)/preview-workspace", entry["path"])
        if not matched:
            raise ValueError("Derived scope is outside the Native preview contract")
        safe(root, entry["path"])
        base, run = matched.groups()
        state_path = base + "/runs/" + run + "/preview/state.json"
        result_path = base + "/runs/" + run + "/preview/workspace.json"
        if entry.get("state", {}).get("path") != state_path or entry.get("workspace_result", {}).get("path") != result_path:
            raise ValueError("Derived preview evidence path changed")
        state = pinned(entry["state"], "derived-state-%04d.json" % i)
        result = pinned(entry["workspace_result"], "derived-workspace-%04d.json" % i)
        stage = state.get("stages", {}).get("workspace", {})
        native_result_hash = hashlib.sha256(json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
        if (state.get("schema") != "research-run/v1" or state.get("run_id") != run or
            stage.get("status") != "complete" or stage.get("result_path") != "runs/" + run + "/preview/workspace.json" or
            stage.get("result_hash") != native_result_hash):
            raise ValueError("Derived Native preview workspace contract/hash chain differs")
    preserved_locks = manifest.get("preserved_inactive_native_locks")
    if (not isinstance(preserved_locks, list) or
        any(not isinstance(x, dict) or set(x) != {"path", "sha256", "pid", "probe"} or
            not isinstance(x.get("path"), str) or not isinstance(x.get("sha256"), str) or
            not HASH.fullmatch(x["sha256"]) or type(x.get("pid")) is not int or x["pid"] <= 0 or
            x.get("probe") != "ESRCH" for x in preserved_locks) or
        preserved_locks != sorted(preserved_locks, key=lambda x: x["path"]) or
        len({x["path"] for x in preserved_locks}) != len(preserved_locks)):
        raise ValueError("Complete pinned inactive Native lock set required")
    for entry in preserved_locks:
        safe(root, entry["path"])
        if not re.fullmatch(r"(?:locks|[^/]+/locks|research/[^/]+/locks)/[^/]+\.json", entry["path"]):
            raise ValueError("Preserved Native lock path is outside the lock namespace")
    first_inactive_locks = []
    review = pinned(p.get("review"), "independent-review.json")
    if (review.get("schema") != "research-native-fixture-repair-review/v1" or
        review.get("reviewer") != "Q0" or review.get("decision") != "approve_exact299_native_fixture_metadata_repair" or
        review.get("root") != str(root) or review.get("manifest") != manifest_ref or
        review.get("operation_id") != p["operation_id"] or
        review.get("preserved_inactive_native_locks_sha256") != _repair_digest(preserved_locks) or
        review.get("reference_scope") != NATIVE_FIXTURE_REFERENCE_SCOPE or
        review.get("derived_preview_workspaces_sha256") != _repair_digest(derived) or
        review.get("historical_reference_formats_files_sha256") != _repair_digest(format_files) or
        review.get("reference_hardlinks_groups_sha256") != _repair_digest(hardlink_groups) or
        review.get("source_sha256") != digest_file(Path(__file__).resolve()) or
        review.get("historical_owner_identity") != "not_retained" or
        review.get("historical_owner_termination_proven") is not False or
        review.get("accept_absent_scopes_and_fresh_process_visibility") is not True or
        not isinstance(review.get("reason"), str) or not review["reason"].strip()):
        raise ValueError("Exact independent Q0 source/manifest review required")
    counts = manifest.get("expected_counts")
    if not isinstance(counts, dict) or set(counts) != {"files", "objects", "bundles", "requests"} or any(type(v) is not int or v < 0 for v in counts.values()):
        raise ValueError("Pinned catalog counts required")
    if not isinstance(manifest.get("schema_sha256"), str) or not HASH.fullmatch(manifest["schema_sha256"]):
        raise ValueError("Pinned catalog schema required")
    target_hashes = {r["sha256"] for r in rows}
    first_native_audit = []
    process_evidence = []

    def evidence_check():
        if _repair_regular_bytes(policy_path) != policy_raw:
            raise ValueError("Native fixture policy changed")
        for ref in evidence_refs:
            if hashlib.sha256(_repair_regular_bytes(safe(root, ref["path"]))).hexdigest() != ref["sha256"]:
                raise ValueError("Native fixture evidence changed during repair")
        if review["source_sha256"] != digest_file(Path(__file__).resolve()):
            raise ValueError("Reviewed native fixture implementation changed")

    def writers_absent():
        for scope in scopes:
            if safe(root, scope).exists():
                raise ValueError("Historical native fixture scope exists or was recreated")
        tmp = safe(root, NATIVE_FIXTURE_PREFIX)
        if tmp.exists() and (not tmp.is_dir() or any(tmp.iterdir())):
            raise ValueError("Historical native fixture tmp is not absent or empty")
        lock_dirs = {root / "locks", *root.glob("*/locks"), *root.glob("research/*/locks")}
        actual_paths = []
        for lock_dir in lock_dirs:
            safe(root, str(lock_dir.relative_to(root)))
            actual_paths.extend(str(f.relative_to(root)) for f in lock_dir.glob("*.json"))
        if sorted(actual_paths) != [x["path"] for x in preserved_locks]:
            raise ValueError("Native lock set is new, missing or outside the exact Q0-preserved set")
        observed_locks = []
        for i, entry in enumerate(preserved_locks):
            target = safe(root, entry["path"])
            before_stat = target.lstat()
            raw = _repair_regular_bytes(target)
            after_stat = target.lstat()
            identity = lambda st: {"dev": st.st_dev, "ino": st.st_ino, "size": st.st_size,
                                   "mtime_ns": str(st.st_mtime_ns), "nlink": st.st_nlink}
            if (identity(before_stat) != identity(after_stat) or
                hashlib.sha256(raw).hexdigest() != entry["sha256"] or
                type(json.loads(raw).get("pid")) is not int or json.loads(raw)["pid"] != entry["pid"]):
                raise ValueError("Q0-preserved Native lock bytes/PID/identity changed")
            try:
                os.kill(entry["pid"], 0)
            except ProcessLookupError:
                pass
            except OSError as error:
                raise ValueError("Preserved Native owner visibility unknown; preserving lock") from error
            else:
                raise ValueError("Preserved Native owner is alive or its PID was reused")
            observed_locks.append({**entry, "identity": identity(after_stat)})
            snapshots["preserved-native-lock-%03d.json" % i] = raw
        if first_inactive_locks and first_inactive_locks != observed_locks:
            raise ValueError("Preserved inactive Native lock identity changed during repair")
        if not first_inactive_locks:
            first_inactive_locks.extend(observed_locks)
        live, _ = active_native_locks(root)
        if live:
            raise ValueError("Native locks present; fixture repair refused")
        scan = subprocess.run(["ps", "-axww", "-o", "pid=,stat=,command="], capture_output=True, text=True, timeout=10, check=True)
        lines = [line for line in scan.stdout.splitlines() if line.strip()]
        if scan.stderr.strip() or not lines or any(not re.match(r"^\s*[0-9]+\s+[A-Za-z+<>=NsLlXsWwZzIitpRrDUuHVv-]+\s+\S", line) for line in lines):
            raise ValueError("Native fixture process visibility unknown")
        visible_pids = {int(line.strip().split(None, 1)[0]) for line in lines}
        if any(entry["pid"] in visible_pids for entry in preserved_locks):
            raise ValueError("Preserved Native PID is visible despite ESRCH; inspect explicitly")
        for line in lines:
            pid, state, command = line.strip().split(None, 2)
            if int(pid) == os.getpid():
                continue
            if re.search(r"(?:<unknown>|<access denied>|^\?+$|\[permission denied\])", command, re.I):
                raise ValueError("Incomplete native fixture process argv visibility")
            if (str(safe(root, NATIVE_FIXTURE_PREFIX)) in command or
                str(Path(NATIVE_FIXTURE_SOURCE_ROOT) / NATIVE_FIXTURE_PREFIX) in command or
                re.search(r"(?:^|/)node(?:\s+[^\n]*)?\s--test(?:\s|$)|(?:^|/)npm\s+(?:run\s+)?test(?:[:\s]|$)", command)):
                raise ValueError("Native fixture writer/test parent still visible")
        process_evidence.append({"argv": ["ps", "-axww", "-o", "pid=,stat=,command="],
                                 "stdout_sha256": hashlib.sha256(scan.stdout.encode()).hexdigest(),
                                 "row_count": len(lines), "status": scan.returncode, "stderr_bytes": 0,
                                 "matching_scope_writers": 0, "matching_test_parents": 0,
                                 "historical_owner_pid": None, "termination_proven": False,
                                 "preserved_inactive_native_locks": observed_locks, "checked_at": now()})

    def catalog_check(db, committed=False):
        if not committed:
            actual_counts = {t: db.execute("SELECT COUNT(*) FROM " + t).fetchone()[0] for t in counts}
            schema = [dict(r) for r in db.execute("SELECT type,name,sql FROM sqlite_master ORDER BY type,name")]
            if actual_counts != counts or _repair_digest(schema) != manifest["schema_sha256"]:
                raise ValueError("Native fixture catalog counts/schema changed")
            placeholders = ",".join("?" for _ in target_hashes)
            related = [dict(r) for r in db.execute(
                "SELECT path,sha256,bytes,mode,mtime_ns,scope,cached_at FROM files WHERE sha256 IN (" + placeholders + ") ORDER BY path", sorted(target_hashes))]
            if related != rows:
                raise ValueError("Exact299 rowset closure changed or unrelated content reference exists")
        # Inspect operational reference-bearing JSON control trees. Never hydrate
        # unavailable controls or claim global absence outside these named roots.
        references, derived_workspaces, format_census, hardlink_census = [], set(), [], {}
        needles = [NATIVE_FIXTURE_PREFIX, NATIVE_FIXTURE_SOURCE_ROOT + "/" + NATIVE_FIXTURE_PREFIX, *sorted(target_hashes)]
        for relative in NATIVE_FIXTURE_REFERENCE_ROOTS:
            directory = safe(root, relative)
            if directory.exists():
                if not directory.is_dir():
                    raise ValueError("Operational native reference root is not a directory")
                def walk_error(error):
                    raise ValueError("Operational native reference tree visibility unknown") from error
                for current, dirs, files in os.walk(directory, followlinks=False, onerror=walk_error):
                    retained = []
                    for name in dirs:
                        child = Path(current) / name
                        relative_child = str(child.relative_to(root))
                        if _derived_preview_reference_path(relative_child):
                            if relative_child not in approved_derived:
                                raise ValueError("Unapproved derived preview scope appeared")
                            if child.is_symlink() or not child.is_dir():
                                raise ValueError("Derived preview workspace root is aliased or unknown")
                            derived_workspaces.add(relative_child)
                        elif child.is_symlink():
                            raise ValueError("Operational native reference tree has symlinks")
                        else:
                            retained.append(name)
                    dirs[:] = retained
                    for name in sorted(files):
                        if not name.endswith((".json", ".jsonl")):
                            continue
                        file = safe(root, str((Path(current) / name).relative_to(root)))
                        path = str(file.relative_to(root))
                        if path in declared_hardlinks:
                            index, entry = declared_hardlinks[path]
                            raw = _native_fixture_reference_hardlink_bytes(file, entry)
                            snapshots["reference-hardlink-control-%03d.bin" % index] = raw
                        else:
                            raw = _repair_regular_bytes(file)
                        raw_sha = hashlib.sha256(raw).hexdigest()
                        if path in declared_formats:
                            index, entry = declared_formats[path]
                            if raw_sha != entry["sha256"] or len(raw) != entry["bytes"]:
                                raise ValueError("Pinned historical Native reference-control bytes/SHA changed")
                            values = _native_fixture_reference_values(raw, entry["format"])
                            format_census.append({**entry, "decoded_value_count": len(values)})
                            snapshots["historical-reference-control-%03d.bin" % index] = raw
                        else:
                            values = (_native_fixture_reference_values(raw) if name.endswith(".json") else
                                      [value for line in raw.splitlines() if line.strip()
                                       for value in _native_fixture_reference_values(line)])
                        def inspect(value):
                            if isinstance(value, str) and any(n in value for n in needles):
                                raise ValueError("Operational native JSON refers to retired fixture content/path")
                            if isinstance(value, dict):
                                for k, v in value.items():
                                    inspect(k); inspect(v)
                            if isinstance(value, list):
                                for v in value:
                                    inspect(v)
                        for value in values:
                            inspect(value)
                        if path in declared_hardlinks:
                            hardlink_census[path] = {**declared_hardlinks[path][1],
                                                    "decoded_value_count": len(values),
                                                    "read_identity_verified": True}
                        references.append({"path": path, "sha256": raw_sha})
            for row in db.execute("SELECT path FROM files WHERE path LIKE ?", (relative + "/%",)):
                if not row["path"].endswith((".json", ".jsonl")):
                    continue
                if _derived_preview_reference_path(row["path"]):
                    # Catalogued derived copies can be cold; genuine outer
                    # Native state/inputs/receipts are never skipped here.
                    derived_root = row["path"].split("/preview-workspace", 1)[0] + "/preview-workspace"
                    if derived_root not in approved_derived:
                        raise ValueError("Unapproved catalogued derived preview scope")
                    derived_workspaces.add(derived_root)
                    continue
                if row["path"].endswith((".json", ".jsonl")) and not safe(root, row["path"]).is_file():
                    raise ValueError("Operational native reference control is unavailable")
        if derived_workspaces != approved_derived:
            raise ValueError("Approved derived preview scope set changed or disappeared")
        if {x["path"] for x in format_census} != set(declared_formats):
            raise ValueError("Pinned historical Native reference-format file is missing from the census")
        if set(hardlink_census) != set(declared_hardlinks):
            raise ValueError("Exact Native reference hardlink alias is missing from the census")
        # A pair's link count accounts for all aliases only while every listed
        # path still has the exact pinned inode. Recheck after the whole walk.
        for entry in hardlink_rows:
            _native_fixture_reference_hardlink_bytes(safe(root, entry["path"]), entry)
        audit = {"roots": list(NATIVE_FIXTURE_REFERENCE_ROOTS), "reference_scope": NATIVE_FIXTURE_REFERENCE_SCOPE,
                 "derived_preview_workspaces": sorted(derived_workspaces), "file_count": len(references),
                 "historical_reference_formats": {"evidence": formats_ref, "files_sha256": _repair_digest(format_files),
                     "purpose": "reference_inspection_only", "original_native_JSON_valid": False,
                     "authority_parser_modified": False, "approval_validity_promoted": False,
                     "file_count": len(format_census),
                     "decoded_value_count": sum(x["decoded_value_count"] for x in format_census),
                     "files": sorted(format_census, key=lambda x: x["path"])},
                 "reference_hardlinks": {"evidence": hardlinks_ref, "groups_sha256": _repair_digest(hardlink_groups),
                     "group_count": 3, "path_count": 6, "all_aliases_inspected": True,
                     "purpose": "reference_inspection_only", "original_files_modified": False,
                     "groups": [[hardlink_census[x["path"]] for x in group] for group in hardlink_groups]},
                 "files_sha256": _repair_digest(sorted(references, key=lambda r: r["path"]))}
        if first_native_audit and first_native_audit[0] != audit:
            raise ValueError("Operational native reference census changed")
        if not first_native_audit:
            first_native_audit.append(audit)

    owner_checks = [{"scope": scope, "identity": "owner_identity_unavailable"} for scope in sorted(scopes)]
    snapshots["policy.json"] = policy_raw
    evidence = {"rowset_evidence": audit_ref, "recovery_evidence": recovery_ref, "checks": checks_ref, "review": p["review"],
                "historical_terminal_checks": terminal_evidence,
                "historical_owner_identity": "not_retained", "historical_owner_termination_proven": False,
                "operational_reference_roots": list(NATIVE_FIXTURE_REFERENCE_ROOTS),
                "reference_scope": NATIVE_FIXTURE_REFERENCE_SCOPE,
                "derived_preview_workspaces": derived,
                "historical_reference_formats": formats_ref,
                "historical_reference_formats_files_sha256": _repair_digest(format_files),
                "reference_hardlinks": hardlinks_ref,
                "reference_hardlinks_groups_sha256": _repair_digest(hardlink_groups),
                "operational_reference_audit": first_native_audit,
                "preserved_inactive_native_locks": preserved_locks,
                "inactive_native_lock_audit": first_inactive_locks,
                "scope_limit": "No global absence claim outside frozen rowset, catalog links and named native control trees"}
    return _repair_missing_rows_transaction(
        root, p, settings=settings, manifest_ref=manifest_ref, manifest_bytes=snapshots["native-manifest.json"],
        rows=rows, owner_checks=owner_checks, process_evidence=process_evidence, writers_absent=writers_absent,
        native_contract={"catalog_check": catalog_check, "evidence_check": evidence_check,
                         "native_reference_audit": first_native_audit,
                         "inactive_native_lock_audit": first_inactive_locks,
                         "evidence": evidence, "snapshots": snapshots})


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
    ignore_pid = ignore_pid if type(ignore_pid) is int and ignore_pid > 0 else None
    live, held = [], []
    directories = {root / "locks", *root.glob("*/locks"), *root.glob("research/*/locks")}
    for p in (p for directory in directories for p in directory.glob("*.json")):
        if CONTROL in p.relative_to(root).parts:
            continue
        try:
            record = json.loads(p.read_text())
            pid = record.get("pid") if isinstance(record, dict) else None
            alive = type(pid) is not int or pid <= 0
            if not alive and pid != ignore_pid:
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


def backup_excluded(relative):
    parts = PurePosixPath(relative).parts
    return (any(x in EXCLUDED or re.search(r"credential|oauth|secret", x, re.I) for x in parts) or
            any(any(tuple(parts[i:i+len(sequence)]) == tuple(sequence) for i in range(len(parts)))
                for sequence in EXCLUSION_POLICY["sequences"]))


def eligible(relative, size, minimum):
    parts = PurePosixPath(relative).parts
    if backup_excluded(relative):
        return False
    if parts[-1] in HOT_NAMES or parts[-1].startswith(".") or parts[-1].endswith((".tmp", ".lock")):
        return False
    return bool(scope_for(relative)) or parts[-1] == "body.bin" or size >= minimum


def inventory(root, db, p):
    settings = initialize(root, p)
    live, held = active_native_locks(root, p.get("ignore_pid"))
    if live:
        raise ValueError("Active native locks; retain working data: " + ", ".join(live[:8]))
    count, total, changed, seen = 0, 0, 0, set()
    for directory, dirs, names in os.walk(root, followlinks=False):
        # The dedicated test branch has durable disabled guards for late writers.
        # An explicit inventory must not bypass those guards and archive test payloads.
        dirs[:] = [d for d in dirs if not backup_excluded(str((Path(directory) / d).relative_to(root))) and
                   not (Path(directory) == root and d == "research-test-fixtures") and
                   not (Path(directory) / d).is_symlink()]
        for name in names:
            path = Path(directory) / name
            if path.is_symlink():
                continue
            rel = str(path.relative_to(root))
            st = path.stat()
            if not stat.S_ISREG(st.st_mode) or not eligible(rel, st.st_size, settings["minimum_payload_bytes"]) or any(rel == x or rel.startswith(x + "/") for x in held):
                continue
            seen.add(rel)
            old = db.execute("SELECT * FROM files WHERE path=?", (rel,)).fetchone()
            if not p.get("full_audit") and old and old["bytes"] == st.st_size and int(old["mtime_ns"]) == st.st_mtime_ns:
                count += 1
                total += st.st_size
                continue
            sha = digest_file(path)
            after = path.stat()
            if (st.st_size, st.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise ValueError("Payload changed during inventory: " + rel)
            # Re-reading unchanged bytes is an audit, not a cache admission.
            # Preserve the original cache age and unrelated catalog rows.
            if (old and old["sha256"] == sha and old["bytes"] == st.st_size and
                    int(old["mtime_ns"]) == st.st_mtime_ns and old["mode"] == stat.S_IMODE(st.st_mode)):
                count += 1
                total += st.st_size
                continue
            db.execute("INSERT OR REPLACE INTO files VALUES(?,?,?,?,?,?,?)",
                       (rel, sha, st.st_size, stat.S_IMODE(st.st_mode), str(st.st_mtime_ns), scope_for(rel), now()))
            count += 1
            total += st.st_size
            changed += 1
            if changed % 1000 == 0:
                db.commit()
    db.commit()
    missing = []
    for row in db.execute("SELECT f.*,b.verified_at FROM files f LEFT JOIN objects o ON f.sha256=o.sha256 LEFT JOIN bundles b ON o.bundle_id=b.id"):
        if eligible(row["path"], row["bytes"], settings["minimum_payload_bytes"]) and row["path"] not in seen and not safe(root, row["path"]).exists() and not row["verified_at"]:
            missing.append(row["path"])
    return {"inventoried_files": count, "payload_bytes": total, "updated": changed,
            "missing_unarchived_paths": sorted(missing), "full_audit_complete": not missing,
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
    selected = set(p["selected_paths"]) if "selected_paths" in p else None
    unique = {}
    minimum = policy(root)["minimum_payload_bytes"]
    for row in db.execute("SELECT f.* FROM files f LEFT JOIN objects o ON f.sha256=o.sha256 WHERE o.sha256 IS NULL ORDER BY f.path"):
        if eligible(row["path"], row["bytes"], minimum) and (selected is None or row["path"] in selected):
            unique.setdefault(row["sha256"], row)
    rows = list(unique.values())
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


def install_archive_json(root, relative, value):
    target = safe(root, relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    body = (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()
    if target.exists():
        if target.read_bytes() != body:
            raise ValueError("Immutable archive input/receipt changed")
    else:
        fd, name = tempfile.mkstemp(prefix=".archive-", dir=target.parent)
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(body)
                stream.flush()
                os.fsync(stream.fileno())
            try:
                os.link(name, target)
            except FileExistsError:
                if target.read_bytes() != body:
                    raise ValueError("Immutable archive input/receipt changed")
        finally:
            os.unlink(name)
    return {"path": relative, "sha256": hashlib.sha256(body).hexdigest()}


def archive_pinned(root, ref):
    if not isinstance(ref, dict) or not HASH.fullmatch(ref.get("sha256", "")):
        raise ValueError("Exact archive reference required")
    body = safe(root, ref["path"]).read_bytes()
    if hashlib.sha256(body).hexdigest() != ref["sha256"]:
        raise ValueError("Archive manifest SHA changed")
    return json.loads(body)


def change_manifest(root, db, p):
    if set(p) != {"run_id", "paths"} or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", p.get("run_id", "")):
        raise ValueError("Change manifest needs an exact run ID and paths")
    paths = p["paths"]
    if not isinstance(paths, list) or len(paths) > 10000 or len(set(paths)) != len(paths):
        raise ValueError("Bounded distinct changed paths required")
    settings = policy(root)
    files = []
    for relative in sorted(paths):
        target = safe(root, relative)
        before = target.stat()
        if not stat.S_ISREG(before.st_mode) or not eligible(relative, before.st_size, settings["minimum_payload_bytes"]):
            raise ValueError("Changed path is outside archive selection: " + relative)
        digest = digest_file(target)
        after = target.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise ValueError("Changed source mutated during manifest capture")
        files.append({"path": relative, "sha256": digest, "bytes": before.st_size})
    manifest = {"schema": "research-storage-change-manifest/v1", "root": str(root),
                "run_id": p["run_id"], "files": files,
                "exclusion_policy_sha256": hashlib.sha256(EXCLUSION_BYTES).hexdigest()}
    digest = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()
    ref = install_archive_json(root, CONTROL + "/archive-changes/" + p["run_id"] + "/" + digest + ".json", manifest)
    return {"manifest": ref, "changed_paths": len(files), "scope": "explicit_paths_only", "remote_writes": 0}


def archive_preparation_status(root, db, run_id, finalize=False):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", run_id or ""):
        raise ValueError("Safe archive preparation ID required")
    base = CONTROL + "/archive-preparations/" + run_id + "/"
    manifest_path = safe(root, base + "manifest.json")
    if not manifest_path.exists():
        state = safe(root, base + "state.json")
        return json.loads(state.read_bytes()) if state.exists() else {"status": "not_started", "run_id": run_id}
    manifest = json.loads(manifest_path.read_bytes())
    manifest_ref = {"path": base + "manifest.json", "sha256": digest_file(manifest_path)}
    if manifest.get("root") != str(root) or manifest.get("run_id") != run_id:
        raise ValueError("Archive preparation root changed")
    input_value = archive_pinned(root, manifest["input"])
    if input_value["exclusion_policy_sha256"] != hashlib.sha256(EXCLUSION_BYTES).hexdigest():
        raise ValueError("Archive selection policy changed")
    pending_bundles, verified, bundles = [], 0, {}
    for row in manifest["files"]:
        if backup_excluded(row["path"]):
            raise ValueError("Archive manifest includes excluded cache/backup")
        target = safe(root, row["path"])
        stored = db.execute("SELECT * FROM files WHERE path=?", (row["path"],)).fetchone()
        if not stored or stored["sha256"] != row["sha256"] or stored["bytes"] != row["bytes"]:
            raise ValueError("Archive catalog changed since the frozen manifest")
        bundle = db.execute("SELECT b.* FROM objects o JOIN bundles b ON o.bundle_id=b.id WHERE o.sha256=?", (row["sha256"],)).fetchone()
        if target.exists():
            if target.stat().st_size != row["bytes"] or digest_file(target) != row["sha256"]:
                raise ValueError("Frozen archive source bytes changed")
        elif not bundle or not bundle["verified_at"]:
            raise ValueError("Missing unarchived source; preserve the preparation")
        if bundle:
            bundles[bundle["id"]] = {"bundle_id": bundle["id"], "sha256": bundle["sha256"],
                "bytes": bundle["bytes"], "file_id": bundle["file_id"], "parent_id": bundle["parent_id"],
                "raw_verified_at": bundle["verified_at"],
                "next_action": "reuse_verified" if bundle["verified_at"] else "readback_same_target_before_resume" if bundle["file_id"] else "resume_existing_transfer_journal"}
            verified += bool(bundle["verified_at"])
    pending_bundles = [b for b in bundles.values() if not b["raw_verified_at"]]
    ready = verified == len(manifest["files"]) and not pending_bundles
    receipt_path = safe(root, base + "receipt.json")
    receipt_ref = None
    if ready and finalize and not receipt_path.exists():
        install_archive_json(root, base + "receipt.json", {"schema": "research-storage-archive-receipt/v1",
            "input": manifest["input"], "manifest": manifest_ref, "mode": manifest["mode"],
            "files": len(manifest["files"]), "bundles": list(bundles.values()),
            "verification": "existing_raw_readback" if manifest["files"] else "no_selected_payloads"})
    if receipt_path.exists():
        receipt = json.loads(receipt_path.read_bytes())
        if receipt["manifest"] != manifest_ref or receipt["input"] != manifest["input"] or not ready:
            raise ValueError("Archived receipt no longer matches its frozen scope")
        receipt_ref = {"path": base + "receipt.json", "sha256": digest_file(receipt_path)}
    status_value = "no_changes" if ready and not manifest["files"] else "verified" if receipt_ref else "verification_ready" if ready else "waiting_for_storage"
    return {"status": status_value, "mode": manifest["mode"], "run_id": run_id,
            "input": manifest["input"], "manifest": manifest_ref, "receipt": receipt_ref,
            "scope": manifest["scope"], "files": len(manifest["files"]), "bundles": list(bundles.values()),
            "remote_writes": 0, "domain_job_resumed": False, "regular_cutoff_advanced": False}


def prepare_scoped_archive(root, db, p, mode):
    allowed = {"run_id", "parent_id", "package_bytes", "ignore_pid"}
    if mode == "daily_delta":
        allowed |= {"changes_path", "changes_sha256"}
    if set(p) - allowed or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", p.get("run_id", "")):
        raise ValueError("Invalid scoped archive input")
    settings = initialize(root, {})
    live, held = active_native_locks(root, p.get("ignore_pid"))
    if live:
        raise ValueError("Active native locks; preserve archive preparation")
    base = CONTROL + "/archive-preparations/" + p["run_id"] + "/"
    source = None
    if mode == "daily_delta":
        source = {"path": p.get("changes_path"), "sha256": p.get("changes_sha256")}
        changes = archive_pinned(root, source)
        if changes.get("schema") != "research-storage-change-manifest/v1" or changes.get("root") != str(root) or changes.get("exclusion_policy_sha256") != hashlib.sha256(EXCLUSION_BYTES).hexdigest():
            raise ValueError("Bound exact-path change manifest required")
    params = {k: v for k, v in p.items() if k != "ignore_pid"}
    input_ref = install_archive_json(root, base + "input.json", {"schema": "research-storage-archive-input/v1",
        "root": str(root), "mode": mode, "parameters": params,
        "implementation_sha256": digest_file(Path(__file__)),
        "exclusion_policy_sha256": hashlib.sha256(EXCLUSION_BYTES).hexdigest()})
    if safe(root, base + "manifest.json").exists():
        manifest = json.loads(safe(root, base + "manifest.json").read_bytes())
        if manifest["input"] != input_ref:
            raise ValueError("Archive preparation input changed")
        archive_preparation_status(root, db, p["run_id"])
        pack(root, db, {**p, "selected_paths": [r["path"] for r in manifest["files"]]})
        return archive_preparation_status(root, db, p["run_id"], finalize=True)
    if mode == "full_audit":
        audit = inventory(root, db, {"full_audit": True, "ignore_pid": p.get("ignore_pid")})
        audit_bytes = json.dumps(audit, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
        audit_sha = hashlib.sha256(audit_bytes).hexdigest()
        audit_ref = install_archive_json(root, base + "audits/" + audit_sha + ".json", audit)
        if audit["missing_unarchived_paths"]:
            result = {"status": "requires_repair", "mode": mode, "input": input_ref,
                "audit": audit_ref, "missing_unarchived_paths": audit["missing_unarchived_paths"], "remote_writes": 0}
            atomic_json(safe(root, base + "state.json"), result)
            return result
        import_legacy(root, db)
        files = [{"path": r["path"], "sha256": r["sha256"], "bytes": r["bytes"]} for r in db.execute("SELECT * FROM files ORDER BY path")
            if eligible(r["path"], r["bytes"], settings["minimum_payload_bytes"])]
    else:
        files = changes.get("files")
        if not isinstance(files, list) or len(files) > 10000 or len({r["path"] for r in files}) != len(files):
            raise ValueError("Bounded distinct delta files required")
        for row in files:
            target = safe(root, row["path"])
            if not HASH.fullmatch(row.get("sha256", "")) or type(row.get("bytes")) is not int or row["bytes"] < 0 or not eligible(row["path"], row["bytes"], settings["minimum_payload_bytes"]):
                raise ValueError("Delta includes cache/secret or invalid source identity")
            if any(row["path"] == h or row["path"].startswith(h + "/") for h in held):
                raise ValueError("Delta includes a native writer's held source")
            before = target.stat()
            if not stat.S_ISREG(before.st_mode) or before.st_size != row["bytes"] or digest_file(target) != row["sha256"]:
                raise ValueError("Delta source SHA changed")
            after = target.stat()
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise ValueError("Delta source mutated during verification")
            db.execute("INSERT OR REPLACE INTO files VALUES(?,?,?,?,?,?,?)", (row["path"], row["sha256"], row["bytes"], stat.S_IMODE(before.st_mode), str(before.st_mtime_ns), scope_for(row["path"]), now()))
        db.commit()
    install_archive_json(root, base + "manifest.json", {"schema": "research-storage-archive-manifest/v1",
        "root": str(root), "run_id": p["run_id"], "mode": mode, "input": input_ref,
        "scope": {"kind": "full_catalog_and_local_walk" if mode == "full_audit" else "exact_changed_paths", "changes": source,
            **({"latest_audit": audit_ref} if mode == "full_audit" else {})},
        "files": files})
    pack(root, db, {**p, "selected_paths": [r["path"] for r in files]})
    return archive_preparation_status(root, db, p["run_id"], finalize=True)


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
    parser.add_argument("action", choices=["repair-missing-native-fixture-records", "repair-missing-fixture-records", "recover-mutation-lock", "status", "prepare", "prepare-full", "prepare-delta", "change-manifest", "archive-status", "verify", "hydrate", "evict", "pending", "enable", "export", "import"])
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
    if args.action in {"repair-missing-fixture-records", "repair-missing-native-fixture-records"}:
        if requested_root != root:
            raise ValueError("Symlink in storage repair root")
        with exclusive(root):
            repair = repair_missing_native_fixture_records if args.action == "repair-missing-native-fixture-records" else repair_missing_fixture_records
            result = repair(root, p)
        print(json.dumps(result, ensure_ascii=False))
        return
    if args.action == "archive-status":
        catalog_file = safe(root, CONTROL + "/catalog.sqlite")
        if not catalog_file.exists():
            print(json.dumps({"status": "not_started"}))
            return
        db = sqlite3.connect(catalog_file.as_uri() + "?mode=ro", uri=True)
        db.row_factory = sqlite3.Row
        try:
            result = archive_preparation_status(root, db, p.get("run_id"))
            print(json.dumps(result, ensure_ascii=False))
        finally:
            db.close()
        return
    db = connect(root)
    try:
        if args.action in {"status", "pending"}:
            result = status(root, db, p) if args.action == "status" else pending(db)
        else:
            with exclusive(root):
                if args.action == "change-manifest":
                    result = change_manifest(root, db, p)
                elif args.action in {"prepare-full", "prepare-delta"}:
                    if requested_root != root:
                        raise ValueError("Symlink in archive preparation root")
                    result = prepare_scoped_archive(root, db, p, "full_audit" if args.action == "prepare-full" else "daily_delta")
                elif args.action == "prepare":
                    result = inventory(root, db, {**p, "full_audit": True})
                    if result["missing_unarchived_paths"]:
                        raise ValueError("Full audit found missing unarchived payloads")
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
