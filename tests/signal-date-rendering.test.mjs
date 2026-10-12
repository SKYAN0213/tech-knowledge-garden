import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSignalDateMetadata, signalHistoryDate } from '../scripts/research/signal-dates.mjs';
import { articleDateLabel } from '../scripts/article-review.mjs';

test('a separately sourced event day survives publication-day rendering', () => {
  const signal = { event_id: 'dated-event', event_date: '2026-09-30', source_published_at: '2026-09-30', occurred_at: '2026-09-27' };
  assert.equal(assertSignalDateMetadata(signal), '2026-09-27');
  assert.equal(signalHistoryDate(signal, { publishedAt: '2026-09-30' }), '2026-09-27');
});
test('source timestamps use the Korean calendar boundary', () => {
  assert.equal(signalHistoryDate({ event_date: '2026-09-29T23:30:00Z' }), '2026-09-30');
});
test('an event after its source publication is rejected', () => {
  assert.throws(() => assertSignalDateMetadata({ event_date: '2026-09-30', occurred_at: '2026-10-01' }), /unchanged source publication date/);
});
test('signal metadata cannot change its publication date', () => {
  assert.throws(() => assertSignalDateMetadata({ event_date: '2026-09-30', source_published_at: '2026-09-29', occurred_at: '2026-09-27' }), /unchanged source publication date/);
});
test('a conflicting native event day is rejected', () => {
  assert.throws(() => assertSignalDateMetadata({ event_id: 'dated-event', event_date: '2026-09-30', occurred_at: '2026-09-27' }, { articles: [{ event_id: 'dated-event', article_review: { occurred_at: '2026-09-26' } }] }), /conflicts with the native article event date/);
});
test('source-reported event metadata is labelled as the original publication', () => {
  assert.equal(articleDateLabel({ date_kind: 'source-reported-event-date' }), '원문 게시');
  assert.equal(articleDateLabel({ date_kind: 'source-original-publication-date' }), '원문 게시');
});
