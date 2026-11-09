// -----------------------------------------------------------------------------
// Connection status and the buttons of the Configuration screen.
//
// The status says whether Google can speak: a key is there, Google accepts it
// for Text-to-Speech, and a voice exists for the fallback language. Listing
// voices proves the key and the API without billing a character — but not
// that billing is enabled on the project: only "Test the voice" tells, by
// speaking a short sentence on purpose.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { FAMILIES, familyOfVoice, localeOfVoice, monthlyLimit } from './config.js';
import { ERROR_KINDS, GoogleTtsError } from './google-api.js';
import { all, formatNumber, t } from './i18n.js';

const logger = createLogger({ name: 'connection' });

/** Voices listed by the "List the voices" button, at most. */
const LIST_MAX = 40;

/** The test sentence of the languages the runtime texts do not cover. */
const MORE_SENTENCES = {
  it: 'Ciao, sono la voce di Gladys. A casa va tutto bene.',
  nl: 'Hallo, ik ben de stem van Gladys. Thuis is alles in orde.',
  pt: 'Olá, sou a voz da Gladys. Está tudo bem em casa.',
};

/**
 * @description The test sentence of a language.
 * @param {string} language - "fr", "it".
 * @returns {string} The sentence.
 */
export function testSentence(language) {
  return MORE_SENTENCES[language] ?? t('testSentence', language);
}

/**
 * @description The localized reason of a failure.
 * @param {unknown} err - The error.
 * @returns {object} `{ en, fr, de, es }`.
 */
export function failureMessage(err) {
  const kind = err instanceof GoogleTtsError ? err.kind : ERROR_KINDS.SERVER;
  switch (kind) {
    case ERROR_KINDS.AUTH:
      return all('statusBadKey');
    case ERROR_KINDS.DISABLED:
      return all('statusDisabled');
    case ERROR_KINDS.BILLING:
      return all('statusBilling');
    case ERROR_KINDS.VOICE:
      return all('statusNoVoice', { detail: err?.message ?? '' });
    case ERROR_KINDS.RATE_LIMIT:
      return all('statusRateLimited');
    case ERROR_KINDS.LIMIT:
      return all('statusLimit');
    case ERROR_KINDS.UNREACHABLE:
    case ERROR_KINDS.TIMEOUT:
      return all('statusUnreachable');
    default:
      return all('statusApiError', { detail: err?.message ?? String(err) });
  }
}

/**
 * @description Check the configuration against Google, without billing a
 * character.
 * @param {object} voices - The voice resolver.
 * @param {object} config - The normalized config.
 * @returns {Promise<{ ok: boolean, message?: object, warnings: Array<object>, voice?: object }>} The result.
 */
export async function checkConnection(voices, config) {
  if (!config.api_key) {
    return { ok: false, message: all('statusNoKey'), warnings: [] };
  }
  const warnings = [];
  let voice;
  try {
    voice = await voices.resolve(config, config.fallback_language);
    // Voices typed by hand: each must exist, or its language goes silent.
    for (const name of config.voices) {
      const base = localeOfVoice(name).split('-')[0].toLowerCase();
      const listed = await voices.list(base);
      if (!listed.some((entry) => entry.name === name)) {
        warnings.push(all('warnUnknownVoice', { voice: name }));
      }
    }
  } catch (err) {
    logger.warn(`Connection check failed: ${err?.message ?? err}`);
    return { ok: false, message: failureMessage(err), warnings };
  }
  if (voice.family && voice.family !== config.family && !config.voices.includes(voice.name)) {
    warnings.push(
      all('warnFamilyFallback', {
        family: FAMILIES[config.family].name,
        voice: voice.name,
      }),
    );
  }
  return { ok: true, warnings, voice };
}

/**
 * @description The "Test the voice" action: one short real clip.
 * @param {Function} synthesize - The synthesis function.
 * @param {object} usage - The usage store.
 * @param {object} config - The normalized config.
 * @param {{ language?: string, text?: string }} fields - The form.
 * @returns {Promise<object>} The message shown under the button.
 */
export async function testVoice(synthesize, usage, config, fields = {}) {
  if (!config.api_key) {
    return all('statusNoKey');
  }
  const language =
    typeof fields.language === 'string' && fields.language
      ? fields.language
      : config.fallback_language;
  const typed = typeof fields.text === 'string' ? fields.text.trim().slice(0, 300) : '';
  try {
    const clip = await synthesize(typed || testSentence(language), language);
    const bytes = Buffer.from(clip.audio.split(';base64,')[1] ?? '', 'base64').length;
    return all((lang) =>
      [
        t(clip.cached ? 'testCached' : 'testSpoken', lang, {
          voice: clip.voice.name,
          characters: formatNumber(clip.characters, lang, 0),
          seconds: formatNumber(clip.ms / 1000, lang, 1),
          kb: formatNumber(bytes / 1024, lang, 0),
        }),
        t('testMonth', lang, {
          used: formatNumber(usage.used(), lang, 0),
          limit: formatNumber(monthlyLimit(config), lang, 0),
        }),
      ].join('\n'),
    );
  } catch (err) {
    return failureMessage(err);
  }
}

/**
 * @description The "List the voices" action.
 * @param {object} voices - The voice resolver.
 * @param {object} config - The normalized config.
 * @param {{ language?: string }} fields - The form.
 * @returns {Promise<object>} The message shown under the button.
 */
export async function listVoices(voices, config, fields = {}) {
  if (!config.api_key) {
    return all('statusNoKey');
  }
  const base = (typeof fields.language === 'string' && fields.language) || config.fallback_language;
  try {
    const listed = await voices.list(base);
    const family = FAMILIES[config.family];
    const ofFamily = listed
      .filter((voice) => familyOfVoice(voice.name) === config.family)
      .sort((a, b) => a.name.localeCompare(b.name));
    const counts = {};
    for (const voice of listed) {
      const key = familyOfVoice(voice.name);
      const name = key ? FAMILIES[key].name : 'other';
      counts[name] = (counts[name] ?? 0) + 1;
    }
    return all((language) => {
      const lines = [
        t('listHeader', language, {
          count: ofFamily.length,
          family: family.name,
          language: base,
        }),
      ];
      for (const voice of ofFamily.slice(0, LIST_MAX)) {
        lines.push(`${voice.name} (${t(`gender_${voice.gender || 'neutral'}`, language)})`);
      }
      if (ofFamily.length > LIST_MAX) {
        lines.push(t('listMore', language, { count: ofFamily.length - LIST_MAX }));
      }
      lines.push(
        t('listOthers', language, {
          families:
            Object.entries(counts)
              .filter(([name]) => name !== family.name)
              .map(([name, count]) => `${name} ${count}`)
              .join(', ') || '–',
        }),
      );
      return lines.join('\n');
    });
  } catch (err) {
    return failureMessage(err);
  }
}
