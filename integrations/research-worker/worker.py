"""Local-file-only document worker. One bounded JSON request/result per line."""
import argparse
import contextlib
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urljoin, urlparse
from datetime import datetime

VERSION = "research-worker/1"


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()


def clean(value):
    return re.sub(r"\s+", " ", value or "").strip()


def known_date(value):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date().isoformat()
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
    """Normalize publisher month names without relying on the host locale."""
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
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?",
        value,
    ) or known_date(value) is None:
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


def presentation_math_text(node):
    """Serialize supported MathML structures without evaluating or flattening them."""
    tag = math_local_name(node)
    children = [child for child in node if isinstance(child.tag, str)]
    # Unsupported layout attributes can change a symbol's meaning (e.g. bold
    # vectors or a barless fraction). Prefer publisher TeX; do not guess them.
    if any(attribute in node.attrib for attribute in ("mathvariant", "linethickness", "bevelled")):
        return None
    if tag in ("mi", "mn", "mo", "mtext"):
        return clean(node.text) if not children and clean(node.text) else None
    if tag == "semantics":
        presentation = [child for child in children if math_local_name(child) not in ("annotation", "annotation-xml")]
        return presentation_math_text(presentation[0]) if len(presentation) == 1 else None
    if not children:
        return None
    if clean(node.text) or any(clean(child.tail) for child in children):
        return None
    values = [presentation_math_text(child) for child in children]
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


