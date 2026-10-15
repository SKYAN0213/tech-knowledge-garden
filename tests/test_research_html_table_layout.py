"""Location and condition preservation for explicitly selected HTML tables."""
import unittest
from test_research_worker import WorkerTests


class HTMLTableLayoutTests(unittest.TestCase):
    invoke = WorkerTests.invoke

    def parse(self, table, extra=None):
        raw = ('<html lang="ja"><head><meta name="date" content="2026-09-30"></head>'
               '<body><h1>決算発表</h1><article><p>金額の単位は百万ドル。</p>'
               + table + '</article></body></html>').encode('utf-8')
        options = {"encoding": "utf-8", "title_xpath": "//h1", "content_xpath": "//article",
                   "content_block_xpath": ".//p|./table", "preserve_table_layout": True,
                   "required_content_xpath": ".//table"}
        return self.invoke(raw, {**options, **(extra or {})})

    def test_source_spans_keep_multilevel_period_headers_and_original_cells(self):
        table = '<table><thead><tr><th rowspan="2">項目</th><th colspan="2">GAAP</th><th colspan="2">Non-GAAP</th></tr><tr><th>FY26</th><th>FY25</th><th>FY26</th><th>FY25</th></tr></thead><tbody><tr><td>売上高</td><td>133,188</td><td>37,378</td><td>133,188</td><td>37,378</td></tr></tbody></table>'
        parsed = self.parse(table)["result"]
        self.assertEqual(parsed["status"], "extracted")
        self.assertEqual(parsed["language"], "ja")
        self.assertEqual(parsed["dates"]["published_at"], "2026-09-30")
        block = next(b for b in parsed["blocks"] if b["kind"] == "table")
        self.assertEqual(block["rows"][0], ["項目", "GAAP", "Non-GAAP"])
        self.assertEqual(block["grid"], [["項目", "GAAP", "GAAP", "Non-GAAP", "Non-GAAP"],
                                         ["項目", "FY26", "FY25", "FY26", "FY25"],
                                         ["売上高", "133,188", "37,378", "133,188", "37,378"]])
        cell = block["cell_layout"][2][1]
        self.assertEqual((cell["origin_row"], cell["origin_column"]), (2, 1))
        self.assertEqual(cell["dom_path"], "/html/body/article/table/tbody/tr/td[2]")
        self.assertFalse(cell["continuation"])
        continuation = block["cell_layout"][1][0]
        self.assertEqual(continuation["dom_path"], "/html/body/article/table/thead/tr[1]/th[1]")
        self.assertEqual(continuation["rowspan"], 2)
        self.assertEqual(continuation["source_rowspan"], "2")
        self.assertTrue(continuation["continuation"])
        self.assertEqual(parsed["quality"]["table_layout_issues"], [])
        self.assertFalse(parsed["quality"]["reviewed"])

    def test_rowspan_zero_stops_at_its_source_row_group(self):
        parsed = self.parse('<table><thead><tr><th rowspan="0">期</th><th>GAAP</th></tr><tr><th>FY26</th></tr></thead><tbody><tr><td>売上高</td><td>133,188</td></tr></tbody></table>')["result"]
        block = next(b for b in parsed["blocks"] if b["kind"] == "table")
        self.assertEqual(block["grid"], [["期", "GAAP"], ["期", "FY26"], ["売上高", "133,188"]])
        self.assertEqual(block["cell_layout"][1][0]["source_rowspan"], "0")
        self.assertEqual(block["cell_layout"][1][0]["rowspan"], 2)

    def test_invalid_overlap_or_excessive_spans_remain_partial_without_inferred_grid(self):
        tables = [
            '<table><tr><td colspan="0">133,188</td></tr></table>',
            '<table><tr><td colspan="bad">133,188</td></tr></table>',
            '<table><tr><td rowspan="4">FY26</td><td>133,188</td></tr></table>',
            '<table><tr><td>FY26</td><td rowspan="2">FY25</td></tr><tr><td colspan="2">133,188</td></tr></table>',
            '<table><tr><td colspan="1001">133,188</td></tr></table>',
        ]
        for table in tables:
            with self.subTest(table=table):
                parsed = self.parse(table)["result"]
                self.assertEqual(parsed["status"], "partial")
                self.assertFalse(parsed["quality"]["required_fields_present"])
                self.assertEqual(parsed["quality"]["reason"], "table-layout-incomplete")
                self.assertTrue(parsed["quality"]["table_layout_issues"])
                block = next(b for b in parsed["blocks"] if b["kind"] == "table")
                self.assertNotIn("grid", block)
                self.assertIn("133,188", block["text"])

    def test_nested_table_is_not_mixed_into_parent_rows_or_promoted_complete(self):
        parsed = self.parse('<table><tr><td>Group</td></tr><tr><td><table><tr><td>133,188</td></tr></table></td></tr></table>')["result"]
        block = next(b for b in parsed["blocks"] if b["kind"] == "table")
        self.assertEqual(len(block["rows"]), 2)
        self.assertEqual(parsed["status"], "partial")
        self.assertIn("nested-table-content", [x["reason"] for x in parsed["quality"]["table_layout_issues"]])

    def test_text_expansion_and_multiple_tables_share_a_document_output_budget(self):
        table = '<table><tr><td colspan="500">' + ('x' * 2300) + '</td></tr></table>'
        parsed = self.parse(table + table)["result"]
        blocks = [b for b in parsed["blocks"] if b["kind"] == "table"]
        self.assertIn("grid", blocks[0])
        self.assertNotIn("grid", blocks[1])
        self.assertEqual(parsed["status"], "partial")
        self.assertIn("expanded-byte-budget", [x["reason"] for x in parsed["quality"]["table_layout_issues"]])
        parsed = self.parse('<table><tr><td colspan="1000">' + ('x' * 4000) + '</td></tr></table>')["result"]
        self.assertEqual(parsed["status"], "partial")
        self.assertNotIn("grid", next(b for b in parsed["blocks"] if b["kind"] == "table"))

    def test_layout_requires_explicit_source_dom_and_keeps_default_rows_unchanged(self):
        table = '<table><tr><th colspan="2">GAAP</th></tr><tr><td>133,188</td><td>37,378</td></tr></table>'
        parsed = self.parse(table, {"preserve_table_layout": False})["result"]
        block = next(b for b in parsed["blocks"] if b["kind"] == "table")
        self.assertEqual(block["rows"], [["GAAP"], ["133,188", "37,378"]])
        self.assertNotIn("grid", block)
        self.assertNotIn("table_layout_issues", parsed["quality"])
        for extra in [{"preserve_table_layout": "yes"}, {"content_xpath": None}]:
            with self.subTest(extra=extra):
                self.assertEqual(self.parse(table, extra)["worker_status"], "failed")


if __name__ == "__main__":
    unittest.main()
