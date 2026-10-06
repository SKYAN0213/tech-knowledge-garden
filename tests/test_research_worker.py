"""Parser regressions; run with the isolated worker Python runtime."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
import pymupdf


WORKER = Path(__file__).resolve().parents[1] / "integrations/research-worker/worker.py"


class WorkerTests(unittest.TestCase):
    def test_kari_listing_omits_only_the_new_badge_from_the_title(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = config["kari-space-press-ko"]["parse_options"]
        raw = '''<html lang="ko"><head><title>Press releases</title></head><body><div class="notice_list"><ul>
        <li><p class="subject"><a href="/kor/article/ATCL87374b48c/18726" class="new"><strong>누리호 5호기, 발사대로 이송 시작<span class="new">new</span></strong></a></p><p class="date">2026-10-06</p></li>
        <li><p class="subject"><a href="/kor/article/ATCL87374b48c/18725">A new technology report</a></p><p class="date">2026-09-30</p></li>
        </ul></div></body></html>'''
        parsed = self.invoke(raw.encode(), options, url="https://www.kari.re.kr/kor/article/ATCL87374b48c?pageIndex=1")["result"]
        links = [l for l in parsed["links"] if l.get("profile_id")]
        self.assertEqual(links[0]["text"], "누리호 5호기, 발사대로 이송 시작")
        self.assertEqual(links[0]["published_at"], "2026-10-06")
        self.assertEqual(links[1]["text"], "A new technology report")
        self.assertTrue(links[0]["url"].endswith("/18726"))

    def test_universal_robots_news_retains_both_reviewed_section_layouts(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"] if p["id"] == "universal-robots-news-center-article")
        for layout in ("sir-default", "is-default"):
            raw = f'''<html lang="en"><head><title>Legal dispute resolved</title></head><body><main>
            <sirius-section class="text-header {layout}"><sirius-heading><h1>Legal dispute resolved</h1></sirius-heading></sirius-section>
            <sirius-section class="article-info-bar {layout}"><time class="sir-date">October 1, 2026</time></sirius-section>
            <sirius-section class="text {layout}"><p>Teradyne Robotics and Elite Robots resolved their legal dispute by mutual agreement.</p><p>The terms are confidential and the settlement does not constitute an admission of liability.</p></sirius-section>
            <sirius-section class="author {layout}"><p>Author profile is outside the article.</p></sirius-section></main></body></html>'''
            parsed = self.invoke(raw.encode(), options)["result"]
            self.assertEqual(parsed["status"], "extracted")
            self.assertEqual(parsed["dates"]["published_at"], "2026-10-01")
            self.assertEqual(len(parsed["blocks"]), 2)
            self.assertNotIn("Author profile", " ".join(b["text"] for b in parsed["blocks"]))
            ambiguous = raw.replace('</main>', f'<sirius-section class="text {layout}"><p>Another article body.</p></sirius-section></main>')
            self.assertEqual(self.invoke(ambiguous.encode(), options)["worker_status"], "failed")

    def complete_index_fixture(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = config["nachi-financial-results-ja"]["parse_options"]
        body = '''<html lang="ja"><head><title>IR archive</title></head><body>
        <div class="lib-tab__txtarea"><div><h2>決算資料</h2></div>
        <table class="--ir-library"><tr><th rowspan="2">2026年10月5日</th><td><a href="/dcms_media/other/20261005_jp1.pdf">第3四半期決算短信</a></td></tr>
        <tr><td><a href="/dcms_media/other/20261005_jp2.pdf">決算短信補足資料</a></td></tr></table>
        <table class="--ir-library"><tr><th>2026年7月14日</th><td><a href="/dcms_media/other/20260714_1.pdf">第2四半期決算短信</a></td></tr></table>
        <table class="--ir-library"><tr><th>2026年7月22日</th><td><a href="/dcms_media/other/20260722_1.pdf">決算短信訂正</a></td></tr></table>
        <table class="--ir-library"><tr><th>2001年1月25日</th><td><a href="/dcms_media/other/0011..pdf">決算短信（連結・単独）</a></td></tr></table>
        </div><div><a href="/unrelated.pdf">Other IR document</a></div></body></html>'''
        return body, options

    def test_complete_static_index_retains_dated_primary_and_supplement_locators(self):
        body, options = self.complete_index_fixture()
        parsed = self.invoke(body.encode(), options, url="https://www.nachi-fujikoshi.co.jp/ir/earnings.html")["result"]
        self.assertEqual(parsed["complete_index"]["status"], "confirmed")
        self.assertEqual(parsed["complete_index"]["item_count"], 4)
        self.assertEqual(parsed["complete_index"]["paging_count"], 0)
        self.assertEqual(parsed["complete_index"]["profile"], options["complete_index"])
        links = [l for l in parsed["links"] if l.get("profile_id")]
        self.assertEqual(len(links), 4)
        self.assertEqual(links[0]["published_at"], "2026-10-05")
        self.assertEqual(len(links[0]["supporting_links"]), 1)
        self.assertTrue(links[0]["supporting_links"][0]["url"].endswith("20261005_jp2.pdf"))
        self.assertIn("/a", links[0]["supporting_links"][0]["dom_path"])
        self.assertEqual(links[2]["published_at"], "2026-07-22")

    def test_complete_static_index_cannot_hide_pagination_missing_terminal_or_duplicate_supports(self):
        body, options = self.complete_index_fixture()
        for changed in (body.replace("</body>", '<nav class="pager"><a href="?page=2">Next</a></nav></body>'), body.replace("決算短信（連結・単独）", "決算短信（途中）")):
            parsed = self.invoke(changed.encode(), options)["result"]
            self.assertEqual(parsed["complete_index"]["status"], "incomplete")
        duplicate = body.replace('</tr></table>', '<td><a href="/dcms_media/other/20261005_jp2.pdf">決算短信補足資料</a></td></tr></table>', 1)
        self.assertEqual(self.invoke(duplicate.encode(), options)["worker_status"], "failed")

    def test_common_metadata_basic_offset_retains_instant_and_raw_basis(self):
        raw = b'''<html><head><title>Research funding</title>
        <meta property="article:published_time" content="2026-10-05T11:49:24-0400">
        <meta property="article:modified_time" content="2026-10-05T14:10:02-0400">
        <script type="application/ld+json">{"@type":"Article","datePublished":"2026-10-05T11:49:24-0400","dateModified":"2026-10-05T14:10:02-0400"}</script>
        </head><body><article><p>Applications support irradiation testing.</p></article></body></html>'''
        result = self.invoke(raw, {"content_xpath": "//article"})["result"]
        dates = result["dates"]
        self.assertEqual(dates["published_at"], "2026-10-05T11:49:24-04:00")
        self.assertEqual(dates["modified_at"], "2026-10-05T14:10:02-04:00")
        self.assertEqual(dates["precision"], "timestamp")
        self.assertEqual(dates["profile_status"], "matched")
        self.assertEqual(dates["basis"]["sources"][0]["text"], "2026-10-05T11:49:24-0400")
        self.assertIn("2026-10-05T11:49:24-0400", dates["candidates"])

    def test_common_metadata_offset_repair_does_not_infer_or_accept_invalid_zone(self):
        for value in ("2026-10-05T11:49:24", "2026-10-05T11:49:24-2460", "2026-10-05T11:49:24-0460", "2026-10-05T11:49:24-24:00"):
            with self.subTest(value=value):
                raw = ('<html><head><title>Research funding</title><meta property="article:published_time" content="'+value+'"></head><body><article><p>Applications support testing.</p></article></body></html>').encode()
                dates = self.invoke(raw, {"content_xpath": "//article"})["result"]["dates"]
                self.assertIsNone(dates["published_at"])
                self.assertEqual(dates["profile_status"], "invalid-date")

    def test_inline_publication_date_preserves_substantive_news_paragraph(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in config["article_profiles"] if p["id"] == "robco-unicorn-press-20261005-v1")
        body = b'''<html><head><title>Company announcement</title></head><body><main><header><h1>Company announcement</h1>
        <div class="body-text w-richtext"><p>Employee secondary share sale.</p>
        <p>San Francisco, Austin and Munich, October 5, 2026 - Company valuation surpassed $1 billion.</p>
        <p>Manufacturing operations continue in Austin.</p></div></header></main></body></html>'''
        parsed = self.invoke(body, profile["options"])["result"]
        self.assertEqual(parsed["dates"]["published_at"], "2026-10-05")
        self.assertTrue(any("valuation surpassed $1 billion" in b["text"] for b in parsed["blocks"]))
        self.assertEqual(len(parsed["blocks"]), 3)
        invalid = {**profile["options"], "preserve_publication_date_block": "true"}
        self.assertNotEqual(self.invoke(body, invalid).get("status"), "extracted")

    def test_openai_system_card_registered_profile_uses_header_publication_not_changelog(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in config["article_profiles"] if p["id"] == "openai-deployment-safety-system-card-en-v1")
        template = b'''<html lang="en"><head><title>Safety Hub</title>
        <meta property="article:published_time" content="2026-08-19T12:00:00Z"></head><body>
        <nav>Other release</nav><main><section><header><h1>GPT-5.6 August Updates</h1>DATE</header>
        <div><div><section><article><p>August 19, 2026: corrected a table.</p></article></section>
        <section><article><p>Starting today we update ChatGPT; Codex keeps the July version.</p></article></section>
        <section><h2>Factuality</h2><article><p>Web-enabled grading used high-stakes prompts.</p></article></section></div></div>
        </section></main><aside>Published September 1, 2026</aside></body></html>'''
        for date, expected, status in [
            (b'<p class="text-meta">Published August 6, 2026</p>', "2026-08-06", "matched"),
            (b'', None, "missing"),
            (b'<p>Published August 6, 2026</p><p>Published August 7, 2026</p>', None, "ambiguous"),
            (b'<p>Published August 32, 2026</p>', None, "invalid-date"),
        ]:
            with self.subTest(status=status):
                result = self.invoke(template.replace(b"DATE", date), profile["options"],
                                     url="https://deploymentsafety.openai.com/gpt-5-6-august-update")["result"]
                self.assertEqual(result["title"], "GPT-5.6 August Updates")
                self.assertEqual(result["dates"]["published_at"], expected)
                self.assertEqual(result["dates"]["profile_status"], status)
                text = " ".join(block["text"] for block in result["blocks"])
                self.assertIn("August 19, 2026", text)
                self.assertIn("Codex keeps the July version", text)
                self.assertNotIn("Other release", text)
                self.assertNotIn("September 1, 2026", text)
                if expected:
                    self.assertEqual(result["dates"]["basis"]["text"], "Published August 6, 2026")

    def test_nvidia_publication_registered_profile_preserves_authors_and_display_date(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in config["article_profiles"] if p["id"] == "nvidia-research-publication-v1")
        template = b'''<html lang="en"><head><title>Paper | Research</title>
        <meta property="article:published_time" content="2026-09-09T12:00:00Z"></head>
        <body><nav>Related paper navigation</nav><section class="node-type-publication node-vm-full">
        <h1>Platformer research paper</h1><section><p>Researchers tested 31 participants on eight tasks.</p></section>
        <div class="field field--name-field-authors"><div class="field--items">
        <div class="field--item">Samin Shahriar Tokey (Worcester Polytechnic University)</div>
        <div class="field--item"><a href="/person/ben-boudaoud">Ben Boudaoud</a></div></div></div>
        <div class="field field--name-field-publication-date"><div class="field--label"><h2>Publication Date</h2></div>
        <div class="field--item">DATE</div></div>
        <div class="field field--name-field-published-in"><div class="field--item">Foundations of Digital Games</div></div>
        </section><aside><time datetime="2026-10-01T12:00:00Z">October 1, 2026</time></aside></body></html>'''
        for date, expected in [(b'<time datetime="2026-08-10T12:00:00Z">Monday, August 10, 2026</time>', "2026-08-10"), (b"", None)]:
            with self.subTest(date=expected):
                result = self.invoke(template.replace(b"DATE", date), profile["options"],
                                     url="https://research.nvidia.com/publication/2026-08_platformer")["result"]
                self.assertEqual(result["title"], "Platformer research paper")
                self.assertEqual(result["dates"]["published_at"], expected)
                self.assertEqual(result["dates"]["profile_status"], "matched" if expected else "missing")
                text = " ".join(block["text"] for block in result["blocks"])
                self.assertIn("Samin Shahriar Tokey", text)
                self.assertIn("Ben Boudaoud", text)
                self.assertIn("Foundations of Digital Games", text)
                self.assertNotIn("Related paper navigation", text)
                self.assertNotIn("October 1", text)

    def invoke(self, data, options=None, operation="parse", expected_hash=None, mime_type=None, url="https://example.com/news"):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            (root / "input.bin").write_bytes(data)
            req = {"schema_version": "research-worker/v1", "request_id": "fixture", "operation": operation, "input_path": "input.bin", "input_sha256": expected_hash or hashlib.sha256(data).hexdigest(), "source_id": "fixture", "source_version_id": "fixture:v1", "url": url, "options": options or {}}
            if mime_type:
                req["mime_type"] = mime_type
            import sys
            process = subprocess.run([sys.executable, str(WORKER), "--root", str(root)], input=json.dumps(req) + "\n", text=True, capture_output=True, timeout=60)
            self.assertEqual(process.returncode, 0, process.stderr)
            self.assertEqual(len(process.stdout.strip().splitlines()), 1, process.stdout[:500])
            return json.loads(process.stdout)

    def aws_date_fixture(self, header=b'August 26, 2026', metadata=b'2026-08-26T21:09:39.124', date_elements=None):
        elements = date_elements if date_elements is not None else b'<div class="PressReleasePage-datePublished">' + header + b'</div>'
        return b'''<html><head><title>AWS infrastructure announcement</title>
        <meta property="article:published_time" content="''' + metadata + b'''">
        <meta property="article:modified_time" content="2026-08-26T21:09:49.555">
        </head><body><div><h1>AWS and NVIDIA plan additional GPUs</h1>
        <div class="PressReleasePage-dates">''' + elements + b'''</div></div>
        <main><article><p>Deployment is planned for 2027 and 2028.</p></article></main></body></html>'''

    def aws_date_options(self):
        return {
            "content_xpath": "//article", "title_xpath": "//h1",
            "publication_date_xpath": "//div[contains(concat(' ',normalize-space(@class),' '),' PressReleasePage-dates ')]/div[contains(concat(' ',normalize-space(@class),' '),' PressReleasePage-datePublished ')]",
            "publication_date_pattern": "^[A-Z][a-z]+ [0-9]{1,2}, [0-9]{4}$",
            "publication_date_format": "%B %d, %Y",
        }

    def test_aws_registered_profile_uses_display_day_without_guessing_timezone(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"] if p["id"] == "aws-nvidia-two-million-gpus-20260826")
        result = self.invoke(self.aws_date_fixture(), options)["result"]
        self.assertEqual(result["dates"]["published_at"], "2026-08-26")
        self.assertEqual(result["dates"]["precision"], "day")
        self.assertEqual(result["dates"]["profile_status"], "matched")
        self.assertEqual(result["dates"]["basis"]["text"], "August 26, 2026")
        self.assertIn("2026-08-26T21:09:39.124", result["dates"]["candidates"])
        self.assertIsNone(result["dates"]["modified_at"])
        self.assertEqual(result["dates"]["modified_candidates"], ["2026-08-26T21:09:49.555"])

    def test_explicit_publication_profile_failure_does_not_reuse_metadata(self):
        cases = [
            (b'', "missing"),
            (b'<div class="PressReleasePage-datePublished">August 26, 2026</div><div class="PressReleasePage-datePublished">August 27, 2026</div>', "ambiguous"),
            (b'<div class="PressReleasePage-datePublished">date unavailable</div>', "no-match"),
            (b'<div class="PressReleasePage-datePublished">August 32, 2026</div>', "invalid-date"),
        ]
        for elements, status in cases:
            with self.subTest(status=status):
                raw = self.aws_date_fixture(metadata=b'2026-08-26T21:09:39Z', date_elements=elements)
                result = self.invoke(raw, self.aws_date_options())["result"]
                self.assertIsNone(result["dates"]["published_at"])
                self.assertEqual(result["dates"]["precision"], "unknown")
                self.assertEqual(result["dates"]["profile_status"], status)
                self.assertEqual(result["dates"]["candidates"], ["2026-08-26T21:09:39Z"])

    def test_html_parser_accepts_sec_xml_encoding_declaration_after_byte_decode(self):
        raw = b'''<?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE html><html><head><title>8-K</title></head><body>
        <h1>Tesla announces a corporate update</h1>
        <p>The company filed this current report on October 2, 2026.</p>
        </body></html>'''
        result = self.invoke(
            raw,
            {"title_xpath": "//h1", "content_xpath": "//body", "content_block_xpath": ".//p"},
            mime_type="text/html",
            url="https://www.sec.gov/Archives/edgar/data/1318605/000162828026064366/tsla-20261002.htm",
        )["result"]
        self.assertEqual(result["status"], "extracted")
        self.assertEqual(result["title"], "Tesla announces a corporate update")
        self.assertIn("October 2, 2026", " ".join(block["text"] for block in result["blocks"]))

    def test_explicit_publication_date_conflict_remains_unresolved(self):
        raw = self.aws_date_fixture(metadata=b'2026-08-27T21:09:39Z')
        result = self.invoke(raw, self.aws_date_options())["result"]
        self.assertIsNone(result["dates"]["published_at"])
        self.assertEqual(result["dates"]["profile_status"], "conflict")
        self.assertEqual(result["dates"]["basis"]["text"], "August 26, 2026")

    def test_explicit_timestamp_retains_selected_offset_instead_of_first_metadata(self):
        raw = b'''<html><head><title>Release</title>
        <meta property="article:published_time" content="2026-09-28T08:00:00Z"></head>
        <body><article><time class="release" datetime="2026-09-28T10:00:00+02:00">Release time</time>
        <p>The company announced a product.</p></article></body></html>'''
        options = {
            "content_xpath": "//article",
            "publication_date_xpath": "//article/time[@class='release']",
            "publication_date_attribute": "datetime",
            "publication_date_pattern": r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[+-][0-9]{2}:[0-9]{2}$",
            "publication_date_format": "%Y-%m-%dT%H:%M:%S%z",
            "publication_date_preserve_time": True,
        }
        result = self.invoke(raw, options)["result"]
        self.assertEqual(result["dates"]["published_at"], "2026-09-28T10:00:00+02:00")
        self.assertEqual(result["dates"]["basis"]["attribute"], "datetime")
        self.assertEqual(result["dates"]["candidates"], ["2026-09-28T08:00:00Z", "2026-09-28T10:00:00+02:00"])

    def test_html_article_can_use_exact_official_listing_date_with_provenance(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(
            profile["options"]
            for profile in config["article_profiles"]
            if profile["id"] == "robotsguide-robotics-article-v1"
        )
        listing = {
            "listing_published_at": "2026-09-28",
            "listing_date_text": "September 28, 2026",
            "listing_source_url": "https://spectrum.ieee.org/rss/robotics/fulltext",
            "listing_source_version_id": "listing:ieee-spectrum-20261002",
        }
        raw = b'''<html lang="en"><head><title>A Day in the Life of a Roboticist</title>
        <script type="application/ld+json">{"@type":"Article","datePublished":"September 28, 2026"}</script>
        </head><body><main><article><h1>A Day in the Life of a Roboticist</h1>
        <p>Charlie Kemp describes work on assistive robotics and research.</p></article></main></body></html>'''
        result = self.invoke(raw, {**options, **listing}, url="https://robotsguide.com/learn/a-day-in-the-life-of-a-roboticist-charlie-kemp")["result"]
        self.assertEqual(result["dates"]["published_at"], "2026-09-28")
        self.assertEqual(result["dates"]["precision"], "day")
        self.assertEqual(result["dates"]["profile_status"], "official-listing")
        self.assertEqual(result["dates"]["basis"]["source_url"], listing["listing_source_url"])
        self.assertEqual(result["dates"]["basis"]["source_version_id"], listing["listing_source_version_id"])
        self.assertEqual(result["dates"]["basis"]["text"], listing["listing_date_text"])
        missing_evidence = self.invoke(raw, {**options, "publication_date_from_listing": True})
        self.assertEqual(missing_evidence["worker_status"], "failed")

    def test_boston_dynamics_blog_profile_extracts_article_and_jsonld_publish_date(self):
        import re

        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in config["article_profiles"] if p["id"] == "boston-dynamics-blog-article-v1")
        url = "https://bostondynamics.com/blog/robot-hands-for-modern-ai-and-real-work"
        self.assertRegex(url, re.compile(profile["url_pattern"]))
        raw = b'''<html lang="en"><head><script type="application/ld+json">{"@graph":[{"@type":"Article","headline":"Robot Hands for Modern AI and Real Work","datePublished":"2026-10-01T13:10:02+00:00"}]}</script></head>
        <body><nav><p>Related story must not enter the article.</p></nav>
        <h1 class="fl-heading"><span class="fl-heading-text">Robot Hands for Modern AI and Real Work</span></h1>
        <div class="post-content"><p>The Atlas hand has 13 degrees of freedom.</p><h2>Design choices</h2><p>Direct actuation supports dexterous work.</p><ul><li>Four fingers</li></ul></div></body></html>'''
        result = self.invoke(raw, profile["options"], url=url)["result"]
        self.assertEqual(result["status"], "extracted")
        self.assertEqual(result["title"], "Robot Hands for Modern AI and Real Work")
        self.assertEqual(result["dates"]["published_at"], "2026-10-01T13:10:02+00:00")
        jsonld_basis = result["dates"]["basis"]["sources"][0]
        self.assertEqual(jsonld_basis["type"], "json-ld")
        self.assertEqual(jsonld_basis["attribute"], "datePublished")
        text = " ".join(block["text"] for block in result["blocks"])
        self.assertIn("13 degrees of freedom", text)
        self.assertIn("Four fingers", text)
        self.assertNotIn("Related story", text)

    def test_publication_date_not_applicable_suppresses_unrelated_structured_dates(self):
        raw = b'''<html lang="de"><head><script type="application/ld+json">{"@type":"Article","datePublished":"2022-12-08T14:26:50Z"}</script></head>
        <body><main><h1>Berichte</h1><p>Annual reports are listed by fiscal year.</p></main></body></html>'''
        options = {
            "language": "de",
            "title_xpath": "//main/h1",
            "content_xpath": "//main",
            "content_block_xpath": ".//h1|.//p",
            "publication_date_policy": "not_applicable",
        }
        result = self.invoke(raw, options, url="https://www.kuka.com/investor/reports")["result"]
        self.assertEqual(result["status"], "extracted")
        self.assertIsNone(result["dates"]["published_at"])
        self.assertEqual(result["dates"]["candidates"], [])
        self.assertIsNone(result["dates"]["basis"])
        self.assertEqual(result["dates"]["profile_status"], "not-applicable")

    def test_explicit_html_fragment_profile_parses_fragment_and_keeps_event_dates_private(self):
        raw = '''<section class="scrarea"><table class="list"><caption>목록</caption>
        <tbody><tr><td>1</td><td>두산로보틱스</td><td>2분기 경영실적 발표</td>
        <td>온라인</td><td>2026-07-24</td><td>16:00</td></tr></tbody></table></section>'''.encode()
        options = {
            "format": "html-fragment",
            "title_xpath": "//table[@class='list']/caption",
            "content_xpath": "//section[@class='scrarea']",
            "content_block_xpath": ".//table[@class='list']/tbody/tr[td]",
            "publication_date_policy": "not_applicable",
        }
        result = self.invoke(raw, options, mime_type="text/html; charset=UTF-8")["result"]
        self.assertEqual(result["status"], "extracted")
        self.assertEqual(result["title"], "목록")
        self.assertEqual(len(result["blocks"]), 1)
        self.assertIn("두산로보틱스", result["blocks"][0]["text"])
        self.assertIsNone(result["dates"]["published_at"])
        self.assertEqual(result["dates"]["profile_status"], "not-applicable")
        wrong_mime = self.invoke(raw, options, mime_type="application/octet-stream")
        self.assertEqual(wrong_mime["worker_status"], "failed")

    def test_html_fragment_listing_template_emits_event_date_without_publication_date(self):
        raw = '''<section class="scrarea"><table class="list"><caption>목록</caption>
        <tbody><tr class="first"><td>1414</td><td>두산로보틱스</td>
        <td><a onclick="fnDetailView('45182'); return false;">2026년 2분기 경영실적 발표</a></td>
        <td>온라인</td><td>2026-07-24</td><td>16:00</td></tr></tbody></table></section>'''.encode()
        options = {
            "format": "html-fragment",
            "title_xpath": "//table[@class='list']/caption",
            "content_xpath": "//section[@class='scrarea']",
            "content_block_xpath": ".//table[@class='list']/tbody/tr[td]",
            "publication_date_policy": "not_applicable",
            "listing_link_rules": [
                {
                    "id": "kind-ir-schedule-event-list-ko-v1",
                    "item_xpath": ".//table[@class='list']/tbody/tr[td]/td[3]/a",
                    "url_attribute": "onclick",
                    "url_pattern": r"^fnDetailView\('(?P<ir_seq>[0-9]+)'\); return false;$",
                    "url_template": "/corpgeneral/irschedule.do?irSeq={ir_seq}&method=searchIRScheduleDetail",
                    "title_xpath": ".",
                    "date_xpath": "ancestor::tr/td[5]",
                    "date_pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
                    "date_format": "%Y-%m-%d",
                    "date_kind": "event_date",
                    "category_xpath": "ancestor::tr/td[2]",
                }
            ],
        }
        result = self.invoke(raw, options, mime_type="text/html; charset=UTF-8", url="https://kind.krx.co.kr/corpgeneral/irschedule.do?method=searchIRScheduleSub")["result"]
        self.assertEqual(result["status"], "extracted")
        self.assertEqual(result["links"][0]["url"], "https://kind.krx.co.kr/corpgeneral/irschedule.do?irSeq=45182&method=searchIRScheduleDetail")
        self.assertEqual(result["links"][0]["event_date"], "2026-07-24")
        self.assertNotIn("published_at", result["links"][0])
        self.assertEqual(result["links"][0]["categories"], ["두산로보틱스"])

    def test_html_fragment_listing_template_can_build_url_from_xml_value(self):
        raw = '''<?xml version="1.0" encoding="UTF-8"?>
        <main><item><seqPressRelease>11150</seqPressRelease>
        <title>AI-native 전환 발표</title><date>2026.09.16</date></item></main>'''.encode()
        rule = {
            "id": "ahnlab-company-press-list-ko-v1",
            "item_xpath": "//main/item",
            "url_value_xpath": "./seqPressRelease",
            "url_pattern": r"(?P<seq>[1-9][0-9]{2,7})",
            "url_template": "/kr/news/press_release_view.do?seqPressRelease={seq}",
            "title_xpath": "./title",
            "date_xpath": "./date",
            "date_pattern": r"^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$",
            "date_format": "%Y.%m.%d",
        }
        options = {
            "format": "xml-fragment", "language": "ko", "title_xpath": "//main/item[1]/title",
            "content_xpath": "//main", "content_block_xpath": ".//item",
            "publication_date_policy": "not_applicable", "listing_link_rules": [rule],
        }
        parsed = self.invoke(raw, options, mime_type="application/xml; charset=UTF-8",
                             url="https://company.ahnlab.com/kr/news/press_release_list.do?pageNum=1")["result"]
        self.assertEqual(parsed["status"], "extracted")
        self.assertEqual(parsed["links"][0]["url"], "https://company.ahnlab.com/kr/news/press_release_view.do?seqPressRelease=11150")
        self.assertEqual(parsed["links"][0]["text"], "AI-native 전환 발표")
        self.assertEqual(parsed["links"][0]["published_at"], "2026-09-16")

        missing_value = json.loads(json.dumps(options))
        missing_value["listing_link_rules"][0]["url_value_xpath"] = "./missing"
        self.assertEqual(self.invoke(raw, missing_value, mime_type="application/xml; charset=UTF-8")["worker_status"], "failed")
        ambiguous_value = json.loads(json.dumps(options))
        ambiguous_value["listing_link_rules"][0]["url_value_xpath"] = "./seqPressRelease | ./title"
        self.assertEqual(self.invoke(raw, ambiguous_value, mime_type="application/xml; charset=UTF-8")["worker_status"], "failed")

    def test_declared_publisher_calendar_reconciles_offset_metadata_at_day_boundary(self):
        raw = '''<html lang="ko"><head><title>ASEC</title>
        <meta property="article:published_time" content="2026-09-27T15:00:00+00:00">
        </head><body><article><header><h1>공격 사례</h1><div class="published">9월 28 2026</div></header>
        <div class="entry-content"><p>확인된 공격 경로와 대응 방안을 설명한다.</p></div></article></body></html>'''.encode()
        options = {
            "title_xpath": "//article/header/h1", "content_xpath": "//article/div[@class='entry-content']",
            "publication_date_xpath": "//article/header/div[@class='published']",
            "publication_date_pattern": "^[0-9]{1,2}월 [0-9]{1,2} [0-9]{4}$",
            "publication_date_format": "%m월 %d %Y",
        }
        unresolved = self.invoke(raw, options)["result"]
        self.assertIsNone(unresolved["dates"]["published_at"])
        self.assertEqual(unresolved["dates"]["profile_status"], "conflict")
        resolved = self.invoke(raw, {**options, "publication_date_timezone": "Asia/Seoul"})["result"]
        self.assertEqual(resolved["dates"]["published_at"], "2026-09-28")
        self.assertEqual(resolved["dates"]["profile_status"], "matched")
        self.assertEqual(resolved["dates"]["candidates"], ["2026-09-27T15:00:00+00:00", "2026-09-28"])
        self.assertEqual(resolved["dates"]["basis"]["text"], "9월 28 2026")
        self.assertEqual(self.invoke(raw, {**options, "publication_date_timezone": "Not/AZone"})["worker_status"], "failed")

    def test_asec_public_profile_keeps_article_and_excludes_subscription_ui(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in config["article_profiles"] if p["id"] == "asec-public-ko-article-v1")
        self.assertIsNotNone(re.fullmatch(profile["url_pattern"], "https://asec.ahnlab.com/ko/95560/"))
        self.assertIsNone(re.fullmatch(profile["url_pattern"], "https://asec.ahnlab.com/en/95560/"))
        page = '''<html lang="ko"><head><title>ASEC</title>
        <meta property="article:published_time" content="2026-09-27T15:00:00+00:00"></head><body>
        <article class="post-content post-single"><header><h1 class="post-title">공격 사례</h1>
        <div class="slider-meta-left-content">9월 28 2026</div></header>
        <div class="entry-content"><p>국내 서버의 공격 경로를 확인했다.</p>
        <div class="CONTENT_AD_PLACE"><p>회원 서비스 구독 안내</p></div>
        <div class="post-footer"><h4>Tags:</h4></div></div></article></body></html>'''
        self.assertEqual(self.invoke(page.encode(), profile["options"], url="https://asec.ahnlab.com/ko/95560/")["worker_status"], "failed")
        options = {
            **profile["options"],
            "listing_published_at": "2026-09-28",
            "listing_source_url": "https://asec.ahnlab.com/ko/category/analysis-notes/",
            "listing_source_version_id": "fixture-listing:" + hashlib.sha256(b"ASEC listing fixture").hexdigest(),
            "listing_date_text": "9월 28 2026",
        }
        result = self.invoke(page.encode(), options, url="https://asec.ahnlab.com/ko/95560/")["result"]
        self.assertEqual(result["title"], "공격 사례")
        self.assertEqual(result["dates"]["published_at"], "2026-09-28")
        self.assertEqual(result["dates"]["profile_status"], "official-listing-confirmed-by-display")
        self.assertEqual(result["dates"]["basis"]["source_version_id"], options["listing_source_version_id"])
        self.assertEqual([block["text"] for block in result["blocks"]], ["국내 서버의 공격 경로를 확인했다."])
        conflicting = page.replace("9월 28 2026", "9월 27 2026")
        result = self.invoke(conflicting.encode(), options, url="https://asec.ahnlab.com/ko/95560/")["result"]
        self.assertIsNone(result["dates"]["published_at"])
        self.assertEqual(result["dates"]["profile_status"], "listing-display-mismatch")

    def test_asec_and_fda_listing_dates_require_matching_visible_article_date(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profiles = {profile["id"]: profile for profile in config["article_profiles"]}
        listing = {
            "listing_published_at": "2026-10-01",
            "listing_date_text": "October 1, 2026",
            "listing_source_url": "https://www.fda.gov/news-events/press-announcements",
            "listing_source_version_id": "listing:fda-20261003",
        }
        asec_options = profiles["asec-public-ko-article-v1"]["options"]
        asec = '''<html lang="ko"><head><meta property="article:published_time" content="2026-09-30T15:00:00+00:00"></head>
        <body><article class="post-content post-single"><header><h1 class="post-title">공격 사례</h1>
        <div class="slider-meta-left-content">10월 01 2026</div></header>
        <div class="entry-content"><p>공식 공지 내용이다.</p></div></article></body></html>'''.encode()
        asec_result = self.invoke(asec, {**asec_options, **listing}, url="https://asec.ahnlab.com/ko/95668/")["result"]
        self.assertEqual(asec_result["dates"]["published_at"], "2026-10-01")
        self.assertEqual(asec_result["dates"]["profile_status"], "official-listing-confirmed-by-display")
        self.assertEqual(asec_result["dates"]["basis"]["display_text"], "10월 01 2026")

        fda_options = profiles["fda-press-announcement-article-v1"]["options"]
        fda = b'''<html lang="en"><body><article id="main-content"><h1>FDA announcement</h1>
        <dl class="lcds-description-list--grid"><dd><time datetime="2026-10-01">October 01, 2026</time></dd></dl>
        <div role="main"><p>Official announcement text.</p><hr/></div></article></body></html>'''
        fda_result = self.invoke(fda, {**fda_options, **listing}, url="https://www.fda.gov/news-events/press-announcements/test")["result"]
        self.assertEqual(fda_result["dates"]["published_at"], "2026-10-01")
        self.assertEqual(fda_result["dates"]["profile_status"], "official-listing-confirmed-by-display")
        self.assertEqual(fda_result["dates"]["basis"]["display_text"], "October 01, 2026")

        mismatch = self.invoke(fda, {**fda_options, **{**listing, "listing_published_at": "2026-10-02"}}, url="https://www.fda.gov/news-events/press-announcements/test")["result"]
        self.assertIsNone(mismatch["dates"]["published_at"])
        self.assertEqual(mismatch["dates"]["profile_status"], "listing-display-mismatch")

    def test_timezone_less_html_metadata_dates_remain_candidates(self):
        result = self.invoke(self.aws_date_fixture(), {"content_xpath": "//article"})["result"]
        self.assertIsNone(result["dates"]["published_at"])
        self.assertIsNone(result["dates"]["modified_at"])
        self.assertEqual(result["dates"]["profile_status"], "invalid-date")
        self.assertEqual(result["dates"]["modified_profile_status"], "invalid-date")
        self.assertEqual(result["dates"]["candidates"], ["2026-08-26T21:09:39.124"])
        self.assertEqual(result["dates"]["modified_candidates"], ["2026-08-26T21:09:49.555"])
        self.assertEqual(result["status"], "extracted")

    def test_common_semantic_jsonld_published_date_is_extracted_with_provenance(self):
        raw = b'''<html><head><title>Release</title>
        <script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","datePublished":"2026-09-08T07:00:30-0400"},{"@type":"WebPage","datePublished":"2099-01-01"},{"@type":"NewsArticle","dateModified":"2026-09-09"}]}</script>
        </head><body><article><h1>Release</h1><p>Company announced a release.</p></article></body></html>'''
        result = self.invoke(raw)["result"]
        self.assertEqual(result["dates"]["published_at"], "2026-09-08T07:00:30-04:00")
        self.assertEqual(result["dates"]["profile_status"], "matched")
        self.assertEqual(result["dates"]["precision"], "timestamp")
        self.assertEqual(result["dates"]["basis"]["sources"][0]["type"], "json-ld")
        self.assertEqual(result["dates"]["basis"]["sources"][0]["attribute"], "datePublished")

    def test_vast_dataenclave_profile_selects_published_date_and_article_body(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in config["article_profiles"] if p["id"] == "vast-dataenclave-press-release-v1")
        url = "https://www.vastdata.com/press-releases/vast-data-introduces-dataenclave-to-bring-leading-ai-models-and-enterprise-data-together-on-trusted-infrastructure"
        self.assertIsNotNone(re.fullmatch(profile["url_pattern"], url))
        self.assertIsNone(re.fullmatch(profile["url_pattern"], url + "-unrelated"))
        raw = b'''<html lang="en"><head><title>VAST release</title>
        <meta property="article:published_time" content="2026-09-21T18:43:15.165Z">
        <meta property="article:modified_time" content="2026-09-21T18:43:15.165Z">
        <script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-09-22","dateModified":"2026-09-21T19:29:22.272Z"}</script>
        </head><body><div class="blog-post-main-section"><h1>VAST Data Introduces DataEnclave</h1></div>
        <div class="blog-post-middle-content-section"><div class="content-warpper prose">
        <p>NEW YORK CITY - September 22, 2026 - VAST Data announced DataEnclave.</p>
        <h2>Confidential AI</h2><p>DataEnclave uses a hardware-isolated runtime.</p>
        </div><footer>About VAST Data</footer></div></body></html>'''
        result = self.invoke(raw, profile["options"], url=url)["result"]
        self.assertEqual(result["title"], "VAST Data Introduces DataEnclave")
        self.assertEqual(result["dates"]["published_at"], "2026-09-22")
        self.assertIn("2026-09-21T18:43:15.165Z", result["dates"]["candidates"])
        self.assertIsNone(result["dates"]["modified_at"])
        self.assertEqual(result["dates"]["modified_profile_status"], "before-publication")
        self.assertEqual(result["dates"]["profile_status"], "matched")
        self.assertTrue(any("announced DataEnclave" in block["text"] for block in result["blocks"]))
        self.assertFalse(any("About VAST Data" in block["text"] for block in result["blocks"]))

    def test_official_candidate_profiles_extract_article_dates_and_bodies(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profiles = {p["id"]: p for p in config["article_profiles"]}
        cases = [
            (
                "sunrun-tesla-grid-dispatch-20260921-v1",
                "https://investors.sunrun.com/news-events/press-releases/detail/381/sunrun-and-tesla-dispatch-580-megawatts-to-californias",
                b'''<html lang="en"><head><meta name="published_time" content="2026-09-21"></head><body>
                <article class="full-news-article"><h1 class="article-heading">Sunrun and Tesla dispatch 580 megawatts</h1>
                <p>More than 140,000 home batteries dispatched power to California's grid.</p></article><footer>Investor navigation</footer></body></html>''',
                "2026-09-21",
                "Sunrun and Tesla",
                "140,000 home batteries",
                "Investor navigation",
            ),
            (
                "proofpoint-agentic-data-ai-security-20260922-v1",
                "https://www.proofpoint.com/us/newsroom/press-releases/proofpoint-breaks-down-divide-between-data-security-and-ai-security",
                b'''<html lang="en"><head><meta property="article:published_time" content="2026-09-21T10:05:57-07:00"></head><body>
                <article class="node-news-main-content"><h3 class="news-main-content__title">Proofpoint Agentic Data and AI Security</h3>
                <time datetime="2026-09-22T11:00:00Z">September 22, 2026</time><p>Proofpoint announced a unified agentic security system.</p></article></body></html>''',
                "2026-09-22",
                "Proofpoint Agentic",
                "unified agentic security system",
                None,
            ),
            (
                "kasa-second-space-center-demand-meeting-20260922-v1",
                "https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=498",
                '''<html lang="ko"><body><div class="board-view__header"><h2 class="board-view__title">제2우주센터 민간활용 수요기업 간담회 개최</h2>
                <span class="info__date">작성자 우주항공청</span><span class="info__date">등록일 2026-09-22 14:00</span></div>
                <div class="board-view__contents-inner"><p>우주항공청은 국내 발사체 기업이 참여하는 간담회를 개최했다.</p></div></body></html>'''.encode("utf-8"),
                "2026-09-22",
                "제2우주센터 민간활용",
                "국내 발사체 기업",
                None,
            ),
            (
                "cyber-centre-cisco-ise-advisory-al26-021-v1",
                "https://www.cyber.gc.ca/en/alerts-advisories/al26-021-vulnerabilities-impacting-cisco-identity-services-engine-ise-cisco-ise-passive-identity-connector-ise-pic-cve-2026-20192-cve-2026-76423-cve-2026-76460",
                b'''<html lang="en"><head><title>AL26-021 Cisco security alert</title></head><body><main>
                <p><strong>Number:</strong> AL26-021<br><strong>Date:</strong> September 17, 2026</p><h2>Audience</h2>
                <p>This alert covers vulnerabilities in Cisco Identity Services Engine.</p></main></body></html>''',
                "2026-09-17",
                "AL26-021 Cisco",
                "vulnerabilities in Cisco Identity Services Engine",
                None,
            ),
        ]
        proofpoint_result = None
        for profile_id, url, raw, expected_date, title_part, body_part, excluded in cases:
            with self.subTest(profile=profile_id):
                profile = profiles[profile_id]
                self.assertIsNotNone(re.fullmatch(profile["url_pattern"], url))
                self.assertIsNone(re.fullmatch(profile["url_pattern"], url + "-unrelated"))
                result = self.invoke(raw, profile["options"], url=url)["result"]
                self.assertEqual(result["dates"]["published_at"], expected_date)
                self.assertEqual(result["dates"]["profile_status"], "matched")
                self.assertIn(title_part, result["title"])
                body = "\n".join(block["text"] for block in result["blocks"])
                self.assertIn(body_part, body)
                if excluded:
                    self.assertNotIn(excluded, body)
                if profile_id == "proofpoint-agentic-data-ai-security-20260922-v1":
                    proofpoint_result = result
        self.assertIn("2026-09-21T10:05:57-07:00", proofpoint_result["dates"]["candidates"])

    def test_common_time_itemprop_date_published_is_extracted_but_arbitrary_time_is_ignored(self):
        raw = b'''<html><head><title>Release</title></head><body><article><h1>Release</h1>
        <time datetime="2099-01-01">Related story</time>
        <time itemprop="datePublished" datetime="2026-09-17">17.09.2026</time>
        <p>Company announced a release.</p></article></body></html>'''
        result = self.invoke(raw)["result"]
        self.assertEqual(result["dates"]["published_at"], "2026-09-17")
        self.assertEqual(result["dates"]["basis"]["sources"][0]["type"], "time-itemprop")

    def test_conflicting_common_publication_metadata_stays_unresolved(self):
        raw = b'''<html><head><title>Release</title>
        <script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-09-08"}</script>
        </head><body><article><h1>Release</h1><time itemprop="datePublished" datetime="2026-09-09"></time>
        <p>Company announced a release.</p></article></body></html>'''
        result = self.invoke(raw)["result"]
        self.assertIsNone(result["dates"]["published_at"])
        self.assertEqual(result["dates"]["profile_status"], "conflict")
        self.assertEqual(result["dates"]["candidates"], ["2026-09-09", "2026-09-08"])

    def test_offset_html_timestamps_and_day_metadata_are_preserved(self):
        for value in (b'2026-08-26', b'2026-08-26T21:09:39.124Z', b'2026-08-26T21:09:39+09:00'):
            with self.subTest(value=value):
                raw = self.aws_date_fixture(metadata=value).replace(b'2026-08-26T21:09:49.555', b'2026-08-26T21:09:49.555Z')
                result = self.invoke(raw, {"content_xpath": "//article"})["result"]
                self.assertEqual(result["dates"]["published_at"], value.decode())
                self.assertEqual(result["dates"]["modified_at"], "2026-08-26T21:09:49.555Z")

    def test_aws_date_profile_is_scoped_to_one_announcement(self):
        import re
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in config["article_profiles"] if p["id"] == "aws-nvidia-two-million-gpus-20260826")
        url = "https://press.aboutamazon.com/aws/2026/8/aws-and-nvidia-to-deliver-2-million-additional-gpus-and-next-generation-infrastructure-for-agentic-and-physical-ai"
        self.assertIsNotNone(re.fullmatch(profile["url_pattern"], url))
        self.assertIsNotNone(re.fullmatch(profile["url_pattern"], url + "/"))
        for other in (url + "-unrelated", url.replace("2026/8", "2026/9"), "https://press.aboutamazon.com/other-announcement"):
            self.assertIsNone(re.fullmatch(profile["url_pattern"], other))

    def test_abb_global_news_profile_reads_embedded_publication_day_and_body(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in config["article_profiles"] if p["id"] == "abb-global-en-news-detail")
        url = "https://www.abb.com/global/en/news/138831/prsrl-abb-robotics-e-device"
        self.assertIsNotNone(re.fullmatch(profile["url_pattern"], url))
        self.assertIsNone(re.fullmatch(profile["url_pattern"], url.replace("/global/en/news/", "/global/de/news/")))
        raw = b'''<html lang="en"><head><title>ABB article</title>
        <script>let pressReleaseDynamicObj = {"newsContent":"Pilot in 2026-09-01",
        "newsMetadata":{"scheduledPublishDate" : "2026-09-21T05:56:33.5300000Z"}};</script>
        </head><body><main><div class="pressrelease"><div class="aot-visually-hidden">
        <h1>ABB Robotics introduces E-Device</h1><p>Press release</p>
        <p>ABB Robotics introduced a safety interface for robot programming.</p>
        <blockquote>ABB says the interface may reduce training time.</blockquote>
        <blockquote><p>ABB says deployment may also accelerate.</p></blockquote>
        </div></div><aside><p>Unrelated ABB article dated 2026-09-22.</p></aside></main></body></html>'''
        result = self.invoke(raw, profile["options"])["result"]
        self.assertEqual(result["title"], "ABB Robotics introduces E-Device")
        self.assertEqual(result["dates"]["published_at"], "2026-09-21")
        self.assertEqual(result["dates"]["profile_status"], "matched")
        self.assertEqual(result["dates"]["precision"], "day")
        self.assertTrue(any("safety interface" in block["text"] for block in result["blocks"]))
        self.assertEqual(sum("may reduce training time" in block["text"] for block in result["blocks"]), 1)
        self.assertEqual(sum("deployment may also accelerate" in block["text"] for block in result["blocks"]), 1)
        self.assertFalse(any("Unrelated ABB article" in block["text"] for block in result["blocks"]))
        missing = self.invoke(raw.replace(b"scheduledPublishDate", b"otherDate"), profile["options"])["result"]
        self.assertIsNone(missing["dates"]["published_at"])
        self.assertEqual(missing["dates"]["profile_status"], "missing")
        invalid = self.invoke(raw.replace(b"2026-09-21", b"2026-09-32"), profile["options"])["result"]
        self.assertIsNone(invalid["dates"]["published_at"])
        self.assertEqual(invalid["dates"]["profile_status"], "invalid-date")

    def metr_date_fixture(self, date_elements=b'<span class="post-date">August 26, 2026</span>', metadata=b''):
        return b'''<html><head><title>METR incident investigation</title>''' + metadata + b'''</head><body>
        <div class="header-title">Brief independent investigation</div>
        <div class="header-date"><h5>DATE</h5>''' + date_elements + b'''</div>
        <div class="content post-content"><p>METR investigated the incident.</p></div>
        </body></html>'''

    def metr_date_options(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        return next(p["options"] for p in config["article_profiles"] if p["id"] == "metr-hf-investigation-20260826")

    def test_metr_registered_profile_reads_displayed_publication_day(self):
        result = self.invoke(self.metr_date_fixture(), self.metr_date_options())["result"]
        self.assertEqual(result["dates"]["published_at"], "2026-08-26")
        self.assertEqual(result["dates"]["precision"], "day")
        self.assertEqual(result["dates"]["profile_status"], "matched")
        self.assertEqual(result["dates"]["basis"]["text"], "August 26, 2026")
        self.assertEqual(result["title"], "Brief independent investigation")
        self.assertTrue(any("METR investigated the incident." in block["text"] for block in result["blocks"]))

    def test_metr_publication_date_profile_fails_closed(self):
        cases = [
            (b'', "missing"),
            (b'<span class="post-date">August 26, 2026</span><span class="post-date">August 27, 2026</span>', "ambiguous"),
            (b'<span class="post-date">date unavailable</span>', "no-match"),
            (b'<span class="post-date">August 32, 2026</span>', "invalid-date"),
        ]
        for elements, status in cases:
            with self.subTest(status=status):
                result = self.invoke(self.metr_date_fixture(date_elements=elements), self.metr_date_options())["result"]
                self.assertIsNone(result["dates"]["published_at"])
                self.assertEqual(result["dates"]["profile_status"], status)

    def test_metr_profile_is_scoped_to_the_investigation_page(self):
        import re
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in config["article_profiles"] if p["id"] == "metr-hf-investigation-20260826")
        url = "https://metr.org/blog/2026-08-26-openai-hugging-face-incident-investigation"
        self.assertIsNotNone(re.fullmatch(profile["url_pattern"], url))
        self.assertIsNotNone(re.fullmatch(profile["url_pattern"], url + "/"))
        for other in (url + "-update", url.replace("2026-08-26", "2026-08-27"), "https://metr.org/blog/another-post"):
            self.assertIsNone(re.fullmatch(profile["url_pattern"], other))

    def test_html_math_preserves_publisher_tex_and_source_locations_once(self):
        raw = b'''<html><head><title>Prediction results</title></head><body><article>
        <p>Mean <math alttext="R^{2}"><semantics><msup><mi>R</mi><mn>2</mn></msup><annotation encoding="application/x-tex">R^{2}</annotation></semantics></math> is 76.8%, versus 60.0% for the baseline.</p>
        <table><tr><th>Metric</th><th>Value</th></tr><tr><td><math><semantics><msub><mi>x</mi><mi>i</mi></msub><annotation encoding="application/x-tex">x_i</annotation></semantics></math></td><td>12</td></tr></table>
        </article></body></html>'''
        r = self.invoke(raw, {"content_xpath": "//article"})["result"]
        self.assertEqual(r["status"], "extracted")
        self.assertIn("Mean R^{2} is 76.8%", r["blocks"][0]["text"])
        self.assertEqual(r["blocks"][0]["text"].count("R^{2}"), 1)
        self.assertEqual(r["blocks"][1]["rows"][1], ["x_i", "12"])
        expressions = r["math_expressions"]
        self.assertEqual([e["basis"] for e in expressions], ["alttext", "tex-annotation"])
        self.assertEqual(expressions[0]["dom_path"], "/html/body/article/p/math")
        self.assertEqual(expressions[0]["text"], "R^{2}")
        self.assertEqual(len(expressions[0]["mathml_serialization_sha256"]), 64)
        self.assertEqual(r["quality"]["missing_math"], [])
        for b in r["blocks"]:
            self.assertEqual(b["locator"]["text_hash"], hashlib.sha256(b["text"].encode()).hexdigest())

    def test_generic_html_extraction_keeps_math_in_real_reader_prose(self):
        raw = b'''<html><head><title>Geospatial prediction research</title></head><body><main><article>
        <h1>Geospatial prediction research</h1>
        <p>Researchers evaluate geospatial prediction models across health and environmental tasks. The reported mean <math alttext="R^{2}"><msup><mi>R</mi><mn>2</mn></msup></math> is 76.8% for twenty-one health indicators, compared with 60.0% for the expert baseline.</p>
        <p>The experiment separates training and test observations before fitting the models. Researchers use the same target variables and compare several feature combinations, with spatial validation for model selection.</p>
        </article></main></body></html>'''
        r = self.invoke(raw)["result"]
        self.assertEqual(r["status"], "extracted")
        b = next(b for b in r["blocks"] if "76.8%" in b["text"])
        self.assertIn("R^{2}", b["text"])
        self.assertIsNotNone(b["locator"]["dom_path"])
        self.assertEqual(len(r["math_expressions"]), 1)

    def test_mathml_structures_preserve_fraction_scripts_and_namespaces(self):
        raw = b'''<html><head><title>Model equation</title></head><body><article><p>
        Score <math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><msubsup><mi>x</mi><mi>i</mi><mn>2</mn></msubsup><mo>=</mo><mfrac><mi>a</mi><mi>b</mi></mfrac></mrow></math> uses explicit source operators.
        </p></article></body></html>'''
        r = self.invoke(raw, {"content_xpath": "//article"})["result"]
        self.assertEqual(r["status"], "extracted")
        self.assertIn(r"x_{i}^{2}=\frac{a}{b}", r["blocks"][0]["text"])
        self.assertEqual(r["math_expressions"][0]["basis"], "presentation-mathml")

    def test_unsupported_or_conflicting_math_is_partial_without_silent_flattening(self):
        for markup, reason in [
            (b'<math><maction><mi>x</mi><mi>y</mi></maction></math>', "unsupported-presentation"),
            (b'<math alttext="R^{2}"><semantics><msup><mi>R</mi><mn>2</mn></msup><annotation encoding="application/x-tex">R^{3}</annotation></semantics></math>', "conflicting-tex-alternatives"),
            (b'<math><msup><mi>R</mi></msup></math>', "unsupported-presentation"),
            (b'<math><mi mathvariant="bold">x</mi></math>', "unsupported-presentation"),
            (b'<math><mfrac linethickness="0"><mi>a</mi><mi>b</mi></mfrac></math>', "unsupported-presentation"),
        ]:
            with self.subTest(reason=reason):
                raw = b'<html><head><title>Math evidence</title></head><body><article><p>Metric '+markup+b' remains unresolved.</p></article></body></html>'
                r = self.invoke(raw, {"content_xpath": "//article"})["result"]
                self.assertEqual(r["status"], "partial")
                self.assertFalse(r["quality"]["required_fields_present"])
                self.assertEqual(r["quality"]["missing_math"][0]["reason"], reason)
                self.assertIn("[수식 원문 확인 필요]", r["blocks"][0]["text"])
                self.assertIsNone(r["math_expressions"][0]["text"])

    def test_math_compound_script_base_preserves_grouping(self):
        raw = b'<html><head><title>Grouped equation</title></head><body><article><p><math><msup><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mn>2</mn></msup></math></p></article></body></html>'
        r = self.invoke(raw, {"content_xpath": "//article"})["result"]
        self.assertEqual(r["status"], "extracted")
        self.assertEqual(r["blocks"][0]["text"], "{a+b}^{2}")

    def test_explicit_reader_container_ignores_math_outside_its_scope(self):
        raw = b'<html><head><title>Scoped article</title></head><body><aside><math><maction><mi>x</mi></maction></math></aside><article><p>The source article contains no equation.</p></article></body></html>'
        r = self.invoke(raw, {"content_xpath": "//article"})["result"]
        self.assertEqual(r["status"], "extracted")
        self.assertNotIn("math_expressions", r)

    def test_pinned_arxiv_fulltext_profile_keeps_authors_math_and_captions(self):
        import re
        cfg = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in cfg["article_profiles"] if p["id"] == "arxiv-ppe-html-v1")
        self.assertTrue(re.search(profile["url_pattern"], "https://arxiv.org/html/2608.26088v1"))
        self.assertFalse(re.search(profile["url_pattern"], "https://arxiv.org/html/2608.26088v2"))
        raw = b'''<html><head><title>Site shell</title></head><body><nav>Navigation</nav>
        <article class="ltx_document"><h1>Planetary Prediction Engine</h1><div class="ltx_authors">Evelyn Ma, Google Research</div>
        <h6>Abstract</h6><p>Reported <math alttext="R^{2}"><msup><mi>R</mi><mn>2</mn></msup></math> is 76.8%.</p>
        <figure><figcaption>Figure 1: Three modular stages.</figcaption></figure></article></body></html>'''
        r = self.invoke(raw, profile["options"])["result"]
        self.assertEqual(r["title"], "Planetary Prediction Engine")
        self.assertEqual(r["title_profile_status"], "matched")
        self.assertEqual(r["dates"]["published_at"], None)
        self.assertTrue(any("Evelyn Ma" in b["text"] for b in r["blocks"]))
        self.assertTrue(any("Figure 1" in b["text"] for b in r["blocks"]))
        self.assertTrue(any("R^{2}" in b["text"] for b in r["blocks"]))
        self.assertEqual(next(b for b in r["blocks"] if b["text"] == "Abstract")["kind"], "heading")
        self.assertFalse(any("Navigation" in b["text"] for b in r["blocks"]))

    def test_markdown_source_preserves_reader_text_lines_tables_links_and_code(self):
        raw = '''# 로봇 업데이트

* **로봇**은 `controller`를 사용한다.
  둘째 줄에는 [기술 보고서](/report.pdf)를 연결한다.
  * 하위 조건: 계획이며 완료가 아니다.

| 조건 | 결과 |
| --- | --- |
| 계획 | 50대 |

```sh
echo 'source command only'
```
'''.encode()
        response = self.invoke(raw, mime_type="text/markdown; charset=utf-8")
        self.assertEqual(response["worker_status"], "complete")
        result = response["result"]
        self.assertEqual(result["parser"]["id"], "markdown-it-py")
        self.assertEqual(result["title"], "로봇 업데이트")
        self.assertEqual(result["status"], "extracted")
        self.assertIsNone(result["dates"]["published_at"])
        self.assertIsNone(result["dates"]["modified_at"])
        paragraphs = [b for b in result["blocks"] if b["kind"] == "paragraph"]
        self.assertEqual(paragraphs[0]["text"], "로봇은 controller를 사용한다. 둘째 줄에는 기술 보고서를 연결한다.")
        self.assertEqual(paragraphs[0]["locator"]["line_start"], 3)
        self.assertEqual(paragraphs[0]["locator"]["line_end"], 4)
        self.assertEqual(paragraphs[1]["text"], "하위 조건: 계획이며 완료가 아니다.")
        table = next(b for b in result["blocks"] if b["kind"] == "table")
        self.assertEqual(table["rows"], [["조건", "결과"], ["계획", "50대"]])
        self.assertEqual(table["locator"]["line_start"], 7)
        self.assertEqual(table["locator"]["line_end"], 9)
        code = next(b for b in result["blocks"] if b["kind"] == "code")
        self.assertIn("source command only", code["text"])
        self.assertEqual(result["attachments"], [{"url": "https://example.com/report.pdf", "role": "unreviewed"}])
        for b in result["blocks"]:
            self.assertEqual(b["locator"]["type"], "markdown")
            self.assertEqual(b["locator"]["text_hash"], hashlib.sha256(b["text"].encode()).hexdigest())
            self.assertTrue(b["locator"]["source_text_hash"])

    def test_markdown_missing_or_ambiguous_title_stays_partial_without_url_date(self):
        for text in ["## v0.0.116\n\nA release detail.", "# One\n\n# Two\n\nA detail."]:
            result = self.invoke(text.encode(), mime_type="text/markdown")["result"]
            self.assertEqual(result["status"], "partial")
            self.assertIsNone(result["title"])
            self.assertIsNone(result["dates"]["published_at"])
            self.assertFalse(result["quality"]["required_fields_present"])
            self.assertTrue(result["blocks"])
        unsupported = self.invoke(b'# Not a declared Markdown response')["result"]
        self.assertEqual(unsupported["status"], "unsupported")

    def test_markdown_title_line_selects_only_an_explicit_original_h1(self):
        raw = b"September 10, 2026\n\n# Article title\n\nContent.\n\n# Interactive demo\n"
        result = self.invoke(raw, {"markdown_title_line": 3}, mime_type="text/markdown")["result"]
        self.assertEqual(result["title"], "Article title")
        self.assertEqual(result["title_basis"]["line_start"], 3)
        self.assertEqual(result["status"], "extracted")
        self.assertTrue(any(block["text"] == "Interactive demo" for block in result["blocks"]))
        for line in [True, 0, "3", 2, 5, 8]:
            rejected = self.invoke(raw, {"markdown_title_line": line}, mime_type="text/markdown")
            self.assertEqual(rejected["worker_status"], "failed", line)

    def test_markdown_date_requires_profiled_line_and_valid_calendar(self):
        options = {"markdown_publication_date_line": 3, "publication_date_pattern": r"[A-Z][a-z]+ [0-9]{1,2}, [0-9]{4}", "publication_date_format": "%B %d, %Y"}
        raw = b'# Release\n\nPublished: August 28, 2026\n\nBody.\n\nUpdated: September 27, 2026\n'
        r = self.invoke(raw, options, mime_type="text/markdown")["result"]
        self.assertEqual(r["dates"]["published_at"], "2026-08-28")
        self.assertEqual(r["dates"]["profile_status"], "matched")
        self.assertEqual(r["dates"]["basis"]["line_start"], 3)
        self.assertIsNone(r["dates"]["modified_at"])
        missing = self.invoke(raw, {**options, "markdown_publication_date_line": 4}, mime_type="text/markdown")["result"]
        self.assertIsNone(missing["dates"]["published_at"])
        self.assertEqual(missing["dates"]["profile_status"], "no-match")
        invalid = self.invoke(raw.replace(b'August 28', b'August 32'), options, mime_type="text/markdown")["result"]
        self.assertIsNone(invalid["dates"]["published_at"])
        self.assertEqual(invalid["dates"]["profile_status"], "invalid-date")

    def test_markdown_mime_does_not_promote_html_challenge_or_invalid_utf8(self):
        challenge = b'<!doctype html><html><title>Just a moment</title></html>'
        self.assertEqual(self.invoke(challenge, mime_type="text/markdown")["result"]["status"], "blocked")
        self.assertEqual(self.invoke(b'# title\n\n\xff', mime_type="text/markdown")["worker_status"], "failed")
        source = b'# HTML sample\n\n```html\n<html><title>Code example</title></html>\n```\n'
        sample = self.invoke(source, mime_type="text/markdown")["result"]
        self.assertEqual(sample["parser"]["id"], "markdown-it-py")
        self.assertEqual(sample["title"], "HTML sample")
        self.assertEqual(sample["blocks"][1]["kind"], "code")
        self.assertIn('<html>', sample["blocks"][1]["text"])

    def test_multilingual_large_pipe_and_distinct_publication_modified_dates(self):
        para = "産業用ロボットの計画を確認する。 협동로봇의 출하 계획을 확인한다。 " * 1500
        raw = ('<!doctype html><html lang="ja"><head><title>ロボット</title><meta property="article:published_time" content="2026-09-11"><meta property="article:modified_time" content="2026-09-27"></head><body><article><p>' + para + '</p><p>FANUC plans to ship in December.</p></article></body></html>').encode()
        result = self.invoke(raw)["result"]
        self.assertEqual(result["dates"]["published_at"], "2026-09-11")
        self.assertEqual(result["dates"]["modified_at"], "2026-09-27")
        for b in result["blocks"]:
            self.assertEqual(b["locator"]["text_hash"], hashlib.sha256(b["text"].encode()).hexdigest())

    def test_challenge_is_not_body_and_input_hash_is_required(self):
        data = b'<!doctype html><html><title>Just a moment</title><body>Verify you are human</body></html>'
        r = self.invoke(data)["result"]
        self.assertEqual(r["status"], "blocked")
        self.assertEqual(r["blocks"], [])
        self.assertEqual(self.invoke(data, expected_hash="wrong")["worker_status"], "failed")

    def test_source_dateline_profile_preserves_original_day_and_conflicts(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"] if p["id"] == "universal-robots-gen7-release")
        text = b'<article><h1>Universal Robots announces Gen 7</h1><p>Chicago, IL, USA, September 14, 2026: Universal Robots introduced Gen 7 at IMTS.</p><p>Three robot arms use a new controller and a force sensor.</p></article>'
        normal = self.invoke(b'<html><head><title>Gen 7</title></head><body>'+text+b'</body></html>', options)["result"]
        self.assertEqual(normal["dates"]["published_at"], "2026-09-14")
        self.assertTrue(normal["dates"]["basis"]["dom_path"])
        self.assertIn("Chicago", normal["dates"]["basis"]["text"])
        missing = self.invoke(b'<html><head><title>Gen 7</title></head><body>'+text.replace(b"September 14, 2026", b"date not specified")+b'</body></html>', options)["result"]
        self.assertIsNone(missing["dates"]["published_at"])
        conflicting = self.invoke(b'<html><head><title>Gen 7</title><meta property="article:published_time" content="2026-09-13"></head><body>'+text+b'</body></html>', options)["result"]
        self.assertIsNone(conflicting["dates"]["published_at"])
        self.assertEqual(set(conflicting["dates"]["candidates"]), {"2026-09-13", "2026-09-14"})

    def test_arxiv_pinned_version_uses_submission_date_and_preserves_later_revision(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in config["article_profiles"] if p["id"] == "arxiv-ppe-v1-20260826")
        import re
        self.assertTrue(re.search(profile["url_pattern"], "https://arxiv.org/abs/2608.26088v1"))
        self.assertFalse(re.search(profile["url_pattern"], "https://arxiv.org/abs/2608.26088v2"))
        raw = b'''<html><head><title>Planetary Prediction Engine</title></head><body><article>
        <div class="dateline">[Submitted on 26 Aug 2026 (this version), latest version 18 Sep 2026 (v2)]</div>
        <h1>Planetary Prediction Engine</h1><p>An autonomous prediction system retrieves data and fits models.</p>
        <p>The archived first version must remain distinct from a later revision.</p></article></body></html>'''
        result = self.invoke(raw, profile["options"])["result"]
        self.assertEqual(result["dates"]["published_at"], "2026-08-26")
        self.assertEqual(result["dates"]["profile_status"], "matched")
        self.assertIn("18 Sep 2026", result["dates"]["basis"]["text"])
        self.assertIsNone(result["dates"]["modified_at"])

    def test_github_pinned_release_uses_header_date_not_signature_timestamps(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in config["article_profiles"] if p["id"] == "nemoclaw-github-v0-0-115-release")
        import re
        self.assertTrue(re.search(profile["url_pattern"], "https://github.com/NVIDIA/NemoClaw/releases/tag/v0.0.115"))
        self.assertFalse(re.search(profile["url_pattern"], "https://github.com/NVIDIA/NemoClaw/releases/tag/v0.0.116"))
        raw = b'''<html><head><title>Release v0.0.115</title></head><body><main>
        <div role="dialog"><relative-time datetime="2026-08-28 03:33:26 UTC">signature</relative-time></div>
        <div><relative-time class="no-wrap" datetime="2026-08-28T03:33:03Z">28 Aug</relative-time></div>
        <article><p>NemoClaw v0.0.115 adds bounded recovery for receipt-owned containers.</p></article>
        </main></body></html>'''
        options = profile["options"]
        normal = self.invoke(raw, options)["result"]
        self.assertEqual(normal["dates"]["published_at"], "2026-08-28")
        self.assertEqual(normal["dates"]["basis"]["text"], "2026-08-28T03:33:03Z")
        self.assertEqual(normal["dates"]["basis"]["attribute"], "datetime")
        self.assertEqual(normal["dates"]["profile_status"], "matched")
        self.assertIsNone(normal["dates"]["modified_at"])
        missing = self.invoke(raw.replace(b'class="no-wrap"', b'class="other"'), options)["result"]
        self.assertIsNone(missing["dates"]["published_at"])
        self.assertEqual(missing["dates"]["profile_status"], "missing")
        duplicate = self.invoke(raw.replace(b'</main>', b'<relative-time class="no-wrap" datetime="2026-08-29T03:33:03Z">other</relative-time></main>'), options)["result"]
        self.assertIsNone(duplicate["dates"]["published_at"])
        self.assertEqual(duplicate["dates"]["profile_status"], "ambiguous")
        invalid = self.invoke(raw.replace(b'2026-08-28T03:33:03Z', b'2026-08-32T03:33:03Z'), options)["result"]
        self.assertIsNone(invalid["dates"]["published_at"])
        self.assertEqual(invalid["dates"]["profile_status"], "invalid-date")

    def test_google_updated_article_retains_footnote_and_two_dates(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"] if p["id"] == "google-search-controls-20260831-update")
        raw = b'''<html><head><title>Controls</title>
        <meta property="article:published_time" content="2026-06-03"></head><body><main>
        <article><section><h1>New opportunities, control and insights for website owners</h1><p>Copy link</p></section><section>
        <p><i>Updated: August 31, 2026</i></p><p>Beginning with some UK websites.</p></section></article>
        <uni-footnotes><div><p><i>As of August 31, 2026, these features are available worldwide.</i></p></div></uni-footnotes>
        </main><footer><p>September 27, 2026 - unrelated footer</p></footer></body></html>'''
        result = self.invoke(raw, options, url="https://www.doosanrobotics.com/en/about/promotion/news/")["result"]
        self.assertEqual(result["dates"]["published_at"], "2026-06-03")
        self.assertEqual(result["dates"]["modified_at"], "2026-08-31")
        self.assertEqual(result["dates"]["modified_profile_status"], "matched")
        self.assertIn("Updated:", result["dates"]["modified_basis"]["text"])
        self.assertTrue(any("worldwide" in b["text"] for b in result["blocks"]))
        self.assertFalse(any("unrelated footer" in b["text"] for b in result["blocks"]))
        self.assertFalse(any("Copy link" in b["text"] for b in result["blocks"]))
        conflict = self.invoke(raw.replace(b'</head>', b'<meta property="article:modified_time" content="2026-09-01"></head>'), options)["result"]
        self.assertIsNone(conflict["dates"]["modified_at"])
        self.assertEqual(conflict["dates"]["modified_profile_status"], "conflict")
        missing = self.invoke(raw.replace(b"Updated: August 31, 2026", b"Updated: date unknown").replace(b'</head>', b'<meta property="article:modified_time" content="2026-08-31"></head>'), options)["result"]
        self.assertIsNone(missing["dates"]["modified_at"])
        self.assertEqual(missing["dates"]["modified_profile_status"], "no-match")
        invalid = self.invoke(raw.replace(b"August 31, 2026", b"August 32, 2026"), options)["result"]
        self.assertIsNone(invalid["dates"]["modified_at"])
        self.assertEqual(invalid["dates"]["modified_profile_status"], "invalid-date")
        before = self.invoke(raw.replace(b"August 31, 2026", b"May 31, 2026"), options)["result"]
        self.assertIsNone(before["dates"]["modified_at"])
        self.assertEqual(before["dates"]["modified_profile_status"], "before-publication")

    def test_google_research_profile_preserves_list_conditions_and_dateline(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"] if p["id"] == "google-research-timesfm3-20260831")
        raw = b'''<html><head><title>Research</title></head><body><main>
        <section><h1>TimesFM-3</h1><div class="basic-hero--blog-detail__description"><p>August 31, 2026</p></div></section>
        <div class="rich-text"><p>A multivariate model.</p><ul><li>Multiple targets and quantile forecasts.</li>
        <li>Future covariates are known ahead of time.</li></ul><ol><li>Causal temporal attention only uses past tokens.</li></ol></div>
        </main><nav><p>Other announcement September 27, 2026</p></nav></body></html>'''
        result = self.invoke(raw, options)["result"]
        self.assertEqual(result["title"], "TimesFM-3")
        self.assertEqual(result["dates"]["published_at"], "2026-08-31")
        self.assertEqual(result["dates"]["profile_status"], "matched")
        texts = [b["text"] for b in result["blocks"]]
        self.assertIn("Future covariates are known ahead of time.", texts)
        self.assertIn("Causal temporal attention only uses past tokens.", texts)
        self.assertFalse(any("Other announcement" in text for text in texts))

    def test_pdf_text_coordinates_and_selective_ocr(self):
        doc = pymupdf.open()
        doc.set_metadata({"title": "Fixture report"})
        page = doc.new_page()
        page.insert_text((50, 50), "Native page: planned shipment of 50 robots in 2027.")
        native = pymupdf.open()
        scan = native.new_page()
        scan.insert_text((50, 50), "Scanned page: planned shipment of 50 robots in 2027.", fontsize=16)
        image = scan.get_pixmap(matrix=pymupdf.Matrix(3, 3)).tobytes("png")
        second = doc.new_page()
        second.insert_image(second.rect, stream=image)
        data = doc.tobytes()
        without = self.invoke(data)["result"]
        self.assertEqual(without["quality"]["missing_pages"], [2])
        with_ocr = self.invoke(data, {"ocr": True})["result"]
        self.assertEqual(with_ocr["quality"]["ocr_pages"], [2])
        self.assertTrue(any("50 robots" in b["text"] for b in with_ocr["blocks"] if b["locator"].get("method") == "ocr"))
        self.assertTrue(all(b["locator"].get("bbox") for b in with_ocr["blocks"]))

    def test_pdf_sparse_section_divider_requires_an_exact_profile_match(self):
        doc = pymupdf.open()
        doc.set_metadata({"title": "PowerPoint presentation"})
        first = doc.new_page()
        first.insert_text((50, 50), "2Q26 Earnings Release")
        first.insert_text((50, 90), "Robotics business results")
        divider = doc.new_page()
        divider.insert_text((50, 100), "Chapter 1.")
        divider.insert_text((50, 140), "2Q 2026 Results")
        third = doc.new_page()
        third.insert_text((50, 50), "Revenue by region and product segment.")
        data = doc.tobytes()
        options = {
            "pdf_title_page": 1,
            "pdf_title_pattern": "^2Q26 Earnings Release$",
            "sparse_page_patterns": [
                {"page": 2, "pattern": "^Chapter 1\\. 2Q 2026 Results$"}
            ],
        }

        accepted = self.invoke(data, options)["result"]
        self.assertEqual(accepted["status"], "extracted")
        self.assertEqual(accepted["title"], "2Q26 Earnings Release")
        self.assertEqual(accepted["quality"]["missing_pages"], [])
        self.assertEqual(accepted["quality"]["profile_accepted_sparse_pages"], [2])
        self.assertTrue(any("2Q 2026 Results" in b["text"] for b in accepted["blocks"]))

        mismatch = self.invoke(
            data,
            {
                **options,
                "sparse_page_patterns": [
                    {"page": 2, "pattern": "^Chapter 2\\. 2Q 2026 Results$"}
                ],
            },
        )["result"]
        self.assertEqual(mismatch["status"], "partial")
        self.assertEqual(mismatch["quality"]["missing_pages"], [2])

        unprofiled = self.invoke(data, {key: value for key, value in options.items() if key != "sparse_page_patterns"})["result"]
        self.assertEqual(unprofiled["status"], "partial")
        self.assertEqual(unprofiled["quality"]["missing_pages"], [2])

    def test_doosan_2q26_pdf_profile_pins_title_and_does_not_guess_publication_date(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in config["article_profiles"] if p["id"] == "doosan-robotics-2q26-earnings-release-en")
        self.assertEqual(
            profile["url_pattern"],
            "^https://www\\.doosanrobotics\\.com/kr/investment/ir/irdata/irDataFile/down/85$",
        )
        options = profile["options"]
        self.assertNotIn("publication_date_page", options)
        self.assertNotIn("publication_date_from_listing", options)

    def test_unsupported_ocr_language_is_reported_as_missing_not_success(self):
        document = pymupdf.open()
        document.new_page()
        result = self.invoke(document.tobytes(), {"ocr": True, "language": "xx"})["result"]
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["quality"]["missing_pages"], [1])
        self.assertEqual(result["quality"]["ocr_unavailable"], "unsupported-language:xx")
        self.assertEqual(result["quality"]["ocr_pages"], [])

    @unittest.skipUnless(
        (WORKER.parents[2] / ".local/research/local-ai/ocr/models/korean_PP-OCRv5_rec_mobile.onnx").is_file()
        and Path("/System/Library/Fonts/Supplemental/AppleGothic.ttf").is_file()
        and importlib.util.find_spec("PIL") is not None,
        "local Korean OCR model and macOS Korean fixture font are required",
    )
    def test_raster_ocr_reuses_korean_model_and_preserves_pixel_positions(self):
        from PIL import Image, ImageDraw, ImageFont
        image = Image.new("RGB", (1600, 500), "white")
        draw = ImageDraw.Draw(image)
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/AppleGothic.ttf", 88)
        draw.text((70, 100), "산업용 로봇 시장 동향", font=font, fill="black")
        draw.text((70, 250), "FANUC 2026년 신규 공장 자동화 계획", font=font, fill="black")
        output = io.BytesIO()
        image.save(output, format="PNG")
        result = self.invoke(output.getvalue(), {"ocr": True, "language": "ko", "title": "원문 이미지"}, mime_type="image/png")["result"]
        self.assertEqual(result["quality"]["ocr_model"], "PP-OCRv5-korean-mobile")
        self.assertIn("산업용 로봇 시장 동향", " ".join(block["text"] for block in result["blocks"]))
        self.assertEqual(result["quality"]["source_width"], 1600)
        self.assertEqual(result["quality"]["numeric_verification"], "unreviewed")
        self.assertEqual(result["quality"]["table_structure"], "unreviewed")
        self.assertIsNone(result["dates"]["published_at"])
        for block in result["blocks"]:
            self.assertEqual(block["locator"]["type"], "image")
            self.assertEqual(block["locator"]["coordinate_space"], "source-pixels")
            self.assertIn("confidence", block["locator"])
            self.assertLessEqual(block["locator"]["bbox"][2], 1601)
            self.assertLessEqual(block["locator"]["bbox"][3], 501)

    def test_raster_image_budget_and_mime_are_enforced_before_ocr(self):
        from PIL import Image
        output = io.BytesIO()
        Image.new("RGB", (100, 100), "white").save(output, format="PNG")
        for options, mime in [({"ocr": True, "max_image_pixels": 100}, "image/png"), ({"ocr": True}, "image/jpeg")]:
            with self.subTest(options=options, mime=mime):
                response = self.invoke(output.getvalue(), options, mime_type=mime)
                self.assertEqual(response["worker_status"], "failed")
        default = self.invoke(output.getvalue(), {"language": "ko"}, mime_type="image/png")["result"]
        self.assertEqual(default["status"], "unsupported")
        partial = self.invoke(output.getvalue(), {"ocr": True, "language": "xx", "title": "원문 이미지"}, mime_type="image/png")["result"]
        self.assertEqual(partial["status"], "partial")
        self.assertEqual(partial["quality"]["ocr_unavailable"], "unsupported-language:xx")

    def test_body_image_profile_selects_only_empty_article_container(self):
        raw = b'<html><head><title>Publisher</title></head><body><img src="https://ads.test/banner.png"><h1>Source title</h1><article><p> </p><img src="/image.png"></article></body></html>'
        options = {"title_xpath": "//h1", "content_xpath": "//article", "content_block_xpath": ".//p[normalize-space(.)]", "body_images": {"xpath": ".//img[@src]", "url_pattern": "^https://example\\.com/image\\.png$", "max_images": 1}}
        result = self.invoke(raw, options)["result"]
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["body_images"], [{"url": "https://example.com/image.png", "dom_path": "/html/body/article/img", "alt": ""}])
        self.assertEqual(result["blocks"], [])
        text_article = self.invoke(raw.replace(b'<p> </p>', b'<p>Verified article text.</p>'), options)["result"]
        self.assertEqual(text_article["status"], "extracted")
        self.assertNotIn("body_images", text_article)
        outside = self.invoke(raw.replace(b'/image.png', b'https://other.test/image.png'), options)
        self.assertEqual(outside["worker_status"], "failed")
        missing = self.invoke(raw.replace(b'<img src="/image.png">', b''), options)
        self.assertEqual(missing["worker_status"], "failed")

    def test_login_and_subscription_walls_do_not_count_as_article_content(self):
        title_wall = b'''<html><head><title>Sign in to read this article</title></head>
        <body><main><h1>Sign in to read this article</h1><p>Members only.</p>
        <form action="/login"><input type="password"></form></main></body></html>'''
        result = self.invoke(title_wall)["result"]
        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["quality"]["reason"], "authentication-page")
        self.assertEqual(result["blocks"], [])

        form_wall = b'''<html><head><title>Technology update</title></head><body><main>
        <h1>Technology update</h1><p>Sign in to continue reading this report.</p>
        <form action="/signin"><input type="password" name="password"></form>
        </main></body></html>'''
        result = self.invoke(form_wall)["result"]
        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["quality"]["reason"], "authentication-page")

    def test_login_call_to_action_does_not_block_a_substantial_article(self):
        article = " ".join(["The company described its robotics program and deployment results."] * 28)
        raw = f'''<html><head><title>Technology update</title></head><body><main>
        <article><h1>Technology update</h1><p>{article}</p>
        <p>Sign in to continue reading other member-only updates.</p>
        <form action="/login"><input type="password"></form></article>
        </main></body></html>'''.encode()
        result = self.invoke(raw)["result"]
        self.assertEqual(result["status"], "extracted")
        self.assertTrue(result["blocks"])

    def test_members_only_body_without_login_form_is_blocked(self):
        for notice in ("로그인 또는 회원가입을 해주세요. (회원만 열람가능)",
                       "Sign in to read this article.", "Members only."):
            with self.subTest(notice=notice):
                raw = ('<html><head><title>Battery research</title></head><body>'
                       '<article><p>' + notice + '</p></article></body></html>').encode()
                result = self.invoke(raw, {"content_xpath": "//article"})["result"]
                self.assertEqual(result["status"], "blocked")
                self.assertEqual(result["quality"]["reason"], "authentication-page")
                self.assertEqual(result["blocks"], [])

    def test_short_public_article_with_members_prompt_keeps_content(self):
        raw = '''<html><head><title>Battery research</title></head><body>
        <article><p>회사는 배터리 연구 결과를 10월 5일 발표했다.</p>
        <p>로그인 또는 회원가입을 해주세요. (회원만 열람가능)</p></article>
        </body></html>'''.encode()
        result = self.invoke(raw, {"content_xpath": "//article"})["result"]
        self.assertEqual(result["status"], "extracted")
        self.assertTrue(result["blocks"])

    @unittest.skipUnless(
        (WORKER.parents[2] / ".local/research/local-ai/ocr/models/korean_PP-OCRv5_rec_mobile.onnx").is_file()
        and Path("/System/Library/Fonts/Supplemental/AppleGothic.ttf").is_file()
        and importlib.util.find_spec("PIL") is not None,
        "local Korean OCR model and macOS Korean fixture font are required",
    )
    def test_korean_scanned_pdf_uses_pinned_korean_recognizer(self):
        from PIL import Image, ImageDraw, ImageFont

        image = Image.new("RGB", (1600, 500), "white")
        draw = ImageDraw.Draw(image)
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/AppleGothic.ttf", 88)
        draw.text((70, 100), "산업용 로봇 시장 동향", font=font, fill="black")
        draw.text((70, 250), "FANUC 2026년 신규 공장 자동화 계획", font=font, fill="black")
        image_bytes = io.BytesIO()
        image.save(image_bytes, format="PNG")

        document = pymupdf.open()
        page = document.new_page(width=800, height=250)
        page.insert_image(page.rect, stream=image_bytes.getvalue())
        raw = document.tobytes()
        temp_base = WORKER.parents[2] / ".local/research/local-ai/tmp"
        temp_base.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temp_base) as temp:
            root = Path(temp)
            (root / "input.pdf").write_bytes(raw)
            request = {
                "schema_version": "research-worker/v1", "request_id": "korean-ocr-fixture",
                "operation": "parse", "input_path": "input.pdf",
                "input_sha256": hashlib.sha256(raw).hexdigest(), "source_id": "fixture",
                "source_version_id": "fixture:v1", "url": "https://example.com/ko-scan.pdf",
                "mime_type": "application/pdf", "options": {"ocr": True, "language": "ko"},
            }
            process = subprocess.run(
                [sys.executable, str(WORKER), "--root", temp], input=json.dumps(request) + "\n",
                text=True, capture_output=True, timeout=120,
            )
        self.assertEqual(process.returncode, 0, process.stderr)
        result = json.loads(process.stdout)["result"]
        ocr_blocks = [block for block in result["blocks"] if block["locator"].get("method") == "ocr"]
        self.assertEqual(result["quality"]["ocr_model"], "PP-OCRv5-korean-mobile")
        self.assertIn("산업용 로봇 시장 동향", " ".join(block["text"] for block in ocr_blocks))
        self.assertEqual(result["quality"]["missing_pages"], [])
        self.assertTrue(all(block["locator"].get("bbox") for block in ocr_blocks))

    def test_japanese_fanuc_dateline_uses_publisher_day_not_collection_or_url(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"] if p["id"] == "fanuc-ja-release")
        raw = '''<html lang="ja"><head><title>AI溶接エージェント</title></head><body>
        <div id="main"><div>メニュー 2026年9月27日</div><div>
        <p>2026年9月11日 ファナック株式会社</p><h1>AI溶接エージェント</h1>
        <p>部品の図面を読み取り、電流と電圧やロボット動作を生成します。</p>
        <p>出荷は2026年12月末の予定です。</p></div></div></body></html>'''.encode()
        result = self.invoke(raw, options)["result"]
        self.assertEqual(result["dates"]["published_at"], "2026-09-11")
        self.assertEqual(result["dates"]["profile_status"], "matched")
        self.assertIn("2026年9月11日", result["dates"]["basis"]["text"])
        invalid = self.invoke(raw.replace("9月11日".encode(), "2月30日".encode()), options)["result"]
        self.assertIsNone(invalid["dates"]["published_at"])

    def test_etri_viewer_uses_body_distribution_date_and_preserves_tables(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"] if p["id"] == "etri-embodied-ai-20260920-viewer")
        raw = '''<html><head><title>mec viewer :: AI_260909_F.hwp</title></head><body>
        <div><p>닫기 · 2026.09.27</p></div><div>
        <table><tr><td><p><span>배포일자 : 2026.09.20.(일)</span></p></td></tr></table>
        <p>ETRI, 피지컬 AI 국제표준화 주도한다</p>
        <p>ETRI는 2026년2월에 SG21 산하 포커스그룹이 설립됐다고 밝혔다.</p>
        <p>포커스그룹은 국제표준 제정에 앞서 과제를 발굴한다.</p>
        <table><tr><td>작업반</td><td>논의 주제</td></tr><tr><td>WG6</td><td>산업 응용</td></tr></table>
        </div></body></html>'''.encode()
        result = self.invoke(raw, options)["result"]
        self.assertEqual(result["title"], "ETRI, 피지컬 AI 국제표준화 주도한다")
        self.assertEqual(result["dates"]["published_at"], "2026-09-20")
        self.assertEqual(result["dates"]["profile_status"], "matched")
        self.assertIn("배포일자", result["dates"]["basis"]["text"])
        self.assertNotIn("닫기", " ".join(b["text"] for b in result["blocks"]))
        self.assertTrue(any(b.get("rows") and "WG6" in b["text"] for b in result["blocks"]))
        missing = self.invoke(raw.replace("배포일자 :".encode(), "배포일 정보 :".encode()), options)["result"]
        self.assertIsNone(missing["dates"]["published_at"])
        invalid = self.invoke(raw.replace(b"2026.09.20", b"2026.02.30"), options)["result"]
        self.assertIsNone(invalid["dates"]["published_at"])
        self.assertEqual(invalid["dates"]["profile_status"], "invalid-date")
        ambiguous = self.invoke(raw.replace(b"</div></body>", '<span>배포일자 : 2026.09.21.(월)</span></div></body>'.encode()), options)["result"]
        self.assertIsNone(ambiguous["dates"]["published_at"])
        self.assertEqual(ambiguous["dates"]["profile_status"], "ambiguous")

    def test_cesar_content_profile_excludes_related_news_and_uses_header_date(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"] if p["id"] == "esa-cesar-cebreros-first-light-20260921")
        raw = '''<html><head><title>CESAR News</title></head><body>
        <table><tr><td><div class="Content"><div><table><tr>
        <td><table><tr><td><span>21</span><span>September 2026</span></td></tr></table></td>
        <td><span>First Light of the CESAR Cebreros Telescope (CCT)</span></td>
        </tr></table><div><p>The telescope has a 0.5-metre mirror and a focal length of 5 metres.</p>
        <p>First Light observations took place on 3 to 4 September 2026.</p>
        <p>Educational access is planned for the first half of 2027.</p></div></div></div></td></tr></table>
        <div><h2>Related news</h2><p>24 September 2026 Another event in a different location.</p></div>
        </body></html>'''.encode()
        result = self.invoke(raw, options)["result"]
        self.assertEqual(result["title"], "First Light of the CESAR Cebreros Telescope (CCT)")
        self.assertEqual(result["dates"]["published_at"], "2026-09-21")
        text = ' '.join(b["text"] for b in result["blocks"])
        self.assertIn("0.5-metre", text)
        self.assertNotIn("Related news", text)
        self.assertNotIn("Another event", text)
        missing = self.invoke(raw.replace(b"September 2026", b"date unavailable"), options)["result"]
        self.assertIsNone(missing["dates"]["published_at"])
        self.assertIn("0.5-metre", ' '.join(b["text"] for b in missing["blocks"]))

    def test_cxmt_native_content_profile_preserves_inline_unit_and_footnote_basis(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"] if p["id"] == "cxmt-g5-zh-20260920")
        raw = '''<html lang="zh-CN"><head><title>新闻</title></head><body><main>
        <h2 class="title">长鑫存储第五代技术平台正式量产</h2><p class="title-day">发布时间：2026-09-20</p>
        <div class="cont"><div class="txt"><p>两款LPDDR5X产品，单颗容量为<span>24</span><span>Gb</span>。</p>
        <p>每片晶圆产出裸片数量较第四代平台提升至少<span>50%</span>。</p>
        <p>注：DPW均换算为<span>8Gb</span>颗粒基准统计。</p></div></div>
        <div class="change-page"><p>下一篇 发布时间：2026-09-27</p></div></main></body></html>'''.encode()
        result = self.invoke(raw, options)["result"]
        self.assertEqual(result["dates"]["published_at"], "2026-09-20")
        self.assertEqual(result["language"], "zh-CN")
        text = ' '.join(b["text"] for b in result["blocks"])
        self.assertIn("24 Gb", text)
        self.assertIn("至少 50%", text)
        self.assertIn("8Gb", text)
        self.assertNotIn("下一篇", text)

    def test_german_story_profile_ignores_related_story_dates(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"] if p["id"] == "siemens-vacuum-interrupter-de-20260906")
        raw = '''<html lang="de"><head><title>Generic metadata title</title></head><body><article>
        <div class="aem-story-header__wrapper--inside-grid"><div class="aem-information-details-template__first-item">6. September 2026</div>
        <h1>SF₆-freie Schaltanlagen: Vakuumschaltröhrentechnologie</h1></div>
        <p>Im Hochspannungsprüffeld bewertet das Team Prototypen von Vakuumschaltröhren. Jahr für Jahr durchlaufen rund 100 Schaltröhren ihren Testprozess.</p>
        <p>Die Herausforderung besteht darin, diese zuverlässige Funktion auch bei 420 kV sicherzustellen. Erkenntnisse aus den Tests flossen in die Entwicklung ein.</p>
        <p>Im 420-kV-Projekt arbeiteten rund 50 Menschen aus verschiedenen Bereichen zusammen. Die Prüfkapazitäten und Zeitpläne wurden koordiniert.</p>
        </article><div class="aem-information-details-template__first-item">14. September 2026</div></body></html>'''.encode()
        result = self.invoke(raw, options)["result"]
        self.assertEqual(result["title"], "SF₆-freie Schaltanlagen: Vakuumschaltröhrentechnologie")
        self.assertEqual(result["dates"]["published_at"], "2026-09-06")
        self.assertEqual(result["dates"]["candidates"], ["2026-09-06"])
        self.assertTrue(any("100" in b["text"] for b in result["blocks"]))
        missing = self.invoke(raw.replace(b"6. September 2026", b"date not provided"), options)["result"]
        self.assertIsNone(missing["dates"]["published_at"])

    def test_kuka_news_profile_reads_german_month_and_excludes_site_chrome(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"] if p["id"] == "kuka-de-news-detail")
        raw = '''<html lang="de"><head><title>KUKA site</title></head><body>
        <p>Sie verwenden den veralteten Browser Internet Explorer.</p><main>
        <section class="mod-page-intro"><h1>Neue Roboter für die Fertigung</h1>
        <p class="intro">KUKA stellt einen Roboter für schwere Paletten vor.</p>
        <p class="mod-page-intro__date">5. März 2026</p></section>
        <article class="mod-text"><div><h2>Neue Generation</h2></div>
        <div class="copy">Das System kann Paletten bis 1.500 Kilogramm transportieren.</div></article>
        <section class="mod-text-image"><h2>Lieferplan</h2>
        <div class="copy">Die Auslieferung ist für Dezember 2026 geplant.</div></section>
        <aside>9. September 2026: Ein anderer Artikel.</aside></main></body></html>'''.encode()
        result = self.invoke(raw, options)["result"]
        self.assertEqual(result["dates"]["published_at"], "2026-03-05")
        self.assertEqual(result["dates"]["basis"]["text"], "5. März 2026")
        text = " ".join(b["text"] for b in result["blocks"])
        self.assertIn("1.500 Kilogramm", text)
        self.assertIn("Dezember 2026 geplant", text)
        self.assertNotIn("Internet Explorer", text)
        self.assertNotIn("Ein anderer Artikel", text)
        regional = self.invoke(raw.replace(b'<html lang="de">', b'<html lang="de-DE">'), options)["result"]
        self.assertEqual(regional["dates"]["published_at"], "2026-03-05")
        invalid = self.invoke(raw.replace(b"5. M\xc3\xa4rz 2026", b"30. Februar 2026"), options)["result"]
        self.assertIsNone(invalid["dates"]["published_at"])

    def test_kuka_english_news_profile_reads_display_day_and_article_blocks(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in config["article_profiles"] if p["id"] == "kuka-en-news-detail")
        self.assertIsNotNone(re.fullmatch(
            profile["url_pattern"],
            "https://www.kuka.com/en-sg/company/press/news/2026/09/kuka-mobile-forklift-launch",
        ))
        self.assertIsNone(re.fullmatch(
            profile["url_pattern"],
            "https://www.kuka.com/de-de/unternehmen/presse/news/2026/09/kuka-mobile-forklift-launch",
        ))
        raw = b'''<html lang="en"><head><title>KUKA site</title>
        <script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-09-08"}</script></head><body>
        <nav>Another product announced in 2025</nav><main>
        <section class="mod-page-intro"><h1>Autonomous Pallet Handling</h1>
        <p class="intro">KUKA introduces the KMF 1500P-CB forklift.</p>
        <p class="mod-page-intro__date">September 10, 2026</p></section>
        <article class="mod-text"><div><h2>New forklift family</h2></div>
        <div class="copy">The machine handles loads of up to 1,500 kilograms.</div></article>
        <section class="mod-text-image"><h2>Availability</h2>
        <div class="copy">Deliveries are expected in December 2026.</div></section>
        </main></body></html>'''
        listing_options = {
            **profile["options"],
            "listing_published_at": "2026-09-10",
            "listing_source_url": "https://www.kuka.com/api/news/GetPublications",
            "listing_source_version_id": "kuka-list:hash",
            "listing_date_text": "September 10, 2026",
        }
        result = self.invoke(raw, listing_options)["result"]
        self.assertEqual(result["title"], "Autonomous Pallet Handling")
        self.assertEqual(result["dates"]["published_at"], "2026-09-10")
        self.assertEqual(result["dates"]["basis"]["type"], "official-listing-and-visible-date")
        self.assertEqual(result["dates"]["basis"]["display_text"], "September 10, 2026")
        self.assertEqual(result["dates"]["basis"]["other_date_candidates"], ["2026-09-08"])
        content = " ".join(block["text"] for block in result["blocks"])
        self.assertIn("1,500 kilograms", content)
        self.assertIn("expected in December 2026", content)
        self.assertNotIn("Another product", content)
        missing = self.invoke(raw.replace(b"September 10, 2026", b"date unavailable"), listing_options)["result"]
        self.assertIsNone(missing["dates"]["published_at"])

    def test_listing_onclick_profile_reads_urls_without_executing_javascript(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = config["route-hd-news-ko"]["parse_options"]
        raw = '''<html lang="ko"><head><title>제조사 뉴스</title></head><body><ul>
        <li onclick="view.utils.href('/company/news/7231')"><h3>산업용 협동로봇 제품 발표</h3><span class="date">2026-07-01</span></li>
        <li onclick="view.utils.href('/company/news/5643')"><h3>로봇 제어기 발표</h3><span class="date">2026-02-30</span></li>
        <li onclick="view.utils.href('/company/news/9999');fetch('/private')"><h3>실행 금지</h3></li>
        </ul><p>뉴스 목록의 기사 내용을 확인한다.</p></body></html>'''.encode()
        result = self.invoke(raw, options)["result"]
        self.assertEqual([l["url"] for l in result["links"]], ["https://example.com/company/news/7231", "https://example.com/company/news/5643"])
        self.assertEqual(result["links"][0]["published_at"], "2026-07-01")
        self.assertIsNone(result["dates"]["published_at"])
        self.assertIsNone(result["links"][1]["published_at"])
        self.assertEqual(result["link_profiles"][0]["matched_links"], 2)
        self.assertTrue(result["links"][0]["dom_path"])
        changed = self.invoke(raw.replace(b"view.utils.href", b"changed.href"), options)["result"]
        self.assertEqual(changed["link_profiles"][0]["status"], "no-match")
        self.assertEqual(changed["links"], [])

    def test_fanuc_index_profile_reads_year_and_day_headings_without_url_date_inference(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = config["fanuc-en"]["parse_options"]
        raw = b'''<html lang="en"><head><title>FANUC News Release</title></head><body>
        <div id="main"><div class="content-normal-low raw">
        <h2>2026</h2><h3>September 11</h3><ul>
        <li><a href="2026/notice20260911.html">AI Welding Agent launch</a></li>
        <li><a href="2026/notice20260911-03.html">Portable collaborative robot launch</a></li>
        </ul><h3>August 27</h3><ul><li><a href="2026/notice20260827.html">Robot soccer exhibit announced</a></li></ul>
        <h2>2025</h2><h3>December 15</h3><ul><li><a href="2025/notice20251215.html">Annual company announcement</a></li></ul>
        </div></div></body></html>'''
        result = self.invoke(raw, options)["result"]
        links = [link for link in result["links"] if link.get("profile_id") == "fanuc-en-dated-index-v1"]
        self.assertEqual([link["published_at"] for link in links], ["2026-09-11", "2026-09-11", "2026-08-27", "2025-12-15"])
        self.assertEqual(links[0]["listed_date_text"], "2026 September 11")
        self.assertEqual(result["link_profiles"][0]["matched_links"], 4)
        changed = self.invoke(raw.replace(b"September 11", b"September 32"), options)["result"]
        first = next(link for link in changed["links"] if link.get("profile_id") == "fanuc-en-dated-index-v1")
        self.assertIsNone(first["published_at"])

    def test_listing_page_summary_requires_one_bounded_total_and_page_marker(self):
        options = {"content_xpath": "//main", "listing_page_summary_xpath": "//div[@class='total']", "listing_page_summary_pattern": r"^Total\. (?P<total>\d+) \[(?P<page>\d+)/(?P<pages>\d+)\]$"}
        raw = b'<html><head><title>News</title></head><body><main><p>Official news index.</p><div class="total">Total. <strong>2</strong> [1/1]</div></main></body></html>'
        result = self.invoke(raw, options)["result"]
        self.assertEqual(result["listing_page_summary"]["status"], "matched")
        self.assertEqual([result["listing_page_summary"][k] for k in ("total", "page", "pages")], [2, 1, 1])
        self.assertEqual(result["listing_page_summary"]["basis"]["text"], "Total. 2 [1/1]")
        for markup, expected in [
            (b'', "missing"),
            (b'<div class="total">Total. 2 [1/1]</div><div class="total">Total. 2 [1/1]</div>', "ambiguous"),
            (b'<div class="total">Total. 2 [2/1]</div>', "invalid-count"),
        ]:
            changed = raw.replace(b'<div class="total">Total. <strong>2</strong> [1/1]</div>', markup)
            self.assertEqual(self.invoke(changed, options)["result"]["listing_page_summary"]["status"], expected)

        single_page = {**options, "listing_page_summary_pattern": r"^Total\. (?P<total>\d+)$", "listing_page_summary_single_page": True}
        single_raw = b'<html><head><title>News</title></head><body><main><div class="total">Total. <strong>41</strong></div></main></body></html>'
        single_result = self.invoke(single_raw, single_page)["result"]["listing_page_summary"]
        self.assertEqual(single_result["status"], "matched")
        self.assertEqual([single_result[k] for k in ("total", "page", "pages")], [41, 1, 1])
        patterned = b'<html><head><title>News</title></head><body><main><div class="total">Total. 41 [1/1]</div></main></body></html>'
        invalid_groups = {**single_page, "listing_page_summary_pattern": r"^Total\. (?P<total>\d+) \[(?P<page>\d+)/(?P<pages>\d+)\]$"}
        self.assertIn("error", self.invoke(patterned, invalid_groups))
        self.assertIn("error", self.invoke(single_raw, {**single_page, "listing_page_summary_single_page": 1}))

    def test_doosan_news_profiles_keep_list_and_both_detail_templates_separate(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = config["route-doosan-news-en"]["parse_options"]
        raw = b'''<html lang="en"><head><title>Company navigation</title></head><body>
        <div class="sub-head"><h2>News</h2><div class="total">Total. <strong>2</strong> [1/1]</div></div>
        <div class="news-list"><ul>
        <li><a href="/en/about/promotion/news/robot-launch"><p class="title">Robot launch</p><p class="date">2026. 06. 22</p></a></li>
        <li><a href="/en/about/promotion/news/view/116"><p class="title">CES exhibit</p><p class="date">2026. 01. 06</p></a></li>
        </ul></div><footer><p>Unrelated operating guidance.</p></footer></body></html>'''
        result = self.invoke(raw, options, url="https://www.doosanrobotics.com/kr/about/promotion/news/")["result"]
        self.assertEqual(result["listing_page_summary"]["total"], 2)
        self.assertEqual([x["published_at"] for x in result["links"] if x.get("profile_id")], ["2026-06-22", "2026-01-06"])
        self.assertEqual([b["text"] for b in result["blocks"]], ["Robot launch", "CES exhibit"])
        for profile_id, body in [
            ("doosan-en-news-slug", b'<div class="content"><div>Released the palletizing solution.</div><div>Next steps are planned.</div></div>'),
            ("doosan-en-news-view", b'<div class="content"><p>Presented the first robot.</p><p>Other capabilities are planned.</p></div>'),
        ]:
            detail_options = next(p["options"] for p in config["article_profiles"] if p["id"] == profile_id)
            article = b'<html lang="en"><head><title>Site shell</title></head><body><div class="board-head"><h2>Robot announcement</h2><p>2026. 06. 22</p></div><div class="board-cont">' + body + b'</div><footer><p>Other news on 2026. 09. 28</p></footer></body></html>'
            response = self.invoke(article, detail_options)
            self.assertEqual(response["worker_status"], "complete", response)
            parsed = response["result"]
            self.assertEqual(parsed["title"], "Robot announcement")
            self.assertEqual(parsed["dates"]["published_at"], "2026-06-22")
            self.assertEqual(len(parsed["blocks"]), 2)
            self.assertFalse(any("Other news" in block["text"] for block in parsed["blocks"]))

    def test_doosan_korean_news_list_and_detail_profiles_cover_slug_and_legacy_urls(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = config["route-doosan-news-ko"]["parse_options"]
        item_pattern = re.compile(config["route-doosan-news-ko"]["item_pattern"])
        raw = '''<html lang="ko"><head><title>Doosan Robotics</title></head><body>
        <div class="sub-head"><div class="sub-tit"><h2>뉴스</h2></div><div class="total">Total. <strong>2</strong></div></div>
        <div class="news-list"><ul>
        <li><a href="/kr/about/promotion/news/ai-palletizing"><p class="title">AI 팔레타이징 솔루션 공개</p><p class="date">2026. 06. 22</p></a></li>
        <li><a href="/kr/about/promotion/news/view/98"><p class="title">협동로봇 신제품 발표</p><p class="date">2025. 07. 28</p></a></li>
        </ul></div><footer><p>회사 소개 및 문의</p></footer></body></html>'''.encode()
        result = self.invoke(raw, options, url="https://www.doosanrobotics.com/kr/about/promotion/news/")["result"]
        self.assertEqual(result["listing_page_summary"]["status"], "matched")
        self.assertEqual([result["listing_page_summary"][k] for k in ("total", "page", "pages")], [2, 1, 1])
        links = [link for link in result["links"] if link.get("profile_id")]
        self.assertEqual([link["published_at"] for link in links], ["2026-06-22", "2025-07-28"])
        self.assertEqual([link["url"] for link in links], [
            "https://www.doosanrobotics.com/kr/about/promotion/news/ai-palletizing",
            "https://www.doosanrobotics.com/kr/about/promotion/news/view/98",
        ])
        self.assertTrue(all(item_pattern.fullmatch(link["url"]) for link in links))
        self.assertEqual([block["text"] for block in result["blocks"]], ["AI 팔레타이징 솔루션 공개", "협동로봇 신제품 발표"])

        for profile_id, title, published_at, body in [
            ("doosan-ko-news-slug", "AI 팔레타이징 솔루션 공개", "2026-06-22", "팔레타이징 자동화 솔루션을 공개했다."),
            ("doosan-ko-news-view", "협동로봇 신제품 발표", "2025-07-28", "협동로봇 신제품을 발표했다."),
        ]:
            detail_options = next(p["options"] for p in config["article_profiles"] if p["id"] == profile_id)
            article = f'''<html lang="ko"><head><title>사이트 제목</title></head><body>
            <div class="board-head"><h2>{title}</h2><p>{published_at[:4]}. {published_at[5:7]}. {published_at[8:10]}</p></div>
            <div class="board-cont"><div class="content"><div><span>{body}</span><br></div><div><span>추가 실행 계획을 설명했다.</span></div></div></div>
            <footer><p>관련 기사 2026. 09. 28</p></footer></body></html>'''.encode()
            response = self.invoke(article, detail_options)
            self.assertEqual(response["worker_status"], "complete", response)
            parsed = response["result"]
            self.assertEqual(parsed["status"], "extracted")
            self.assertEqual(parsed["title"], title)
            self.assertEqual(parsed["dates"]["published_at"], published_at)
            self.assertTrue(any(body in block["text"] for block in parsed["blocks"]))
            self.assertFalse(any("관련 기사" in block["text"] for block in parsed["blocks"]))

    def test_hd_robotics_detail_profile_uses_article_day_and_body_only(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"] if p["id"] == "hd-robotics-news-detail")
        raw = '''<html lang="ko"><head><title>Site title</title></head><body>
        <section class="full board-wrap"><div class="content-wrap flex column subTitle line">
        <h3>HD현대로보틱스 전략적 투자 발표</h3><span class="date">2026-09-14 09:31:33</span></div>
        <div class="content-wrap content line"><div class="cont-detail"><p>9월 11일 투자해 지분을 취득했다.</p>
        <p>로봇손을 공동 개발할 계획이다.</p></div></div></section>
        <footer><p>관련 기사 2026-09-15</p></footer></body></html>'''.encode()
        result = self.invoke(raw, options)["result"]
        self.assertEqual(result["title"], "HD현대로보틱스 전략적 투자 발표")
        self.assertEqual(result["dates"]["published_at"], "2026-09-14")
        self.assertEqual(result["dates"]["profile_status"], "matched")
        self.assertTrue(any("9월 11일 투자해" in block["text"] for block in result["blocks"]))
        self.assertFalse(any("관련 기사" in block["text"] for block in result["blocks"]))

    def test_pdf_profiles_use_native_page_text_and_reject_ambiguous_dates(self):
        options = {"language": "en", "pdf_title_page": 1, "pdf_title_pattern": "^Quarterly report.*", "publication_date_page": 1, "publication_date_pattern": "^20[0-9]{2}-[0-9]{2}-[0-9]{2}", "publication_date_format": "%Y-%m-%d"}
        doc = pymupdf.open()
        doc.set_metadata({"title": "Wrong metadata title", "creationDate": "D:20260901"})
        page = doc.new_page()
        page.insert_text((50, 50), "Quarterly report - first quarter")
        page.insert_text((50, 80), "2026-09-11 Example Corporation")
        page.insert_text((50, 120), "Reporting period: April 1 to June 30, 2026.")
        result = self.invoke(doc.tobytes(), options)["result"]
        self.assertEqual(result["title"], "Quarterly report - first quarter")
        self.assertEqual(result["dates"]["published_at"], "2026-09-11")
        self.assertEqual(result["dates"]["basis"]["page"], 1)
        self.assertTrue(result["dates"]["basis"]["bbox"])
        page.insert_text((50, 160), "2026-09-12 A different date")
        conflict = self.invoke(doc.tobytes(), options)["result"]
        self.assertIsNone(conflict["dates"]["published_at"])
        self.assertEqual(conflict["dates"]["profile_status"], "ambiguous")
        listing_options = {
            **options,
            "publication_date_from_listing": True,
            "listing_published_at": "2026-09-11",
            "listing_date_text": "Sep 11, 2026",
            "listing_source_url": "https://www.yaskawa-global.com/category/ir",
            "listing_source_version_id": "listing:v1",
        }
        listed = self.invoke(doc.tobytes(), listing_options)["result"]
        self.assertEqual(listed["dates"]["published_at"], "2026-09-11")
        self.assertEqual(listed["dates"]["profile_status"], "official-listing")
        self.assertEqual(listed["dates"]["basis"]["source_url"], listing_options["listing_source_url"])
        self.assertEqual(listed["dates"]["basis"]["source_version_id"], "listing:v1")
        self.assertEqual(listed["dates"]["basis"]["text"], "Sep 11, 2026")
        absent = self.invoke(doc.tobytes(), {**options, "publication_date_pattern": "^missing"})["result"]
        self.assertIsNone(absent["dates"]["published_at"])
        self.assertEqual(absent["dates"]["profile_status"], "missing")
        absent_listed = self.invoke(
            doc.tobytes(), {**listing_options, "publication_date_pattern": "^missing"}
        )["result"]
        self.assertEqual(absent_listed["dates"]["published_at"], "2026-09-11")
        invalid_listing = self.invoke(
            doc.tobytes(), {**listing_options, "listing_published_at": "2026-02-30"}
        )
        self.assertEqual(invalid_listing["worker_status"], "failed")
        wrong_page = self.invoke(doc.tobytes(), {**options, "publication_date_page": 2})
        self.assertEqual(wrong_page["worker_status"], "failed")

    def test_pdf_publisher_date_normalization_preserves_source_and_rejects_conflicts(self):
        cases = [
            ("ja", "２０２６年１０月５日", "%Y年%m月%d日", "２０２６年２月３０日"),
            ("de", "5 Oktober 2026", "%d %B %Y", "30 Februar 2026"),
        ]
        for language, printed, date_format, invalid in cases:
            with self.subTest(language=language):
                options = {
                    "language": language, "pdf_title_page": 1,
                    "pdf_title_pattern": "^Quarterly report$",
                    "publication_date_page": 1,
                    "publication_date_pattern": "^" + re.escape(printed) + "$",
                    "publication_date_format": date_format,
                }
                doc = pymupdf.open()
                doc.set_metadata({"creationDate": "D:20260901000000"})
                page = doc.new_page()
                page.insert_text((50, 50), "Quarterly report")
                page.insert_text((50, 90), printed, fontname="japan" if language == "ja" else "helv")
                page.insert_text((50, 130), "Document text and financial reporting conditions.")
                result = self.invoke(doc.tobytes(), options)["result"]
                self.assertEqual(result["dates"]["published_at"], "2026-10-05")
                self.assertEqual(result["dates"]["basis"]["matched_text"], printed)
                self.assertEqual(result["dates"]["basis"]["page"], 1)
                self.assertTrue(result["dates"]["basis"]["bbox"])
                page.insert_text((50, 170), printed, fontname="japan" if language == "ja" else "helv")
                conflict = self.invoke(doc.tobytes(), options)["result"]
                self.assertIsNone(conflict["dates"]["published_at"])
                self.assertEqual(conflict["dates"]["profile_status"], "ambiguous")
                invalid_doc = pymupdf.open()
                invalid_page = invalid_doc.new_page()
                invalid_page.insert_text((50, 50), "Quarterly report")
                invalid_page.insert_text((50, 90), invalid, fontname="japan" if language == "ja" else "helv")
                bad = self.invoke(invalid_doc.tobytes(), {**options, "publication_date_pattern": "^" + re.escape(invalid) + "$"})["result"]
                self.assertIsNone(bad["dates"]["published_at"])
                self.assertEqual(bad["dates"]["profile_status"], "invalid-date")

    def test_nachi_pdf_profiles_require_exact_source_title_and_printed_date(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        ids = ["nachi-q3-2026-consolidated-results-ja-v1", "nachi-q3-2026-results-supplement-ja-v1", "nachi-stock-split-20261005-ja-v1"]
        titles = ["2026年11月期 第３四半期決算短信〔日本基準〕（連結）", "決算短信補足資料", "株式分割および株式分割に伴う定款の一部変更に関するお知らせ"]
        dates = ["2026年10月５日", "2026年10月5日", "2026 年10 月5 日"]
        for profile_id, title, date in zip(ids, titles, dates):
            with self.subTest(profile=profile_id):
                options = next(p["options"] for p in config["article_profiles"] if p["id"] == profile_id)
                doc = pymupdf.open()
                page = doc.new_page(width=900)
                page.insert_text((50, 50), title, fontname="japan")
                page.insert_text((50, 90), date + (" 各 位" if "stock-split" in profile_id else ""), fontname="japan")
                if "stock-split" in profile_id:
                    page.insert_text((50, 170), "2026 年11 月30 日(月曜日)を基準日として", fontname="japan")
                page.insert_text((50, 130), "株式会社不二越の財務資料。報告対象期間と予想条件を保管する。", fontname="japan")
                result = self.invoke(doc.tobytes(), options)["result"]
                self.assertEqual(result["title"], title)
                self.assertEqual(result["dates"]["published_at"], "2026-10-05")
                self.assertEqual(result["dates"]["basis"]["matched_text"], date)
                missing = self.invoke(doc.tobytes(), {**options, "pdf_title_pattern": "^Missing title$"})["result"]
                self.assertIsNone(missing["title"])
                self.assertEqual(missing["status"], "partial")

    def test_fanuc_ir_disclosure_index_uses_year_and_day_headings_for_every_pdf(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = config["route-fanuc-ir-disclosures-ja"]["parse_options"]
        raw = """<html lang="ja"><head><title>IR</title></head><body><div id="main">
        <h1>その他開示資料</h1><div class="content-normal-low raw">
        <h2>2026年</h2><h3>9月18日</h3><ul>
        <li><a href="pdf/2026/notice20260918.pdf">取得終了のお知らせ</a></li></ul>
        <h3>9月3日</h3><ul>
        <li><a href="pdf/2026/notice20260903.pdf">取得状況のお知らせ</a></li>
        <li><a href="pdf/2026/notice20260903_2.pdf">追加開示資料</a></li></ul>
        <h3>8月19日</h3><ul><li><a href="pdf/2026/notice20260819.pdf">以前の開示</a></li></ul>
        </div><aside><a href="pdf/2026/notice20260920.pdf">関係のない案内</a></aside>
        </div></body></html>""".encode()
        parsed = self.invoke(raw, options)["result"]
        self.assertEqual(parsed["title"], "その他開示資料")
        profile = parsed["link_profiles"][0]
        self.assertEqual((profile["selected_items"], profile["matched_links"], profile["truncated"]), (4, 4, False))
        links = [link for link in parsed["links"] if link.get("profile_id") == profile["id"]]
        self.assertEqual([link["published_at"] for link in links],
                         ["2026-09-18", "2026-09-03", "2026-09-03", "2026-08-19"])
        self.assertEqual([link["listed_date_text"] for link in links][:2],
                         ["2026年 9月18日", "2026年 9月3日"])
        invalid = self.invoke(raw.replace("9月3日".encode(), "9月33日".encode()), options)["result"]
        bad_links = [link for link in invalid["links"] if link.get("profile_id") == profile["id"]]
        self.assertIsNone(bad_links[1]["published_at"])
        self.assertIsNone(bad_links[2]["published_at"])

    def test_fanuc_buyback_resolution_uses_document_day_not_pdf_creation_day(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"]
                       if p["id"] == "fanuc-ja-ir-buyback-resolution-20260424")
        doc = pymupdf.open()
        doc.set_metadata({"creationDate": "D:20260423143745+09'00'"})
        page = doc.new_page()
        page.insert_text((50, 50), "2026 年4 月24 日", fontname="japan")
        page.insert_text((50, 90), "自己株式取得に係る事項の決定に関するお知らせ", fontname="japan")
        page.insert_text((50, 130), "取得価額の総額 500 億円（上限）", fontname="japan")
        result = self.invoke(doc.tobytes(), options)["result"]
        self.assertEqual(result["title"], "自己株式取得に係る事項の決定に関するお知らせ")
        self.assertEqual(result["dates"]["published_at"], "2026-04-24")
        self.assertEqual(result["dates"]["basis"]["page"], 1)
        self.assertEqual(result["dates"]["pdf_metadata"]["creationDate"], "D:20260423143745+09'00'")
        page.insert_text((50, 170), "2026 年4 月25 日", fontname="japan")
        conflict = self.invoke(doc.tobytes(), options)["result"]
        self.assertIsNone(conflict["dates"]["published_at"])
        self.assertEqual(conflict["dates"]["profile_status"], "ambiguous")

    def test_deepmind_article_profile_keeps_late_sections_without_navigation(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"] if p["id"] == "deepmind-double-blind-evaluations-20260827")
        raw = b'''<html><head><title>Google DeepMind</title></head><body>
        <nav><div class="rich-text"><p>Navigation recommendation</p></div></nav>
        <main id="page-content"><header><h1>Piloting double-blind evaluations</h1>
        <span class="cover__text--date">August 27, 2026</span></header>
        <section><div class="rich-text"><p>Private prompts and proprietary weights stay separate.</p>
        <h2>How double-blind evaluations work</h2></div></section>
        <section><div class="grid__inner"><div class="rich-text">
        <p>Both parties verify the enclave before evaluation.</p>
        <p>Read our <a href="/technical-report.pdf">technical report</a> for the implementation details.</p>
        </div></div></section><aside><p>Related news: September 27, 2026</p></aside>
        <button>Share this article</button></main></body></html>'''
        result = self.invoke(raw, options)["result"]
        self.assertEqual(result["title"], "Piloting double-blind evaluations")
        self.assertEqual(result["dates"]["published_at"], "2026-08-27")
        self.assertEqual([b["text"] for b in result["blocks"]], [
            "Piloting double-blind evaluations",
            "Private prompts and proprietary weights stay separate.",
            "How double-blind evaluations work",
            "Both parties verify the enclave before evaluation.",
            "Read our technical report for the implementation details.",
        ])
        self.assertTrue(all(b["locator"]["dom_path"].startswith("/html/body/main") for b in result["blocks"]))
        self.assertEqual(result["attachments"], [{"url": "https://example.com/technical-report.pdf", "role": "unreviewed"}])
        missing = self.invoke(raw.replace(b' id="page-content"', b''), options)
        self.assertEqual(missing["worker_status"], "failed")
        missing_date = self.invoke(raw.replace(b'August 27, 2026', b'date unavailable'), options)["result"]
        self.assertIsNone(missing_date["dates"]["published_at"])
        ambiguous = self.invoke(raw.replace(b'</header>', b'<span class="cover__text--date">August 28, 2026</span></header>'), options)["result"]
        self.assertIsNone(ambiguous["dates"]["published_at"])

    def test_research_pdf_title_profiles_do_not_infer_dates_from_metadata(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        cases = [
            ("deepmind-double-blind-report-20260827", "Double Blind Evals: Resolving the Dual Confidentiality Dilemma in AI Safety Auditing"),
            ("openai-novices-rct-202608", "Training novices to think, or giving them LLMs? Evidence from an RCT"),
        ]
        for profile_id, title in cases:
            with self.subTest(profile=profile_id):
                options = next(p["options"] for p in config["article_profiles"] if p["id"] == profile_id)
                doc = pymupdf.open()
                doc.set_metadata({"title": "Unrelated metadata", "creationDate": "D:20260825120000"})
                page = doc.new_page(width=1100)
                page.insert_text((50, 50), title)
                page.insert_text((50, 90), "Experiment methods, conditions and results.")
                result = self.invoke(doc.tobytes(), options)["result"]
                self.assertEqual(result["title"], title)
                self.assertEqual(result["title_basis"]["page"], 1)
                self.assertEqual(result["dates"]["pdf_metadata"]["creationDate"], "D:20260825120000")
                self.assertIsNone(result["dates"]["published_at"])
                self.assertEqual(result["dates"]["precision"], "unknown")
                page.insert_text((50, 130), title)
                duplicate = self.invoke(doc.tobytes(), options)["result"]
                self.assertIsNone(duplicate["title"])
                self.assertEqual(duplicate["status"], "partial")
                missing = self.invoke(doc.tobytes(), {**options, "pdf_title_pattern": "^Missing title$"})["result"]
                self.assertIsNone(missing["title"])
                self.assertIsNone(missing["dates"]["published_at"])

    def test_invalid_operation_and_path_traversal(self):
        self.assertEqual(self.invoke(b"text", operation="shell")["worker_status"], "failed")

    def test_explicit_html_title_and_date_attribute_preserve_roadmap_lists(self):
        data = b'<html><head><title>Brand name only</title></head><body><article><header><h1>Robot development roadmap</h1><time datetime="2026-09-21">21 September 2026</time></header><p>Company reports a new roadmap.</p><ul><li>First model planned for 2028.</li><li>Second model planned for 2029.</li></ul></article><aside><p>Unrelated recommendation</p></aside></body></html>'
        options = {"content_xpath": "//article", "title_xpath": "//article/header/h1", "publication_date_xpath": "//article/header/time", "publication_date_attribute": "datetime", "publication_date_pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", "publication_date_format": "%Y-%m-%d"}
        result = self.invoke(data, options)["result"]
        self.assertEqual(result["title"], "Robot development roadmap")
        self.assertEqual(result["title_profile_status"], "matched")
        self.assertEqual(result["title_basis"]["text_hash"], hashlib.sha256(result["title"].encode()).hexdigest())
        self.assertEqual(result["dates"]["published_at"], "2026-09-21")
        self.assertEqual(result["dates"]["basis"]["attribute"], "datetime")
        body = " ".join(b["text"] for b in result["blocks"])
        self.assertIn("planned for 2028", body)
        self.assertIn("planned for 2029", body)
        self.assertNotIn("Unrelated recommendation", body)

    def test_github_changelog_profile_uses_article_day_and_excludes_related_posts(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in config["article_profiles"] if p["id"] == "github-changelog-article")
        self.assertIsNotNone(re.fullmatch(profile["url_pattern"], "https://github.blog/changelog/2026-09-11-copilot-review/"))
        data = b'''<html><head><title>GitHub Blog</title><meta property="article:modified_time" content="2026-09-12T00:00:00Z"></head><body>
        <article><header><div class="ChangelogHeader-single-meta"><time datetime="2026-09-11">September 11, 2026</time></div><h1>Copilot review change</h1></header>
        <div class="PostContent"><div class="PostContent-main editorial-content-block"><p>Resolved comments close after a later commit.</p><h2>Conditions</h2><p>Other comments remain open.</p></div></div>
        </article><div class="ChangelogRelatedPosts"><time datetime="2026-09-25">September 25</time><p>Unrelated later release.</p></div></body></html>'''
        result = self.invoke(data, profile["options"])["result"]
        self.assertEqual(result["status"], "extracted")
        self.assertEqual(result["title"], "Copilot review change")
        self.assertEqual(result["title_profile_status"], "matched")
        self.assertEqual(result["dates"]["published_at"], "2026-09-11")
        self.assertEqual(result["dates"]["precision"], "day")
        self.assertEqual(result["dates"]["profile_status"], "matched")
        body = " ".join(block["text"] for block in result["blocks"])
        self.assertIn("Resolved comments", body)
        self.assertNotIn("Unrelated later release", body)

    def test_github_profile_keeps_timestamp_table_and_display_date_evidence(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"] if p["id"] == "github-changelog-article")
        raw = b'''<html><head><title>GitHub</title>
        <script type="application/ld+json">{"@type":"TechArticle","datePublished":"2026-07-10T13:06:10-07:00","dateModified":"2026-08-01"}</script>
        <script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-07-10T20:06:10Z"}</script>
        </head><body><article><header><h1>Detector names</h1><div class="ChangelogHeader-single-meta"><time datetime="2026-07-10">July 10</time></div></header>
        <div class="PostContent-main"><p>Detection behavior is unchanged.</p><table><thead><tr><th>Before</th><th>Now</th></tr></thead><tbody><tr><td>Non-provider patterns</td><td>Generic patterns</td></tr><tr><td>Copilot secret scanning</td><td>AI-detected secrets</td></tr></tbody></table></div></article>
        <aside><table><tr><td>Unrelated table</td></tr></table></aside></body></html>'''
        result = self.invoke(raw, options)["result"]
        self.assertEqual(result["dates"]["published_at"], "2026-07-10T13:06:10-07:00")
        self.assertEqual(result["dates"]["precision"], "timestamp")
        self.assertEqual(result["dates"]["basis"]["display_basis"]["text"], "2026-07-10")
        self.assertEqual(result["dates"]["basis"]["dom_path"], "/html/head/script[1]")
        self.assertEqual(len(result["dates"]["basis"]["sources"]), 2)
        table = next(block for block in result["blocks"] if block["kind"] == "table")
        self.assertIn(["Non-provider patterns", "Generic patterns"], table["rows"])
        self.assertIn(["Copilot secret scanning", "AI-detected secrets"], table["rows"])
        self.assertNotIn("Unrelated table", " ".join(block["text"] for block in result["blocks"]))

    def test_metadata_timestamp_conflict_cannot_be_hidden_by_matching_days(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"] if p["id"] == "github-changelog-article")
        for second in ["2026-07-10T20:07:10Z", "2026-07-11T20:06:10Z"]:
            with self.subTest(second=second):
                raw = ('<html><head><script type="application/ld+json">{"@type":"TechArticle","datePublished":"2026-07-10T13:06:10-07:00"}</script><script type="application/ld+json">{"@type":"NewsArticle","datePublished":"'+second+'"}</script></head><body><article><header><h1>Release</h1><div class="ChangelogHeader-single-meta"><time datetime="2026-07-10">July 10</time></div></header><div class="PostContent-main"><p>Release details.</p></div></article></body></html>').encode()
                result = self.invoke(raw, options)["result"]
                self.assertIsNone(result["dates"]["published_at"])
                self.assertEqual(result["dates"]["profile_status"], "conflict")

    def test_title_badge_exclusion_keeps_inline_text_tail_and_source_basis(self):
        raw = '<html><head><title>사이트</title></head><body><h1><strong class="badge">단독</strong> 단독 <em>계약</em> 발표</h1><article><p>확인한 본문.</p></article></body></html>'.encode()
        options = {"content_xpath": "//article", "title_xpath": "//h1", "title_exclude_xpath": ".//strong[@class='badge']"}
        result = self.invoke(raw, options)["result"]
        self.assertEqual(result["title"], "단독 계약 발표")
        self.assertEqual(result["title_basis"]["dom_path"], "/html/body/h1")
        excluded = result["title_basis"]["excluded"]
        self.assertEqual(excluded[0]["dom_path"], "/html/body/h1/strong")
        self.assertEqual(excluded[0]["text"], "단독")
        self.assertEqual(excluded[0]["text_hash"], hashlib.sha256("단독".encode()).hexdigest())
        self.assertEqual(result["blocks"][0]["text"], "확인한 본문.")

    def test_title_badge_exclusion_rejects_non_descendant_and_text_selectors(self):
        raw = b'<html><body><h1>Title <strong>Badge</strong></h1><article><p>Body.</p></article></body></html>'
        for selector in ("//article", ".", ".//strong/text()", ".//strong | //article"):
            with self.subTest(selector=selector):
                response = self.invoke(raw, {"content_xpath": "//article", "title_xpath": "//h1", "title_exclude_xpath": selector})
                self.assertEqual(response["worker_status"], "failed")

    def test_newspim_profile_excludes_ai_summary_and_keeps_reporter_body(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in config["article_profiles"] if p["id"] == "newspim-news-article")
        self.assertIsNotNone(re.fullmatch(profile["url_pattern"], "https://www.newspim.com/news/view/20260911000305"))
        data = '''<html lang="ko"><head><title>사이트 제목</title></head><body>
        <article class="bodynews"><div class="header"><h1>HD현대로보틱스 투자 발표</h1>
        <time id="send-time" itemprop="datePublished" datetime="2026-09-11T10:23:07+09:00">2026년09월11일 10:23</time></div>
        <section class="contents"><section id="aiSummary" class="ai-summary"><p>AI 핵심 요약</p>
        <p>확인되지 않은 계약 완료</p><p>AI가 자동 생성한 요약으로 정확하지 않을 수 있어요.</p></section>
        <div id="news-contents"><p>[서울=뉴스핌] 기자 = 원문 기자 본문이다.</p>
        <p>HD현대로보틱스가 에이딘로보틱스 지분을 130억 원에 취득했다고 11일 밝혔다.</p>
        <p>양사는 로봇손을 개발할 계획이다.</p><p>chanw@newspim.com</p></div></section></article>
        <div class="related"><p>관련 기사 2026-09-15</p></div></body></html>'''.encode()
        result = self.invoke(data, profile["options"])["result"]
        self.assertEqual(result["title"], "HD현대로보틱스 투자 발표")
        self.assertEqual(result["dates"]["published_at"], "2026-09-11T10:23:07+09:00")
        self.assertEqual(result["dates"]["profile_status"], "matched")
        body = " ".join(block["text"] for block in result["blocks"])
        self.assertIn("원문 기자 본문", body)
        self.assertIn("130억 원에 취득", body)
        self.assertNotIn("AI 핵심 요약", body)
        self.assertNotIn("확인되지 않은 계약 완료", body)
        self.assertNotIn("chanw@newspim.com", body)
        self.assertNotIn("관련 기사", body)

    def test_bocconi_research_profile_binds_the_article_header_and_body(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = next(p["options"] for p in config["article_profiles"] if p["id"] == "bocconi-novices-rct-20260827")
        data = b'''<html><head><title>University news</title></head><body><main><article class="node node--news">
        <article class="bds-pl-news"><h1><span>Better evaluations with ChatGPT</span></h1><time datetime="2026-08-27T16:00:00Z">27 Aug 2026</time></article>
        <article class="c-text"><h2>What the study measured</h2><p>The study assigns 1,053 students by class to four conditions.</p><p>Evaluations use a five-point scale.</p></article>
        <section class="related"><h1>Unrelated research</h1><time datetime="2026-09-25T16:00:00Z">25 Sep 2026</time><p>Related card text must be excluded.</p></section>
        </article></main><footer><p>Unrelated footer text.</p></footer></body></html>'''
        result = self.invoke(data, options)["result"]
        self.assertEqual(result["status"], "extracted")
        self.assertEqual(result["title"], "Better evaluations with ChatGPT")
        self.assertEqual(result["dates"]["published_at"], "2026-08-27")
        self.assertEqual(result["dates"]["profile_status"], "matched")
        self.assertEqual(result["dates"]["basis"]["text"], "2026-08-27T16:00:00Z")
        self.assertEqual(result["dates"]["basis"]["attribute"], "datetime")
        body = " ".join(block["text"] for block in result["blocks"])
        self.assertIn("1,053", body)
        self.assertIn("five-point scale", body)
        self.assertNotIn("Related card", body)
        self.assertNotIn("Unrelated", body)
        self.assertNotIn("25 Sep", body)
        absent = self.invoke(data.replace(b'<time datetime="2026-08-27T16:00:00Z">27 Aug 2026</time>', b''), options)["result"]
        self.assertIsNone(absent["dates"]["published_at"])
        self.assertEqual(absent["dates"]["profile_status"], "missing")
        duplicate = self.invoke(data.replace(b'</h1><time', b'</h1><time datetime="2026-08-28T16:00:00Z">28 Aug 2026</time><time', 1), options)["result"]
        self.assertIsNone(duplicate["dates"]["published_at"])
        self.assertEqual(duplicate["dates"]["profile_status"], "ambiguous")
        invalid = self.invoke(data.replace(b'2026-08-27T16:00:00Z', b'2026-02-30T16:00:00Z'), options)["result"]
        self.assertIsNone(invalid["dates"]["published_at"])
        self.assertEqual(invalid["dates"]["profile_status"], "invalid-date")
        missing_body = self.invoke(data.replace(b'class="c-text"', b'class="changed-body"'), options)
        self.assertEqual(missing_body["worker_status"], "failed")

    def test_anthropic_eval_profile_preserves_definitions_and_table_without_related_content(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        profile = next(p for p in config["article_profiles"] if p["id"] == "anthropic-demystifying-agent-evals")
        options = profile["options"]
        data = b'''<html><head><title>Engineering newsletter</title></head><body><main>
        <section><div><div><h1 class="headline-1">Demystifying evals for AI agents</h1></div></div></section>
        <div><article><div><div class="Body-module-scss-module__fixture__body">
        <h2>Evaluation definitions</h2><p>When building agent evaluations, we use the following definitions:</p>
        <ul><li>A task has defined inputs and success criteria.</li><li>Each attempt is a trial.</li>
        <li>A grader scores performance.</li><li>A transcript records a trial.</li><li>The outcome is the final environment state.</li></ul>
        <table><tbody><tr><th>Grader</th><th>Checks</th></tr><tr><td>Code</td><td><ul><li>Run tests</li><li>Check state</li></ul></td></tr></tbody></table>
        <pre><code>example_tool_call()</code></pre><p>Read the actual output as well as the trace.</p>
        </div></div></article></div>
        <aside><h1>Related page</h1><p>Newsletter offer must be excluded.</p></aside>
        </main><footer><p>Footer must be excluded.</p></footer></body></html>'''
        result = self.invoke(data, options)["result"]
        self.assertEqual(result["status"], "extracted")
        self.assertEqual(result["title"], "Demystifying evals for AI agents")
        texts = [b["text"] for b in result["blocks"]]
        self.assertIn("A task has defined inputs and success criteria.", texts)
        self.assertIn("Each attempt is a trial.", texts)
        self.assertIn("The outcome is the final environment state.", texts)
        self.assertIn("example_tool_call()", texts)
        tables = [b for b in result["blocks"] if b["kind"] == "table"]
        self.assertEqual(len(tables), 1)
        self.assertEqual(tables[0]["rows"], [["Grader", "Checks"], ["Code", "Run tests Check state"]])
        self.assertNotIn("Run tests", texts)
        self.assertNotIn("Check state", texts)
        self.assertNotIn("Newsletter", " ".join(texts))
        self.assertNotIn("Footer", " ".join(texts))
        self.assertTrue(all(b["locator"]["dom_path"] for b in result["blocks"]))
        self.assertEqual(self.invoke(data.replace(b'Body-module-scss-module__fixture__body', b'Changed-body'), options)["worker_status"], "failed")

    def test_configured_title_never_falls_back_after_missing_or_ambiguous_match(self):
        data = b'<html><head><title>Brand</title></head><body><article><h1>One</h1><h1>Two</h1><p>Source body text for a current announcement.</p></article></body></html>'
        for selector, status in [("//h2", "missing"), ("//h1", "ambiguous")]:
            result = self.invoke(data, {"content_xpath": "//article", "title_xpath": selector})["result"]
            self.assertIsNone(result["title"])
            self.assertEqual(result["title_profile_status"], status)
            self.assertEqual(result["status"], "partial")
        attribute_selector = self.invoke(data, {"content_xpath": "//article", "title_xpath": "//article/p/text()"})
        self.assertEqual(attribute_selector["worker_status"], "failed")

    def test_person_cards_keep_names_and_explicit_roles_in_the_same_source_block(self):
        data = b'<html><head><title>About</title></head><body><main><h1>Company</h1><div><h4>Martin Akerman, PhD</h4><span>CTO &amp; Co-founder</span><span>Board Member</span></div><div><h4>Adrian Krainer, PhD</h4><span>CSHL</span><span>Scientific Advisory Board</span></div></main><aside><p>Unrelated content</p></aside></body></html>'
        options = {"content_xpath": "//main", "content_block_xpath": ".//h1|.//h4|.//div[h4 and span]"}
        result = self.invoke(data, options)["result"]
        texts = [b["text"] for b in result["blocks"]]
        self.assertEqual(texts, ["Company", "Martin Akerman, PhD CTO & Co-founder Board Member", "Adrian Krainer, PhD CSHL Scientific Advisory Board"])
        self.assertTrue(all(b["locator"]["dom_path"] for b in result["blocks"]))
        self.assertIsNone(result["dates"]["published_at"])
        for selector in ("//aside/p", ".//h4/text()", ".//missing", "//head"):
            self.assertEqual(self.invoke(data, {**options, "content_block_xpath": selector})["worker_status"], "failed")
        self.assertEqual(self.invoke(data, {"content_block_xpath": ".//h4"})["worker_status"], "failed")

    def openai_announcement_fixture(self, title, date=b"August 25, 2026"):
        return b'''<html><head><title>OpenAI</title></head><body><article>
        <div><div><div><div><div><div><p>''' + date + b'''</p></div>
        <div><h1>''' + title + b'''</h1></div></div></div></div></div></div>
        <div><nav><p>Repeated table of contents must be excluded.</p></nav>
        <nav><p>Another navigation copy must be excluded.</p></nav>
        <div><p>Official announcement with supported conditions.</p>
        <div><h2>How it works</h2><p>Permissions remain in force.</p></div>
        <div><h2>Appendix</h2><figure><figcaption><p>InferenceX, nominal 8k/1k, package TDP 700 W.</p></figcaption></figure>
        <div><p>85,448 vs. 44,960 mixed / kW.</p></div></div></div></div>
        <section><h2>Author</h2><p>Publisher only.</p></section>
        <div><h2>Keep reading</h2><time>Sep 23, 2026</time></div>
        </article></body></html>'''

    def openai_announcement_options(self, profile_id):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        return next(p for p in config["article_profiles"] if p["id"] == profile_id)

    def test_openai_announcement_profiles_keep_body_appendix_and_header_day(self):
        import re
        cases = [
            ("openai-admin-plugin-20260825", "https://openai.com/index/introducing-admin-plugin/", b"Introducing the Admin plugin"),
            ("openai-jalapeno-first-results-20260825", "https://openai.com/index/jalapeno-first-results/", b"Jalape\xc3\xb1o first results"),
        ]
        for profile_id, url, title in cases:
            with self.subTest(profile_id=profile_id):
                profile = self.openai_announcement_options(profile_id)
                self.assertIsNotNone(re.fullmatch(profile["url_pattern"], url))
                self.assertIsNone(re.fullmatch(profile["url_pattern"], url + "-unrelated"))
                result = self.invoke(self.openai_announcement_fixture(title), profile["options"])["result"]
                texts = [block["text"] for block in result["blocks"]]
                self.assertEqual(result["status"], "extracted")
                self.assertEqual(result["title"], title.decode())
                self.assertEqual(result["dates"]["published_at"], "2026-08-25")
                self.assertEqual(result["dates"]["precision"], "day")
                self.assertEqual(result["dates"]["profile_status"], "matched")
                self.assertIn("Official announcement with supported conditions.", texts)
                self.assertIn("InferenceX, nominal 8k/1k, package TDP 700 W.", texts)
                self.assertIn("85,448 vs. 44,960 mixed / kW.", texts)
                self.assertNotIn("Repeated table of contents", " ".join(texts))
                self.assertNotIn("Publisher only", " ".join(texts))
                self.assertNotIn("Keep reading", " ".join(texts))

    def test_openai_announcement_date_profile_does_not_use_related_article_dates(self):
        options = self.openai_announcement_options("openai-admin-plugin-20260825")["options"]
        for date, expected in ((b"Unavailable", "no-match"), (b"August 32, 2026", "invalid-date")):
            with self.subTest(date=date):
                result = self.invoke(self.openai_announcement_fixture(b"Admin plugin", date), options)["result"]
                self.assertIsNone(result["dates"]["published_at"])
                self.assertEqual(result["dates"]["profile_status"], expected)

    def test_indexed_json_article_extracts_source_bound_content_and_date(self):
        options = {
            "language": "ko",
            "embedded_article": {
                "format": "indexed-json-array",
                "script_xpath": "//script[@id='__NUXT_DATA__' and @type='application/json']",
                "url_id_pattern": r"^https://example\.com/posts/(?P<id>[0-9]+)$",
                "record_fields": {"id": "id", "title": "title", "published_at": "releaseDate", "content_html": "content"},
                "publication_date_format": "%Y.%m.%d",
                "content_block_xpath": ".//*[self::p or self::h2 or self::li or self::table]",
            },
        }
        record = {"id": 2, "title": 3, "releaseDate": 4, "content": 5}
        values = [None, record, 837, "개인화 랭킹 모델", "2026.09.23", "<p>첫 문단입니다.</p><h2>구조</h2><ul><li>피처 파이프라인</li></ul><table><tr><th>구분</th><td>값</td></tr></table>"]
        def document(items):
            return ("<html lang='ko'><head><title>페이지 셸</title></head><body><nav>관련 기사</nav>"
                    "<script id='__NUXT_DATA__' type='application/json'>" + json.dumps(items, ensure_ascii=False) + "</script>"
                    "</body></html>").encode()
        parsed = self.invoke(document(values), options, url="https://example.com/posts/837")["result"]
        self.assertEqual(parsed["status"], "extracted")
        self.assertEqual(parsed["title"], "개인화 랭킹 모델")
        self.assertEqual(parsed["dates"]["published_at"], "2026-09-23")
        self.assertEqual(parsed["dates"]["profile_status"], "matched")
        self.assertEqual(parsed["parser"]["id"], "indexed-json-array")
        self.assertEqual([b["text"] for b in parsed["blocks"]],
                         ["첫 문단입니다.", "구조", "피처 파이프라인", "구분 값"])
        self.assertTrue(all(b["locator"]["type"] == "embedded-html" for b in parsed["blocks"]))
        self.assertTrue(all(b["locator"]["script_dom_path"] for b in parsed["blocks"]))
        self.assertTrue(all(b["locator"]["text_hash"] == hashlib.sha256(b["text"].encode()).hexdigest() for b in parsed["blocks"]))
        for broken in (
            [None, record, 999, *values[3:]],
            [None, record, 837, values[3], "2026.09.32", values[5]],
            [None, record, 837, values[3], values[4], ""],
            [None, record, 837, values[3], values[4], values[5], record],
        ):
            with self.subTest(broken=broken[2:5]):
                self.assertEqual(self.invoke(document(broken), options, url="https://example.com/posts/837")["worker_status"], "failed")

    def test_nextjs_page_data_article_extracts_source_bound_modules_and_checks_url(self):
        options = {
            "language": "de",
            "embedded_article": {
                "format": "nextjs-page-data",
                "script_xpath": "//script[@id='__NEXT_DATA__' and @type='application/json']",
                "record_path": "props.pageProps.data.pageData",
                "record_uri_field": "uri",
                "title_field": "title",
                "publication_date_field": "date",
                "intro_field": "content",
                "modules_field": "contentModule.flexible",
                "module_type_field": "fieldGroupName",
                "ignored_module_types": ["Post_Contentmodule_Cm_CmGallery"],
                "module_text_fields": {
                    "Post_Contentmodule_Cm_CmTextImages": {"text_field": "cmTextImagesText", "title_field": "cmTextImagesTitle"},
                    "Post_Contentmodule_Cm_CmQuote": {"text_field": "cmQuoteText", "speaker_field": "cmQuoteName"},
                },
                "content_block_xpath": ".//*[self::h2 or self::p or self::blockquote]",
            },
        }
        state = {"props": {"pageProps": {"data": {"pageData": {
            "uri": "/robotik/saw-cell/", "title": "Roboter automatisieren Sägezentrum",
            "date": "2026-09-03T08:44:50", "content": "<p>Stahl bis neun Meter.</p>",
            "contentModule": {"flexible": [
                    {"fieldGroupName": "Post_Contentmodule_Cm_CmTextImages", "cmTextImagesTitle": "Zwei Roboter", "cmTextImagesText": "<p>IRB 8700 verarbeitet Langgut.</p><p>Die Last beträgt 1,2 Tonnen.</p>"},
                    {"fieldGroupName": "Post_Contentmodule_Cm_CmQuote", "cmQuoteText": "Fehlerquote gesunken.", "cmQuoteName": "Vanessa Hartmann"},
                    {"fieldGroupName": "Post_Contentmodule_Cm_CmGallery", "cmGalleryGallery": [{"caption": "Material"}]},
                ]},
        }}}}}
        def document(data):
            return ("<html lang='de'><head><title>Shell title</title></head><body><nav>Related</nav>"
                    "<script id='__NEXT_DATA__' type='application/json'>" + json.dumps(data, ensure_ascii=False)
                    + "</script></body></html>").encode()

        url = "https://destination-zukunft.abb.com/robotik/saw-cell/"
        parsed = self.invoke(document(state), options, url=url)["result"]
        texts = [block["text"] for block in parsed["blocks"]]
        self.assertEqual(parsed["status"], "extracted")
        self.assertEqual(parsed["title"], "Roboter automatisieren Sägezentrum")
        self.assertEqual(parsed["dates"]["published_at"], "2026-09-03")
        self.assertEqual(parsed["parser"]["id"], "nextjs-page-data")
        self.assertEqual(parsed["quality"]["ignored_content_modules"], [
            {"index": 2, "type": "Post_Contentmodule_Cm_CmGallery"}
        ])
        self.assertEqual(texts, ["Stahl bis neun Meter.", "Zwei Roboter", "IRB 8700 verarbeitet Langgut.",
                                 "Die Last beträgt 1,2 Tonnen.", "Fehlerquote gesunken.", "Vanessa Hartmann"])
        self.assertNotIn("Related", " ".join(texts))
        self.assertTrue(all(block["locator"]["script_dom_path"] for block in parsed["blocks"]))
        self.assertTrue(all(block["locator"]["text_hash"] == hashlib.sha256(block["text"].encode()).hexdigest()
                            for block in parsed["blocks"]))
        self.assertEqual(self.invoke(document(state), options, url=url.replace("saw-cell", "other-cell"))["worker_status"], "failed")
        unknown_module = json.loads(json.dumps(state))
        unknown_module["props"]["pageProps"]["data"]["pageData"]["contentModule"]["flexible"].append(
            {"fieldGroupName": "Post_Contentmodule_Cm_CmInteractiveSpec", "body": "Unsupported source text."}
        )
        unknown_result = self.invoke(document(unknown_module), options, url=url)["result"]
        self.assertEqual(unknown_result["status"], "partial")
        self.assertEqual(unknown_result["quality"]["unmapped_content_modules"], [
            {"index": 3, "type": "Post_Contentmodule_Cm_CmInteractiveSpec"}
        ])
        self.assertIn("IRB 8700 verarbeitet Langgut.", [block["text"] for block in unknown_result["blocks"]])

    def test_english_sept_date_is_shared_by_list_and_article_parsing(self):
        pattern = r"[A-Z][a-z]{2,8}\.? [0-9]{1,2}, [0-9]{4}"
        listing = b'''<html lang="en"><head><title>Research news</title></head><body><main>
        <div class="news-card"><span class="date">Sept. 22, 2026</span><h3><a href="/news/first">First story</a></h3></div>
        <p>Research updates.</p></main></body></html>'''
        listing_options = {
            "language": "en", "content_xpath": "//main", "content_block_xpath": ".//p",
            "listing_link_rules": [{
                "id": "dated-news", "item_xpath": "//div[@class='news-card']/h3/a",
                "url_attribute": "href", "url_pattern": r"(?P<url>/news/[^/?#]+)",
                "title_xpath": ".", "date_xpath": "ancestor::div[@class='news-card']/span[@class='date']",
                "date_pattern": "^" + pattern + "$", "date_format": "%B %d, %Y",
            }],
        }
        parsed = self.invoke(listing, listing_options)["result"]
        self.assertEqual(parsed["links"][0]["published_at"], "2026-09-22")
        invalid = self.invoke(listing.replace(b"Sept. 22", b"Sept. 32"), listing_options)["result"]
        self.assertIsNone(invalid["links"][0]["published_at"])

        article = b'''<html lang="en"><head><title>Research news</title></head><body><main>
        <h1>First story</h1><div class="sf-Long-text"><p class="byline">Sept. 22, 2026 | By Researcher</p>
        <p>Researchers completed a field test.</p><p class="caption">Photo of the lab.</p></div>
        </main></body></html>'''
        options = {
            "language": "en", "content_xpath": "//main", "title_xpath": "//main/h1",
            "content_block_xpath": ".//div[@class='sf-Long-text']/p[not(@class='caption')]",
            "publication_date_xpath": "//p[@class='byline']",
            "publication_date_pattern": pattern, "publication_date_format": "%B %d, %Y",
        }
        parsed = self.invoke(article, options)["result"]
        self.assertEqual(parsed["dates"]["published_at"], "2026-09-22")
        self.assertEqual([block["text"] for block in parsed["blocks"]], ["Researchers completed a field test."])
        invalid = self.invoke(article.replace(b"Sept. 22", b"Sept. 32"), options)["result"]
        self.assertIsNone(invalid["dates"]["published_at"])
        self.assertEqual(invalid["dates"]["profile_status"], "invalid-date")

    def test_frontiers_jats_preserves_provenance_tables_math_and_supplements(self):
        xml = b'''<?xml version="1.0" encoding="UTF-8"?>
        <article xmlns="http://jats.nlm.nih.gov" xmlns:xlink="http://www.w3.org/1999/xlink" article-type="research-article" xml:lang="en">
          <front><journal-meta><journal-title>Robotics and AI</journal-title></journal-meta><article-meta>
            <article-id pub-id-type="doi">10.3389/frobt.2026.1937934</article-id>
            <title-group><article-title>SkinAxis tactile sensing for robotic manipulation</article-title></title-group>
            <pub-date pub-type="epub" iso-8601-date="2026-09-22"><year>2026</year><month>09</month><day>22</day></pub-date>
            <pub-date pub-type="updated"><year>2026</year><month>09</month><day>25</day></pub-date>
            <contrib-group><contrib contrib-type="author"><name><surname>Kim</surname><given-names>Jane</given-names></name><xref ref-type="aff" rid="aff1"/><ext-link href="https://orcid.org/0000-0000-0000-0001">ORCID</ext-link></contrib></contrib-group>
            <aff id="aff1">Robotics Laboratory</aff><kwd-group><kwd>tactile sensing</kwd><kwd>robot manipulation</kwd></kwd-group>
            <abstract><p>We evaluated tactile feedback in a robotic manipulation task.</p></abstract>
          </article-meta></front>
          <body><sec><title>Methods</title><p>We measured contact force in <inline-formula><tex-math><![CDATA[$F=ma$]]></tex-math><math><semantics><mrow><mi>F</mi><mo>=</mo><mi>m</mi><mi>a</mi></mrow><annotation encoding="application/x-tex">F=ma</annotation></semantics></math></inline-formula> during the trial. The index <inline-formula><math><msub><mi mathvariant="script">D</mi><mi>val</mi></msub></math></inline-formula> covers <inline-formula><math><mfenced open="[" close="]"><mrow><mi>x</mi><mspace width="0.3333em"/><mi>y</mi></mrow></mfenced></math></inline-formula> with model <inline-formula><math><mi mathvariant="bold">D</mi></math></inline-formula>.</p>
            <table-wrap><label>Table 1</label><caption><p>Measured force by condition</p></caption><table><tbody><tr><th>Condition</th><th>Force (N)</th></tr><tr><td>Baseline</td><td>2.4 N</td></tr></tbody></table><table-wrap-foot><fn><label>a</label><p>Calibrated before each trial.</p></fn></table-wrap-foot></table-wrap>
            <fig><label>Figure 1</label><caption><p>Sensor placement</p></caption><graphic xlink:href="figures/sensor.png"/></fig>
            <list list-type="order"><list-item><label>1.</label><p>Calibrate the sensor before the trial.</p></list-item></list>
          </sec><sec><title>Results</title><p>Median force was 2.4 N.</p></sec></body>
          <back><supplementary-material xlink:href="supplementary/data.csv"><label>Supplementary data</label></supplementary-material></back>
        </article>'''
        result = self.invoke(xml, {"format": "jats"}, url="https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1937934/xml")["result"]
        self.assertEqual(result["status"], "extracted")
        self.assertEqual(result["parser"]["id"], "jats-xml")
        self.assertEqual(result["metadata"]["doi"], "10.3389/frobt.2026.1937934")
        self.assertEqual(result["metadata"]["article_type"], "research-article")
        self.assertEqual(result["metadata"]["authors"][0]["name"], "Jane Kim")
        self.assertEqual(result["metadata"]["affiliations"][0]["text"], "Robotics Laboratory")
        self.assertEqual(result["metadata"]["authors"][0]["orcid"], "https://orcid.org/0000-0000-0000-0001")
        self.assertEqual(result["dates"]["published_at"], "2026-09-22")
        self.assertEqual(result["dates"]["modified_at"], "2026-09-25")
        table = next(block for block in result["blocks"] if block["kind"] == "table")
        self.assertEqual(table["rows"], [["Condition", "Force (N)"], ["Baseline", "2.4 N"]])
        self.assertEqual(table["locator"]["type"], "jats")
        self.assertEqual(table["footnotes"][0]["text"], "a Calibrated before each trial.")
        list_item = next(block for block in result["blocks"] if block.get("list_label") == "1.")
        self.assertEqual(list_item["text"], "Calibrate the sensor before the trial.")
        self.assertEqual(next(block for block in result["blocks"] if block["kind"] == "figure")["media_urls"], ["https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1937934/figures/sensor.png"])
        self.assertIn("https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1937934/supplementary/data.csv", [link["url"] for link in result["links"]])
        expression = result["math_expressions"][0]
        self.assertEqual(expression["tex"], "$F=ma$")
        self.assertTrue(expression["mathml_sha256"])
        paragraph = next(block for block in result["blocks"] if block["kind"] == "paragraph" and "contact force" in block["text"])
        self.assertIn("$F=ma$", paragraph["text"])
        self.assertIn("\\mathcal{D}", paragraph["text"])
        self.assertIn("\\left[x\\;y\\right]", paragraph["text"])
        self.assertIn("\\mathbf{D}", paragraph["text"])
        self.assertEqual(paragraph["locator"]["text_hash"], hashlib.sha256(paragraph["text"].encode()).hexdigest())

    def test_jats_table_expands_spans_and_resolves_scoped_footnotes(self):
        xml = b'''<article article-type="research-article"><front><article-meta>
          <title-group><article-title>Grouped table</article-title></title-group>
          <pub-date pub-type="epub" iso-8601-date="2026-09-22"/><abstract><p>Abstract.</p></abstract>
        </article-meta></front><body><sec><title>Results</title><p>Result.</p>
          <table-wrap><label>Table 2</label><caption><p>Measurements by design.</p></caption>
            <table><thead>
              <tr><th rowspan="2">Model</th><th colspan="2">D1-gel</th><th colspan="2">D1-dragon</th></tr>
              <tr><th>Force</th><th>Energy</th><th>Force</th><th>Energy</th></tr>
            </thead><tbody><tr><th>Peak</th><td>4.2 N<xref ref-type="table-fn" rid="TF1">a</xref><xref ref-type="fn" rid="GF1">b</xref></td><td>3.1 J</td><td>5.0 N</td><td>4.0 J</td></tr></tbody></table>
            <table-wrap-foot><fn id="TF1"><label>a</label><p>Measured at 1.0 m/s.</p><table><tr><td>nested note table</td></tr></table></fn></table-wrap-foot>
          </table-wrap>
        </sec></body><back><fn-group><fn id="GF1"><label>b</label><p>General protocol detail.</p></fn></fn-group></back></article>'''
        result = self.invoke(xml, {"format": "jats"})["result"]
        self.assertEqual(result["status"], "extracted")
        table = next(block for block in result["blocks"] if block["kind"] == "table")
        self.assertEqual(len(table["rows"]), 3)
        self.assertEqual(table["grid"], [
            ["Model", "D1-gel", "D1-gel", "D1-dragon", "D1-dragon"],
            ["Model", "Force", "Energy", "Force", "Energy"],
            ["Peak", "4.2 N a b", "3.1 J", "5.0 N", "4.0 J"],
        ])
        self.assertEqual(table["cell_layout"][0][1]["colspan"], 2)
        self.assertEqual(table["cell_layout"][1][0]["origin_row"], 0)
        self.assertTrue(table["cell_layout"][1][0]["continuation"])
        self.assertTrue(table["cell_layout"][0][1]["xml_path"].endswith("/th[2]"))
        self.assertEqual(table["footnotes"][0]["id"], "TF1")
        self.assertEqual(table["footnotes"][0]["paragraphs"][0]["text"], "Measured at 1.0 m/s.")
        self.assertEqual(table["footnote_refs"][0]["rid"], "TF1")
        self.assertEqual(table["footnote_refs"][0]["status"], "resolved")
        self.assertEqual(table["footnote_refs"][1]["target_scope"], "document")
        self.assertEqual(table["footnote_refs"][1]["status"], "resolved")
        self.assertEqual(result["quality"]["table_layout_issues"], [])
        self.assertEqual(result["quality"]["unresolved_table_footnotes"], [])

    def test_jats_unresolved_table_footnote_and_invalid_span_are_partial(self):
        xml = b'''<article article-type="research-article"><front><article-meta>
          <title-group><article-title>Malformed table</article-title></title-group>
          <pub-date pub-type="epub" iso-8601-date="2026-09-22"/><abstract><p>Abstract.</p></abstract>
        </article-meta></front><body><sec><title>Results</title><p>Result.</p>
          <table-wrap><table><tr><th colspan="not-a-number">Value<xref ref-type="table-fn" rid="MISSING">b</xref></th></tr></table></table-wrap>
        </sec></body></article>'''
        result = self.invoke(xml, {"format": "jats"})["result"]
        self.assertEqual(result["status"], "partial")
        self.assertFalse(result["quality"]["required_fields_present"])
        self.assertEqual(len(result["quality"]["table_layout_issues"]), 1)
        self.assertEqual(result["quality"]["table_layout_issues"][0]["reason"], "invalid-span")
        self.assertEqual(len(result["quality"]["unresolved_table_footnotes"]), 1)
        table = next(block for block in result["blocks"] if block["kind"] == "table")
        self.assertEqual(table["footnote_refs"][0]["status"], "unresolved")

    def test_jats_does_not_guess_partial_dates_or_hide_unsupported_math(self):
        xml = b'''<article article-type="research-article"><front><article-meta><article-id pub-id-type="doi">10.1/example</article-id>
          <title-group><article-title>Partial metadata</article-title></title-group><pub-date pub-type="epub"><year>2026</year><month>09</month></pub-date>
          <abstract><p>Abstract.</p></abstract></article-meta></front><body><sec><title>Results</title><p>Result <inline-formula><math><mystery/></math></inline-formula>.</p></sec></body></article>'''
        result = self.invoke(xml, {"format": "jats"})["result"]
        self.assertEqual(result["status"], "partial")
        self.assertIsNone(result["dates"]["published_at"])
        self.assertEqual(result["dates"]["profile_status"], "insufficient-precision")
        self.assertEqual(result["dates"]["candidates"], ["2026-09"])
        self.assertEqual(len(result["quality"]["missing_math"]), 1)
        missing_math = result["quality"]["missing_math"][0]
        self.assertIn("<mystery", missing_math["source_xml"])
        self.assertEqual(missing_math["source_xml_sha256"], hashlib.sha256(missing_math["source_xml"].encode()).hexdigest())
        self.assertTrue(missing_math["xml_path"].endswith("/inline-formula"))
        result_paragraph = next(block["text"] for block in result["blocks"] if block["kind"] == "paragraph" and block["text"].startswith("Result"))
        self.assertIn("[수식 원문 확인 필요]", result_paragraph)

    def test_jats_external_entities_are_not_expanded(self):
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8") as secret:
            secret.write("EXTERNAL_ENTITY_MUST_NOT_BE_READ")
            secret.flush()
            xml = f'''<!DOCTYPE article [<!ENTITY secret SYSTEM "file://{secret.name}">]>
            <article article-type="research-article"><front><article-meta><title-group><article-title>Entity test</article-title></title-group>
            <pub-date pub-type="epub" iso-8601-date="2026-09-22"/><abstract><p>Abstract.</p></abstract></article-meta></front>
            <body><sec><title>Results</title><p>&secret;</p></sec></body></article>'''.encode()
            result = self.invoke(xml, {"format": "jats"})["result"]
            self.assertNotIn("EXTERNAL_ENTITY_MUST_NOT_BE_READ", " ".join(block["text"] for block in result["blocks"]))


if __name__ == "__main__":
    unittest.main()