def html_parse(raw, url, options):
    import trafilatura
    from lxml import html, etree
    from charset_normalizer import from_bytes

    charset = options.get("encoding")
    if charset:
        decoded = raw.decode(charset, errors="strict")
    else:
        guess = from_bytes(raw).best()
        if guess is None:
            raise ValueError("HTML encoding undetected")
        decoded = str(guess)
    dom = html.fromstring(decoded)
    domtree = dom.getroottree()
    title = clean(" ".join(dom.xpath("//title/text()"))) or None
    language = dom.get("lang") or options.get("language")
    date_nodes = dom.xpath('//meta[@property="article:published_time" or @name="date" or @name="pubdate"]/@content')
    modified_nodes = dom.xpath('//meta[@property="article:modified_time"]/@content')
    explicit_date = options.get("publication_date_xpath")
    date_basis = None
    date_profile_status = "not-configured"
    if explicit_date:
        chosen = dom.xpath(explicit_date)
        date_profile_status = "missing" if not chosen else "ambiguous" if len(chosen) != 1 else "no-match"
        if len(chosen) == 1:
            if not isinstance(chosen[0], etree._Element):
                raise ValueError("Publication date selector must return an element")
            date_attribute = options.get("publication_date_attribute")
            value = clean(chosen[0].get(date_attribute)) if date_attribute else clean(" ".join(chosen[0].itertext()))
            match = re.search(options["publication_date_pattern"], value)
            if match:
                date_basis = {"dom_path": domtree.getpath(chosen[0]), "text": value}
                if date_attribute:
                    date_basis["attribute"] = date_attribute
                try:
                    parsed = datetime.strptime(date_for_strptime(match.group(0), options["publication_date_format"], language), options["publication_date_format"])
                    if options.get("publication_date_preserve_time"):
                        if parsed.tzinfo is None or source_date_value(match.group(0)) is None:
                            raise ValueError("Publisher timestamp needs an explicit offset")
                        date_nodes.append(match.group(0))
                    else:
                        date_nodes.append(parsed.strftime("%Y-%m-%d"))
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
    if bool(summary_xpath) != bool(summary_pattern):
        raise ValueError("Listing page summary requires a selector and pattern")
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
                if set(match.groupdict()) != {"total", "page", "pages"}:
                    raise ValueError("Listing page summary pattern needs total, page and pages")
                total, page, pages = (int(match.group(name)) for name in ("total", "page", "pages"))
                if 0 <= total <= 5000 and 1 <= page <= pages <= 5000:
                    listing_page_summary = {"status": "matched", "total": total, "page": page, "pages": pages, "basis": {"dom_path": domtree.getpath(nodes[0]), "text": value}}
                else:
                    listing_page_summary = {"status": "invalid-count"}
    rules = options.get("listing_link_rules", [])
    if not isinstance(rules, list) or len(rules) > 10:
        raise ValueError("Invalid listing link rules")
    for rule in rules:
        if not isinstance(rule, dict) or not all(isinstance(rule.get(k), str) and 0 < len(rule[k]) <= 512 for k in ("id", "item_xpath", "url_attribute", "url_pattern", "title_xpath")):
            raise ValueError("Incomplete listing link rule")
        if bool(rule.get("date_pattern")) != bool(rule.get("date_format")) or (rule.get("date_pattern") and not rule.get("date_xpath")):
            raise ValueError("Listing date pattern and format require one date selector")
        if rule.get("title_pattern") and (not isinstance(rule["title_pattern"], str) or len(rule["title_pattern"]) > 512 or "title" not in re.compile(rule["title_pattern"]).groupindex):
            raise ValueError("Listing title pattern needs a named title group")
        pattern = re.compile(rule["url_pattern"])
        items = dom.xpath(rule["item_xpath"])
        matched = 0
        for item in items[:5000]:
            if not isinstance(item, etree._Element):
                raise ValueError("Listing selector must return elements")
            target = pattern.fullmatch(item.get(rule["url_attribute"], ""))
            if not target:
                continue
            href = urljoin(url, target.group("url"))
            if urlparse(href).scheme not in ("http", "https"):
                continue
            title_nodes = item.xpath(rule["title_xpath"])
            item_title = clean(" ".join(n.text_content() if isinstance(n, etree._Element) else str(n) for n in title_nodes))
            if rule.get("title_pattern"):
                title_match = re.fullmatch(rule["title_pattern"], item_title)
                item_title = clean(title_match.group("title")) if title_match else ""
            selected_date = item.xpath(rule["date_xpath"]) if rule.get("date_xpath") else []
            item_date_nodes = selected_date if isinstance(selected_date, list) else [selected_date]
            listed_date = clean(" ".join(n.text_content() if isinstance(n, etree._Element) else str(n) for n in item_date_nodes))
            listed_day = known_date(listed_date)
            if rule.get("date_pattern"):
                date_match = re.fullmatch(rule["date_pattern"], listed_date)
                try:
                    listed_day = datetime.strptime(date_for_strptime(date_match.group(0), rule["date_format"], language), rule["date_format"]).strftime("%Y-%m-%d") if date_match else None
                except ValueError:
                    listed_day = None
            links.append({"url": href, "text": item_title, "dom_path": domtree.getpath(item), "published_at": listed_day, "listed_date_text": listed_date or None, "profile_id": rule["id"]})
            matched += 1
        link_profiles.append({"id": rule["id"], "status": "matched" if matched else "no-match", "selected_items": len(items), "matched_links": matched, "truncated": len(items) > 5000})
    for a in dom.xpath("//a[@href]")[:5000]:
        href = urljoin(url, a.get("href"))
        if urlparse(href).scheme in ("http", "https"):
            links.append({"url": href, "text": clean(a.text_content()), "dom_path": domtree.getpath(a)})
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
            value = clean(" ".join(title_nodes[0].itertext()))
            if value:
                title = value
                title_profile_status = "matched"
                title_basis = {"type": "html", "dom_path": domtree.getpath(title_nodes[0]), "text": value, "text_hash": digest(value)}
    block_selector = options.get("content_block_xpath")
    selected_blocks = None
    if block_selector:
        if not selected or not isinstance(block_selector, str) or len(block_selector) > 1024:
            raise ValueError("Block profile requires an explicit content container")
        selected_blocks = container.xpath(block_selector)
        if not selected_blocks:
            raise ValueError("Block profile did not match any elements")
        for node in selected_blocks:
            if not isinstance(node, etree._Element) or container not in node.iterancestors():
                raise ValueError("Block profile must select descendant elements")
            if any(p.tag in ("script", "style", "noscript") for p in [node, *node.iterancestors()]):
                raise ValueError("Block profile selected non-reader content")
    blocks = []
    for node in selected_blocks if selected_blocks is not None else container.iter():
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
    days = [known_date(value) for value in date_nodes]
    valid_dates = bool(days) and all(days) and len(set(days)) == 1
    published = (date_nodes[0] if len(set(date_nodes)) == 1 else days[0]) if valid_dates else None
    if date_nodes and not valid_dates:
        date_profile_status = "conflict" if all(days) else "invalid-date"
    if explicit_date and date_profile_status != "matched":
        published = None
    if published and source_date_value(published) is None:
        published = None
        date_profile_status = "invalid-date"
    modified_days = [known_date(value) for value in modified_nodes]
    valid_modified = bool(modified_days) and all(modified_days) and len(set(modified_days)) == 1
    modified = (modified_nodes[0] if len(set(modified_nodes)) == 1 else modified_days[0]) if valid_modified else None
    if modified_nodes and not valid_modified:
        modified_profile_status = "conflict" if all(modified_days) else "invalid-date"
    if explicit_modified and modified_profile_status != "matched":
        modified = None
    if modified and source_date_value(modified) is None:
        modified = None
        modified_profile_status = "invalid-date"
    if modified and published and known_date(modified) < known_date(published):
        modified = None
        modified_profile_status = "before-publication"
    dates = {"published_at": published, "modified_at": modified, "precision": "timestamp" if published and "T" in published else "day" if published else "unknown", "candidates": date_nodes, "basis": date_basis, "profile_status": date_profile_status, "modified_candidates": modified_nodes, "modified_basis": modified_basis, "modified_profile_status": modified_profile_status}
    # Parser date inference is kept as a candidate, never promoted to original publication time.
    missing_math = [{"dom_path": value["dom_path"], "reason": value["reason"]} for value in math_expressions if value["reason"]]
    complete = bool(title and blocks) and not missing_math
    status = "extracted" if complete else "partial"
    result = {"status": status, "title": title, "title_basis": title_basis, "title_profile_status": title_profile_status, "language": language, "dates": dates, "blocks": blocks, "links": links, "link_profiles": link_profiles, "quality": {"required_fields_present": complete, "missing_pages": [], "reviewed": False}}
    if listing_page_summary is not None:
        result["listing_page_summary"] = listing_page_summary
    if math_expressions:
        result["math_expressions"] = math_expressions
        result["quality"]["missing_math"] = missing_math
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

    title = titles[0]["text"] if len(titles) == 1 else None
    title_basis = titles[0]["locator"] if title else None
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


