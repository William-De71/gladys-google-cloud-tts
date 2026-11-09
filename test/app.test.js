// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`) and a fake Google API
// (test/helpers/fake-google.js), a real HTTP server on 127.0.0.1. No test
// touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate as tick } from 'node:timers/promises';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { ACTIONS, createApp } from '../src/app.js';
import { TRIGGERS } from '../src/events.js';
import { WIDGETS } from '../src/widgets.js';
import { API_KEY, googleError, startFakeGoogle } from './helpers/fake-google.js';

const NOW = Date.parse('2026-11-09T10:00:00Z');

const start = async (t, config = { api_key: API_KEY }, { now = () => NOW } = {}) => {
  const api = await startFakeGoogle();
  const dir = await mkdtemp(join(tmpdir(), 'gctts-app-'));
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    baseUrl: api.url,
    sleep: async () => {},
    usageFile: join(dir, 'usage.json'),
    clipsDir: join(dir, 'clips'),
    timeZone: 'Europe/Paris',
    now,
  });
  await gladys.connect();
  await app.whenReady();
  t.after(async () => {
    app.usage.stop();
    await gladys.disconnect?.();
    await api.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { api, gladys, app, dir };
};

const lastStatus = (gladys) => gladys.fake.connectionStatuses.at(-1);
const decode = (audio) => {
  const [type, payload] = audio.split(';base64,');
  return { type, bytes: Buffer.from(payload, 'base64') };
};
const settle = async () => {
  for (let i = 0; i < 5; i += 1) {
    await tick();
  }
};

test('connects: lists the voices of the fallback language, bills nothing, status OK', async (t) => {
  const { api, gladys } = await start(t);
  assert.deepEqual(
    api.requests.map((r) => `${r.method} ${r.path} ${r.query.languageCode ?? ''}`),
    ['GET /v1/voices en'],
  );
  assert.equal(api.requests[0].key, API_KEY);
  assert.equal(lastStatus(gladys).connected, true);
});

test('without a key: status explains it, nothing is called, a clip fails clearly', async (t) => {
  const { api, gladys } = await start(t, {});
  assert.equal(api.requests.length, 0);
  assert.equal(lastStatus(gladys).connected, false);
  assert.match(JSON.stringify(lastStatus(gladys)), /Google Cloud/);
  const ack = await gladys.fake.ttsSynthesize('Bonjour', 'fr');
  assert.equal(ack.success, false);
});

test('a bad key: status down with the reason, no event before a clip', async (t) => {
  const { gladys } = await start(t, { api_key: 'AIzaWrongKey0000000000000' });
  assert.equal(lastStatus(gladys).connected, false);
  assert.match(JSON.stringify(lastStatus(gladys)), /refused the API key/);
});

test('speaks a text in the language of the user, as MP3, with the chosen family', async (t) => {
  const { api, gladys, app } = await start(t);
  const ack = await gladys.fake.ttsSynthesize('**La porte** est ouverte 🚪', 'fr');
  assert.equal(ack.success, true, JSON.stringify(ack));
  const { type, bytes } = decode(ack.data.audio);
  assert.equal(type, 'audio/mpeg');
  assert.match(bytes.toString('latin1'), /fr-FR-Chirp3-HD-Achernar\|La porte est ouverte$/);
  const sent = api.requests.at(-1).body;
  assert.deepEqual(sent.voice, { languageCode: 'fr-FR', name: 'fr-FR-Chirp3-HD-Achernar' });
  assert.deepEqual(sent.audioConfig, { audioEncoding: 'MP3' });
  assert.equal(app.usage.used(), 'La porte est ouverte'.length);
});

test('a sentence already spoken comes from the cache: no call, nothing billed', async (t) => {
  const { api, gladys, app, dir } = await start(t);
  await gladys.fake.ttsSynthesize('Le linge est prêt', 'fr');
  // The cache is written after the clip is returned.
  for (let i = 0; i < 50 && (await app.cache.stats()).files === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const calls = api.requests.length;
  const used = app.usage.used();
  const again = await gladys.fake.ttsSynthesize('Le linge est prêt', 'fr');
  assert.equal(again.success, true);
  assert.equal(api.requests.length, calls);
  assert.equal(app.usage.used(), used);
  assert.equal(app.usage.snapshot().month.cached, 1);
  assert.equal((await readdir(join(dir, 'clips'))).length, 1);
  // The button empties it.
  const cleared = await gladys.fake.action(ACTIONS.CLEAR_CACHE);
  assert.match(JSON.stringify(cleared), /1 clips removed/);
});

test('settings reach Google: male Neural2, speed, pitch, gain, profile, Ogg', async (t) => {
  const { api, gladys } = await start(t, {
    api_key: API_KEY,
    family: 'neural2',
    gender: 'male',
    speaking_rate: '1.15',
    pitch: '-2',
    volume_gain_db: '3',
    effects_profile: 'small-bluetooth-speaker-class-device',
    audio_format: 'ogg',
  });
  const ack = await gladys.fake.ttsSynthesize('Hello', 'en');
  assert.equal(ack.success, true, JSON.stringify(ack));
  // No male Neural2 voice in en-US: the female one, not another family.
  const sent = api.requests.at(-1).body;
  assert.equal(sent.voice.name, 'en-US-Neural2-F');
  assert.deepEqual(sent.audioConfig, {
    audioEncoding: 'OGG_OPUS',
    speakingRate: 1.15,
    pitch: -2,
    volumeGainDb: 3,
    effectsProfileId: ['small-bluetooth-speaker-class-device'],
  });
  assert.equal(decode(ack.data.audio).type, 'audio/ogg');
});

test('a voice typed by hand wins for its language; another language stays automatic', async (t) => {
  const { api, gladys } = await start(t, {
    api_key: API_KEY,
    voices: 'en-GB-Neural2-B, not a voice',
  });
  await gladys.fake.ttsSynthesize('Good morning', 'en');
  assert.deepEqual(api.requests.at(-1).body.voice, {
    languageCode: 'en-GB',
    name: 'en-GB-Neural2-B',
  });
  await gladys.fake.ttsSynthesize('Guten Morgen', 'de');
  assert.equal(api.requests.at(-1).body.voice.name, 'de-DE-Chirp3-HD-Aoede');
});

test('an unknown language uses the fallback language; a language without the family falls back', async (t) => {
  const { api, gladys } = await start(t, { api_key: API_KEY, fallback_language: 'fr' });
  await gladys.fake.ttsSynthesize('Bonjour', null);
  assert.equal(api.requests.at(-1).body.voice.name, 'fr-FR-Chirp3-HD-Achernar');
  const ack = await gladys.fake.ttsSynthesize('Halló', 'is');
  assert.equal(ack.success, true, JSON.stringify(ack));
  assert.equal(api.requests.at(-1).body.voice.name, 'is-IS-Standard-A');
});

test('the monthly limit: warning at 80 %, then a refused clip without calling Google', async (t) => {
  const { api, gladys, app } = await start(t, { api_key: API_KEY, monthly_limit: 100 });
  await gladys.fake.ttsSynthesize('x'.repeat(85), 'en');
  await settle();
  const warning = gladys.fake.sceneEvents.find((e) => e.key === TRIGGERS.MONTHLY_LIMIT);
  assert.equal(warning?.data.level, 'warning');
  assert.equal(warning.data.used, 85);
  assert.equal(warning.data.percent, 85);
  const calls = api.requests.length;
  const refused = await gladys.fake.ttsSynthesize('y'.repeat(20), 'en');
  await settle();
  assert.equal(refused.success, false);
  assert.equal(api.requests.length, calls);
  const reached = gladys.fake.sceneEvents.filter((e) => e.key === TRIGGERS.MONTHLY_LIMIT);
  assert.deepEqual(
    reached.map((e) => e.data.level),
    ['warning', 'reached'],
  );
  // Never an `error` for the limit: it has its own trigger.
  assert.equal(gladys.fake.sceneEvents.filter((e) => e.key === TRIGGERS.ERROR).length, 0);
  assert.equal(lastStatus(gladys).connected, false);
  assert.match(JSON.stringify(lastStatus(gladys)), /Monthly character limit/);
  // Once per level and month.
  await gladys.fake.ttsSynthesize('z'.repeat(20), 'en');
  await settle();
  assert.equal(gladys.fake.sceneEvents.filter((e) => e.key === TRIGGERS.MONTHLY_LIMIT).length, 2);
  assert.equal(app.usage.snapshot().month.refused, 2);
});

test('a failing provider: the ack fails, one error event, status down, then recovery', async (t) => {
  // French is the fallback language: its voices are listed at startup.
  const { api, gladys } = await start(t, { api_key: API_KEY, fallback_language: 'fr' });
  const billing = [
    403,
    googleError(403, 'This API method requires billing to be enabled.', 'BILLING_DISABLED'),
  ];
  api.fail(billing);
  const first = await gladys.fake.ttsSynthesize('Un', 'fr');
  api.fail(billing);
  const second = await gladys.fake.ttsSynthesize('Deux', 'fr');
  await settle();
  assert.equal(first.success, false);
  assert.equal(second.success, false);
  const errors = gladys.fake.sceneEvents.filter((e) => e.key === TRIGGERS.ERROR);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].data.kind, 'billing');
  assert.equal(errors[0].data.voice, 'fr-FR-Chirp3-HD-Achernar');
  assert.equal(errors[0].data.language, 'fr');
  assert.equal(lastStatus(gladys).connected, false);
  assert.match(JSON.stringify(lastStatus(gladys)), /billing/);

  const ok = await gladys.fake.ttsSynthesize('Trois', 'fr');
  await settle();
  assert.equal(ok.success, true);
  assert.equal(gladys.fake.sceneEvents.at(-1).key, TRIGGERS.RECOVERED);
  assert.equal(lastStatus(gladys).connected, true);
});

