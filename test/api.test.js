import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGoogleTtsClient,
  ERROR_KINDS,
  errorMessageOf,
  genderOf,
  kindOfStatus,
} from '../src/google-api.js';
import { API_KEY, googleError, startFakeGoogle } from './helpers/fake-google.js';

test('error kinds from the status and the ErrorInfo reason', () => {
  assert.equal(kindOfStatus(400, googleError(400, 'API key not valid', 'API_KEY_INVALID')), 'auth');
  assert.equal(
    kindOfStatus(
      403,
      googleError(
        403,
        'Cloud Text-to-Speech API has not been used in project 1',
        'SERVICE_DISABLED',
      ),
    ),
    'disabled',
  );
  assert.equal(
    kindOfStatus(403, googleError(403, 'requires billing', 'BILLING_DISABLED')),
    'billing',
  );
  assert.equal(kindOfStatus(403, googleError(403, 'blocked', 'API_KEY_SERVICE_BLOCKED')), 'auth');
  assert.equal(kindOfStatus(400, googleError(400, "Voice 'x' does not exist.")), 'voice');
  assert.equal(kindOfStatus(400, googleError(400, 'Input too long')), 'request');
  assert.equal(kindOfStatus(429, googleError(429, 'Quota exceeded')), 'rate_limit');
  assert.equal(kindOfStatus(503, null), 'server');
  assert.equal(genderOf('SSML_VOICE_GENDER_UNSPECIFIED'), 'neutral');
});

test('a key never shows in an error message', () => {
  assert.equal(
    errorMessageOf({ error: { message: `Key AIzaSyA1234567890abcdefXYZ refused` } }),
    'Key AIza… refused',
  );
});

test('synthesize and list against the fake API; the key travels in the header', async (t) => {
  const api = await startFakeGoogle();
  t.after(() => api.close());
  const client = createGoogleTtsClient({ getApiKey: () => API_KEY, baseUrl: api.url });
  const voices = await client.listVoices('de');
  assert.deepEqual(
    voices.map((v) => [v.name, v.gender]),
    [
      ['de-DE-Chirp3-HD-Aoede', 'female'],
      ['de-DE-Neural2-B', 'male'],
    ],
  );
  const audio = await client.synthesize({
    input: { text: 'Hallo' },
    voice: { languageCode: 'de-DE', name: 'de-DE-Neural2-B' },
    audioConfig: { audioEncoding: 'MP3' },
  });
  assert.equal(audio[0], 0xff);
  for (const request of api.requests) {
    assert.equal(request.key, API_KEY);
    assert.equal(request.query.key, undefined, 'never in the URL');
  }
});

test('retries 429 and 5xx within the deadline, never a 400; network failures are typed', async (t) => {
  const api = await startFakeGoogle();
  t.after(() => api.close());
  const waits = [];
  const client = createGoogleTtsClient({
    getApiKey: () => API_KEY,
    baseUrl: api.url,
    sleep: async (ms) => waits.push(ms),
  });
  api.fail([429, googleError(429, 'slow down')], [500, googleError(500, 'oops')]);
  assert.equal((await client.listVoices('fr')).length > 0, true);
  assert.deepEqual(waits, [1000, 2000]);
  api.fail([400, googleError(400, 'Input too long')]);
  await assert.rejects(client.listVoices('fr'), { kind: ERROR_KINDS.REQUEST });
  api.fail(...Array.from({ length: 3 }, () => [503, googleError(503, 'down')]));
  await assert.rejects(client.listVoices('fr'), { kind: ERROR_KINDS.SERVER });
  const offline = createGoogleTtsClient({
    getApiKey: () => API_KEY,
    baseUrl: 'http://127.0.0.1:1/v1',
    sleep: async () => {},
  });
  await assert.rejects(offline.listVoices('fr'), { kind: ERROR_KINDS.UNREACHABLE });
  const keyless = createGoogleTtsClient({ getApiKey: () => '', baseUrl: api.url });
  await assert.rejects(keyless.listVoices('fr'), { kind: ERROR_KINDS.AUTH });
});

test('an answer without audio is an error', async () => {
  const client = createGoogleTtsClient({
    getApiKey: () => API_KEY,
    fetchImpl: async () => new Response('{"audioContent":""}', { status: 200 }),
  });
  await assert.rejects(client.synthesize({}), { kind: ERROR_KINDS.SERVER });
});
