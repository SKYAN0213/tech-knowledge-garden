#!/usr/bin/env python3
"""Assemble a private Drive snapshot from a completed connector raw-byte readback."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tempfile
import unicodedata
from datetime import datetime, timezone


ROOT_ID = '1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD'
ROOT_IDS = (
    ('Editions', '1cTY588ZYBPVNyuB41Tcu7OYyCqAZdSW-'),
    ('Knowledge', '1Ykx3LoF6v8qyFcPQP0D9XKNVoOqM-v0Q'),
    ('Signals', '14SbkTeQ1JMy-5PAoPwhSaFaNjwc8Ncnt'),
    ('TrendTopics', '12JauFgbLZY-HvE8kW_DPFH4mFlclWlAX'),
)
ROOT_NAMES = tuple(name for name, _ in ROOT_IDS)
SHA256 = re.compile(r'[a-f0-9]{64}\Z')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def instant(value, label):
    if not isinstance(value, str):
        raise ValueError(label + ' must be a timestamp')
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as error:
        raise ValueError(label + ' is invalid') from error
    if parsed.tzinfo is None:
        raise ValueError(label + ' needs a timezone')
    return parsed.astimezone(timezone.utc)


def relative_path(value, folder=False):
    if not isinstance(value, str) or '\\' in value or '\x00' in value:
        raise ValueError('Invalid connector path')
    path = PurePosixPath(value)
    if (path.is_absolute() or path.as_posix() != value or len(path.parts) < 2
            or path.parts[0] not in ROOT_NAMES
            or any(part in ('', '.', '..') or part.startswith('.') for part in path.parts)
            or (not folder and path.suffix != '.md')):
        raise ValueError('Connector path is outside authoring Markdown roots')
    return path


def one_parent(value, expected):
    if value != [expected]:
        raise ValueError('Connector folder parent does not match its path')


def build_snapshot(receipt, repository, receipt_bytes, now=None, max_age_seconds=600):
    if (receipt.get('schema') != 'tech-drive-connector-readback/v1'
            or receipt.get('root_folder_id') != ROOT_ID
            or receipt.get('roots') != [{'name': name, 'id': file_id} for name, file_id in ROOT_IDS]):
        raise ValueError('Connector readback has unexpected Drive scope')
    observed = instant(receipt.get('verified_at'), 'Connector readback time')
    if max_age_seconds is not None:
        current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
        if abs((current - observed).total_seconds()) > max_age_seconds:
            raise ValueError('Connector readback is stale')
    folders = receipt.get('folders')
    files = receipt.get('files')
    if (not isinstance(folders, list) or not isinstance(files, list)
            or not all(isinstance(row, dict) for row in folders + files)
            or not 1 <= len(files) <= 2000):
        raise ValueError('Connector readback needs complete folders and files')
    folder_ids = {name: file_id for name, file_id in ROOT_IDS}
    seen_ids = set(folder_ids.values())
    portable_paths = set()
    portable_folders = set()
    for row in sorted(folders, key=lambda entry: len(relative_path(entry.get('path'), folder=True).parts)):
        path = relative_path(row.get('path'), folder=True)
        name = path.as_posix()
        portable = unicodedata.normalize('NFC', name).casefold()
        parent = folder_ids.get(path.parent.as_posix())
        file_id = row.get('id')
        if (not parent or not isinstance(file_id, str) or not file_id
                or file_id in seen_ids or name in folder_ids or portable in portable_folders):
            raise ValueError('Connector folder identity is invalid')
        one_parent(row.get('parent_ids'), parent)
        folder_ids[name] = file_id
        seen_ids.add(file_id)
        portable_folders.add(portable)
    vault = repository.resolve() / 'vault'
    if vault.is_symlink():
        raise ValueError('Local vault is a symlink')
    local_paths = set()
    for root in ROOT_NAMES:
        base = vault / root
        if not base.is_dir() or base.is_symlink():
            raise ValueError('Local authoring root is missing or linked')
        for item in base.rglob('*'):
            if item.is_symlink():
                raise ValueError('Local authoring tree contains a symlink')
            if item.is_file() and item.suffix == '.md':
                local_paths.add(item.relative_to(vault).as_posix())
    result = []
    total_bytes = 0
    for row in files:
        path = relative_path(row.get('path'))
        name = path.as_posix()
        portable = unicodedata.normalize('NFC', name).casefold()
        file_id = row.get('file_id')
        size = row.get('size')
        sha = row.get('sha256')
        parent = folder_ids.get(path.parent.as_posix())
        if (not parent or not isinstance(file_id, str) or not file_id
                or file_id in seen_ids or portable in portable_paths
                or not isinstance(size, int) or isinstance(size, bool) or not 0 <= size <= 1048576
                or not isinstance(sha, str) or not SHA256.fullmatch(sha)):
            raise ValueError('Connector file identity or hash is invalid')
        one_parent(row.get('parent_ids'), parent)
        instant(row.get('modified_time'), 'Connector file modification time')
        if name not in local_paths:
            raise ValueError('Connector file is absent from the local authoring copy')
        data = (vault / name).read_bytes()
        if len(data) != size or digest(data) != sha:
            raise ValueError('Local bytes differ from the connector raw-byte readback')
        try:
            content = data.decode('utf-8')
        except UnicodeDecodeError as error:
            raise ValueError('Authoring Markdown is not UTF-8') from error
        result.append({'path': name, 'content': content, 'sha256': sha})
        total_bytes += size
        seen_ids.add(file_id)
        portable_paths.add(portable)
    if {row['path'] for row in result} != local_paths or total_bytes > 32 * 1048576:
        raise ValueError('Connector readback omits authoring files or exceeds the source limit')
    result.sort(key=lambda row: row['path'])
    return {
        'schema': 'tech-drive-source/v1',
        'transport': 'codex-drive-connector',
        'complete': True,
        'root_folder_id': ROOT_ID,
        'roots': list(ROOT_NAMES),
        'exported_at': receipt['verified_at'],
        'readback': {'schema': receipt['schema'], 'receipt_sha256': digest(receipt_bytes),
                     'source_files': len(result)},
        'files': result,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--readback', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--repository', type=Path, default=Path.cwd())
    args = parser.parse_args()
    repository = args.repository.resolve()
    private_dir = repository / '.local' / 'drive-sync'
    if (private_dir.is_symlink() or (repository / '.local').is_symlink()
            or args.output.parent.resolve() != private_dir.resolve()):
        raise ValueError('Connector snapshot output must be in private .local/drive-sync')
    raw = args.readback.read_bytes()
    snapshot = build_snapshot(json.loads(raw), repository, raw)
    data = (json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
    private_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=private_dir, delete=False) as stream:
        temp = Path(stream.name)
        os.chmod(temp, 0o600)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        os.link(temp, args.output)
    finally:
        temp.unlink()
    print(json.dumps({'path': str(args.output), 'source_files': len(snapshot['files']),
                      'snapshot_file_sha256': digest(data)}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(str(error)) from error
