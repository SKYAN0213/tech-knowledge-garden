import test from "node:test"
import assert from "node:assert/strict"
import { articleSourceLinks } from "../scripts/site.mjs"
import { sourceLinks } from "../scripts/briefings.mjs"

test("each multi-source link names its publisher instead of an ordinal", () => {
  const urls = ["https://metr.org/blog/incident/", "https://cdn.openai.com/pdf/report.pdf"]
  assert.equal(
    articleSourceLinks(urls),
    '<a href="https://metr.org/blog/incident/">metr.org 원문 ↗</a><a href="https://cdn.openai.com/pdf/report.pdf">OpenAI 원문 ↗</a>',
  )
  assert.equal(
    sourceLinks({ article: { urls } }),
    "[metr.org 원문](https://metr.org/blog/incident/) · [OpenAI 원문](https://cdn.openai.com/pdf/report.pdf)",
  )
})