test('a 5xx is retried; a refused text starts no event', async (t) => {
  const { api, gladys } = await start(t);
  api.fail([503, googleError(503, 'Unavailable')]);
  const ack = await gladys.fake.ttsSynthesize('Bonjour', 'fr');
  assert.equal(ack.success, true, JSON.stringify(ack));
  const empty = await gladys.fake.ttsSynthesize('🎉 ** **', 'fr');
  await settle();
  assert.equal(empty.success, false);
  assert.equal(gladys.fake.sceneEvents.filter((e) => e.key === TRIGGERS.ERROR).length, 0);
});

test('test button: speaks a sentence and tells the voice and the month', async (t) => {
  const { gladys } = await start(t);
  const result = await gladys.fake.action(ACTIONS.TEST_VOICE, { language: 'fr' });
  const text = JSON.stringify(result);
  assert.match(text, /fr-FR-Chirp3-HD-Achernar/);
  assert.match(text, /a prononcé 61 caractères/);
  assert.match(text, /Characters this month: 61 of 950,000/);
});

test('list button: the voices of the family for a language, free', async (t) => {
  const { api, gladys } = await start(t);
  const result = await gladys.fake.action(ACTIONS.LIST_VOICES, { language: 'fr' });
  const text = JSON.stringify(result);
  assert.match(text, /3 Chirp 3 HD voices for “fr”/);
  assert.match(text, /fr-CA-Chirp3-HD-Aoede \(female\)/);
  assert.match(text, /Neural2 2/);
  assert.equal(
    api.requests.some((r) => r.path.endsWith(':synthesize')),
    false,
  );
});

