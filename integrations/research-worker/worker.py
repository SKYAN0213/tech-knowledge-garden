"""Local-file-only document worker. One bounded JSON request/result per line."""
import argparse
import contextlib
import copy
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urljoin, urlparse, unquote
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

VERSION = "research-worker/1"


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()


def clean(value):
    return re.sub(r"\s+", " ", value or "").strip()


def known_date(value, calendar_zone=None):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if calendar_zone is not None and parsed.tzinfo is not None:
            parsed = parsed.astimezone(calendar_zone)
        return parsed.date().isoformat()
    except (ValueError, TypeError, AttributeError):
        pass
    # Drupal's press metadata uses a local wall time without an offset. Only
    # its calendar day is comparable with an explicitly selected release date.
    if isinstance(value, str) and re.fullmatch(r"[A-Z][a-z]{2}, \d{2}/\d{2}/\d{4} - \d{2}:\d{2}", value):
        try:
            parsed = datetime.strptime(value, "%a, %m/%d/%Y - %H:%M")
            return parsed.date().isoformat() if parsed.strftime("%a") == value[:3] else None
        except ValueError:
            return None
    return None


def date_for_strptime(value, fmt, language):
    """Normalize date digits/month names; callers retain the untouched source basis."""
    value = value.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    if isinstance(language, str) and language.split("-", 1)[0].lower() == "en" and "%B" in fmt:
        months = {
            "Jan": "January", "Feb": "February", "Mar": "March", "Apr": "April",
            "May": "May", "Jun": "June", "Jul": "July", "Aug": "August",
            "Sep": "September", "Sept": "September", "Oct": "October",
            "Nov": "November", "Dec": "December",
        }
        value = re.sub(
            r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?(?=\s+\d{1,2}\b)",
            lambda match: months[match.group(0).rstrip(".")], value,
        )
    if not isinstance(language, str) or language.split("-", 1)[0].lower() != "de" or "%B" not in fmt:
        return value
    months = {
        "Januar": "January", "Februar": "February", "März": "March",
        "Mai": "May", "Juni": "June", "Juli": "July", "Oktober": "October",
        "Dezember": "December",
    }
    return re.sub(r"\b(?:Januar|Februar|März|Mai|Juni|Juli|Oktober|Dezember)\b", lambda m: months[m.group(0)], value)


def source_date_value(value):
    """Keep source days or explicit-offset timestamps; never infer a timezone."""
    if isinstance(value, str):
        # ISO 8601 basic offsets denote the same instant as the colon form.
        # Keep the publisher's untouched spelling in the extraction basis.
        value = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", value)
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?",
        value,
    ) or known_date(value) is None:
        return None
    offset = re.search(r"[+-](\d{2}):(\d{2})$", value)
    if offset and (int(offset[1]) > 23 or int(offset[2]) > 59):
        return None
    return value


def checked_path(root, relative):
    rel = Path(relative)
    if rel.is_absolute() or ".." in rel.parts:
        raise ValueError("Path outside private worker root")
    current = root
    if root.is_symlink():
        raise ValueError("Symlink root")
    for segment in rel.parts:
        current = current / segment
        if current.is_symlink():
            raise ValueError("Symlink in worker path")
    if not current.resolve().is_relative_to(root.resolve()):
        raise ValueError("Path escapes worker root")
    return current


def math_local_name(node):
    return node.tag.rsplit("}", 1)[-1].split(":")[-1].lower() if isinstance(node.tag, str) else ""


def presentation_math_text(node, preserve_bold=False):
    """Serialize supported MathML structures without evaluating or flattening them."""
    tag = math_local_name(node)
    children = [child for child in node if isinstance(child.tag, str)]
    # Unsupported layout attributes can change a symbol's meaning (e.g. bold
    # vectors or a barless fraction). Prefer publisher TeX; do not guess them.
    if any(attribute in node.attrib for attribute in ("linethickness", "bevelled")):
        return None
    variant = node.get("mathvariant")
    variant_commands = {
        "normal": "mathrm",
        "italic": "mathit",
        "script": "mathcal",
    }
    if preserve_bold:
        variant_commands["bold"] = "mathbf"
    if variant and variant not in variant_commands:
        return None
    if tag == "mspace":
        width = node.get("width", "")
        match = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)em", width)
        if not match:
            return None
        size = float(match.group(1))
        return "" if size == 0 else "\\," if size < 0.25 else "\\:" if size < 0.30 else "\\;" if size < 0.5 else "\\quad" if size <= 1.5 else "\\qquad" if size <= 2 else None
    if tag in ("mi", "mn", "mo", "mtext"):
        value = clean(node.text)
        if children:
            return None
        if not value:
            if tag == "mtext" and (node.text or "").strip() == "":
                return "\\,"
            return None
        return f"\\{variant_commands[variant]}{{{value}}}" if variant else value
    if tag == "semantics":
        presentation = [child for child in children if math_local_name(child) not in ("annotation", "annotation-xml")]
        return presentation_math_text(presentation[0], preserve_bold=preserve_bold) if len(presentation) == 1 else None
    if not children:
        return None
    if clean(node.text) or any(clean(child.tail) for child in children):
        return None
    values = [presentation_math_text(child, preserve_bold=preserve_bold) for child in children]
    if any(value is None for value in values):
        return None
    if tag in ("math", "mrow", "mstyle", "mtd"):
        return "".join(values)
    base = values[0] if math_local_name(children[0]) in ("mi", "mn", "mo", "mtext") else "{" + values[0] + "}"
    if tag == "msup" and len(values) == 2:
        return f"{base}^{{{values[1]}}}"
    if tag == "msub" and len(values) == 2:
        return f"{base}_{{{values[1]}}}"
    if tag == "msubsup" and len(values) == 3:
        return f"{base}_{{{values[1]}}}^{{{values[2]}}}"
    if tag == "mfrac" and len(values) == 2:
        return f"\\frac{{{values[0]}}}{{{values[1]}}}"
    if tag == "msqrt":
        return "\\sqrt{" + "".join(values) + "}"
    if tag == "mroot" and len(values) == 2:
        return f"\\sqrt[{values[1]}]{{{values[0]}}}"
    if tag == "mfenced":
        opening, closing = node.get("open", "("), node.get("close", ")")
        separators = node.get("separators", ",")
        if not separators:
            separators = [""]
        else:
            separators = list(separators)
        body = "".join(value + (separators[min(index, len(separators) - 1)] if index < len(values) - 1 else "") for index, value in enumerate(values))
        return f"\\left{opening}{body}\\right{closing}"
    if tag == "mover" and len(values) == 2:
        return f"\\overset{{{values[1]}}}{{{values[0]}}}"
    if tag == "munder" and len(values) == 2:
        return f"\\underset{{{values[1]}}}{{{values[0]}}}"
    if tag == "munderover" and len(values) == 3:
        return f"\\overset{{{values[2]}}}{{\\underset{{{values[1]}}}{{{values[0]}}}}}"
    if tag == "mtr" and all(math_local_name(child) == "mtd" for child in children):
        return " & ".join(values)
    if tag == "mtable" and all(math_local_name(child) == "mtr" for child in children):
        return "\\begin{matrix}" + " \\\\ ".join(values) + "\\end{matrix}"
    return None


def preserve_html_math(dom):
    from lxml import etree, html

    expressions = []
    nodes = [node for node in dom.iter() if math_local_name(node) == "math" and not any(math_local_name(parent) == "math" for parent in node.iterancestors())]
    if len(nodes) > 5000:
        raise ValueError("HTML math expression budget exceeded")
    for node in nodes:
        # Retain the original element locator and canonical serialization before
        # replacing it with inert reader text for the generic body extractor.
        serialized = etree.tostring(node, encoding="utf-8", with_tail=False)
        location = dom.getroottree().getpath(node)
        alternative = clean(node.get("alttext"))
        annotations = [clean("".join(child.itertext())) for child in node.iter() if math_local_name(child) == "annotation" and child.get("encoding", "").lower() in ("application/x-tex", "text/x-tex")]
        tex_values = [value for value in [alternative, *annotations] if value]
        reason = None
        if any(len(value) > 8192 for value in tex_values):
            value, basis, reason = None, None, "tex-budget-exceeded"
        elif len(set(tex_values)) > 1:
            value, basis, reason = None, None, "conflicting-tex-alternatives"
        elif tex_values:
            value = tex_values[0]
            basis = "alttext" if alternative else "tex-annotation"
        else:
            value = presentation_math_text(node)
            basis = "presentation-mathml" if value else None
            if not value:
                reason = "unsupported-presentation"
        expressions.append({"dom_path": location, "text": value, "basis": basis, "mathml_serialization_sha256": digest(serialized), "reason": reason})
        replacement = html.Element("span")
        replacement.text = value or "[수식 원문 확인 필요]"
        replacement.tail = node.tail
        node.getparent().replace(node, replacement)
    return expressions


def indexed_json_article(dom, url, options):
    """Read an article from an indexed JSON state, retaining its script locator."""
    from lxml import etree, html

    profile = options["embedded_article"]
    fields = profile.get("record_fields")
    required = ("id", "title", "published_at", "content_html")
    if profile.get("format") != "indexed-json-array" or not isinstance(fields, dict) or any(
        not isinstance(fields.get(name), str) or not fields[name] for name in required
    ):
        raise ValueError("Invalid indexed article profile")
    selector = profile.get("script_xpath")
    block_selector = profile.get("content_block_xpath")
    pattern = profile.get("url_id_pattern")
    date_format = profile.get("publication_date_format")
    if any(
        not isinstance(value, str) or not value or len(value) > 1024
        for value in (selector, block_selector, pattern, date_format)
    ):
        raise ValueError("Incomplete indexed article profile")
    match = re.fullmatch(pattern, url)
    if not match or "id" not in match.groupdict():
        raise ValueError("Indexed article URL identity missing")
    scripts = dom.xpath(selector)
    if len(scripts) != 1 or not isinstance(scripts[0], etree._Element) or scripts[0].tag != "script":
        raise ValueError("Indexed article script must be unique")
    script = scripts[0]
    serialized = script.text or ""
    if not serialized or len(serialized) > 2_000_000:
        raise ValueError("Indexed article script absent or too large")
    values = json.loads(serialized)
    if not isinstance(values, list) or not 1 <= len(values) <= 100_000:
        raise ValueError("Indexed article state must be a bounded array")

    def scalar(record, name):
        index = record[fields[name]]
        if type(index) is not int or index < 0 or index >= len(values):
            raise ValueError("Indexed article field reference invalid")
        return values[index]

    matches = []
    for index, record in enumerate(values):
        if not isinstance(record, dict) or not all(fields[name] in record for name in required):
            continue
        if str(scalar(record, "id")) == match.group("id"):
            matches.append((index, record))
    if len(matches) != 1:
        raise ValueError("Indexed article record missing or ambiguous")
    record_index, record = matches[0]
    title, printed_date, content = (
        scalar(record, name) for name in ("title", "published_at", "content_html")
    )
    if (
        not isinstance(title, str) or not clean(title)
        or not isinstance(printed_date, str)
        or not isinstance(content, str) or not content.strip()
        or len(content) > 1_000_000
    ):
        raise ValueError("Indexed article fields incomplete")
    try:
        parsed_date = datetime.strptime(printed_date, date_format)
        if parsed_date.strftime(date_format) != printed_date:
            raise ValueError("Date format changed")
    except ValueError as error:
        raise ValueError("Indexed article date invalid") from error
    fragment = html.fragment_fromstring(content, create_parent=True)
    math_expressions = preserve_html_math(fragment)
    nodes = fragment.xpath(block_selector)
    if not nodes or any(not isinstance(node, etree._Element) or node is fragment for node in nodes):
        raise ValueError("Indexed article block selector failed")
    script_path = dom.getroottree().getpath(script)
    fragment_tree = fragment.getroottree()
    blocks = []
    for node in nodes:
        if any(parent in nodes for parent in node.iterancestors()):
            continue
        if any(parent.tag in ("script", "style", "noscript") for parent in [node, *node.iterancestors()]):
            raise ValueError("Indexed article selected non-reader content")
        value = clean(" ".join(node.itertext()))
        if not value:
            continue
        tag = etree.QName(node).localname
        kind = (
            "table" if tag == "table"
            else "heading" if tag in ("h1", "h2", "h3", "h4", "h5", "h6")
            else "paragraph"
        )
        block = {
            "kind": kind,
            "text": value,
            "locator": {
                "type": "embedded-html", "script_dom_path": script_path,
                "record_index": record_index, "content_key": fields["content_html"],
                "fragment_dom_path": fragment_tree.getpath(node),
                "extracted_order": len(blocks), "text_hash": digest(value),
            },
        }
        if kind == "table":
            block["rows"] = [
                [clean(" ".join(cell.itertext())) for cell in row if cell.tag in ("td", "th")]
                for row in node.iter() if row.tag == "tr"
            ]
        blocks.append(block)
    if not blocks:
        raise ValueError("Indexed article body empty")
    links = []
    for node in fragment.xpath(".//a[@href]"):
        href = urljoin(url, node.get("href"))
        if urlparse(href).scheme in ("http", "https"):
            links.append({
                "url": href, "text": clean(node.text_content()),
                "script_dom_path": script_path, "record_index": record_index,
                "fragment_dom_path": fragment_tree.getpath(node),
            })
    missing_math = [
        {"dom_path": item["dom_path"], "reason": item["reason"]}
        for item in math_expressions if item["reason"]
    ]
    complete = not missing_math
    result = {
        "status": "extracted" if complete else "partial",
        "title": clean(title),
        "title_basis": {
            "type": "indexed-json", "script_dom_path": script_path,
            "record_index": record_index, "field": fields["title"],
            "text_hash": digest(clean(title)),
        },
        "title_profile_status": "matched",
        "language": dom.get("lang") or options.get("language"),
        "dates": {
            "published_at": parsed_date.date().isoformat(), "modified_at": None,
            "precision": "day", "candidates": [printed_date],
            "basis": {
                "type": "indexed-json", "script_dom_path": script_path,
                "record_index": record_index, "field": fields["published_at"],
                "text": printed_date,
            },
            "profile_status": "matched", "modified_candidates": [],
            "modified_basis": None, "modified_profile_status": "not-configured",
        },
        "blocks": blocks, "links": links, "link_profiles": [],
        "quality": {"required_fields_present": complete, "missing_pages": [], "reviewed": False},
    }
    if math_expressions:
        result["math_expressions"] = math_expressions
        result["quality"]["missing_math"] = missing_math
    return result


