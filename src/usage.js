// -----------------------------------------------------------------------------
// Characters sent to Google, for the monthly limit and the widget.
//
// Google bills Text-to-Speech per character, every character of the text
// (spaces included), per calendar month of the billing account — Pacific
// time, like every Google Cloud invoice. The month of the limit is therefore
// the month in America/Los_Angeles, while the days of the chart are local to
// Gladys. A clip read from the cache costs nothing and is counted apart.
//
// Kept in /data/usage.json (the only writable folder), written at most every
// 10 s and at shutdown; 62 days and 13 months are kept. A missing or broken
// file starts empty. This counter only sees what this integration sends: the
// same key used elsewhere is not in it, so the Google Cloud console stays the
// reference for the bill.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { localParts, usableTimeZone } from './time.js';

export const USAGE_FILE = '/data/usage.json';
export const BILLING_TIME_ZONE = 'America/Los_Angeles';
const KEEP_DAYS = 62;
const KEEP_MONTHS = 13;
const SAVE_DELAY_MS = 10_000;

/**
 * @description A finite, non-negative integer.
 * @param {unknown} value - The value.
 * @returns {number} The integer, 0 otherwise.
 */
function count(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

const emptyDay = () => ({ characters: 0, clips: 0, cached: 0, errors: 0 });
const emptyMonth = () => ({
  characters: 0,
  clips: 0,
  cached: 0,
  saved: 0,
  refused: 0,
  by_family: {},
});

/**
 * @description The characters Google bills for a text: every code point.
 * @param {string} text - The text sent.
 * @returns {number} The characters.
 */
export function billedCharacters(text) {
  return [...String(text ?? '')].length;
}

/**
 * @description Build the usage store.
 * @param {object} [options] - Options.
 * @param {string} [options.file] - The JSON file.
 * @param {() => number} [options.now] - Clock.
 * @param {() => string} [options.timeZone] - The timezone of Gladys.
 * @param {number} [options.saveDelayMs] - Write debounce.
 * @param {(err: Error) => void} [options.onError] - Write failures.
 * @returns {object} The store.
 */
export function createUsage({
  file = USAGE_FILE,
  now = Date.now,
  timeZone = () => usableTimeZone(),
  saveDelayMs = SAVE_DELAY_MS,
  onError = () => {},
} = {}) {
  let data = { days: {}, months: {}, alerts: {}, last_clip: null, last_error: null };
  let timer = null;

  const today = () => localParts(now(), timeZone()).date;
  const monthKey = () => localParts(now(), BILLING_TIME_ZONE).date.slice(0, 7);

  function day() {
    const key = today();
    data.days[key] ??= emptyDay();
    prune(data.days, KEEP_DAYS);
    return data.days[key];
  }

  function month() {
    const key = monthKey();
    data.months[key] ??= emptyMonth();
    prune(data.months, KEEP_MONTHS);
    return data.months[key];
  }

  function prune(table, keep) {
    const keys = Object.keys(table).sort();
    for (const key of keys.slice(0, Math.max(0, keys.length - keep))) {
      delete table[key];
    }
  }

  function scheduleSave() {
    if (timer) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      save().catch(onError);
    }, saveDelayMs);
    timer.unref?.();
  }

  async function save() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    await mkdir(dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    await writeFile(temp, JSON.stringify(data));
    await rename(temp, file);
  }

  return {
    /** @description Read the file (missing or broken: start empty). */
    async load() {
      try {
        const parsed = JSON.parse(await readFile(file, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          data = {
            days: parsed.days && typeof parsed.days === 'object' ? parsed.days : {},
            months: parsed.months && typeof parsed.months === 'object' ? parsed.months : {},
            alerts: parsed.alerts && typeof parsed.alerts === 'object' ? parsed.alerts : {},
            last_clip: parsed.last_clip ?? null,
            last_error: parsed.last_error ?? null,
          };
          prune(data.days, KEEP_DAYS);
          prune(data.months, KEEP_MONTHS);
        }
      } catch {
        // First start, or an unreadable file: counters start again.
      }
    },

    /**
     * @description Characters sent this billing month.
     * @returns {number} The characters.
     */
    used() {
      return count(data.months[monthKey()]?.characters);
    },

    /** @returns {string} The billing month, "2026-11". */
    monthKey,

    /**
     * @description Count a clip synthesized by Google.
     * @param {object} entry - `{ voice, family, characters, ms }`.
     */
    recordClip({ voice, family, characters, ms }) {
      const chars = count(characters);
      const counters = day();
      const totals = month();
      counters.characters += chars;
      counters.clips += 1;
      totals.characters += chars;
      totals.clips += 1;
      const key = family ?? 'other';
      totals.by_family[key] = count(totals.by_family[key]) + chars;
      data.last_clip = {
        at: now(),
        voice: String(voice ?? ''),
        characters: chars,
        ms: count(ms),
        cached: false,
      };
      scheduleSave();
    },

    /**
     * @description Count a clip read from the cache (nothing billed).
     * @param {object} entry - `{ voice, characters }`.
     */
    recordCached({ voice, characters }) {
      const chars = count(characters);
      day().cached += 1;
      const totals = month();
      totals.cached += 1;
      totals.saved += chars;
      data.last_clip = {
        at: now(),
        voice: String(voice ?? ''),
        characters: chars,
        ms: 0,
        cached: true,
      };
      scheduleSave();
    },

    /** @description Count a clip refused by the monthly limit. */
    recordRefused() {
      month().refused += 1;
      scheduleSave();
    },

    /**
     * @description Count a failed clip.
     * @param {object} entry - `{ kind, message, voice }`.
     */
    recordError({ kind, message, voice }) {
      day().errors += 1;
      data.last_error = {
        at: now(),
        kind: String(kind ?? ''),
        voice: String(voice ?? ''),
        message: String(message ?? '').slice(0, 200),
      };
      scheduleSave();
    },

    /**
     * @description Note that a level of the limit was announced this month.
     * @param {string} level - `warning` or `reached`.
     * @returns {boolean} True the first time this month.
     */
    markAlert(level) {
      const key = monthKey();
      data.alerts = { [key]: data.alerts[key] ?? {} };
      if (data.alerts[key][level]) {
        return false;
      }
      data.alerts[key][level] = true;
      scheduleSave();
      return true;
    },

    /**
     * @description What the widget shows.
     * @returns {object} `{ month_key, month, today, days: [{ date, characters }], last_clip, last_error }`.
     */
    snapshot() {
      const key = monthKey();
      const todayKey = today();
      return {
        month_key: key,
        month: { ...emptyMonth(), ...(data.months[key] ?? {}) },
        today: { ...emptyDay(), ...(data.days[todayKey] ?? {}) },
        days: Object.keys(data.days)
          .sort()
          .slice(-30)
          .map((date) => ({ date, characters: count(data.days[date].characters) })),
        last_clip: data.last_clip,
        last_error: data.last_error,
      };
    },

    save,

    /** @description Stop the pending write (tests, shutdown after save). */
    stop() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
