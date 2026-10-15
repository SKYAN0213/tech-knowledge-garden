import importlib.util
from pathlib import Path
import tempfile
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


class ReaderIndexTests(unittest.TestCase):
    base_path = '/tech-knowledge-garden/'

    def company(self, name='Acme'):
        return {'type': '기업', 'url': '/tech-knowledge-garden/companies/index?company=' + name,
                'title': name}

    def test_company_filter_uses_exact_url_key_and_remains_unmapped(self):
        row = self.company('%ED%85%8C%EC%8A%A4%ED%8A%B8')
        key = 'companies/index?company=%ED%85%8C%EC%8A%A4%ED%8A%B8'
        website_data.validate_search_indexes([row], {key: row}, self.base_path)
        self.assertEqual(website_data.reader_index_key(row, self.base_path), key)
        self.assertEqual(website_data.page_note(row, {}, {}, {}), ['', ''])
        self.assertFalse(website_data.page_has_note_mapping(row, {}, {}, {}))

    def test_slug_rows_keep_slug_keys_and_exact_rows_are_required(self):
        row = {'slug': 'knowledge/example', 'url': '/tech-knowledge-garden/knowledge/example',
               'type': '지식'}
        website_data.validate_search_indexes([row], {row['slug']: row}, self.base_path)
        with self.assertRaisesRegex(ValueError, 'rows disagree'):
            website_data.validate_search_indexes([row], {row['slug']: {**row, 'url': '/wrong'}}, self.base_path)
        with self.assertRaisesRegex(ValueError, 'slug and page URL disagree'):
            website_data.reader_index_key({**row, 'url': '/tech-knowledge-garden/knowledge/other'},
                                          self.base_path)

    def test_duplicate_keys_urls_and_invalid_slugless_rows_are_rejected(self):
        company = self.company()
        with self.assertRaisesRegex(ValueError, 'Duplicate reader index key'):
            website_data.validate_search_indexes([company, dict(company)],
                {'companies/index?company=Acme': company}, self.base_path)
        bad = {**company, 'url': '/tech-knowledge-garden/companies/index?company=A&company=B'}
        with self.assertRaisesRegex(ValueError, 'valid company-filter URL'):
            website_data.reader_index_key(bad, self.base_path)
        with self.assertRaisesRegex(ValueError, 'valid company-filter URL'):
            website_data.reader_index_key({'type': '기타', 'url': company['url']}, self.base_path)

    def test_repository_option_defaults_to_script_checkout_and_accepts_explicit_checkout(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = Path(directory)
            for relative in ('public', 'vault', 'scripts/website-note-lineage.mjs',
                             '.local/site-notes.json', 'data/catalog.json',
                             '.local/drive-sync/receipt.json'):
                target = repository / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.touch()
            from unittest.mock import patch
            with patch.object(website_data, 'ROOT', repository):
                self.assertEqual(website_data.repository_argument([]), repository.resolve())
            self.assertEqual(website_data.repository_argument(['--repository', directory]),
                             repository.resolve())
            self.assertEqual(website_data.drive_receipt_path(repository),
                             repository / '.local/drive-sync/receipt.json')
            with self.assertRaisesRegex(ValueError, 'missing required publisher'):
                missing_receipt = repository / 'missing-receipt'
                missing_receipt.mkdir()
                for relative in ('public', 'vault', 'scripts/website-note-lineage.mjs',
                                 '.local/site-notes.json', 'data/catalog.json'):
                    target = missing_receipt / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.touch()
                website_data.repository_argument(['--repository', str(missing_receipt)])

class ReaderEntryKeyTests(unittest.TestCase):
    def test_note_page_uses_its_slug(self):
        self.assertEqual(website_data.reader_entry_key({
            'slug': 'News/example', 'url': '/tech-knowledge-garden/news/example'
        }), 'News/example')

    def test_query_backed_company_entry_uses_content_index_url_key(self):
        self.assertEqual(website_data.reader_entry_key({
            'url': '/tech-knowledge-garden/companies/index?company=Roche'
        }), 'companies/index?company=Roche')

    def test_url_based_entry_must_stay_under_site_path(self):
        with self.assertRaisesRegex(ValueError, 'outside the website'):
            website_data.reader_entry_key({'url': '/elsewhere/company'})


if __name__ == '__main__':
    unittest.main()
