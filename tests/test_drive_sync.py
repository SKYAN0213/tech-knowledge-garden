import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('drive_sync', Path(__file__).parents[1] / 'scripts/pull-drive.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)

def snapshot(contents=None):
    contents = contents or {root + '/sample.md': '# ' + root + '\n' for root in sync.ROOTS}
    return {'schema': 'tech-drive-source/v1', 'root_folder_id': sync.ROOT_ID,
            'roots': list(sync.ROOTS), 'complete': True, 'exported_at': '2026-09-13T00:00:00Z',
            'files': [{'path': p, 'content': text, 'sha256': hashlib.sha256(text.encode()).hexdigest()} for p, text in contents.items()]}

class DriveSyncTests(unittest.TestCase):
    def test_update_and_repeat_are_idempotent(self):
        with tempfile.TemporaryDirectory() as t:
            repo = Path(t)
            self.assertTrue(sync.synchronize(snapshot(), repo, True)['changed'])
            self.assertFalse(sync.synchronize(snapshot(), repo, True)['changed'])
            changed = snapshot(); changed['files'][0]['content'] = 'updated'
            changed['files'][0]['sha256'] = hashlib.sha256(b'updated').hexdigest()
            self.assertEqual(sync.synchronize(changed, repo, True)['updated'], ['Editions/sample.md'])

    def test_bad_hash_and_partial_snapshot_leave_files_unchanged(self):
        with tempfile.TemporaryDirectory() as t:
            repo = Path(t); sync.synchronize(snapshot(), repo, True)
            before = (repo / 'vault/Editions/sample.md').read_bytes()
            for change in [{'complete': False}, {'root_folder_id': 'wrong'}]:
                bad = snapshot(); bad.update(change)
                with self.assertRaises(ValueError): sync.synchronize(bad, repo, True)
            bad = snapshot(); bad['files'][0]['content'] = 'tampered'
            with self.assertRaises(ValueError): sync.synchronize(bad, repo, True)
            self.assertEqual((repo / 'vault/Editions/sample.md').read_bytes(), before)

    def test_private_operational_paths_and_traversal_rejected(self):
        for path in ['Sources/private.md', '../escape.md', '/tmp/escape.md', 'Knowledge/../escape.md', 'Knowledge/.hidden.md', 'Knowledge//x.md', 'Knowledge/x.py', 'Knowledge\\x.md']:
            bad = snapshot(); bad['files'][0]['path'] = path
            with self.subTest(path=path), self.assertRaises(ValueError): sync.validate(bad)

    def test_duplicate_and_missing_roots_rejected(self):
        bad = snapshot(); bad['files'].append(bad['files'][0])
        with self.assertRaises(ValueError): sync.validate(bad)
        bad = snapshot(); bad['files'].pop()
        with self.assertRaises(ValueError): sync.validate(bad)

    def test_transport_transition_and_publish_guard(self):
        with tempfile.TemporaryDirectory() as t:
            repo = Path(t); initial = snapshot(); initial['transport'] = 'codex-drive-connector'
            sync.synchronize(initial, repo, True)
            self.assertTrue(sync.synchronize(snapshot(), repo, True)['changed'])
            self.assertEqual(sync.verify_working_copy(repo)['verified_source_files'], 4)
            (repo / 'vault/Knowledge/sample.md').write_text('local unpublished edit')
            with self.assertRaises(ValueError): sync.verify_working_copy(repo)

    def test_small_deletion_syncs_but_large_deletion_stops(self):
        contents = {root + '/sample.md': root for root in sync.ROOTS}
        contents.update({'Knowledge/' + str(i) + '.md': str(i) for i in range(12)})
        with tempfile.TemporaryDirectory() as t:
            repo = Path(t); sync.synchronize(snapshot(contents), repo, True)
            del contents['Knowledge/0.md']
            self.assertEqual(sync.synchronize(snapshot(contents), repo, True)['deleted'], ['Knowledge/0.md'])
            with self.assertRaises(ValueError): sync.synchronize(snapshot(), repo, True)
            self.assertTrue((repo / 'vault/Knowledge/1.md').exists())

    def test_symlink_escape_rejected(self):
        with tempfile.TemporaryDirectory() as t, tempfile.TemporaryDirectory() as other:
            repo = Path(t); (repo / 'vault').mkdir()
            (repo / 'vault/Knowledge').symlink_to(other, target_is_directory=True)
            with self.assertRaises(ValueError): sync.synchronize(snapshot(), repo, True)

if __name__ == '__main__': unittest.main()
