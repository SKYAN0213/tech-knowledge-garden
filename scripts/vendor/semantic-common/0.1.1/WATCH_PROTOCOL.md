# 로컬 이벤트 helper protocol v1

`node <vendor>/semantic-watch.mjs --config <absolute private-config.json>`으로 실행한다. helper는 명령을 실행하지 않고 승인 경로의 OS 이벤트만 NDJSON으로 stdout에 쓴다. 위키 manager가 detached worker/단일 잠금/영속 단일 queue/고정 export CLI/검증·색인을 소유한다. helper의 종료나 stdout EOF는 manager의 오류다.

config는 `{schema:"semantic-watch-config/v1",roots:[{id,path,recursive,extensions,ignore}],debounce_ms:2000,stop_on_stdin_end:true}`이다. path와 ignore는 절대 경로, roots는 존재하는 실제 디렉터리, extensions는 `[".md"]` 또는 `[]`(모든 파일)다. symlink root, 중복/겹친 root ID/path, root 밖 ignore, 잘못된 config는 거부한다. manager는 출력/state/log를 ignore하고 입력 범위를 명시 등록한다. helper가 문서·외부 데이터에서 경로나 명령을 읽지 않는다.

모든 stdout 메시지는 `schema=semantic-watch-event/v1`이다. 공통 라이브러리 0.1.1부터 각 NDJSON 메시지의 UTF-8 직렬화 크기는 끝의 LF를 포함해 최대 1 MiB(1,048,576 bytes)다. 글자 수나 JavaScript 문자열 길이로 판정하지 않는다. `MAX_WATCH_EVENT_BYTES`는 두 언어 런타임에서 같은 값이다.

- `{type:"ready",root_ids:[...],debounce_ms:2000,stop_on_stdin_end:true}`: 전부 등록 뒤 발생.
- `{type:"batch",sequence:1,changes:[{root_id,path,event}],reconcile_root_ids:[...],reason:"fs_event|check|resume|recovery"}`: path는 root 상대 `/` 경로 또는 null, event는 change/rename/reconcile. 2초 quiet debounce와 경로 dedupe, 상한4096 초과 시 변경이 있던 root를 reconcile로 축약한다. 직렬화가 1 MiB를 넘으면 가장 큰 root의 세부 경로부터 해당 root의 reconcile로 대체해 상한 안에 넣고, 다른 root의 세부 변경은 보존한다. 이름 없는 이벤트와 root 교체도 reconcile을 요구한다.
- `{type:"error",root_id,code,recoverable,attempt}`: watcher 실패/부재/범위 이탈. 100/500/2000ms의 제한된 오류 재등록 뒤 recoverable=false. 이전 정상 판본과 queue를 버리지 않는다.
- `{type:"stopped"}`: 명시 stop 완료.

stdin NDJSON `{command:"check"}`, `{command:"pause"}`, `{command:"resume"}`, `{command:"stop"}`만 받는다. check/resume은 전체 승인 root의 명시 reconcile batch를 보낸다. pause 중에도 이벤트를 dedupe해 보존하며 resume이 reconcile한다. stdin EOF는 기본 종료다. manager가 `stop_on_stdin_end=true`로 자신의 pipe를 보유하므로 manager crash 시 helper도 정리된다. 대화창 종료와 무관한 수명은 detached manager가 담당한다. false는 독립 수동 실행에서만 허용한다; SIGTERM/SIGINT는 watcher를 닫는다. 정상 idle에는 source 순회·stat polling·export·모델 호출·주기 timer가 없다. helper는 파일 본문을 읽지 않는다.

directory와 그 parent sentinel을 watch해서 inode 교체를 재등록한다. rename/root 변화·오류복구에서만 재등록하며 startup/check/resume에서 승인 범위를 재대조한다. fs.watch가 제공하지 않는 이벤트를 무손실이라고 주장하지 않으며 시작/재개/오류복구/check/통합 검색 전 제품이 bytes 정합성을 확인한다. callback 경로 이탈·symlink 항목은 사실 근거로 쓰지 않고 제품 adapter가 원본을 다시 검증한다.

Node >=22의 `fs.watch`만 사용한다. 근거: [Node v22 File system 공식 문서](https://nodejs.org/docs/latest-v22.x/api/fs.html#fswatchfilename-options-listener)의 availability, inodes, filename caveats. 최신 버전 전용 ignore 옵션, fs.watchFile, 정기 전체 polling, 자동부팅 시작은 사용하지 않는다. Mac 실제 시험과 Windows native 수용은 별도 증거다.

메시지 필드와 protocol v1은 유지한다. 수신자는 LF 없는 잘린 JSON이나 상한 초과 메시지를 정상 batch로 처리하지 않으며 기존 검증 snapshot과 영속 queue를 보존한 채 오류로 보고한다. 위키 수신부의 2,000,000-byte `readline` 방어선은 별도로 유지한다. 배치는 root마다 한 번 queue에 합쳐 전체 payload를 경로 수만큼 반복 저장하지 않는다.
