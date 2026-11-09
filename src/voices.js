// -----------------------------------------------------------------------------
// Which voice speaks a text.
//
// Gladys gives the language of the user ("fr", "en"…; null when unknown, then
// the `fallback_language` of the configuration). A voice typed by hand for
// that language wins (`voices` field). Otherwise the voice is picked from the
// voices Google lists for the language: the locale of the language first
// (fr-FR for "fr"), the chosen family first (then Chirp 3 HD, Neural2,
// WaveNet, Standard when the family has none), the chosen gender first, and
// the first name in alphabetical order, so the voice never changes from one
// clip to the next.
//
// The lists are kept 24 hours per language: listing voices is free but slow.
// -----------------------------------------------------------------------------

import { FAMILIES, FAMILY_FALLBACK, LOCALES, familyOfVoice, localeOfVoice } from './config.js';
import { ERROR_KINDS, GoogleTtsError } from './google-api.js';

const LIST_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * @description The base language of what Gladys sends.
 * @param {unknown} language - "fr", "fr-FR", "FR", null.
 * @param {string} fallback - The language of the configuration.
 * @returns {string} "fr".
 */
export function baseLanguage(language, fallback) {
  const text = typeof language === 'string' ? language.trim() : '';
  const base = text.split(/[-_]/)[0].toLowerCase();
  return /^[a-z]{2,3}$/.test(base) ? base : fallback;
}

/**
 * @description The preferred locale of a language.
 * @param {string} base - "fr".
 * @param {unknown} language - What Gladys sent ("fr-CA" keeps its region).
 * @returns {string} "fr-FR".
 */
export function preferredLocale(base, language) {
  const text = typeof language === 'string' ? language.trim() : '';
  const [, region] = text.split(/[-_]/);
  if (region && /^[a-z]{2}$/i.test(region)) {
    return `${base}-${region.toUpperCase()}`;
  }
  return LOCALES[base] ?? '';
}

/**
 * @description Pick a voice among the listed ones.
 * @param {Array<{ name: string, languageCodes: string[], gender: string }>} voices - The voices of a language.
 * @param {object} options - `{ base, locale, family, gender }`.
 * @returns {object|null} `{ name, languageCode, family }`, null when none fits.
 */
export function pickVoice(voices, { base, locale, family, gender }) {
  const families = [family, ...FAMILY_FALLBACK.filter((key) => key !== family)];
  const ofBase = voices.filter((voice) =>
    voice.languageCodes.some((code) => code.toLowerCase().split('-')[0] === base),
  );
  const inLocale = ofBase.filter((voice) =>
    voice.languageCodes.some((code) => code.toLowerCase() === locale.toLowerCase()),
  );
  for (const pool of [inLocale, ofBase]) {
    for (const key of families) {
      const ofFamily = pool.filter((voice) => familyOfVoice(voice.name) === key);
      if (ofFamily.length === 0) {
        continue;
      }
      const ofGender = ofFamily.filter((voice) => voice.gender === gender);
      const chosen = [...(ofGender.length > 0 ? ofGender : ofFamily)].sort((a, b) =>
        a.name.localeCompare(b.name),
      )[0];
      const code =
        chosen.languageCodes.find((value) => value.toLowerCase() === locale.toLowerCase()) ??
        chosen.languageCodes.find((value) => value.toLowerCase().split('-')[0] === base) ??
        localeOfVoice(chosen.name);
      return { name: chosen.name, languageCode: code, family: key };
    }
  }
  return null;
}

/**
 * @description Build the voice resolver.
 * @param {object} options - Options.
 * @param {object} options.client - The Google client (`listVoices`).
 * @param {() => number} [options.now] - Clock.
 * @returns {{ resolve: Function, list: Function, clear: Function }} The resolver.
 */
export function createVoices({ client, now = Date.now }) {
  const lists = new Map();

  async function list(base) {
    const cached = lists.get(base);
    if (cached && now() - cached.at < LIST_TTL_MS) {
      return cached.voices;
    }
    const voices = await client.listVoices(base);
    lists.set(base, { at: now(), voices });
    return voices;
  }

  return {
    /**
     * @description The voice that speaks a language.
     * @param {object} config - The normalized config.
     * @param {unknown} language - What Gladys sent.
     * @returns {Promise<{ name: string, languageCode: string, family: string|null, base: string }>} The voice.
     */
    async resolve(config, language) {
      const base = baseLanguage(language, config.fallback_language);
      const typed = config.voices.find(
        (name) => localeOfVoice(name).split('-')[0].toLowerCase() === base,
      );
      if (typed) {
        return {
          name: typed,
          languageCode: localeOfVoice(typed),
          family: familyOfVoice(typed),
          base,
        };
      }
      const voices = await list(base);
      const chosen = pickVoice(voices, {
        base,
        locale: preferredLocale(base, language),
        family: config.family,
        gender: config.gender,
      });
      if (!chosen) {
        throw new GoogleTtsError(
          ERROR_KINDS.VOICE,
          `No ${FAMILIES[config.family].name} voice nor fallback voice for the language "${base}"`,
        );
      }
      return { ...chosen, base };
    },

    /**
     * @description The voices of a language, cached.
     * @param {string} base - "fr".
     * @returns {Promise<Array<object>>} The voices.
     */
    list,

    /** @description Forget the lists (a new key may see other voices). */
    clear() {
      lists.clear();
    },
  };
}
