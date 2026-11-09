// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the administrator in Gladys from the `config_schema` of the
// manifest; the SDK fetches it (`gladys.getConfig()`) and notifies every
// change (`gladys.onConfigUpdated()`). This module provides the defaults and
// normalizes what arrives, so the rest of the code never deals with
// `undefined`, a number typed as a string, or a value the select no longer
// offers.
// -----------------------------------------------------------------------------

/**
 * The voice families of Cloud Text-to-Speech, as the Configuration screen
 * offers them. `token` is how a voice name says its family
 * (`fr-FR-Chirp3-HD-Charon`, `en-US-Neural2-F`); `free` the characters free
 * every month and `price` the US dollars per million characters after them
 * (cloud.google.com/text-to-speech/pricing, checked 2026-11-09). The keys are
 * stored by users: a family leaves this list only when Google shuts it down.
 *
 * Standard and WaveNet share one SKU, so one allowance of 4 million; Neural2
 * and Polyglot share another of 1 million. `pitch`: whether the family
 * accepts the `pitch` of the audio config (Chirp 3 HD and Studio do not).
 */
export const FAMILIES = {
  'chirp3-hd': { name: 'Chirp 3 HD', token: 'Chirp3-HD', free: 1_000_000, price: 30, pitch: false },
  neural2: { name: 'Neural2', token: 'Neural2', free: 1_000_000, price: 16, pitch: true },
  wavenet: { name: 'WaveNet', token: 'Wavenet', free: 4_000_000, price: 4, pitch: true },
  standard: { name: 'Standard', token: 'Standard', free: 4_000_000, price: 4, pitch: true },
  studio: { name: 'Studio', token: 'Studio', free: 1_000_000, price: 160, pitch: false },
  polyglot: { name: 'Polyglot', token: 'Polyglot', free: 1_000_000, price: 16, pitch: true },
};

/** When the chosen family has no voice for a language, the next ones tried. */
export const FAMILY_FALLBACK = ['chirp3-hd', 'neural2', 'wavenet', 'standard'];

/** The audio formats offered, with what Gladys is told it receives. */
export const AUDIO_FORMATS = {
  mp3: { encoding: 'MP3', contentType: 'audio/mpeg' },
  ogg: { encoding: 'OGG_OPUS', contentType: 'audio/ogg' },
  wav: { encoding: 'LINEAR16', contentType: 'audio/wav' },
};

/**
 * The audio profiles of Cloud Text-to-Speech (docs/audio-profiles): the voice
 * is tuned for the device that plays it. `none` sends no profile.
 */
export const EFFECTS_PROFILES = [
  'none',
  'small-bluetooth-speaker-class-device',
  'medium-bluetooth-speaker-class-device',
  'large-home-entertainment-class-device',
  'headphone-class-device',
  'handset-class-device',
  'wearable-class-device',
  'large-automotive-class-device',
  'telephony-class-application',
];

export const GENDERS = ['female', 'male'];

/** The languages of the `fallback_language` select, and their default locale. */
export const LOCALES = {
  en: 'en-US',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  it: 'it-IT',
  nl: 'nl-NL',
  pt: 'pt-PT',
};

/** A full voice name, as Google writes them: `fr-FR-Chirp3-HD-Charon`. */
export const VOICE_NAME_PATTERN = /^[a-z]{2,3}-[A-Za-z0-9]{2,4}-[A-Za-z0-9-]{2,60}$/;

/** The values of the speech selects, as the manifest offers them. */
export const SPEAKING_RATES = ['0.75', '0.85', '0.9', '1', '1.1', '1.15', '1.25', '1.5'];
export const PITCHES = ['-6', '-4', '-2', '0', '2', '4', '6'];
export const VOLUME_GAINS = ['-6', '-3', '0', '3', '6'];

/** Bounds of the numbers (a value from an older select stays usable). */
export const BOUNDS = {
  speaking_rate: [0.25, 2],
  pitch: [-20, 20],
  volume_gain_db: [-10, 10],
  monthly_limit: [0, 100_000_000],
};

