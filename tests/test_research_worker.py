"""Parser regressions; run with the isolated worker Python runtime."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unittest
import pymupdf


WORKER = Path(__file__).resolve().parents[1] / "integrations/research-worker/worker.py"


class WorkerTests(unittest.TestCase):
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

    def test_explicit_publication_date_conflict_remains_unresolved(self):
        raw = self.aws_date_fixture(metadata=b'2026-08-27T21:09:39Z')
        result = self.invoke(raw, self.aws_date_options())["result"]
        self.assertIsNone(result["dates"]["published_at"])
        self.assertEqual(result["dates"]["profile_status"], "conflict")
        self.assertEqual(result["dates"]["basis"]["text"], "August 26, 2026")

    def test_timezone_less_html_metadata_dates_remain_candidates(self):
        result = self.invoke(self.aws_date_fixture(), {"content_xpath": "//article"})["result"]
        self.assertIsNone(result["dates"]["published_at"])
        self.assertIsNone(result["dates"]["modified_at"])
        self.assertEqual(result["dates"]["profile_status"], "invalid-date")
        self.assertEqual(result["dates"]["modified_profile_status"], "invalid-date")
        self.assertEqual(result["dates"]["candidates"], ["2026-08-26T21:09:39.124"])
        self.assertEqual(result["dates"]["modified_candidates"], ["2026-08-26T21:09:49.555"])
        self.assertEqual(result["status"], "extracted")

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
        result = self.invoke(raw, options)["result"]
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
        raw = b'''<html lang="en"><head><title>KUKA site</title></head><body>
        <nav>Another product announced in 2025</nav><main>
        <section class="mod-page-intro"><h1>Autonomous Pallet Handling</h1>
        <p class="intro">KUKA introduces the KMF 1500P-CB forklift.</p>
        <p class="mod-page-intro__date">10 September 2026</p></section>
        <article class="mod-text"><div><h2>New forklift family</h2></div>
        <div class="copy">The machine handles loads of up to 1,500 kilograms.</div></article>
        <section class="mod-text-image"><h2>Availability</h2>
        <div class="copy">Deliveries are expected in December 2026.</div></section>
        </main></body></html>'''
        result = self.invoke(raw, profile["options"])["result"]
        self.assertEqual(result["title"], "Autonomous Pallet Handling")
        self.assertEqual(result["dates"]["published_at"], "2026-09-10")
        self.assertEqual(result["dates"]["basis"]["text"], "10 September 2026")
        content = " ".join(block["text"] for block in result["blocks"])
        self.assertIn("1,500 kilograms", content)
        self.assertIn("expected in December 2026", content)
        self.assertNotIn("Another product", content)
        missing = self.invoke(raw.replace(b"10 September 2026", b"date unavailable"), profile["options"])["result"]
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

    def test_doosan_news_profiles_keep_list_and_both_detail_templates_separate(self):
        config = json.loads((WORKER.parents[2] / "data/research-acquisition.json").read_text())
        options = config["route-doosan-news-en"]["parse_options"]
        raw = b'''<html lang="en"><head><title>Company navigation</title></head><body>
        <div class="sub-head"><h2>News</h2><div class="total">Total. <strong>2</strong> [1/1]</div></div>
        <div class="news-list"><ul>
        <li><a href="/en/about/promotion/news/robot-launch"><p class="title">Robot launch</p><p class="date">2026. 06. 22</p></a></li>
        <li><a href="/en/about/promotion/news/view/116"><p class="title">CES exhibit</p><p class="date">2026. 01. 06</p></a></li>
        </ul></div><footer><p>Unrelated operating guidance.</p></footer></body></html>'''
        result = self.invoke(raw, options)["result"]
        self.assertEqual(result["listing_page_summary"]["total"], 2)
        self.assertEqual([x["published_at"] for x in result["links"] if x.get("profile_id")], ["2026-06-22", "2026-01-06"])
        self.assertEqual([b["text"] for b in result["blocks"]], ["Robot launch", "CES exhibit"])
        for profile_id, body in [
            ("doosan-en-news-slug", b'<div class="content"><div>Released the palletizing solution.</div><div>Next steps are planned.</div></div>'),
            ("doosan-en-news-view", b'<div class="content"><p>Presented the first robot.</p><p>Other capabilities are planned.</p></div>'),
        ]:
            detail_options = next(p["options"] for p in config["article_profiles"] if p["id"] == profile_id)
            article = b'<html lang="en"><head><title>Site shell</title></head><body><div class="board-head"><h2>Robot announcement</h2><p>2026. 06. 22</p></div><div class="board-cont">' + body + b'</div><footer><p>Other news on 2026. 09. 28</p></footer></body></html>'
            parsed = self.invoke(article, detail_options)["result"]
            self.assertEqual(parsed["title"], "Robot announcement")
            self.assertEqual(parsed["dates"]["published_at"], "2026-06-22")
            self.assertEqual(len(parsed["blocks"]), 2)
            self.assertFalse(any("Other news" in block["text"] for block in parsed["blocks"]))

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
        absent = self.invoke(doc.tobytes(), {**options, "publication_date_pattern": "^missing"})["result"]
        self.assertIsNone(absent["dates"]["published_at"])
        self.assertEqual(absent["dates"]["profile_status"], "missing")
        wrong_page = self.invoke(doc.tobytes(), {**options, "publication_date_page": 2})
        self.assertEqual(wrong_page["worker_status"], "failed")

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


if __name__ == "__main__":
    unittest.main()
