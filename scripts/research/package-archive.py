#!/usr/bin/env python3
"""Create an immutable private ZIP from a verified research archive manifest."""

import argparse
import hashlib
import json
import os
import re
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


def archive_member(manifest, item):
    relative = item.get("path")
    if not isinstance(relative, str) or item.get("public") is not False:
        raise ValueError("Invalid private archive item")
    # Validate paths even before mapping ZIP names to local destinations.
    value = PurePosixPath(relative)
    if value.is_absolute() or ".." in value.parts or "\\" in relative or str(value) != relative:
        raise ValueError("Invalid archive item path")
    if item.get("drive_root") == "Sources":
        if not re.fullmatch(r"documents/[a-f0-9]{20}/[a-f0-9]{64}/body\.bin", relative):
            raise ValueError("Source body path is outside the immutable source store")
        return "Sources/LocalAI/" + relative.removeprefix("documents/")
    if item.get("drive_root") != "Research":
        raise ValueError("Archive item has an unsupported private Drive root")
    if manifest.get("schema") == "research-archive/v2":
        runs = manifest.get("bound_runs")
        parses = manifest.get("parse_ids")
        if (not isinstance(runs, list) or not 1 <= len(runs) <= 32 or
                len(set(runs)) != len(runs) or any(not re.fullmatch(r"[A-Za-z0-9_-]+", s) for s in runs) or
                not isinstance(parses, list) or len(set(parses)) != len(parses) or
                any(not re.fullmatch(r"[a-f0-9]{64}", s) for s in parses)):
            raise ValueError("Invalid archive dependency scope")
        if not (any(relative.startswith(f"runs/{run}/") for run in runs) or
                relative in {f"parses/{parse}/parse.json" for parse in parses}):
            raise ValueError("Research item is outside its bound dependencies")
    elif not relative.startswith(f"runs/{manifest['run_id']}/"):
        raise ValueError("Research item is outside its bound run")
    return "Research/LocalAI/" + relative


def create_package(root, run_id):
    if not run_id or any(ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for ch in run_id):
        raise ValueError("Invalid research run ID")
    root = root.resolve(strict=True)
    manifest_path = safe_file(root, f"runs/{run_id}/archive-manifest.json")
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest.get("schema") not in {"research-archive/v1", "research-archive/v2"} or manifest.get("run_id") != run_id:
        raise ValueError("Research archive manifest does not match requested run")
    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError("Research archive has no files")
    if (len(files) > 2000 or
        any(not isinstance(item, dict) or type(item.get("bytes")) is not int or item["bytes"] < 0 for item in files) or
        sum(item["bytes"] for item in files) > 256 * 1024 ** 2):
        raise ValueError("Archive file or byte budget exceeded")

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
        member = archive_member(manifest, item)
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
    if manifest.get("schema") == "research-archive/v2":
        package_manifest["archive_manifest"] = manifest
        entries.append((f"Research/LocalAI/runs/{run_id}/archive-manifest.json", manifest_bytes, None))
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


