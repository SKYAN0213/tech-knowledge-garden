#!/usr/bin/env python3
"""Validate a complete Drive export before changing any website source."""
import argparse
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path, PurePosixPath
import tempfile
import unicodedata
from datetime import datetime, timezone
import urllib.request
from urllib.parse import urlsplit

ROOT_ID = '1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD'
ROOTS = ('Editions', 'Knowledge', 'Signals', 'TrendTopics')

def digest(data):
    return hashlib.sha256(data).hexdigest()

def parse_drive_timestamp(value):
    if not isinstance(value, str):
        raise ValueError('Drive timestamp must be a string')
    if value.endswith(' UTC'):
        value = value[:-4] + '+00:00'
    return datetime.fromisoformat(value.replace('Z', '+00:00'))

def validate(snapshot):
    if snapshot.get('schema') != 'tech-drive-source/v1' or snapshot.get('complete') is not True:
        raise ValueError('Drive export is incomplete or invalid')
    if snapshot.get('root_folder_id') != ROOT_ID or snapshot.get('roots') != list(ROOTS):
        raise ValueError('Unexpected Drive source scope')
    rows = snapshot.get('files')
    if not isinstance(rows, list) or not 1 <= len(rows) <= 2000:
        raise ValueError('Invalid source count')
    result = {}
    portable_paths = set()
    for row in rows:
        path = row['path']
        p = PurePosixPath(path)
        if (not isinstance(path, str) or '\\' in path or '\x00' in path or p.is_absolute()
                or p.as_posix() != path or any(part in ('', '.', '..') or part.startswith('.') for part in p.parts)
                or len(p.parts) < 2 or p.parts[0] not in ROOTS or p.suffix != '.md'):
            raise ValueError('Source path is outside the permitted Markdown folders')
        portable = unicodedata.normalize('NFC', path).casefold()
        if path in result or portable in portable_paths:
            raise ValueError('Duplicate source path')
        portable_paths.add(portable)
        data = row['content'].encode('utf-8')
        if len(data) > 1048576 or digest(data) != row.get('sha256'):
            raise ValueError('Source content hash or size is invalid')
        result[path] = data
    if {p.split('/')[0] for p in result} != set(ROOTS):
        raise ValueError('Missing or empty source root')
    if sum(map(len, result.values())) > 32 * 1048576:
        raise ValueError('Snapshot exceeds total source limit')
    return result

