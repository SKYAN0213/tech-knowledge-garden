import importlib.util
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('prepare_drive', Path(__file__).parents[1] / 'scripts/prepare-drive.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class EvidenceFilesTests(unittest.TestCase):
    def test_generated_preview_workspace_is_not_rearchived(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            (base / 'runs' / 'one' / 'preview-workspace').mkdir(parents=True)
            (base / 'runs' / 'one' / 'preview-workspace' / 'page.html').write_text('generated')
            (base / 'runs' / 'one' / 'source.json').write_text('original')
            (base / 'runs' / 'one' / 'preview.png').write_bytes(b'preview receipt')
            selected = prepare.evidence_files(base)
            names = {p.relative_to(base).as_posix() for p in selected}
            self.assertEqual(names, {'runs/one/source.json', 'runs/one/preview.png'})
            archive = base / 'archive.zip'
            prepare.archive(archive, base, selected)
            with zipfile.ZipFile(archive) as stored:
                self.assertEqual(set(stored.namelist()), names)

    def test_external_source_cache_reuses_verified_bytes_and_rejects_corruption(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            cache = root / 'cache'
            cache.mkdir()
            body = b'Original source response'
            source_id = hashlib.sha256(b'https://example.com/source').hexdigest()[:20]
            snapshot = source_id + '.response.html'
            (cache / snapshot).write_bytes(body)
            (cache / (source_id + '.json')).write_text(json.dumps({
                'status': 'captured_unreviewed', 'attempted_at': '2026-09-28T00:00:00+00:00',
                'snapshot': snapshot, 'sha256': hashlib.sha256(body).hexdigest(),
            }))
            row = {'source_id': source_id, 'url': 'https://example.com/source'}
            with patch.dict(os.environ, {'TECH_GARDEN_DRIVE_SOURCE_CACHE_DIR': str(cache)}):
                self.assertEqual(prepare.source_cache_dir(), cache)
                self.assertEqual(prepare.collect(row)['status'], 'captured_unreviewed')
                (cache / snapshot).write_bytes(b'changed')
                with self.assertRaisesRegex(RuntimeError, 'Cached snapshot missing or changed'):
                    prepare.collect(row)

    def test_external_source_cache_must_not_overlap_staging_or_repository(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            with patch.object(prepare, 'STAGE', root / 'stage'):
                for invalid in ('relative/cache', str(prepare.ROOT / '.local/cache'), str(root), str(root / 'stage/cache')):
                    with self.subTest(invalid=invalid), patch.dict(os.environ, {'TECH_GARDEN_DRIVE_SOURCE_CACHE_DIR': invalid}):
                        with self.assertRaises(ValueError):
                            prepare.source_cache_dir()


if __name__ == '__main__':
    unittest.main()
