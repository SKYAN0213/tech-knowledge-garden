#!/usr/bin/env python3
"""Validate a complete Drive export before changing any website source."""
import argparse
import hashlib
import json
import os
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

def synchronize(snapshot, repository, apply=False):
    incoming = validate(snapshot)
    repository = repository.resolve()
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

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--snapshot', type=Path)
    parser.add_argument('--repository', type=Path, default=Path.cwd())
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--verify-working-copy', action='store_true')
    args = parser.parse_args()
    if args.verify_working_copy:
        print(json.dumps(verify_working_copy(args.repository)))
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
        exported = datetime.fromisoformat(snapshot.get('exported_at', '').replace('Z', '+00:00'))
        if exported.tzinfo is None or abs((datetime.now(timezone.utc) - exported).total_seconds()) > 600:
            raise ValueError('Drive export is stale; no source changes applied')
    result = synchronize(snapshot, args.repository, args.apply)
    print(json.dumps(result, ensure_ascii=False))
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write('changed=' + str(result['changed']).lower() + '\n')

if __name__ == '__main__':
    main()
