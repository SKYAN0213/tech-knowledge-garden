"""Synthetic page-window fixtures, separate from operational news sources."""
import importlib.util
from pathlib import Path
import unittest
import pymupdf

spec = importlib.util.spec_from_file_location("page_worker", Path(__file__).resolve().parents[1] / "integrations/research-worker/worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class PDFPageRangeTests(unittest.TestCase):
    def setUp(self):
        doc = pymupdf.open()
        doc.set_metadata({"title": "Synthetic report"})
        for n in range(1, 4):
            page = doc.new_page()
            page.insert_text((40,40), f"Synthetic original financial report page {n} with bounded text.")
        self.raw = doc.tobytes()

    def test_window_keeps_original_page_numbers_and_is_not_complete(self):
        result = worker.pdf_parse(self.raw, {"pdf_page_range": [2,2]})
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["quality"]["unparsed_pages"], [1,3])
        self.assertEqual([b["locator"]["page"] for b in result["blocks"]], [2])
        self.assertFalse(result["quality"]["required_fields_present"])

    def test_whole_window_clamps_the_last_page_and_keeps_original_text(self):
        result = worker.pdf_parse(self.raw, {"pdf_page_range": [1,10]})
        original = worker.pdf_parse(self.raw, {})
        self.assertEqual(result["status"], "extracted")
        self.assertEqual(result["blocks"], original["blocks"])
        self.assertEqual(result["quality"]["page_range"], [1,3])

    def test_invalid_ranges_and_document_budget_fail(self):
        for value in [[], [0,2], [2,1], [True,2], [4,5], "1-2"]:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "page range"):
                worker.pdf_parse(self.raw, {"pdf_page_range": value})
        with self.assertRaisesRegex(ValueError, "page budget"):
            worker.pdf_parse(self.raw, {"pdf_page_range": [1,1], "max_pages": 2})

if __name__ == "__main__":
    unittest.main()
