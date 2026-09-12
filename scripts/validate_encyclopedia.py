#!/usr/bin/env python3
"""Validate Tech Knowledge magazine issues and encyclopedia entries."""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


BRIEFING_HEADINGS = [
    "이번 호 표지",
    "차례",
    "커버 스토리",
    "뉴스 데스크",
    "리서치 노트",
    "도구 상자",
    "흐름 읽기",
    "오늘의 적용",
    "개념 색인",
    "Source List",
]
CONTENT_HEADINGS = [
    "커버 스토리",
    "뉴스 데스크",
    "리서치 노트",
    "도구 상자",
    "흐름 읽기",
    "오늘의 적용",
    "개념 색인",
]
ITEM_HEADINGS = ["커버 스토리", "뉴스 데스크", "리서치 노트", "도구 상자"]
CONCEPT_HEADINGS = [
    "한 문장 정의",
    "용어 카드",
    "범위",
    "왜 중요한가",
    "핵심 구성 요소",
    "작동 원리",
    "실제 예시",
    "한계와 실패 조건",
    "혼동하기 쉬운 개념",
    "관련 개념",
    "최근 변화",
    "출처",
]
INDEX_HEADINGS = [
    "이 문서의 역할",
    "포함하는 개념",
    "개념 경계",
    "읽는 순서",
    "관련 인덱스",
    "출처",
]
BRIEFING_FIELDS = [
    "title",
    "type",
    "schema_version",
    "date",
    "timezone",
    "coverage_start",
    "coverage_end",
    "source_count",
    "new_items_count",
    "linked_knowledge_notes",
    "knowledge_notes_created",
    "knowledge_notes_updated",
]
CONCEPT_FIELDS = [
    "title",
    "type",
    "entry_type",
    "schema_version",
    "status",
    "domain",
    "created",
    "updated",
    "aliases",
    "parent_concepts",
    "related_concepts",
    "tags",
]
INDEX_FIELDS = [
    "title",
    "type",
    "entry_type",
    "schema_version",
    "status",
    "domain",
    "created",
    "updated",
    "aliases",
    "tags",
]
URL_RE = re.compile(r"https?://[^\s<>()]+")
WIKILINK_RE = re.compile(r"\[\[([^\]]+)\]\]")
SOURCE_DEF_RE = re.compile(r"(?m)^- \[S(\d+)\] (https?://\S+)\s*$")
SOURCE_MARKER_RE = re.compile(r"\[S(\d+)\]")
COMPOUND_TITLE_RE = re.compile(r"(?:\b(?:and)\b|\s&\s|\s[와과]\s|\s/\s)", re.I)


@dataclass(frozen=True)
class Finding:
    severity: str
    path: Path
    message: str


def parse_scalar(value: str):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    if value == "[]":
        return []
    if value in {"true", "false"}:
        return value == "true"
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    return value


