# coding: utf-8
"""Standalone: python3 -m unittest discover -s tests -p test_research_native_fixture_metadata_repair.py.
Only isolated seeded catalogs. Native positive paths use a test-process-only constant
monkeypatch wrapper, the same validator/SQLite transaction, and actual ps. The unchanged
production CLI must reject this synthetic specimen. No runtime override is added.
Simulated Q0 records are not an independent review or operative execution approval.
"""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import uuid

REPO = Path(__file__).resolve().parents[1]
RUNNER = REPO / "scripts/research/cold-storage.py"
SPEC = importlib.util.spec_from_file_location("native_fixture_storage", RUNNER)
STORAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(STORAGE)
ACTION = "repair-missing-native-fixture-records"
EVIDENCE = json.loads((REPO / "tests/fixtures/native-fixture-repair-evidence.json").read_bytes())
CONSTANT_NAMES = ("NATIVE_FIXTURE_PREFIX", "NATIVE_FIXTURE_CHECKS", "NATIVE_FIXTURE_SOURCE_ROOT",
                  "NATIVE_FIXTURE_ROWSET_SHA", "NATIVE_FIXTURE_AUDIT_SHA",
                  "NATIVE_FIXTURE_CHECKS_SHA", "NATIVE_FIXTURE_RECOVERY_SHA",
                  "NATIVE_FIXTURE_REFERENCE_FORMATS_SHA", "NATIVE_FIXTURE_REFERENCE_HARDLINKS_SHA")
PRODUCTION_CONSTANTS = {name: getattr(STORAGE, name) for name in CONSTANT_NAMES}



