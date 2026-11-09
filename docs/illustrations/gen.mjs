// Widget contents for the generated illustrations, built by the real code of
// the integration: the app itself (src/app.js) wired to the fake Gladys of the
// SDK and the fake Google API of the tests (a real local HTTP server), on a
// made-up Thursday, 12 November 2026 at 18:00 in Paris, after two weeks of
// made-up announcements (seeded random numbers), some of them repeated (read
// from the clip cache) and one rate-limit error this morning, with a monthly
// limit of 60,000 characters so the gauge shows something. Never real data.
// Written as JSON for render.js: node gen.mjs <repo> <out.json>

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (file) => import(pathToFileURL(join(repo, file)).href);
const { createApp } = await load('src/app.js');
const { LANGUAGES } = await load('src/i18n.js');
const { createFakeGladys } = await import(
  pathToFileURL(join(repo, 'node_modules/@gladysassistant/integration-sdk/lib/testing.js')).href
);
const { startFakeGoogle, googleError, API_KEY } = await load('test/helpers/fake-google.js');

const manifest = JSON.parse(readFileSync(join(repo, 'gladys-assistant-integration.json'), 'utf8'));
const WIDGET_KEYS = ['usage'];
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 12, 17, 0, 0);

// A small seeded generator (mulberry32): the same picture at every run.
function random(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @description One language: the usage widget.
 * @param {string} language - Language.
 * @returns {Promise<object>} The widget contents.
 */
async function contents(language) {
  const next = random(20261109);
  const clock = { now: NOW - 14 * DAY };
  const api = await startFakeGoogle();
  const dir = mkdtempSync(join(tmpdir(), 'gctts-illustration-'));
  const gladys = createFakeGladys({
    config: { api_key: API_KEY, fallback_language: 'fr', gender: 'male', monthly_limit: 60000 },
  });
  const app = createApp(gladys, {
    baseUrl: api.url,
    sleep: async () => {},
    usageFile: join(dir, 'usage.json'),
    clipsDir: join(dir, 'clips'),
    now: () => clock.now,
    timeZone: 'Europe/Paris',
  });
  await gladys.connect();
  await app.whenReady();
  const REPEATED = [
    'La porte du garage est ouverte.',
    'Le lave-linge a terminé.',
    'Bonne nuit, toutes les lumières sont éteintes.',
  ];
  let serial = 0;
  for (let day = 14; day >= 0; day -= 1) {
    const clips = day === 0 ? 9 : 6 + Math.floor(next() * 14);
    for (let i = 0; i < clips; i += 1) {
      clock.now = NOW - day * DAY - (clips - i) * 40 * 60 * 1000;
      const text =
        next() < 0.35
          ? REPEATED[Math.floor(next() * REPEATED.length)]
          : `Annonce ${(serial += 1)} : ${'la température du salon est de vingt et un degrés. '.repeat(1 + Math.floor(next() * 5))}`;
      await gladys.fake.ttsSynthesize(text, 'fr');
    }
    if (day === 0) {
      clock.now = NOW - 8 * HOUR;
      api.fail(...Array.from({ length: 3 }, () => [429, googleError(429, 'Quota exceeded')]));
      await gladys.fake.ttsSynthesize('Erreur volontaire', 'fr');
    }
  }
  clock.now = NOW - 3 * 60 * 1000;
  await gladys.fake.ttsSynthesize('Le colis est arrivé devant la porte.', 'fr');
  clock.now = NOW;
  const result = {};
  for (const key of WIDGET_KEYS) {
    result[key] = (await gladys.fake.widgetGet(key, { language })).data.content;
  }
  app.usage.stop();
  await gladys.fake.shutdown();
  await api.close();
  rmSync(dir, { recursive: true, force: true });
  return result;
}

const all = {};
for (const language of LANGUAGES) {
  all[language] = await contents(language);
}

const card = (key) => {
  const widget = manifest.widgets.find((item) => item.key === key);
  return { icon: widget.icon, label: widget.label };
};
writeFileSync(
  out,
  JSON.stringify({
    contents: all,
    images: {},
    cards: Object.fromEntries(WIDGET_KEYS.map((key) => [key, card(key)])),
  }),
);
