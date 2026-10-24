"""Semantic Common 0.1.0: stdlib-only strict wire and immutable bundle I/O."""

import hashlib
import ipaddress
import json
import math
import os
import re
import shutil
import stat
import unicodedata
import uuid
from pathlib import Path

VERSION = "0.1.0"
MAX_BYTES = 64 * 1024 * 1024
WHITESPACE = " \t\n\r\f\v\x85\xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
SCHEMA = json.loads(
    Path(__file__).with_name("semantic-bundle.schema.json").read_bytes()
)


class BundleError(ValueError):
    pass


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def normalize_search(text):
    return re.sub(
        r"[ \t\n]+",
        " ",
        unicodedata.normalize("NFC", text).replace("\r\n", "\n").replace("\r", "\n"),
    ).strip(" \t\n")


def _shape(value, schema, at="$", root=SCHEMA):
    if "$ref" in schema:
        return _shape(value, root["$defs"][schema["$ref"].split("/")[-1]], at)
    if "anyOf" in schema:
        for option in schema["anyOf"]:
            try:
                _shape(value, option, at)
                return
            except BundleError:
                pass
        raise BundleError(at + ": invalid nullable value")
    if "enum" in schema and (
        type(value) not in (str, type(None)) or value not in schema["enum"]
    ):
        raise BundleError(at + ": invalid enum")
    kind = schema.get("type")
    valid = {
        "object": type(value) is dict,
        "array": type(value) is list,
        "string": type(value) is str,
        "boolean": type(value) is bool,
        "null": value is None,
    }
    if kind and not valid[kind]:
        raise BundleError(at + ": invalid " + kind)
    if kind == "object":
        if set(value) != set(schema["required"]):
            raise BundleError(at + ": missing or unknown keys")
        for key, item in value.items():
            _shape(item, schema["properties"][key], at + "." + key)
    if kind == "array":
        if (
            not schema.get("minItems", 0)
            <= len(value)
            <= schema.get("maxItems", 100000)
        ):
            raise BundleError(at + ": array length")
        for i, item in enumerate(value):
            _shape(item, schema["items"], f"{at}[{i}]")
    if kind == "string":
        if (
            not schema.get("minLength", 0)
            <= len(value)
            <= schema.get("maxLength", MAX_BYTES)
        ):
            raise BundleError(at + ": string length")
        if "pattern" in schema and not re.fullmatch(schema["pattern"], value):
            raise BundleError(at + ": pattern")
        if any(0xD800 <= ord(c) <= 0xDFFF for c in value):
            raise BundleError(at + ": lone surrogate")


def _unique(values, name):
    if len(values) != len(set(values)):
        raise BundleError("duplicate " + name)


def _path(value):
    return (
        bool(value)
        and not value.startswith(("/", "\\"))
        and "\\" not in value
        and ":" not in value
        and all(p not in ("", ".", "..") for p in value.split("/"))
    )