def raw(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def sha(value):
    return hashlib.sha256(value).hexdigest()


class NativeFixtureRepair(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="garden-native-repair-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.db = STORAGE.connect(self.root)
        self.addCleanup(self.db.close)
        STORAGE.initialize(self.root, {"enabled": False, "cache_bytes": 32 * 1024 ** 3})
        profile = EVIDENCE
        rows = []
        for index in range(profile["row_count"]):
            content = (profile["seed"] + " content-%d" % (index % profile["content_count"])).encode()
            rows.append({"path": profile["scope_prefix"] + "/knowledge-integration-S%05d/documents/sample-%03d.bin" % (index % profile["scope_count"], index),
                         "sha256": sha(content), "bytes": len(content), "mode": 384,
                         "mtime_ns": str(profile["mtime_start_ns"] + index), "scope": None, "cached_at": None})
        rows.sort(key=lambda r: r["path"])
        logs = {name: text.encode() for name, text in profile["logs"].items()}
        checks = {"schema": "tkg-d2-check-evidence/v1", "synthetic_fixture_submissions_only": True,
                  "actual_model_calls": 0, "operational_writes": 0,
                  "canonical_native_runs_revalidated_in_iteration6": 0,
                  "tmpdir": profile["source_root"] + "/" + profile["scope_prefix"],
                  "checks": [{"name": "synthetic-before", "exit_code": 1, "log": "synthetic-before.log",
                              "log_sha256": sha(logs["synthetic-before.log"])},
                             {"name": "synthetic-after", "exit_code": 0, "log": "synthetic-after.log",
                              "log_sha256": sha(logs["synthetic-after.log"])}]}
        audit = {"schema": "d2-missing-test-catalog-rowset/v1", "audit_only": True,
                 "root": profile["source_root"], "rows": rows}
        recovery = {"schema": "d2-missing-fixture-recovery-result/v1",
                    "status": "read_only_diagnosis_complete_no_supported_repair",
                    "expected_unique_contents": 99, "affected_paths": 299,
                    "existing_raw_copies_found_in_checked_scope": 0,
                    "actual_recovery_or_catalog_mutation": False}
        files = {"rowset.json": raw(audit), "checks.json": raw(checks), "recovery-result.json": raw(recovery), **logs}
        self.synthetic_constants = {
            "NATIVE_FIXTURE_PREFIX": profile["scope_prefix"],
            "NATIVE_FIXTURE_CHECKS": profile["scope_prefix"].rsplit("/", 1)[0] + "/checks.json",
            "NATIVE_FIXTURE_SOURCE_ROOT": profile["source_root"],
            "NATIVE_FIXTURE_ROWSET_SHA": sha(raw(rows)),
            "NATIVE_FIXTURE_AUDIT_SHA": sha(files["rowset.json"]),
            "NATIVE_FIXTURE_CHECKS_SHA": sha(files["checks.json"]),
            "NATIVE_FIXTURE_RECOVERY_SHA": sha(files["recovery-result.json"])}
        for name, value in self.synthetic_constants.items():
            setattr(STORAGE, name, value)
        self.addCleanup(lambda: [setattr(STORAGE, name, value) for name, value in PRODUCTION_CONSTANTS.items()])
        self.constant_input = self.root / "synthetic-constants.json"
        self.constant_input.write_bytes(raw(self.synthetic_constants))
        self.cli_wrapper = self.root / "synthetic-native-cli.py"
        self.cli_wrapper.write_text("""# Test process only; never imported by production.
import importlib.util,json,sys
spec=importlib.util.spec_from_file_location('storage',sys.argv.pop(1))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
constants=json.load(open(sys.argv.pop(1)))
for name,value in constants.items():setattr(m,name,value)
try:m.main()
except (ValueError,OSError,m.sqlite3.Error,m.zipfile.BadZipFile) as error:
    print(json.dumps({'error':str(error)}),file=sys.stderr);raise SystemExit(1)
""")
        audit = json.loads(files["rowset.json"])
        self.rows = audit["rows"]
        self.assertEqual(len(self.rows), 299)
        self.assertEqual(sha(raw(self.rows)), STORAGE.NATIVE_FIXTURE_ROWSET_SHA)
        for r in self.rows:
            self.db.execute("INSERT INTO files VALUES(?,?,?,?,?,?,?)", tuple(r[k] for k in ("path", "sha256", "bytes", "mode", "mtime_ns", "scope", "cached_at")))
        self.original = self.root / "research/local-ai/documents/real-source/body.bin"
        self.original.parent.mkdir(parents=True)
        self.original.write_bytes(b"unrelated operational source must not change")
        self.original_sha = sha(self.original.read_bytes())
        self.db.execute("INSERT INTO files VALUES(?,?,?,?,?,?,?)", (str(self.original.relative_to(self.root)), self.original_sha, self.original.stat().st_size, 384, "1", None, None))
        self.db.execute("INSERT INTO bundles(id,kind,sha256,bytes,verified_at) VALUES(?,?,?,?,?)", ("real-bundle", "zip", "a" * 64, 9, "2026-10-23T00:00:00Z"))
        self.db.execute("INSERT INTO objects VALUES(?,?,?,?)", (self.original_sha, self.original.stat().st_size, "real-bundle", "real-member"))
        self.db.execute("INSERT INTO requests VALUES(?,?,?,?,?,?)", ("unrelated-request", "unrelated", "b" * 64, "real-bundle", "2026-10-23T00:00:00Z", "pending"))
        self.db.execute("INSERT INTO meta VALUES(?,?)", ("unrelated", "preserve this value"))
        self.db.execute("CREATE TABLE extension(key TEXT PRIMARY KEY, value TEXT)")
        self.db.execute("INSERT INTO extension VALUES('keep','extension value')")
        self.db.commit()
        self.control = self.root / "research/local-ai/reasoning-tasks/real-task/request.json"
        self.control.parent.mkdir(parents=True)
        self.control.write_bytes(raw({"schema": "isolated-operational-control", "source": "real-source"}))
        self.control_bytes = self.control.read_bytes()
        self.evidence_dir = self.root / "research/repair-input"
        self.evidence_dir.mkdir(parents=True)
        (self.evidence_dir / "rowset.json").write_bytes(files["rowset.json"])
        (self.evidence_dir / "recovery-result.json").write_bytes(files["recovery-result.json"])
        checks_path = self.root / STORAGE.NATIVE_FIXTURE_CHECKS
        checks_path.parent.mkdir(parents=True)
        checks_path.write_bytes(files["checks.json"])
        for name, data in files.items():
            if name not in ("rowset.json", "checks.json", "recovery-result.json"):
                (checks_path.parent / name).write_bytes(data)
        self.operation = uuid.uuid4().hex
        self.params = {"expected_root": str(self.root), "operator": "isolated-synthetic-regression",
                       "reason": "Exercise the exact historical cohort contract without opening the real catalog",
                       "operation_id": self.operation}
        self.manifest = {
            "schema": "research-missing-native-fixture-repair/v1", "root": str(self.root), "operation_id": self.operation,
            "policy_sha256": sha((self.root / ".storage/policy.json").read_bytes()),
            "rows": self.rows, "expected_count": 299, "unique_content_count": 99,
            "rowset_sha256": STORAGE.NATIVE_FIXTURE_ROWSET_SHA,
            "rowset_evidence": {"path": "research/repair-input/rowset.json", "sha256": STORAGE.NATIVE_FIXTURE_AUDIT_SHA},
            "recovery_evidence": {"path": "research/repair-input/recovery-result.json", "sha256": STORAGE.NATIVE_FIXTURE_RECOVERY_SHA},
            "checks": {"path": STORAGE.NATIVE_FIXTURE_CHECKS, "sha256": STORAGE.NATIVE_FIXTURE_CHECKS_SHA},
            "historical_owner_identity": "not_retained", "historical_owner_termination_proven": False,
            "preserved_inactive_native_locks": [],
            "reference_scope": STORAGE.NATIVE_FIXTURE_REFERENCE_SCOPE,
            "derived_preview_workspaces": [],
        }
        self.seed_historical_reference_formats()
        self.seed_reference_hardlinks()
        self.bind_counts()
        self.write_manifest()
        self.initial = self.snapshot()

    def bind_counts(self):
        self.manifest["expected_counts"] = {t: self.db.execute("SELECT COUNT(*) FROM " + t).fetchone()[0] for t in ("files", "objects", "bundles", "requests")}
        schema = [dict(r) for r in self.db.execute("SELECT type,name,sql FROM sqlite_master ORDER BY type,name")]
        self.manifest["schema_sha256"] = sha(raw(schema))

    def seed_historical_reference_formats(self):
        self.format_rows = []
        directory = self.root / "research/local-ai/runs/synthetic-history/reference-captures"
        directory.mkdir(parents=True)
        for format_name, count in EVIDENCE["historical_reference_format_counts"].items():
            for index in range(count):
                file = directory / ("%s-%02d.json" % (format_name, index))
                if format_name == "empty_bytes":
                    data = b""
                elif format_name == "json_value_stream":
                    data = b" \t\r\n" + raw({"checkpoint": index}) + b"\t" + raw({"complete": True})
                else:
                    data = raw({"schema": "synthetic-review/v1", "stage": "test"})[:-1] + b"\\n"
                file.write_bytes(data)
                self.format_rows.append({"path": str(file.relative_to(self.root)), "sha256": sha(data),
                                         "bytes": len(data), "format": format_name})
        self.format_rows.sort(key=lambda entry: entry["path"])
        observation = self.evidence_dir / "synthetic-format-observation.json"
        observation.write_bytes(raw({"schema": "synthetic-producer-observation/v1", "test_only": True}))
        self.formats_evidence = {
            "schema": "research-native-fixture-historical-reference-formats/v1",
            "root": EVIDENCE["source_root"], "expected_count": 57, "files": self.format_rows,
            "purpose": "Generated reference-only format example; no Native authority or approval.",
            "rules": copy.deepcopy(STORAGE.NATIVE_FIXTURE_REFERENCE_FORMAT_RULES),
            "source_observation": {"path": str(observation.relative_to(self.root)),
                                   "sha256": sha(observation.read_bytes())}}
        self.rebind_format_evidence()

    def rebind_format_evidence(self, refresh_bytes=True):
        # Test process only: bind freshly generated variants, never production data.
        if refresh_bytes:
            for entry in self.format_rows:
                data = (self.root / entry["path"]).read_bytes()
                entry.update(sha256=sha(data), bytes=len(data))
        file = self.evidence_dir / "historical-reference-formats.json"
        file.write_bytes(raw(self.formats_evidence))
        digest = sha(file.read_bytes())
        self.synthetic_constants["NATIVE_FIXTURE_REFERENCE_FORMATS_SHA"] = digest
        STORAGE.NATIVE_FIXTURE_REFERENCE_FORMATS_SHA = digest
        self.constant_input.write_bytes(raw(self.synthetic_constants))
        self.manifest["historical_reference_formats"] = {"path": str(file.relative_to(self.root)), "sha256": digest}
        self.manifest["historical_reference_formats_files_sha256"] = sha(raw(self.format_rows))

    def format_entry(self, format_name):
        return next(entry for entry in self.format_rows if entry["format"] == format_name)

    def seed_reference_hardlinks(self):
        self.hardlink_groups = []
        for index in range(EVIDENCE["reference_hardlink_group_count"]):
            paths = [self.root / ("research/local-ai/runs/synthetic-hardlink-%02d-%s/control.json" % (index, alias))
                     for alias in ("a", "b")]
            self.assertEqual(len(paths), EVIDENCE["reference_hardlink_paths_per_group"])
            for file in paths:
                file.parent.mkdir(parents=True)
            paths[0].write_bytes(raw({"schema": "synthetic-hardlink-reference/v1", "group": index}))
            paths[0].chmod(0o600)
            os.link(paths[0], paths[1])
            self.hardlink_groups.append([{"path": str(file.relative_to(self.root))} for file in paths])
        self.hardlinks_evidence = {
            "schema": "research-native-fixture-reference-hardlink-groups/v1", "root": EVIDENCE["source_root"],
            "expected_group_count": 3, "expected_path_count": 6, "groups": self.hardlink_groups,
            "purpose": "Generated complete control-alias groups for reference inspection only."}
        self.rebind_hardlink_evidence()

    def rebind_hardlink_evidence(self, refresh_metadata=True):
        # OS-created synthetic aliases; no operational inode/time/path metadata.
        if refresh_metadata:
            for group in self.hardlink_groups:
                for entry in group:
                    file = self.root / entry["path"]; info = file.lstat(); data = file.read_bytes()
                    entry.update(sha256=sha(data), bytes=len(data), device=str(info.st_dev), inode=str(info.st_ino),
                                 nlink=info.st_nlink, mtime_ns=str(info.st_mtime_ns),
                                 ctime_ns=str(info.st_ctime_ns), mode=info.st_mode & 0o7777)
        file = self.evidence_dir / "reference-hardlinks.json"
        file.write_bytes(raw(self.hardlinks_evidence))
        digest = sha(file.read_bytes())
        self.synthetic_constants["NATIVE_FIXTURE_REFERENCE_HARDLINKS_SHA"] = digest
        STORAGE.NATIVE_FIXTURE_REFERENCE_HARDLINKS_SHA = digest
        self.constant_input.write_bytes(raw(self.synthetic_constants))
        self.manifest["reference_hardlinks"] = {"path": str(file.relative_to(self.root)), "sha256": digest}
        self.manifest["reference_hardlinks_groups_sha256"] = sha(raw(self.hardlink_groups))

    def write_manifest(self):
        path = self.evidence_dir / "manifest.json"
        path.write_bytes(raw(self.manifest))
        self.params["manifest"] = {"path": str(path.relative_to(self.root)), "sha256": sha(path.read_bytes())}
        self.review = {"schema": "research-native-fixture-repair-review/v1", "reviewer": "Q0",
                       "decision": "approve_exact299_native_fixture_metadata_repair",
                       "root": str(self.root), "manifest": self.params["manifest"], "operation_id": self.operation,
                       "source_sha256": sha(RUNNER.read_bytes()),
                       "preserved_inactive_native_locks_sha256": sha(raw(self.manifest["preserved_inactive_native_locks"])),
                       "reference_scope": STORAGE.NATIVE_FIXTURE_REFERENCE_SCOPE,
                       "derived_preview_workspaces_sha256": sha(raw(self.manifest["derived_preview_workspaces"])),
                       "historical_reference_formats_files_sha256": sha(raw(self.format_rows)),
                       "reference_hardlinks_groups_sha256": sha(raw(self.hardlink_groups)),
                       "historical_owner_identity": "not_retained", "historical_owner_termination_proven": False,
                       "accept_absent_scopes_and_fresh_process_visibility": True,
                       "reason": "Synthetic review-shaped test input only"}
        self.write_review()

    def write_review(self):
        path = self.evidence_dir / "review.json"
        path.write_bytes(raw(self.review))
        self.params["review"] = {"path": str(path.relative_to(self.root)), "sha256": sha(path.read_bytes())}

    def snapshot(self):
        result = {}
        for table in ("files", "objects", "bundles", "requests", "meta", "extension"):
            result[table] = sorted([dict(r) for r in self.db.execute("SELECT * FROM " + table)], key=lambda r: raw(r))
        return result

    def cli(self, params=None, action=ACTION, env=None, unmodified=False):
        with tempfile.TemporaryFile() as stdin:
            stdin.write(raw(params or self.params))
            stdin.seek(0)
            command = ([sys.executable, str(RUNNER)] if unmodified else
                       [sys.executable, str(self.cli_wrapper), str(RUNNER), str(self.constant_input)])
            return subprocess.run([*command, action, "--root", str(self.root)],
                                  stdin=stdin, capture_output=True, timeout=40, env=env)

    def reject(self, params=None, action=ACTION, env=None):
        before = self.snapshot()
        result = self.cli(params, action, env)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(sha(self.original.read_bytes()), self.original_sha)
        return result

    def helper(self, argument):
        child = subprocess.Popen([sys.executable, "-c", "import time;time.sleep(120)", argument])
        def cleanup():
            if child.poll() is None:
                child.terminate()
            child.wait(timeout=10)
        self.addCleanup(cleanup)
        return child

    def test_synthetic_cli_wrapper_actual_ps_preserves_unrelated_values_and_unblocks_pack(self):
        # Reproduce the missing-row blocker in the isolated synthetic catalog.
        with self.assertRaises(FileNotFoundError):
            STORAGE.pack(self.root, self.db, {})
        self.assertEqual(self.snapshot(), self.initial)
        result = self.cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(result.stdout)
        self.assertEqual(value["commit_marker"]["deleted"], 299)
        after = self.snapshot()
        self.assertEqual(len(after["files"]), 1)
        for t in ("objects", "bundles", "requests", "extension"):
            self.assertEqual(after[t], self.initial[t])
        self.assertIn({"key": "unrelated", "value": "preserve this value"}, after["meta"])
        self.assertEqual(self.control.read_bytes(), self.control_bytes)
        self.assertEqual(sha(self.original.read_bytes()), self.original_sha)
        before = json.loads((self.root / value["before"]).read_bytes())
        self.assertEqual(len(before["rows"]), 299)
        self.assertEqual(len(before["owners"]), 113)
        self.assertIn("no ESRCH/termination claim", before["owner_probe"])
        self.assertEqual(before["policy"]["cache_bytes"], 32 * 1024 ** 3)
        self.assertEqual(len(before["native_fixture_evidence"]["operational_reference_audit"]), 1)
        self.assertEqual(before["native_fixture_evidence"]["historical_terminal_checks"][0]["exit_code"], 1)
        for probe in before["process_evidence"]:
            self.assertFalse(probe["termination_proven"])
            self.assertGreater(probe["row_count"], 0)
        self.assertEqual(STORAGE.pack(self.root, self.db, {}), {"new_packages": 0, "new_unique_objects": 0})
        self.reject()
        readback = self.cli({**self.params, "readback_only": True})
        self.assertEqual(readback.returncode, 0, readback.stderr)
        self.assertEqual(json.loads(readback.stdout)["status"], "committed_readback")

    def test_exact57_reference_formats_scan_all_values_preserve_raw_and_read_back(self):
        for entry in (self.format_entry("empty_bytes"), self.format_entry("json_value_stream")):
            self.db.execute("INSERT INTO files VALUES(?,?,?,?,?,?,?)",
                            (entry["path"], entry["sha256"], entry["bytes"], 384, "1", None, None))
        self.db.commit(); self.bind_counts(); self.write_manifest()
        originals = {entry["path"]: (self.root / entry["path"]).read_bytes() for entry in self.format_rows}
        result = self.cli(); self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(result.stdout); before_path = self.root / value["before"]
        audit = json.loads(before_path.read_bytes())["native_fixture_evidence"]["operational_reference_audit"][0]
        formats = audit["historical_reference_formats"]
        self.assertEqual(formats["file_count"], 57)
        self.assertEqual(formats["decoded_value_count"], 29)
        self.assertEqual(formats["files_sha256"], sha(raw(self.format_rows)))
        self.assertEqual(formats["purpose"], "reference_inspection_only")
        self.assertFalse(formats["original_native_JSON_valid"])
        self.assertFalse(formats["authority_parser_modified"])
        self.assertFalse(formats["approval_validity_promoted"])
        self.assertEqual(audit["file_count"], 64)
        for index, entry in enumerate(self.format_rows):
            self.assertEqual((self.root / entry["path"]).read_bytes(), originals[entry["path"]])
            self.assertEqual(sha((before_path.parent / ("historical-reference-control-%03d.bin" % index)).read_bytes()), entry["sha256"])
        self.assertEqual(len(self.snapshot()["files"]), 3)
        readback = self.cli({**self.params, "readback_only": True})
        self.assertEqual(readback.returncode, 0, readback.stderr)

    def test_historical_formats_require_exact_pinned_manifest_ref_and_Q0_vector(self):
        valid = copy.deepcopy(self.manifest)
        for kind in ("missing_ref", "wrong_ref", "missing_manifest_digest", "wrong_manifest_digest", "missing_Q0", "wrong_Q0"):
            with self.subTest(kind=kind):
                self.manifest = copy.deepcopy(valid)
                if kind == "missing_ref":
                    self.manifest.pop("historical_reference_formats")
                elif kind == "wrong_ref":
                    self.manifest["historical_reference_formats"]["sha256"] = "f" * 64
                elif kind == "missing_manifest_digest":
                    self.manifest.pop("historical_reference_formats_files_sha256")
                elif kind == "wrong_manifest_digest":
                    self.manifest["historical_reference_formats_files_sha256"] = "f" * 64
                self.write_manifest()
                if kind == "missing_Q0":
                    self.review.pop("historical_reference_formats_files_sha256"); self.write_review()
                elif kind == "wrong_Q0":
                    self.review["historical_reference_formats_files_sha256"] = "f" * 64; self.write_review()
                self.reject()

    def test_rehashed_evidence_cannot_replace_the_fixed_production_format_digest(self):
        file = self.evidence_dir / "historical-reference-formats.json"
        file.write_bytes(file.read_bytes() + b" ")
        self.manifest["historical_reference_formats"]["sha256"] = sha(file.read_bytes())
        self.write_manifest()
        result = self.reject()
        self.assertIn(b"Exact pinned historical Native reference-format evidence required", result.stderr)

    def test_declared_historical_controls_missing_changed_or_aliased_are_rejected(self):
        entry = self.format_entry("json_value_stream")
        file = self.root / entry["path"]; original = file.read_bytes()
        file.unlink(); self.reject(); file.write_bytes(original)
        file.write_bytes(original + b" "); self.reject(); file.write_bytes(original)
        file.unlink(); file.symlink_to(self.original); self.reject(); file.unlink(); file.write_bytes(original)
        alias = self.root / "historical-control-alias"; os.link(file, alias)
        self.reject(); alias.unlink()

    def test_fixed57_vector_schema_count_rules_format_and_path_guards(self):
        valid = copy.deepcopy(self.formats_evidence)
        for kind in ("schema", "root", "count", "missing", "duplicate", "order", "unknown_format",
                     "rules", "outside_path", "derived_path", "boolean_bytes", "wrong_bytes"):
            with self.subTest(kind=kind):
                self.formats_evidence = copy.deepcopy(valid)
                self.format_rows = self.formats_evidence["files"]
                if kind == "schema":
                    self.formats_evidence["schema"] = "unknown"
                elif kind == "root":
                    self.formats_evidence["root"] = "/different-root"
                elif kind == "count":
                    self.formats_evidence["expected_count"] = 56
                elif kind == "missing":
                    self.format_rows.pop()
                elif kind == "duplicate":
                    self.format_rows[-1] = copy.deepcopy(self.format_rows[0])
                elif kind == "order":
                    self.format_rows.reverse()
                elif kind == "unknown_format":
                    self.format_rows[0]["format"] = "skip"
                elif kind == "rules":
                    self.formats_evidence["rules"]["empty_bytes"] = "ignore any content"
                elif kind == "outside_path":
                    self.format_rows[0]["path"] = "research/unrelated.json"
                elif kind == "derived_path":
                    self.format_rows[0]["path"] = "research/local-ai/runs/synthetic/preview-workspace/copy.json"
                elif kind == "boolean_bytes":
                    self.format_rows[0]["bytes"] = False
                elif kind == "wrong_bytes":
                    self.format_rows[0]["bytes"] += 1
                self.rebind_format_evidence(refresh_bytes=False); self.write_manifest(); self.reject()

    def test_all_decoded_target_keys_and_values_in_each_nonempty_format_are_rejected(self):
        for format_name in ("json_value_stream", "json_with_literal_trailing_newline"):
            entry = self.format_entry(format_name); file = self.root / entry["path"]; original = file.read_bytes()
            for target in (self.rows[0]["sha256"], STORAGE.NATIVE_FIXTURE_PREFIX):
                for escaped in (False, True):
                    encoded = ('"' + "".join("\\u%04x" % ord(c) for c in target) + '"').encode() if escaped else json.dumps(target).encode()
                    for location in ("key", "value"):
                        with self.subTest(format=format_name, target=target, escaped=escaped, location=location):
                            value = b"{" + encoded + b':"safe"}' if location == "key" else b'{"target":' + encoded + b"}"
                            data = b'{"progress":true}\n' + value + b'\n{"complete":true}\n' if format_name == "json_value_stream" else value + b"\\n"
                            file.write_bytes(data); self.rebind_format_evidence(); self.write_manifest()
                            result = self.reject()
                            self.assertIn(b"Operational native JSON refers to retired fixture", result.stderr)
                            file.write_bytes(original); self.rebind_format_evidence(); self.write_manifest()

    def test_duplicate_key_previous_escaped_target_is_inspected_in_every_format(self):
        for format_name in ("json_value_stream", "json_with_literal_trailing_newline", "single_json"):
            file = self.control if format_name == "single_json" else self.root / self.format_entry(format_name)["path"]
            original = file.read_bytes()
            for target in (self.rows[0]["sha256"], STORAGE.NATIVE_FIXTURE_PREFIX):
                with self.subTest(format=format_name, target=target):
                    escaped = ('"' + "".join("\\u%04x" % ord(c) for c in target) + '"').encode()
                    value = b'{"duplicate":' + escaped + b',"duplicate":"safe"}'
                    data = b'{"progress":true}\n' + value if format_name == "json_value_stream" else value + (b"\\n" if format_name == "json_with_literal_trailing_newline" else b"")
                    file.write_bytes(data); self.rebind_format_evidence(); self.write_manifest()
                    result = self.reject()
                    self.assertIn(b"Operational native JSON refers to retired fixture", result.stderr)
                    file.write_bytes(original); self.rebind_format_evidence(); self.write_manifest()

    def test_bound_nonstandard_constants_garbage_and_non_JSON_whitespace_are_rejected(self):
        invalid_values = (b'{"x":NaN}', b'{"x":Infinity}', b'{"x":-Infinity}',
                          b"{} garbage", b"{}\xc2\xa0{}", b"{}\xe2\x80\xa8{}", b"{}\v{}", b"{}\f{}", b"\xef\xbb\xbf{}", b"\xff")
        for format_name in ("json_value_stream", "json_with_literal_trailing_newline"):
            file = self.root / self.format_entry(format_name)["path"]; original = file.read_bytes()
            for value in invalid_values:
                with self.subTest(format=format_name, value=value):
                    file.write_bytes(value + (b"\\n" if format_name == "json_with_literal_trailing_newline" else b""))
                    self.rebind_format_evidence(); self.write_manifest(); self.reject()
                    file.write_bytes(original); self.rebind_format_evidence(); self.write_manifest()
        file = self.root / self.format_entry("json_with_literal_trailing_newline")["path"]
        for data in (b"{}\n", b"{}\\n\n", b"{}\\n\\n", b"{}\\ntrailing", b"{}{}\\n"):
            with self.subTest(literal_tail=data):
                file.write_bytes(data); self.rebind_format_evidence(); self.write_manifest(); self.reject()

    def test_bound_empty_format_rejects_every_nonzero_byte_payload(self):
        file = self.root / self.format_entry("empty_bytes")["path"]
        for data in (b" ", b"\n", b"{}", b"\\n", self.rows[0]["sha256"].encode(),
                     ('"' + "".join("\\u%04x" % ord(c) for c in STORAGE.NATIVE_FIXTURE_PREFIX) + '"').encode()):
            with self.subTest(data=data):
                file.write_bytes(data); self.rebind_format_evidence(); self.write_manifest()
                result = self.reject()
                self.assertIn(b"not exactly zero bytes", result.stderr)

    def test_exact57_file_and_evidence_changes_after_commit_block_readback(self):
        result = self.cli(); self.assertEqual(result.returncode, 0, result.stderr)
        file = self.root / self.format_entry("empty_bytes")["path"]
        file.write_bytes(b" "); self.reject({**self.params, "readback_only": True}); file.write_bytes(b"")
        file.unlink(); self.reject({**self.params, "readback_only": True}); file.write_bytes(b"")
        evidence = self.evidence_dir / "historical-reference-formats.json"
        evidence.write_bytes(evidence.read_bytes() + b" ")
        self.reject({**self.params, "readback_only": True})

    def test_hardlink_three_complete_groups_preserve_all_aliases_and_read_back(self):
        originals = {}
        for group in self.hardlink_groups:
            for entry in group:
                file = self.root / entry["path"]
                originals[entry["path"]] = (file.read_bytes(), file.lstat())
                self.db.execute("INSERT INTO files VALUES(?,?,?,?,?,?,?)",
                                (entry["path"], entry["sha256"], entry["bytes"], 384, "1", None, None))
        self.db.commit(); self.bind_counts(); self.write_manifest()
        result = self.cli(); self.assertEqual(result.returncode, 0, result.stderr)
        before_path = self.root / json.loads(result.stdout)["before"]
        audit = json.loads(before_path.read_bytes())["native_fixture_evidence"]["operational_reference_audit"][0]
        links = audit["reference_hardlinks"]
        self.assertEqual((links["group_count"], links["path_count"]), (3, 6))
        self.assertTrue(links["all_aliases_inspected"])
        self.assertEqual(links["groups_sha256"], sha(raw(self.hardlink_groups)))
        self.assertEqual(audit["file_count"], 64)
        for index, entry in enumerate(e for g in self.hardlink_groups for e in g):
            self.assertEqual((before_path.parent / ("reference-hardlink-control-%03d.bin" % index)).read_bytes(),
                             originals[entry["path"]][0])
        readback = self.cli({**self.params, "readback_only": True})
        self.assertEqual(readback.returncode, 0, readback.stderr)
        for group in self.hardlink_groups:
            for entry in group:
                file = self.root / entry["path"]; data, old = originals[entry["path"]]; current = file.lstat()
                self.assertEqual(file.read_bytes(), data)
                self.assertEqual((current.st_dev, current.st_ino, current.st_nlink, current.st_mtime_ns, current.st_ctime_ns, current.st_mode),
                                 (old.st_dev, old.st_ino, 2, old.st_mtime_ns, old.st_ctime_ns, old.st_mode))
        self.assertEqual(len(self.snapshot()["files"]), 7)

    def test_hardlink_manifest_and_Q0_binding_are_mandatory(self):
        valid = copy.deepcopy(self.manifest)
        for kind in ("ref", "digest", "wrong_ref", "wrong_digest", "Q0", "wrong_Q0"):
            with self.subTest(kind=kind):
                self.manifest = copy.deepcopy(valid)
                if kind == "ref":
                    self.manifest.pop("reference_hardlinks")
                elif kind == "digest":
                    self.manifest.pop("reference_hardlinks_groups_sha256")
                elif kind == "wrong_ref":
                    self.manifest["reference_hardlinks"]["sha256"] = "f" * 64
                elif kind == "wrong_digest":
                    self.manifest["reference_hardlinks_groups_sha256"] = "f" * 64
                self.write_manifest()
                if kind == "Q0":
                    self.review.pop("reference_hardlinks_groups_sha256"); self.write_review()
                elif kind == "wrong_Q0":
                    self.review["reference_hardlinks_groups_sha256"] = "f" * 64; self.write_review()
                self.reject()

    def test_hardlink_evidence_rehash_cannot_replace_fixed_digest(self):
        file = self.evidence_dir / "reference-hardlinks.json"
        file.write_bytes(file.read_bytes() + b" ")
        self.manifest["reference_hardlinks"]["sha256"] = sha(file.read_bytes()); self.write_manifest()
        self.assertIn(b"Exact pinned Native reference hardlink-group evidence required", self.reject().stderr)

    def test_hardlink_physical_missing_replacement_symlink_and_third_alias_rejected(self):
        file, peer = [self.root / x["path"] for x in self.hardlink_groups[0]]
        original = file.read_bytes()
        for kind in ("missing", "replacement", "symlink", "fifo", "external_third", "inside_third"):
            with self.subTest(kind=kind):
                extra = self.root / "external-third-link" if kind == "external_third" else file.parent / "unknown-third.json"
                if kind in ("missing", "replacement", "symlink", "fifo"):
                    file.unlink()
                    if kind == "replacement":
                        file.write_bytes(original)
                    elif kind == "symlink":
                        file.symlink_to(peer)
                    elif kind == "fifo":
                        os.mkfifo(file)
                else:
                    os.link(file, extra)
                self.reject()
                if kind in ("missing", "replacement", "symlink", "fifo"):
                    if kind != "missing":
                        file.unlink()
                    os.link(peer, file)
                else:
                    extra.unlink()
                self.rebind_hardlink_evidence(); self.write_manifest()

    def test_hardlink_unknown_new_group_keeps_general_nlink_one_guard(self):
        directory = self.root / "research/local-ai/runs/unapproved-hardlinks"
        directory.mkdir(parents=True)
        a, b = directory / "first.json", directory / "second.json"
        a.write_bytes(raw({"safe": True})); os.link(a, b)
        self.assertIn(b"Repair evidence must be a regular unaliased file", self.reject().stderr)
        self.assertEqual(a.stat().st_nlink, 2)

    def test_hardlink_group_vector_shape_identity_and_scope_guards(self):
        valid = copy.deepcopy(self.hardlinks_evidence)
        for kind in ("schema", "root", "group_count", "path_count", "partial_group", "duplicate_path",
                     "group_order", "path_order", "same_inode_groups", "different_peer_inode",
                     "nlink", "bytes", "sha", "mode", "ctime_type", "outside", "derived", "format_overlap"):
            with self.subTest(kind=kind):
                self.hardlinks_evidence = copy.deepcopy(valid); self.hardlink_groups = self.hardlinks_evidence["groups"]
                group = self.hardlink_groups[0]
                if kind in ("schema", "root"):
                    self.hardlinks_evidence[kind] = "unknown"
                elif kind == "group_count":
                    self.hardlinks_evidence["expected_group_count"] = 4
                elif kind == "path_count":
                    self.hardlinks_evidence["expected_path_count"] = 7
                elif kind == "partial_group":
                    group.pop()
                elif kind == "duplicate_path":
                    group[1]["path"] = group[0]["path"]
                elif kind == "group_order":
                    self.hardlink_groups.reverse()
                elif kind == "path_order":
                    group.reverse()
                elif kind == "same_inode_groups":
                    for entry in self.hardlink_groups[1]:
                        for key in ("device", "inode"):
                            entry[key] = group[0][key]
                elif kind == "different_peer_inode":
                    group[1]["inode"] = "0"
                elif kind in ("nlink", "bytes", "sha", "mode", "ctime_type"):
                    key, value = {"nlink": ("nlink", 3), "bytes": ("bytes", 1), "sha": ("sha256", "e" * 64),
                                  "mode": ("mode", 0o444), "ctime_type": ("ctime_ns", 0)}[kind]
                    for entry in group:
                        entry[key] = value
                else:
                    group[0]["path"] = {"outside": "outside/control.json",
                                        "derived": "research/local-ai/runs/copy/preview-workspace/control.json",
                                        "format_overlap": self.format_rows[0]["path"]}[kind]
                self.rebind_hardlink_evidence(refresh_metadata=False); self.write_manifest(); self.reject()

    def test_hardlink_decoded_and_previous_duplicate_escaped_targets_are_rejected(self):
        file = self.root / self.hardlink_groups[0][0]["path"]; original = file.read_bytes()
        for target in (self.rows[0]["sha256"], STORAGE.NATIVE_FIXTURE_PREFIX):
            for escaped in (False, True):
                for location in ("key", "value", "previous_duplicate"):
                    with self.subTest(target=target, escaped=escaped, location=location):
                        value = ('"' + "".join("\\u%04x" % ord(c) for c in target) + '"').encode() if escaped else json.dumps(target).encode()
                        data = (b"{" + value + b':"safe"}' if location == "key" else
                                b'{"x":' + value + (b',"x":"safe"}' if location == "previous_duplicate" else b"}"))
                        file.write_bytes(data); self.rebind_hardlink_evidence(); self.write_manifest()
                        self.assertIn(b"Operational native JSON refers to retired fixture", self.reject().stderr)
                        file.write_bytes(original); self.rebind_hardlink_evidence(); self.write_manifest()

    def test_hardlink_exception_never_admits_aliased_evidence_policy_lock_or_derived_proofs(self):
        files = [self.root / ".storage/policy.json", self.evidence_dir / "manifest.json", self.evidence_dir / "review.json",
                 self.root / STORAGE.NATIVE_FIXTURE_CHECKS, self.evidence_dir / "historical-reference-formats.json",
                 self.evidence_dir / "reference-hardlinks.json", self.root / self.format_rows[0]["path"]]
        for file in files:
            with self.subTest(path=str(file.relative_to(self.root))):
                alias = self.root / "protected-alias"; os.link(file, alias)
                self.assertIn(b"Repair evidence must be a regular unaliased file", self.reject().stderr)
                alias.unlink()
        entry = self.preserved_dead_locks(1)[0]
        alias = self.root / "protected-lock-alias"; os.link(self.root / entry["path"], alias)
        self.assertIn(b"Repair evidence must be a regular unaliased file", self.reject().stderr); alias.unlink()
        workspace = self.derived_preview()
        alias = self.root / "protected-state-alias"; os.link(workspace.parent / "preview/state.json", alias)
        self.assertIn(b"Repair evidence must be a regular unaliased file", self.reject().stderr)

    def test_hardlink_reader_checks_actual_pre_and_post_fstat_and_lstat_races(self):
        file, peer = [self.root / x["path"] for x in self.hardlink_groups[0]]
        original = file.read_bytes()
        for kind in ("before_open_replacement", "after_read_new_link", "after_read_write", "post_fstat_replacement"):
            with self.subTest(kind=kind):
                expected = copy.deepcopy(self.hardlink_groups[0][0]); extra = self.root / "race-extra"
                original_open, original_fstat, original_lstat = STORAGE.os.open, STORAGE.os.fstat, Path.lstat
                count = [0]
                def opened(path, flags, *args, **kwargs):
                    if str(path) == str(file):
                        file.unlink(); file.write_bytes(original)
                    return original_open(path, flags, *args, **kwargs)
                def stated(fd):
                    count[0] += 1
                    if count[0] == 2:
                        if kind == "after_read_new_link":
                            os.link(file, extra)
                        else:
                            file.write_bytes(original + b" ")
                    return original_fstat(fd)
                def lstated(path, *args, **kwargs):
                    if path == file:
                        count[0] += 1
                        if count[0] == 2:
                            file.unlink(); file.write_bytes(original)
                    return original_lstat(path, *args, **kwargs)
                patch = (mock.patch.object(STORAGE.os, "open", side_effect=opened) if kind == "before_open_replacement" else
                         mock.patch.object(Path, "lstat", new=lstated) if kind == "post_fstat_replacement" else
                         mock.patch.object(STORAGE.os, "fstat", side_effect=stated))
                with patch:
                    with self.assertRaisesRegex(ValueError, "hardlink identity changed"):
                        STORAGE._native_fixture_reference_hardlink_bytes(file, expected)
                if extra.exists():
                    extra.unlink()
                if file.stat().st_ino != peer.stat().st_ino:
                    file.unlink(); os.link(peer, file)
                file.write_bytes(original)
                self.rebind_hardlink_evidence(); self.write_manifest()

    def test_hardlink_census_rechecks_all_groups_after_late_alias_change(self):
        before = self.snapshot(); original_reader = STORAGE._native_fixture_reference_hardlink_bytes
        last = self.root / self.hardlink_groups[-1][-1]["path"]
        first = self.root / self.hardlink_groups[0][0]["path"]; extra = self.root / "late-census-alias"; changed = [False]
        def reader(file, entry):
            data = original_reader(file, entry)
            if file == last and not changed[0]:
                os.link(first, extra); changed[0] = True
            return data
        with mock.patch.object(STORAGE, "_native_fixture_reference_hardlink_bytes", side_effect=reader):
            with self.assertRaisesRegex(ValueError, "hardlink identity changed"):
                with STORAGE.exclusive(self.root):
                    STORAGE.repair_missing_native_fixture_records(self.root, self.params)
        self.assertTrue(changed[0]); self.assertEqual(self.snapshot(), before)
        self.assertFalse((self.root / ".storage/native-fixture-metadata-repairs" / self.operation).exists())

    def test_hardlink_precommit_alias_change_rolls_back_with_evidence_preserved(self):
        before = self.snapshot(); original_write = STORAGE.immutable_bytes
        first = self.root / self.hardlink_groups[0][0]["path"]; extra = self.root / "precommit-alias"
        def write(file, data):
            original_write(file, data)
            if file.name == "before.json":
                os.link(first, extra)
        with mock.patch.object(STORAGE, "immutable_bytes", side_effect=write):
            with self.assertRaisesRegex(ValueError, "hardlink identity changed"):
                with STORAGE.exclusive(self.root):
                    STORAGE.repair_missing_native_fixture_records(self.root, self.params)
        self.assertEqual(self.snapshot(), before)
        directory = self.root / ".storage/native-fixture-metadata-repairs" / self.operation
        self.assertTrue((directory / "before.json").exists()); self.assertFalse((directory / "receipt.json").exists())

    def test_hardlink_readback_rejects_third_link_and_restored_nlink_with_changed_ctime(self):
        result = self.cli(); self.assertEqual(result.returncode, 0, result.stderr)
        file = self.root / self.hardlink_groups[0][0]["path"]; extra = self.root / "readback-extra"
        os.link(file, extra); self.reject({**self.params, "readback_only": True}); extra.unlink()
        self.assertEqual(file.stat().st_nlink, 2)
        self.reject({**self.params, "readback_only": True})

    def preserved_dead_locks(self, count=5):
        entries = []
        for index in range(count):
            child = subprocess.Popen([sys.executable, "-c", "pass"])
            child.wait(timeout=10)
            name = "research/local-ai/locks/run-preserved-%d.json" % index
            file = self.root / name; file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(raw({"pid": child.pid, "owner": "isolated-test", "started_at": STORAGE.now()}))
            entries.append({"path": name, "sha256": sha(file.read_bytes()), "pid": child.pid, "probe": "ESRCH"})
        self.manifest["preserved_inactive_native_locks"] = entries
        self.write_manifest()
        return entries

    def test_five_exact_dead_native_locks_are_preserved_with_actual_ESRCH_and_readback(self):
        entries = self.preserved_dead_locks()
        original = {e["path"]: (self.root / e["path"]).read_bytes() for e in entries}
        result = self.cli(); self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(result.stdout)
        before = json.loads((self.root / value["before"]).read_bytes())
        self.assertFalse(before["native_fixture_evidence"]["historical_owner_termination_proven"])
        self.assertEqual(len(before["native_fixture_evidence"]["inactive_native_lock_audit"]), 5)
        for entry in entries:
            self.assertEqual((self.root / entry["path"]).read_bytes(), original[entry["path"]])
        readback = self.cli({**self.params, "readback_only": True})
        self.assertEqual(readback.returncode, 0, readback.stderr)
        for entry in entries:
            self.assertEqual((self.root / entry["path"]).read_bytes(), original[entry["path"]])

    def test_preserved_lock_set_changes_and_Q0_omission_fail_closed(self):
        entries = self.preserved_dead_locks(1)
        valid = copy.deepcopy(self.manifest)
        self.review.pop("preserved_inactive_native_locks_sha256"); self.write_review(); self.reject()
        self.manifest = copy.deepcopy(valid); self.write_manifest()
        lock = self.root / entries[0]["path"]; data = lock.read_bytes(); lock.write_bytes(data + b" ")
        self.reject(); lock.write_bytes(data)
        extra = lock.parent / "new-dead.json"; extra.write_bytes(data); self.reject(); extra.unlink()
        self.manifest["preserved_inactive_native_locks"][0]["pid"] += 1
        self.write_manifest(); self.reject()

    def test_Q0_listed_live_or_unknown_Native_owner_is_never_ignored(self):
        entry = self.preserved_dead_locks(1)[0]
        child = self.helper("unrelated-argv")
        file = self.root / entry["path"]; file.write_bytes(raw({"pid": child.pid}))
        self.manifest["preserved_inactive_native_locks"][0].update(pid=child.pid, sha256=sha(file.read_bytes()))
        self.write_manifest(); self.reject()

    def derived_preview(self, run="preview-run"):
        directory = self.root / "research/local-ai/runs" / run
        workspace = directory / "preview-workspace"; workspace.mkdir(parents=True)
        controls = directory / "preview"; controls.mkdir()
        result = {"editions": [], "knowledge": [], "source_files": []}
        result_file = controls / "workspace.json"; result_file.write_bytes(raw(result))
        state = {"schema": "research-run/v1", "run_id": run, "stages": {"workspace": {
            "status": "complete", "result_path": "runs/" + run + "/preview/workspace.json",
            "result_hash": sha(json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode())}}}
        state_file = controls / "state.json"; state_file.write_bytes(raw(state))
        self.manifest["derived_preview_workspaces"].append({"path": str(workspace.relative_to(self.root)),
            "state": {"path": str(state_file.relative_to(self.root)), "sha256": sha(state_file.read_bytes())},
            "workspace_result": {"path": str(result_file.relative_to(self.root)), "sha256": sha(result_file.read_bytes())}})
        self.manifest["derived_preview_workspaces"].sort(key=lambda x: x["path"])
        self.write_manifest()
        return workspace

    def test_preserved_owner_EPERM_and_ESRCH_ps_contradiction_are_not_accepted(self):
        entry = self.preserved_dead_locks(1)[0]
        before = self.snapshot()
        with mock.patch.object(STORAGE.os, "kill", side_effect=PermissionError("denied")):
            with self.assertRaisesRegex(ValueError, "visibility unknown"):
                with STORAGE.exclusive(self.root):
                    STORAGE.repair_missing_native_fixture_records(self.root, self.params)
        self.assertEqual(self.snapshot(), before)
        child = self.helper("visible-Native-owner")
        file = self.root / entry["path"]; file.write_bytes(raw({"pid": child.pid}))
        self.manifest["preserved_inactive_native_locks"][0].update(pid=child.pid, sha256=sha(file.read_bytes()))
        self.write_manifest()
        with mock.patch.object(STORAGE.os, "kill", side_effect=ProcessLookupError("fault injected ESRCH")):
            with self.assertRaisesRegex(ValueError, "visible despite ESRCH"):
                with STORAGE.exclusive(self.root):
                    STORAGE.repair_missing_native_fixture_records(self.root, self.params)
        self.assertEqual(self.snapshot(), before)

    def test_only_derived_preview_code_copies_are_excluded_from_reference_census(self):
        workspace = self.derived_preview()
        dependencies = self.root / "derived-dependencies"; dependencies.mkdir()
        (workspace / "node_modules").symlink_to(dependencies, target_is_directory=True)
        (workspace / "package.json").write_bytes(raw({"copied_fixture_text": self.rows[0]["sha256"]}))
        cold = "research/local-ai/runs/preview-run/preview-workspace/old-copy.json"
        self.db.execute("INSERT INTO files VALUES(?,?,?,?,?,?,?)", (cold, "d" * 64, 123, 384, "1", None, None))
        self.db.commit(); self.bind_counts(); self.write_manifest()
        result = self.cli(); self.assertEqual(result.returncode, 0, result.stderr)
        before = json.loads((self.root / json.loads(result.stdout)["before"]).read_bytes())
        census = before["native_fixture_evidence"]["operational_reference_audit"][0]
        self.assertEqual(census["derived_preview_workspaces"], [str(workspace.relative_to(self.root))])
        self.assertTrue((workspace / "node_modules").is_symlink())
        self.assertTrue((workspace.parent / "preview/state.json").is_file())
        self.assertTrue(self.db.execute("SELECT 1 FROM files WHERE path=?", (cold,)).fetchone())

    def test_genuine_outer_Native_control_is_protected_even_beside_derived_preview(self):
        workspace = self.derived_preview()
        control = workspace.parent / "preview-manifest.json"
        control.write_bytes(raw({"reference": self.rows[0]["sha256"]}))
        self.reject()
        control.write_bytes(raw({"workspace": "runs/preview-run/preview-workspace"}))
        (workspace / "node_modules").symlink_to(self.root, target_is_directory=True)
        (workspace.parent / "unknown-control-link").symlink_to(self.root, target_is_directory=True)
        self.reject()

    def test_preview_named_genuine_control_tree_and_workspace_root_alias_not_skipped(self):
        genuine = self.root / "research/local-ai/reasoning-tasks/preview-workspace"; genuine.mkdir(parents=True)
        (genuine / "request.json").write_bytes(raw({"reference": self.rows[0]["sha256"]}))
        self.reject()
        (genuine / "request.json").unlink(); genuine.rmdir()
        run = self.root / "research/local-ai/runs/preview-run"; run.mkdir(parents=True)
        (run / "preview-workspace").symlink_to(self.root, target_is_directory=True)
        self.reject()

    def test_unapproved_new_or_tampered_derived_scope_and_Q0_policy_fail_closed(self):
        workspace = self.derived_preview()
        valid = copy.deepcopy(self.manifest)
        self.review.pop("derived_preview_workspaces_sha256"); self.write_review(); self.reject()
        self.manifest = copy.deepcopy(valid); self.write_manifest()
        (workspace.parent.parent / "new-preview/preview-workspace").mkdir(parents=True)
        self.reject()
        (workspace.parent.parent / "new-preview/preview-workspace").rmdir()
        state_file = workspace.parent / "preview/state.json"
        state_file.write_bytes(state_file.read_bytes() + b" "); self.reject()
        self.manifest["derived_preview_workspaces"][0]["state"]["sha256"] = sha(state_file.read_bytes())
        state = json.loads(state_file.read_bytes()); state["run_id"] = "tampered"; state_file.write_bytes(raw(state))
        self.manifest["derived_preview_workspaces"][0]["state"]["sha256"] = sha(state_file.read_bytes())
        self.write_manifest(); self.reject()

    def test_old_mcp_action_does_not_admit_new_cohort(self):
        # Use the valid OLD envelope, so this proves its target boundary rather
        # than merely rejecting the new action's different manifest schema.
        self.manifest["schema"] = "research-missing-fixture-repair/v1"
        self.manifest["owners"] = [{"scope": s, "identity": "owner_identity_unavailable"}
                                   for s in sorted({r["path"].split("/tmp/")[0] + "/tmp/" + r["path"].split("/tmp/")[1].split("/")[0] for r in self.rows})]
        self.write_manifest()
        result = self.reject(action="repair-missing-fixture-records")
        self.assertIn(b"Repair is limited to exact deleted MCP fixture result metadata", result.stderr)

    def test_unmodified_production_CLI_rejects_synthetic_constants_and_ignores_env_override(self):
        before = self.snapshot()
        result = self.cli(unmodified=True, env={**os.environ, **self.synthetic_constants})
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(b"Only the exact frozen299/99 native fixture rowset is admitted", result.stderr)
        self.assertEqual(self.snapshot(), before)

    def test_MCP_storage_contract_cannot_select_new_direct_CLI_action(self):
        program = """import assert from 'node:assert/strict';
import {moduleCatalog,executeModule} from './scripts/research/module-registry.mjs';
const contract=moduleCatalog(['collection']).modules[0].operations.find(x=>x.id==='storage');
assert(!contract.inputSchema.properties.action.enum.includes('repair-missing-native-fixture-records'));
await assert.rejects(()=>executeModule({},'collection','storage',{action:'repair-missing-native-fixture-records'}),/action|enum|allowed/);
"""
        result = subprocess.run(["node", "--input-type=module", "-e", program], cwd=REPO,
                                capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_altered_subset_row_hash_path_or_count_cannot_be_reapproved(self):
        original = copy.deepcopy(self.manifest)
        for kind in ("subset", "hash", "path", "count"):
            with self.subTest(kind=kind):
                self.manifest = copy.deepcopy(original)
                if kind == "subset":
                    self.manifest["rows"] = self.manifest["rows"][:-1]
                elif kind == "hash":
                    self.manifest["rows"][0]["sha256"] = "e" * 64
                elif kind == "path":
                    self.manifest["rows"][0]["path"] = "research/local-ai/documents/missing/body.bin"
                else:
                    self.manifest["expected_count"] = 298
                self.manifest["rowset_sha256"] = sha(raw(self.manifest["rows"]))
                self.write_manifest()
                self.reject()

    def test_wrong_root_policy_schema_or_catalog_count(self):
        for field, value in (("root", "/wrong"), ("policy_sha256", "f" * 64), ("schema_sha256", "f" * 64), ("expected_counts", {"files": 999, "objects": 1, "bundles": 1, "requests": 1})):
            with self.subTest(field=field):
                old = self.manifest[field]
                self.manifest[field] = value
                self.write_manifest()
                self.reject()
                self.manifest[field] = old

    def test_Q0_review_must_bind_source_manifest_root_and_owner_limit(self):
        valid = copy.deepcopy(self.review)
        for field, value in (("reviewer", "D3"), ("operation_id", "f" * 32), ("decision", "accept"), ("source_sha256", "f" * 64), ("root", "/wrong"), ("manifest", {}), ("historical_owner_termination_proven", True), ("accept_absent_scopes_and_fresh_process_visibility", False)):
            with self.subTest(field=field):
                self.review = {**valid, field: value}
                self.write_review()
                self.reject()

    def test_unknown_or_unpinned_evidence_and_historical_log_tamper(self):
        path = self.evidence_dir / "rowset.json"
        old = path.read_bytes()
        path.write_bytes(old + b" ")
        self.reject()
        path.write_bytes(old)
        recovery = self.evidence_dir / "recovery-result.json"
        previous = recovery.read_bytes(); recovery.write_bytes(previous + b" ")
        self.reject(); recovery.write_bytes(previous)
        log = (self.root / STORAGE.NATIVE_FIXTURE_CHECKS).parent / "synthetic-after.log"
        log.write_bytes(log.read_bytes() + b"tampered")
        self.reject()

    def test_existing_scope_or_payload_is_never_removed(self):
        target = self.root / self.rows[0]["path"]
        target.parent.mkdir(parents=True)
        target.write_bytes(b"do not remove")
        self.reject()
        self.assertEqual(target.read_bytes(), b"do not remove")

    def test_new_tmp_scope_and_unknown_owner_native_lock_fail_closed(self):
        tmp = self.root / STORAGE.NATIVE_FIXTURE_PREFIX / "late-writer"
        tmp.mkdir(parents=True); self.reject(); tmp.rmdir()
        lock = self.root / "research/local-ai/locks/unknown.json"
        lock.parent.mkdir(parents=True); lock.write_bytes(raw({"state": "unknown-owner"}))
        self.reject()

    def test_objects_requests_and_unrelated_same_content_reference_block_retirement(self):
        self.db.execute("INSERT INTO objects VALUES(?,?,?,?)", (self.rows[0]["sha256"], self.rows[0]["bytes"], "real-bundle", "test"))
        self.db.commit()
        self.bind_counts(); self.write_manifest(); self.reject()
        self.db.execute("DELETE FROM objects WHERE sha256=?", (self.rows[0]["sha256"],))
        self.db.execute("INSERT INTO requests VALUES(?,?,?,?,?,?)", ("target-ref", "different-path", self.rows[0]["sha256"], "real-bundle", "now", "pending"))
        self.db.commit()
        self.bind_counts(); self.write_manifest(); self.reject()
        self.db.execute("DELETE FROM requests WHERE id='target-ref'")
        r = self.rows[0]
        self.db.execute("INSERT INTO files VALUES(?,?,?,?,?,?,?)", ("research/local-ai/documents/extra/body.bin", r["sha256"], r["bytes"], 384, "1", None, None))
        self.db.commit()
        self.bind_counts(); self.write_manifest(); self.reject()

    def test_operational_native_JSON_reference_or_unavailable_control_is_rejected(self):
        for value in (self.rows[0]["sha256"], STORAGE.NATIVE_FIXTURE_PREFIX):
            with self.subTest(value=value):
                self.control.write_bytes(raw({"reference": value}))
                self.reject()
        self.control.write_bytes(self.control_bytes)
        self.db.execute("INSERT INTO files VALUES(?,?,?,?,?,?,?)", ("research/local-ai/runs/real/missing.json", "d" * 64, 123, 384, "1", None, None))
        self.db.commit()
        self.bind_counts(); self.write_manifest(); self.reject()

    def test_unapproved_empty_stream_or_literal_tail_JSON_controls_fail_closed(self):
        # These byte shapes require a reviewed producer contract, not a fallback.
        for data in (b"", b'{"checkpoint":1}\n{"complete":true}\n',
                     b'{"schema":"synthetic-release-review"}\\n'):
            with self.subTest(data=data):
                self.control.write_bytes(data)
                self.reject()
                self.assertFalse((self.root / ".storage/native-fixture-metadata-repairs" / self.operation).exists())

    def test_mutation_lock_and_active_native_lock_are_not_recovered(self):
        lock = self.root / ".storage/mutation.lock"
        data = raw({"pid": os.getpid(), "started_at": STORAGE.now()})
        lock.write_bytes(data); self.reject(); self.assertEqual(lock.read_bytes(), data); lock.unlink()
        native_lock = self.root / "research/local-ai/locks/run-actual.json"
        native_lock.parent.mkdir(parents=True)
        native_lock.write_bytes(data); self.reject(); self.assertEqual(native_lock.read_bytes(), data)

    def test_actual_scope_writer_and_failed_ps_visibility_block(self):
        child = self.helper(str(self.root / STORAGE.NATIVE_FIXTURE_PREFIX))
        self.assertIsNone(child.poll())
        self.reject()
        child.terminate(); child.wait(timeout=10)
        directory = self.root / "failed-ps"; directory.mkdir()
        executable = directory / "ps"; executable.write_text("#!/bin/sh\nexit 77\n"); executable.chmod(0o700)
        self.reject(env={**os.environ, "PATH": str(directory) + os.pathsep + os.environ.get("PATH", "")})

    def test_catalog_evidence_aliases_and_symlinks_block(self):
        manifest_path = self.evidence_dir / "manifest.json"
        link = self.evidence_dir / "alias.json"; os.link(manifest_path, link)
        self.reject(); link.unlink()
        db_path = self.root / ".storage/catalog.sqlite"
        alias = self.root / "db-alias"; os.link(db_path, alias)
        self.reject(); alias.unlink()
        self.control.unlink(); self.control.symlink_to(self.original)
        self.reject()

    def test_trigger_changing_unrelated_values_rolls_back_and_consumes_attempt(self):
        self.db.execute("CREATE TRIGGER change_unrelated AFTER DELETE ON files BEGIN UPDATE extension SET value='corrupt'; END")
        self.db.commit(); self.bind_counts(); self.write_manifest()
        result = self.reject()
        self.assertIn(b"unrelated catalog values", result.stderr)
        self.assertTrue((self.root / ".storage/native-fixture-metadata-repairs" / self.operation / "before.json").exists())
        self.reject()
        self.reject({**self.params, "readback_only": True})

    def test_commit_marker_trigger_cannot_modify_unrelated_catalog(self):
        self.db.execute("CREATE TRIGGER marker_changes_unrelated AFTER INSERT ON meta BEGIN UPDATE extension SET value='corrupt'; END")
        self.db.commit(); self.bind_counts(); self.write_manifest()
        result = self.reject()
        self.assertIn(b"Commit marker trigger changed unrelated", result.stderr)

    def test_fresh_operation_id_needs_new_manifest_and_Q0_review(self):
        self.reject({**self.params, "operation_id": "f" * 32})

    def test_fifo_evidence_is_rejected_without_blocking(self):
        path = self.evidence_dir / "rowset.json"
        path.unlink(); os.mkfifo(path)
        self.reject()

    def test_trigger_cannot_change_SQLite_sequence_internal_persistence(self):
        self.db.execute("CREATE TABLE automatic_history(id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT)")
        self.db.execute("INSERT INTO automatic_history(value) VALUES('preserve')")
        self.db.execute("CREATE TRIGGER alter_internal AFTER DELETE ON files BEGIN INSERT INTO automatic_history(value) VALUES('transient'); DELETE FROM automatic_history WHERE value='transient'; END")
        self.db.commit(); self.bind_counts(); self.write_manifest()
        sequence = self.db.execute("SELECT seq FROM sqlite_sequence WHERE name='automatic_history'").fetchone()[0]
        result = self.reject()
        self.assertIn(b"unrelated catalog values", result.stderr)
        self.assertEqual(self.db.execute("SELECT seq FROM sqlite_sequence WHERE name='automatic_history'").fetchone()[0], sequence)

    def test_trigger_cannot_delete_own_committed_marker_or_create_success_receipt(self):
        self.db.execute("CREATE TRIGGER remove_own_marker AFTER INSERT ON meta BEGIN DELETE FROM meta WHERE key=NEW.key; END")
        self.db.commit(); self.bind_counts(); self.write_manifest()
        self.reject()
        self.assertEqual(self.snapshot(), self.initial)
        self.assertFalse((self.root / '.storage/native-fixture-metadata-repairs' / self.operation / 'receipt.json').exists())
        self.reject({**self.params, 'readback_only': True})

    def test_trigger_cannot_change_own_committed_marker_value(self):
        self.db.execute("CREATE TRIGGER change_own_marker AFTER INSERT ON meta BEGIN UPDATE meta SET value='{}' WHERE key=NEW.key; END")
        self.db.commit(); self.bind_counts(); self.write_manifest()
        self.reject()
        self.assertEqual(self.snapshot(), self.initial)

    def interrupt(self, filename):
        wrapper = self.root / "interrupt.py"
        wrapper.write_text("""import importlib.util,json,os,signal,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('storage',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
for name,value in json.loads(Path(sys.argv[5]).read_text()).items():setattr(m,name,value)\nroot=Path(sys.argv[2]);p=json.loads(Path(sys.argv[3]).read_text());original=m.immutable_bytes
def boundary(path,data):
    if path.name==sys.argv[4] and path.name=='receipt.json':os.kill(os.getpid(),signal.SIGKILL)
    original(path,data)
    if path.name==sys.argv[4]:os.kill(os.getpid(),signal.SIGKILL)
m.immutable_bytes=boundary
with m.exclusive(root):m.repair_missing_native_fixture_records(root,p)
""")
        parameters = self.root / "interrupt-input.json"; parameters.write_bytes(raw(self.params))
        child = subprocess.run([sys.executable, str(wrapper), str(RUNNER), str(self.root), str(parameters), filename, str(self.constant_input)], capture_output=True, timeout=40)
        self.assertEqual(child.returncode, -signal.SIGKILL, child.stderr)
        lock = self.root / ".storage/mutation.lock"
        record = json.loads(lock.read_bytes())
        result = self.cli({"expected_root": str(self.root), "expected_pid": record["pid"],
                           "expected_lock_sha256": sha(lock.read_bytes()), "operator": "isolated-regression",
                           "reason": "The exact test child was observed terminated"}, action="recover-mutation-lock")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_kill_before_commit_preserves_rows_and_refuses_replay(self):
        self.interrupt("before.json")
        self.assertEqual(self.snapshot(), self.initial)
        self.reject()
        self.reject({**self.params, "readback_only": True})

    def test_commit_then_kill_before_receipt_explicit_readback_without_second_delete(self):
        self.interrupt("receipt.json")
        self.assertEqual(len(self.snapshot()["files"]), 1)
        self.reject()
        result = self.cli({**self.params, "readback_only": True})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["commit_marker"]["deleted"], 299)

    def test_readback_fails_closed_on_unrelated_catalog_or_native_census_change(self):
        result = self.cli(); self.assertEqual(result.returncode, 0, result.stderr)
        self.control.write_bytes(raw({"new": "unrelated control changed after commit"}))
        self.reject({**self.params, "readback_only": True})
        self.control.write_bytes(self.control_bytes)
        self.db.execute("UPDATE extension SET value='later change'"); self.db.commit()
        self.reject({**self.params, "readback_only": True})


if __name__ == "__main__":
    unittest.main()
