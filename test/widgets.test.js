import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from '../src/config.js';
import { buildUsageWidget, compact } from '../src/widgets.js';

const NOW = Date.parse('2026-11-09T10:00:00Z');
const snapshot = (overrides = {}) => ({
  month: { characters: 0, clips: 0, cached: 0, saved: 0, refused: 0, by_family: {} },
  today: { characters: 0, clips: 0, cached: 0, errors: 0 },
  days: [],
  last_clip: null,
  last_error: null,
  ...overrides,
});
const statusOf = (content) => content.components.find((c) => c.type === 'status').items;

test('valid in each language, with a chart once a clip was spoken', () => {
  const busy = snapshot({
    month: { characters: 812_345, clips: 120, cached: 45, saved: 1800, refused: 0, by_family: {} },
    today: { characters: 900, clips: 12, cached: 4, errors: 1 },
    days: [
      { date: '2026-11-08', characters: 1200 },
      { date: '2026-11-09', characters: 900 },
    ],
    last_clip: { at: NOW - 120_000, characters: 54, cached: false },
    last_error: { at: NOW - 3_600_000, kind: 'rate_limit' },
  });
  for (const language of ['en', 'fr', 'de', 'es']) {
    const content = buildUsageWidget({
      snapshot: busy,
      config: normalizeConfig({ api_key: 'k' }),
      failing: null,
      voice: 'fr-FR-Chirp3-HD-Achernar',
      language,
      now: NOW,
      timeZone: 'Europe/Paris',
    });
    assert.deepEqual(validateWidgetContent(content), [], language);
    assert.ok(content.components.length <= 8);
    const gauge = content.components.find((c) => c.type === 'gauge');
    assert.equal(gauge.value, 85.5);
    assert.equal(gauge.color, 'warning');
    assert.equal(content.components.find((c) => c.type === 'value').value.length <= 12, true);
  }
});

test('states: no key, failing, limit reached', () => {
  const base = { snapshot: snapshot(), voice: null, language: 'en', now: NOW, timeZone: 'UTC' };
  const noKey = buildUsageWidget({ ...base, config: normalizeConfig(), failing: null });
  assert.deepEqual(validateWidgetContent(noKey), []);
  assert.equal(statusOf(noKey)[0].value, 'No API key');
  const failing = buildUsageWidget({
    ...base,
    config: normalizeConfig({ api_key: 'k' }),
    failing: { kind: 'auth', since: NOW - 60_000 },
  });
  assert.match(statusOf(failing)[0].value, /^Failing since 09:59$/);
  const reached = buildUsageWidget({
    ...base,
    snapshot: snapshot({ month: { ...snapshot().month, characters: 1000 } }),
    config: normalizeConfig({ api_key: 'k', monthly_limit: 1000 }),
    failing: null,
  });
  assert.equal(statusOf(reached)[0].value, 'Monthly limit reached');
  assert.equal(reached.components.find((c) => c.type === 'gauge').color, 'danger');
});

test('compact numbers fit a tile', () => {
  assert.equal(compact(950_000, 'en'), '950K');
  assert.equal(compact(3_800_000, 'fr').replace(/\s/g, ' '), '3,8 M');
});
