// -----------------------------------------------------------------------------
// Client of the Cloud Text-to-Speech API (texttospeech.googleapis.com/v1),
// with the administrator's own API key.
//
// Plain fetch, no Google library: two endpoints only —
//   - POST /v1/text:synthesize   one clip (base64 `audioContent`)
//   - GET  /v1/voices            the voices of a language (no character billed)
//
// The key travels in the `X-Goog-Api-Key` header, never in a URL nor a log.
// Every call runs under a deadline. A 429, a 5xx or a network failure is
// retried while the deadline leaves room for it; anything else fails at once
// with a GoogleTtsError whose `kind` says what went wrong.
// -----------------------------------------------------------------------------

export const DEFAULT_BASE_URL = 'https://texttospeech.googleapis.com/v1';

/** The error kinds, also the `kind` variable of the `error` scene trigger. */
export const ERROR_KINDS = {
  AUTH: 'auth',
  DISABLED: 'disabled',
  BILLING: 'billing',
  VOICE: 'voice',
  RATE_LIMIT: 'rate_limit',
  LIMIT: 'limit',
  REQUEST: 'request',
  SERVER: 'server',
  UNREACHABLE: 'unreachable',
  TIMEOUT: 'timeout',
};

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 4000;
const MAX_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 20_000;

export class GoogleTtsError extends Error {
  /**
   * @param {string} kind - One of ERROR_KINDS.
   * @param {string} message - What went wrong (never the key).
   * @param {object} [details] - `{ status, reason }`.
   */
  constructor(kind, message, { status = null, reason = null } = {}) {
    super(message);
    this.name = 'GoogleTtsError';
    this.kind = kind;
    this.status = status;
    this.reason = reason;
  }
}

/**
 * @description The `reason` of the ErrorInfo detail of a Google error body.
 * @param {unknown} body - The parsed body.
 * @returns {string} `API_KEY_INVALID`, `SERVICE_DISABLED`…, or ''.
 */
export function reasonOf(body) {
  const details = body?.error?.details;
  if (!Array.isArray(details)) {
    return '';
  }
  const info = details.find((detail) => typeof detail?.reason === 'string');
  return info ? info.reason : '';
}

/**
 * @description The kind of an HTTP failure.
 * @param {number} status - The HTTP status.
 * @param {unknown} [body] - The parsed body.
 * @returns {string} One of ERROR_KINDS.
 */
export function kindOfStatus(status, body = null) {
  const reason = reasonOf(body);
  const message = String(body?.error?.message ?? '');
  if (reason === 'API_KEY_INVALID' || reason === 'API_KEY_EXPIRED' || status === 401) {
    return ERROR_KINDS.AUTH;
  }
  if (reason === 'SERVICE_DISABLED' || /has not been used in project|is disabled/i.test(message)) {
    return ERROR_KINDS.DISABLED;
  }
  if (reason === 'BILLING_DISABLED' || /billing/i.test(message)) {
    return ERROR_KINDS.BILLING;
  }
  if (status === 403) {
    // A key restricted to other APIs (API_KEY_SERVICE_BLOCKED), to other
    // addresses (API_KEY_IP_ADDRESS_BLOCKED…), or a forbidden project.
    return ERROR_KINDS.AUTH;
  }
  if (status === 429) {
    return ERROR_KINDS.RATE_LIMIT;
  }
  if (status >= 500) {
    return ERROR_KINDS.SERVER;
  }
  if (
    /voice/i.test(message) &&
    /(not exist|not found|invalid|not available|unsupported)/i.test(message)
  ) {
    return ERROR_KINDS.VOICE;
  }
  return ERROR_KINDS.REQUEST;
}

/**
 * @description Hide anything that looks like a Google API key.
 * @param {string} text - A message.
 * @returns {string} The message without keys.
 */
export function maskKeys(text) {
  return String(text ?? '').replace(/AIza[0-9A-Za-z_-]{10,}/g, 'AIza…');
}

/**
 * @description The message of an error body, short and without secrets.
 * @param {unknown} body - The parsed body, or the raw text.
 * @returns {string} The message.
 */
export function errorMessageOf(body) {
  let message = '';
  if (typeof body === 'string') {
    message = body;
  } else if (body?.error?.message) {
    message = String(body.error.message);
  }
  return maskKeys(message.replace(/\s+/g, ' ').trim()).slice(0, 300);
}

/**
 * @description The gender of a voice, as the configuration names them.
 * @param {unknown} value - `FEMALE`, `MALE`, `NEUTRAL`, `SSML_VOICE_GENDER_UNSPECIFIED`.
 * @returns {string} `female`, `male` or `neutral`.
 */