def parse_frontmatter(text: str) -> tuple[dict[str, object], str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, text
    try:
        end = lines.index("---", 1)
    except ValueError:
        return {}, text

    metadata: dict[str, object] = {}
    active_list: str | None = None
    for raw in lines[1:end]:
        if re.match(r"^\s+-\s+", raw) and active_list:
            item = re.sub(r"^\s+-\s+", "", raw)
            current = metadata.setdefault(active_list, [])
            if isinstance(current, list):
                current.append(parse_scalar(item))
            continue
        match = re.match(r"^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$", raw)
        if not match:
            active_list = None
            continue
        key, value = match.groups()
        if value == "":
            metadata[key] = []
            active_list = key
        else:
            metadata[key] = parse_scalar(value)
            active_list = None
    return metadata, "\n".join(lines[end + 1 :])


def headings(body: str, level: int) -> list[str]:
    marker = "#" * level
    return re.findall(rf"(?m)^{re.escape(marker)} ([^#\n].*?)\s*$", body)


def sections(body: str, level: int) -> tuple[list[str], dict[str, str]]:
    marker = "#" * level
    matches = list(re.finditer(rf"(?m)^{re.escape(marker)} ([^#\n].*?)\s*$", body))
    order: list[str] = []
    result: dict[str, str] = {}
    for index, match in enumerate(matches):
        name = match.group(1).strip()
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        order.append(name)
        result[name] = body[start:end].strip()
    return order, result


def unique_urls(text: str) -> list[str]:
    cleaned: list[str] = []
    for match in URL_RE.findall(text):
        cleaned.append(match.rstrip(".,;:!?]}'\""))
    return list(dict.fromkeys(cleaned))


def wiki_target(raw: str) -> str:
    target = raw.split("|", 1)[0].split("#", 1)[0].strip()
    return Path(target).name


def add_error(findings: list[Finding], path: Path, message: str) -> None:
    findings.append(Finding("ERROR", path, message))


def add_warning(findings: list[Finding], path: Path, message: str) -> None:
    findings.append(Finding("WARN", path, message))


def require_fields(
    metadata: dict[str, object], required: Iterable[str], path: Path, findings: list[Finding]
) -> None:
    for field in required:
        if field not in metadata:
            add_error(findings, path, f"missing frontmatter field: {field}")


def build_knowledge_catalog(knowledge_root: Path) -> tuple[dict[str, Path], dict[Path, str]]:
    names: dict[str, Path] = {}
    entry_types: dict[Path, str] = {}
    if not knowledge_root.exists():
        return names, entry_types
    catalog_paths = list(knowledge_root.rglob("*.md"))
    map_root = knowledge_root.parent / "Knowledge Maps"
    if map_root.exists():
        catalog_paths.extend(map_root.rglob("*.md"))
    for path in sorted(catalog_paths):
        text = path.read_text(encoding="utf-8")
        metadata, _ = parse_frontmatter(text)
        entry_type = str(metadata.get("entry_type", "map" if path.is_relative_to(map_root) else ""))
        entry_types[path] = entry_type
        candidates = [path.stem, str(metadata.get("title", ""))]
        aliases = metadata.get("aliases", [])
        if isinstance(aliases, list):
            candidates.extend(str(alias) for alias in aliases)
        for candidate in candidates:
            candidate = candidate.strip()
            if candidate:
                names.setdefault(candidate, path)
    return names, entry_types


def validate_links(
    text: str,
    path: Path,
    catalog: dict[str, Path],
    entry_types: dict[Path, str],
    findings: list[Finding],
    require_atomic: bool,
) -> None:
    for raw in WIKILINK_RE.findall(text):
        target = wiki_target(raw)
        resolved = catalog.get(target)
        if resolved is None:
            add_error(findings, path, f"unresolved knowledge link: [[{raw}]]")
        elif require_atomic and entry_types.get(resolved) != "concept":
            add_error(findings, path, f"deeper-reading link is not an atomic concept: [[{raw}]]")


def validate_briefing(
    path: Path,
    knowledge_root: Path,
    catalog: dict[str, Path],
    entry_types: dict[Path, str],
) -> list[Finding]:
    findings: list[Finding] = []
    if not path.exists():
        add_error(findings, path, "briefing file does not exist")
        return findings
    text = path.read_text(encoding="utf-8")
    if "{{" in text or "}}" in text:
        add_error(findings, path, "unresolved template placeholder")
    metadata, body = parse_frontmatter(text)
    require_fields(metadata, BRIEFING_FIELDS, path, findings)
    if metadata.get("type") != "briefing":
        add_error(findings, path, "type must be briefing")
    if metadata.get("schema_version") != "tech-ai-magazine/v2":
        add_error(findings, path, "schema_version must be tech-ai-magazine/v2")
    if metadata.get("timezone") != "Asia/Seoul":
        add_error(findings, path, "timezone must be Asia/Seoul")

    order, section_map = sections(body, 1)
    if order != BRIEFING_HEADINGS:
        add_error(findings, path, f"level-1 heading order mismatch: {order}")
    for name in CONTENT_HEADINGS:
        section = section_map.get(name, "")
        if not section:
            add_error(findings, path, f"empty body under heading: {name}")

    try:
        source_count = int(metadata.get("source_count", -1))
        item_count = int(metadata.get("new_items_count", -1))
    except (TypeError, ValueError):
        source_count = -1
        item_count = -1
        add_error(findings, path, "source_count and new_items_count must be integers")

    source_body = section_map.get("Source List", "")
    source_defs = SOURCE_DEF_RE.findall(source_body)
    source_ids = [int(source_id) for source_id, _ in source_defs]
    source_urls = [url.rstrip(".,;:!?") for _, url in source_defs]
    if source_count == 0:
        if source_body != "없음":
            add_error(findings, path, "zero-source Source List must be exactly 없음")
        if unique_urls(text):
            add_error(findings, path, "zero-source briefing contains a URL")
    else:
        if len(source_urls) != source_count:
            add_error(findings, path, "source_count does not match Source List entries")
        if len(set(source_urls)) != len(source_urls):
            add_error(findings, path, "Source List contains duplicate URLs")
        expected_ids = list(range(1, len(source_ids) + 1))
        if source_ids != expected_ids:
            add_error(findings, path, "source IDs must be consecutive from S1")
        body_without_sources = body[: body.find("# Source List")]
        used_ids = {int(value) for value in SOURCE_MARKER_RE.findall(body_without_sources)}
        defined_ids = set(source_ids)
        if used_ids - defined_ids:
            add_error(findings, path, f"undefined source markers: {sorted(used_ids - defined_ids)}")
        if defined_ids - used_ids:
            add_error(findings, path, f"unused Source List entries: {sorted(defined_ids - used_ids)}")

    if item_count == 0:
        for name in CONTENT_HEADINGS:
            if section_map.get(name) != "없음":
                add_error(findings, path, f"zero-item section must be exactly 없음: {name}")
        if metadata.get("linked_knowledge_notes") not in ([], "[]"):
            add_error(findings, path, "zero-item briefing must not link knowledge notes")
    elif item_count > 0:
        counted = 0
        for name in ITEM_HEADINGS:
            section = section_map.get(name, "")
            if section != "없음":
                counted += len(headings(section, 2))
        if counted != item_count:
            add_error(findings, path, f"new_items_count={item_count} but found {counted} item headings")
        cover = section_map.get("커버 스토리", "")
        if cover != "없음":
            if len(headings(cover, 2)) != 1:
                add_error(findings, path, "cover story must contain exactly one level-2 item")
            required_cover = [
                "무엇이 바뀌었나",
                "왜 중요한가",
                "독자에게 미치는 영향",
                "아직 모르는 것",
                "다음에 볼 것",
                "개념 더 읽기",
            ]
            cover_h3 = headings(cover, 3)
            if cover_h3 != required_cover:
                add_error(findings, path, f"cover story subheading order mismatch: {cover_h3}")
        if source_count <= 0:
            add_error(findings, path, "non-empty issue must contain at least one source")

    validate_links(body, path, catalog, entry_types, findings, require_atomic=True)
    return findings


def validate_knowledge_file(
    path: Path, catalog: dict[str, Path], entry_types: dict[Path, str]
) -> list[Finding]:
    findings: list[Finding] = []
    text = path.read_text(encoding="utf-8")
    if "{{" in text or "}}" in text:
        add_error(findings, path, "unresolved template placeholder")
    metadata, body = parse_frontmatter(text)
    entry_type = metadata.get("entry_type")
    if entry_type == "concept":
        require_fields(metadata, CONCEPT_FIELDS, path, findings)
        if metadata.get("type") != "knowledge":
            add_error(findings, path, "concept type must be knowledge")
        expected_h2 = CONCEPT_HEADINGS
        if COMPOUND_TITLE_RE.search(str(metadata.get("title", path.stem))):
            add_error(findings, path, "canonical concept title appears to join multiple concepts")
    elif entry_type == "index":
        require_fields(metadata, INDEX_FIELDS, path, findings)
        if metadata.get("type") != "knowledge-index":
            add_error(findings, path, "index type must be knowledge-index")
        expected_h2 = INDEX_HEADINGS
    else:
        add_error(findings, path, "entry_type must be concept or index")
        return findings

    if metadata.get("schema_version") != "tech-encyclopedia/v2":
        add_error(findings, path, "schema_version must be tech-encyclopedia/v2")
    title = str(metadata.get("title", ""))
    h1 = headings(body, 1)
    if h1 != [title]:
        add_error(findings, path, f"expected one level-1 heading equal to title: {title}")
    h2 = headings(body, 2)
    if h2 != expected_h2:
        add_error(findings, path, f"level-2 heading order mismatch: {h2}")

    _, section_map = sections(body, 2)
    for name in expected_h2:
        if not section_map.get(name, "").strip():
            add_error(findings, path, f"empty body under heading: {name}")
    if entry_type == "concept":
        scope = section_map.get("범위", "")
        if "**포함:**" not in scope or "**포함하지 않음:**" not in scope:
            add_error(findings, path, "범위 must state both 포함 and 포함하지 않음")
        related = section_map.get("관련 개념", "")
        for label in ("상위:", "하위:", "함께 쓰임:", "대비:"):
            if label not in related:
                add_error(findings, path, f"관련 개념 missing relationship label: {label}")
        if not unique_urls(section_map.get("출처", "")):
            add_error(findings, path, "canonical concept must include at least one source URL")
    validate_links(body, path, catalog, entry_types, findings, require_atomic=False)
    return findings


def validate_encyclopedia_index(
    knowledge_root: Path, catalog: dict[str, Path], entry_types: dict[Path, str]
) -> list[Finding]:
    findings: list[Finding] = []
    index_path = knowledge_root / "00 Tech Encyclopedia Index.md"
    if not index_path.exists():
        add_error(findings, index_path, "canonical encyclopedia index is missing")
        return findings
    _, body = parse_frontmatter(index_path.read_text(encoding="utf-8"))
    linked_concepts: set[Path] = set()
    for raw in WIKILINK_RE.findall(body):
        resolved = catalog.get(wiki_target(raw))
        if resolved is not None and entry_types.get(resolved) == "concept":
            linked_concepts.add(resolved)
    canonical_concepts = {
        path
        for path, entry_type in entry_types.items()
        if entry_type == "concept" and path.is_relative_to(knowledge_root)
    }
    missing = sorted(path.stem for path in canonical_concepts - linked_concepts)
    if missing:
        add_error(findings, index_path, f"canonical concepts missing from index: {missing}")
    return findings


def validate_map_file(
    path: Path, catalog: dict[str, Path], entry_types: dict[Path, str]
) -> list[Finding]:
    findings: list[Finding] = []
    text = path.read_text(encoding="utf-8")
    metadata, body = parse_frontmatter(text)
    if metadata.get("type") != "map":
        add_error(findings, path, "knowledge map type must be map")
    if "last_reviewed" not in metadata:
        add_error(findings, path, "knowledge map missing last_reviewed")
    validate_links(body, path, catalog, entry_types, findings, require_atomic=False)
    return findings


def resolve_path(path_value: str, vault_root: Path) -> Path:
    candidate = Path(path_value).expanduser()
    return candidate if candidate.is_absolute() else vault_root / candidate


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vault-root", required=True, help="Obsidian vault root")
    parser.add_argument("--briefing", help="Briefing path, absolute or relative to vault root")
    parser.add_argument(
        "--knowledge",
        action="append",
        default=[],
        help="Knowledge entry path to validate; repeat for multiple files",
    )
    parser.add_argument("--all-knowledge", action="store_true", help="Validate every canonical knowledge Markdown file")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    vault_root = Path(args.vault_root).expanduser().resolve()
    knowledge_root = vault_root / "Knowledge"
    catalog, entry_types = build_knowledge_catalog(knowledge_root)
    findings: list[Finding] = []

    if args.briefing:
        briefing = resolve_path(args.briefing, vault_root)
        findings.extend(validate_briefing(briefing, knowledge_root, catalog, entry_types))

    knowledge_paths: set[Path] = {resolve_path(value, vault_root) for value in args.knowledge}
    map_paths: set[Path] = set()
    if args.all_knowledge and knowledge_root.exists():
        knowledge_paths.update(knowledge_root.rglob("*.md"))
        map_root = knowledge_root.parent / "Knowledge Maps"
        if map_root.exists():
            map_paths.update(map_root.rglob("*.md"))
    for path in sorted(knowledge_paths):
        findings.extend(validate_knowledge_file(path, catalog, entry_types))
    for path in sorted(map_paths):
        findings.extend(validate_map_file(path, catalog, entry_types))
    if args.all_knowledge:
        findings.extend(validate_encyclopedia_index(knowledge_root, catalog, entry_types))

    if not args.briefing and not knowledge_paths:
        print("ERROR: choose --briefing, --knowledge, or --all-knowledge", file=sys.stderr)
        return 2

    for finding in findings:
        try:
            display = finding.path.relative_to(vault_root)
        except ValueError:
            display = finding.path
        print(f"{finding.severity}: {display}: {finding.message}")

    errors = sum(1 for finding in findings if finding.severity == "ERROR")
    warnings = sum(1 for finding in findings if finding.severity == "WARN")
    checked = (1 if args.briefing else 0) + len(knowledge_paths) + len(map_paths)
    if errors:
        print(f"FAIL: checked={checked} errors={errors} warnings={warnings}")
        return 1
    print(f"PASS: checked={checked} errors=0 warnings={warnings}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
