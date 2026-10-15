"""Synthetic OCR failure/budget fixtures, separate from stored publisher sources."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import numpy as np
import pymupdf

spec = importlib.util.spec_from_file_location("ocr_quality_worker", Path(__file__).resolve().parents[1] / "integrations/research-worker/worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class PDFOCRQualityTests(unittest.TestCase):
    def rows(self, texts=None, scores=None):
        texts = ["投資 −１２．５％", "robot demand"] if texts is None else texts
        scores = [0.99, 0.75] if scores is None else scores
        return SimpleNamespace(boxes=np.array([[[10, 10+i*30], [100, 10+i*30], [100, 30+i*30], [10, 30+i*30]] for i in range(len(texts))]), txts=texts, scores=scores)

    def pdf(self, width=200, height=200):
        document = pymupdf.open()
        document.set_metadata({"title": "Synthetic source"})
        document.new_page(width=width, height=height)
        raw = document.tobytes()
        document.close()
        return raw

    def test_oversized_pdf_is_rejected_before_engine_or_raster_allocation(self):
        for options in [{"max_ocr_pixels": 100}, {"max_ocr_pixels": True}, {"max_ocr_pixels": 20_000_001}]:
            with self.subTest(options=options), patch("pymupdf.Page.get_pixmap") as raster, patch("rapidocr.RapidOCR") as engine:
                with self.assertRaisesRegex(ValueError, "pixel budget"):
                    worker.pdf_parse(self.pdf(), {"ocr": True, "language": "en", **options})
                raster.assert_not_called()
                engine.assert_not_called()
        with patch("pymupdf.Page.get_pixmap") as raster:
            with self.assertRaisesRegex(ValueError, "pixel budget"):
                worker.pdf_parse(self.pdf(5000, 5000), {"ocr": True})
            raster.assert_not_called()

    def test_confidence_and_numeric_locations_survive_without_verifying_numbers(self):
        with patch("rapidocr.RapidOCR", return_value=lambda image: self.rows()):
            parsed = worker.pdf_parse(self.pdf(), {"ocr": True, "language": "ja"})
        self.assertEqual(parsed["status"], "partial")
        self.assertEqual(parsed["quality"]["missing_pages"], [1])
        self.assertEqual(parsed["quality"]["numeric_verification"], "unreviewed")
        reviews = parsed["quality"]["ocr_review_blocks"]
        self.assertEqual(reviews[0]["numeric_tokens"], ["−１２．５％"])
        self.assertEqual(reviews[0]["reasons"], ["numeric-review"])
        self.assertEqual(reviews[1]["reasons"], ["low-confidence"])
        self.assertEqual(reviews[0]["locator"], parsed["blocks"][0]["locator"])
        self.assertAlmostEqual(reviews[0]["locator"]["bbox"][0], 3.6)

    def test_malformed_rows_never_silently_zip_away_source_text(self):
        result = self.rows()
        for field in ["boxes", "txts", "scores"]:
            changed = SimpleNamespace(**vars(result))
            setattr(changed, field, getattr(changed, field)[:-1])
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "counts differ"):
                worker.pdf_ocr_blocks(changed, 2, 1)
        for score in [float("nan"), float("inf"), -0.1, 1.1, True, "0.99"]:
            with self.subTest(score=score), self.assertRaisesRegex(ValueError, "Invalid OCR"):
                worker.pdf_ocr_blocks(self.rows(scores=[score, 0.9]), 1, 1)
        changed = self.rows()
        changed.boxes = np.array(changed.boxes, dtype=float)
        changed.boxes[0][0][0] = float("nan")
        with self.assertRaisesRegex(ValueError, "Invalid OCR"):
            worker.pdf_ocr_blocks(changed, 1, 1)

    def test_high_confidence_numeric_ocr_keeps_manual_review_and_original_literal(self):
        with patch("rapidocr.RapidOCR", return_value=lambda image: self.rows(texts=["Revenue +1,234.50 million"], scores=[0.999])):
            parsed = worker.pdf_parse(self.pdf(), {"ocr": True, "language": "en"})
        self.assertEqual(parsed["status"], "extracted")
        self.assertEqual(parsed["quality"]["ocr_review_blocks"][0]["numeric_tokens"], ["+1,234.50"])
        self.assertEqual(parsed["quality"]["numeric_verification"], "unreviewed")
        self.assertFalse(parsed["quality"]["reviewed"])

    def test_image_review_locations_use_original_pixels_and_share_ocr_budget(self):
        import io
        from PIL import Image
        output = io.BytesIO()
        Image.new("RGB", (200, 200), "white").save(output, format="PNG")
        with patch("rapidocr.RapidOCR", return_value=lambda image: self.rows()):
            parsed = worker.image_parse(output.getvalue(), {"language": "en", "title": "Synthetic image"})
        reviews = parsed["quality"]["ocr_review_blocks"]
        self.assertEqual(reviews[0]["locator"]["type"], "image")
        self.assertEqual(reviews[0]["locator"]["bbox"], [10, 10, 100, 30])
        self.assertNotIn("page", reviews[0]["locator"])
        self.assertIsNone(parsed["dates"]["published_at"])
        with patch("pymupdf.Page.get_pixmap") as raster:
            with self.assertRaisesRegex(ValueError, "pixel budget"):
                worker.image_parse(output.getvalue(), {"max_ocr_pixels": 100})
            raster.assert_not_called()

    def test_empty_recognition_is_partial_and_does_not_invent_review_rows(self):
        with patch("rapidocr.RapidOCR", return_value=lambda image: self.rows(texts=[], scores=[])):
            parsed = worker.pdf_parse(self.pdf(), {"ocr": True, "language": "en"})
        self.assertEqual(parsed["status"], "partial")
        self.assertEqual(parsed["quality"]["missing_pages"], [1])
        self.assertEqual(parsed["quality"]["ocr_review_blocks"], [])


if __name__ == "__main__":
    unittest.main()
