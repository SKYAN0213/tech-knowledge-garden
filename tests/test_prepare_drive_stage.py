import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

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


if __name__ == '__main__':
    unittest.main()
