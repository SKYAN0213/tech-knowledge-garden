"""Synthetic PDF fixtures; never operational article or approval data."""
import importlib.util
from pathlib import Path
import unittest

import pymupdf

WORKER = Path(__file__).resolve().parents[1] / "integrations/research-worker/worker.py"
spec = importlib.util.spec_from_file_location("pdf_context_worker", WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def block(kind, text, bbox, page=1):
    return {"kind": kind, "text": text, "locator": {
        "type": "pdf", "page": page, "bbox": bbox, "text_hash": worker.digest(text),
    }}


class PDFTableContextTests(unittest.TestCase):
    options = {"patterns": [r"\(Amounts: million yen\)"], "max_gap_pt": 24}

    def test_only_explicit_same_page_context_is_joined_and_each_fragment_is_preserved(self):
        caption = block("paragraph", "(Amounts: million yen)", [300, 85, 450, 95])
        table = block("table", "Revenue | 948100", [50, 100, 450, 200])
        unrelated = block("paragraph", "Company targets growth", [50, 80, 250, 95])
        blocks = [caption, unrelated, table]
        self.assertEqual(worker.apply_pdf_table_context(blocks, self.options), [])
        self.assertEqual(table["text"], caption["text"] + "\nRevenue | 948100")
        self.assertEqual(table["locator"]["table_bbox"], [50, 100, 450, 200])
        self.assertEqual(table["locator"]["bbox"], [50, 85, 450, 200])
        self.assertEqual(table["context_fragments"][0]["locator"], caption["locator"])
        self.assertEqual(table["context_fragments"][1]["text"], "Revenue | 948100")
        self.assertEqual(table["locator"]["text_hash"], worker.digest(table["text"]))
        self.assertEqual(caption["text"], "(Amounts: million yen)")
        self.assertNotIn("growth", table["text"])

    def test_far_side_below_other_page_and_unconfigured_context_are_not_joined(self):
        for bbox, page in [([300, 40, 450, 50], 1), ([500, 85, 600, 95], 1),
                           ([300, 205, 450, 215], 1), ([300, 85, 450, 95], 2)]:
            with self.subTest(bbox=bbox, page=page):
                table = block("table", "Revenue | 948100", [50, 100, 450, 200])
                caption = block("paragraph", "(Amounts: million yen)", bbox, page)
                worker.apply_pdf_table_context([caption, table], self.options)
                self.assertEqual(table["text"], "Revenue | 948100")
                self.assertNotIn("context_fragments", table)
        table = block("table", "Revenue | 948100", [50, 100, 450, 200])
        worker.apply_pdf_table_context([block("paragraph", "(Amounts: million yen)", [300, 85, 450, 95]), table], None)
        self.assertNotIn("context_fragments", table)

    def test_ambiguous_tables_or_captions_remain_unjoined(self):
        caption = block("paragraph", "(Amounts: million yen)", [50, 85, 450, 95])
        tables = [block("table", "A | 50", [50, 100, 250, 200]),
                  block("table", "B | 60", [250, 100, 450, 200])]
        issues = worker.apply_pdf_table_context([caption, *tables], self.options)
        self.assertEqual(issues[0]["reason"], "ambiguous-table-context")
        self.assertTrue(all("context_fragments" not in table for table in tables))
        caption2 = block("paragraph", "(Amounts: million yen)", [300, 73, 450, 83])
        table = block("table", "A | 50", [50, 100, 450, 200])
        issues = worker.apply_pdf_table_context([caption, caption2, table], self.options)
        self.assertEqual(issues[0]["reason"], "multiple-table-contexts")
        self.assertNotIn("context_fragments", table)

    def test_invalid_profile_is_rejected(self):
        for options in [{}, {"patterns": []}, {"patterns": ["("]},
                        {"patterns": [".*"], "max_gap_pt": 500},
                        {"patterns": [".*"], "max_gap_pt": True}]:
            with self.subTest(options=options):
                with self.assertRaises(ValueError):
                    worker.apply_pdf_table_context([], options)

    def test_real_pdf_extraction_retains_rows_and_a_scoped_unit_caption(self):
        doc = pymupdf.open()
        doc.set_metadata({"title": "Synthetic quarterly report"})
        page = doc.new_page()
        page.insert_text((50, 40), "Synthetic quarterly report")
        page.insert_text((290, 95), "(Amounts: million yen)")
        for x in [50, 240, 340, 450]:
            page.draw_line((x, 110), (x, 200))
        for y in [110, 140, 170, 200]:
            page.draw_line((50, y), (450, y))
        for y, row in [(130, ["Item", "Previous", "New"]),
                       (160, ["Revenue", "909600", "948100"]),
                       (190, ["Profit", "212200", "218000"])]:
            for x, text in zip([60, 250, 350], row):
                page.insert_text((x, y), text)
        raw = doc.tobytes()
        parsed = worker.pdf_parse(raw, {"pdf_table_context": self.options})
        table = next(b for b in parsed["blocks"] if b["kind"] == "table")
        self.assertEqual(parsed["status"], "extracted")
        self.assertIn("(Amounts: million yen)", table["text"])
        self.assertIn("948100", table["text"])
        self.assertEqual(table["rows"][1], ["Revenue", "909600", "948100"])
        self.assertEqual(len(table["context_fragments"]), 2)


if __name__ == "__main__":
    unittest.main()
