# 수집 경로 확장 후보 목록

확인일: 2026-10-03 · 범위: 기존 8개 분야, 기술·제품/기업·운영, 국내외 논문·연구 사업화·로봇업계

이후 구현: 조사 결과는 `data/research-source-catalog.json`으로 구조화했고 [등록 명령과 공유 레시피](SOURCE_REGISTRATION.md)를 추가했다. 아래 138개/50개는 조사 당시 기준이며, 현재 연결은 `npm run research:sources -- list`로 확인한다. 등록과 자동 수집 활성화는 별도다.

## 현재 기준과 확인 수준

저장소의 discovery registry는 138개 경로이고, 그중 일일 활성 설정은 50개다. 나머지 88개에는 홈페이지·언어판·IR 진입점이 포함되어 있어 88개 독립 출처나 구현 완료 경로를 뜻하지 않는다. 기준은 `scripts/research/discovery.mjs`의 registry와 `data/research-daily-routes.json`이다.

아래 최초 65개는 **확장 검토 대상**이다. 기존 비활성 경로의 재사용·주소 구체화도 포함하며, 65개 모두 새 출처라는 뜻은 아니다. 최초 조사에서는 54개의 목록·진입점·공식 문서 내용 반환을 확인했고, 11개는 직접 접근 실패로 보류했다. X21 Europe PMC는 공식 문서 검색 반환과 직접 접근 실패를 함께 기록했다. 이후 실제 수집으로 RSS 3개를 추가해 기계 목록은 68개가 됐다. 실제 검증 결과는 아래 표와 [런북 329절](LOCAL_AI_NEWS_RUNBOOK.md#329-우선-5개-출처의-실제-수집과-공통-디버깅)에서 구분한다. 일일 활성 설정, 운영 후보 장부, 발행 자료와 예약은 변경하지 않았다.

| 추가/검증 ID | 실제 수집 주소 | 확인 결과 |
| --- | --- | --- |
| X01-rss | [전자신문 AI RSS](https://rss.etnews.com/04046.xml) | 10-03 원문 3건·날짜 창 완료 |
| X02-rss | [로봇신문 전체 RSS](https://cdn.irobotnews.com/rss/gn_rss_allArticle.xml) | 10-02 기사 13건 중 11건 파싱, 이미지 2건 OCR 추출·신뢰도/숫자 검토 대기·기간 미완료 |
| X03-rss | [디일렉 전체 RSS](https://cdn.thelec.kr/rss/gn_rss_allArticle.xml) | 10-03 원문 2건·날짜 창 완료 |
| X46 | [KISA 보안공지](https://www.krcert.or.kr/kr/bbs/list.do?bbsId=B0000133&menuNo=205020) | 10-03 원문 1건·빈 기간 완료 |
| X50 | [한국생산기술연구원 보도자료](https://www.kitech.re.kr/pages/61) | 9-28 원문 1건·10-03 빈 기간 완료 |

- **목록 확인:** 웹 도구가 목록과 링크를 반환했다. 개별 기사·첨부의 자동 수집은 다음 단계다.
- **문서 확인:** 운영기관의 수집 API/RSS 안내를 확인했다. endpoint 호출·날짜 창·원문 확보는 다음 단계다.
- **진입점 확인:** 홈페이지·동적 목록 입구의 내용을 확인했다. 실제 목록 endpoint/페이지 주소부터 특정해야 한다.
- **접근 보류:** 웹 도구 접근 실패 또는 timeout. 검색에 보였다는 사실은 별도로 적고 실제 수집 성공으로 세지 않는다. 웹 도구 실패만으로 HTTP 403이나 robots 거부라고 단정하지 않는다.

분야 약칭: AI, SW=소프트웨어·클라우드, 보안=사이버보안, 반도체=반도체·컴퓨팅, 로봇=로봇·제조, 에너지=에너지·기후기술, 바이오=바이오·의료기술, 우주=우주·기초과학. 아래 수집 방식은 도입안이며 현재 지원을 보장하지 않는다.

## 1. 산업 전문지·기술 매체 — 11개

기사 발견과 독립 취재를 보완한다. 기자·게시일·취재/보도자료 재전재·광고성 콘텐츠를 분리하고, 기술·성능·재무 수치는 당사자 자료와 대조한다. 매체 RSS 요약은 상세 원문을 대체하지 않는다.

| ID | 출처·주소 | 지역·분야 | 이번 확인 | 수집·파싱 도입안과 주의점 | 기존 등록 연결 |
| --- | --- | --- | --- | --- | --- |
| X01 | [전자신문 RSS 안내](https://www.etnews.com/rss/?Id=1) | 국내·8분야 | 문서 확인 | 안내에 게시된 분야별 RSS → 기사 HTML. AI/SW/보안/장비/바이오 feed 선택; HTTP 주소의 HTTPS 지원과 현재 XML은 별도 확인 | `etnews` 구체화 |
| X02 | [로봇신문](https://www.irobotnews.com/) | 국내·로봇 | 목록 확인 | 날짜 목록 → 기사 본문. 제조사·SI·수주·현장 사례 탐색; 행사 공지와 기사 구분 | `irobotnews` |
| X03 | [디일렉](https://www.thelec.kr/) | 국내·반도체/에너지/로봇 | 목록 확인 | 분야 목록 → 기자 본문. 부품·공급망·설비 투자 탐색; 공개 본문 범위 확인 | `thelec` |
| X04 | [ZDNet Korea](https://zdnet.co.kr/) | 국내·AI/SW/보안/반도체 | 목록 확인 | 분야별 날짜 목록 → HTML. 기업 전략·인력·제품 기사; 아직 공식 RSS 주소는 확인하지 않음 | 미등록 |
| X05 | [TechCrunch](https://techcrunch.com/) | 해외·AI/SW/바이오/에너지 | 목록 확인 | 분야 목록 → 공개 본문 | 미등록 |
| X06 | [Ars Technica](https://arstechnica.com/) | 해외·AI/SW/보안/우주 | 목록 확인 | 분야 목록 → 공개 기사. 접근 가능한 개별 본문만 사용; 회원 전용 제외 | 미등록 |
| X07 | [The Register](https://www.theregister.com/) | 해외·SW/보안/반도체/AI | 목록 확인 | 분야별 목록 → 기자 본문. 기업 운영·클라우드·보안 취재와 기고 구분 | 미등록 |
| X08 | [EE Times](https://www.eetimes.com/) | 해외·반도체/AI/로봇 | 목록 확인 | 날짜 목록 → 공개 본문. 기술 취재·기고·파트너 콘텐츠 귀속 보존 | 미등록 |
| X09 | [ScienceDaily](https://www.sciencedaily.com/) | 해외·바이오/우주/에너지/AI | 목록 확인 | 연구 발견용 목록 → 표시된 대학/학술지 원문. 재배포는 독립 근거로 중복 집계하지 않음 | 미등록 |
| X10 | [The Robot Report](https://www.therobotreport.com/) | 해외·로봇 | 접근 보류 | 직접 열람 실패; 등록된 산업용 로봇 목록과 공식 feed 유무를 재확인한 후 도입 | `robot-report` |
| X11 | [헬로디디](https://www.hellodd.com/) | 국내·연구/사업화/우주/바이오 | 검색 확인·접근 보류 | 직접 열람 실패; 연구실·출연연·교수 창업 취재 원문을 확보한 뒤 날짜 목록 profile 작성 | 미등록 |

전자신문 공식 안내에 AI `http://rss.etnews.com/04046.xml`, 보안 `http://rss.etnews.com/04045.xml`, SW `http://rss.etnews.com/04.xml`, 장비 `http://rss.etnews.com/06061.xml`, 바이오 `http://rss.etnews.com/20042.xml`이 게시되어 있다. AI 피드는 HTTPS XML과 원문 수집까지 확인했다. 다른 분야 피드는 주소 안내 확인 단계다. The Robot Report의 `/feed`는 공식 XML 미확인으로 확정 endpoint로 등록하지 않는다.

## 2. 논문·학회·임상 원문 — 11개

| ID | 출처·주소 | 분야 | 이번 확인 | 수집·파싱 도입안과 주의점 | 기존 등록 연결 |
| --- | --- | --- | --- | --- | --- |
| X12 | [arXiv RSS/Atom 안내](https://info.arxiv.org/help/rss.html) · [API 안내](https://info.arxiv.org/help/api/user-manual.html) | AI/로봇/반도체/우주 | 문서 확인 | 분야 feed/Atom → 고정 ID·판본 → 공개 HTML/PDF. 신규 제출·교차등재·교체판을 구분; 짧은 feed의 과거 빈 구간은 API 날짜 검색으로 보완 | `arxiv-robotics` 확장 |
| X13 | [OpenReview API](https://docs.openreview.net/getting-started/using-the-api) | AI/로봇 | 문서 확인 | API v2 공개 Note·학회/공개일 필터 → 논문 PDF·공개 decision. 공식 안내는 계정 인증을 요구; 비공개 review 제외 | 미등록 |
| X14 | [PMLR 논문집](https://proceedings.mlr.press/) | AI/로봇 | 목록 확인 | 학회 volume → 논문 HTML·PDF·보충자료. 논문집 발행일과 행사일·사전공개일 구분 | 미등록 |
| X15 | [Robotics: Science and Systems 논문집](https://www.roboticsproceedings.org/) | 로봇/AI | 목록 확인 | 연도/volume → 논문 HTML·PDF. RSS라는 학회 이름을 구독 RSS와 혼동하지 않음 | 미등록 |
| X16 | [CVF Open Access](https://openaccess.thecvf.com/) | AI/로봇 | 접근 보류 | CVPR/ICCV 등 행사별 논문집·PDF 후보. 직접 접근 실패; 제목·저자·PDF 링크와 공개일 확인 후 도입 | 미등록 |
| X17 | [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) | 8분야 | 문서 확인 | DOI·저자·학술지·날짜 검색과 publisher 원문 연결. metadata API 자체는 전문이 아님; cursor·정정/철회 관계 보존 | 미등록 |
| X18 | [OpenAlex API](https://help.openalex.org/api/) · [무료 사용 조건](https://help.openalex.org/access/pricing/) | 8분야 | 문서 확인 | 연구자·기관·연구 주제·OA 링크 발견. 무료 계정 예산 안에서 캐시/증분 질의; 동일 이름만으로 교수·창업 관계 확정 금지 | 미등록 |
| X19 | [PubMed/NCBI E-utilities](https://www.ncbi.nlm.nih.gov/home/develop/api/) | 바이오 | 문서 확인 | PMID·검색 결과·abstract → PMC/학술지 원문. API 문서는 확인; Books 상세 문서 주소는 CAPTCHA 반환, 전문 수집과 분리 | 미등록 |
| X20 | [PMC OAI-PMH](https://pmc.ncbi.nlm.nih.gov/tools/oai/) | 바이오/의료 AI | 문서 확인 | 공식 OAI/XML → 재사용 허용 전문 JATS → 문단·표·그림·참조. 모든 PMC 전문이 자동 수집 허용되는 것은 아님 | 미등록 |
| X21 | [Europe PMC REST](https://europepmc.org/RestfulWebService) | 바이오 | 공식 문서 내용 확인·직접 열람 실패 | 공식 검색 반환에서 JSON/XML 검색·OA fullTextXML 명세 확인. PMID/PMCID/DOI 교차 매칭; endpoint 응답은 미확인 | 미등록 |
| X22 | [ClinicalTrials.gov API 안내](https://clinicaltrials.gov/data-api/api) | 바이오 | 진입점 확인 | 문서 화면이 동적 shell. 실제 API 명세·study JSON을 먼저 확인; NCT ID·결과/등록·갱신 시각을 분리 | 미등록 |

arXiv 공식 feed 규칙은 `https://rss.arxiv.org/rss/{category}` 또는 `/atom/{category}`다. 도입 후보 category는 `cs.AI`, `cs.LG`, `cs.CL`, `cs.CV`, `cs.RO`이며 다른 분야는 실제 taxonomy로 선택한다. 여러 feed에서 같은 arXiv ID가 나오면 원문을 한 번 확보하고 판본별 변경을 보존한다. 특정 category 피드는 이번에 호출하지 않았다.

OpenAlex는 2026-10-03 확인한 [공식 가격 안내](https://help.openalex.org/access/pricing/)에 무료 계정 일일 $1 사용 예산이 명시되어 있다. 기본 무키 질의와 계정 예산은 [인증 안내](https://help.openalex.org/api/authentication/)에 따라 구분하며, 무료 한도 소진 시 중단하고 유료 충전은 하지 않는다. 무제한 무료 API로 설계하지 않는다.

PMC의 공식 base URL은 `https://pmc.ncbi.nlm.nih.gov/api/oai/v1/mh/`다. [문서](https://pmc.ncbi.nlm.nih.gov/tools/oai/)가 지정한 API로 자동 수집하고, 라이선스 허용 전문만 이용한다. 문서에 명시된 3 rps 상한과 동시 요청 금지·대량 조회 시간 조건을 host 정책에 반영한다. API 존재 확인과 실제 JATS 파싱 구현은 다른 단계다.

## 3. 제조사·공급사·고객·기업 전략 — 16개

| ID | 출처·주소 | 지역·분야 | 이번 확인 | 수집·파싱 도입안과 주의점 | 기존 등록 연결 |
| --- | --- | --- | --- | --- | --- |
| X23 | [NACHI 일본어 IR](https://www.nachi-fujikoshi.co.jp/media/ir) | 해외·로봇 | 목록 확인 | 페이지 번호 → 날짜별 IR·PDF. 회사 전체와 로봇 부문 실적 분리; 과거 영문 news 주소 대신 확인한 일문 경로 사용 | `route-nachi-start-ja` 구체화 |
| X24 | [Techman Robot 뉴스](https://www.tm-robot.com/en/company/news?categoryId=3) | 해외·로봇/AI | 목록 확인 | 분류·날짜 목록 → 원문. 기존 `www2` 사이트와 새 사이트 동일 사건 대조; 언어판 중복 보존/병합 | `route-techman-news-en` 대체 후보 |
| X25 | [JAKA 뉴스](https://www.jaka.com/en/news) | 해외·로봇/AI | 목록 확인 | News/Blog/Events 분류 → 상세 HTML. 범용 SEO 블로그·전시 초청과 제품/사업 사건 구분; 지역 언어판 날짜 차이 확인 | `route-jaka-start-en` 구체화 |
| X26 | [Nabtesco 정밀기기 뉴스](https://precision.nabtesco.com/ja/news/) | 해외·로봇 | 목록 확인 | 일문 날짜 목록 → 제품·첨부 PDF. 감속기·구동장치 사양 변경과 행사 자료 구분 | 미등록 |
| X27 | [Beckhoff Press](https://www.beckhoff.com/en-en/company/press/) | 해외·로봇/반도체 | 목록 확인 | 보도자료 목록 → HTML·기술 PDF. 제어기·motion·통합 사례, 자료 다운로드와 게시일 대조 | 미등록 |
| X28 | [Siemens Press](https://press.siemens.com/global/en) | 해외·로봇/SW | 진입점 확인 | 사업부·분야 뉴스 목록 특정 → 발표·제품·첨부. 회사 전사와 Digital Industries 부문 귀속 구분 | `watch-siemens-0` 구체화 |
| X29 | [BMW PressClub](https://www.press.bmwgroup.com/global) | 해외·로봇 | 목록 확인 | 생산/물류 분야·날짜 목록 → 원문·첨부. 제조사 홍보와 고객의 실제 설치/운영 근거 대조 | 미등록 |
| X30 | [Intel Newsroom](https://www.intel.com/content/www/us/en/newsroom/home.html) | 해외·반도체/AI | 목록 확인 | 공식 newsroom의 분야별 날짜 목록 → 원문. 이전 newsroom 도메인 redirect 보존 | 미등록 |
| X31 | [ASML 발표](https://investor.asml.com/news/press-releases-and-announcements) | 해외·반도체 | 목록 확인 | 발표 목록 → HTML·PDF. 구 `/en/news/press-releases`에서 IR 사이트로 이동 확인 | 미등록 |
| X32 | [ASML 분기 실적](https://investor.asml.com/quarterly-results) | 해외·반도체 | 목록 확인 | 연도·분기 → 발표·재무 PDF·Excel·prepared remarks. call 날짜·발표 시각·분기말 구분 | 미등록 |
| X33 | [Microsoft 실적 입구](https://www.microsoft.com/en-us/Investor/earnings/) · [실물 발표 예](https://www.microsoft.com/en-us/Investor/earnings/FY-2026-Q4/press-release-webcast) | 해외·AI/SW | 진입점 및 상세 1건 확인 | hub는 동적 shell; 공식 분기 발표 HTML/첨부를 선택. SEC CIK와 연결하여 전략·매출·투자 대조 | `watch-microsoft-0` 구체화 |
| X34 | [Alphabet IR](https://abc.xyz/investor/) | 해외·AI/SW | 진입점 확인 | Results/Financials·뉴스 실제 목록 특정 → 실적·경영진 발표. Google 제품 뉴스와 회사 공시를 동일 사건으로 자동 병합하지 않음 | `watch-alphabet-0` |
| X35 | [SK텔레콤 뉴스룸](https://news.sktelecom.com/) | 국내·AI/SW | 목록 확인 | 날짜 목록 → 발표 HTML. 투자·제휴·AI 인프라; RSS 발견 시 공식 선언 주소만 채택 | 미등록 |
| X36 | [NAVER D2](https://d2.naver.com/helloworld) | 국내·SW/AI | 진입점 확인 | 메뉴·shell만 확인. 공개 목록 endpoint 또는 허용 브라우저 경로 확인 후 공통 파서 사용 | `watch-naver-0` 관련 추가 경로 |
| X37 | [TSMC 뉴스](https://pr.tsmc.com/english/news) | 해외·반도체 | 접근 보류 | 직접 접근 실패. IR/공식 발표 PDF 등 대체 자료 후보; 무료 본문 확보 전 활성화하지 않음 | `watch-tsmc-0` 관련 추가 경로 |
| X38 | [레인보우로보틱스 PR](https://rainbowrobotics.com/pr) | 국내·로봇 | 검색 확인·접근 보류 | 기존 회사 시작 주소와 PR 목록 연결을 확인하고 날짜·원문·매체 재전재를 분리 | `route-rainbow-start-en` 관련 국문 경로 |

X29처럼 고객의 공식 생산 자료와 X26~X28의 공급사·제어기·SI 자료를 함께 살핀다. 제조사만 늘리는 것보다 실제 설치·운영·부품 공급·통합 성과를 보완한다. 두 당사자가 같은 계약을 발표해도 한 사건으로 연결하며 발표문마다 다른 계약 범위·조건을 보존한다.

## 4. 협회·규제·정책·공공자료 — 11개

| ID | 출처·주소 | 지역·분야 | 이번 확인 | 수집·파싱 도입안과 주의점 | 기존 등록 연결 |
| --- | --- | --- | --- | --- | --- |
| X39 | [IFR 보도자료](https://ifr.org/ifr-press-releases) | 해외·로봇 | 목록 확인 | 날짜 목록 → 공개 통계 발표. 설치·가동 stock·robot density 지표와 기준연도 구분; 유료 보고서 전문 제외 | `ifr` 구체화 |
| X40 | [A3 Press Center](https://www.automate.org/a3/press-center) | 해외·로봇 | 목록 확인 | A3 자체 발표 목록 → HTML. 회원사 발표와 협회 통계의 출처 구분; 기존 오래된 news-center 주소 대체 후보 | `a3` 구체화 |
| X41 | [IEA News](https://www.iea.org/news) | 해외·에너지 | 목록 확인 | 날짜 목록 → 발표·공개 보고서. forecast·실측·국가/기간·기준 시나리오 보존 | `iea` |
| X42 | [NIST News](https://www.nist.gov/news-events/news) | 해외·AI/보안/로봇/반도체 | 목록 확인 | 날짜·topic 목록 → 원문·표준/보고서. 초안·최종안·모집/집행 구분 | 미등록 |
| X43 | [미국 DOE Newsroom](https://www.energy.gov/newsroom) | 해외·에너지 | 목록 확인 | 날짜 목록 → 발표·사업 자료. 공고·선정·계약·실제 집행 구분 | 미등록 |
| X44 | [대한민국 정책브리핑 보도자료](https://www.korea.kr/briefing/pressReleaseList.do) | 국내·8분야 | 목록 확인 | 부처·날짜 목록 → 본문·PDF/HWP. 원부처 발표와 재배포를 한 자료 계보로 묶고 PDF/HTML 우선 | 미등록 |
| X45 | [KISTEP](https://www.kistep.re.kr/) | 국내·8분야 | 진입점 확인 | 정책브리프·R&D 예산/성과 목록 구체화 → 보고서 PDF. 일일 사건보다 주간 배경/전략 기록에 적합 | 미등록 |
| X46 | [KISA 보호나라 보안공지](https://www.krcert.or.kr/kr/bbs/list.do?bbsId=B0000133&menuNo=205020) | 국내·보안/SW | 목록 확인 | 페이지 번호·게시일 → 공지·첨부. 상단 고정 공지 날짜로 기간 종료 판단 금지; CVE·vendor advisory 대조 | 미등록 |
| X47 | [ESA RSS 안내](https://www.esa.int/Services/RSS_Feeds) | 해외·우주 | 문서 확인 | 공식 안내에서 topic feed 주소 선택 → 원문. feed 응답/과거 보존 범위는 미확인 | 미등록 |
| X48 | [JAXA 영문 발표](https://www.jaxa.jp/press/index_e.html) | 해외·우주 | 목록 확인 | 연도별 날짜 목록 → 발표·PDF; 일문 원발표와 영어판 날짜를 분리 | 미등록 |
| X49 | [OpenDART 공시검색 안내](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001) | 국내·8분야 | 검색 문서 확인·직접 접근 보류 | 무료 계정 API key 필요. 기업 고유번호·접수번호·정정본 → 공시 원문. 기존 기업 RSS가 충분한 경우 우선 재사용 | `dart`, `dart-samsung-filings` 확장 |

미국 기업은 새로운 공시 플랫폼을 만들지 않고 기존 SEC 수집기의 CIK·form 설정을 재사용한다. [SEC 공식 API 안내](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)를 확인했다. 추가 대상 기업의 정확한 법인·CIK와 제출일·보고기간·전사/사업부 범위를 먼저 검토하며 Tesla/Amazon 공시 경로는 그대로 유지한다.

## 5. 국내 연구기관·대학 연구 — 4개

| ID | 출처·주소 | 분야 | 이번 확인 | 수집·파싱 도입안과 주의점 | 기존 등록 연결 |
| --- | --- | --- | --- | --- | --- |
| X50 | [한국생산기술연구원 보도자료](https://www.kitech.re.kr/pages/61) | 로봇/반도체/에너지/바이오 | 목록 확인 | 날짜 목록 → 연구 발표·PDF·논문 DOI. 제조·자동화 실증 자료; 첨부만 읽고 본문 누락하지 않음 | 미등록 |
| X51 | [UNIST 연구·대학 뉴스](https://www.unist.ac.kr/unist/index.do) | AI/반도체/에너지/바이오 | 진입점 확인 | 예전 `news.unist.ac.kr/kor/`가 현재 대학 사이트로 redirect. 연구성과 목록·새 상세 URL 구체화 필요 | `watch-unist-0` 구체화 |
| X52 | [IBS 기초과학연구원](https://www.ibs.re.kr/kor.do) | 우주/바이오/반도체/AI | 진입점 확인 | 연구성과·보도자료 목록 → 원문·논문·PDF. 확인된 페이지의 오래된 표시를 오늘 새 발표로 해석하지 않음 | 미등록 |
| X53 | [ETRI](https://www.etri.re.kr/kor/main/main.etri) | AI/SW/반도체/로봇/보안 | 검색 확인·접근 보류 | 공식 검색 반환에 보도자료 내용 확인, 직접 열람 실패. 실제 게시판 ID·공개 첨부/상세를 확인 후 도입 | 미등록 |

## 6. 교수 창업·기술이전·연구 사업화 — 12개

연구자·회사·기술·투자자 연결은 탐색 후보로 시작한다. 교수 공동창업, 학생/동문 창업, 자문, 연구실 기술이전, 단순 투자·입주를 원문이 명시한 역할로 구분한다. 포트폴리오에 있다는 사실은 교수 창업의 증명이 아니다. 날짜 없는 회사 목록은 배경/추적 목록으로만 가져오고 새 뉴스로 발행하지 않는다.

| ID | 출처·주소 | 지역 | 이번 확인 | 수집·파싱 도입안과 주의점 | 기존 등록 연결 |
| --- | --- | --- | --- | --- | --- |
| X54 | [KAIST 창업원](https://startup.kaist.ac.kr/) | 국내 | 검색 확인·접근 보류 | 직접 열람 timeout. 창업기업·교원창업·뉴스 목록과 교수/회사 명시 역할부터 확인 | `watch-kaist-0` |
| X55 | [서울대 창업지원단](https://startup.snu.ac.kr/) | 국내 | 진입점 확인 | 우수 스타트업·동문 기업·언론보도 목록 → 상세. 교원/학생/동문 구분 | `watch-snu-0` 관련 추가 경로 |
| X56 | [서울대 기술지주](https://www.snuholdings.com/) | 국내 | 검색 링크 확인·접근 보류 | 서울대 공식 기사에 기술지주 주소 확인; 직접 열람 실패. 투자기업·회사 소개·연구 기반을 대조 | `watch-snu-0` 관련 추가 경로 |
| X57 | [POSTECH 기술지주](https://www.postechholdings.com/) | 국내 | 검색 확인·접근 보류 | 공식 검색 결과에서 사이트 확인, 직접 열람 실패. 포트폴리오·투자/사업화 소식과 연구실 연결 검토 | `watch-postech-0` 관련 추가 경로 |
| X58 | [UNIST 벤처파운드리](https://industry.unist.ac.kr/industry/index.do) | 국내 | 진입점 확인 | 기술창업·기업 지원·사업화 뉴스 목록 → 회사·교수·기술이전 원문 | `watch-unist-0` 관련 추가 경로 |
| X59 | [MIT TLO Our Startups](https://tlo.mit.edu/industry-entrepreneurs/startups) | 해외 | 목록 확인 | 기술 기반 기업 목록 → 회사·TLO 원문. 신규 추가일 없는 회사 목록은 background | `mit-startups` |
| X60 | [Stanford OTL](https://otl.stanford.edu/) | 해외 | 진입점 확인 | OTL 뉴스·기술·HIT Fund 포트폴리오 → 상세. 지원·라이선스·설립 관계를 따로 기록 | `watch-stanford-0` |
| X61 | [Cambridge Enterprise](https://www.enterprise.cam.ac.uk/) | 해외 | 진입점 확인 | news·venture investment·spinout 상세 → 대학/회사 근거 | `watch-cambridge-0` |
| X62 | [Oxford University Innovation](https://innovation.ox.ac.uk/) | 해외 | 진입점 확인 | news/reports·spinout 소개 → 대학/회사 원문. 이전 웹 경로 변경 확인 후 목록 설정 | `watch-oxford-0` |
| X63 | [ETH Entrepreneurship](https://ethz.ch/en/industry/entrepreneurship.html) | 해외 | 진입점 확인 | 공식 spin-off 목록·news → 회사/연구실 소개. 학내 spin-off 인정과 교수 공동창업 구분 | `watch-eth-0` |
| X64 | [CMU Swartz Center](https://www.cmu.edu/swartz-center-for-entrepreneurship/) | 해외 | 진입점 확인 | startup·news 상세 → 교수/학생·연구 기반 원문. 인큐베이터 참여를 창업자 소속으로 확대하지 않음 | `watch-cmu-0` |
| X65 | [UC Berkeley IPIRA](https://ipira.berkeley.edu/) | 해외 | 접근 보류 | 직접 열람 실패. 공개 기술 라이선스·startup/news 목록 접근부터 확인 | `watch-berkeley-0` |

## 7. 먼저 도입할 묶음

고정 출처만 순회하지 않고 기존 8개 분야·국내외·두 조사 축에서 빠진 내용을 기준으로 다음 후보를 선택한다. 아래는 실행 성공을 예측한 순위가 아니라 정보 보완과 공통 기능 재사용을 고려한 도입 순서다. 한 묶음 안에서도 실제 실패가 계속되면 원인을 기록하고 다른 공개 경로로 진행한다.

| 묶음 | 우선 후보 | 보완하는 내용 | 구현 기준 |
| --- | --- | --- | --- |
| A: 국내 탐색·보안·제조 연구 | X01 전자신문, X02 로봇신문, X03 디일렉, X46 KISA, X50 KITECH | 국내 현장/수주/인력·공급망·보안·제조 실증 | RSS 또는 날짜 목록과 기존 HTML/PDF 파서; 지정 기간의 상세 1건 및 이전 날짜 종료부터 확인 |
| B: 논문 전문 | X12 arXiv, X14 PMLR, X15 Robotics: Science and Systems, X20 PMC | 대학 뉴스에만 의존하지 않는 방법·실험·조건·후속 연구 | RSS/목록→판본 고정→HTML/PDF, PMC는 공식 OAI/JATS 공통 adapter 필요 |
| C: 업계·공급망·고객 | X39 IFR, X40 A3, X26 Nabtesco, X29 BMW | 시장 통계·부품·실제 고객 도입 | 기존 날짜 목록·표·PDF 공통 파싱; 통계 기준연도/실험 조건 검토 |
| D: 기업 전략·다른 분야 | X32 ASML 실적, X35 SKT, X41 IEA, X48 JAXA | 실제 자원 배분·국내 AI 기업·에너지·우주 | 날짜 목록/분기 PDF; 같은 사건의 회사 발표·공시 연결 |
| E: 국내외 연구 사업화 | X55 서울대 창업지원단, X58 UNIST, X59 MIT TLO, X60 Stanford OTL | 교수·연구실·회사·기술이전·제품화 이력 | 먼저 세부 목록과 역할 원문 확인. 날짜 없는 background를 일일 기사 후보로 만들지 않음 |

처음부터 65개를 매일 모두 조회하지 않는다. 활성 경로 수보다 8분야×국내외×기술/기업의 확인 근거와 출처 종류를 채우는 것이 기준이다. 논문집·포트폴리오·분기 IR은 게시/변경 주기에 맞춰 기존 실행기의 증분 작업으로 배치하고, 추가 예약은 만들지 않는다. 앞선 50개 활성 경로는 유지한다.

## 8. 공통 기능 재사용과 출처별 확인 항목

기존 [원문 수집 명세](SOURCE_ACQUISITION_SPEC.md) 및 [일일 수집 구현 3.2절](DAILY_NEWS_INGESTION_IMPLEMENTATION.md#32-새-출처를-활성화하는-체크리스트)을 따른다.

| 유형 | 먼저 재사용할 부분 | 출처별로 확인할 차이 |
| --- | --- | --- |
| RSS/Atom | 안전 요청·원본 보관·목록 파싱·기간 필터·상세 원문·backlog | GUID/permalink, feed 보존 범위, new/update 종류, 시간대, 요약/전문, 원발표 링크 |
| 날짜 HTML 목록 | 페이지/cursor 수집·기사 파서·이전 날짜 종료 | 상단 고정 공지, 역순 여부, 날짜 없는 행, lazy-load, 상세 URL·제목/날짜 대조 |
| 공식 JSON API | 요청/저장/정책·재개 cursor·공통 후보 계약 | 공개/auth, pagination, ID, 업데이트 시각, 라이선스. 기존 유형으로 표현 불가능할 때만 작은 공통 adapter |
| 공시/IR | 기존 SEC/IR/PDF·표 파싱·사건 연결 | 법인·CIK/고유번호·접수번호·정정·재무기간·전사/사업부. DART key는 비공개 설정 |
| 논문 전문 | 원본 고정·HTML/PDF·수식/표·논문 식별자 | DOI/arXiv/PMID/PMCID 버전 관계, 철회/정정, OA 범위, JATS/OAI adapter 필요 여부 |
| 포트폴리오/기술이전 | 공개 HTML/PDF·기존 관계 근거 계약 | 교원/학생/동문·창업/자문/라이선스·발표일. 무날짜 background 증분과 뉴스 분리 |

등록 전에는 기존 `registry`, 기업·기관 ID와 URL을 먼저 대조한다. `기존 등록 연결`이 있는 항목은 그 경로를 구체화하거나 관계를 명시하며 동일 주소를 새 ID로 복제하지 않는다. source-specific endpoint나 selector를 추측해 채우지 않는다.

소스 URL·문서 ID·content hash는 기존 원문 계보로 연결한다. 기사끼리 같은 사건인지의 판정에는 날짜·당사자·행위·계약/논문 ID·원문 근거를 대조한다. 재전재·동일 언어판을 여러 독립 증거로 세거나, 제목이 비슷하다는 이유로 별개 실험/계약을 합치지 않는다. 전문 해설은 실제 읽은 원문으로만 작성한다.

## 9. 다음 도입에서 남길 기록과 이번 변경 범위

새 경로마다 기존 비공개 run 기록에 `catalog_id`, 재사용할 `channel_id`, 확인한 목록/원문 주소, 확인 시각, 정책·응답 상태, 원본 hash, 본문/날짜/첨부 범위, page/cursor 종료, 인증·무료 예산 조건, 실패 원인, 다음 단계와 일일 활성 여부를 연결한다. 별도 기사 후보 장부나 지식 저장소는 만들지 않는다.

단계는 발견 → 공식 경로/조건 확인 → 원문 1건 확보 → 공통 파싱/날짜 대조 → 기간 종료/빈 기간/재개 확인 → 기존 장부 병합과 중복 검토 → 일일 활성이다. 이번 목록의 단계는 표의 `이번 확인`까지만이다. 자동 수집 개발 완료·전체 조사 완료·발행 완료로 올리지 않는다.

이번 변경은 조사 목록과 기존 출처 문서의 연결만 포함한다. 전체/표적 테스트를 반복하지 않고 문서 링크·ID/건수·기존 등록과 활성 경로 수·`git diff --check`를 한 번 확인한다. 계정 생성·API key 설정·유료 실행·새 예약·공개 발행은 이 조사에서 수행하지 않았다.
