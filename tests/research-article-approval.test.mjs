import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { recordArticleApproval } from "../scripts/research/article-approval.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "article-approval-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

const decision = { status: "approved", draft_id: "draft-1", reviewer: "editor" }
const article = {
  event_id: "0123456789abcdef",
  article_review: { review_status: "verified" },
}

test("editorial approval checkpoints are create-only and exact retries are reusable", (t) => {
  const root = fixture(t)
  assert.deepEqual(recordArticleApproval(root, "article-run", decision, article), {
    event_id: article.event_id,
    status: "approved",
    reused: false,
  })
  const firstDecision = fs.readFileSync(
    path.join(root, "runs/article-run/editorial-review.json"),
    "utf8",
  )
  const firstArticle = fs.readFileSync(
    path.join(root, "runs/article-run/approved-article.json"),
    "utf8",
  )

  assert.deepEqual(recordArticleApproval(root, "article-run", decision, article), {
    event_id: article.event_id,
    status: "approved",
    reused: true,
  })
  assert.equal(
    fs.readFileSync(path.join(root, "runs/article-run/editorial-review.json"), "utf8"),
    firstDecision,
  )
  assert.equal(
    fs.readFileSync(path.join(root, "runs/article-run/approved-article.json"), "utf8"),
    firstArticle,
  )
})

test("changed approval or an incomplete checkpoint cannot overwrite the approved run", (t) => {
  const root = fixture(t)
  recordArticleApproval(root, "article-run", decision, article)
  assert.throws(
    () => recordArticleApproval(root, "article-run", { ...decision, reviewer: "other" }, article),
    /immutable.*new run/i,
  )
  assert.throws(
    () =>
      recordArticleApproval(root, "article-run", decision, {
        ...article,
        title: "Changed after approval",
      }),
    /immutable.*new run/i,
  )

  fs.unlinkSync(path.join(root, "runs/article-run/approved-article.json"))
  assert.throws(
    () => recordArticleApproval(root, "article-run", decision, article),
    /incomplete.*new run/i,
  )
})

test("approval checkpoint rejects invalid run ids and unverified projections", (t) => {
  const root = fixture(t)
  assert.throws(() => recordArticleApproval(root, "../escape", decision, article), /run id/i)
  assert.throws(
    () =>
      recordArticleApproval(root, "article-run", decision, {
        ...article,
        article_review: { review_status: "unreviewed" },
      }),
    /verified article/i,
  )
})
