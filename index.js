// -----------------------------------------------------------------------------
// Entry point of the Google Cloud Text-to-Speech external integration.
//
// A text-to-speech provider (manifest `type: "tts"`): once an administrator
// selects it in Settings, Artificial Intelligence, "Voice", every clip of the
// Gladys instance — the "play a notification" scene action, the replies of
// the voice assistant — is spoken by a Google Cloud voice (Chirp 3 HD,
// Neural2, WaveNet…) with the administrator's own API key. On top of that:
//   - a monthly character limit, the free allowance by default;
//   - a clip cache: a sentence already spoken is not billed again;
//   - scene triggers: Google fails / speaks again / monthly limit;
//   - dashboard widget: characters of the month and of the day.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
//   TZ (the timezone of Gladys: the days of the usage chart)
// The SDK reads the first three: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Google Cloud Text-to-Speech integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
