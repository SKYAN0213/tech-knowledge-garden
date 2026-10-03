import copy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('build_connector_snapshot', ROOT / 'scripts/build-connector-snapshot.py')
snapshot_builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(snapshot_builder)
DRIVE_SPEC = importlib.util.spec_from_file_location('pull_drive', ROOT / 'scripts/pull-drive.py')
pull_drive = importlib.util.module_from_spec(DRIVE_SPEC)
DRIVE_SPEC.loader.exec_module(pull_drive)


def fixture(repository, now):
    folders = [
        {'path': 'Editions/2026', 'id': 'year-id', 'parent_ids': [snapshot_builder.ROOT_IDS[0][1]]},
        {'path': 'Editions/2026/09', 'id': 'month-id', 'parent_ids': ['year-id']},
    ]
    parents = {
        'Editions/2026/09/issue.md': 'month-id',
        'Knowledge/concept.md': snapshot_builder.ROOT_IDS[1][1],
        'Signals/review.md': snapshot_builder.ROOT_IDS[2][1],
        'TrendTopics/topic.md': snapshot_builder.ROOT_IDS[3][1],
    }
    files = []
    for name, parent in parents.items():
        body = ('# ' + name + '\n한글 근거\n').encode('utf-8')
        target = repository / 'vault' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(body)
        files.append({'path': name, 'file_id': 'file-' + str(len(files)),
                      'parent_ids': [parent], 'size': len(body),
                      'modified_time': now.isoformat(),
                      'sha256': hashlib.sha256(body).hexdigest()})
    return {
        'schema': 'tech-drive-connector-readback/v1',
        'root_folder_id': snapshot_builder.ROOT_ID,
        'roots': [{'name': name, 'id': file_id} for name, file_id in snapshot_builder.ROOT_IDS],
        'verified_at': now.isoformat(),
        'folders': folders,
        'files': files,
    }


class ConnectorSnapshotTests(unittest.TestCase):
    def test_exact_readback_builds_a_pull_drive_snapshot_even_if_folders_are_reordered(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = Path(tmp)
            now = datetime(2026, 9, 29, 4, tzinfo=timezone.utc)
            receipt = fixture(repository, now)
            receipt['folders'].reverse()
            raw = json.dumps(receipt).encode('utf-8')
            snapshot = snapshot_builder.build_snapshot(receipt, repository, raw, now=now)
            self.assertEqual(snapshot['transport'], 'codex-drive-connector')
            self.assertEqual(snapshot['readback']['receipt_sha256'], hashlib.sha256(raw).hexdigest())
            self.assertEqual(len(snapshot['files']), 4)
            self.assertEqual(len(pull_drive.validate(snapshot)), 4)
            self.assertEqual(pull_drive.synchronize(snapshot, repository)['updated'], [])

    def test_utc_label_timestamp_passes_connector_snapshot_and_drive_verification(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = Path(tmp)
            now = datetime(2026, 10, 2, 11, 53, 48, tzinfo=timezone.utc)
            receipt = fixture(repository, now)
            receipt['verified_at'] = '2026-10-02 11:53:48 UTC'
            raw = json.dumps(receipt).encode('utf-8')
            snapshot = snapshot_builder.build_snapshot(receipt, repository, raw, now=now)
            source = json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
            result = pull_drive.verify_source_snapshot(snapshot, repository, source, now=now)
            self.assertEqual(snapshot['exported_at'], '2026-10-02 11:53:48 UTC')
            self.assertEqual(result['source_files'], 4)
            self.assertEqual(result['exported_at'], '2026-10-02 11:53:48 UTC')

    def test_bad_scope_parent_hash_and_duplicate_identity_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = Path(tmp)
            now = datetime(2026, 9, 29, 4, tzinfo=timezone.utc)
            original = fixture(repository, now)
            changes = [
                lambda r: r.update(root_folder_id='wrong'),
                lambda r: r['files'][0].update(parent_ids=[snapshot_builder.ROOT_IDS[1][1]]),
                lambda r: r['files'][0].update(sha256='0' * 64),
                lambda r: r['files'][1].update(file_id=r['files'][0]['file_id']),
                lambda r: r['files'][1].update(path='../outside.md'),
            ]
            for change in changes:
                with self.subTest(change=changes.index(change)):
                    receipt = copy.deepcopy(original)
                    change(receipt)
                    with self.assertRaises(ValueError):
                        snapshot_builder.build_snapshot(receipt, repository, b'raw', now=now)

    def test_stale_missing_changed_and_linked_local_sources_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = Path(tmp)
            now = datetime(2026, 9, 29, 4, tzinfo=timezone.utc)
            receipt = fixture(repository, now)
            with self.assertRaisesRegex(ValueError, 'stale'):
                snapshot_builder.build_snapshot(receipt, repository, b'raw', now=now + timedelta(minutes=11))
            target = repository / 'vault/Signals/review.md'
            original = target.read_bytes()
            target.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'bytes differ'):
                snapshot_builder.build_snapshot(receipt, repository, b'raw', now=now)
            target.write_bytes(original)
            extra = repository / 'vault/Signals/extra.md'
            extra.write_text('new', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'omits'):
                snapshot_builder.build_snapshot(receipt, repository, b'raw', now=now)
            extra.unlink()
            target.unlink()
            target.symlink_to(repository / 'vault/Knowledge/concept.md')
            with self.assertRaisesRegex(ValueError, 'symlink'):
                snapshot_builder.build_snapshot(receipt, repository, b'raw', now=now)

    def test_cli_creates_private_snapshot_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = Path(tmp)
            receipt = fixture(repository, datetime.now(timezone.utc))
            private_dir = repository / '.local/drive-sync'
            private_dir.mkdir(parents=True)
            readback = private_dir / 'readback.json'
            readback.write_text(json.dumps(receipt), encoding='utf-8')
            output = private_dir / 'snapshot.json'
            command = [sys.executable, str(ROOT / 'scripts/build-connector-snapshot.py'),
                       '--repository', str(repository), '--readback', str(readback), '--output', str(output)]
            first = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(len(pull_drive.validate(json.loads(output.read_text()))), 4)
            before = output.read_bytes()
            second = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertNotEqual(second.returncode, 0)
            self.assertEqual(output.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
