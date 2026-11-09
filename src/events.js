// -----------------------------------------------------------------------------
// Scene triggers. When Google stops speaking, Gladys does not switch back to
// another voice on its own: the notification scene fails and the assistant
// answers in text only. These triggers let a scene tell the administrator:
//
//   - `error`          a clip failed after working (or at the first clip), or
//                      failed in another way than the last time;
//   - `recovered`      a clip is spoken again after an `error`;
//   - `monthly_limit`  the characters of the month reach 80 % of the limit
//                      (`level: warning`), then the limit itself
//                      (`level: reached`: clips are refused until the next
//                      month). Once per level and month.
//
// One event per transition, never a repeat. A text refused on its own (HTTP
// 400, nothing left to say) is about that text, not the provider: it starts
// nothing. Neither does the monthly limit: it has its own trigger.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { ERROR_KINDS } from './google-api.js';

const logger = createLogger({ name: 'events' });

export const TRIGGERS = { ERROR: 'error', RECOVERED: 'recovered', MONTHLY_LIMIT: 'monthly_limit' };
export const LIMIT_LEVELS = { WARNING: 'warning', REACHED: 'reached' };
export const WARNING_SHARE = 0.8;

/** Failures that say nothing about the provider. */
const IGNORED = new Set([ERROR_KINDS.REQUEST, ERROR_KINDS.LIMIT]);

/**
 * @description Build the trigger state machine.
 * @param {object} options - Options.
 * @param {(key: string, data: object) => Promise<unknown>} options.publish - `gladys.publishSceneEvent`.
 * @param {() => number} [options.now] - Clock.
 * @returns {{ failure: Function, success: Function, limit: Function, state: Function }} The hooks.
 */
export function createEvents({ publish, now = Date.now }) {
  // null: no failure reported; else { kind, since }.
  let failing = null;

  const send = (key, data) => {
    Promise.resolve()
      .then(() => publish(key, data))
      .catch((err) => logger.warn(`Scene event ${key} not published: ${err?.message ?? err}`));
  };

  return {
    /**
     * @description A clip failed.
     * @param {{ kind: string, message: string }} error - The GoogleTtsError.
     * @param {{ voice?: string, language?: string }} [context] - What it was for.
     */
    failure(error, { voice, language } = {}) {
      if (IGNORED.has(error?.kind)) {
        return;
      }
      if (failing && failing.kind === error.kind) {
        return;
      }
      failing = { kind: error.kind, since: failing?.since ?? now() };
      send(TRIGGERS.ERROR, {
        kind: error.kind,
        message: String(error.message ?? '').slice(0, 300),
        voice: voice ?? null,
        language: language ?? null,
      });
    },

    /** @description A clip was spoken. */
    success() {
      if (!failing) {
        return;
      }
      const minutes = Math.max(0, Math.round((now() - failing.since) / 60000));
      failing = null;
      send(TRIGGERS.RECOVERED, { down_minutes: minutes });
    },

    /**
     * @description A level of the monthly limit was crossed (the caller
     * makes sure it is the first time this month).
     * @param {string} level - `warning` or `reached`.
     * @param {{ used: number, limit: number, month: string }} data - The counters.
     */
    limit(level, { used, limit, month }) {
      send(TRIGGERS.MONTHLY_LIMIT, {
        level,
        used,
        limit,
        percent: limit > 0 ? Math.round((used / limit) * 100) : 0,
        month,
      });
    },

    /**
     * @description The current state, for the widget and the tests.
     * @returns {object|null} `{ kind, since }` or null.
     */
    state() {
      return failing;
    },
  };
}
