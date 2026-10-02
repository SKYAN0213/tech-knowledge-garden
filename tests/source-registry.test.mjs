import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { registry } from "../scripts/research/discovery.mjs"
import { validateDailyRoutes } from "../scripts/research/daily-plan.mjs"

test("manufacturer routes retain native language and role without duplicating established channels", () => {
  const channels = {
    channels: [
      {
        id: "fanuc-ja",
        name: "FANUC",
        url: "https://www.fanuc.co.jp/ja/profile/pr/newsrelease/",
        language: "ja",
        kind: "company",
        sectors: ["로봇·제조"],
      },
    ],
  }
  const watchlist = {
    robot_manufacturers: [
      {
        id: "fanuc",
        name: "FANUC",
        region: "해외",
        sector: "로봇·제조",
        source_urls: [channels.channels[0].url, "https://www.fanuc.co.jp/ja/ir/announce/"],
        source_routes: [
          {
            route_id: "fanuc-ja-news",
            url: channels.channels[0].url,
            language: "ja",
            axis: "기술·제품",
            kind: "company",
            method: "html-list",
          },
          {
            route_id: "fanuc-ja-ir",
            url: "https://www.fanuc.co.jp/ja/ir/announce/",
            language: "ja",
            axis: "기업·운영",
            kind: "filing-ir",
            method: "html-list",
          },
        ],
      },
    ],
  }
  const routes = registry(channels, watchlist)
  assert.equal(routes.length, 2)
  assert.equal(routes[0].channel_id, "fanuc-ja")
  assert.deepEqual(routes[0].entity_ids, ["fanuc"])
  assert.deepEqual(routes[0].watch_groups, ["robot_manufacturers"])
  const ir = routes.find((r) => r.url.endsWith("/ir/announce/"))
  assert.equal(ir.channel_id, "route-fanuc-ja-ir")
  assert.equal(ir.language, "ja")
  assert.equal(ir.axis, "기업·운영")
  assert.equal(ir.kind, "filing-ir")
  assert.equal(ir.verification, "unverified")
})

test("ABB Destination Zukunft profile is scoped to supported article paths", () => {
  const acquisition = JSON.parse(fs.readFileSync("data/research-acquisition.json", "utf8"))
  const profile = acquisition.article_profiles.find(
    (item) => item.id === "abb-destination-zukunft-nextjs-article-v1",
  )
  assert.ok(profile)
  assert.equal(profile.options.embedded_article.format, "nextjs-page-data")
  const matches = new RegExp(profile.url_pattern)
  assert.ok(
    matches.test(
      "https://destination-zukunft.abb.com/robotik/schwerlastroboter-automatisieren-liebherr-saegezentrum/",
    ),
  )
  assert.ok(!matches.test("https://destination-zukunft.abb.com/company/about/"))
  assert.deepEqual(Object.keys(profile.options.embedded_article.module_text_fields), [
    "Post_Contentmodule_Cm_CmText",
    "Post_Contentmodule_Cm_CmPictext",
    "Post_Contentmodule_Cm_CmTextImages",
    "Post_Contentmodule_Cm_CmQuote",
  ])
})

test("Roche media release profile reads the exact release-date field", () => {
  const acquisition = JSON.parse(fs.readFileSync("data/research-acquisition.json", "utf8"))
  const profile = acquisition.article_profiles.find(
    (item) => item.id === "roche-media-release-date-v1",
  )
  assert.ok(profile)
  assert.ok(
    new RegExp(profile.url_pattern).test("https://www.roche.com/media/releases/med-cor-2026-09-17"),
  )
  assert.ok(
    new RegExp(profile.url_pattern).test("https://www.roche.com/media/releases/med-cor-2026-09-22"),
  )
  assert.ok(!new RegExp(profile.url_pattern).test("https://www.roche.com/media/about-us"))
  assert.equal(profile.options.publication_date_xpath, "//meta[@name='release-date']")
  assert.equal(profile.options.publication_date_attribute, "content")
})