test('the widget is valid in each language, with and without a key', async (t) => {
  const { gladys } = await start(t);
  await gladys.fake.ttsSynthesize('Bonjour', 'fr');
  for (const language of ['en', 'fr', 'de', 'es']) {
    const ack = await gladys.fake.widgetGet(WIDGETS.USAGE, { language });
    assert.equal(ack.success, true);
    assert.deepEqual(validateWidgetContent(ack.data.content), [], language);
    const components = ack.data.content.components;
    assert.equal(components[0].text, 'fr-FR-Chirp3-HD-Achernar');
    assert.ok(components.some((c) => c.type === 'chart'));
  }
  const { gladys: bare } = await start(t, {});
  const ack = await bare.fake.widgetGet(WIDGETS.USAGE, { language: 'fr' });
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  assert.match(JSON.stringify(ack.data.content), /Pas encore de clé/);
});

test('the counters survive a restart', async (t) => {
  const api = await startFakeGoogle();
  const dir = await mkdtemp(join(tmpdir(), 'gctts-restart-'));
  t.after(async () => {
    await api.close();
    await rm(dir, { recursive: true, force: true });
  });
  const options = {
    baseUrl: api.url,
    sleep: async () => {},
    usageFile: join(dir, 'usage.json'),
    clipsDir: join(dir, 'clips'),
    now: () => NOW,
  };
  const first = createFakeGladys({ config: { api_key: API_KEY } });
  const app1 = createApp(first, options);
  await first.connect();
  await app1.whenReady();
  await first.fake.ttsSynthesize('Bonjour', 'fr');
  await app1.usage.save();
  app1.usage.stop();

  const second = createFakeGladys({ config: { api_key: API_KEY } });
  const app2 = createApp(second, options);
  await second.connect();
  await app2.whenReady();
  assert.equal(app2.usage.used(), 7);
  app2.usage.stop();
});
