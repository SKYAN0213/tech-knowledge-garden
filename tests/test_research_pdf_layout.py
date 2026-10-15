"""Explicit source-bound PDF regions; no automatic multicolumn completeness."""
import copy
import hashlib
import re
import unittest
import pymupdf
from test_research_worker import WorkerTests


class PDFLayoutTests(unittest.TestCase):
    invoke = WorkerTests.invoke

    def fixture(self, wide=False, extra_page=False):
        doc = pymupdf.open()
        page = doc.new_page(width=612, height=792)
        doc.set_metadata({"title": "Explicit two-column source"})
        for x, y, text, size in [
            (55, 60, "Source header", 9),
            (55, 100, "Left method: control data is excluded.", 9),
            (55, 170, "Table 1: Conditional results.", 9),
            (55, 190, "Metric", 9), (130, 190, "Value", 9), (205, 190, "Unit", 9),
            (55, 208, "Loss", 9), (130, 208, "-50.0", 9), (205, 208, "USD", 9),
            (55, 260, "The table reports a mean, not a total.", 9),
            (55, 500, "Figure 1: Control apparatus.", 9),
            (325, 90, "Right result: only the 100 ms condition.", 9),
            (325, 130, "Not statistically significant.", 9),
            (325, 250, "Uses Framework1 for animation.", 9),
            (325, 690, "1 Framework: https://example.com/reference", 8),
        ]:
            page.insert_text((x, y), text, fontsize=size)
        if wide:
            page.insert_textbox(pymupdf.Rect(55, 350, 555, 380),
                               "A wide source block " * 10, fontsize=9)
        if extra_page:
            second = doc.new_page(width=612, height=792)
            second.insert_text((55, 100), "Unprofiled source page remains preserved.", fontsize=9)
        raw = doc.tobytes()
        regions = [
            {"id": "table-1", "kind": "table", "bbox": [50, 178, 290, 220],
             "column_edges": [50, 115, 190, 290], "expected_rows": 2,
             "condition_refs": [{"bbox": [50, 245, 295, 265]}]},
            {"id": "caption-1", "kind": "paragraph", "role": "table-caption",
             "bbox": [50, 155, 290, 174]},
            {"id": "figure-1", "kind": "figure", "bbox": [50, 485, 295, 505]},
            {"id": "footnote-1", "kind": "paragraph", "role": "footnote", "label": "1",
             "bbox": [320, 675, 565, 695], "callout_bbox": [320, 235, 565, 255],
             "callout_text": "Framework1"},
        ]
        # Profile identities come from the captured PDF text layer, never fabricated output.
        with pymupdf.open(stream=raw, filetype="pdf") as captured:
            blocks = captured[0].get_text("blocks", sort=True)
            def hashes(box):
                return [hashlib.sha256(re.sub(r"\s+", " ", b[4]).strip().encode()).hexdigest()
                        for b in blocks if b[6] == 0 and box[0] <= b[0] and box[1] <= b[1]
                        and b[2] <= box[2] and b[3] <= box[3]]
            for region in regions:
                region["expected_text_hashes"] = hashes(region["bbox"])
                self.assertTrue(region["expected_text_hashes"])
                for condition in region.get("condition_refs", []):
                    values = hashes(condition["bbox"])
                    self.assertEqual(len(values), 1)
                    condition["text_hash"] = values[0]
        options = {"pdf_layout_profile": {
            "id": "explicit-source-layout", "source_sha256": hashlib.sha256(raw).hexdigest(),
            "pages": [{"page": 1, "columns": [[50, 80, 300, 715], [315, 80, 565, 715]],
                       "regions": regions}]},
            "pdf_table_context": {"patterns": [r"Table 1: Conditional results\."], "max_gap_pt": 24}}
        return raw, options

    def test_explicit_columns_table_caption_figure_and_footnote_keep_source_locations(self):
        raw, options = self.fixture()
        parsed = self.invoke(raw, options)["result"]
        self.assertEqual(parsed["status"], "extracted")
        blocks = parsed["blocks"]
        left = [i for i, b in enumerate(blocks) if b["locator"].get("column") == 0]
        right = [i for i, b in enumerate(blocks) if b["locator"].get("column") == 1]
        self.assertLess(max(left), min(right))
        table = next(b for b in blocks if b["kind"] == "table")
        self.assertEqual(table["table_id"], "table-1")
        self.assertEqual(table["rows"], [["Metric", "Value", "Unit"], ["Loss", "-50.0", "USD"]])
        self.assertEqual(table["caption"], "Table 1: Conditional results.")
        self.assertIn("not a total", table["condition_refs"][0]["text"])
        self.assertEqual(table["condition_refs"][0]["locator"]["page"], 1)
        self.assertTrue(table["cell_layout"][1][1]["bbox"])
        self.assertEqual(sum(b["text"].count("-50.0") for b in blocks), 1)
        self.assertFalse(any(b.get("role") == "table-caption" for b in blocks))
        figure = next(b for b in blocks if b["kind"] == "figure")
        self.assertEqual(figure["caption"], "Figure 1: Control apparatus.")
        note = next(b for b in blocks if b.get("role") == "footnote")
        self.assertEqual(note["kind"], "paragraph")
        callout = next(b for b in blocks if b.get("footnote_refs"))
        self.assertEqual(callout["footnote_refs"][0]["id"], note["footnote_id"])
        for block in blocks:
            self.assertEqual(block["locator"]["text_hash"], hashlib.sha256(block["text"].encode()).hexdigest())
        self.assertEqual(parsed["quality"]["numeric_verification"], "unreviewed")
        self.assertFalse(parsed["quality"]["reviewed"])
        self.assertIsNone(parsed["dates"]["published_at"])

    def test_unclear_cross_column_block_is_partial_with_original_position(self):
        raw, options = self.fixture(wide=True)
        parsed = self.invoke(raw, options)["result"]
        self.assertEqual(parsed["status"], "partial")
        self.assertIn("layout-column-missing-or-ambiguous",
                      [i["reason"] for i in parsed["quality"]["pdf_layout_issues"]])
        wide = next(b for b in parsed["blocks"] if b["text"].startswith("A wide source block"))
        self.assertGreater(wide["locator"]["bbox"][2], 315)
        self.assertIsNone(wide["locator"]["column"])

    def test_wrong_rows_or_block_identity_preserves_source_text_as_partial(self):
        raw, options = self.fixture()
        for fault in ["rows", "hash"]:
            modified = copy.deepcopy(options)
            region = modified["pdf_layout_profile"]["pages"][0]["regions"][0]
            if fault == "rows":
                region["expected_rows"] = 9
            else:
                region["expected_text_hashes"] = ["0" * 64]
            with self.subTest(fault=fault):
                parsed = self.invoke(raw, modified)["result"]
                self.assertEqual(parsed["status"], "partial")
                self.assertFalse(any(b.get("table_id") == "table-1" for b in parsed["blocks"]))
                self.assertIn("-50.0", " ".join(b["text"] for b in parsed["blocks"]))

    def test_other_source_version_and_unprofiled_pages_never_promote_complete(self):
        raw, options = self.fixture()
        modified = copy.deepcopy(options)
        modified["pdf_layout_profile"]["source_sha256"] = "0" * 64
        parsed = self.invoke(raw, modified)["result"]
        self.assertEqual(parsed["status"], "partial")
        self.assertEqual(parsed["quality"]["pdf_layout_issues"][0]["reason"], "layout-source-version-mismatch")
        self.assertFalse(any(b.get("table_id") for b in parsed["blocks"]))
        raw, options = self.fixture(extra_page=True)
        parsed = self.invoke(raw, options)["result"]
        self.assertEqual(parsed["status"], "partial")
        self.assertEqual(parsed["quality"]["pdf_layout_profile"]["unprofiled_pages"], [2])
        self.assertIn("Unprofiled source page", " ".join(b["text"] for b in parsed["blocks"]))

    def test_overlapping_outside_and_oversized_geometry_are_rejected(self):
        raw, options = self.fixture()
        for fault in ["overlap", "outside", "rows"]:
            modified = copy.deepcopy(options)
            page = modified["pdf_layout_profile"]["pages"][0]
            if fault == "overlap":
                page["columns"][1][0] = 290
            elif fault == "outside":
                page["columns"][0][2] = 1000000
            else:
                page["regions"][0]["expected_rows"] = 1000000
            with self.subTest(fault=fault):
                response = self.invoke(raw, modified)
                self.assertIn("PDF", response.get("error", ""))


if __name__ == "__main__":
    unittest.main()
