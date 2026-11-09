import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { billedCharacters, createUsage } from '../src/usage.js';

const temp = async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'gctts-usage-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'usage.json');
};

test('Google counts characters, not bytes', () => {
  assert.equal(billedCharacters('Café'), 4);
  assert.equal(billedCharacters('日本語'), 3);
  assert.equal(billedCharacters('a b'), 3, 'spaces count');
});

test('the billing month is Pacific time; the days are local to Gladys', async (t) => {
  // 2026-12-01 06:30 UTC: already December in Paris, still November in California.
  let clock = Date.parse('2026-12-01T06:30:00Z');
  const usage = createUsage({
    file: await temp(t),
    now: () => clock,
    timeZone: () => 'Europe/Paris',
  });
  usage.recordClip({ voice: 'v', family: 'neural2', characters: 100, ms: 300 });
  assert.equal(usage.monthKey(), '2026-11');
  assert.equal(usage.snapshot().today.characters, 100);
  assert.equal(usage.snapshot().days[0].date, '2026-12-01');
  clock = Date.parse('2026-12-01T09:00:00Z');
  assert.equal(usage.monthKey(), '2026-12');
  assert.equal(usage.used(), 0, 'a new billing month starts empty');
  usage.stop();
});

test('cache hits are free, refusals and errors are counted apart, alerts once a month', async (t) => {
  const clock = Date.parse('2026-11-09T10:00:00Z');
  const usage = createUsage({ file: await temp(t), now: () => clock, timeZone: () => 'UTC' });
  usage.recordClip({ voice: 'v', family: 'chirp3-hd', characters: 40, ms: 500 });
  usage.recordCached({ voice: 'v', characters: 40 });
  usage.recordRefused();
  usage.recordError({ kind: 'server', message: 'x'.repeat(500), voice: 'v' });
  const snapshot = usage.snapshot();
  assert.equal(usage.used(), 40);
  assert.deepEqual(
    [snapshot.month.clips, snapshot.month.cached, snapshot.month.saved, snapshot.month.refused],
    [1, 1, 40, 1],
  );
  assert.deepEqual(snapshot.month.by_family, { 'chirp3-hd': 40 });
  assert.equal(snapshot.today.errors, 1);
  assert.equal(snapshot.last_error.message.length, 200);
  assert.equal(snapshot.last_clip.cached, true);
  assert.equal(usage.markAlert('warning'), true);
  assert.equal(usage.markAlert('warning'), false);
  assert.equal(usage.markAlert('reached'), true);
  usage.stop();
});

test('saved and read back; a broken file starts empty', async (t) => {
  const file = await temp(t);
  const now = () => Date.parse('2026-11-09T10:00:00Z');
  const first = createUsage({ file, now });
  first.recordClip({ voice: 'v', family: 'wavenet', characters: 12, ms: 1 });
  await first.save();
  const second = createUsage({ file, now });
  await second.load();
  assert.equal(second.used(), 12);
  assert.ok(JSON.parse(await readFile(file, 'utf8')).months['2026-11']);
  await writeFile(file, '{oops');
  const third = createUsage({ file, now });
  await third.load();
  assert.equal(third.used(), 0);
  for (const usage of [first, second, third]) usage.stop();
});
