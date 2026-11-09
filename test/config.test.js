import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  familyOfVoice,
  localeOfVoice,
  monthlyLimit,
  normalizeConfig,
  parseVoices,
} from '../src/config.js';

test('defaults fill an empty or broken configuration, numbers from the selects', () => {
  const empty = normalizeConfig();
  assert.equal(empty.family, 'chirp3-hd');
  assert.equal(empty.speaking_rate, 1);
  assert.equal(empty.pitch, 0);
  assert.deepEqual(empty.voices, []);
  assert.deepEqual(normalizeConfig(null), empty);
  const config = normalizeConfig({
    api_key: '  AIzaKey  ',
    family: 'journey',
    gender: 'robot',
    fallback_language: 'xx',
    speaking_rate: '9',
    pitch: '-40',
    volume_gain_db: 'loud',
    audio_format: 'flac',
    effects_profile: 'tv',
    monthly_limit: '-5',
  });
  assert.equal(config.api_key, 'AIzaKey');
  assert.equal(config.family, DEFAULT_CONFIG.family, 'an unknown family falls back');
  assert.equal(config.gender, 'female');
  assert.equal(config.fallback_language, 'en');
  assert.equal(config.speaking_rate, 2, 'clamped to Google bounds');
  assert.equal(config.pitch, -20);
  assert.equal(config.volume_gain_db, 0);
  assert.equal(config.audio_format, 'mp3');
  assert.equal(config.effects_profile, 'none');
  assert.equal(config.monthly_limit, 0);
  assert.equal(normalizeConfig({ speaking_rate: '' }).speaking_rate, 1, 'an emptied field');
  assert.equal(normalizeConfig({ monthly_limit: '250000.7' }).monthly_limit, 250001);
});

test('voices typed by hand: valid names only, one per locale', () => {
  assert.deepEqual(
    parseVoices('fr-FR-Chirp3-HD-Charon, en-GB-Neural2-B;fr-FR-Neural2-F  bad, en-US-Studio-O'),
    ['fr-FR-Chirp3-HD-Charon', 'en-GB-Neural2-B', 'en-US-Studio-O'],
  );
  assert.deepEqual(parseVoices(['de-DE-Neural2-B']), ['de-DE-Neural2-B']);
  assert.deepEqual(parseVoices(null), []);
  assert.equal(localeOfVoice('fr-CA-Chirp3-HD-Aoede'), 'fr-CA');
  assert.equal(familyOfVoice('fr-CA-Chirp3-HD-Aoede'), 'chirp3-hd');
  assert.equal(familyOfVoice('en-US-Wavenet-A'), 'wavenet');
  assert.equal(familyOfVoice('en-US-Polyglot-1'), 'polyglot');
  assert.equal(familyOfVoice('en-US-Journey-F'), null, 'a family the integration does not know');
});

test('monthly limit: 95 % of the free allowance by default, or the typed number', () => {
  assert.equal(monthlyLimit(normalizeConfig()), 950_000);
  assert.equal(monthlyLimit(normalizeConfig({ family: 'wavenet' })), 3_800_000);
  assert.equal(monthlyLimit(normalizeConfig({ family: 'standard' })), 3_800_000);
  assert.equal(monthlyLimit(normalizeConfig({ monthly_limit: 5000 })), 5000);
});
