import assert from "node:assert/strict"

// The original 32 tracking places must survive additive source expansion.
export const CORE_COMPANY_IDS = [
  "naver",
  "kakao",
  "microsoft",
  "alphabet",
  "samsung-sds",
  "douzone",
  "amazon",
  "oracle",
  "ahnlab",
  "s1",
  "palo-alto",
  "crowdstrike",
  "samsung-electronics",
  "sk-hynix",
  "nvidia",
  "tsmc",
  "hyundai-motor",
  "doosan-robotics",
  "siemens",
  "fanuc",
  "lg-energy",
  "samsung-sdi",
  "tesla",
  "vestas",
  "samsung-biologics",
  "celltrion",
  "roche",
  "thermo-fisher",
  "hanwha-aerospace",
  "kai",
  "airbus",
  "lockheed-martin",
]

export function coreCompanies(watchlist) {
  const ids = watchlist.companies.map((company) => company.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of CORE_COMPANY_IDS) assert.ok(ids.includes(id), "Missing original company: " + id)
  return watchlist.companies.filter((company) => CORE_COMPANY_IDS.includes(company.id))
}

export const CORE_INSTITUTION_IDS = [
  "kaist",
  "snu",
  "postech",
  "unist",
  "gist",
  "kist",
  "yonsei",
  "hanyang",
  "mit",
  "stanford",
  "berkeley",
  "cmu",
  "eth",
  "cambridge",
  "oxford",
  "nus",
]

export function coreInstitutions(watchlist) {
  const ids = watchlist.institutions.map((institution) => institution.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of CORE_INSTITUTION_IDS)
    assert.ok(ids.includes(id), "Missing original institution: " + id)
  return watchlist.institutions.filter((institution) =>
    CORE_INSTITUTION_IDS.includes(institution.id),
  )
}