test("new manufacturer routes keep stable IDs alongside an existing company with the same ID", () => {
  const company = {
    id: "doosan-robotics",
    name: "Doosan Robotics",
    region: "국내",
    sector: "로봇·제조",
    source_urls: ["https://www.doosanrobotics.com/"],
  }
  const descriptors = [
    {
      route_id: "doosan-news-en",
      url: "https://www.doosanrobotics.com/en/about/promotion/news/",
      language: "en",
      axis: "기술·제품",
      kind: "company",
      method: "html-list",
    },
    {
      route_id: "doosan-ir-en",
      url: "https://www.doosanrobotics.com/en/investment/ir/irdata/",
      language: "en",
      axis: "기업·운영",
      kind: "filing-ir",
      method: "html-list",
    },
  ]
  const manufacturer = {
    ...company,
    source_urls: descriptors.map((d) => d.url),
    source_routes: descriptors,
  }
  const run = (m) => registry({ channels: [] }, { companies: [company], robot_manufacturers: [m] })
  const before = run(manufacturer)
  const reversed = run({
    ...manufacturer,
    source_urls: [...manufacturer.source_urls].reverse(),
    source_routes: [...descriptors].reverse(),
  })
  assert.equal(before[0].channel_id, "watch-doosan-robotics-0")
  assert.equal(before.length, 3)
  assert.equal(new Set(before.map((r) => r.channel_id)).size, 3)
  for (const r of before)
    assert.equal(reversed.find((other) => other.url === r.url).channel_id, r.channel_id)
  assert.equal(before.find((r) => r.url === descriptors[0].url).channel_id, "route-doosan-news-en")
})

test("company geography does not become domestic just because a foreign publisher has a Korean feed", () => {
  const routes = registry(
    {
      channels: [
        {
          id: "foreign-ko",
          url: "https://example.com/ko/feed.xml",
          language: "ko",
          method: "rss",
          region: "해외",
          kind: "company",
          sectors: ["로봇·제조"],
        },
      ],
    },
    { companies: [] },
  )
  assert.equal(routes[0].region, "해외")
  assert.equal(routes[0].method, "rss")
})

test("invalid route descriptors fail explicitly instead of silently changing language, role or host", () => {
  const valid = {
    route_id: "native",
    url: "https://example.com/news/",
    language: "ja",
    axis: "기술·제품",
    kind: "company",
    method: "html-list",
  }
  const call = (descriptor) =>
    registry(
      { channels: [] },
      {
        robot_manufacturers: [
          {
            id: "maker",
            name: "Manufacturer",
            region: "해외",
            sector: "로봇·제조",
            source_urls: [valid.url],
            source_routes: [descriptor],
          },
        ],
      },
    )
  for (const replacement of [
    { language: "xx" },
    { axis: "automatic-success" },
    { url: "http://127.0.0.1/private" },
    { method: "shell" },
  ])
    assert.throws(
      () => call({ ...valid, ...replacement }),
      /route|URL|address|host|private|public/i,
    )
  assert.throws(() => call({ ...valid, url: "https://other.example/news/" }), /source_urls/)
})

test("the additive robot registry preserves eight-sector companies and institutions", () => {
  const watchlist = JSON.parse(
    fs.readFileSync(new URL("../data/research-watchlist.json", import.meta.url)),
  )
  const channels = JSON.parse(
    fs.readFileSync(new URL("../data/research-source-channels.json", import.meta.url)),
  )
  assert.equal(watchlist.companies.length, 32)
  assert.equal(watchlist.institutions.length, 16)
  assert.equal(watchlist.robot_manufacturers.length, 15)
  assert.equal(new Set(watchlist.robot_manufacturers.map((c) => c.id)).size, 15)
  const routes = registry(channels, watchlist)
  assert.equal(new Set(routes.map((c) => c.url)).size, routes.length)
  const oldRoutes = registry(channels, {
    companies: watchlist.companies,
    institutions: watchlist.institutions,
  })
  for (const old of oldRoutes)
    assert.ok(
      routes.some((r) => r.channel_id === old.channel_id && r.url === old.url),
      old.channel_id,
    )
  for (const maker of watchlist.robot_manufacturers)
    assert.ok(
      routes.some(
        (r) => r.entity_ids?.includes(maker.id) && r.watch_groups?.includes("robot_manufacturers"),
      ),
      maker.id,
    )
  for (const old of channels.channels)
    assert.ok(
      routes.some((r) => r.channel_id === old.id && r.url === old.url),
      old.id,
    )
})