// Defaults: they MUST stay consistent with the `default` values declared in
// the `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // The Google Cloud API key. A `secret` field: no default, never logged.
  api_key: '',
  // The voice family, then the gender of the voice picked in it.
  family: 'chirp3-hd',
  gender: 'female',
  // Voices chosen by name, one per language at most, comma-separated.
  voices: '',
  // The language spoken when Gladys does not say which (rare).
  fallback_language: 'en',
  // Selects (a typed decimal can be impossible to enter in some cores):
  // their values are strings, turned into numbers by normalizeConfig.
  speaking_rate: '1',
  pitch: '0',
  volume_gain_db: '0',
  effects_profile: 'none',
  audio_format: 'mp3',
  // Characters a month: 0 = the free allowance of the family (minus 5 %).
  monthly_limit: 0,
};

/** Share of the free allowance the automatic limit stops at. */
export const AUTO_LIMIT_SHARE = 0.95;

/**
 * @description Merge the user config with the defaults.
 * @param {Record<string, unknown>} [raw] - Config returned by the SDK.
 * @returns {object} The normalized config.
 */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
  return {
    api_key: String(config.api_key ?? '').trim(),
    family: config.family in FAMILIES ? config.family : DEFAULT_CONFIG.family,
    gender: GENDERS.includes(config.gender) ? config.gender : DEFAULT_CONFIG.gender,
    voices: parseVoices(config.voices),
    fallback_language:
      config.fallback_language in LOCALES
        ? config.fallback_language
        : DEFAULT_CONFIG.fallback_language,
    speaking_rate: clamp(config.speaking_rate, 'speaking_rate', 2),
    pitch: clamp(config.pitch, 'pitch', 1),
    volume_gain_db: clamp(config.volume_gain_db, 'volume_gain_db', 1),
    audio_format:
      config.audio_format in AUDIO_FORMATS ? config.audio_format : DEFAULT_CONFIG.audio_format,
    effects_profile: EFFECTS_PROFILES.includes(config.effects_profile)
      ? config.effects_profile
      : DEFAULT_CONFIG.effects_profile,
    monthly_limit: Math.round(clamp(config.monthly_limit, 'monthly_limit', 0)),
  };
}

/**
 * @description The voices typed by hand, valid names only.
 * @param {unknown} value - "fr-FR-Chirp3-HD-Charon, en-GB-Neural2-B".
 * @returns {string[]} The names, at most one per locale (the first wins).
 */
export function parseVoices(value) {
  if (Array.isArray(value)) {
    return parseVoices(value.join(','));
  }
  const seen = new Set();
  const names = [];
  for (const part of String(value ?? '').split(/[,;\s]+/)) {
    const name = part.trim();
    if (!VOICE_NAME_PATTERN.test(name)) {
      continue;
    }
    const locale = localeOfVoice(name).toLowerCase();
    if (seen.has(locale)) {
      continue;
    }
    seen.add(locale);
    names.push(name);
  }
  return names;
}

/**
 * @description The locale a voice name starts with.
 * @param {string} name - `fr-FR-Chirp3-HD-Charon`.
 * @returns {string} `fr-FR`.
 */
export function localeOfVoice(name) {
  const [language, region] = String(name).split('-');
  return `${language}-${region}`;
}

/**
 * @description The family of a voice name.
 * @param {string} name - `en-US-Neural2-F`.
 * @returns {string|null} A FAMILIES key, null when unknown (a newer family).
 */
export function familyOfVoice(name) {
  const text = String(name ?? '');
  for (const [key, family] of Object.entries(FAMILIES)) {
    if (text.includes(`-${family.token}-`) || text.endsWith(`-${family.token}`)) {
      return key;
    }
  }
  return null;
}

/**
 * @description The characters a month the integration may send.
 * @param {object} config - The normalized config.
 * @returns {number} The limit, Infinity when none.
 */
export function monthlyLimit(config) {
  if (config.monthly_limit > 0) {
    return config.monthly_limit;
  }
  return Math.floor(FAMILIES[config.family].free * AUTO_LIMIT_SHARE);
}

/**
 * @description A number within the bounds of a field, rounded.
 * @param {unknown} value - The value.
 * @param {keyof BOUNDS} key - The field.
 * @param {number} decimals - Decimals kept.
 * @returns {number} The number, the default when not a number.
 */
function clamp(value, key, decimals) {
  // An emptied field arrives as '' or null: Number('') is 0, not "unset".
  const number = value === '' || value === null ? NaN : Number(value);
  if (!Number.isFinite(number)) {
    return Number(DEFAULT_CONFIG[key]);
  }
  const [min, max] = BOUNDS[key];
  const factor = 10 ** decimals;
  return Math.min(max, Math.max(min, Math.round(number * factor) / factor));
}
