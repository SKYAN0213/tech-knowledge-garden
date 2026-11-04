import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile


SOURCE = Path(__file__).resolve().parents[1] / "scripts/research/cold-storage.py"
spec = importlib.util.spec_from_file_location("tkg_storage_capacity", SOURCE)
storage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storage)


class StorageCapacityPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="tkg-storage-capacity-")
        self.root = Path(self.temp.name).resolve()
        self.db = storage.connect(self.root)
        storage.initialize(self.root, {"enabled": True, "cache_bytes": 32 * 1024 ** 3})

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def cache(self, rel, data, verified=True):
        target = self.root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        st = target.stat()
        digest = storage.digest_file(target)
        bundle = "cache-" + digest
        self.db.execute("INSERT INTO bundles(id,kind,sha256,bytes,verified_at) VALUES(?,?,?,?,?)",
                        (bundle, "raw", digest, len(data), storage.now() if verified else None))
        self.db.execute("INSERT INTO objects(sha256,bytes,bundle_id,member) VALUES(?,?,?,?)",
                        (digest, len(data), bundle, None))
        self.db.execute("INSERT INTO files VALUES(?,?,?,?,?,?,?)",
                        (rel, digest, len(data), 0o600, str(st.st_mtime_ns), None, storage.now()))
        self.db.commit()
        return target

    def downloadable(self, rel, data):
        archive = self.root / "package.zip"
        with zipfile.ZipFile(archive, "w") as z:
            z.writestr("member.bin", data)
        payload_digest = storage.hashlib.sha256(data).hexdigest()
        self.db.execute("INSERT INTO bundles(id,kind,sha256,bytes,verified_at) VALUES(?,?,?,?,?)",
                        ("download", "zip", storage.digest_file(archive), archive.stat().st_size, storage.now()))
        self.db.execute("INSERT INTO objects(sha256,bytes,bundle_id,member) VALUES(?,?,?,?)",
                        (payload_digest, len(data), "download", "member.bin"))
        self.db.execute("INSERT INTO files VALUES(?,?,?,?,?,?,?)",
                        (rel, payload_digest, len(data), 0o600, "0", None, None))
        self.db.commit()
        bundle = self.db.execute("SELECT * FROM bundles WHERE id='download'").fetchone()
        return bundle, {"bundle_id": "download", "download_path": "package.zip", "paths": [rel]}

    def test_free_space_unknown_never_skips_a_due_sweep(self):
        with patch.object(storage, "volume_free_bytes", return_value=None), \
             patch.object(storage, "evict", wraps=storage.evict) as sweep:
            result = storage.automatic_evict(self.root, self.db, {})
            self.assertEqual(result["status"], "blocked")
            self.assertEqual(result["reason"], "free_space_unknown")
            self.assertIsNone(result["free_bytes"])
            self.assertEqual(sweep.call_count, 1)
            storage.automatic_evict(self.root, self.db, {})
            self.assertEqual(sweep.call_count, 2)

    def test_explicit_initialization_fills_legacy_defaults_without_changing_a_configured_limit(self):
        policy_file = self.root / ".storage/policy.json"
        policy_file.write_text(json.dumps({"schema": storage.SCHEMA, "root": str(self.root), "enabled": False}))
        configured = storage.initialize(self.root, {})
        self.assertEqual(configured["cache_bytes"], 2 * 1024 ** 3)
        self.assertEqual(configured["minimum_payload_bytes"], 32768)
        configured = storage.initialize(self.root, {"cache_bytes": 32 * 1024 ** 3})
        self.assertEqual(storage.initialize(self.root, {})["cache_bytes"], 32 * 1024 ** 3)

    def test_low_space_sweep_only_removes_verified_payloads(self):
        verified = self.cache("research/local-ai/a/body.bin", b"verified bytes")
        unverified = self.cache("research/local-ai/b/body.bin", b"unverified bytes", False)
        with patch.object(storage, "volume_free_bytes", side_effect=[storage.CACHE_FREE_RESERVE_BYTES - 3,
                                                                      storage.CACHE_FREE_RESERVE_BYTES + 1]):
            result = storage.automatic_evict(self.root, self.db, {})
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["reason"], "low_free_space")
        self.assertFalse(verified.exists())
        self.assertEqual(unverified.read_bytes(), b"unverified bytes")

    def test_hydration_releases_only_verified_other_cache_before_restoring(self):
        old = self.cache("research/local-ai/a/body.bin", b"old!")
        unverified = self.cache("research/local-ai/b/body.bin", b"xx", False)
        storage.initialize(self.root, {"cache_bytes": 6})
        bundle, request = self.downloadable("research/local-ai/c/body.bin", b"new!")
        with patch.object(storage, "volume_free_bytes", return_value=storage.CACHE_FREE_RESERVE_BYTES + 100):
            result = storage.hydrate(self.root, self.db, request)
        self.assertEqual(result["restored"], 1)
        self.assertFalse(old.exists())
        self.assertEqual(unverified.read_bytes(), b"xx")
        self.assertEqual((self.root / request["paths"][0]).read_bytes(), b"new!")
        self.assertEqual(storage.cached_bytes_estimate(self.db), 6)

    def test_hydration_with_low_space_and_live_lock_preserves_inputs(self):
        old = self.cache("research/local-ai/a/body.bin", b"old!")
        bundle, request = self.downloadable("research/local-ai/c/body.bin", b"new!")
        lock = self.root / "research/local-ai/locks/source-live.json"
        lock.parent.mkdir(parents=True)
        lock.write_text(json.dumps({"pid": os.getpid()}))
        with patch.object(storage, "volume_free_bytes", return_value=storage.CACHE_FREE_RESERVE_BYTES - 1):
            with self.assertRaises(storage.StorageCapacityError) as raised:
                storage.hydrate(self.root, self.db, request)
        self.assertEqual(raised.exception.storage_code, "STORAGE_CAPACITY_LOCKED")
        self.assertIn("active native locks", str(raised.exception))
        need = raised.exception.capacity_need
        self.assertEqual(need["schema"], "research-storage-capacity-need/v1")
        self.assertEqual(need["root"], str(self.root))
        self.assertEqual(need["bundle_id"], "download")
        self.assertEqual(need["paths"], request["paths"])
        self.assertEqual(need["required_free_bytes"], storage.CACHE_FREE_RESERVE_BYTES + len(b"new!"))
        self.assertEqual(need["additional_cache_bytes"], len(b"new!"))
        self.assertEqual(old.read_bytes(), b"old!")
        self.assertFalse((self.root / request["paths"][0]).exists())
        self.assertEqual(storage.digest_file(self.root / request["download_path"]), bundle["sha256"])

    def test_hydration_rejects_unknown_free_space_before_writing(self):
        bundle, request = self.downloadable("research/local-ai/c/body.bin", b"new!")
        with patch.object(storage, "volume_free_bytes", return_value=None):
            with self.assertRaises(storage.StorageCapacityError) as raised:
                storage.hydrate(self.root, self.db, request)
        self.assertEqual(raised.exception.storage_code, "STORAGE_CAPACITY_UNKNOWN")
        self.assertFalse((self.root / request["paths"][0]).exists())
        self.assertEqual(storage.digest_file(self.root / request["download_path"]), bundle["sha256"])

    def test_overlarge_hydration_does_not_evict_other_verified_payloads(self):
        old = self.cache("research/local-ai/a/body.bin", b"old!")
        storage.initialize(self.root, {"cache_bytes": 3})
        bundle, request = self.downloadable("research/local-ai/c/body.bin", b"new!")
        with patch.object(storage, "volume_free_bytes", return_value=storage.CACHE_FREE_RESERVE_BYTES + 100):
            with self.assertRaises(storage.StorageCapacityError) as raised:
                storage.hydrate(self.root, self.db, request)
        self.assertIn("batch exceeds", str(raised.exception))
        self.assertEqual(old.read_bytes(), b"old!")
        self.assertFalse((self.root / request["paths"][0]).exists())

    def test_edited_hydration_target_stops_before_evicting_other_payloads(self):
        old = self.cache("research/local-ai/a/body.bin", b"old!")
        bundle, request = self.downloadable("research/local-ai/c/body.bin", b"new!")
        target = self.root / request["paths"][0]
        target.parent.mkdir(parents=True)
        target.write_bytes(b"local correction")
        with patch.object(storage, "volume_free_bytes", return_value=storage.CACHE_FREE_RESERVE_BYTES - 1):
            with self.assertRaisesRegex(ValueError, "Preserve changed local payload"):
                storage.hydrate(self.root, self.db, request)
        self.assertEqual(old.read_bytes(), b"old!")
        self.assertEqual(target.read_bytes(), b"local correction")

    def test_requested_existing_payload_is_protected_during_capacity_eviction(self):
        old = self.cache("research/local-ai/a/body.bin", b"old!")
        bundle, request = self.downloadable("research/local-ai/c/body.bin", b"new!")
        target = self.root / request["paths"][0]
        target.parent.mkdir(parents=True)
        target.write_bytes(b"new!")
        self.db.execute("UPDATE files SET cached_at=?,mtime_ns=? WHERE path=?",
                        (storage.now(), str(target.stat().st_mtime_ns), request["paths"][0]))
        self.db.commit()
        with patch.object(storage, "volume_free_bytes", side_effect=[storage.CACHE_FREE_RESERVE_BYTES - 1,
                                                                      storage.CACHE_FREE_RESERVE_BYTES + 100]):
            result = storage.hydrate(self.root, self.db, request)
        self.assertEqual(result["restored"], 1)
        self.assertFalse(old.exists())
        self.assertEqual(target.read_bytes(), b"new!")

    def test_capacity_that_remains_low_is_reported_blocked(self):
        self.cache("research/local-ai/a/body.bin", b"unverified", False)
        with patch.object(storage, "volume_free_bytes", return_value=storage.CACHE_FREE_RESERVE_BYTES - 1):
            result = storage.automatic_evict(self.root, self.db, {})
        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["reason"], "insufficient_capacity")
        self.assertTrue((self.root / "research/local-ai/a/body.bin").exists())

    def test_unverified_cache_over_quota_is_reported_blocked(self):
        self.cache("research/local-ai/a/body.bin", b"unverified", False)
        storage.initialize(self.root, {"cache_bytes": 5})
        with patch.object(storage, "volume_free_bytes", return_value=storage.CACHE_FREE_RESERVE_BYTES + 100):
            result = storage.automatic_evict(self.root, self.db, {})
        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["reason"], "cache_limit_unresolved")
        self.assertEqual(result["cache_bytes_after"], len(b"unverified"))
        self.assertTrue((self.root / "research/local-ai/a/body.bin").exists())

    def test_capacity_recheck_requires_reserve_plus_exact_remaining_hydration_bytes(self):
        bundle, request = self.downloadable("research/local-ai/c/body.bin", b"new!")
        need = storage.hydration_need(self.root, bundle, request["paths"], 32 * 1024 ** 3, 4, 4, 4)
        # The saved number is only evidence: current bundle paths are re-read.
        need["required_free_bytes"] = storage.CACHE_FREE_RESERVE_BYTES
        with patch.object(storage, "volume_free_bytes", return_value=storage.CACHE_FREE_RESERVE_BYTES + 3):
            blocked = storage.automatic_evict(self.root, self.db, {"capacity_need": need})
        self.assertEqual(blocked["status"], "blocked")
        self.assertEqual(blocked["required_free_bytes"], storage.CACHE_FREE_RESERVE_BYTES + 4)
        self.assertEqual(blocked["additional_cache_bytes"], 4)
        self.assertFalse((self.root / request["paths"][0]).exists())
        with patch.object(storage, "volume_free_bytes", return_value=storage.CACHE_FREE_RESERVE_BYTES + 4):
            ready = storage.automatic_evict(self.root, self.db, {"capacity_need": need})
        self.assertIn(ready["status"], ("skipped", "completed"))
        self.assertEqual(ready["required_free_bytes"], storage.CACHE_FREE_RESERVE_BYTES + 4)
        self.assertEqual(ready["additional_cache_bytes"], 4)

    def test_capacity_recheck_evicts_to_leave_space_for_new_cache(self):
        old = self.cache("research/local-ai/a/body.bin", b"old!")
        storage.initialize(self.root, {"cache_bytes": 6})
        bundle, request = self.downloadable("research/local-ai/c/body.bin", b"new!")
        need = storage.hydration_need(self.root, bundle, request["paths"], 6, 4, 4, 4)
        with patch.object(storage, "volume_free_bytes", return_value=storage.CACHE_FREE_RESERVE_BYTES + 100):
            result = storage.automatic_evict(self.root, self.db, {"capacity_need": need})
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["cache_bytes_after"], 0)
        self.assertEqual(result["additional_cache_bytes"], 4)
        self.assertEqual(result["cache_limit_bytes"], 6)
        self.assertFalse(old.exists())

    def test_capacity_recheck_rejects_changed_root_bundle_paths_and_policy(self):
        old = self.cache("research/local-ai/a/body.bin", b"old!")
        bundle, request = self.downloadable("research/local-ai/c/body.bin", b"new!")
        need = storage.hydration_need(self.root, bundle, request["paths"], 32 * 1024 ** 3, 4, 4, 4)
        for changed in [{**need, "root": str(self.root.parent)}, {**need, "bundle_id": "other"},
                        {**need, "paths": request["paths"] * 2}, {**need, "paths": ["../other"]},
                        {**need, "cache_limit_bytes": 1}]:
            with self.subTest(changed=changed):
                with self.assertRaises(ValueError):
                    storage.automatic_evict(self.root, self.db, {"capacity_need": changed})
                self.assertEqual(old.read_bytes(), b"old!")


if __name__ == "__main__":
    unittest.main()
