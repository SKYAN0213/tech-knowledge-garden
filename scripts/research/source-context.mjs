// Parsing provenance may contain an entire embedded page script. Keep it in
// the immutable parse; model context uses only the resolved date fields.
export function modelSourceDates(dates) {
  return {
    published_at: dates?.published_at ?? null,
    modified_at: dates?.modified_at ?? null,
    precision: dates?.precision ?? null,
    observed_at: dates?.observed_at ?? null,
  }
}
