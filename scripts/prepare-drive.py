#!/usr/bin/env python3
"""Prepare a reproducible Drive handoff; uploads use the connected Drive tools."""
import argparse
import concurrent.futures
import csv
import hashlib
import io
import ipaddress
import json
from pathlib import Path
import shutil
import socket
import urllib.request
import urllib.error
from urllib.parse import urlsplit
import zipfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.local/drive-sync'
STAGE = WORK / 'staging'
DEST = '1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD'

def now():
    return datetime.now(timezone.utc).isoformat()

def sha(data):
    return hashlib.sha256(data).hexdigest()

def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

def files(base):
    return sorted(p for p in base.rglob('*') if p.is_file() and not p.is_symlink() and p.name != '.DS_Store')

def public_url(url):
    u = urlsplit(url)
    if u.scheme not in ('http', 'https') or not u.hostname or u.username or u.password:
        raise ValueError('not a public HTTP URL')
    for address in socket.getaddrinfo(u.hostname, u.port or (443 if u.scheme == 'https' else 80)):
        if not ipaddress.ip_address(address[4][0]).is_global:
            raise ValueError('non-public address')

class PublicRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        public_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def collect(row):
    cache = WORK / 'source-cache'
    cache.mkdir(parents=True, exist_ok=True)
    meta = cache / (row['source_id'] + '.json')
    if meta.exists():
        return {**row, **json.loads(meta.read_text())}
    result = {'attempted_at': now(), 'status': 'failed', 'historical_snapshot': False}
    try:
        public_url(row['url'])
        request = urllib.request.Request(row['url'], headers={'User-Agent': 'TechKnowledgeArchive/1.0 (personal research; single retrieval)', 'Accept': 'text/html,application/pdf,application/json,application/xml,text/plain,*/*;q=0.5'})
        with urllib.request.build_opener(PublicRedirect()).open(request, timeout=15) as response:
            result.update(http_status=response.status, final_url=response.url, content_type=response.headers.get('Content-Type', ''), last_modified=response.headers.get('Last-Modified'), etag=response.headers.get('ETag'))
            body = response.read(5 * 1024 * 1024 + 1)
            if len(body) > 5 * 1024 * 1024:
                result.update(status='too_large', error='Response exceeds 5 MiB capture limit; no partial snapshot stored')
            else:
                suffix = '.pdf' if 'pdf' in result['content_type'] else '.html' if 'html' in result['content_type'] else '.json' if 'json' in result['content_type'] else '.txt'
                filename = row['source_id'] + suffix
                (cache / filename).write_bytes(body)
                result.update(status='captured_unreviewed', snapshot=filename, bytes=len(body), sha256=sha(body))
    except Exception as exc:
        result.update(error=str(exc)[:500])
        if isinstance(exc, urllib.error.HTTPError):
            result['http_status'] = exc.code
    write_json(meta, result)
    return {**row, **result}

