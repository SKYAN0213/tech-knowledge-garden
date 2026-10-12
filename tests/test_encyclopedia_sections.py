"""Specialist notes may omit unsupported explanations, never broken content."""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from validate_encyclopedia import validate_knowledge_file, CONCEPT_HEADINGS


class SpecialistSectionsTests(unittest.TestCase):
    def findings(self, sections, specialist=True):
        metadata = """---
title: Bin Picking
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Robotics
created: 2026-10-09
updated: 2026-10-09
aliases: []
parent_concepts: []
related_concepts: []
tags: []
""" + ("concept_id: bin-picking\n" if specialist else "") + "---\n\n# Bin Picking\n\n"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Bin Picking.md"
            path.write_text(metadata + "\n\n".join(f"## {heading}\n\n{body}" for heading, body in sections), encoding="utf-8")
            return [finding.message for finding in validate_knowledge_file(path, {}, {})]

    def minimal(self):
        return [("한 문장 정의", "불규칙하게 놓인 물체를 인식하고 집어 다른 위치에 놓는 로봇 작업이다."),
                ("작동 원리", "물체 인식, 집기, 배치를 순서대로 수행한다."),
                ("출처", "[공식 설명](https://example.com/bin-picking)")]

    def test_optional_explanations_and_relations_are_not_required(self):
        self.assertEqual(self.findings(self.minimal()), [])

    def test_definition_and_source_remain_required(self):
        for index in (0, 2):
            with self.subTest(index=index):
                self.assertTrue(self.findings([section for i, section in enumerate(self.minimal()) if i != index]))

    def test_present_sections_cannot_be_empty(self):
        sections = self.minimal()
        sections.insert(2, ("한계와 실패 조건", ""))
        self.assertIn("empty body under heading: 한계와 실패 조건", self.findings(sections))

    def test_unknown_reordered_and_duplicate_sections_are_rejected(self):
        cases = [self.minimal() + [("안내", "추가 내용")],
                 [self.minimal()[1], self.minimal()[0], self.minimal()[2]],
                 [self.minimal()[0], self.minimal()[0], self.minimal()[2]]]
        for sections in cases:
            with self.subTest(sections=sections):
                self.assertTrue(any("heading order" in message for message in self.findings(sections)))

    def test_present_scope_keeps_both_boundaries(self):
        sections = self.minimal()
        sections.insert(1, ("범위", "**포함:** 물체 집기"))
        self.assertIn("범위 must state both 포함 and 포함하지 않음", self.findings(sections))

    def test_present_relationships_still_require_confirmed_link(self):
        sections = self.minimal()
        sections.insert(2, ("관련 개념", "같이 등장하는 회사"))
        self.assertTrue(any("confirmed reason" in message for message in self.findings(sections)))

    def test_legacy_concepts_keep_their_existing_template(self):
        self.assertTrue(self.findings(self.minimal(), specialist=False))
        scope = "**포함:** 물체 집기\n\n**포함하지 않음:** 제품명"
        related = "상위: 없음\n하위: 없음\n함께 쓰임: 없음\n대비: 없음"
        sections = [(heading, scope if heading == "범위" else related if heading == "관련 개념" else "https://example.com/bin-picking" if heading == "출처" else "설명") for heading in CONCEPT_HEADINGS]
        self.assertEqual(self.findings(sections, specialist=False), [])


if __name__ == "__main__":
    unittest.main()
