import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { createEvents, TRIGGERS } from '../src/events.js';

test('one error per failure kind, one recovery; a refused text or the limit start nothing', async () => {
  const published = [];
  let clock = 1_000_000;
  const events = createEvents({
    publish: async (key, data) => published.push([key, data]),
    now: () => clock,
  });
  events.success();
  events.failure({ kind: 'request', message: 'nothing to say' });
  events.failure({ kind: 'limit', message: 'monthly limit' });
  events.failure(
    { kind: 'billing', message: 'HTTP 403' },
    { voice: 'fr-FR-Neural2-F', language: 'fr' },
  );
  events.failure({ kind: 'billing', message: 'HTTP 403' });
  clock += 60_000;
  events.failure({ kind: 'unreachable', message: 'ECONNREFUSED' });
  clock += 4 * 60_000;
  events.success();
  events.success();
  await tick();
  assert.deepEqual(
    published.map(([key, data]) => [key, data.kind ?? data.down_minutes]),
    [
      [TRIGGERS.ERROR, 'billing'],
      [TRIGGERS.ERROR, 'unreachable'],
      [TRIGGERS.RECOVERED, 5],
    ],
  );
  assert.deepEqual(published[0][1], {
    kind: 'billing',
    message: 'HTTP 403',
    voice: 'fr-FR-Neural2-F',
    language: 'fr',
  });
  assert.equal(events.state(), null);
});

test('monthly limit event: flat data, percentage rounded', async () => {
  const published = [];
  const events = createEvents({ publish: async (key, data) => published.push([key, data]) });
  events.limit('warning', { used: 760_123, limit: 950_000, month: '2026-11' });
  await tick();
  assert.deepEqual(published, [
    [
      TRIGGERS.MONTHLY_LIMIT,
      { level: 'warning', used: 760_123, limit: 950_000, percent: 80, month: '2026-11' },
    ],
  ]);
});

test('a publishing failure is swallowed', async () => {
  const events = createEvents({
    publish: async () => {
      throw new Error('core down');
    },
  });
  events.failure({ kind: 'server', message: 'x' });
  await tick();
  assert.equal(events.state().kind, 'server');
});