def prepare_source_mapping(snapshot, incoming, repository, readback, readback_bytes, now=None):
    """Bind private file links to the same complete raw readback as the snapshot."""
    if snapshot.get('transport') != 'codex-drive-connector' or not isinstance(readback_bytes, bytes):
        raise ValueError('Source mapping requires a connector snapshot and raw readback bytes')
    if json.loads(readback_bytes) != readback:
        raise ValueError('Connector readback bytes differ from the supplied receipt')
    spec = importlib.util.spec_from_file_location(
        'connector_snapshot', Path(__file__).with_name('build-connector-snapshot.py'))
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    verified = builder.build_snapshot(readback, repository, readback_bytes, now=now, source_contents=incoming)
    if snapshot.get('readback') != verified['readback'] or snapshot.get('exported_at') != verified['exported_at']:
        raise ValueError('Connector readback is not bound to this source snapshot')
    target = repository / '.local/drive-sync/receipt.json'
    if any(path.is_symlink() for path in (repository / '.local', target.parent, target)):
        raise ValueError('Private Drive mapping path is a symlink')
    original = target.read_bytes() if target.exists() else None
    prior = json.loads(original) if original is not None else {
        'schema': 'tech-drive-receipt/v1', 'destination_folder_id': ROOT_ID, 'folders': {}, 'files': []}
    if prior.get('schema') != 'tech-drive-receipt/v1' or prior.get('destination_folder_id') != ROOT_ID:
        raise ValueError('Private Drive mapping has unexpected scope')
    rows = prior.get('files')
    folders = prior.get('folders')
    if not isinstance(rows, list) or not isinstance(folders, dict):
        raise ValueError('Private Drive mapping needs files and folders')
    by_path = {}
    identities = {}
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get('path'), str) or not row.get('id'):
            raise ValueError('Private Drive mapping has an invalid file identity')
        if row['path'] in by_path or row['id'] in identities:
            raise ValueError('Private Drive mapping has duplicate paths or file IDs')
        by_path[row['path']] = row
        identities[row['id']] = row['path']
    actual_folders = dict(builder.ROOT_IDS)
    actual_folders.update({row['path']: row['id'] for row in readback['folders']})
    for path, file_id in actual_folders.items():
        if path in folders and folders[path] != file_id:
            raise ValueError('Drive folder identity changed: ' + path)
    updated, added = [], []
    for row in readback['files']:
        path, file_id, parent_id = row['path'], row['file_id'], row['parent_ids'][0]
        if not re.fullmatch(r'[A-Za-z0-9_-]+', file_id):
            raise ValueError('Drive file ID is not usable as a link: ' + path)
        old = by_path.get(path)
        if old and (old['id'] != file_id or old.get('parent_id') != parent_id):
            raise ValueError('Drive source identity or parent changed: ' + path)
        if file_id in identities and identities[file_id] != path:
            raise ValueError('Drive file ID is already mapped to another path: ' + path)
        current = dict(old or {})
        current.update(path=path, id=file_id, parent_id=parent_id,
                       sha256=row['sha256'], bytes=row['size'], modified_time=row['modified_time'])
        # Keep a stable canonical link; an old URL must not point to another file.
        current['url'] = 'https://drive.google.com/file/d/' + file_id + '/view?usp=drivesdk'
        if not old:
            added.append(path)
        elif current != old:
            updated.append(path)
        by_path[path] = current
    removed = sorted(path for path in by_path if path.split('/')[0] in ROOTS and path not in incoming)
    for path in removed:
        del by_path[path]
    prior['folders'] = {**folders, **actual_folders}
    prior['files'] = [by_path[path] for path in sorted(by_path)]
    proof = {'verified_at': readback['verified_at'], 'receipt_sha256': digest(readback_bytes),
             'source_files': len(incoming), 'projection_files_refreshed': False}
    # The top-level receipt also contains archive/projection rows. Its old
    # verification timestamp remains untouched; only these four roots are fresh.
    prior['authoring_source_mapping'] = proof
    encoded = (json.dumps(prior, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    return target, original, encoded, {'changed': original != encoded, **proof,
                                      'updated_paths': sorted(updated), 'added_paths': sorted(added),
                                      'removed_paths': removed}

def synchronize(snapshot, repository, apply=False, readback=None, readback_bytes=None, now=None):
    incoming = validate(snapshot)
    repository = repository.resolve()
    mapping = None
    if readback is not None or readback_bytes is not None:
        mapping = prepare_source_mapping(snapshot, incoming, repository, readback, readback_bytes, now=now)
    vault = repository / 'vault'
    if vault.is_symlink():
        raise ValueError('Vault must not be a symlink')
    existing = {}
    for root in ROOTS:
        folder = vault / root
        if folder.is_symlink():
            raise ValueError('Source root is a symlink')
        for path in folder.rglob('*'):
            if path.is_symlink():
                raise ValueError('Source tree contains a symlink')
            if path.is_file() and path.suffix == '.md':
                existing[path.relative_to(vault).as_posix()] = path.read_bytes()
    for name in incoming:
        target = vault / name
        if not target.resolve().is_relative_to(vault.resolve()):
            raise ValueError('Source path escapes the vault')
        for parent in target.parents:
            if parent == repository:
                break
            if parent.is_symlink():
                raise ValueError('Source ancestor is a symlink')
    deleted = sorted(set(existing) - set(incoming))
    if existing and len(deleted) > max(3, len(existing) // 4):
        raise ValueError('Large deletion requires manual review; nothing was changed')
    changed = sorted(p for p, data in incoming.items() if existing.get(p) != data)
    hashes = {p: digest(data) for p, data in sorted(incoming.items())}
    snapshot_hash = digest(json.dumps(hashes, ensure_ascii=False, separators=(',', ':')).encode())
    state_path = repository / 'data/drive-source-state.json'
    prior = json.loads(state_path.read_text()) if state_path.exists() else {}
    transport = snapshot.get('transport', 'apps-script-webapp')
    state_changed = prior.get('snapshot_sha256') != snapshot_hash or prior.get('transport') != transport
    result = {'changed': bool(changed or deleted or state_changed), 'updated': changed,
              'deleted': deleted, 'source_files': len(incoming), 'snapshot_sha256': snapshot_hash}
    if mapping:
        result['source_mapping'] = mapping[3]
    if apply and mapping:
        target, original, _, _ = mapping
        if (target.read_bytes() if target.exists() else None) != original:
            raise ValueError('Private Drive mapping changed during synchronization')
    if apply and result['changed']:
        # All paths, content hashes, scope and deletion bounds have passed before any write.
        for name in changed:
            target = vault / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as stream:
                stream.write(incoming[name])
                temporary = Path(stream.name)
            temporary.replace(target)
        for name in deleted:
            (vault / name).unlink()
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state = {'schema': 'tech-drive-source-state/v1', 'source': 'google-drive',
                 'transport': transport,
                 'root_folder_id': ROOT_ID, 'roots': list(ROOTS),
                 'snapshot_sha256': snapshot_hash, 'source_files': len(incoming),
                 'exported_at': snapshot.get('exported_at'), 'hashes': hashes}
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n')
    # Refresh verified links even when no authoring bytes or public state changed.
    if apply and mapping and mapping[3]['changed']:
        target, _, encoded, _ = mapping
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as stream:
            temporary = Path(stream.name)
            os.chmod(temporary, 0o600)
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    return result

def verify_working_copy(repository):
    state_path = repository / 'data/drive-source-state.json'
    if not state_path.exists():
        raise ValueError('Read and synchronize Drive sources before publishing')
    state = json.loads(state_path.read_text())
    actual = {}
    for root in ROOTS:
        for file in (repository / 'vault' / root).rglob('*.md'):
            if file.is_symlink():
                raise ValueError('Source symlink is not publishable')
            actual[file.relative_to(repository / 'vault').as_posix()] = digest(file.read_bytes())
    if actual != state['hashes']:
        raise ValueError('Local source differs from the verified Drive snapshot; save to Drive and read back first')
    return {'verified_source_files': len(actual), 'snapshot_sha256': state['snapshot_sha256']}

def verify_source_snapshot(snapshot, repository, snapshot_bytes, now=None, max_age_seconds=600):
    """Check a full Drive export against the local authoring tree without changing it."""
    try:
        exported = parse_drive_timestamp(snapshot.get('exported_at', ''))
    except (TypeError, ValueError) as error:
        raise ValueError('Drive export has no valid timestamp') from error
    if exported.tzinfo is None:
        raise ValueError('Drive export timestamp must include a timezone')
    if max_age_seconds is not None:
        current = now or datetime.now(timezone.utc)
        if abs((current - exported).total_seconds()) > max_age_seconds:
            raise ValueError('Drive export is stale; no daily plan created')
    result = synchronize(snapshot, repository, apply=False)
    if result['updated'] or result['deleted']:
        raise ValueError('Local source differs from the supplied Drive export')
    return {
        'source_files': result['source_files'],
        'snapshot_sha256': result['snapshot_sha256'],
        'snapshot_file_sha256': digest(snapshot_bytes),
        'exported_at': snapshot['exported_at'],
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--snapshot', type=Path)
    parser.add_argument('--readback', type=Path,
                        help='Refresh private Drive links from the exact connector raw-readback receipt')
    parser.add_argument('--repository', type=Path, default=Path.cwd())
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--verify-working-copy', action='store_true')
    parser.add_argument('--verify-source-snapshot', action='store_true')
    parser.add_argument('--allow-stale-snapshot', action='store_true')
    args = parser.parse_args()
    if args.readback and (not args.snapshot or args.verify_working_copy or args.verify_source_snapshot):
        raise ValueError('--readback requires snapshot synchronization, not verification-only mode')
    if args.verify_working_copy:
        print(json.dumps(verify_working_copy(args.repository)))
        return
    if args.verify_source_snapshot:
        if not args.snapshot:
            raise ValueError('A complete Drive snapshot file is required')
        raw = args.snapshot.read_bytes()
        print(json.dumps(verify_source_snapshot(
            json.loads(raw), args.repository, raw,
            max_age_seconds=None if args.allow_stale_snapshot else 600,
        ), ensure_ascii=False))
        return
    if args.snapshot:
        snapshot = json.loads(args.snapshot.read_text())
    else:
        endpoint = os.environ.get('DRIVE_EXPORT_URL', '')
        parsed = urlsplit(endpoint)
        if parsed.scheme != 'https' or parsed.netloc != 'script.google.com' or not parsed.path.startswith('/macros/s/') or not parsed.path.endswith('/exec') or parsed.query:
            raise ValueError('Configure DRIVE_EXPORT_URL with the deployed Apps Script /exec URL')
        with urllib.request.urlopen(endpoint, timeout=180) as response:
            raw = response.read(40 * 1048576 + 1)
        if len(raw) > 40 * 1048576:
            raise ValueError('Drive export response is too large')
        snapshot = json.loads(raw)
        exported = parse_drive_timestamp(snapshot.get('exported_at', ''))
        if exported.tzinfo is None or abs((datetime.now(timezone.utc) - exported).total_seconds()) > 600:
            raise ValueError('Drive export is stale; no source changes applied')
    readback_bytes = args.readback.read_bytes() if args.readback else None
    readback = json.loads(readback_bytes) if readback_bytes is not None else None
    result = synchronize(snapshot, args.repository, args.apply, readback=readback, readback_bytes=readback_bytes)
    print(json.dumps(result, ensure_ascii=False))
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write('changed=' + str(result['changed']).lower() + '\n')

if __name__ == '__main__':
    try:
        main()
    except ValueError as error:
        raise SystemExit(str(error)) from error
