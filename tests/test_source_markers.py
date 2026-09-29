import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / 'scripts/validate_encyclopedia.py'
spec = importlib.util.spec_from_file_location('source_marker_validator', MODULE_PATH)
validator = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = validator
spec.loader.exec_module(validator)


class SourceMarkerTests(unittest.TestCase):
    def findings(self, ids=(1, 3), policy=True, date='2026-08-28', editorial=False, marker_ids=None):
        markers = marker_ids or ids
        metadata = f'''---
title: 테스트 브리핑
type: briefing
schema_version: tech-ai-magazine/v2
date: {date}
timezone: Asia/Seoul
coverage_start: 2026-08-27T08:00:00+09:00
coverage_end: 2026-08-28T08:00:00+09:00
source_count: 2
new_items_count: 2
linked_knowledge_notes: []
knowledge_notes_created: []
knowledge_notes_updated: []
article_records:
  - title: 첫 기사
article_reviews:
  - title: 첫 기사
'''
        if policy:
            metadata += 'source_marker_format: preserved-retrospective/v1\n'
        if editorial:
            metadata += 'editorial_format: six-w/v1\n'
        metadata += '---\n\n'
        section_content = {name: '없음' for name in validator.BRIEFING_HEADINGS}
        section_content['이번 호 표지'] = '테스트 뉴스'
        section_content['차례'] = '첫 기사 · 둘째 기사'
        section_content['뉴스 데스크'] = f'## 첫 기사\n\n사실이다. [S{markers[0]}]\n\n## 둘째 기사\n\n다른 사실이다. [S{markers[1]}]'
        section_content['Source List'] = '\n'.join(f'- [S{i}] https://example.org/source-{n}' for n, i in enumerate(ids))
        body = '\n\n'.join(f'# {name}\n\n{section_content[name]}' for name in validator.BRIEFING_HEADINGS)
        with tempfile.TemporaryDirectory() as directory:
            note = Path(directory) / 'fixture.md'
            note.write_text(metadata + body, encoding='utf-8')
            return [item.message for item in validator.validate_briefing(note, Path(directory), {}, {})]

    def test_explicit_partial_history_preserves_sparse_citations(self):
        self.assertEqual(self.findings(), [])

    def test_without_policy_requires_consecutive_ids(self):
        self.assertIn('source IDs must be consecutive from S1', self.findings(policy=False))
        self.assertEqual(self.findings(ids=(1, 2), policy=False), [])

    def test_new_and_complete_issues_cannot_use_historical_policy(self):
        for options in ({'date': '2026-09-28'}, {'editorial': True}):
            self.assertIn('preserved source markers require a partial historical review', self.findings(**options))

    def test_sparse_ids_remain_positive_unique_and_ordered(self):
        for ids in ((3, 1), (1, 1), (0, 3)):
            self.assertIn('preserved source IDs must be unique, positive and ordered', self.findings(ids=ids))

    def test_undefined_and_unused_sources_still_fail(self):
        results = self.findings(marker_ids=(1, 4))
        self.assertIn('undefined source markers: [4]', results)
        self.assertIn('unused Source List entries: [3]', results)


if __name__ == '__main__':
    unittest.main()
