---
title: Model Context Protocol
type: knowledge
status: evergreen
created: 2026-06-23
updated: 2026-08-07
tags:
  - AI
  - MCP
  - Agent
  - Tooling
---

# Model Context Protocol

## 한 줄 정의

Model Context Protocol, MCP는 AI 모델이나 에이전트가 외부 도구와 데이터 소스에 표준 방식으로 연결되도록 돕는 프로토콜입니다.

## 왜 중요한가

AI 에이전트가 실제 일을 하려면 외부 세계와 연결되어야 합니다. 예를 들어 파일 시스템, 데이터베이스, GitHub, 캘린더, 브라우저, 사내 문서 저장소 같은 도구가 필요합니다.

문제는 각 도구마다 연결 방식이 다르면 에이전트 개발과 보안 관리가 어려워진다는 점입니다. MCP는 이런 연결을 표준화하려는 흐름입니다.

## RAG와의 차이

| 구분 | RAG | MCP |
|---|---|---|
| 주요 목적 | 지식 검색 | 도구와 시스템 연결 |
| 데이터 성격 | 문서, 지식베이스, 벡터DB | API, 파일, DB, 앱 기능 |
| 결과 | 답변 근거 강화 | 실제 행동 가능 |
| 보안 포인트 | 검색 소스 신뢰도 | 도구 권한과 인증 |

간단히 말하면 RAG는 "무엇을 참고할 것인가"에 가깝고, MCP는 "무엇을 조작할 수 있는가"에 가깝습니다.

## 보안 체크포인트

- MCP 서버가 어떤 도구를 노출하는가
- 도구별 권한 범위가 제한되어 있는가
- 민감 데이터가 외부 모델 요청에 포함되지 않는가
- 도구 호출 로그가 남는가
- 사용자가 승인해야 할 작업과 자동 실행 작업이 구분되는가

## 이 Obsidian 자동화에 적용

브리핑 자동화가 향후 MCP를 통해 더 많은 도구와 연결된다면, 각 도구를 Agent BOM에 기록해야 합니다.

예를 들어 GitHub MCP를 연결한다면 다음을 기록합니다.

- 읽기만 가능한지, 쓰기도 가능한지
- 어떤 저장소에 접근할 수 있는지
- PR 생성이나 파일 수정이 가능한지
- 사람 승인이 필요한지

## Recent Signals

- 2026-08-07 08:02 KST 브리핑: Cloudflare는 세션 상태 의존을 줄인 새 MCP 코어와 웹사이트를 에이전트 호출 표면으로 만드는 WebMCP 개발자 미리보기를 공개했습니다. 원격 MCP 운영은 상태 없는 확장성뿐 아니라 공개 endpoint 인증, 사람 승인, 도구 권한과 적합성 검증을 함께 설계해야 합니다.
- 2026-07-24 08:00 KST 브리핑: GitHub MCP Server는 7월 28일 공개 예정인 차기 MCP 규격을 미리 지원했습니다. 상태 없는 core에 맞춰 Redis session, `initialize`의 database write, 매 요청의 session read를 제거했고, session과 `initialize`가 빠진 client handshake 및 multi-round-trip 요청을 지원합니다. 공식 conformance test도 추가되어 MCP 운영의 초점이 연결 규격 호환성에서 수평 확장, payload 검사 최소화, 자동 적합성 검증까지 넓어지고 있습니다.
- 2026-07-05 16:03 KST 브리핑: `modelcontextprotocol/servers`는 `2026.7.4` release에서 `server-memory`, `server-filesystem`, `server-sequential-thinking`, `server-everything` 패키지를 새로 배포했습니다. 이번 release 범위에는 memory server가 knowledge graph를 MCP Resource로 노출하는 변화와 npm OIDC/provenance 기반 publishing 전환이 포함되어, MCP 서버가 도구 호출뿐 아니라 공유 가능한 resource와 배포 신뢰성까지 함께 관리하는 방향을 보여줍니다.
- 2026-07-02 08:05 KST 브리핑: Vercel AI SDK `ai@7.0.10`은 MCP tool call 실패에 `maxRetries` 옵션을 추가했습니다. MCP 연결은 단순히 도구를 호출하는 규격을 넘어 실패한 도구 호출의 재시도 정책, timeout, trace, 비용 통제까지 포함하는 runtime reliability 문제로 다뤄지고 있습니다.
- 2026-06-27 00:04 KST 브리핑: AWS는 Amazon S3의 text-based PDF를 MCP server로 읽어 AI client가 즉시 질의하는 구현 패턴을 공개했습니다. MCP는 단순 tool-call 예제가 아니라 IAM, document storage, OCR/Textract와의 역할 분리까지 포함한 문서 접근 아키텍처로 다뤄지고 있습니다.
- 2026-06-24 07:00 KST 브리핑: Microsoft는 SharePoint Copilot Apps를 소개하면서 MCP Apps model과 SPFx 기반 UX components를 Copilot canvas에 직접 띄우는 흐름을 제시했습니다. MCP가 단순 tool-call 규격을 넘어 에이전트가 호출하는 업무 UI와도 연결되는 방향입니다.
- 2026-06-24 07:00 KST 브리핑: AWS Bedrock AgentCore 멀티테넌트 예시는 gateway, tool Lambda, tenant context header, JWT authorization을 조합해 agent tool 호출을 tenant-aware하게 라우팅하는 패턴을 보여줬습니다.

## 연결 문서

- [[Knowledge/AI Systems/AI Agents|AI Agents]]
- [[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security and Governance]]
- [[Knowledge/AI Systems/Retrieval-Augmented Generation|Retrieval-Augmented Generation]]

## Source Links

- https://blog.cloudflare.com/mcp-v2/
- https://blog.cloudflare.com/webmcp/
- https://github.blog/changelog/2026-07-23-github-mcp-server-supports-the-next-mcp-specification/
- https://github.com/modelcontextprotocol/servers/releases/tag/2026.7.4
- https://github.com/modelcontextprotocol/servers/compare/2026.6.16...2026.7.4
- https://aws.amazon.com/blogs/machine-learning/build-interactive-pdf-text-extraction-from-amazon-s3/
- https://devblogs.microsoft.com/microsoft365dev/going-beyond-text-in-microsoft-365-copilot-introducing-sharepoint-copilot-apps/
- https://aws.amazon.com/blogs/machine-learning/shared-infrastructure-isolated-tenants-pool-model-multi-tenancy-with-amazon-bedrock-agentcore/
- https://github.com/vercel/ai/releases/tag/ai%407.0.10