def validate_bundle(bundle, source_id=None, require_public=False):
    _shape(bundle, SCHEMA)
    if source_id is not None and bundle["source"]["id"] != source_id:
        raise BundleError("unregistered source")
    if bundle["coverage"]["status"] == "complete" and bundle["coverage"]["omissions"]:
        raise BundleError("complete coverage cannot omit records")
    for key in ("records", "relations", "evidence"):
        _unique([r["id"] for r in bundle[key]], key + " IDs")
    _unique(
        [(r["kind"], r["native_id"]) for r in bundle["records"]], "native identities"
    )
    records = {r["id"]: r for r in bundle["records"]}
    evidence = {r["id"]: r for r in bundle["evidence"]}
    for item in bundle["evidence"]:
        if item["record_id"] is not None:
            r = records.get(item["record_id"])
            if (
                not r
                or (
                    item["source_native_id"],
                    item["source_revision"],
                    item["source_bytes_sha256"],
                )
                != (
                    r["native_id"],
                    r["provenance"]["revision"],
                    r["provenance"]["bytes_sha256"],
                )
                or item["quote"] not in r["text"]
            ):
                raise BundleError("evidence source/revision/quote mismatch")
    outgoing = {}
    for rel in bundle["relations"]:
        if rel["source_id"] not in records or rel["target_id"] not in records:
            raise BundleError("dangling relation")
        if rel["predicate"].split(":")[0] != bundle["source"]["project"] or rel[
            "directed"
        ] != (rel["predicate"] != "garden:associated"):
            raise BundleError("native relation namespace/direction mismatch")
        kinds = {
            "wiki:broader": ({"concept"}, {"concept"}),
            "wiki:instance_of": ({"entity", "event", "procedure"}, {"concept"}),
            "wiki:part_of": ({"entity"}, {"entity"}),
            "wiki:depends_on": ({"procedure"}, {"procedure"}),
            **{
                p: ({"article", "claim"}, {"concept"})
                for p in (
                    "garden:topic",
                    "garden:application",
                    "garden:comparison_evaluation",
                    "garden:context_background",
                )
            },
        }
        expected = kinds.get(rel["predicate"])
        if rel["source_id"] == rel["target_id"] or (
            expected
            and (
                records[rel["source_id"]]["kind"] not in expected[0]
                or records[rel["target_id"]]["kind"] not in expected[1]
            )
        ):
            raise BundleError("native relation subject kinds/self link")
        if not rel["reason"].strip(WHITESPACE):
            raise BundleError("relation requires reason")
        _unique(rel["evidence_ids"], "relation evidence")
        _unique(rel["native_evidence_ids"], "native relation evidence")
        if any(e not in evidence for e in rel["evidence_ids"]):
            raise BundleError("dangling relation evidence")
        if rel["status"] in ("declared", "reviewed"):
            outgoing.setdefault(rel["source_id"], []).append(rel)
    for record in records.values():
        p, review = record["provenance"], record["review"]
        if p["path"] is not None and not _path(p["path"]):
            raise BundleError("non-relative source path")
        _unique(p["urls"], "source URLs")
        for url in [*p["urls"], *([p["url"]] if p["url"] is not None else [])]:
            if (
                not re.match(r"^https?://", url)
                or "\\" in url
                or any(c in WHITESPACE or ord(c) < 32 or ord(c) == 127 for c in url)
            ):
                raise BundleError("unsafe display URL")
            match = re.fullmatch(
                r"https?://(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(?::([0-9]{1,5}))?(?:[/?#].*)?",
                url,
            )
            if not match or (match[2] is not None and int(match[2]) > 65535):
                raise BundleError("unsafe display URL host")
            host = match[1]
            if host.startswith("["):
                try:
                    ipaddress.IPv6Address(host[1:-1])
                except ValueError:
                    raise BundleError("unsafe display URL host") from None
            elif re.fullmatch(
                r"(?:[0-9]+|0[xX][a-fA-F0-9]+)",
                host.removesuffix(".").rsplit(".", 1)[-1],
            ):
                try:
                    if str(ipaddress.IPv4Address(host)) != host:
                        raise ValueError()
                except ValueError:
                    raise BundleError("unsafe display URL host") from None
            elif len(host.removesuffix(".")) > 253 or any(
                not re.fullmatch(
                    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label
                )
                for label in host.removesuffix(".").split(".")
            ):
                raise BundleError("unsafe display URL host")
        _unique([f["profile"] for f in p["fingerprints"]], "fingerprint profile")
        _unique(record["aliases"], "aliases")
        _unique(record["evidence_ids"], "record evidence")
        if any(e not in evidence for e in record["evidence_ids"]):
            raise BundleError("dangling record evidence")
        if review["evidence"] == "verified" and not any(
            evidence[e]["verification"] == "verified" for e in record["evidence_ids"]
        ):
            raise BundleError("verified record requires verified evidence")
        has_links = bool(outgoing.get(record["id"]))
        if (review["semantic"] == "reviewed_links" and not has_links) or (
            review["semantic"] == "reviewed_none" and has_links
        ):
            raise BundleError("semantic review/relations mismatch")
        if require_public and review["publication"] not in ("approved", "published"):
            raise BundleError("nonpublic record in public export")
    return bundle


def _decode(data):
    def finite(value):
        number = float(value)
        if not math.isfinite(number):
            raise BundleError("nonfinite JSON")
        return number

    def pairs(items):
        result = {}
        for k, v in items:
            if k in result:
                raise BundleError("duplicate JSON key")
            result[k] = v
        return result

    if len(data) > MAX_BYTES:
        raise BundleError("bundle too large")
    try:
        return json.loads(
            data.decode("utf-8"),
            object_pairs_hook=pairs,
            parse_float=finite,
            parse_constant=lambda _: (_ for _ in ()).throw(
                BundleError("nonfinite JSON")
            ),
        )
    except (ValueError, UnicodeError) as exc:
        raise BundleError(str(exc)) from exc


