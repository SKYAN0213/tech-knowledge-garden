import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
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


if __name__ == '__main__':
    unittest.main()
