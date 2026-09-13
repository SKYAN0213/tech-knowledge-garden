#!/usr/bin/env python3
"""Archive the deployed website's data and readable tables in the Drive handoff."""
import csv
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
from datetime import datetime, timezone
from urllib.parse import urljoin
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.local/drive-sync'
BASE = 'https://skyan0213.github.io/tech-knowledge-garden/'
ASSETS = ['reader-index.json', 'knowledge-graph.json', 'static/contentIndex.json', 'briefing.xml']

def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

def table(path, columns, rows):
    with path.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(columns)
        for row in rows:
            writer.writerow([json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v for v in row])

def main():
    WORK.mkdir(parents=True, exist_ok=True)
    destination = WORK / 'staging/WebsiteData'
    with tempfile.TemporaryDirectory(dir=WORK) as temporary:
        output = Path(temporary)
        provenance = []
        values = {}
        for asset in ASSETS:
            url = urljoin(BASE, asset)
            with urllib.request.urlopen(url, timeout=30) as response:
                data = response.read(16 * 1024 * 1024 + 1)
                if len(data) > 16 * 1024 * 1024:
                    raise RuntimeError('Website asset exceeds archive limit: ' + asset)
                if asset.endswith('.json'):
                    values[asset] = json.loads(data)
                else:
                    ET.fromstring(data)
                name = asset.replace('static/', '')
                (output / name).write_bytes(data)
                local = ROOT / 'public' / asset
                provenance.append({'file': name, 'origin': 'live-website', 'url': url,
                    'retrieved_at': datetime.now(timezone.utc).isoformat(),
                    'http_status': response.status, 'bytes': len(data),
                    'sha256': hashlib.sha256(data).hexdigest(),
                    'etag': response.headers.get('ETag'),
                    'last_modified': response.headers.get('Last-Modified'),
                    'matches_local_build_bytes': local.exists() and local.read_bytes() == data})
        pages = values['reader-index.json']
        graph = values['knowledge-graph.json']
        content = values['static/contentIndex.json']
        assert isinstance(pages, list) and isinstance(content, dict)
        assert len({p['slug'] for p in pages}) == len(pages)
        assert set(content) == {p['slug'] for p in pages}, 'Deployed search indexes disagree; retry after deployment completes'
        assert all(content[p['slug']] == p for p in pages), 'Deployed search rows disagree; retry after deployment completes'
        nodes = graph['nodes']; edges = graph['edges']; articles = graph['articles']
        ids = {n['id'] for n in nodes}
        assert len(ids) == len(nodes)
        assert all(e['source'] in ids and e['target'] in ids for e in edges)
        assert all(set(a.get('termIds', [])) <= ids for a in articles)
        assert all(a['slug'] in content for a in articles)
        assert all(n['slug'] in content for n in nodes)
        receipt = json.loads((WORK / 'receipt.json').read_text())
        drive = {f['path']: f['url'] for f in receipt['files']}
        local_notes = json.loads((ROOT / '.local/site-notes.json').read_text())
        paths = {n['slug']: n['path'] + '.md' for n in local_notes}
        def note(slug):
            path = paths.get(slug, '')
            return [path, drive.get(path, '')]
        table(output / 'pages.csv', ['제목', '유형', '날짜', '웹페이지', 'Drive 노트 경로', 'Drive 노트 링크', '검색 키워드'],
            [[p['title'], p['type'], p.get('date', ''), urljoin(BASE, p['url']), *note(p['slug']), p.get('keywords', [])] for p in pages])
        table(output / 'articles.csv', ['기사 ID', '제목', '날짜', '요약', '웹페이지', 'Drive 노트 경로', 'Drive 노트 링크', '연결 개념 ID'],
            [[a['id'], a['title'], a.get('date', ''), a.get('description', ''), urljoin(BASE, a['slug']), *note(a['slug']), a.get('termIds', [])] for a in articles])
        table(output / 'concepts.csv', ['개념 ID', '한글 이름', '정의', '분류', '학습 이유', '웹페이지', 'Drive 노트 경로', 'Drive 노트 링크', '원문 출처'],
            [[n['id'], n['label'], n.get('definition', ''), n.get('learningKind', ''), n.get('learningReason', ''), urljoin(BASE, n['slug']), *note(n['slug']), n.get('sources', [])] for n in nodes])
        labels = {n['id']: n['label'] for n in nodes}
        table(output / 'connections.csv', ['연결 ID', '개념 1 ID', '개념 1', '개념 2 ID', '개념 2', '확인 근거'],
            [[e['id'], e['source'], labels[e['source']], e['target'], labels[e['target']], e.get('connections', [])] for e in edges])
        data = (ROOT / 'data/catalog.json').read_bytes()
        json.loads(data)
        (output / 'catalog.json').write_bytes(data)
        provenance.append({'file': 'catalog.json', 'origin': 'local-build-input', 'path': 'data/catalog.json', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        counts = {'pages': len(pages), 'articles': len(articles), 'concepts': len(nodes), 'connections': len(edges)}
        write_json(output / 'snapshot.json', {'schema': 'website-data-archive/v1', 'website': BASE, 'counts': counts,
            'note_mapping_basis': 'local site projection paths joined to verified Drive upload receipts',
            'unmapped_pages': [p['slug'] for p in pages if not drive.get(paths.get(p['slug'], ''))], 'assets': provenance})
        (output / 'README.md').write_text(f'''# 웹사이트에서 사용하는 데이터

[뉴스 웹사이트]({BASE})가 실제 제공하는 데이터를 내려받은 보관본입니다. 수집 시각과 파일 해시, 로컬 생성본과의 일치 여부는 `snapshot.json`에서 확인합니다.

현재 페이지 {len(pages)}개, 기사 {len(articles)}개, 지도 개념 {len(nodes)}개, 개념 연결 {len(edges)}개입니다.

| 파일 | 확인할 내용 |
|---|---|
| pages.csv | 전체 공개 페이지 → 웹주소 → Drive 원본 노트 |
| articles.csv | 기사 제목·요약·날짜·연결 개념·Drive 노트 |
| concepts.csv | 지도 개념·정의·학습 이유·원문 출처 |
| connections.csv | 개념 사이의 확인된 연결과 근거 |
| reader-index.json | 사이트 검색에서 사용하는 실제 배포본 데이터 |
| knowledge-graph.json | 연결 지도의 개념·연결·기사 데이터 |
| contentIndex.json | 공개 페이지 검색 색인 |
| briefing.xml | 실제 배포된 RSS |
| catalog.json | 로컬 생성 과정의 회차·기사·출처 관리 데이터 |
| snapshot.json | 실제 수집 시각·출처 URL·해시·검증 결과 |

CSV는 표로 열 수 있고, JSON은 프로그램이 읽는 원래 형식입니다. CSV는 위 배포본 JSON에서 생성했습니다. Drive 노트 링크는 기존 업로드 기록에서 연결하며, 매핑되지 않은 페이지는 snapshot에 따로 표시합니다.

이 폴더는 웹사이트 데이터의 확인용 보관본입니다. 웹사이트는 배포된 파일을 읽습니다. Drive 파일을 수정하는 것만으로 웹사이트가 바뀌지는 않습니다. 원본 노트 수정 → 사이트 생성·검증·배포 → 이 폴더 갱신 순서로 반영합니다. 로컬 생성본과 배포본의 차이는 숨기지 않습니다.
''')
        destination.mkdir(parents=True, exist_ok=True)
        for file in output.iterdir():
            shutil.copy2(file, destination / file.name)
        print(json.dumps({'folder': str(destination), **counts, 'files': len(list(output.iterdir()))}))

if __name__ == '__main__':
    main()
