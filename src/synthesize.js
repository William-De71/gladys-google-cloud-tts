// -----------------------------------------------------------------------------
// The TTS provider: one text in, one clip out.
//
// Contract (SDK README, "Text-to-speech providers"): `text` is at most 2,000
// characters, `language` the user's ("fr", null when unknown); resolve
// `<content type>;base64,<audio>` with a content type of
// TTS_AUDIO_CONTENT_TYPES and at most 5 MB decoded, within 30 s. A throw fails
// the scene action visibly and leaves the assistant reply in text: never a
// silent fallback to another voice.
//
// Order of a clip: clean the text, pick the voice, build the request; a clip
// already spoken with exactly that request comes from the cache (free);
// otherwise the monthly limit is checked BEFORE spending, then Google speaks.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { AUDIO_FORMATS, FAMILIES, monthlyLimit } from './config.js';
import { ERROR_KINDS, GoogleTtsError } from './google-api.js';
import { clipKey } from './clip-cache.js';
import { prepareText } from './text.js';
import { billedCharacters } from './usage.js';
import { LIMIT_LEVELS, WARNING_SHARE } from './events.js';

const logger = createLogger({ name: 'tts' });

/** The core waits 30 s for the ack: Google gets 25 s, retries included. */
export const SYNTHESIS_TIMEOUT_MS = 25_000;
/** Decoded size the core accepts. */
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

/**
 * @description The SynthesizeSpeechRequest of a text.
 * @param {string} text - The cleaned text.
 * @param {{ name: string, languageCode: string, family: string|null }} voice - The voice.
 * @param {object} config - The normalized config.
 * @returns {object} The request body.
 */
export function buildRequest(text, voice, config) {
  const audioConfig = { audioEncoding: AUDIO_FORMATS[config.audio_format].encoding };
  if (config.speaking_rate !== 1) {
    audioConfig.speakingRate = config.speaking_rate;
  }
  // Chirp 3 HD and Studio refuse a pitch: it is not sent to them.
  const pitchAccepted = voice.family ? FAMILIES[voice.family].pitch : true;
  if (config.pitch !== 0 && pitchAccepted) {
    audioConfig.pitch = config.pitch;
  }
  if (config.volume_gain_db !== 0) {
    audioConfig.volumeGainDb = config.volume_gain_db;
  }
  if (config.effects_profile !== 'none') {
    audioConfig.effectsProfileId = [config.effects_profile];
  }
  return {
    input: { text },
    voice: { languageCode: voice.languageCode, name: voice.name },
    audioConfig,
  };
}

/**
 * @description Build the synthesis function.
 * @param {object} options - Options.
 * @param {object} options.client - The Google client.
 * @param {object} options.voices - The voice resolver.
 * @param {object} options.cache - The clip cache.
 * @param {object} options.usage - The usage store.
 * @param {() => object} options.getConfig - The normalized config.
 * @param {(error: GoogleTtsError, context: object) => void} [options.onFailure] - After a failure.
 * @param {(clip: object) => void} [options.onSuccess] - After a clip.
 * @param {(level: string, data: object) => void} [options.onLimit] - A level of the limit crossed.
 * @param {() => number} [options.now] - Clock.
 * @returns {(text: string, language: string|null) => Promise<{ audio: string, voice: object, characters: number, cached: boolean, ms: number }>} The function.
 */
export function createSynthesizer({
  client,
  voices,
  cache,
  usage,
  getConfig,
  onFailure = () => {},
  onSuccess = () => {},
  onLimit = () => {},
  now = Date.now,
}) {
  function checkThresholds(config) {
    const limit = monthlyLimit(config);
    const used = usage.used();
    const month = usage.monthKey();
    if (used >= limit) {
      if (usage.markAlert(LIMIT_LEVELS.REACHED)) {
        onLimit(LIMIT_LEVELS.REACHED, { used, limit, month });
      }
    } else if (used >= limit * WARNING_SHARE && usage.markAlert(LIMIT_LEVELS.WARNING)) {
      onLimit(LIMIT_LEVELS.WARNING, { used, limit, month });
    }
  }

  return async function synthesize(rawText, language) {
    const config = getConfig();
    const started = now();
    let voice = null;
    try {
      if (!config.api_key) {
        throw new GoogleTtsError(ERROR_KINDS.AUTH, 'No Google Cloud API key in the configuration');
      }
      const text = prepareText(rawText);
      if (!text) {
        throw new GoogleTtsError(ERROR_KINDS.REQUEST, 'Nothing to say once the text is cleaned');
      }
      voice = await voices.resolve(config, language);
      const request = buildRequest(text, voice, config);
      const contentType = AUDIO_FORMATS[config.audio_format].contentType;
      const characters = billedCharacters(text);
      const key = clipKey(request);

      const kept = await cache.get(key);
      if (kept) {
        usage.recordCached({ voice: voice.name, characters });
        logger.debug(`Clip from the cache: ${voice.name}, ${characters} characters`);
        const clip = { voice, characters, cached: true, ms: now() - started };
        onSuccess(clip);
        return { ...clip, audio: `${contentType};base64,${kept.toString('base64')}` };
      }

      const limit = monthlyLimit(config);
      if (usage.used() + characters > limit) {
        usage.recordRefused();
        // "reached" means a clip was refused, even when the counter is a few
        // characters short of the limit.
        if (usage.markAlert(LIMIT_LEVELS.REACHED)) {
          onLimit(LIMIT_LEVELS.REACHED, { used: usage.used(), limit, month: usage.monthKey() });
        }
        throw new GoogleTtsError(
          ERROR_KINDS.LIMIT,
          `Monthly limit reached: ${usage.used()} of ${limit} characters used, this text needs ${characters}`,
        );
      }

      const audio = await client.synthesize(request, { timeoutMs: SYNTHESIS_TIMEOUT_MS });
      if (audio.length > MAX_AUDIO_BYTES) {
        throw new GoogleTtsError(
          ERROR_KINDS.REQUEST,
          `Clip of ${Math.round(audio.length / 1024)} KB, over the 5 MB Gladys accepts: choose MP3 or Ogg`,
        );
      }
      const ms = now() - started;
      usage.recordClip({ voice: voice.name, family: voice.family, characters, ms });
      logger.info(`Clip spoken: ${voice.name}, ${characters} characters, ${ms} ms`);
      checkThresholds(config);
      // The cache never delays the clip, and never fails it.
      cache.put(key, audio).catch(() => {});
      const clip = { voice, characters, cached: false, ms };
      onSuccess(clip);
      return { ...clip, audio: `${contentType};base64,${audio.toString('base64')}` };
    } catch (err) {
      const error =
        err instanceof GoogleTtsError
          ? err
          : new GoogleTtsError(ERROR_KINDS.SERVER, String(err?.message ?? err));
      if (error.kind === ERROR_KINDS.VOICE) {
        // Google may have retired the voice: list again next time.
        voices.clear();
      }
      if (error.kind !== ERROR_KINDS.LIMIT) {
        usage.recordError({ kind: error.kind, message: error.message, voice: voice?.name });
      }
      logger.warn(`Clip failed (${error.kind}): ${error.message}`);
      onFailure(error, { voice: voice?.name, language: voice?.base ?? language ?? null });
      throw error;
    }
  };
}