def archive(destination, base, selected=None):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in selected if selected is not None else files(base):
            z.write(p, p.relative_to(base).as_posix())
    with zipfile.ZipFile(destination) as z:
        assert z.testzip() is None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--collect', action='store_true')
    args = parser.parse_args()
    STAGE.mkdir(parents=True, exist_ok=True)
    for p in files(ROOT / 'vault'):
        target = STAGE / p.relative_to(ROOT / 'vault')
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, target)
    for p in files(ROOT / '.local/research'):
        target = STAGE / 'Research' / p.relative_to(ROOT / '.local/research')
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, target)
    legacy_base = Path('/Users/shinjh/Library/Mobile Documents/iCloud~md~obsidian/Documents')
    legacy = list(legacy_base.glob('*/Tech Knowledge'))
    if len(legacy) == 1:
        archive(STAGE / 'Archive/Imports/legacy-icloud-tech-knowledge.zip', legacy[0])
    elif len(legacy) > 1:
        raise RuntimeError('Multiple legacy vaults; disambiguation required')
    historical = [p for p in files(ROOT / '.local') if WORK not in p.parents]
    archive(STAGE / 'Archive/Imports/local-research-and-migration-evidence.zip', ROOT / '.local', historical)
    archive(STAGE / 'Exports/github-digest.zip', ROOT / 'digest')
    archive(STAGE / 'Operations/project-documentation.zip', ROOT, files(ROOT / 'docs') + [ROOT / 'AGENTS.md', ROOT / 'README.md'])
    catalog = json.loads((ROOT / 'data/catalog.json').read_text())
    notes = [(p.relative_to(STAGE).as_posix(), p.read_text(errors='replace')) for p in files(STAGE) if p.suffix == '.md']
    rows = [{'source_id': sha(url.encode())[:20], 'url': url, 'referenced_by': [path for path, content in notes if url in content], 'status': 'not_attempted'} for url in sorted(set(catalog['known_sources']))]
    if args.collect:
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            rows = list(pool.map(collect, rows))
    else:
        for row in rows:
            cached = WORK / 'source-cache' / (row['source_id'] + '.json')
            if cached.exists():
                row.update(json.loads(cached.read_text()))
    write_json(STAGE / 'Sources/source-register.json', {'generated_at': now(), 'capture_is_current_not_historical': True, 'sources': rows})
    with (STAGE / 'Sources/source-register.csv').open('w') as stream:
        writer = csv.DictWriter(stream, fieldnames=['source_id', 'url', 'status', 'attempted_at', 'http_status', 'content_type', 'snapshot', 'sha256', 'error', 'referenced_by'], extrasaction='ignore')
        writer.writeheader()
        for row in rows:
            writer.writerow({**row, 'referenced_by': '; '.join(row['referenced_by'])})
    if (WORK / 'source-cache').exists():
        archive(STAGE / 'Sources/source-snapshots.zip', WORK / 'source-cache')
    (STAGE / '00 START HERE.md').write_text('''# Tech Knowledge 자료실

Google Drive의 Projects / Tech Knowledge가 최종 보관 위치입니다. 로컬 vault는 편집·검증·웹 생성용 작업 사본입니다. Drive에서 수정한 파일은 로컬에 먼저 반영하고, 충돌을 해결한 뒤 업로드합니다. 자동 양방향 동기화는 아닙니다.

| 폴더 | 자료 |
|---|---|
| Editions | 날짜별 브리핑 원고 |
| Briefings | 읽기용 일일·누적 브리핑 |
| News | 사건별 기사 |
| Knowledge / Knowledge Maps | 전문 개념·연결 지도 |
| Signals / TrendTopics / Trends | 관측·누적 판단·생성된 추세 |
| Sources | 원문 URL 목록, 관련 노트, 수집 상태, 원문 스냅샷 ZIP |
| Research | 기존 취재 기록과 수집 자료 |
| Archive | 과거 자료; Imports의 ZIP은 이전 iCloud와 로컬 취재·이전 증거 전체 |
| Exports | GitHub 요약본 ZIP |
| Operations | 운영 문서와 파일 이전 목록 |

원래 상대 경로와 Markdown 내용을 유지했습니다. Obsidian 링크는 보관함 전체를 내려받아 열 때 사용합니다. ZIP은 폴더 내부 경로를 유지한 보존 자료입니다.

source-register의 captured_unreviewed는 HTTP 응답 저장만 확인한 상태입니다. 내용의 유효성·게시 시각·과거 기사와의 동일성을 검토했다는 뜻은 아닙니다. 실패·차단·용량 초과는 별도로 남기며, 저장된 현재 응답을 과거 취재 당시 원문으로 표시하지 않습니다. 원문 수집물은 개인 Drive 보관용이며 웹 공개 산출물에 넣지 않습니다.
''')
    if (ROOT / 'docs/DRIVE_STORAGE.md').exists():
        shutil.copy2(ROOT / 'docs/DRIVE_STORAGE.md', STAGE / 'Operations/DRIVE_STORAGE.md')
    inventory = []
    for p in files(STAGE):
        if p.name in ('upload-manifest.json', 'migration-receipt.json'):
            continue
        data = p.read_bytes()
        inventory.append({'path': p.relative_to(STAGE).as_posix(), 'local_path': str(p), 'bytes': len(data), 'sha256': sha(data), 'md5': hashlib.md5(data).hexdigest()})
    manifest = {'schema': 'tech-drive-handoff/v1', 'generated_at': now(), 'destination_folder_id': DEST, 'files': inventory}
    write_json(WORK / 'upload-manifest.json', manifest)
    write_json(STAGE / 'Operations/upload-manifest.json', manifest)
    print(json.dumps({'files': len(inventory), 'sources': len(rows), 'captured': sum(r['status'] == 'captured_unreviewed' for r in rows), 'manifest': str(WORK / 'upload-manifest.json')}, ensure_ascii=False))

if __name__ == '__main__':
    main()
