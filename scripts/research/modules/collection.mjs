import fs from "node:fs"
import {
  operation,
  schema,
  id,
  day,
  text,
  list,
  integer,
  file,
  nativeResearch,
  readConfig,
  standalone,
} from "./contracts.mjs"
import {
  sourceCollectionInventory,
  saveCollectionReport,
  freezeStoredSourceFrontier,
} from "../collection-report.mjs"
import { auditSourceRoutes } from "../source-route-audit.mjs"
import { executeListScan } from "../list-scan-command.mjs"
import { recoverCollection } from "../collection-recovery.mjs"
import { dailyScan } from "../daily-scan.mjs"
import { executeTargetedSourceSearch } from "../source-targeted-search.mjs"
import { executeCandidateFollowups } from "../source-followups.mjs"
import { inquiryInputSchema, advanceInquiries } from "../inquiry-tracking.mjs"
import { sha256 } from "../contracts.mjs"
import { readJSON, safePath, withGardenOperationLock } from "../run-state.mjs"
import path from "node:path"
import { storageAction } from "../cold-storage.mjs"
import { driveStorageAction, remoteStorageActions } from "../drive-storage.mjs"

export const module = {
  id: "collection",
  title: "수집 모듈",
  inputs: ["source registry", "channel/window"],
  outputs: ["source-document/v1", "source-parse/v1", "research-list-scan/v1"],
  operations: {
    storage: operation(
      "Drive 원본과 로컬 목록/캐시를 관리한다. prepare는 보관 묶음만 준비한다. remote-status는 비밀값 없이 로컬 OAuth 상태를 조회하고 remote-pull/push/import는 사전 인증된 로컬 adapter로 정확한 ID·실제 bytes를 검증한다. 로그인은 독립 CLI에서 사람이 수행한다. evict는 검증된 동일 바이트만 정리한다.",
      schema(
        {
          action: {
            type: "string",
            enum: [
              "status",
              "prepare",
              "prepare-full",
              "prepare-delta",
              "change-manifest",
              "archive-status",
              "verify",
              "hydrate",
              "evict",
              "pending",
              "enable",
              "export",
              "import",
              ...remoteStorageActions,
            ],
          },
          regular: { type: "boolean" },
          run_id: id,
          changes_path: text,
          changes_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
          limit: integer(1, 20),
          file_id: id,
          bundle_id: text,
          metadata: { type: "object", additionalProperties: true },
          observed_at: text,
          download_path: text,
          catalog_path: text,
          expected_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
          paths: list(text, 10000),
          parent_id: text,
          cache_bytes: integer(0, 32 * 1024 ** 3),
          minimum_payload_bytes: integer(0, 1024 ** 2),
          package_bytes: integer(1024, 128 * 1024 ** 2),
          dry_run: { type: "boolean" },
        },
        ["action"],
      ),
      (ctx, { action, ...parameters }) =>
        remoteStorageActions.includes(action)
          ? driveStorageAction(ctx.repo, path.join(ctx.repo, ".local"), action, parameters)
          : storageAction(
              path.join(ctx.repo, ".local"),
              action,
              ["prepare", "prepare-full", "prepare-delta", "evict"].includes(action)
                ? { ...parameters, ignore_pid: process.pid }
                : parameters,
            ),
      { network: true },
    ),
    inquiries: operation(
      "기존 주제/관측의 후속 질문을 정확한 note·사건·양쪽 원문 인용에 묶어 준비·명시 검토·탐색 계획·상태 조회한다. 날짜 경과로 질문을 삭제하거나 계획을 실행/완료로 승격하지 않으며 원문 수집은 기존 targeted/followups에서 명시 실행한다.",
      inquiryInputSchema,
      advanceInquiries,
    ),
    inventory: operation(
      "등록 출처의 언어·분야·기술/기업 축·종류와 설정 활성·실제 접근 관측을 구분해 조회한다. 접근 검토 시각·주소 일치·목록/본문 범위를 보존하며 기사 확인이나 사건 선정을 대신하지 않는다.",
      schema({}),
      (ctx) => {
        const reference = readJSON(ctx.root, "source-route-reviews/latest.json")
        let review
        if (reference) {
          const bytes = fs.readFileSync(safePath(ctx.root, reference.path))
          if (sha256(bytes) !== reference.sha256) throw Error("Source route review changed")
          review = JSON.parse(bytes)
        }
        return sourceCollectionInventory({
          channels: readConfig(ctx, "source-channels"),
          watchlist: readConfig(ctx, "watchlist"),
          acquisition: readConfig(ctx, "acquisition"),
          recipes: readConfig(ctx, "source-recipes"),
          daily: readConfig(ctx, "daily-routes"),
          catalog: readConfig(ctx, "source-catalog"),
          review,
        })
      },
      { readOnly: true },
    ),
    audit: operation(
      "등록 주소의 공개 접근·정책·목록을 실제 조사한다. 관측 결과는 정기 활성화나 날짜 창 완료가 아니다.",
      schema({ run_id: id, channels: list(id, 250), concurrency: integer(1, 6) }, ["run_id"]),
      (ctx, p) =>
        auditSourceRoutes({
          repo: ctx.repo,
          root: ctx.root,
          runId: p.run_id,
          channels: p.channels || [],
          concurrency: p.concurrency ?? 6,
        }),
      { network: true },
    ),
    scan: operation(
      "한 출처의 [since, until) 원문·파싱을 수집한다. 동일 run은 체크포인트를 재사용하며 승인은 별도다.",
      schema(
        {
          run_id: id,
          channel: id,
          since: day,
          until: day,
          repair_source_run: id,
          recovery_source_run: id,
          policy_recheck_limit: integer(0, 3),
        },
        ["run_id", "channel", "since", "until"],
      ),
      (ctx, p) =>
        executeListScan({
          root: ctx.root,
          run: p.run_id,
          channel: [p.channel],
          since: p.since,
          until: p.until,
          ...(p.repair_source_run ? { "repair-source-run": p.repair_source_run } : {}),
          ...(p.recovery_source_run ? { "recovery-source-run": p.recovery_source_run } : {}),
          ...(p.policy_recheck_limit !== undefined
            ? { "policy-recheck-limit": p.policy_recheck_limit }
            : {}),
        }),
      { network: true },
    ),
    recover: operation(
      "고정된 수집 보고서에서 미완료 출처만 계획·보완·재개한다. 성공 원문과 동일 설정의 파싱을 재사용하고 누락 본문을 제한된 묶음으로 이어서 처리한다. 변경된 수집 설정으로도 원 관측 시각·실패 기록을 보존하며 승인·작성·발행은 수행하지 않는다.",
      schema(
        {
          run_id: { type: "string", pattern: "^[A-Za-z0-9_-]{1,70}$" },
          mode: { type: "string", enum: ["plan-only", "execute", "resume"] },
          report_path: file("root"),
          report_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
          channels: list(id, 250),
          max_routes: integer(1, 250),
          source_runs: { type: "object", maxProperties: 250, additionalProperties: id },
          max_attempts: integer(1, 10),
          time_budget_ms: integer(1, 3600000),
          retry_incomplete: { type: "boolean" },
          build_report: { type: "boolean" },
        },
        ["run_id", "mode"],
      ),
      (ctx, p) =>
        recoverCollection({
          repo: ctx.repo,
          root: ctx.root,
          runId: p.run_id,
          mode: p.mode,
          reportPath: p.report_path,
          reportSha256: p.report_sha256,
          channels: p.channels,
          sourceRuns: p.source_runs,
          maxRoutes: p.max_routes,
          maxAttempts: p.max_attempts,
          timeBudgetMs: p.time_budget_ms,
          retryIncomplete: p.retry_incomplete,
          publishReport: p.build_report,
        }),
      { network: true },
    ),
    daily: operation(
      "기존 정기 수집의 계획·실행·재개·인계를 독립 수행한다. 작성·모델·발행은 실행하지 않는다.",
      schema(
        {
          run_id: id,
          mode: { type: "string", enum: ["plan-only", "execute", "resume", "handoff"] },
          drive_snapshot_file: file(),
          max_windows: integer(1, 500),
          time_budget_ms: integer(1, 3_600_000),
        },
        ["run_id", "mode"],
      ),
      (ctx, p) =>
        withGardenOperationLock(ctx.root, () =>
          dailyScan({
            root: ctx.root,
            runId: p.run_id,
            mode: p.mode,
            vault: ctx.vault,
            backlogFile: ctx.backlog,
            driveSnapshotFile: p.drive_snapshot_file
              ? safePath(ctx.repo, p.drive_snapshot_file)
              : undefined,
            maxWindows: p.max_windows,
            timeBudgetMs: p.time_budget_ms,
          }),
        ),
      { network: true },
    ),
    targeted: operation(
      "등록 출처의 언어·분야·기술/기업 축에 맞춘 최대 8개 표적 검색을 계획·실행·재개한다. 일일 근거·정확한 저장 source-frontier 보고서·registry-only 계획을 구분하며, 혼합 partial 칸에서는 실패/미완료 경로만 후속 탐색한다. 검색 후보는 원문 확인이나 승인 결과가 아니다.",
      schema(
        {
          run_id: id,
          mode: { type: "string", enum: ["plan-only", "execute", "resume"] },
          daily_run: id,
          report_path: file("root"),
          report_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
          observation_day: day,
          languages: list({ type: "string", enum: ["ko", "en", "ja", "zh", "de"] }, 5),
          slot_ids: list(id, 32),
          max_queries: integer(1, 8),
          inquiry_plan_path: file("root"),
          inquiry_plan_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        },
        ["run_id", "mode"],
      ),
      (ctx, p) =>
        executeTargetedSourceSearch({
          repo: ctx.repo,
          root: ctx.root,
          runId: p.run_id,
          mode: p.mode,
          dailyRun: p.daily_run,
          reportPath: p.report_path,
          reportSha256: p.report_sha256,
          day: p.observation_day,
          vault: ctx.vault,
          backlogFile: ctx.backlog,
          languages: p.languages,
          slotIds: p.slot_ids,
          maxQueries: p.max_queries ?? 8,
          inquiryPlanPath: p.inquiry_plan_path,
          inquiryPlanSha256: p.inquiry_plan_sha256,
          runSearch: (input) =>
            nativeResearch(ctx, "search", input, { run_id: "run", query_path: "query" }),
        }),
      { network: true },
    ),
    followups: operation(
      "저장된 native 부모 본문의 정확한 링크에서 최대 8개 후속 출처를 계획하고 기존 원문 선택 또는 정책 수집으로 실행한다. 원문/parse SHA와 부모 인용 위치를 묶어 private 후보에 인계하며, 접근 실패·부분 본문·사실 검토 대기를 구분한다.",
      schema(
        {
          run_id: id,
          mode: { type: "string", enum: ["plan-only", "reuse", "collect"] },
          candidate_key: text,
          parent_material_id: { type: "string", pattern: "^[a-f0-9]{64}$" },
          handoff_file: file(),
          parent_source_run: id,
          source_run: id,
          target_urls: list(text, 8),
          limit: integer(1, 8),
          inquiry_plan_path: file("root"),
          inquiry_plan_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
          question_id: id,
        },
        ["run_id", "mode"],
      ),
      (ctx, p) =>
        executeCandidateFollowups({
          repo: ctx.repo,
          root: ctx.root,
          runId: p.run_id,
          mode: p.mode,
          candidateKey: p.candidate_key,
          parentMaterialId: p.parent_material_id,
          handoffFile: p.handoff_file ? safePath(ctx.repo, p.handoff_file) : undefined,
          parentSourceRun: p.parent_source_run,
          sourceRun: p.source_run,
          targetURLs: p.target_urls,
          limit: p.limit ?? 3,
          backlogFile: ctx.backlog,
          vault: ctx.vault,
          inquiryPlanPath: p.inquiry_plan_path,
          inquiryPlanSha256: p.inquiry_plan_sha256,
          questionId: p.question_id,
          runNative: (command, input) =>
            nativeResearch(
              ctx,
              command,
              {
                ...input,
                ...(command === "collect" ? { policy_recheck_limit: 0 } : {}),
              },
              {
                run_id: "run",
                source_run: "source-run",
                urls: "url",
                policy_recheck_limit: "policy-recheck-limit",
              },
            ),
        }),
      { network: true },
    ),
    report: operation(
      "저장된 일일 회차 또는 명시한 출처별 수집 창의 원문·파싱·실행 시간·용량 목록을 고정한다. 원문·보류 실패의 기존 시각을 유지하며 다시 수집하지 않는다.",
      schema(
        {
          run_id: id,
          supplement_runs: list(id, 20),
          source_runs: list(
            schema({ run_id: id, policy_recheck_limit: integer(0, 3) }, ["run_id"]),
            500,
            1,
          ),
          held_sources: list(
            schema(
              {
                run_id: id,
                requested_window: schema({ since: day, until_exclusive: day }, [
                  "since",
                  "until_exclusive",
                ]),
                reason: text,
                policy_recheck_limit: integer(0, 3),
              },
              ["run_id", "requested_window", "reason"],
            ),
            250,
          ),
        },
        ["run_id"],
      ),
      async (ctx, p) => {
        if (p.held_sources && !p.source_runs)
          throw Error("Held source declarations require explicit stored source runs")
        if (p.source_runs) {
          if (p.supplement_runs?.length)
            throw Error("Stored frontier and daily supplemental inputs must remain separate")
          await freezeStoredSourceFrontier({
            root: ctx.root,
            runId: p.run_id,
            sourceRuns: p.source_runs,
            heldSources: p.held_sources || [],
          })
        }
        return saveCollectionReport({
          root: ctx.root,
          runId: p.run_id,
          supplementalRuns: p.supplement_runs || [],
        })
      },
    ),
  },
}
standalone(module, import.meta.url)
