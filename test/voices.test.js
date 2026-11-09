import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { baseLanguage, createVoices, pickVoice, preferredLocale } from '../src/voices.js';

const voice = (name, gender = 'female', codes) => ({
  name,
  gender,
  languageCodes: codes ?? [name.split('-').slice(0, 2).join('-')],
});
const FRENCH = [
  voice('fr-CA-Chirp3-HD-Aoede'),
  voice('fr-FR-Chirp3-HD-Zephyr'),
  voice('fr-FR-Chirp3-HD-Achernar'),
  voice('fr-FR-Chirp3-HD-Charon', 'male'),
  voice('fr-FR-Neural2-G', 'male'),
  voice('fr-FR-Standard-A'),
];

test('languages: base and preferred locale', () => {
  assert.equal(baseLanguage('fr', 'en'), 'fr');
  assert.equal(baseLanguage('FR-ca', 'en'), 'fr');
  assert.equal(baseLanguage(null, 'de'), 'de');
  assert.equal(baseLanguage('???', 'de'), 'de');
  assert.equal(preferredLocale('fr', 'fr'), 'fr-FR');
  assert.equal(preferredLocale('fr', 'fr-ca'), 'fr-CA');
  assert.equal(preferredLocale('is', 'is'), '');
});

test('picks in the locale, family and gender asked, always the same voice', () => {
  const pick = (options) =>
    pickVoice(FRENCH, {
      base: 'fr',
      locale: 'fr-FR',
      family: 'chirp3-hd',
      gender: 'female',
      ...options,
    });
  assert.equal(pick().name, 'fr-FR-Chirp3-HD-Achernar', 'alphabetical order');
  assert.equal(pick({ gender: 'male' }).name, 'fr-FR-Chirp3-HD-Charon');
  assert.equal(pick({ locale: 'fr-CA' }).name, 'fr-CA-Chirp3-HD-Aoede');
  assert.deepEqual(pick({ family: 'neural2' }), {
    name: 'fr-FR-Neural2-G',
    languageCode: 'fr-FR',
    family: 'neural2',
  });
  // No WaveNet voice: Chirp 3 HD first in the fallback order.
  assert.equal(pick({ family: 'wavenet' }).family, 'chirp3-hd');
  assert.equal(
    pickVoice(FRENCH, { base: 'de', locale: 'de-DE', family: 'neural2', gender: 'male' }),
    null,
  );
});

test('the lists are kept a day per language; typed voices skip the call', async () => {
  let clock = 0;
  const calls = [];
  const voices = createVoices({
    client: { listVoices: async (base) => (calls.push(base), FRENCH) },
    now: () => clock,
  });
  const config = normalizeConfig({ voices: 'en-GB-Neural2-B' });
  assert.equal((await voices.resolve(config, 'fr')).name, 'fr-FR-Chirp3-HD-Achernar');
  await voices.resolve(config, 'fr-FR');
  clock += 25 * 3600 * 1000;
  await voices.resolve(config, 'fr');
  assert.deepEqual(calls, ['fr', 'fr']);
  assert.deepEqual(await voices.resolve(config, 'en'), {
    name: 'en-GB-Neural2-B',
    languageCode: 'en-GB',
    family: 'neural2',
    base: 'en',
  });
  assert.equal(calls.length, 2);
  await assert.rejects(voices.resolve(normalizeConfig(), 'de'), { kind: 'voice' });
});