def _read(root, relative):
    p = root / relative
    cursor = root
    for part in Path(relative).parts:
        cursor = cursor / part
        if cursor.is_symlink():
            raise BundleError("symlink in bundle")
    before = p.lstat()
    if (
        not stat.S_ISREG(before.st_mode)
        or before.st_nlink != 1
        or before.st_size > MAX_BYTES
    ):
        raise BundleError("bundle must be a regular single-link bounded file")
    fd = os.open(
        p, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    )
    with os.fdopen(fd, "rb") as f:
        opened = os.fstat(f.fileno())
        if (opened.st_dev, opened.st_ino) != (
            before.st_dev,
            before.st_ino,
        ) or not stat.S_ISREG(opened.st_mode):
            raise BundleError("bundle changed during open")
        data = f.read(MAX_BYTES + 1)
        after, named = os.fstat(f.fileno()), p.lstat()
        if (
            (opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns)
            != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
            or (after.st_dev, after.st_ino) != (named.st_dev, named.st_ino)
            or named.st_nlink != 1
            or p.resolve() != p
            or len(data) > MAX_BYTES
        ):
            raise BundleError("bundle changed during read")
        return data


def load_bundle(root, source_id=None, require_public=False):
    root = Path(root).absolute()
    if root.resolve() != root:
        raise BundleError("symlink bundle root")
    pointer_data = _read(root, "current.json")
    pointer = _decode(pointer_data)
    if (
        not isinstance(pointer, dict)
        or set(pointer) != {"schema", "bundle_id", "manifest_sha256"}
        or pointer["schema"] != "semantic-bundle-pointer/v1"
        or not all(
            isinstance(pointer.get(k), str)
            and re.fullmatch(r"[a-f0-9]{64}", pointer[k])
            for k in ("bundle_id", "manifest_sha256")
        )
    ):
        raise BundleError("invalid pointer")
    base = "bundles/" + pointer["bundle_id"] + "/"
    manifest_data = _read(root, base + "manifest.json")
    if sha256(manifest_data) != pointer["manifest_sha256"]:
        raise BundleError("manifest SHA mismatch")
    manifest = _decode(manifest_data)
    data = _read(root, base + "bundle.json")
    if (
        not isinstance(manifest, dict)
        or not isinstance(manifest.get("files"), list)
        or len(manifest["files"]) != 1
        or not isinstance(manifest["files"][0], dict)
        or type(manifest["files"][0].get("bytes")) not in (int, float)
    ):
        raise BundleError("invalid manifest")
    expected = {
        "schema": "semantic-bundle-manifest/v1",
        "contract_version": VERSION,
        "source_id": manifest.get("source_id"),
        "bundle_id": pointer["bundle_id"],
        "files": [{"path": "bundle.json", "bytes": len(data), "sha256": sha256(data)}],
    }
    if manifest != expected or sha256(data) != pointer["bundle_id"]:
        raise BundleError("bundle manifest mismatch")
    bundle = validate_bundle(
        _decode(data), source_id=source_id, require_public=require_public
    )
    if manifest["source_id"] != bundle["source"]["id"]:
        raise BundleError("manifest source mismatch")
    return {"bundle": bundle, "manifest": manifest, "pointer": pointer}


def _encode(value):
    return (
        json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    ).encode()


def write_bundle(root, bundle):
    validate_bundle(bundle)
    root = Path(root).absolute()
    if root.resolve() != root:
        raise BundleError("symlink bundle root")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    data = _encode(bundle)
    if len(data) > MAX_BYTES:
        raise BundleError("bundle too large")
    bundle_id = sha256(data)
    bundles = root / "bundles"
    bundles.mkdir(exist_ok=True, mode=0o700)
    if bundles.resolve() != bundles:
        raise BundleError("symlink bundle directory")
    directory = bundles / bundle_id
    manifest = {
        "schema": "semantic-bundle-manifest/v1",
        "contract_version": VERSION,
        "source_id": bundle["source"]["id"],
        "bundle_id": bundle_id,
        "files": [{"path": "bundle.json", "bytes": len(data), "sha256": bundle_id}],
    }
    files = (("bundle.json", data), ("manifest.json", _encode(manifest)))
    stage = bundles / (".stage-" + uuid.uuid4().hex)
    stage.mkdir(mode=0o700)
    try:
        for name, contents in files:
            with (stage / name).open("xb") as f:
                os.chmod(stage / name, 0o600)
                f.write(contents)
                f.flush()
                os.fsync(f.fileno())
        try:
            os.rename(stage, directory)
        except OSError:
            if not directory.is_dir() or directory.resolve() != directory:
                raise
            for name, contents in files:
                if _read(root, str((directory / name).relative_to(root))) != contents:
                    raise BundleError("immutable bundle overwritten") from None
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    pointer = {
        "schema": "semantic-bundle-pointer/v1",
        "bundle_id": bundle_id,
        "manifest_sha256": sha256(_encode(manifest)),
    }
    temp = root / (".current-" + uuid.uuid4().hex)
    try:
        with temp.open("xb") as f:
            os.chmod(temp, 0o600)
            f.write(_encode(pointer))
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, root / "current.json")
    finally:
        temp.unlink(missing_ok=True)
    return pointer
