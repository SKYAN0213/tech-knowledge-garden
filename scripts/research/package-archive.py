#!/usr/bin/env python3
"""Create an immutable private ZIP from a verified research archive manifest."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import tempfile
import zipfile


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def safe_file(root, relative):
    value = PurePosixPath(relative)
    if value.is_absolute() or not value.parts or ".." in value.parts:
        raise ValueError("Archive path is not root-relative")
    target = root.joinpath(*value.parts)
    if not target.resolve().is_relative_to(root) or target.is_symlink():
        raise ValueError("Archive path escapes or links outside the private root")
    current = root
    for part in value.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("Symlink in private archive path")
    return target


def create_package(root, run_id):
    if not run_id or any(ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for ch in run_id):
        raise ValueError("Invalid research run ID")
    root = root.resolve(strict=True)
    manifest_path = safe_file(root, f"runs/{run_id}/archive-manifest.json")
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest.get("schema") != "research-archive/v1" or manifest.get("run_id") != run_id:
        raise ValueError("Research archive manifest does not match requested run")
    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError("Research archive has no files")

    entries = []
    names = set()
    for item in files:
        relative = item.get("path")
        if not isinstance(relative, str):
            raise ValueError("Archive item is missing its local path")
        source = safe_file(root, relative)
        data = source.read_bytes()
        if len(data) != item.get("bytes") or sha256(data) != item.get("sha256"):
            raise ValueError("Archive input changed after manifest: " + relative)
        if item.get("public") is not False:
            raise ValueError("Public or unclassified data cannot enter a private research bundle")
        if item.get("drive_root") == "Sources":
            if not relative.startswith("documents/"):
                raise ValueError("Source body path is outside the immutable source store")
            member = "Sources/LocalAI/" + relative.removeprefix("documents/")
        elif item.get("drive_root") == "Research":
            prefix = f"runs/{run_id}/"
            if not relative.startswith(prefix):
                raise ValueError("Research item is outside its bound run")
            member = "Research/LocalAI/" + relative
        else:
            raise ValueError("Archive item has an unsupported private Drive root")
        if member in names:
            raise ValueError("Duplicate archive member path")
        names.add(member)
        entries.append((member, data, item))

    package_manifest = {
        "schema": "research-archive-package/v1",
        "run_id": run_id,
        "source_manifest_sha256": sha256(manifest_bytes),
        "files": [item for _, _, item in entries],
    }
    manifest_member = f"Research/LocalAI/runs/{run_id}/archive-package-manifest.json"
    if manifest_member in names:
        raise ValueError("Archive manifest member collides with a source file")
    entries.append((manifest_member, (json.dumps(package_manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode(), None))

    destination = root / "archive-staging" / run_id / "research-source-bundle.zip"
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=destination.parent, prefix=".bundle-", delete=False) as handle:
        temporary = Path(handle.name)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for member, data, _ in sorted(entries, key=lambda entry: entry[0]):
                info = zipfile.ZipInfo(member, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100600 << 16
                archive.writestr(info, data)
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None:
                raise ValueError("Generated private research bundle failed ZIP integrity check")
        data = temporary.read_bytes()
        result = {
            "schema": "research-archive-package-receipt/v1",
            "run_id": run_id,
            "path": str(destination.relative_to(root)),
            "bytes": len(data),
            "sha256": sha256(data),
            "members": len(entries),
            "source_versions": sum(1 for item in files if item.get("drive_root") == "Sources"),
            "manifest_sha256": sha256(manifest_bytes),
            "drive_verified": False,
        }
        if destination.exists():
            if destination.is_symlink() or sha256(destination.read_bytes()) != result["sha256"]:
                raise ValueError("Research package already exists with different bytes; use a new run ID")
        else:
            with temporary.open("rb") as handle:
                os.fsync(handle.fileno())
            try:
                os.link(temporary, destination)
            except FileExistsError:
                if sha256(destination.read_bytes()) != result["sha256"]:
                    raise ValueError("Research package appeared with different bytes; use a new run ID")
        return result
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--run", required=True)
    args = parser.parse_args()
    print(json.dumps(create_package(args.root, args.run), ensure_ascii=False))


if __name__ == "__main__":
    main()