export function genderOf(value) {
  const text = String(value ?? '').toLowerCase();
  return text === 'female' || text === 'male' ? text : 'neutral';
}

/**
 * @description Build the client.
 * @param {object} options - Options.
 * @param {() => string} options.getApiKey - The current key.
 * @param {string} [options.baseUrl] - The API root.
 * @param {typeof fetch} [options.fetchImpl] - fetch.
 * @param {(ms: number) => Promise<void>} [options.sleep] - Waits between attempts.
 * @param {() => number} [options.now] - Clock.
 * @returns {{ synthesize: Function, listVoices: Function }} The client.
 */
export function createGoogleTtsClient({
  getApiKey,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
}) {
  /**
   * @description One call, retried on 429 / 5xx / network while time is left.
   * @param {string} path - `/text:synthesize`, `/voices?…`.
   * @param {object} [options] - `{ method, body, timeoutMs, retries }`.
   * @returns {Promise<any>} The parsed body.
   */
  async function call(
    path,
    { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, retries = true } = {},
  ) {
    const key = getApiKey();
    if (!key) {
      throw new GoogleTtsError(ERROR_KINDS.AUTH, 'No API key');
    }
    const deadline = now() + timeoutMs;
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const left = deadline - now();
      if (left <= 0) {
        break;
      }
      try {
        return await once(path, { method, body, key, timeoutMs: left });
      } catch (err) {
        lastError = err;
        const retryable = [
          ERROR_KINDS.RATE_LIMIT,
          ERROR_KINDS.SERVER,
          ERROR_KINDS.UNREACHABLE,
        ].includes(err.kind);
        const wait = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempt - 1));
        if (!retries || !retryable || attempt === MAX_ATTEMPTS || deadline - now() <= wait + 1000) {
          throw err;
        }
        await sleep(wait);
      }
    }
    throw lastError ?? new GoogleTtsError(ERROR_KINDS.TIMEOUT, 'Google did not answer in time');
  }

  async function once(path, { method, body, key, timeoutMs }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          'X-Goog-Api-Key': key,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        throw new GoogleTtsError(ERROR_KINDS.TIMEOUT, 'Google did not answer in time');
      }
      throw new GoogleTtsError(
        ERROR_KINDS.UNREACHABLE,
        `Cannot reach Google: ${maskKeys(err?.cause?.code ?? err?.message ?? err)}`,
      );
    }
    let text;
    try {
      text = await response.text();
    } catch (err) {
      throw new GoogleTtsError(
        controller.signal.aborted ? ERROR_KINDS.TIMEOUT : ERROR_KINDS.UNREACHABLE,
        `Answer of Google cut: ${maskKeys(err?.message ?? err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!response.ok) {
      const kind = kindOfStatus(response.status, parsed);
      throw new GoogleTtsError(
        kind,
        `HTTP ${response.status}: ${errorMessageOf(parsed) || response.statusText || 'error'}`,
        { status: response.status, reason: reasonOf(parsed) || null },
      );
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new GoogleTtsError(ERROR_KINDS.SERVER, 'Google answered something that is not JSON');
    }
    return parsed;
  }

  return {
    /**
     * @description Synthesize one clip.
     * @param {object} request - The SynthesizeSpeechRequest (`input`, `voice`, `audioConfig`).
     * @param {object} [options] - `{ timeoutMs, retries }`.
     * @returns {Promise<Buffer>} The audio bytes.
     */
    async synthesize(request, options = {}) {
      const body = await call('/text:synthesize', { method: 'POST', body: request, ...options });
      const audio =
        typeof body.audioContent === 'string' ? Buffer.from(body.audioContent, 'base64') : null;
      if (!audio || audio.length === 0) {
        throw new GoogleTtsError(ERROR_KINDS.SERVER, 'Google answered without audio');
      }
      return audio;
    },

    /**
     * @description The voices of a language (all of them without one).
     * @param {string} [languageCode] - `fr-FR`, `fr`.
     * @param {object} [options] - `{ timeoutMs, retries }`.
     * @returns {Promise<Array<{ name: string, languageCodes: string[], gender: string }>>} The voices.
     */
    async listVoices(languageCode, options = {}) {
      const query = languageCode ? `?languageCode=${encodeURIComponent(languageCode)}` : '';
      const body = await call(`/voices${query}`, options);
      const voices = Array.isArray(body.voices) ? body.voices : [];
      return voices
        .filter((voice) => typeof voice?.name === 'string')
        .map((voice) => ({
          name: voice.name,
          languageCodes: Array.isArray(voice.languageCodes) ? voice.languageCodes.map(String) : [],
          gender: genderOf(voice.ssmlGender),
        }));
    },
  };
}
