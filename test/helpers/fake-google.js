// A fake Cloud Text-to-Speech API on 127.0.0.1, close to the real one:
// `X-Goog-Api-Key` checked (400 API_KEY_INVALID like Google), GET /v1/voices
// with a few voices of each family, POST /v1/text:synthesize answering a
// small fake MP3 whose bytes depend on the request. `fail` queues error
// answers; `requests` records what arrived. Nothing starts on import.

import { createServer } from 'node:http';

export const API_KEY = 'AIzaFakeKeyForTheTests0123456789';

export const VOICES = [
  ['fr-FR-Chirp3-HD-Achernar', ['fr-FR'], 'FEMALE'],
  ['fr-FR-Chirp3-HD-Charon', ['fr-FR'], 'MALE'],
  ['fr-FR-Neural2-F', ['fr-FR'], 'FEMALE'],
  ['fr-FR-Neural2-G', ['fr-FR'], 'MALE'],
  ['fr-FR-Wavenet-A', ['fr-FR'], 'FEMALE'],
  ['fr-FR-Standard-A', ['fr-FR'], 'FEMALE'],
  ['fr-CA-Chirp3-HD-Aoede', ['fr-CA'], 'FEMALE'],
  ['en-US-Chirp3-HD-Achernar', ['en-US'], 'FEMALE'],
  ['en-US-Chirp3-HD-Charon', ['en-US'], 'MALE'],
  ['en-US-Neural2-F', ['en-US'], 'FEMALE'],
  ['en-US-Studio-O', ['en-US'], 'FEMALE'],
  ['en-GB-Neural2-B', ['en-GB'], 'MALE'],
  ['de-DE-Chirp3-HD-Aoede', ['de-DE'], 'FEMALE'],
  ['de-DE-Neural2-B', ['de-DE'], 'MALE'],
  ['is-IS-Standard-A', ['is-IS'], 'FEMALE'],
].map(([name, languageCodes, ssmlGender]) => ({
  name,
  languageCodes,
  ssmlGender,
  naturalSampleRateHertz: 24000,
}));

/**
 * @description A Google error body.
 * @param {number} code - The HTTP status.
 * @param {string} message - The message.
 * @param {string} [reason] - The ErrorInfo reason.
 * @returns {object} The body.
 */
export function googleError(code, message, reason) {
  return {
    error: {
      code,
      message,
      status: code === 400 ? 'INVALID_ARGUMENT' : code === 403 ? 'PERMISSION_DENIED' : 'UNKNOWN',
      details: reason
        ? [
            {
              '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
              reason,
              domain: 'googleapis.com',
            },
          ]
        : [],
    },
  };
}

/**
 * @description Start the fake API.
 * @returns {Promise<{ url: string, requests: Array<object>, fail: Function, close: Function }>} The server.
 */
export async function startFakeGoogle() {
  const requests = [];
  const failures = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const body = raw ? JSON.parse(raw) : null;
      requests.push({
        method: req.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        key: req.headers['x-goog-api-key'],
        body,
      });
      const send = (status, payload) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (failures.length > 0) {
        const [status, payload] = failures.shift();
        send(status, payload);
        return;
      }
      if (req.headers['x-goog-api-key'] !== API_KEY) {
        send(
          400,
          googleError(400, 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID'),
        );
        return;
      }
      if (req.method === 'GET' && url.pathname === '/v1/voices') {
        const language = (url.searchParams.get('languageCode') ?? '').toLowerCase();
        send(200, {
          voices: VOICES.filter((voice) =>
            voice.languageCodes.some((code) => code.toLowerCase().startsWith(language)),
          ),
        });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/text:synthesize') {
        const name = body?.voice?.name;
        if (!VOICES.some((voice) => voice.name === name)) {
          send(400, googleError(400, `Voice '${name}' does not exist.`));
          return;
        }
        const audio = Buffer.concat([
          Buffer.from([0xff, 0xfb, 0x90, 0x44]),
          Buffer.from(`${name}|${body.input.text}`),
        ]);
        send(200, { audioContent: audio.toString('base64') });
        return;
      }
      send(404, googleError(404, 'Not found'));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/v1`,
    requests,
    /**
     * @description Queue error answers.
     * @param {...[number, object]} answers - `[status, body]` pairs.
     */
    fail(...answers) {
      failures.push(...answers);
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
