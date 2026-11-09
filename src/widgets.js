// -----------------------------------------------------------------------------
// Dashboard widget of the Google Cloud Text-to-Speech integration.
//
//   - `usage`  what the voice of Gladys costs: characters of the billing
//              month against the limit (gauge), clips of the day, clips read
//              from the cache this month (free), characters left (tiles);
//              characters per day over 30 days (bar chart); the state, the
//              voice, the last clip and the last error (status); a link to
//              the API metrics in the Google Cloud console, the reference for
//              the bill.
//
// Counted by the integration (usage.js): the same key used elsewhere is not in
// it. Every text exists in the four languages (the content is cached per
// language). Budget of a card: 8 components, 1 main one, 6 tiles, 2 texts
// (1 body), 1 status, 4 buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { monthlyLimit } from './config.js';
import { ERROR_KINDS } from './google-api.js';
import { WARNING_SHARE } from './events.js';
import { ago, formatNumber, t } from './i18n.js';
import { formatTime } from './time.js';

export const WIDGETS = { USAGE: 'usage' };
const TTL_SECONDS = 60;
export const CONSOLE_URL =
  'https://console.cloud.google.com/apis/api/texttospeech.googleapis.com/metrics';

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A count, short: "850", "12.4K" / "12,4 k".
 * @param {number} value - The count.
 * @param {string} language - The language.
 * @returns {string} The text (≤ 12 characters).
 */
export function compact(value, language) {
  const number = Number.isFinite(value) ? value : 0;
  return clip(
    new Intl.NumberFormat(['en', 'fr', 'de', 'es'].includes(language) ? language : 'en', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(number),
    12,
  );
}

/**
 * @description The "usage" widget.
 * @param {object} options - Options.
 * @param {object} options.snapshot - `usage.snapshot()`.
 * @param {object} options.config - The normalized config.
 * @param {object|null} options.failing - `events.state()`.
 * @param {string|null} options.voice - The voice of the last clip or the check.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now (ms).
 * @param {string} [options.timeZone] - The timezone of Gladys.
 * @returns {object} The content.
 */
export function buildUsageWidget({ snapshot, config, failing, voice, language, now, timeZone }) {
  const time = (instant) => formatTime(instant, { language, timeZone, now });
  const limit = monthlyLimit(config);
  const used = snapshot.month.characters;
  const share = limit > 0 ? used / limit : 0;
  const reached = used >= limit || (snapshot.last_error?.kind === ERROR_KINDS.LIMIT && share > 0.9);
  const components = [];

  components.push({ type: 'text', variant: 'caption', text: clip(voice ?? '–', 80) });

  if (!config.api_key) {
    components.push({ type: 'text', variant: 'body', text: clip(t('widgetNoKey', language), 300) });
  }

  components.push(
    {
      type: 'gauge',
      label: clip(t('gaugeMonth', language), 24),
      value: Math.min(100, Math.round(share * 1000) / 10),
      min: 0,
      max: 100,
      unit: '%',
      color: reached
        ? WIDGET_COLORS.DANGER
        : share >= WARNING_SHARE
          ? WIDGET_COLORS.WARNING
          : WIDGET_COLORS.SUCCESS,
    },
    {
      type: 'value',
      label: clip(t('tileLeft', language), 24),
      value: compact(Math.max(0, limit - used), language),
      icon: 'type',
      color: reached ? WIDGET_COLORS.DANGER : WIDGET_COLORS.PRIMARY,
    },
    {
      type: 'value',
      label: clip(t('tileClipsToday', language), 24),
      value: snapshot.today.clips + snapshot.today.cached,
      icon: 'volume-2',
      color: WIDGET_COLORS.INFO,
    },
    {
      type: 'value',
      label: clip(t('tileCachedMonth', language), 24),
      value: compact(snapshot.month.cached, language),
      icon: 'database',
      color: WIDGET_COLORS.NEUTRAL,
    },
  );

  // Without a key the body text takes the place of the chart (8 components).
  if (config.api_key && snapshot.days.some((day) => day.characters > 0)) {
    components.push({
      type: 'chart',
      chart_type: 'bar',
      title: clip(t('chartTitle', language), 60),
      series: [
        {
          name: t('chartSeries', language),
          points: snapshot.days.map((day) => ({ t: `${day.date}T12:00:00Z`, v: day.characters })),
        },
      ],
    });
  }

  const items = [];
  if (!config.api_key) {
    items.push({
      label: t('rowState', language),
      value: clip(t('stateNoKey', language), 40),
      color: WIDGET_COLORS.WARNING,
    });
  } else if (failing) {
    items.push({
      label: t('rowState', language),
      value: clip(t('stateFailing', language, { time: time(failing.since) }), 40),
      color: WIDGET_COLORS.DANGER,
    });
  } else if (reached) {
    items.push({
      label: t('rowState', language),
      value: clip(t('stateLimit', language), 40),
      color: WIDGET_COLORS.DANGER,
    });
  } else {
    items.push({
      label: t('rowState', language),
      value: clip(t('stateOk', language), 40),
      color: WIDGET_COLORS.SUCCESS,
    });
  }
  const last = snapshot.last_clip;
  items.push({
    label: clip(t('rowLastClip', language), 40),
    value: clip(
      !last
        ? t('never', language)
        : last.cached
          ? t('valueLastCached', language, { ago: ago(last.at, now, language) })
          : t('valueLastClip', language, {
              characters: formatNumber(last.characters, language, 0),
              ago: ago(last.at, now, language),
            }),
      40,
    ),
    color: last ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
  });
  const error = snapshot.last_error;
  if (error) {
    items.push({
      label: clip(t('rowLastError', language), 40),
      value: clip(`${time(error.at)} · ${t(`kind_${error.kind}`, language)}`, 40),
      color: WIDGET_COLORS.WARNING,
    });
  }
  components.push({ type: 'status', items });

  components.push({
    type: 'button',
    label: clip(t('buttonConsole', language), 24),
    icon: 'external-link',
    style: 'secondary',
    link: { url: CONSOLE_URL },
  });

  return { ttl_seconds: TTL_SECONDS, components };
}
