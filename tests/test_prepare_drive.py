import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import subprocess
import sys
import zipfile

spec = importlib.util.spec_from_file_location('prepare_drive', Path(__file__).parents[1] / 'scripts/prepare-drive.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class LocalSourceArchiveTests(unittest.TestCase):
    def source(self, root):
        url = 'https://example.com/research/'
        body = b'Archived primary-source fixture'
        source_id = hashlib.sha256(url.encode()).hexdigest()[:20]
        digest = hashlib.sha256(body).hexdigest()
        record = {
            'schema_version': 'source-document/v1', 'source_id': source_id,
            'source_version_id': source_id + ':' + digest, 'body_sha256': digest,
            'body_path': 'documents/' + source_id + '/' + digest + '/body.bin',
            'original_url': url, 'final_url': url.rstrip('/'), 'fetch_status': 'captured',
            'observed_at': '2020-01-01T00:00:00Z',
        }
        target = root / record['body_path']
        target.parent.mkdir(parents=True)
        target.write_bytes(body)
        prepare.write_json(target.parent / 'document.json', record)
        return record, body

    def test_staged_register_and_zip_match_actual_bytes_and_keep_corrections(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp).resolve()
            root, stage = base / 'local-ai', base / 'stage'
            record, body = self.source(root)
            first = root / Path(record['body_path']).parent / 'document.json'
            invalid = dict(record, original_url=record['original_url'].rstrip('/'))
            prepare.write_json(first, invalid)
            original = first.read_bytes()
            corrected = dict(record, observed_at='2020-02-01T00:00:00Z', fetch_status='not_modified')
            prepare.write_json(root / 'documents' / record['source_id'] / 'attempts/fixed.json', corrected)
            receipt = prepare.prepare_local_ai_sources(root, stage, 'test-source-archive')
            self.assertTrue(receipt['metadata_complete'])
            self.assertFalse(receipt['candidate_published'])
            register = json.loads((stage / 'Sources/LocalAI/source-register.json').read_text())
            self.assertEqual(register['sources'][0]['original_url'], record['original_url'])
            self.assertEqual(register['sources'][0]['metadata_provenance']['status'], 'reconciled_from_observation')
            with zipfile.ZipFile(stage / 'Sources/LocalAI/source-versions.zip') as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(archive.read(record['body_path'].removeprefix('documents/')), body)
                self.assertEqual(archive.read(str(Path(record['body_path']).parent / 'document.json').removeprefix('documents/')), original)
            self.assertEqual(first.read_bytes(), original)

    def test_unresolved_metadata_is_reported_without_inventing_a_source_url(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp).resolve()
            root, stage = base / 'local-ai', base / 'stage'
            record, _ = self.source(root)
            first = root / Path(record['body_path']).parent / 'document.json'
            prepare.write_json(first, dict(record, original_url=record['original_url'].rstrip('/')))
            receipt = prepare.prepare_local_ai_sources(root, stage, 'test-unresolved')
            self.assertFalse(receipt['metadata_complete'])
            self.assertEqual(receipt['unresolved'], 1)
            register = json.loads((stage / 'Sources/LocalAI/source-register.json').read_text())
            self.assertEqual(register['sources'], [])
            self.assertNotIn('original_url', register['unresolved_versions'][0])

    def test_corrupt_body_stops_before_a_register_or_zip_is_written(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp).resolve()
            root, stage = base / 'local-ai', base / 'stage'
            record, _ = self.source(root)
            (root / record['body_path']).write_bytes(b'Corrupted')
            with self.assertRaises(prepare.subprocess.CalledProcessError):
                prepare.prepare_local_ai_sources(root, stage, 'test-corrupt')
            self.assertFalse((stage / 'Sources/LocalAI/source-register.json').exists())
            self.assertFalse((stage / 'Sources/LocalAI/source-versions.zip').exists())


class ColdStorageReadersTests(unittest.TestCase):
    def storage(self, root, action, parameters=None):
        result = subprocess.run([sys.executable, str(prepare.ROOT / 'scripts/research/cold-storage.py'), action, '--root', str(root)],
                                input=json.dumps(parameters or {}), capture_output=True, text=True, check=True)
        return json.loads(result.stdout)

    def setup_store(self, root, cold_metadata=False):
        cache = root / 'drive-sync/source-cache'
        cache.mkdir(parents=True)
        body = b'Original primary source.\n' * 4000
        snapshot = cache / 'source.response.html'
        snapshot.write_bytes(body)
        record = {'status': 'captured_unreviewed', 'snapshot': snapshot.name, 'sha256': prepare.sha(body),
                  'bytes': len(body), 'attempted_at': prepare.now()}
        if cold_metadata:
            record['response_metadata'] = 'metadata' * 5000
        (cache / 'source.json').write_text(json.dumps(record))
        self.storage(root, 'prepare', {'parent_id': 'private-parent'})
        for bundle in self.storage(root, 'pending')['uploads']:
            self.storage(root, 'verify', {'bundle_id': bundle['id'], 'download_path': bundle['local_path'],
                'observed_at': prepare.now(), 'metadata': {'id': 'private-file', 'title': bundle['name'],
                'mime_type': 'application/zip', 'size': str(bundle['bytes']), 'parent_ids': ['private-parent'],
                'modified_time': prepare.now(), 'shared': False}})
        self.storage(root, 'enable')
        self.storage(root, 'evict', {'cache_bytes': 0})
        return cache, record

    def test_collect_reuses_verified_cold_original_without_network_or_hydration(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            cache, record = self.setup_store(root)
            with mock.patch.object(prepare, 'source_cache_dir', return_value=cache), mock.patch.object(prepare, 'public_url') as network:
                result = prepare.collect({'source_id': 'source', 'url': 'https://example.com/original'})
            network.assert_not_called()
            self.assertEqual(result['sha256'], record['sha256'])
            self.assertFalse((cache / record['snapshot']).exists())
            self.assertEqual(self.storage(root, 'pending')['downloads'], [])

    def test_cold_metadata_and_tree_enumeration_wait_instead_of_returning_partial_data(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            cache, _ = self.setup_store(root, cold_metadata=True)
            with mock.patch.object(prepare, 'source_cache_dir', return_value=cache), mock.patch.object(prepare, 'public_url') as network:
                with self.assertRaises(prepare._storage.StoragePending):
                    prepare.collect({'source_id': 'source', 'url': 'https://example.com/original'})
            network.assert_not_called()
            with self.assertRaises(prepare._storage.StoragePending) as pending:
                prepare.files(cache)
            self.assertEqual(pending.exception.storage_request['request_count'], 2)

    def test_missing_unarchived_payload_is_an_error_even_during_tree_enumeration(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            cache, _ = self.setup_store(root)
            missing = cache / 'new.response.html'
            missing.write_bytes(b'New unarchived source' * 4000)
            self.storage(root, 'prepare', {'parent_id': 'private-parent'})
            missing.unlink()
            for tree in [False, True]:
                with self.assertRaisesRegex(ValueError, 'Indexed payload is missing'):
                    prepare._storage.ensure_local(cache if tree else missing, tree=tree)

    def test_collect_rejects_symlinked_existing_metadata_before_reading_or_fetching(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            cache, _ = self.setup_store(root)
            meta = cache / 'source.json'
            preserved = root / 'original-metadata.json'
            meta.rename(preserved)
            meta.symlink_to(preserved)
            with mock.patch.object(prepare, 'source_cache_dir', return_value=cache), mock.patch.object(prepare, 'public_url') as network:
                with self.assertRaisesRegex(ValueError, 'Symlink'):
                    prepare.collect({'source_id': 'source', 'url': 'https://example.com/original'})
            network.assert_not_called()


if __name__ == '__main__':
    unittest.main()