test("company and institution watchlist sources retain their editorial source kind", () => {
  const watchlist = JSON.parse(
    fs.readFileSync(new URL("../data/research-watchlist.json", import.meta.url)),
  )
  const channels = JSON.parse(
    fs.readFileSync(new URL("../data/research-source-channels.json", import.meta.url)),
  )
  const routes = registry(channels, watchlist)
  const byOwner = (id) => routes.find((route) => route.publisher_id === id)

  assert.equal(routes.length, 118)
  assert.ok(routes.every((route) => route.kind))
  assert.equal(byOwner("microsoft").kind, "filing-ir")
  assert.equal(byOwner("kaist").kind, "commercialization")
  assert.equal(byOwner("snu").kind, "research")
  assert.equal(byOwner("naver").kind, "company")
  assert.ok(routes.some((route) => route.channel_id === "route-doosan-news-ko"))
  assert.ok(routes.some((route) => route.channel_id === "route-doosan-news-en"))
  const ieeeRobotics = routes.find((route) => route.channel_id === "ieee-spectrum-robotics")
  assert.equal(ieeeRobotics.method, "rss")
  assert.equal(ieeeRobotics.kind, "industry-press")
  const awsWhatsNew = routes.find((route) => route.channel_id === "aws-whats-new-rss")
  assert.equal(awsWhatsNew.method, "rss")
  assert.equal(awsWhatsNew.url, "https://aws.amazon.com/about-aws/whats-new/recent/feed/")
  assert.equal(ieeeRobotics.axis, "기술·제품")
  const acquisition = JSON.parse(
    fs.readFileSync(new URL("../data/research-acquisition.json", import.meta.url)),
  )
  const bostonDynamics = registry(channels, watchlist, acquisition).find(
    (route) => route.channel_id === "boston-dynamics-blog",
  )
  assert.equal(bostonDynamics.method, "html-list")
  assert.equal(bostonDynamics.api_profile.id, "wordpress-rest-posts-json-v1")
  assert.equal(bostonDynamics.kind, "company")
  const dailyRoutes = JSON.parse(
    fs.readFileSync(new URL("../data/research-daily-routes.json", import.meta.url)),
  )
  assert.deepEqual(
    dailyRoutes.routes.find((route) => route.channel_id === "route-doosan-news-ko"),
    {
      channel_id: "route-doosan-news-ko",
      enabled: true,
      baseline_run: "20261001-doosan-ko-today-v1",
    },
  )
  assert.deepEqual(
    dailyRoutes.routes.find((route) => route.channel_id === "ieee-spectrum-robotics"),
    {
      channel_id: "ieee-spectrum-robotics",
      enabled: true,
      baseline_run: "ieee-spectrum-robotics-20261002-v3",
    },
  )
  assert.throws(
    () =>
      registry(
        { channels: [] },
        {
          companies: [
            {
              id: "unknown-kind",
              name: "Unknown Kind",
              source_kind: "maybe-news",
              region: "해외",
              source_urls: ["https://example.org/"],
            },
          ],
        },
      ),
    /Invalid source route contract/,
  )
})

test("Yaskawa keeps its original global route and adds news, product, and IR routes", () => {
  const watchlist = JSON.parse(
    fs.readFileSync(new URL("../data/research-watchlist.json", import.meta.url)),
  )
  const channels = JSON.parse(
    fs.readFileSync(new URL("../data/research-source-channels.json", import.meta.url)),
  )
  const acquisition = JSON.parse(
    fs.readFileSync(new URL("../data/research-acquisition.json", import.meta.url)),
  )
  const daily = JSON.parse(
    fs.readFileSync(new URL("../data/research-daily-routes.json", import.meta.url)),
  )
  const routes = registry(channels, watchlist, acquisition)
  const byId = (id) => routes.find((route) => route.channel_id === id)

  assert.equal(byId("route-yaskawa-news-en").url, "https://www.yaskawa-global.com/newsrelease")
  assert.equal(
    byId("route-yaskawa-company-news-en").url,
    "https://www.yaskawa-global.com/category/news",
  )
  assert.equal(
    byId("route-yaskawa-product-en").url,
    "https://www.yaskawa-global.com/category/product",
  )
  assert.equal(byId("route-yaskawa-ir-en").url, "https://www.yaskawa-global.com/category/ir")
  assert.equal(byId("route-yaskawa-ir-en").kind, "filing-ir")
  assert.equal(
    byId("route-yaskawa-company-news-en").listing_profile.rule_id,
    "yaskawa-global-company-news-v1",
  )
  assert.equal(
    byId("route-yaskawa-product-en").listing_profile.rule_id,
    "yaskawa-global-product-list-v1",
  )
  assert.equal(byId("route-yaskawa-ir-en").listing_profile.rule_id, "yaskawa-global-ir-results-v1")
  assert.ok(
    new RegExp(byId("route-yaskawa-ir-en").item_pattern).test(
      "https://www.yaskawa-global.com/ir/materials/annual",
    ),
  )
  assert.equal(
    byId("route-yaskawa-company-news-en").item_pattern.includes("newsrelease/news/"),
    true,
  )
  assert.equal(
    byId("route-yaskawa-product-en").item_pattern.includes("/newsrelease/product/"),
    true,
  )
  assert.deepEqual(
    validateDailyRoutes(daily, routes)
      .filter((route) => route.channel_id.startsWith("route-yaskawa-"))
      .map((route) => route.channel_id),
    ["route-yaskawa-company-news-en", "route-yaskawa-product-en", "route-yaskawa-ir-en"],
  )
  assert.ok(
    acquisition.article_profiles
      .filter((profile) => profile.id.startsWith("yaskawa-ir-"))
      .every((profile) => profile.options.publication_date_from_listing === true),
  )
  assert.ok(
    acquisition.article_profiles
      .filter(
        (profile) =>
          !profile.id.startsWith("yaskawa-ir-") && profile.id !== "robotsguide-robotics-article-v1",
      )
      .every((profile) => profile.options.publication_date_from_listing !== true),
  )
  assert.equal(
    acquisition.article_profiles.find((profile) => profile.id === "robotsguide-robotics-article-v1")
      .options.publication_date_from_listing,
    true,
  )
  assert.ok(
    acquisition.article_profiles.some(
      (profile) =>
        profile.id === "yaskawa-global-news-detail-v1" &&
        new RegExp(profile.url_pattern).test(
          "https://www.yaskawa-global.com/newsrelease/product/179972",
        ),
    ),
  )
  assert.ok(
    acquisition.article_profiles.some(
      (profile) =>
        profile.id === "yaskawa-vision-dash-35-announcement-pdf-v1" &&
        new RegExp(profile.url_pattern).test(
          "https://www.yaskawa-global.com/wp-content/uploads/2026/05/20260522_en.pdf",
        ),
    ),
  )
  const annualReport = acquisition.article_profiles.find(
    (profile) => profile.id === "yaskawa-ir-annual-report-landing-v1",
  )
  assert.ok(annualReport)
  assert.equal(annualReport.options.publication_date_from_listing, true)
  assert.ok(
    new RegExp(annualReport.url_pattern).test("https://www.yaskawa-global.com/ir/materials/annual"),
  )
  const strategySection = acquisition.article_profiles.find(
    (profile) => profile.id === "yaskawa-report-2026-vision-strategy-pdf-v1",
  )
  assert.ok(strategySection)
  assert.equal(strategySection.options.pdf_title_pattern, "^Vision & Strategy$")
  const performanceSection = acquisition.article_profiles.find(
    (profile) => profile.id === "yaskawa-report-2026-business-performance-pdf-v1",
  )
  assert.ok(performanceSection)
  assert.equal(performanceSection.options.pdf_title_pattern, "^Business Performance and Strategy$")
})

