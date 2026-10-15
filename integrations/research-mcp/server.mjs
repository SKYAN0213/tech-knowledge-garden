import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { McpServer } from "@modelcontextprotocol/server"
import { serveStdio } from "@modelcontextprotocol/server/stdio"
import * as z from "zod/v4"
import { moduleCatalog } from "../../scripts/research/module-registry.mjs"
import {
  moduleContext,
  submitModuleJob,
  moduleJobStatus,
  readModuleResult,
  resumeModuleJob,
} from "../../scripts/research/module-runtime.mjs"

const result = (data) => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  structuredContent: data,
})
const guarded =
  (handler, { submission = false } = {}) =>
  async (args) => {
    try {
      const data = await handler(args)
      return {
        ...result(data),
        ...(submission && ["failed", "interrupted"].includes(data.state) ? { isError: true } : {}),
      }
    } catch (error) {
      if (error.code === "STORAGE_PENDING")
        return result({ state: "waiting_for_storage", storage_request: error.storage_request })
      return { isError: true, content: [{ type: "text", text: error.message }] }
    }
  }
const jobSchema = z.string().regex(/^module-[A-Za-z0-9_-]{1,100}$/)

export function researchServerCatalog({ modules, operations, toolProfile = "compact" } = {}) {
  if (!["detailed", "compact"].includes(toolProfile))
    throw Error("Unknown MCP tool profile; choose detailed or compact")
  const catalog = moduleCatalog(modules)
  if (operations !== undefined) {
    const available = new Set(
      catalog.modules.flatMap((module) => module.operations.map((op) => `${module.id}.${op.id}`)),
    )
    if (
      !Array.isArray(operations) ||
      !operations.length ||
      operations.length > 100 ||
      new Set(operations).size !== operations.length ||
      operations.some((id) => !available.has(id))
    )
      throw Error("Unknown or duplicate enabled operation selection")
    catalog.modules = catalog.modules.map((module) => ({
      ...module,
      operations: module.operations.filter((operation) =>
        operations.includes(`${module.id}.${operation.id}`),
      ),
    }))
  }
  return {
    ...catalog,
    tool_profile: toolProfile,
    exposed_tool_count:
      toolProfile === "compact"
        ? 5
        : 4 + catalog.modules.reduce((count, module) => count + module.operations.length, 0),
  }
}

export function researchModuleView(catalog, { module, operation, include_schemas = true } = {}) {
  if (operation && !module) throw Error("Operation contract query requires a module")
  const selected = module ? catalog.modules.filter((entry) => entry.id === module) : catalog.modules
  if (!selected.length) throw Error("Module is not enabled on this server")
  if (operation && !selected[0].operations.some((entry) => entry.id === operation))
    throw Error("Operation is not enabled on this server")
  return {
    ...catalog,
    modules: selected.map((entry) => ({
      ...entry,
      operations: entry.operations
        .filter((op) => !operation || op.id === operation)
        .map((op) => {
          if (include_schemas) return op
          const { inputSchema, ...summary } = op
          return summary
        }),
    })),
  }
}