def pdf_parse(raw, options):
    import pymupdf
    doc = pymupdf.open(stream=raw, filetype="pdf")
    if doc.needs_pass:
        return {"status": "blocked", "title": None, "blocks": [], "quality": {"reason": "encrypted-pdf", "missing_pages": [], "reviewed": False}}
    if len(doc) > options.get("max_pages", 200):
        raise ValueError("PDF page budget exceeded")
    blocks, missing, ocr_pages = [], [], []
    engine = None
    for number, page in enumerate(doc, 1):
        text_blocks = page.get_text("blocks", sort=True)
        usable = sum(len(b[4].strip()) for b in text_blocks if b[6] == 0)
        if usable < 30 or any("\ufffd" * 3 in b[4] for b in text_blocks if b[6] == 0):
            # Selective OCR: only pages whose text layer is missing/broken.
            if options.get("ocr"):
                import numpy as np
                from rapidocr import RapidOCR
                if engine is None:
                    engine = RapidOCR()
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
                dates["published_at"] = datetime.strptime(match.group(0), options["publication_date_format"]).strftime("%Y-%m-%d")
                dates["precision"] = "day"
                dates["profile_status"] = "matched"
            except ValueError:
                pass  # Invalid publisher dates stay explicit, never inferred from PDF metadata.
    return {"status": "extracted" if title and blocks and not missing else "partial", "title": title, "title_basis": title_basis, "language": options.get("language"), "dates": dates, "blocks": blocks, "links": [], "page_count": len(doc), "quality": {"required_fields_present": bool(title and blocks), "missing_pages": missing, "reviewed": False, "ocr_pages": ocr_pages}}


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
    prefix = raw[:8192].removeprefix(b"\xef\xbb\xbf").lstrip()
    html_document = re.match(rb"^(?:<!--.*?-->\s*)*(?:<!doctype\s+html\b|<html(?:\s|>))", prefix, re.I | re.S)
    if raw.startswith(b"%PDF-"):
        parsed = pdf_parse(raw, options)
        parser = {"id": "pymupdf", "version": importlib.metadata.version("PyMuPDF")}
    elif html_document or (not markdown_mime and (b"<html" in raw[:8192].lower() or b"<!doctype html" in raw[:8192].lower())):
        parsed = html_parse(raw, request["url"], options)
        parser = {"id": "trafilatura", "version": importlib.metadata.version("trafilatura")}
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