test("FANUC dated IR disclosures are distinct from its undated quarterly archive", () => {
  const watchlist = JSON.parse(
    fs.readFileSync(new URL("../data/research-watchlist.json", import.meta.url)),
  )
  const channels = JSON.parse(
    fs.readFileSync(new URL("../data/research-source-channels.json", import.meta.url)),
  )
  const acquisition = JSON.parse(
    fs.readFileSync(new URL("../data/research-acquisition.json", import.meta.url)),
  )
  const routes = registry(channels, watchlist, acquisition)
  const dated = routes.find((r) => r.channel_id === "route-fanuc-ir-disclosures-ja")
  const quarterly = routes.find((r) => r.url === "https://www.fanuc.co.jp/ja/ir/announce/")
  assert.ok(dated)
  assert.ok(quarterly)
  assert.notEqual(dated.url, quarterly.url)
  assert.equal(dated.axis, "기업·운영")
  assert.equal(dated.kind, "filing-ir")
  assert.deepEqual(dated.entity_ids, ["fanuc"])
  assert.equal(dated.listing_profile.pagination, "single-page")
  assert.ok(
    new RegExp(dated.item_pattern).test(
      "https://www.fanuc.co.jp/ja/ir/announce_other/pdf/2026/notice20260918.pdf",
    ),
  )
  assert.ok(
    !new RegExp(dated.item_pattern).test(
      "https://www.fanuc.co.jp/ja/ir/announce/pdf/2026/financialresult202606.pdf",
    ),
  )
  const profile = acquisition.article_profiles.find(
    (item) => item.id === "fanuc-ja-ir-disclosure-buyback-202609",
  )
  assert.ok(profile)
  const resolution = acquisition.article_profiles.find(
    (item) => item.id === "fanuc-ja-ir-buyback-resolution-20260424",
  )
  assert.ok(resolution)
  assert.ok(
    new RegExp(resolution.url_pattern).test(
      "https://www.fanuc.co.jp/ja/ir/announce_other/pdf/2026/notice20260424-01.pdf",
    ),
  )
  assert.ok(
    !new RegExp(resolution.url_pattern).test(
      "https://www.fanuc.co.jp/ja/ir/announce_other/pdf/2026/notice20260424-02.pdf",
    ),
  )
  for (const day of ["03", "18"])
    assert.ok(
      new RegExp(profile.url_pattern).test(
        "https://www.fanuc.co.jp/ja/ir/announce_other/pdf/2026/notice202609" + day + ".pdf",
      ),
    )
  assert.ok(
    !new RegExp(profile.url_pattern).test(
      "https://www.fanuc.co.jp/ja/ir/announce_other/pdf/2026/notice20260920.pdf",
    ),
  )
})