def restore_package(root, package, destination, expected_sha256, source_manifest=None):
    root = root.resolve(strict=True)
    source = safe_file(root, package)
    target = safe_file(root, destination)
    if target.exists():
        raise ValueError("Restore destination already exists; use a new private directory")
    if source.stat().st_size > 256 * 1024 ** 2:
        raise ValueError("Archive package size budget exceeded")
    data = source.read_bytes()
    if not re.fullmatch(r"[a-f0-9]{64}", expected_sha256 or "") or sha256(data) != expected_sha256:
        raise ValueError("Archive package SHA-256 mismatch")
    outputs = []
    with zipfile.ZipFile(source) as archive:
        infos = archive.infolist()
        names = [info.filename for info in infos]
        if len(set(names)) != len(names) or len(names) > 2002 or sum(i.file_size for i in infos) > 256 * 1024 ** 2:
            raise ValueError("Archive member duplication or size budget exceeded")
        if any(i.is_dir() or (i.external_attr >> 16) & 0o170000 not in (0, 0o100000) for i in infos):
            raise ValueError("Unsupported archive member type")
        manifests = [n for n in names if re.fullmatch(r"Research/LocalAI/runs/[A-Za-z0-9_-]+/archive-package-manifest\.json", n)]
        if len(manifests) != 1:
            raise ValueError("One package manifest required")
        packed = json.loads(archive.read(manifests[0]))
        manifest = packed.get("archive_manifest")
        if packed.get("schema") != "research-archive-package/v1":
            raise ValueError("Invalid archive package manifest")
        if manifest is None and source_manifest:
            # Ordinary v1 packages pin the original manifest hash but do not
            # embed its bytes. An explicit exact manifest is required; never
            # reconstruct it from file names or infer dependency closure.
            raw = safe_file(root, source_manifest).read_bytes()
            if sha256(raw) != packed.get("source_manifest_sha256"):
                raise ValueError("Archive source manifest mismatch")
            manifest = json.loads(raw)
            if manifest.get("schema") != "research-archive/v1":
                raise ValueError("External manifest is only supported for ordinary v1 archives")
            embedded_manifest = False
        elif manifest is not None and not source_manifest:
            embedded_manifest = True
        else:
            raise ValueError("Restore requires a portable dependency archive")
        if manifest.get("schema") not in {"research-archive/v1", "research-archive/v2"}:
            raise ValueError("Unsupported restore archive schema")
        dependency_closed = manifest["schema"] == "research-archive/v2"
        run_id = manifest.get("run_id")
        if not isinstance(run_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", run_id) or packed.get("run_id") != run_id:
            raise ValueError("Invalid restore run identity")
        if dependency_closed and manifest.get("source_run") not in manifest.get("bound_runs", []):
            raise ValueError("Source run is outside archive dependency scope")
        if manifests[0] != f"Research/LocalAI/runs/{run_id}/archive-package-manifest.json" or packed.get("files") != manifest.get("files"):
            raise ValueError("Archive package manifest disagrees with dependency manifest")
        raw_name = f"Research/LocalAI/runs/{run_id}/archive-manifest.json"
        if embedded_manifest:
            raw = archive.read(raw_name)
        if sha256(raw) != packed.get("source_manifest_sha256") or json.loads(raw) != manifest:
            raise ValueError("Archive source manifest mismatch")
        files = manifest.get("files")
        if not isinstance(files, list) or not files:
            raise ValueError("Research archive has no files")
        expected_names = {manifests[0]} | ({raw_name} if embedded_manifest else set())
        local_paths = set()
        for item in files:
            member = archive_member(manifest, item)
            if member in expected_names or member == raw_name or item["path"] in local_paths:
                raise ValueError("Duplicate archive dependency path")
            expected_names.add(member)
            local_paths.add(item["path"])
            body = archive.read(member)
            if len(body) != item.get("bytes") or sha256(body) != item.get("sha256"):
                raise ValueError("Archive restored member hash mismatch: " + member)
            safe_file(target, item["path"])
            outputs.append((item["path"], body))
        if expected_names != set(names):
            raise ValueError("Unlisted archive members")
        outputs.append((f"runs/{run_id}/archive-manifest.json", raw))
        outputs.append((f"runs/{run_id}/archive-package-manifest.json", archive.read(manifests[0])))
    # Validate the entire package before creating any destination files.
    target.parent.mkdir(parents=True, exist_ok=True)
    target.mkdir(mode=0o700)
    for relative, body in outputs:
        file = safe_file(target, relative)
        file.parent.mkdir(parents=True, exist_ok=True)
        with file.open("xb") as handle:
            os.chmod(file, 0o600)
            handle.write(body)
            handle.flush()
            os.fsync(handle.fileno())
    receipt = {"schema": "research-archive-restore/v1", "run_id": run_id,
               "package_sha256": expected_sha256, "files": len(outputs),
               "bound_runs": manifest["bound_runs"] if dependency_closed else [run_id],
               "archive_schema": manifest["schema"], "dependency_closed": dependency_closed,
               "source_manifest_sha256": sha256(raw), "destination": destination,
               "network_used": False, "candidate_published": False, "drive_verified": False}
    with safe_file(target, "restore-receipt.json").open("x") as handle:
        json.dump(receipt, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return receipt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--run")
    parser.add_argument("--package")
    parser.add_argument("--restore-to")
    parser.add_argument("--expected-sha256")
    parser.add_argument("--source-manifest", help="Exact original manifest for ordinary v1 archive restoration")
    args = parser.parse_args()
    if args.package or args.restore_to or args.expected_sha256 or args.source_manifest:
        if args.run or not (args.package and args.restore_to and args.expected_sha256):
            parser.error("Restore requires --package, --restore-to and --expected-sha256, without --run")
        result = restore_package(args.root, args.package, args.restore_to, args.expected_sha256, args.source_manifest)
    elif args.run:
        result = create_package(args.root, args.run)
    else:
        parser.error("--run or restore inputs required")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