export function createResearchServer(options = {}) {
  const ctx = moduleContext(options)
  const catalog = researchServerCatalog(options)
  const enabledOperation = (moduleId, operationId) => {
    const module = catalog.modules.find((entry) => entry.id === moduleId)
    if (!module) throw Error("Module is not enabled on this server")
    if (!module.operations.some((operation) => operation.id === operationId))
      throw Error("Unknown research module operation or operation is not enabled on this server")
    return module
  }
  const enabledJob = (jobId) => {
    const status = moduleJobStatus(ctx, jobId)
    enabledOperation(status.module, status.operation)
    return status
  }
  const server = new McpServer(
    { name: "tech-knowledge-research", version: "1.0.0" },
    {
      instructions: [
        "도메인 도구는 독립 worker의 job_id를 반환한다. research_job_status로 상태를 확인하고 completed이면 research_job_result의 next_offset이 null일 때까지 읽는다.",
        "failed/interrupted이면 error와 보존 로그를 확인한다. 같은 ID의 자동 재시도는 하지 않으며 원인 수정 후 research_job_resume을 명시 호출한다. 입력·검토 파일·코드가 바뀌면 새 job_id를 사용한다.",
        "completed는 호출 결과 저장이다. native_status의 partial·검토 대기는 기사 승인·발행 완료가 아니다. 원문과 명시 검토 없이 승인하지 않는다. publication의 준비 상태는 Drive 저장·공개 발행을 의미하지 않는다.",
        "waiting_for_reasoning은 실패가 아니라 Codex 위임 결과 대기다. reasoning.pending/read로 task_id·request_sha256와 고정 원문·출력 Schema를 읽고 reasoning.submit으로 Codex 결과를 제출하거나 reasoning.execute로 로컬 모델이 대신 처리한 뒤 원래 job_id를 명시 resume한다. 제출은 사실/편집 승인과 별개다.",
        "기본 순서는 collection/parsing → edition.freeze → classification.extract/review → curation.prepare/evaluate/select → selection.prepare → evidence.extract/review → writing/validation → knowledge → publication이다. 오늘과 이전 미수록 후보를 함께 평가하며 미검토 모델 점수는 선정 근거가 아니다. 여러 원 회차의 선정 결과는 curation.advance로 처리하며 edition.advance도 같은 native 관문을 보존한다.",
        "새 큐레이션 작성은 사실 검토 후 validation.completeness로 중요한 사실과 조건을 검토하고 completeness_reviews로 재개한다. 최종 문장과 원문을 대조한 coverage_reviews는 편집 승인과 함께 제출한다. 기존 완료 원고는 재작성하지 않는다.",
        "collection.inquiries는 기존 후속 질문을 정확한 원문으로 활성화·관찰하고 공통 targeted/followups 계획으로 전달한다. knowledge.explore는 승인 색인에서 질문 검색·용어·기간별 변화·기업 비교를 읽는다. curation.status/feedback의 시간·피드백은 비공개 운영 자료이며 기사 승인이나 점수를 자동 바꾸지 않는다.",
        "review_file은 repo 상대, edition/selection/workflow 참조는 root 상대 경로다. 모델 작업과 네트워크 수집 작업은 각각 동시1개다. 모델 출력은 검토 전 후보이며 정기 수집·검토·수정 승인의 기존 관문을 보존한다.",
        catalog.tool_profile === "compact"
          ? "compact 도구 모드: research_modules에 include_schemas=false로 가벼운 목록을 조회하고 module/operation으로 필요한 inputSchema만 읽는다. 선택한 작업은 research_execute의 module·operation·parameters로 호출한다. parameters는 해당 inputSchema를 그대로 따르며 비활성 모듈/작업이나 임의 명령은 실행할 수 없다."
          : "detailed 도구 모드: research_modules에서 계약을 확인하고 각 module_operation 도구를 호출한다.",
        `tool_profile=${catalog.tool_profile}; 노출 도구=${catalog.exposed_tool_count}`,
        `repo=${ctx.repo}; root=${ctx.root}; vault=${ctx.vault}; 활성 모듈=${catalog.modules.map((module) => module.id).join(",")}`,
      ].join("\n"),
    },
  )
  server.registerTool(
    "research_modules",
    {
      description:
        "활성 모듈·작업의 상세 inputSchema와 모델/네트워크 사용 여부, 현재 도구 모드와 노출 도구 수를 조회한다.",
      inputSchema: z.strictObject({
        module: z.string().min(1).max(100).optional(),
        operation: z.string().min(1).max(100).optional(),
        include_schemas: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    guarded((args) => researchModuleView(catalog, args)),
  )
  if (catalog.tool_profile === "compact") {
    server.registerTool(
      "research_execute",
      {
        description:
          "research_modules에 선언된 활성 module의 operation을 parameters 계약에 따라 실행하고 작업 ID를 반환한다. 기존 원문·검토·승인 검증을 유지하며 임의 명령을 받지 않는다.",
        inputSchema: z.strictObject({
          module: z.string().min(1).max(100),
          operation: z.string().min(1).max(100),
          parameters: z.record(z.string(), z.unknown()),
          job_id: jobSchema.optional(),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      guarded(
        ({ module, operation, parameters, job_id }) => {
          enabledOperation(module, operation)
          return submitModuleJob(ctx, module, operation, parameters, {
            ...(job_id ? { jobId: job_id } : {}),
            background: true,
          })
        },
        { submission: true },
      ),
    )
  } else
    for (const module of catalog.modules)
      for (const operation of module.operations) {
        const input = {
          ...operation.inputSchema,
          properties: {
            ...operation.inputSchema.properties,
            job_id: {
              type: "string",
              pattern: "^module-[A-Za-z0-9_-]{1,100}$",
              description: "동일 입력 재사용을 위한 고정 작업 ID. 생략하면 새 ID를 생성한다.",
            },
          },
        }
        server.registerTool(
          operation.tool_name,
          {
            description: `${operation.description} 독립 worker를 시작해 작업 ID를 반환한다. research_job_status/result로 조회하고 실패 후에는 명시적으로 resume한다.`,
            inputSchema: z.fromJSONSchema(input),
            annotations: {
              readOnlyHint: operation.readOnly,
              destructiveHint: false,
              idempotentHint: false,
              openWorldHint: operation.network || operation.model,
            },
          },
          guarded(
            ({ job_id, ...parameters }) =>
              submitModuleJob(ctx, module.id, operation.id, parameters, {
                ...(job_id ? { jobId: job_id } : {}),
                background: true,
              }),
            { submission: true },
          ),
        )
      }
  server.registerTool(
    "research_job_status",
    {
      description:
        "작업 실행 상태와 native 결과 상태를 구분해 조회한다. worker 종료·실패를 완료로 간주하지 않는다.",
      inputSchema: z.strictObject({ job_id: jobSchema }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    guarded(({ job_id }) => enabledJob(job_id)),
  )
  server.registerTool(
    "research_job_result",
    {
      description:
        "해시 검증한 저장 작업 결과 JSON을 문자 offset으로 나눠 읽는다. next_offset이 있으면 이어서 읽는다.",
      inputSchema: z.strictObject({
        job_id: jobSchema,
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(64000).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    guarded(({ job_id, offset, limit }) => {
      enabledJob(job_id)
      return readModuleResult(ctx, job_id, { offset, limit })
    }),
  )
  server.registerTool(
    "research_job_resume",
    {
      description:
        "실패·중단된 동일 작업만 보존 입력으로 재개한다. 완료 작업은 재실행하지 않는다. 기존 native 체크포인트와 승인 관문을 유지한다.",
      inputSchema: z.strictObject({ job_id: jobSchema }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    guarded(
      ({ job_id }) => {
        enabledJob(job_id)
        return resumeModuleJob(ctx, job_id)
      },
      { submission: true },
    ),
  )
  return server
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        repo: { type: "string" },
        root: { type: "string" },
        vault: { type: "string" },
        backlog: { type: "string" },
        policy: { type: "string" },
        modules: { type: "string" },
        operations: { type: "string" },
        "tool-profile": { type: "string" },
        "max-active-jobs": { type: "string" },
      },
    })
    const options = {
      repo: values.repo,
      root: values.root,
      vault: values.vault,
      backlog: values.backlog,
      policy: values.policy,
      ...(values["tool-profile"] !== undefined ? { toolProfile: values["tool-profile"] } : {}),
      ...(values.modules ? { modules: values.modules.split(",") } : {}),
      ...(values.operations ? { operations: values.operations.split(",") } : {}),
      ...(values["max-active-jobs"] ? { maxActiveJobs: Number(values["max-active-jobs"]) } : {}),
    }
    // Validate startup before the first protocol message; no console stdout.
    moduleContext(options)
    researchServerCatalog(options)
    await serveStdio(() => createResearchServer(options))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
