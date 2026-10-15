import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location(
    "research_worker", Path(__file__).resolve().parents[1] / "integrations/research-worker/worker.py"
)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class PublicationTimestampTests(unittest.TestCase):
    def parse_header(self, value, fmt, preserve=True):
        raw = ("<rss><channel><item><title>Exact announcement</title>"
               "<link>https://example.org/exact</link><pubDate>" + value +
               "</pubDate></item></channel></rss>").encode()
        options = {
            "format": "xml-fragment", "encoding": "utf-8", "language": "en",
            "title_xpath": "/rss/channel/item/title", "content_xpath": "/rss/channel/item",
            "content_block_xpath": "./title | ./link | ./pubDate",
            "publication_date_xpath": "/rss/channel/item/pubDate",
            "publication_date_pattern": "^(.+)$", "publication_date_format": fmt,
            "publication_date_policy": "explicit-authoritative",
            "publication_date_preserve_time": preserve, "preserve_publication_date_block": True,
        }
        return worker.html_parse(raw, "https://example.org/rss.xml", options)

    def test_explicit_rfc2822_gmt_retains_instant_and_raw_publication_locator(self):
        header = "Tue, 22 Sep 2026 18:00:00 GMT"
        parsed = self.parse_header(header, "%a, %d %b %Y %H:%M:%S GMT")
        self.assertEqual(parsed["dates"]["published_at"], "2026-09-22T18:00:00Z")
        self.assertEqual(parsed["dates"]["precision"], "timestamp")
        self.assertEqual(parsed["dates"]["basis"], {"dom_path": "/rss/channel/item/pubDate", "text": header})
        self.assertEqual(parsed["dates"]["profile_status"], "matched")
        self.assertTrue(any(block["text"] == header and block["locator"]["dom_path"].endswith("/pubDate") for block in parsed["blocks"]))

    def test_explicit_numeric_offset_is_preserved_without_seoul_calendar_guess(self):
        header = "Wed, 23 Sep 2026 03:00:00 +0900"
        parsed = self.parse_header(header, "%a, %d %b %Y %H:%M:%S %z")
        self.assertEqual(parsed["dates"]["published_at"], "2026-09-23T03:00:00+09:00")
        self.assertEqual(parsed["dates"]["basis"]["text"], header)

    def test_ambiguous_zone_invalid_weekday_and_invalid_calendar_are_not_timestamps(self):
        cases = [
            ("Tue, 22 Sep 2026 18:00:00", "%a, %d %b %Y %H:%M:%S"),
            ("Tue, 22 Sep 2026 18:00:00 EST", "%a, %d %b %Y %H:%M:%S EST"),
            ("Mon, 22 Sep 2026 18:00:00 GMT", "%a, %d %b %Y %H:%M:%S GMT"),
            ("Tue, 31 Sep 2026 18:00:00 GMT", "%a, %d %b %Y %H:%M:%S GMT"),
            ("Tue, 22 Sep 2026 18:00:60 GMT", "%a, %d %b %Y %H:%M:%S GMT"),
            ("Tue, 22 Sep 2026 18:00:00 +2460", "%a, %d %b %Y %H:%M:%S %z"),
        ]
        for value, fmt in cases:
            with self.subTest(value=value):
                parsed = self.parse_header(value, fmt)
                self.assertIsNone(parsed["dates"]["published_at"])
                self.assertEqual(parsed["dates"]["profile_status"], "invalid-date")

    def test_existing_day_and_iso_timestamp_contracts_remain_unchanged(self):
        day = self.parse_header("Tue, 22 Sep 2026 18:00:00 GMT", "%a, %d %b %Y %H:%M:%S GMT", preserve=False)
        self.assertEqual(day["dates"]["published_at"], "2026-09-22")
        self.assertEqual(day["dates"]["precision"], "day")
        for value, expected in [
            ("2026-09-22T18:00:00Z", "2026-09-22T18:00:00Z"),
            ("2026-09-23T03:00:00+0900", "2026-09-23T03:00:00+09:00"),
        ]:
            with self.subTest(value=value):
                parsed = self.parse_header(value, "%Y-%m-%dT%H:%M:%S%z")
                self.assertEqual(parsed["dates"]["published_at"], expected)
                self.assertEqual(parsed["dates"]["precision"], "timestamp")


if __name__ == "__main__":
    unittest.main()
