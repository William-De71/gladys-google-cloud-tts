import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clipKey, createClipCache } from '../src/clip-cache.js';

const temp = async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'gctts-clips-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
};

test('the key depends on everything that shapes the sound', () => {
  const request = {
    input: { text: 'a' },
    voice: { name: 'v' },
    audioConfig: { audioEncoding: 'MP3' },
  };
  assert.match(clipKey(request), /^[0-9a-f]{40}$/);
  assert.equal(clipKey(request), clipKey(structuredClone(request)));
  assert.notEqual(
    clipKey(request),
    clipKey({ ...request, audioConfig: { audioEncoding: 'MP3', speakingRate: 1.1 } }),
  );
});

test('keeps clips, evicts the least recently used, survives a restart', async (t) => {
  const dir = await temp(t);
  let clock = 1_000_000;
  const cache = createClipCache({ dir, maxFiles: 2, now: () => (clock += 1000) });
  await cache.put('a'.repeat(40), Buffer.from('A'));
  await cache.put('b'.repeat(40), Buffer.from('B'));
  assert.equal((await cache.get('a'.repeat(40))).toString(), 'A');
  await cache.put('c'.repeat(40), Buffer.from('C'));
  assert.equal(await cache.get('b'.repeat(40)), null, 'the least recently used went');
  assert.deepEqual((await readdir(dir)).sort(), [
    'a'.repeat(40) + '.clip',
    'c'.repeat(40) + '.clip',
  ]);
  const reopened = createClipCache({ dir });
  assert.deepEqual(await reopened.stats(), { files: 2, bytes: 2 });
  assert.equal(await reopened.clear(), 2);
  assert.deepEqual(await readdir(dir), []);
});

test('a folder that cannot be written costs money, never a clip', async (t) => {
  const dir = await temp(t);
  // A file where the folder should be: every write fails at once.
  await writeFile(join(dir, 'file'), 'x');
  const errors = [];
  const cache = createClipCache({
    dir: join(dir, 'file', 'clips'),
    onError: (e) => errors.push(e),
  });
  await cache.put('d'.repeat(40), Buffer.from('D'));
  assert.equal(await cache.get('d'.repeat(40)), null);
  assert.ok(errors.length >= 1);
});
