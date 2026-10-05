import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('website_data', Path(__file__).parents[1] / 'scripts/export-website-data.py')
website_data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(website_data)


class DriveLinksTests(unittest.TestCase):
    def test_verified_file_id_supplies_link_when_receipt_url_is_absent(self):
        receipt = {'files': [
            {'path': 'Editions/2026/09/example.md', 'id': '1Abc_123-xyz'},
            {'path': 'Knowledge/example.md', 'id': '1Def_456', 'url': 'https://drive.google.com/known'},
        ]}
        self.assertEqual(website_data.drive_links(receipt), {
            'Editions/2026/09/example.md': 'https://drive.google.com/file/d/1Abc_123-xyz/view?usp=drivesdk',
            'Knowledge/example.md': 'https://drive.google.com/known',
        })

    def test_missing_identity_and_duplicate_paths_stop_export(self):
        with self.assertRaisesRegex(ValueError, 'file ID'):
            website_data.drive_links({'files': [{'path': 'Editions/example.md'}]})
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            website_data.drive_links({'files': [
                {'path': 'Editions/example.md', 'id': 'first'},
                {'path': 'Editions/example.md', 'id': 'second'},
            ]})

    def test_canonical_lineage_supersedes_stale_generated_news_receipts(self):
        lineage = {'mapping': {'news/event': ['Editions/new.md', 'Editions/old.md']},
                   'sources': {'Editions/new.md': {'sha256': 'new'}, 'Editions/old.md': {'sha256': 'old'}}}
        receipt = {'files': [{'path': 'News/event.md', 'id': 'stale'},
                            {'path': 'Editions/new.md', 'id': 'current', 'sha256': 'new'}]}
        refs = website_data.source_note_links(lineage, receipt)['news/event']
        self.assertEqual([ref['path'] for ref in refs], ['Editions/new.md', 'Editions/old.md'])
        self.assertIn('/current/', refs[0]['url'])
        self.assertEqual(refs[1]['url'], '')
        receipt['files'][1]['sha256'] = 'different'
        with self.assertRaisesRegex(ValueError, 'differs'):
            website_data.source_note_links(lineage, receipt)


if __name__ == '__main__':
    unittest.main()