def nextjs_page_data_article(dom, url, options):
    """Extract article HTML modules from a bounded Next.js page-data object."""
    from lxml import etree, html

    profile = options["embedded_article"]
    required = ("script_xpath", "record_path", "record_uri_field", "title_field",
                "publication_date_field", "intro_field", "modules_field",
                "module_text_fields", "content_block_xpath")
    if profile.get("format") != "nextjs-page-data" or any(
        not isinstance(profile.get(name), str) or not profile[name]
        for name in required if name not in ("module_text_fields",)
    ) or not isinstance(profile.get("module_text_fields"), dict):
        raise ValueError("Invalid Next.js article profile")
    scripts = dom.xpath(profile["script_xpath"])
    if len(scripts) != 1 or not isinstance(scripts[0], etree._Element) or scripts[0].tag != "script":
        raise ValueError("Next.js article script must be unique")
    script = scripts[0]
    serialized = script.text or ""
    if not serialized or len(serialized.encode("utf-8")) > 2_000_000:
        raise ValueError("Next.js article state absent or too large")
    state = json.loads(serialized)

    def path_value(value, path):
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,256}", path):
            raise ValueError("Invalid Next.js article field path")
        for part in path.split("."):
            if not isinstance(value, dict) or part not in value:
                raise ValueError("Next.js article field missing")
            value = value[part]
        return value

    record = path_value(state, profile["record_path"])
    if not isinstance(record, dict):
        raise ValueError("Next.js article record must be an object")
    record_uri = record.get(profile["record_uri_field"])
    if not isinstance(record_uri, str) or record_uri.rstrip("/") != urlparse(url).path.rstrip("/"):
        raise ValueError("Next.js article URL identity mismatch")
    title = path_value(record, profile["title_field"])
    published = path_value(record, profile["publication_date_field"])
    intro = path_value(record, profile["intro_field"])
    modules = path_value(record, profile["modules_field"])
    if not isinstance(title, str) or not clean(title) or not isinstance(published, str):
        raise ValueError("Next.js article title or date invalid")
    if not isinstance(intro, str) or not isinstance(modules, list) or len(modules) > 200:
        raise ValueError("Next.js article content modules invalid")
    try:
        published_date = datetime.fromisoformat(published.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("Next.js article publication date invalid") from error

    selector = profile["content_block_xpath"]
    if len(selector) > 1024:
        raise ValueError("Next.js article block selector too long")
    ignored_module_types = profile.get("ignored_module_types", [])
    if (
        not isinstance(ignored_module_types, list)
        or any(not isinstance(value, str) or not value for value in ignored_module_types)
        or len(ignored_module_types) != len(set(ignored_module_types))
    ):
        raise ValueError("Invalid Next.js ignored module types")
    script_path = dom.getroottree().getpath(script)
    blocks, links, missing_math, ignored_modules, unmapped_modules = [], [], [], [], []

    def add_html(content, json_path):
        if not isinstance(content, str) or len(content) > 1_000_000:
            raise ValueError("Next.js article HTML field invalid")
        fragment = html.fragment_fromstring(content, create_parent=True)
        math_items = preserve_html_math(fragment)
        missing_math.extend({"json_path": json_path, "dom_path": item["dom_path"], "reason": item["reason"]}
                            for item in math_items if item["reason"])
        tree = fragment.getroottree()
        nodes = fragment.xpath(selector)
        if not nodes and "<" not in content and clean(content):
            value = clean(content)
            blocks.append({"kind": "paragraph", "text": value,
                           "locator": {"type": "embedded-json", "script_dom_path": script_path,
                                       "json_path": json_path, "extracted_order": len(blocks),
                                       "text_hash": digest(value)}})
        for node in nodes:
            if not isinstance(node, etree._Element) or node is fragment:
                raise ValueError("Next.js article block selector failed")
            if any(parent in nodes for parent in node.iterancestors()):
                continue
            if any(parent.tag in ("script", "style", "noscript") for parent in [node, *node.iterancestors()]):
                raise ValueError("Next.js article selected non-reader content")
            value = clean(" ".join(node.itertext()))
            if not value:
                continue
            tag = etree.QName(node).localname
            kind = "table" if tag == "table" else "heading" if tag in ("h1", "h2", "h3", "h4", "h5", "h6") else "paragraph"
            blocks.append({
                "kind": kind, "text": value,
                "locator": {"type": "embedded-json-html", "script_dom_path": script_path,
                            "json_path": json_path, "fragment_dom_path": tree.getpath(node),
                            "extracted_order": len(blocks), "text_hash": digest(value)},
            })
            if kind == "table":
                blocks[-1]["rows"] = [[clean(" ".join(cell.itertext())) for cell in row if cell.tag in ("td", "th")]
                                       for row in node.iter() if node is not fragment and row.tag == "tr"]
        for node in fragment.xpath(".//a[@href]"):
            href = urljoin(url, node.get("href"))
            if urlparse(href).scheme in ("http", "https"):
                links.append({"url": href, "text": clean(node.text_content()),
                              "script_dom_path": script_path, "json_path": json_path,
                              "fragment_dom_path": tree.getpath(node)})

    add_html(intro, profile["intro_field"])
    type_field = profile.get("module_type_field", "fieldGroupName")
    for index, module in enumerate(modules):
        if not isinstance(module, dict):
            raise ValueError("Next.js article module must be an object")
        module_type = module.get(type_field)
        if not isinstance(module_type, str) or not module_type:
            raise ValueError("Next.js article module type missing")
        spec = profile["module_text_fields"].get(module_type)
        if not spec:
            item = {"index": index, "type": module_type}
            if module_type in ignored_module_types:
                ignored_modules.append(item)
            else:
                unmapped_modules.append(item)
            continue
        if not isinstance(spec, dict) or not isinstance(spec.get("text_field"), str):
            raise ValueError("Invalid Next.js article module mapping")
        prefix = f"{profile['modules_field']}[{index}]"
        heading_field = spec.get("title_field")
        if heading_field and module.get(heading_field):
            heading = clean(module[heading_field])
            if heading:
                blocks.append({"kind": "heading", "text": heading,
                               "locator": {"type": "embedded-json", "script_dom_path": script_path,
                                           "json_path": f"{prefix}.{heading_field}",
                                           "extracted_order": len(blocks), "text_hash": digest(heading)}})
        text_field = spec["text_field"]
        content = module.get(text_field)
        if content:
            add_html(content, f"{prefix}.{text_field}")
        speaker_field = spec.get("speaker_field")
        if speaker_field and module.get(speaker_field):
            speaker = clean(module[speaker_field])
            if speaker:
                blocks.append({"kind": "paragraph", "text": speaker,
                               "locator": {"type": "embedded-json", "script_dom_path": script_path,
                                           "json_path": f"{prefix}.{speaker_field}",
                                           "extracted_order": len(blocks), "text_hash": digest(speaker)}})
    if not blocks:
        raise ValueError("Next.js article body empty")
    complete = not missing_math and not unmapped_modules
    result = {
        "status": "extracted" if complete else "partial", "title": clean(title),
        "title_basis": {"type": "embedded-json", "script_dom_path": script_path,
                        "json_path": profile["record_path"] + "." + profile["title_field"],
                        "text_hash": digest(clean(title))},
        "title_profile_status": "matched", "language": dom.get("lang") or options.get("language"),
        "dates": {"published_at": published_date.date().isoformat(), "modified_at": None,
                  "precision": "day", "candidates": [published],
                  "basis": {"type": "embedded-json", "script_dom_path": script_path,
                            "json_path": profile["record_path"] + "." + profile["publication_date_field"],
                            "text": published},
                  "profile_status": "matched", "modified_candidates": [],
                  "modified_basis": None, "modified_profile_status": "not-configured"},
        "blocks": blocks, "links": links, "link_profiles": [],
        "quality": {"required_fields_present": complete, "missing_pages": [], "reviewed": False},
    }
    if missing_math:
        result["math_expressions"] = []
        result["quality"]["missing_math"] = missing_math
    if ignored_modules:
        result["quality"]["ignored_content_modules"] = ignored_modules
    if unmapped_modules:
        result["quality"]["unmapped_content_modules"] = unmapped_modules
    return result


def html_parse(raw, url, options):
    import trafilatura
    from lxml import html, etree
    from charset_normalizer import from_bytes

    xml_fragment_profile = options.get("format") == "xml-fragment"
    charset = options.get("encoding")
    if charset:
        decoded = raw.decode(charset, errors="strict")
    else:
        guess = from_bytes(raw).best()
        if guess is None:
            raise ValueError("HTML encoding undetected")
        decoded = str(guess)
    if xml_fragment_profile:
        dom = etree.fromstring(raw, parser=etree.XMLParser(resolve_entities=False, no_network=True, recover=False))
    else:
        # SEC filing HTML often begins with an XML encoding declaration. The bytes
        # have already been decoded above, so passing that declaration through to
        # lxml's HTML parser is invalid and rejects an otherwise readable filing.
        decoded = re.sub(r"^\s*<\?xml[^?]*\?>", "", decoded, count=1, flags=re.IGNORECASE)
        dom = html.fromstring(decoded)
    domtree = dom.getroottree()
    calendar_name = options.get("publication_date_timezone")
    calendar_zone = None
    if calendar_name is not None:
        if not isinstance(calendar_name, str) or not calendar_name or len(calendar_name) > 64:
            raise ValueError("Invalid publication calendar time zone")
        try:
            calendar_zone = ZoneInfo(calendar_name)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError("Invalid publication calendar time zone") from error
    if options.get("embedded_article"):
        embedded_format = options["embedded_article"].get("format")
        if embedded_format == "indexed-json-array":
            return indexed_json_article(dom, url, options)
        if embedded_format == "nextjs-page-data":
            return nextjs_page_data_article(dom, url, options)
        raise ValueError("Unsupported embedded article format")
    title = clean(" ".join(dom.xpath("//title/text()"))) or None
    language = dom.get("lang") or options.get("language")
    date_nodes = dom.xpath('//meta[@property="article:published_time" or @name="date" or @name="pubdate"]/@content')
    modified_nodes = dom.xpath('//meta[@property="article:modified_time"]/@content')
    publication_date_policy = options.get("publication_date_policy")
    if publication_date_policy not in (None, "not_applicable", "explicit-authoritative"):
        raise ValueError("Unsupported publication date policy")
    if publication_date_policy == "explicit-authoritative" and not options.get("publication_date_xpath"):
        raise ValueError("Explicit-authoritative publication date requires a selector")
    common_date_basis = []
    for node in dom.xpath('//meta[@property="article:published_time" or @name="date" or @name="pubdate"]'):
        value = clean(node.get("content"))
        if value:
            common_date_basis.append({"type": "meta", "dom_path": domtree.getpath(node), "attribute": "content", "text": value})
    # Common, semantic publication-date metadata works across publishers and
    # keeps its provenance. Do not use arbitrary <time> elements: pages often
    # contain dates for related stories, tickers, or update widgets.
    for node in dom.xpath('//time[@itemprop="datePublished"][@datetime]')[:20]:
        value = clean(node.get("datetime"))
        if value:
            normalized = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", value)
            date_nodes.append(normalized)
            common_date_basis.append({"type": "time-itemprop", "dom_path": domtree.getpath(node), "attribute": "datetime", "text": value})
    # Parse bounded JSON-LD Article records only. Never promote dateModified,
    # dateCreated, or a date on a generic WebPage/Organization node.
    jsonld_bytes = 0
    for script_index, script in enumerate(dom.xpath('//script[translate(@type,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz")="application/ld+json"]')[:32]):
        script_text = script.text or ""
        encoded_size = len(script_text.encode("utf-8", errors="replace"))
        if encoded_size > 1_000_000 or jsonld_bytes + encoded_size > 2_000_000:
            continue
        jsonld_bytes += encoded_size
        try:
            structured = json.loads(script_text)
        except (json.JSONDecodeError, TypeError):
            continue
        pending = [structured]
        visited = 0
        while pending and visited < 500:
            item = pending.pop()
            visited += 1
            if isinstance(item, list):
                pending.extend(item[:500])
                continue
            if not isinstance(item, dict):
                continue
            types = item.get("@type", [])
            types = [types] if isinstance(types, str) else types if isinstance(types, list) else []
            if any(isinstance(value, str) and value.rsplit("/", 1)[-1] in {"Article", "NewsArticle", "TechArticle", "BlogPosting", "Report"} for value in types):
                value = item.get("datePublished")
                if isinstance(value, str) and clean(value):
                    value = clean(value)
                    date_nodes.append(re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", value))
                    common_date_basis.append({"type": "json-ld", "dom_path": domtree.getpath(script), "script_index": script_index, "node_type": types, "attribute": "datePublished", "text": value})
            pending.extend(value for value in item.values() if isinstance(value, (dict, list)))
    explicit_date = options.get("publication_date_xpath")
    preserve_date_block = options.get("preserve_publication_date_block", False)
    if not isinstance(preserve_date_block, bool) or (preserve_date_block and not explicit_date):
        raise ValueError("Preserving a publication date block requires a boolean flag and explicit date selector")
    date_basis = None
    date_profile_status = "not-configured"
    explicit_date_node = None
    explicit_publication_date = None
    if explicit_date:
        chosen = dom.xpath(explicit_date)
        date_profile_status = "missing" if not chosen else "ambiguous" if len(chosen) != 1 else "no-match"
        if len(chosen) == 1:
            if not isinstance(chosen[0], etree._Element):
                raise ValueError("Publication date selector must return an element")
            explicit_date_node = chosen[0]
            date_attribute = options.get("publication_date_attribute")
            value = clean(chosen[0].get(date_attribute)) if date_attribute else clean(" ".join(chosen[0].itertext()))
            match = re.search(options["publication_date_pattern"], value)
            if match:
                matched_date = match.group(1) if match.lastindex else match.group(0)
                date_basis = {"dom_path": domtree.getpath(chosen[0]), "text": value}
                if date_attribute:
                    date_basis["attribute"] = date_attribute
                try:
                    parsed = datetime.strptime(date_for_strptime(matched_date, options["publication_date_format"], language), options["publication_date_format"])
                    if options.get("publication_date_preserve_time"):
                        if parsed.tzinfo is None or source_date_value(matched_date) is None:
                            raise ValueError("Publisher timestamp needs an explicit offset")
                        date_nodes.append(matched_date)
                        explicit_publication_date = matched_date
                    else:
                        explicit_publication_date = parsed.strftime("%Y-%m-%d")
                        date_nodes.append(explicit_publication_date)
                    date_profile_status = "matched"
                except ValueError:
                    date_profile_status = "invalid-date"
    modified_basis = None
    modified_profile_status = "not-configured"
    explicit_modified = options.get("modification_date_xpath")
    if explicit_modified:
        chosen = dom.xpath(explicit_modified)
        modified_profile_status = "missing" if not chosen else "ambiguous" if len(chosen) != 1 else "no-match"
        if len(chosen) == 1:
            if not isinstance(chosen[0], etree._Element):
                raise ValueError("Modification date selector must return an element")
            attribute = options.get("modification_date_attribute")
            value = clean(chosen[0].get(attribute)) if attribute else clean(" ".join(chosen[0].itertext()))
            match = re.search(options["modification_date_pattern"], value)
            if match:
                modified_basis = {"dom_path": domtree.getpath(chosen[0]), "text": value}
                if attribute:
                    modified_basis["attribute"] = attribute
                try:
                    modified_nodes.append(datetime.strptime(date_for_strptime(match.group(0), options["modification_date_format"], language), options["modification_date_format"]).strftime("%Y-%m-%d"))
                    modified_profile_status = "matched"
                except ValueError:
                    modified_profile_status = "invalid-date"
    links = []
    link_profiles = []
    listing_page_summary = None
    summary_xpath = options.get("listing_page_summary_xpath")
    summary_pattern = options.get("listing_page_summary_pattern")
    summary_single_page = options.get("listing_page_summary_single_page") is True
    if bool(summary_xpath) != bool(summary_pattern):
        raise ValueError("Listing page summary requires a selector and pattern")
    if options.get("listing_page_summary_single_page") is not None and not isinstance(
        options.get("listing_page_summary_single_page"), bool
    ):
        raise ValueError("Listing page single-page summary flag must be boolean")
    if summary_xpath:
        if not all(isinstance(value, str) and 0 < len(value) <= 512 for value in (summary_xpath, summary_pattern)):
            raise ValueError("Invalid listing page summary profile")
        nodes = dom.xpath(summary_xpath)
        status = "missing" if not nodes else "ambiguous" if len(nodes) != 1 else "no-match"
        listing_page_summary = {"status": status}
        if len(nodes) == 1:
            if not isinstance(nodes[0], etree._Element):
                raise ValueError("Listing page summary selector must return an element")
            value = clean(" ".join(nodes[0].itertext()))
            match = re.fullmatch(summary_pattern, value)
            if match:
                expected_groups = {"total"} if summary_single_page else {"total", "page", "pages"}
                if set(match.groupdict()) != expected_groups:
                    required = "total" if summary_single_page else "total, page and pages"
                    raise ValueError(f"Listing page summary pattern needs {required}")
                total = int(match.group("total"))
                page, pages = (1, 1) if summary_single_page else (
                    int(match.group("page")), int(match.group("pages"))
                )
                if 0 <= total <= 5000 and 1 <= page <= pages <= 5000:
                    listing_page_summary = {"status": "matched", "total": total, "page": page, "pages": pages, "basis": {"dom_path": domtree.getpath(nodes[0]), "text": value}}
                else:
                    listing_page_summary = {"status": "invalid-count"}
    rules = options.get("listing_link_rules", [])
    if not isinstance(rules, list) or len(rules) > 10:
        raise ValueError("Invalid listing link rules")
    for rule in rules:
        if not isinstance(rule, dict) or not all(isinstance(rule.get(k), str) and 0 < len(rule[k]) <= 512 for k in ("id", "item_xpath", "url_pattern", "title_xpath")):
            raise ValueError("Incomplete listing link rule")
        url_attribute = rule.get("url_attribute")
        url_value_xpath = rule.get("url_value_xpath")
        if bool(url_attribute) == bool(url_value_xpath) or any(
            value is not None and (not isinstance(value, str) or not 0 < len(value) <= 512)
            for value in (url_attribute, url_value_xpath)
        ):
            raise ValueError("Listing link rule needs exactly one URL source")
        url_template = rule.get("url_template")
        date_kind = rule.get("date_kind", "published_at")
        if url_template is not None:
            if not isinstance(url_template, str) or not 0 < len(url_template) <= 512:
                raise ValueError("Invalid listing URL template")
            template_fields = re.findall(r"\{([A-Za-z_][A-Za-z0-9_]*)\}", url_template)
            if not template_fields or len(template_fields) != url_template.count("{") or len(template_fields) != url_template.count("}") or any(not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name) for name in template_fields):
                raise ValueError("Invalid listing URL template fields")
        if date_kind not in ("published_at", "event_date"):
            raise ValueError("Invalid listing date kind")
        if rule.get("category_xpath") is not None and (not isinstance(rule["category_xpath"], str) or not 0 < len(rule["category_xpath"]) <= 512):
            raise ValueError("Invalid listing category selector")
        if bool(rule.get("date_pattern")) != bool(rule.get("date_format")) or (rule.get("date_pattern") and not rule.get("date_xpath")):
            raise ValueError("Listing date pattern and format require one date selector")
        if rule.get("title_pattern") and (not isinstance(rule["title_pattern"], str) or len(rule["title_pattern"]) > 512 or "title" not in re.compile(rule["title_pattern"]).groupindex):
            raise ValueError("Listing title pattern needs a named title group")
        pattern = re.compile(rule["url_pattern"])
        identity_group = rule.get("source_item_id_group")
        if identity_group is not None and (not isinstance(identity_group, str) or identity_group not in pattern.groupindex):
            raise ValueError("Listing source identity needs an explicit URL capture group")
        if url_template is not None and any(name not in pattern.groupindex for name in template_fields):
            raise ValueError("Listing URL template needs matching named groups")
        items = dom.xpath(rule["item_xpath"])
        matched = 0
        for item in items[:5000]:
            if not isinstance(item, etree._Element):
                raise ValueError("Listing selector must return elements")
            if url_value_xpath:
                url_nodes = item.xpath(url_value_xpath)
                if len(url_nodes) != 1:
                    raise ValueError("Listing URL value selector must identify exactly one value")
                url_value = " ".join(url_nodes[0].itertext()) if isinstance(url_nodes[0], etree._Element) else str(url_nodes[0])
            else:
                url_value = item.get(url_attribute, "")
            target = pattern.fullmatch(clean(url_value))
            if not target:
                continue
            if url_template is None:
                href_target = target.group("url")
            else:
                groups = target.groupdict()
                href_target = re.sub(r"\{([A-Za-z_][A-Za-z0-9_]*)\}", lambda match: groups[match.group(1)], url_template)
            href = urljoin(url, href_target)
            if urlparse(href).scheme not in ("http", "https"):
                continue
            title_nodes = item.xpath(rule["title_xpath"])
            item_title = clean(" ".join(" ".join(n.itertext()) if isinstance(n, etree._Element) else str(n) for n in title_nodes))
            if rule.get("title_pattern"):
                title_match = re.fullmatch(rule["title_pattern"], item_title)
                item_title = clean(title_match.group("title")) if title_match else ""
            selected_date = item.xpath(rule["date_xpath"]) if rule.get("date_xpath") else []
            item_date_nodes = selected_date if isinstance(selected_date, list) else [selected_date]
            listed_date = clean(" ".join(" ".join(n.itertext()) if isinstance(n, etree._Element) else str(n) for n in item_date_nodes))
            listed_day = known_date(listed_date)
            if rule.get("date_pattern"):
                date_match = re.fullmatch(rule["date_pattern"], listed_date)
                try:
                    listed_day = datetime.strptime(date_for_strptime(date_match.group(0), rule["date_format"], language), rule["date_format"]).strftime("%Y-%m-%d") if date_match else None
                except ValueError:
                    listed_day = None
            categories = []
            if rule.get("category_xpath"):
                categories = [clean(" ".join(n.itertext())) for n in item.xpath(rule["category_xpath"]) if isinstance(n, etree._Element)]
            link = {"url": href, "text": item_title, "dom_path": domtree.getpath(item), "listed_date_text": listed_date or None, "profile_id": rule["id"], "date_kind": date_kind}
            if identity_group is not None:
                source_item_id = target.group(identity_group)
                if not source_item_id or len(source_item_id) > 160:
                    raise ValueError("Listing source identity is missing or exceeds its budget")
                link["source_item_id"] = source_item_id
            link["published_at" if date_kind == "published_at" else "event_date"] = listed_day
            support_selector = rule.get("supporting_links_xpath")
            if support_selector is not None:
                if not isinstance(support_selector, str) or not 0 < len(support_selector) <= 512:
                    raise ValueError("Invalid listing supporting link selector")
                support_nodes = item.xpath(support_selector)
                if len(support_nodes) > 7 or any(not isinstance(n, etree._Element) or n.tag != "a" or not n.get("href") for n in support_nodes):
                    raise ValueError("Listing supporting links must be bounded anchors")
                support_urls = [urljoin(url, n.get("href")) for n in support_nodes]
                if len(set(support_urls)) != len(support_urls) or href in support_urls or any(urlparse(u).scheme not in ("http", "https") for u in support_urls):
                    raise ValueError("Listing supporting link identity conflict")
                link["supporting_links"] = [{"url": u, "text": clean(" ".join(n.itertext())), "dom_path": domtree.getpath(n)} for n, u in zip(support_nodes, support_urls)]
            if rule.get("category_xpath"):
                link["categories"] = categories
            links.append(link)
            matched += 1
        link_profiles.append({"id": rule["id"], "status": "matched" if matched else "no-match", "selected_items": len(items), "matched_links": matched, "truncated": len(items) > 5000})
    complete_index = None
    index_profile = options.get("complete_index")
    if index_profile is not None:
        fields = ("rule_id", "scope_xpath", "terminal_xpath", "terminal_pattern", "pagination_xpath")
        if not isinstance(index_profile, dict) or any(not isinstance(index_profile.get(k), str) or not 0 < len(index_profile[k]) <= 512 for k in fields):
            raise ValueError("Complete index needs explicit scope, terminal and pagination selectors")
        matching_rules = [r for r in rules if r["id"] == index_profile["rule_id"]]
        scopes = dom.xpath(index_profile["scope_xpath"])
        terminals = scopes[0].xpath(index_profile["terminal_xpath"]) if len(scopes) == 1 and isinstance(scopes[0], etree._Element) else []
        paging = dom.xpath(index_profile["pagination_xpath"])
        selected_items = dom.xpath(matching_rules[0]["item_xpath"]) if len(matching_rules) == 1 else []
        terminal_text = clean(" ".join(terminals[0].itertext())) if len(terminals) == 1 and isinstance(terminals[0], etree._Element) else None
        confirmed = bool(len(scopes) == 1 and len(terminals) == 1 and selected_items and not paging and terminal_text and re.fullmatch(index_profile["terminal_pattern"], terminal_text) and all(scopes[0] in n.iterancestors() for n in selected_items) and scopes[0] in terminals[0].iterancestors())
        complete_index = {"status": "confirmed" if confirmed else "incomplete", "profile": copy.deepcopy(index_profile), "rule_id": index_profile["rule_id"], "item_count": len(selected_items), "paging_count": len(paging), "scope_dom_path": domtree.getpath(scopes[0]) if len(scopes) == 1 else None, "terminal_dom_path": domtree.getpath(terminals[0]) if len(terminals) == 1 and isinstance(terminals[0], etree._Element) else None, "terminal_text": terminal_text, "profile_sha256": digest(json.dumps(index_profile, sort_keys=True, separators=(",", ":"), ensure_ascii=False))}
    for a in dom.xpath("//a[@href]")[:5000]:
        href = urljoin(url, a.get("href"))
        if urlparse(href).scheme in ("http", "https"):
            links.append({"url": href, "text": clean(" ".join(a.itertext())), "dom_path": domtree.getpath(a)})
    # Challenge/paywall signals cannot be treated as readable article bodies.
    if re.search(r"(?:just a moment|access denied|attention required|verify you are human)", title or "", re.I):
        return {"status": "blocked", "title": title, "language": language, "blocks": [], "links": links, "dates": {}, "quality": {"required_fields_present": False, "missing_pages": [], "reviewed": False, "reason": "challenge-page"}}
    selected = options.get("content_xpath")
    if selected:
        nodes = dom.xpath(selected)
        if len(nodes) != 1:
            raise ValueError("Content selector must identify exactly one element")
        container = nodes[0]
        math_expressions = preserve_html_math(container)
    else:
        math_expressions = preserve_html_math(dom)
        reader_html = html.tostring(dom, encoding="unicode") if math_expressions else decoded
        result = trafilatura.bare_extraction(reader_html, url=url, include_comments=False, include_tables=True, with_metadata=True, favor_precision=True)
        if result is None or result.body is None:
            return {"status": "partial", "title": title, "language": language, "blocks": [], "links": links, "dates": {}, "quality": {"required_fields_present": False, "missing_pages": [], "reviewed": False, "reason": "body-not-extracted"}}
        container = result.body
        title = result.title or title
    title_basis = None
    title_profile_status = "not-configured"
    title_selector = options.get("title_xpath")
    if title_selector:
        title_nodes = dom.xpath(title_selector)
        title_profile_status = "missing" if not title_nodes else "ambiguous" if len(title_nodes) != 1 else "empty"
        title = None
        if len(title_nodes) == 1:
            if not isinstance(title_nodes[0], etree._Element):
                raise ValueError("Title selector must return an element")
            title_node = title_nodes[0]
            exclusions = []
            exclude_selector = options.get("title_exclude_xpath")
            if exclude_selector is not None:
                if not isinstance(exclude_selector, str) or not exclude_selector.startswith(".") or len(exclude_selector) > 1024:
                    raise ValueError("Title exclusion must be a bounded relative XPath")
                excluded_nodes = title_node.xpath(exclude_selector)
                if len(excluded_nodes) > 16 or any(
                    not isinstance(node, etree._Element) or title_node not in node.iterancestors()
                    for node in excluded_nodes
                ):
                    raise ValueError("Title exclusion must select title descendants")
                exclusions = [
                    {"dom_path": domtree.getpath(node), "text": clean(" ".join(node.itertext())),
                     "text_hash": digest(clean(" ".join(node.itertext())))}
                    for node in excluded_nodes
                ]
                title_node = copy.deepcopy(title_node)
                for node in title_node.xpath(exclude_selector):
                    node.drop_tree()  # Preserve tail text following the badge.
            value = clean(" ".join(title_node.itertext()))
            if value:
                title = value
                title_profile_status = "matched"
                title_basis = {"type": "html", "dom_path": domtree.getpath(title_nodes[0]), "text": value, "text_hash": digest(value)}
                if exclude_selector is not None:
                    title_basis["excluded"] = exclusions
    block_selector = options.get("content_block_xpath")
    selected_blocks = None
    if block_selector:
        if not selected or not isinstance(block_selector, str) or len(block_selector) > 1024:
            raise ValueError("Block profile requires an explicit content container")
        selected_blocks = container.xpath(block_selector)
        image_selector = options.get("body_images", {}).get("xpath") if isinstance(options.get("body_images"), dict) else None
        if not selected_blocks and not (isinstance(image_selector, str) and image_selector.startswith(".") and container.xpath(image_selector)):
            raise ValueError("Block profile did not match any elements")
        for node in selected_blocks:
            if not isinstance(node, etree._Element) or container not in node.iterancestors():
                raise ValueError("Block profile must select descendant elements")
            if any(p.tag in ("script", "style", "noscript") for p in [node, *node.iterancestors()]):
                raise ValueError("Block profile selected non-reader content")
    blocks = []
    for node in selected_blocks if selected_blocks is not None else container.iter():
        if node is explicit_date_node and not preserve_date_block:
            continue
        tag = etree.QName(node).localname if isinstance(node.tag, str) else ""
        if selected_blocks is None and tag not in ("p", "head", "h1", "h2", "h3", "h4", "h5", "h6", "table", "item", "li", "quote", "blockquote"):
            continue
        if selected_blocks is not None and any(p in selected_blocks for p in node.iterancestors()):
            continue
        ancestors = []
        if node is not container:
            for parent in node.iterancestors():
                if parent is container:
                    break
                ancestors.append(parent)
        if selected_blocks is None and any(p.tag in ("table", "p", "li", "item", "quote", "blockquote") for p in ancestors):
            continue
        value = clean(" ".join(node.itertext()))
        if not value:
            continue
        matches = [n for n in dom.xpath("//p|//h1|//h2|//h3|//h4|//h5|//h6|//table|//li|//blockquote") if clean(" ".join(n.itertext())) == value]
        locator = {"type": "html", "dom_path": domtree.getpath(node) if selected else domtree.getpath(matches[0]) if len(matches) == 1 else None, "extracted_order": len(blocks), "text_hash": digest(value)}
        kind = "table" if tag == "table" else "heading" if tag in ("head", "h1", "h2", "h3", "h4", "h5", "h6") else "paragraph"
        b = {"kind": kind, "text": value, "locator": locator}
        if kind == "table":
            b["rows"] = [[clean(" ".join(c.itertext())) for c in row if c.tag in ("td", "th", "cell")] for row in node.iter() if row.tag in ("tr", "row")]
        blocks.append(b)
    title_access_wall = bool(
        re.match(
            r"^(?:log[\s-]?in|sign[\s-]?in|authentication required|login required|subscribe to (?:read|continue))(?:\b|[\s|:–—-])",
            clean(title or ""),
            re.I,
        )
    )
    auth_forms = dom.xpath(
        "//form[.//input[translate(@type, 'PASSWORD', 'password')='password'] or "
        ".//input[translate(@name, 'LOGIN', 'login')='login'] or "
        "contains(translate(@action, 'LOGIN', 'login'), 'login') or "
        "contains(translate(@action, 'SIGNIN', 'signin'), 'signin')]"
    )
    body_text = clean(" ".join(block["text"] for block in blocks))
    auth_copy = re.search(
        r"\b(?:sign in|log in) (?:to (?:read|continue)|to access)|"
        r"(?:please )?(?:sign in|log in) to (?:view|continue)|"
        r"(?:subscription|authentication|account) required|"
        r"members only|subscribe to (?:read|continue)",
        body_text,
        re.I,
    )
    # Publishers can place a membership wall inside the selected article body
    # without a login form. Match a whole notice, not a mention in real reporting.
    body_access_notice = re.compile(
        r"^(?:로그인\s*또는\s*회원가입을\s*해\s*주세요\.?\s*"
        r"(?:\(회원만\s*열람\s*가능\))?\.?|"
        r"(?:please\s+)?(?:sign[\s-]?in|log[\s-]?in|subscribe)\s+to\s+"
        r"(?:read|view|continue(?:\s+reading)?|access)"
        r"(?:\s+(?:this|the)\s+(?:article|report))?[.!]?|members\s+only[.!]?)$",
        re.I,
    )
    wall_only_body = bool(blocks) and all(
        body_access_notice.fullmatch(clean(block["text"])) for block in blocks
    )
    if title_access_wall or wall_only_body or (auth_forms and auth_copy and len(body_text) < 1000):
        # A public article header can expose its original date while the body
        # remains inaccessible. Retain only an explicitly selected date; this
        # does not make the source readable or eligible for editorial intake.
        blocked_dates = {}
        if (not title_access_wall and title_profile_status == "matched"
                and publication_date_policy == "explicit-authoritative"
                and date_profile_status == "matched" and date_basis
                and explicit_publication_date):
            public_date = source_date_value(explicit_publication_date)
            if public_date:
                blocked_dates = {
                    "published_at": public_date, "basis": date_basis,
                    "profile_status": "matched", "access_scope": "metadata-only",
                    "precision": "timestamp" if "T" in public_date else "day",
                }
        return {
            "status": "blocked",
            "title": title,
            "title_basis": title_basis,
            "title_profile_status": title_profile_status,
            "language": language,
            "dates": blocked_dates,
            "blocks": [],
            "links": links,
            "link_profiles": link_profiles,
            "quality": {
                "required_fields_present": False,
                "missing_pages": [],
                "reviewed": False,
                "reason": "authentication-page",
            },
        }
    if publication_date_policy == "explicit-authoritative":
        published = explicit_publication_date if date_profile_status == "matched" else None
    else:
        days = [known_date(value, calendar_zone) for value in date_nodes]
        valid_dates = bool(days) and all(days) and len(set(days)) == 1
        # Compare metadata in the publisher calendar, but retain the selected
        # display date (or explicitly requested timestamp) as the result.
        # Unqualified metadata remains only a candidate without that selector.
        published = (explicit_publication_date or date_nodes[0]) if valid_dates else None
        if date_nodes and not valid_dates:
            date_profile_status = "conflict" if all(days) else "invalid-date"
        if explicit_date and date_profile_status != "matched":
            published = None
        elif not explicit_date and common_date_basis:
            date_basis = {"sources": common_date_basis}
            if published:
                date_profile_status = "matched"
    metadata_timestamp = options.get("publication_date_metadata_timestamp", False)
    if not isinstance(metadata_timestamp, bool):
        raise ValueError("Publication metadata timestamp option must be boolean")
    if metadata_timestamp and published:
        if not explicit_date or date_profile_status != "matched":
            raise ValueError("Publication metadata timestamp requires a matched display date")
        timestamp_bases = [basis for basis in common_date_basis if source_date_value(re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", basis["text"])) and "T" in basis["text"]]
        if timestamp_bases:
            timestamps = [re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", basis["text"]) for basis in timestamp_bases]
            instants = {datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc) for value in timestamps}
            if len(instants) != 1 or any(known_date(value, calendar_zone) != known_date(published, calendar_zone) for value in timestamps):
                published = None
                date_profile_status = "conflict"
            else:
                published = timestamps[0]
                date_basis = {**timestamp_bases[0], "text": published, "display_basis": date_basis, "sources": timestamp_bases}
    if published:
        published = source_date_value(published)
        if published is None:
            date_profile_status = "invalid-date"
    if options.get("publication_date_from_listing") is True and (
        published is None or options.get("publication_date_listing_authoritative") is True
    ):
        listed_day = options.get("listing_published_at")
        listing_url = options.get("listing_source_url")
        listing_version = options.get("listing_source_version_id")
        listing_text = options.get("listing_date_text")
        try:
            normalized_day = datetime.strptime(listed_day, "%Y-%m-%d").strftime("%Y-%m-%d")
        except (TypeError, ValueError):
            raise ValueError("Official listing publication date is required")
        if not all(isinstance(value, str) and value.strip() for value in (listing_url, listing_version, listing_text)):
            raise ValueError("Official listing publication evidence is required")
        if options.get("publication_date_listing_authoritative") is True:
            displayed_day = None
            displayed_text = date_basis.get("text") if isinstance(date_basis, dict) else None
            displayed_match = re.fullmatch(options.get("publication_date_pattern", ""), displayed_text or "")
            if displayed_match:
                try:
                    displayed_day = datetime.strptime(
                        date_for_strptime(displayed_match.group(0), options["publication_date_format"], language),
                        options["publication_date_format"],
                    ).strftime("%Y-%m-%d")
                except (KeyError, ValueError):
                    displayed_day = None
            if displayed_day != normalized_day:
                published = None
                date_profile_status = "listing-display-mismatch"
            else:
                published = normalized_day
                date_profile_status = "official-listing-confirmed-by-display"
                date_basis = {
                    "type": "official-listing-and-visible-date",
                    "published_at": normalized_day,
                    "text": listing_text,
                    "source_url": listing_url,
                    "source_version_id": listing_version,
                    "display_text": displayed_text,
                    "display_dom_path": date_basis.get("dom_path"),
                    "other_date_candidates": [value for value in date_nodes if known_date(value, calendar_zone) != normalized_day],
                }
        else:
            published = normalized_day
            date_profile_status = "official-listing"
            date_basis = {
                "type": "official-listing",
                "published_at": normalized_day,
                "text": listing_text,
                "source_url": listing_url,
                "source_version_id": listing_version,
            }
    modified_days = [known_date(value, calendar_zone) for value in modified_nodes]
    valid_modified = bool(modified_days) and all(modified_days) and len(set(modified_days)) == 1
    modified = (modified_nodes[0] if len(set(modified_nodes)) == 1 else modified_days[0]) if valid_modified else None
    if modified_nodes and not valid_modified:
        modified_profile_status = "conflict" if all(modified_days) else "invalid-date"
    if explicit_modified and modified_profile_status != "matched":
        modified = None
    if modified:
        modified = source_date_value(modified)
        if modified is None:
            modified_profile_status = "invalid-date"
    if modified and published and known_date(modified, calendar_zone) < known_date(published, calendar_zone):
        modified = None
        modified_profile_status = "before-publication"
    if publication_date_policy == "not_applicable":
        published = None
        modified = None
        date_nodes = []
        modified_nodes = []
        date_basis = None
        modified_basis = None
        date_profile_status = "not-applicable"
        modified_profile_status = "not-applicable"
    dates = {"published_at": published, "modified_at": modified, "precision": "timestamp" if published and "T" in published else "day" if published else "unknown", "candidates": date_nodes, "basis": date_basis, "profile_status": date_profile_status, "modified_candidates": modified_nodes, "modified_basis": modified_basis, "modified_profile_status": modified_profile_status}
    # Parser date inference is kept as a candidate, never promoted to original publication time.
    missing_math = [{"dom_path": value["dom_path"], "reason": value["reason"]} for value in math_expressions if value["reason"]]
    complete = bool(title and blocks) and not missing_math
    status = "extracted" if complete else "partial"
    result = {"status": status, "title": title, "title_basis": title_basis, "title_profile_status": title_profile_status, "language": language, "dates": dates, "blocks": blocks, "links": links, "link_profiles": link_profiles, "quality": {"required_fields_present": complete, "missing_pages": [], "reviewed": False}}
    image_profile = options.get("body_images")
    if image_profile is not None and not blocks:
        if not selected or not isinstance(image_profile, dict):
            raise ValueError("Body images require an explicit content container and profile")
        xpath, pattern, maximum = image_profile.get("xpath"), image_profile.get("url_pattern"), image_profile.get("max_images")
        if (not isinstance(xpath, str) or not xpath.startswith(".") or len(xpath) > 512
                or not isinstance(pattern, str) or not pattern.startswith("^") or not pattern.endswith("$")
                or len(pattern) > 512 or type(maximum) is not int or not 1 <= maximum <= 7):
            raise ValueError("Invalid body image profile")
        images = container.xpath(xpath)
        if len(images) > maximum:
            raise ValueError("Body image budget exceeded")
        result["body_images"] = []
        for image in images:
            if not isinstance(image, etree._Element) or image.tag.lower() != "img" or not image.get("src"):
                raise ValueError("Body image selector must identify img elements with src")
            target = urljoin(url, image.get("src"))
            if urlparse(target).scheme not in ("http", "https") or re.fullmatch(pattern, target) is None:
                raise ValueError("Body image URL outside declared profile")
            if any(value["url"] == target for value in result["body_images"]):
                raise ValueError("Duplicate body image URL")
            result["body_images"].append({"url": target, "dom_path": domtree.getpath(image), "alt": clean(image.get("alt"))})
    if listing_page_summary is not None:
        result["listing_page_summary"] = listing_page_summary
    if complete_index is not None:
        result["complete_index"] = complete_index
    if math_expressions:
        result["math_expressions"] = math_expressions
        result["quality"]["missing_math"] = missing_math
    return result


def jats_parse(raw, url, options):
    from lxml import etree

    if not isinstance(options, dict) or options.get("format") != "jats":
        raise ValueError("Explicit JATS parser profile required")
    if len(raw) > 40 * 1024 * 1024:
        raise ValueError("JATS byte budget exceeded")
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False)
    root = etree.fromstring(raw, parser=parser)
    if math_local_name(root) != "article":
        raise ValueError("JATS root must be an article")
    tree = root.getroottree()
    elements = list(root.iter())
    if len(elements) > 100000:
        raise ValueError("JATS element budget exceeded")

    def children(node, name):
        return [item for item in node if math_local_name(item) == name]

    def descendants(node, name):
        return [item for item in node.iter() if math_local_name(item) == name]

    def first_text(node, names):
        for name in names:
            selected = descendants(node, name)
            if selected:
                value = clean(" ".join("".join(item.itertext()) for item in selected[:1]))
                if value:
                    return value
        return None

    metadata = {
        "article_type": clean(root.get("article-type")) or None,
        "language": root.get("{http://www.w3.org/XML/1998/namespace}lang") or options.get("language"),
    }
    front = next((item for item in children(root, "front")), None)
    article_meta = next((item for item in descendants(front, "article-meta")), None) if front is not None else None
    title_node = next((item for item in descendants(article_meta, "article-title")), None) if article_meta is not None else None
    title = clean(" ".join(title_node.itertext())) if title_node is not None else None

    identifiers = []
    if article_meta is not None:
        for item in descendants(article_meta, "article-id")[:100]:
            value = clean(" ".join(item.itertext()))
            if value:
                identifiers.append({"type": clean(item.get("pub-id-type")) or "unknown", "value": value})
    doi_values = [item["value"].lower() for item in identifiers if item["type"].lower() == "doi"]
    if len(set(doi_values)) == 1:
        metadata["doi"] = doi_values[0]
    elif doi_values:
        metadata["doi_candidates"] = doi_values
    metadata["identifiers"] = identifiers

    journal_meta = next((item for item in descendants(front, "journal-meta")), None) if front is not None else None
    if journal_meta is not None:
        metadata["journal"] = first_text(journal_meta, ["journal-title"])

    authors = []
    affiliations = []
    if article_meta is not None:
        for item in descendants(article_meta, "aff")[:500]:
            value = clean(" ".join(item.itertext()))
            if value:
                affiliations.append({"id": clean(item.get("id")) or None, "text": value})
        for contributor in descendants(article_meta, "contrib"):
            if contributor.get("contrib-type") != "author":
                continue
            name_node = next((item for item in contributor if math_local_name(item) in ("name", "string-name")), None)
            if name_node is None:
                continue
            given = next((clean(" ".join(item.itertext())) for item in children(name_node, "given-names") if clean(" ".join(item.itertext()))), None)
            surname = next((clean(" ".join(item.itertext())) for item in children(name_node, "surname") if clean(" ".join(item.itertext()))), None)
            name = clean(" ".join(value for value in (given, surname) if value)) or clean(" ".join(name_node.itertext()))
            if not name:
                continue
            authors.append({
                "name": name,
                "affiliation_refs": [clean(item.get("rid")) for item in descendants(contributor, "xref") if item.get("ref-type") == "aff" and item.get("rid")],
                "orcid": next((clean(item.get("href")) for item in descendants(contributor, "ext-link") if "orcid.org" in item.get("href", "")), None),
            })
            if len(authors) >= 500:
                break
    metadata["authors"] = authors
    metadata["affiliations"] = affiliations

    keywords = []
    if article_meta is not None:
        for item in descendants(article_meta, "kwd")[:500]:
            value = clean(" ".join(item.itertext()))
            if value:
                keywords.append(value)
    metadata["keywords"] = list(dict.fromkeys(keywords))

    history_dates = []
    history = next((item for item in descendants(article_meta, "history")), None) if article_meta is not None else None
    if history is not None:
        for item in children(history, "date")[:50]:
            history_dates.append({"type": clean(item.get("date-type")) or "unknown", "date": None, "date_candidate": None, "precision": "unknown", "xml_path": tree.getpath(item)})
    metadata["history_dates"] = history_dates

    publication_nodes = []
    if article_meta is not None:
        publication_nodes = descendants(article_meta, "pub-date")
    preferred = [item for item in publication_nodes if item.get("pub-type", "").lower() in ("epub", "electronic")]
    if not preferred:
        preferred = [item for item in publication_nodes if item.get("date-type", "").lower() in ("pub", "publication")]
    if not preferred:
        preferred = [item for item in publication_nodes if item.get("publication-format", "").lower() == "electronic"]
    if not preferred:
        preferred = publication_nodes

    def jats_day(node):
        iso_date = clean(node.get("iso-8601-date"))
        if iso_date:
            try:
                parsed = datetime.strptime(iso_date, "%Y-%m-%d")
                return (parsed.strftime("%Y-%m-%d"), "day")
            except ValueError:
                return None
        def part(names):
            selected = [clean(" ".join(item.itertext())) for name in names for item in descendants(node, name)]
            selected = [value for value in selected if value]
            return selected[0] if selected and len(set(selected)) == 1 else None
        year, month, day = part(["year"]), part(["month"]), part(["day"])
        if not year:
            return None
        if not month or not day:
            return (year + ("-" + month.zfill(2) if month else ""), "month" if month else "year")
        candidate = "-".join((year, month.zfill(2), day.zfill(2)))
        try:
            parsed = datetime.strptime(candidate, "%Y-%m-%d")
        except ValueError:
            return None
        return (parsed.strftime("%Y-%m-%d"), "day" if day else "month" if month else "year")

    if history is not None:
        for entry, item in zip(history_dates, children(history, "date")):
            value = jats_day(item)
            entry.update({"date": value[0] if value and value[1] == "day" else None, "date_candidate": value[0] if value else None, "precision": value[1] if value else "unknown"})

    date_candidates = []
    date_basis = []
    for item in preferred[:20]:
        value = jats_day(item)
        if value:
            date_candidates.append(value)
            date_basis.append({"xml_path": tree.getpath(item), "text": clean(" ".join(item.itertext())), "pub_type": item.get("pub-type"), "publication_format": item.get("publication-format")})
    precise_dates = {item[0] for item in date_candidates if item[1] == "day"}
    partial_dates = {item[0] for item in date_candidates if item[1] != "day"}
    published = next(iter(precise_dates)) if len(precise_dates) == 1 else None
    date_precision = "day" if published else date_candidates[0][1] if len(partial_dates) == 1 and not precise_dates else "unknown"
    date_status = "matched" if published else "conflict" if len(precise_dates) > 1 or (precise_dates and any(value.split("-")[0] != next(iter(precise_dates)).split("-")[0] for value in partial_dates)) else "insufficient-precision" if date_candidates else "missing"

    modified_nodes = descendants(article_meta, "pub-date") if article_meta is not None else []
    modified_nodes = [item for item in modified_nodes if item.get("pub-type", "").lower() in ("updated", "modified", "revised")]
    modified_candidates = [jats_day(item) for item in modified_nodes[:20]]
    modified_candidates = [item for item in modified_candidates if item]
    modified_values = {item[0] for item in modified_candidates}
    modified_precise = {item[0] for item in modified_candidates if item[1] == "day"}
    modified = next(iter(modified_precise)) if len(modified_values) == 1 and len(modified_precise) == 1 else None
    modified_status = "matched" if modified else "insufficient-precision" if modified_candidates and len(modified_values) == 1 else "conflict" if modified_candidates else "not-present"

    math_expressions = []
    missing_math = []

    def inline_text(node, block_path):
        values = [node.text or ""]
        for child in node:
            name = math_local_name(child)
            formula = name in ("inline-formula", "disp-formula", "math")
            if formula:
                math_nodes = [child] if name == "math" else descendants(child, "math")
                tex_nodes = descendants(child, "tex-math")
                tex = clean(" ".join("".join(item.itertext()) for item in tex_nodes)) or None
                rendered = None
                if math_nodes:
                    rendered = presentation_math_text(math_nodes[0], preserve_bold=True)
                selected = tex or rendered
                record = {
                    "xml_path": tree.getpath(child),
                    "block_xml_path": block_path,
                    "tex": tex,
                    "mathml_sha256": digest(etree.tostring(math_nodes[0], encoding="utf-8")) if math_nodes else None,
                    "text": selected,
                }
                if selected:
                    math_expressions.append(record)
                    values.append(" " + selected + " ")
                else:
                    record["reason"] = "unsupported-or-empty-math"
                    record["source_xml"] = etree.tostring(child, encoding="unicode", with_tail=False)
                    record["source_xml_sha256"] = digest(record["source_xml"])
                    missing_math.append(record)
                    math_expressions.append(record)
                    values.append(" [수식 원문 확인 필요] ")
            else:
                child_text = inline_text(child, block_path)
                if name == "xref" and child.get("ref-type", "").lower() in ("fn", "table-fn"):
                    values.append(" " + child_text + " ")
                else:
                    values.append(child_text)
            values.append(child.tail or "")
        return "".join(values)

    blocks = []
    table_layout_issues = []
    unresolved_table_footnotes = []
    document_footnotes_by_id = {
        clean(item.get("id")): item
        for item in descendants(root, "fn")
        if clean(item.get("id"))
    }

    def add_block(node, kind, section_path=None, extra=None):
        path_value = tree.getpath(node)
        value = inline_text(node, path_value) if kind not in ("table", "figure", "supplement") else clean(" ".join(node.itertext()))
        if not value and not extra:
            return
        block = {
            "kind": kind,
            "text": value or (extra or {}).get("title") or kind,
            "locator": {"type": "jats", "xml_path": path_value, "text_hash": digest(value or (extra or {}).get("title") or kind)},
        }
        if section_path:
            block["section_path"] = section_path
        if extra:
            block.update(extra)
        if len(blocks) >= 5000:
            raise ValueError("JATS block budget exceeded")
        blocks.append(block)

    abstract_nodes = descendants(article_meta, "abstract") if article_meta is not None else []
    def add_table(node, section_path):
        label = first_text(node, ["label"])
        caption = next((item for item in children(node, "caption")), None)
        caption_text = clean(" ".join(caption.itertext())) if caption is not None else ""
        rows = []
        grids = []
        cell_layout = []
        table_nodes = []
        for table_node in descendants(node, "table"):
            ancestors = list(table_node.iterancestors())
            if any(math_local_name(item) == "table-wrap-foot" for item in ancestors):
                continue
            if any(math_local_name(item) == "table" for item in ancestors):
                continue
            table_nodes.append(table_node)
        for table_node in table_nodes:
            physical_rows = []
            for row_node in descendants(table_node, "tr"):
                if next((item for item in row_node.iterancestors() if math_local_name(item) == "table"), None) is not table_node:
                    continue
                cells = [cell for cell in row_node if math_local_name(cell) in ("td", "th")]
                if not cells:
                    continue
                cell_values = []
                for cell in cells:
                    cell_path = tree.getpath(cell)
                    cell_values.append({"text": clean(inline_text(cell, cell_path)), "xml_path": cell_path, "rowspan": cell.get("rowspan", "1"), "colspan": cell.get("colspan", "1")})
                physical_rows.append(cell_values)
                rows.append([cell["text"] for cell in cell_values])
                if len(rows) > 1000 or sum(map(len, rows)) > 10000:
                    raise ValueError("JATS table budget exceeded")

            grid = []
            layout_rows = []
            table_cell_budget = 0

            def parsed_span(value, row_index, cell_path, attribute):
                try:
                    span = int(value)
                except (TypeError, ValueError):
                    span = 0
                if span < 1 or span > 1000:
                    table_layout_issues.append({"table_xml_path": tree.getpath(node), "cell_xml_path": cell_path, "reason": "invalid-span", "attribute": attribute, "value": value})
                    return 1
                if attribute == "rowspan" and row_index + span > len(physical_rows):
                    table_layout_issues.append({"table_xml_path": tree.getpath(node), "cell_xml_path": cell_path, "reason": "rowspan-exceeds-rows", "attribute": attribute, "value": value})
                    return 1
                return span

            for row_index, source_cells in enumerate(physical_rows):
                while len(grid) <= row_index:
                    grid.append([])
                    layout_rows.append([])
                column = 0
                for cell in source_cells:
                    while column < len(grid[row_index]) and grid[row_index][column] is not None:
                        column += 1
                    rowspan = parsed_span(cell["rowspan"], row_index, cell["xml_path"], "rowspan")
                    colspan = parsed_span(cell["colspan"], row_index, cell["xml_path"], "colspan")
                    if (len(grid) + max(0, rowspan - 1)) * (column + colspan) > 20000 or table_cell_budget + rowspan * colspan > 20000:
                        table_layout_issues.append({"table_xml_path": tree.getpath(node), "cell_xml_path": cell["xml_path"], "reason": "expanded-cell-budget"})
                        rowspan, colspan = 1, 1
                    table_cell_budget += rowspan * colspan
                    origin_row, origin_column = row_index, column
                    for row_offset in range(rowspan):
                        target_row = row_index + row_offset
                        while len(grid) <= target_row:
                            grid.append([])
                            layout_rows.append([])
                        for column_offset in range(colspan):
                            target_column = column + column_offset
                            while len(grid[target_row]) <= target_column:
                                grid[target_row].append(None)
                                layout_rows[target_row].append(None)
                            if grid[target_row][target_column] is not None:
                                table_layout_issues.append({"table_xml_path": tree.getpath(node), "cell_xml_path": cell["xml_path"], "reason": "overlapping-spans"})
                                continue
                            grid[target_row][target_column] = cell["text"]
                            layout_rows[target_row][target_column] = {
                                "text": cell["text"], "xml_path": cell["xml_path"], "origin_row": origin_row,
                                "origin_column": origin_column, "rowspan": rowspan, "colspan": colspan,
                                "continuation": row_offset > 0 or column_offset > 0,
                            }
                    column += colspan
            width = max((len(row) for row in grid), default=0)
            for row_index, row in enumerate(grid):
                row.extend([None] * (width - len(row)))
                layout_rows[row_index].extend([None] * (width - len(layout_rows[row_index])))
            grids.extend([[cell for cell in row] for row in grid])
            cell_layout.extend(layout_rows)

        footnotes = []
        footnote_nodes = [item for item in descendants(node, "fn") if any(math_local_name(parent) == "table-wrap-foot" for parent in item.iterancestors())][:100]
        footnotes_by_id = {}
        for footnote in footnote_nodes:
            footnote_label = first_text(footnote, ["label"])
            paragraph_records = [{"text": clean(inline_text(item, tree.getpath(item))), "xml_path": tree.getpath(item)} for item in descendants(footnote, "p")[:20]]
            paragraph_records = [item for item in paragraph_records if item["text"]]
            footnote_text = clean(" ".join(value for value in [footnote_label, *(item["text"] for item in paragraph_records)] if value))
            if footnote_text:
                footnote_record = {"id": clean(footnote.get("id")) or None, "label": footnote_label, "text": footnote_text, "paragraphs": paragraph_records, "xml_path": tree.getpath(footnote)}
                footnotes.append(footnote_record)
                if footnote_record["id"]:
                    footnotes_by_id[footnote_record["id"]] = footnote_record
        footnote_refs = []
        for xref in descendants(node, "xref"):
            if any(math_local_name(parent) == "fn" for parent in xref.iterancestors()):
                continue
            if xref.get("ref-type", "").lower() not in ("fn", "table-fn"):
                continue
            for rid in clean(xref.get("rid", "")).split():
                target = footnotes_by_id.get(rid)
                document_target = document_footnotes_by_id.get(rid) if xref.get("ref-type", "").lower() == "fn" else None
                target_path = target["xml_path"] if target else tree.getpath(document_target) if document_target is not None else None
                reference = {"rid": rid, "text": clean(" ".join(xref.itertext())), "xml_path": tree.getpath(xref), "status": "resolved" if target_path else "unresolved", "target_scope": "table" if target else "document" if document_target is not None else None, "target_xml_path": target_path}
                footnote_refs.append(reference)
                if not target_path:
                    unresolved_table_footnotes.append({"table_xml_path": tree.getpath(node), **reference})
        text_rows = [" | ".join(value or "" for value in row) for row in grids]
        text = " ".join(value for value in [label, caption_text, *text_rows, *(item["text"] for item in footnotes)] if value)
        if not text:
            return
        locator_path = tree.getpath(node)
        blocks.append({"kind": "table", "text": text, "rows": rows, "grid": grids, "cell_layout": cell_layout, "label": label, "caption": caption_text or None, "footnotes": footnotes, "footnote_refs": footnote_refs, "section_path": section_path, "locator": {"type": "jats", "xml_path": locator_path, "text_hash": digest(text)}})

    def add_figure(node, section_path):
        label = first_text(node, ["label"])
        caption = next((item for item in children(node, "caption")), None)
        caption_text = clean(" ".join(caption.itertext())) if caption is not None else ""
        media = []
        for graphic in descendants(node, "graphic") + descendants(node, "inline-graphic"):
            href = graphic.get("{http://www.w3.org/1999/xlink}href") or graphic.get("href")
            if href:
                target = urljoin(url, href)
                media.append(target)
                if len(media) > 50:
                    raise ValueError("JATS figure media budget exceeded")
        text = " ".join(value for value in [label, caption_text, *media] if value)
        if text:
            blocks.append({"kind": "figure", "text": text, "label": label, "caption": caption_text or None, "media_urls": media, "section_path": section_path, "locator": {"type": "jats", "xml_path": tree.getpath(node), "text_hash": digest(text)}})

    def add_jats_content(container, section_path, list_label=None):
        for item in container:
            name = math_local_name(item)
            if name == "sec":
                add_jats_section(item, section_path)
            elif name == "p":
                extra = {"list_label": list_label} if list_label else None
                add_block(item, "paragraph", section_path, extra)
            elif name == "table-wrap":
                add_table(item, section_path)
            elif name == "fig":
                add_figure(item, section_path)
            elif name == "disp-formula":
                add_block(item, "paragraph", section_path)
            elif name in ("list", "list-item", "boxed-text", "disp-quote", "def-list", "def-item", "statement", "ack", "app"):
                item_label = first_text(item, ["label"]) if name == "list-item" else list_label
                add_jats_content(item, section_path, item_label)

    def add_jats_section(section, parents):
        title_item = next((item for item in children(section, "title")), None)
        title_value = clean(" ".join(title_item.itertext())) if title_item is not None else None
        current = [*parents, title_value] if title_value else parents
        if title_item is not None:
            add_block(title_item, "heading", current)
        add_jats_content(section, current)

    for abstract in abstract_nodes[:10]:
        abstract_title = next((item for item in descendants(abstract, "title")), None)
        if abstract_title is not None:
            add_block(abstract_title, "heading", ["Abstract"])
        else:
            blocks.append({"kind": "heading", "text": "Abstract", "locator": {"type": "jats", "xml_path": tree.getpath(abstract), "text_hash": digest("Abstract")}, "section_path": ["Abstract"]})
        for child in abstract:
            if math_local_name(child) in ("p", "sec"):
                if math_local_name(child) == "p":
                    add_block(child, "paragraph", ["Abstract"])
                else:
                    add_jats_section(child, ["Abstract"])

    body = next((item for item in children(root, "body")), None)
    if body is not None:
        add_jats_content(body, [])

    links = []
    for item in descendants(root, "supplementary-material") + descendants(root, "media"):
        href = item.get("{http://www.w3.org/1999/xlink}href") or item.get("href")
        if not href:
            continue
        target = urljoin(url, href)
        links.append({"url": target, "text": clean(" ".join(item.itertext())) or target, "role": "supplementary-material", "locator": {"type": "jats", "xml_path": tree.getpath(item), "text_hash": digest(clean(" ".join(item.itertext())) or target)}})
        if len(links) > 1000:
            raise ValueError("JATS link budget exceeded")

    abstract_present = bool(abstract_nodes)
    content_present = body is not None and any(block["kind"] in ("paragraph", "table", "figure") and block.get("section_path", []) != ["Abstract"] for block in blocks)
    complete = bool(title and metadata.get("article_type") and published and abstract_present and content_present and not missing_math and not table_layout_issues and not unresolved_table_footnotes)
    status = "extracted" if complete else "partial"
    metadata["abstract_present"] = abstract_present
    metadata["body_present"] = content_present
    result = {
        "status": status,
        "title": title,
        "title_basis": {"type": "jats", "xml_path": tree.getpath(title_node), "text": title, "text_hash": digest(title)} if title_node is not None and title else None,
        "title_profile_status": "matched" if title else "missing",
        "language": metadata["language"],
        "dates": {"published_at": published, "modified_at": modified, "precision": date_precision, "candidates": [item[0] for item in date_candidates], "basis": date_basis if date_basis else None, "profile_status": date_status, "modified_candidates": [item[0] for item in modified_candidates], "modified_basis": [{"xml_path": tree.getpath(item), "text": clean(" ".join(item.itertext())), "pub_type": item.get("pub-type")} for item in modified_nodes[:20]], "modified_profile_status": modified_status},
        "blocks": blocks,
        "links": links,
        "metadata": metadata,
        "math_expressions": math_expressions,
        "quality": {"required_fields_present": complete, "missing_pages": [], "missing_math": missing_math, "table_layout_issues": table_layout_issues, "unresolved_table_footnotes": unresolved_table_footnotes, "reviewed": False},
    }
    return result


def markdown_parse(raw, url, options):
    from markdown_it import MarkdownIt

    decoded = raw.decode("utf-8-sig", errors="strict")
    lines = decoded.splitlines(keepends=True)
    tokens = MarkdownIt("commonmark").enable("table").parse(decoded)
    blocks, links, titles = [], [], []

    def locator(line_map, text):
        if not line_map or len(line_map) != 2:
            raise ValueError("Markdown source line range required")
        return {"type": "markdown", "line_start": line_map[0] + 1, "line_end": line_map[1], "text_hash": digest(text), "source_text_hash": digest("".join(lines[line_map[0]:line_map[1]]))}

    def inline_text(token, line_map):
        children = token.children or []
        for i, child in enumerate(children):
            if child.type != "link_open" or len(links) >= 5000:
                continue
            href = urljoin(url, child.attrGet("href") or "")
            if urlparse(href).scheme not in ("http", "https"):
                continue
            label = []
            for following in children[i + 1:]:
                if following.type == "link_close":
                    break
                label.append(following.content)
            links.append({"url": href, "text": clean("".join(label)), "locator": locator(line_map, clean(token.content))})
        # Join inline tokens without inserting spaces around emphasis or code.
        # Embedded source HTML is data; no renderer or code execution is used.
        return clean("".join(" " if child.type in ("softbreak", "hardbreak") else child.content if child.type in ("text", "code_inline", "html_inline", "image") else "" for child in children))

    i = 0
    while i < len(tokens):
        token = tokens[i]
        if token.type == "table_open":
            rows, row = [], []
            j = i + 1
            while j < len(tokens) and tokens[j].type != "table_close":
                cell = tokens[j]
                if cell.type == "tr_open":
                    row = []
                elif cell.type == "inline":
                    row.append(inline_text(cell, token.map))
                elif cell.type == "tr_close":
                    rows.append(row)
                j += 1
            if j == len(tokens):
                raise ValueError("Unclosed Markdown table")
            value = clean(" | ".join(" | ".join(row) for row in rows))
            if value:
                blocks.append({"kind": "table", "text": value, "rows": rows, "locator": locator(token.map, value)})
            i = j
        elif token.type == "inline":
            value = inline_text(token, token.map)
            if value:
                preceding = tokens[i - 1] if i else None
                heading = preceding and preceding.type == "heading_open"
                block = {"kind": "heading" if heading else "paragraph", "text": value, "locator": locator(token.map, value)}
                blocks.append(block)
                if heading and preceding.tag == "h1":
                    titles.append(block)
        elif token.type in ("fence", "code_block", "html_block"):
            value = token.content.strip()
            if value:
                blocks.append({"kind": "code", "text": value, "code_language": "html" if token.type == "html_block" else token.info.strip() or None, "locator": locator(token.map, value)})
        i += 1

    title_line = options.get("markdown_title_line")
    if title_line is not None:
        if isinstance(title_line, bool) or not isinstance(title_line, int) or title_line < 1:
            raise ValueError("Markdown title line must be a positive integer")
        selected_titles = [item for item in titles if item["locator"]["line_start"] == title_line]
        if len(selected_titles) != 1:
            raise ValueError("Markdown title line must identify one source H1 heading")
    else:
        selected_titles = titles
    title = selected_titles[0]["text"] if len(selected_titles) == 1 else None
    title_basis = selected_titles[0]["locator"] if title else None
    published, date_basis, candidates = None, None, []
    profile_status = "not-configured"
    date_line = options.get("markdown_publication_date_line")
    if date_line is not None:
        if isinstance(date_line, bool) or not isinstance(date_line, int) or date_line < 1:
            raise ValueError("Markdown publication date line must be a positive integer")
        value = clean(lines[date_line - 1]) if date_line <= len(lines) else None
        profile_status = "missing" if value is None else "no-match"
        if value:
            match = re.search(options["publication_date_pattern"], value)
            if match:
                date_basis = locator([date_line - 1, date_line], value)
                date_basis["text"] = value
                candidates.append(match.group(0))
                try:
                    published = datetime.strptime(match.group(0), options["publication_date_format"]).strftime("%Y-%m-%d")
                    profile_status = "matched"
                except ValueError:
                    profile_status = "invalid-date"
    dates = {"published_at": published, "modified_at": None, "precision": "day" if published else "unknown", "candidates": candidates, "basis": date_basis, "profile_status": profile_status}
    complete = bool(title and blocks)
    return {"status": "extracted" if complete else "partial", "title": title, "title_basis": title_basis, "title_profile_status": "matched" if title else "ambiguous" if titles else "missing", "language": options.get("language"), "dates": dates, "blocks": blocks, "links": links, "quality": {"required_fields_present": complete, "missing_pages": [], "reviewed": False}}


def json_document_parse(raw, url, options):
    """Parse configured JSON fields, preserving pointers and separate record dates."""
    import math

    profile = options.get("json_document")
    allowed = {"title_pointer", "published_at_pointer", "modified_at_pointer", "identities", "fields", "records", "max_bytes", "max_depth", "max_nodes", "max_records", "max_blocks", "max_field_chars"}
    if not isinstance(profile, dict) or set(profile) - allowed:
        raise ValueError("Explicit JSON document profile required")

    def budget(key, default, maximum):
        value = profile.get(key, default)
        if type(value) is not int or not 1 <= value <= maximum:
            raise ValueError("Invalid JSON budget: " + key)
        return value

    if len(raw) > budget("max_bytes", 5 * 1024**2, 10 * 1024**2):
        raise ValueError("JSON byte budget exceeded")
    max_depth, max_nodes = budget("max_depth", 64, 128), budget("max_nodes", 100000, 200000)
    max_records, max_blocks = budget("max_records", 300, 1000), budget("max_blocks", 3000, 10000)
    max_field_chars = budget("max_field_chars", 200000, 1000000)

    def unique_object(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                raise ValueError("Duplicate JSON key")
            value[key] = item
        return value

    def invalid_constant(value):
        raise ValueError("Non-finite JSON number")

    document = json.loads(raw.decode("utf-8-sig", errors="strict"), object_pairs_hook=unique_object, parse_constant=invalid_constant)
    pending, nodes = [(document, 0)], 0
    while pending:
        value, depth = pending.pop()
        nodes += 1
        if depth > max_depth or nodes > max_nodes:
            raise ValueError("JSON structure budget exceeded")
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError("Non-finite JSON number")
        children = value.values() if isinstance(value, dict) else value if isinstance(value, list) else []
        pending.extend((item, depth + 1) for item in children)

    missing = object()

    def pointer(value, selector):
        if not isinstance(selector, str) or len(selector) > 1024 or (selector and not selector.startswith("/")) or re.search(r"~(?![01])", selector):
            raise ValueError("Invalid JSON pointer")
        for encoded in selector[1:].split("/") if selector else []:
            key = encoded.replace("~1", "/").replace("~0", "~")
            if isinstance(value, dict):
                value = value.get(key, missing)
            elif isinstance(value, list) and re.fullmatch(r"0|[1-9][0-9]*", key):
                index = int(key)
                value = value[index] if index < len(value) else missing
            else:
                return missing
            if value is missing:
                break
        return value

    identities = profile.get("identities")
    if not isinstance(identities, list) or not 1 <= len(identities) <= 8:
        raise ValueError("JSON source identity rules required")
    for rule in identities:
        if not isinstance(rule, dict) or set(rule) - {"pointer", "url_pattern", "expected"}:
            raise ValueError("Invalid JSON identity rule")
        pattern = rule.get("url_pattern")
        if not isinstance(pattern, str) or not 1 <= len(pattern) <= 1024 or len(url) > 4096:
            raise ValueError("Bounded JSON identity pattern required")
        match = re.fullmatch(pattern, unquote(url))
        actual = pointer(document, rule.get("pointer"))
        expected = rule.get("expected", "{value}")
        if not isinstance(expected, str) or len(expected) > 4096:
            raise ValueError("Invalid JSON identity expectation")
        if not match or type(actual) not in (str, int) or unquote(str(actual)) != expected.format_map(match.groupdict()):
            raise ValueError("JSON source identity mismatch")

    def location(selector, value):
        return {"type": "json", "json_pointer": selector, "text_hash": digest(clean(value))}

    title_value = pointer(document, profile.get("title_pointer"))
    if title_value is not missing and title_value is not None and not isinstance(title_value, str):
        raise ValueError("JSON title must be a string")
    title = clean(title_value) if isinstance(title_value, str) else None
    if title and len(title) > 4096:
        raise ValueError("JSON title budget exceeded")
    dates = {"published_at": None, "modified_at": None, "precision": "unknown", "profile_status": "not-configured", "basis": None}
    issues, blocks, links, selected = [], [], [], set()
    if not title:
        issues.append({"pointer": profile["title_pointer"], "reason": "missing-title"})
    for key in ("published_at", "modified_at"):
        selector = profile.get(key + "_pointer")
        if selector is None:
            continue
        value = pointer(document, selector)
        parsed = source_date_value(value)
        dates[key] = parsed
        state = "matched" if parsed else "missing" if value is missing or value is None else "invalid-date"
        dates[key + "_profile_status"] = state
        if key == "published_at":
            dates.update({"profile_status": state, "precision": "timestamp" if parsed and "T" in parsed else "day" if parsed else "unknown", "basis": {**location(selector, value), "text": value} if isinstance(value, str) else None})
            if not parsed:
                issues.append({"pointer": selector, "reason": state})
        elif value is not missing and value is not None and not parsed:
            issues.append({"pointer": selector, "reason": state})

    def fields(value, mapping, prefix="", record=None):
        if not isinstance(mapping, list) or len(mapping) > 32:
            raise ValueError("Bounded JSON field mappings required")
        for field in mapping:
            if not isinstance(field, dict) or set(field) - {"pointer", "format", "required"} or type(field.get("required", True)) is not bool:
                raise ValueError("Invalid JSON field mapping")
            selector = field.get("pointer")
            item = pointer(value, selector)
            absolute = prefix + selector
            if absolute in selected:
                raise ValueError("Duplicate JSON field selection")
            selected.add(absolute)
            fmt = field.get("format", "text")
            if fmt not in ("text", "markdown", "scalar"):
                raise ValueError("Unsupported JSON field format")
            if item is missing or item is None or (isinstance(item, str) and not item.strip()):
                if field.get("required", True):
                    issues.append({"pointer": absolute, "reason": "missing-field"})
                continue
            if not isinstance(item, str) and not (fmt == "scalar" and type(item) in (int, float, bool)):
                raise ValueError("JSON field has an incompatible value type")
            text = item if isinstance(item, str) else json.dumps(item, ensure_ascii=False, allow_nan=False)
            if len(text) > max_field_chars:
                raise ValueError("JSON field character budget exceeded")
            loc = {"type": "json", "json_pointer": absolute, "field_sha256": digest(text)}
            if record is not None:
                loc["record"] = record
            if fmt == "markdown":
                content = markdown_parse(text.encode(), url, {})
                for block in content["blocks"]:
                    block["locator"] = {**loc, "fragment": block["locator"], "text_hash": digest(block["text"])}
                    blocks.append(block)
                for link in content["links"]:
                    link["locator"] = {**loc, "fragment": link["locator"]}
                    links.append(link)
            else:
                text = clean(text)
                blocks.append({"kind": "paragraph", "text": text, "locator": {**loc, "text_hash": digest(text)}})
            if len(blocks) > max_blocks or len(links) > 5000:
                raise ValueError("JSON extracted block budget exceeded")

    fields(document, profile.get("fields", []))
    records = profile.get("records")
    record_count = 0
    if records is not None:
        if not isinstance(records, dict) or set(records) - {"pointer", "id_pointer", "date_pointer", "count_pointer", "fields"}:
            raise ValueError("Invalid JSON record mapping")
        rows = pointer(document, records.get("pointer"))
        if not isinstance(rows, list) or len(rows) > max_records:
            raise ValueError("JSON record collection missing or over budget")
        record_count = len(rows)
        if records.get("count_pointer") is not None:
            count = pointer(document, records["count_pointer"])
            if type(count) is not int or count != record_count:
                raise ValueError("Incomplete JSON record collection")
        identities = set()
        for index, row in enumerate(rows):
            identity = pointer(row, records.get("id_pointer"))
            if type(identity) not in (str, int) or isinstance(identity, str) and (not identity.strip() or len(identity) > 4096):
                raise ValueError("JSON record identity required")
            encoded = json.dumps(identity)
            if encoded in identities:
                raise ValueError("Duplicate JSON record identity")
            identities.add(encoded)
            prefix = records["pointer"] + "/" + str(index)
            record = {"json_pointer": prefix, "id": identity}
            if records.get("date_pointer") is not None:
                value = pointer(row, records["date_pointer"])
                date = source_date_value(value)
                record.update({"date_pointer": prefix + records["date_pointer"], "date": date})
                if date is None:
                    issues.append({"pointer": record["date_pointer"], "reason": "missing-or-invalid-record-date"})
            fields(row, records.get("fields"), prefix, record)
    complete = bool(title and blocks and not issues)
    return {"status": "extracted" if complete else "partial", "title": title, "title_basis": location(profile["title_pointer"], title_value) if title else None, "language": options.get("language"), "dates": dates, "blocks": blocks, "links": links, "quality": {"required_fields_present": complete, "missing_pages": [], "reviewed": False, "json_issues": issues, "record_count": record_count}}


def pdf_parse(raw, options):
    import pymupdf
    doc = pymupdf.open(stream=raw, filetype="pdf")
    if doc.needs_pass:
        return {"status": "blocked", "title": None, "blocks": [], "quality": {"reason": "encrypted-pdf", "missing_pages": [], "reviewed": False}}
    if len(doc) > options.get("max_pages", 200):
        raise ValueError("PDF page budget exceeded")
    blocks, missing, ocr_pages, profile_accepted_sparse_pages = [], [], [], []
    sparse_page_patterns = options.get("sparse_page_patterns", [])
    engine = None
    ocr_model = None
    ocr_unavailable = None
    for number, page in enumerate(doc, 1):
        text_blocks = page.get_text("blocks", sort=True)
        usable = sum(len(b[4].strip()) for b in text_blocks if b[6] == 0)
        page_text_parts = [clean(b[4]) for b in text_blocks if b[6] == 0]
        page_text = " ".join(value for value in page_text_parts if value)
        sparse_profile = next(
            (
                rule for rule in sparse_page_patterns
                if rule.get("page") == number
            ),
            None,
        )
        sparse_match = False
        if sparse_profile is not None:
            pattern = sparse_profile.get("pattern")
            if not isinstance(pattern, str) or not pattern:
                raise ValueError("Invalid sparse PDF page pattern")
            sparse_match = re.fullmatch(pattern, page_text) is not None
            if sparse_match:
                profile_accepted_sparse_pages.append(number)
        if (usable < 30 and not sparse_match) or any(
            "\ufffd" * 3 in b[4] for b in text_blocks if b[6] == 0
        ):
            # Selective OCR: only pages whose text layer is missing/broken.
            if options.get("ocr"):
                import numpy as np
                from rapidocr import RapidOCR
                skip_ocr = False
                if engine is None:
                    from rapidocr.utils.typings import LangDet, LangRec, ModelType, OCRVersion

                    declared_language = (options.get("ocr_language") or options.get("language") or "").replace("_", "-").lower()
                    language = declared_language.split("-", 1)[0]
                    if declared_language.startswith("zh-tw"):
                        language = "zh-tw"
                    rec_languages = {
                        "zh": LangRec.CH, "zh-cn": LangRec.CH, "zh-tw": LangRec.CHINESE_CHT,
                        "ja": LangRec.JAPAN, "en": LangRec.EN,
                        "de": "de", "fr": "fr", "es": "es", "it": "it", "pt": "pt", "nl": "nl",
                    }
                    # RapidOCR maps its PP-OCRv6 `ch` detector profile to the
                    # bundled multi-language detector; `multi` itself is not
                    # a valid enum value for the small model configuration.
                    params = {"Det.lang_type": LangDet.CH}
                    if language == "ko":
                        # PP-OCRv6 has no Korean recognizer. Pin the supported v5
                        # recognizer explicitly and require the locally staged model.
                        model_path = Path(__file__).resolve().parents[2] / ".local/research/local-ai/ocr/models/korean_PP-OCRv5_rec_mobile.onnx"
                        if not model_path.is_file():
                            missing.append(number)
                            ocr_unavailable = "korean-model-not-installed"
                            skip_ocr = True
                        params.update({
                            "Rec.ocr_version": OCRVersion.PPOCRV5,
                            "Rec.model_type": ModelType.MOBILE,
                            "Rec.lang_type": LangRec.KOREAN,
                            "Rec.model_path": str(model_path),
                        })
                        ocr_model = "PP-OCRv5-korean-mobile"
                    elif language in rec_languages:
                        params.update({
                            "Rec.lang_type": rec_languages[language],
                            "Rec.model_type": ModelType.SMALL,
                            "Rec.ocr_version": OCRVersion.PPOCRV6,
                        })
                        ocr_model = f"PP-OCRv6-{language or 'multilingual'}"
                    elif language:
                        missing.append(number)
                        ocr_unavailable = f"unsupported-language:{language}"
                        skip_ocr = True
                    else:
                        ocr_model = "PP-OCRv6-default"
                    if not skip_ocr:
                        engine = RapidOCR(params=params)
                if not skip_ocr:
                    scale = 200 / 72
                    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
                    image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
                    result = engine(image)
                    ocr_pages.append(number)
                    text_blocks = []
                    for box, value, confidence in zip(result.boxes if result.boxes is not None else [], result.txts or [], result.scores or []):
                        value = clean(value)
                        if not value:
                            continue
                        coords = box.tolist()
                        bbox = [min(p[0] for p in coords) / scale, min(p[1] for p in coords) / scale, max(p[0] for p in coords) / scale, max(p[1] for p in coords) / scale]
                        blocks.append({"kind": "paragraph", "text": value, "locator": {"type": "pdf", "page": number, "bbox": bbox, "text_hash": digest(value), "method": "ocr", "confidence": float(confidence)}})
                    if not result.txts or any(s < 0.90 for s in result.scores):
                        missing.append(number)
            else:
                missing.append(number)
        for block in text_blocks:
            if block[6] != 0:
                continue
            value = clean(block[4])
            if value:
                blocks.append({"kind": "paragraph", "text": value, "locator": {"type": "pdf", "page": number, "bbox": list(block[:4]), "text_hash": digest(value)}})
        for table in page.find_tables().tables:
            rows = table.extract()
            value = "\n".join(" | ".join(clean(c) for c in row) for row in rows)
            if value:
                blocks.append({"kind": "table", "text": value, "rows": rows, "locator": {"type": "pdf", "page": number, "bbox": list(table.bbox), "text_hash": digest(value)}})
    title = clean(doc.metadata.get("title")) or options.get("title")
    title_basis = None
    if options.get("pdf_title_pattern"):
        page_number = options.get("pdf_title_page", 1)
        if type(page_number) is not int or not 1 <= page_number <= len(doc):
            raise ValueError("Invalid PDF title page")
        matches = [(b, re.search(options["pdf_title_pattern"], b["text"])) for b in blocks if b["kind"] == "paragraph" and b["locator"]["page"] == page_number and b["locator"].get("method") != "ocr"]
        matches = [(b, match) for b, match in matches if match]
        if len(matches) == 1:
            block, match = matches[0]
            title = clean(match.group(0))
            title_basis = {**block["locator"], "text": block["text"], "matched_text": match.group(0)}
        else:
            # A failed source profile must not silently fall back to unrelated metadata.
            title = None
    dates = {"published_at": None, "modified_at": None, "precision": "unknown", "pdf_metadata": doc.metadata, "profile_status": "not-configured", "basis": None}
    if options.get("publication_date_page") is not None:
        page_number = options["publication_date_page"]
        if type(page_number) is not int or not 1 <= page_number <= len(doc):
            raise ValueError("Invalid PDF publication date page")
        matches = [(b, re.search(options["publication_date_pattern"], b["text"])) for b in blocks if b["kind"] == "paragraph" and b["locator"]["page"] == page_number and b["locator"].get("method") != "ocr"]
        matches = [(b, match) for b, match in matches if match]
        dates["profile_status"] = "missing" if not matches else "ambiguous" if len(matches) != 1 else "invalid-date"
        if len(matches) == 1:
            block, match = matches[0]
            dates["basis"] = {**block["locator"], "text": block["text"], "matched_text": match.group(0)}
            try:
                dates["published_at"] = datetime.strptime(date_for_strptime(match.group(0), options["publication_date_format"], options.get("language")), options["publication_date_format"]).strftime("%Y-%m-%d")
                dates["precision"] = "day"
                dates["profile_status"] = "matched"
            except ValueError:
                pass  # Invalid publisher dates stay explicit, never inferred from PDF metadata.
    if options.get("publication_date_from_listing") is True and dates["published_at"] is None:
        listed_day = options.get("listing_published_at")
        listing_url = options.get("listing_source_url")
        listing_version = options.get("listing_source_version_id")
        listing_text = options.get("listing_date_text")
        try:
            normalized_day = datetime.strptime(listed_day, "%Y-%m-%d").strftime("%Y-%m-%d")
        except (TypeError, ValueError):
            raise ValueError("Official listing publication date is required")
        if not all(isinstance(value, str) and value.strip() for value in (listing_url, listing_version, listing_text)):
            raise ValueError("Official listing publication evidence is required")
        dates["published_at"] = normalized_day
        dates["precision"] = "day"
        dates["profile_status"] = "official-listing"
        dates["basis"] = {
            "type": "official-listing",
            "published_at": normalized_day,
            "text": listing_text,
            "source_url": listing_url,
            "source_version_id": listing_version,
        }
    quality = {"required_fields_present": bool(title and blocks), "missing_pages": missing, "reviewed": False, "ocr_pages": ocr_pages}
    if profile_accepted_sparse_pages:
        quality["profile_accepted_sparse_pages"] = profile_accepted_sparse_pages
    if ocr_pages:
        quality["ocr_model"] = ocr_model
    if ocr_unavailable:
        quality["ocr_unavailable"] = ocr_unavailable
    return {"status": "extracted" if title and blocks and not missing else "partial", "title": title, "title_basis": title_basis, "language": options.get("language"), "dates": dates, "blocks": blocks, "links": [], "page_count": len(doc), "quality": quality}


def image_parse(raw, options):
    """Reuse selective PDF OCR on one bounded raster, retaining original-pixel locations."""
    import io
    from PIL import Image
    import pymupdf

    maximum = options.get("max_image_pixels", 12_000_000)
    if type(maximum) is not int or not 1 <= maximum <= 20_000_000:
        raise ValueError("Invalid image pixel budget")
    with Image.open(io.BytesIO(raw)) as image:
        if image.format not in ("PNG", "JPEG") or getattr(image, "n_frames", 1) != 1:
            raise ValueError("Only single-frame PNG/JPEG OCR is supported")
        width, height = image.size
        if width * height > maximum or max(width, height) > 12_000:
            raise ValueError("Image pixel budget exceeded")
        image.verify()
    # Render at exactly the input dimensions rather than letting image DPI or
    # the PDF OCR rasterizer multiply a potentially large allocation.
    doc = pymupdf.open()
    scale = 200 / 72
    page = doc.new_page(width=width / scale, height=height / scale)
    page.insert_image(page.rect, stream=raw)
    allowed = {key: options[key] for key in ("title", "language", "ocr_language") if key in options}
    parsed = pdf_parse(doc.tobytes(), {**allowed, "ocr": True, "max_pages": 1})
    doc.close()
    parsed["dates"] = {"published_at": None, "modified_at": None, "precision": "unknown", "profile_status": "not-configured", "basis": None}
    parsed["quality"].update({"source_format": "raster-image", "source_width": width, "source_height": height,
                             "numeric_verification": "unreviewed", "table_structure": "unreviewed"})
    for block in parsed["blocks"]:
        locator = block["locator"]
        locator["type"] = "image"
        locator["coordinate_space"] = "source-pixels"
        locator["bbox"] = [coordinate * scale for coordinate in locator["bbox"]]
        locator.pop("page", None)
    return parsed


def run(request, root):
    if request.get("schema_version") != "research-worker/v1" or request.get("operation") not in ("parse", "links"):
        raise ValueError("Invalid worker operation")
    source = checked_path(root, request["input_path"])
    if source.stat().st_size > request.get("max_bytes", 50 * 1024**2):
        raise ValueError("Input byte budget exceeded")
    raw = source.read_bytes()
    if digest(raw) != request["input_sha256"]:
        raise ValueError("Worker input hash mismatch")
    options = request.get("options", {})
    markdown_mime = request.get("mime_type", "").split(";")[0].strip().lower() in ("text/markdown", "text/x-markdown", "application/markdown")
    html_fragment_profile = options.get("format") == "html-fragment"
    xml_fragment_profile = options.get("format") == "xml-fragment"
    fragment_mime = request.get("mime_type", "").split(";")[0].strip().lower()
    if html_fragment_profile and fragment_mime not in ("text/html", "application/xhtml+xml"):
        raise ValueError("Explicit HTML fragment profile requires an HTML response")
    if xml_fragment_profile and fragment_mime not in ("application/xml", "text/xml", "application/xhtml+xml"):
        raise ValueError("Explicit XML fragment profile requires an XML response")
    prefix = raw[:8192].removeprefix(b"\xef\xbb\xbf").lstrip()
    html_document = re.match(rb"^(?:<!--.*?-->\s*)*(?:<!doctype\s+html\b|<html(?:\s|>))", prefix, re.I | re.S)
    if options.get("format") == "json-document":
        if fragment_mime != "application/json" and not (fragment_mime.startswith("application/") and fragment_mime.endswith("+json")):
            raise ValueError("Explicit JSON profile requires a JSON response")
        parsed = json_document_parse(raw, request["url"], options)
        parser = {"id": "json-document", "version": VERSION}
    elif raw.startswith(b"%PDF-"):
        parsed = pdf_parse(raw, options)
        parser = {"id": "pymupdf", "version": importlib.metadata.version("PyMuPDF")}
    elif options.get("ocr") is True and (raw.startswith(b"\x89PNG\r\n\x1a\n") or raw.startswith(b"\xff\xd8\xff")):
        expected_mime = "image/png" if raw.startswith(b"\x89PNG\r\n\x1a\n") else "image/jpeg"
        if fragment_mime != expected_mime:
            raise ValueError("Raster OCR requires a matching image response")
        parsed = image_parse(raw, options)
        parser = {"id": "pymupdf-raster-rapidocr", "version": importlib.metadata.version("rapidocr")}
    elif options.get("format") == "jats":
        parsed = jats_parse(raw, request["url"], options)
        parser = {"id": "jats-xml", "version": "frontiers-jats/v1"}
    elif html_fragment_profile or xml_fragment_profile or html_document or (not markdown_mime and (b"<html" in raw[:8192].lower() or b"<!doctype html" in raw[:8192].lower())):
        parsed = html_parse(raw, request["url"], options)
        parser = (
            {"id": options["embedded_article"]["format"], "version": VERSION}
            if options.get("embedded_article")
            else {"id": "xml-fragment" if xml_fragment_profile else "html-fragment" if html_fragment_profile else "trafilatura", "version": VERSION if html_fragment_profile or xml_fragment_profile else importlib.metadata.version("trafilatura")}
        )
    elif markdown_mime:
        parsed = markdown_parse(raw, request["url"], options)
        parser = {"id": "markdown-it-py", "version": importlib.metadata.version("markdown-it-py")}
    else:
        parsed = {"status": "unsupported", "title": None, "blocks": [], "links": [], "quality": {"required_fields_present": False, "missing_pages": [], "reviewed": False}}
        parser = {"id": "unsupported", "version": VERSION}
    parser["config_hash"] = digest(json.dumps(options, sort_keys=True, ensure_ascii=False))
    parser["adapter_sha256"] = digest(Path(__file__).read_bytes())
    parse_id = digest(json.dumps([request["source_version_id"], parser, "local-research/v1"], separators=(",", ":"), ensure_ascii=False))
    for i, block in enumerate(parsed["blocks"], 1):
        block["block_id"] = f"{parse_id}:block-{i:04}"
    parsed.update({"schema_version": "source-parse/v1", "source_id": request["source_id"], "source_version_id": request["source_version_id"], "parse_id": parse_id, "parser": parser, "attachments": [{"url": l["url"], "role": "unreviewed"} for l in parsed.get("links", []) if re.search(r"\.pdf(?:[?#]|$)", l["url"], re.I)]})
    parsed.setdefault("dates", {})["observed_at"] = request.get("observed_at")
    return parsed


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--root", required=True)
    root_arg = args.parse_args().root
    root = Path(root_arg).absolute()
    if any(p.is_symlink() for p in [root, *root.parents]):
        raise ValueError("Symlink in worker root")
    # The worker may use only stored documents/models, never download a source or model itself.
    import socket
    def no_network(*args, **kwargs):
        raise RuntimeError("Document worker network access prohibited")
    socket.create_connection = no_network
    socket.socket.connect = no_network
    for line in sys.stdin:
        request = None
        try:
            if len(line) > 1024**2:
                raise ValueError("Worker request too large")
            request = json.loads(line)
            with contextlib.redirect_stdout(sys.stderr):
                result = run(request, root)
            response = {"request_id": request["request_id"], "worker_status": "complete", "result": result}
        except Exception as error:
            print(f"Worker error: {type(error).__name__}: {error}", file=sys.stderr)
            response = {"request_id": request.get("request_id") if request else None, "worker_status": "failed", "error": str(error)}
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
