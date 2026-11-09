// -----------------------------------------------------------------------------
// Clips already spoken, kept on disk: home announcements repeat themselves
// ("The front door is open", "The washing machine is done"), and a clip read
// again costs nothing and starts at once.
//
// The key is a hash of everything that shapes the sound (voice, language,
// rate, pitch, gain, format, profile, text): change a setting and the old
// clips are simply never asked for again. At most 300 clips and 40 MB under
// /data/clips (the only writable folder); the least recently used go first.
// A cache that cannot write only costs money, never a clip: every failure is
// swallowed.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

export const CLIPS_DIR = '/data/clips';
const MAX_FILES = 300;
const MAX_BYTES = 40 * 1024 * 1024;
const NAME_PATTERN = /^[0-9a-f]{40}\.clip$/;

/**
 * @description The cache key of a request.
 * @param {object} request - The SynthesizeSpeechRequest sent to Google.
 * @returns {string} 40 hexadecimal characters.
 */
export function clipKey(request) {
  return createHash('sha256').update(JSON.stringify(request)).digest('hex').slice(0, 40);
}

/**
 * @description Build the cache.
 * @param {object} [options] - Options.
 * @param {string} [options.dir] - The folder.
 * @param {number} [options.maxFiles] - Clips kept at most.
 * @param {number} [options.maxBytes] - Bytes kept at most.
 * @param {() => number} [options.now] - Clock.
 * @param {(err: Error) => void} [options.onError] - Failures (logged by the caller).
 * @returns {object} The cache.
 */
export function createClipCache({
  dir = CLIPS_DIR,
  maxFiles = MAX_FILES,
  maxBytes = MAX_BYTES,
  now = Date.now,
  onError = () => {},
} = {}) {
  // name -> { size, used }
  const entries = new Map();
  let ready = null;

  async function load() {
    try {
      await mkdir(dir, { recursive: true });
      for (const name of await readdir(dir)) {
        if (!NAME_PATTERN.test(name)) {
          continue;
        }
        const info = await stat(join(dir, name));
        entries.set(name, { size: info.size, used: info.mtimeMs });
      }
    } catch (err) {
      onError(err);
    }
  }

  const loaded = () => (ready ??= load());

  async function evict() {
    let bytes = [...entries.values()].reduce((sum, entry) => sum + entry.size, 0);
    const oldest = [...entries.entries()].sort((a, b) => a[1].used - b[1].used);
    while ((entries.size > maxFiles || bytes > maxBytes) && oldest.length > 0) {
      const [name, entry] = oldest.shift();
      entries.delete(name);
      bytes -= entry.size;
      await unlink(join(dir, name)).catch(() => {});
    }
  }

  return {
    /**
     * @description A clip already spoken.
     * @param {string} key - `clipKey(request)`.
     * @returns {Promise<Buffer|null>} The bytes, null when unknown.
     */
    async get(key) {
      await loaded();
      const name = `${key}.clip`;
      if (!entries.has(name)) {
        return null;
      }
      try {
        const bytes = await readFile(join(dir, name));
        const at = now();
        entries.set(name, { size: bytes.length, used: at });
        await utimes(join(dir, name), at / 1000, at / 1000).catch(() => {});
        return bytes;
      } catch (err) {
        entries.delete(name);
        onError(err);
        return null;
      }
    },

    /**
     * @description Keep a clip.
     * @param {string} key - `clipKey(request)`.
     * @param {Buffer} bytes - The audio.
     * @returns {Promise<void>} Never rejects.
     */
    async put(key, bytes) {
      await loaded();
      if (bytes.length > maxBytes) {
        return;
      }
      const name = `${key}.clip`;
      try {
        const temp = join(dir, `${name}.tmp`);
        await writeFile(temp, bytes);
        await rename(temp, join(dir, name));
        entries.set(name, { size: bytes.length, used: now() });
        await evict();
      } catch (err) {
        onError(err);
      }
    },

    /**
     * @description What the cache holds.
     * @returns {Promise<{ files: number, bytes: number }>} The totals.
     */
    async stats() {
      await loaded();
      return {
        files: entries.size,
        bytes: [...entries.values()].reduce((sum, entry) => sum + entry.size, 0),
      };
    },

    /**
     * @description Forget every clip (the "Empty the clip cache" action).
     * @returns {Promise<number>} The clips removed.
     */
    async clear() {
      await loaded();
      const names = [...entries.keys()];
      entries.clear();
      await Promise.all(names.map((name) => unlink(join(dir, name)).catch(() => {})));
      return names.length;
    },
  };
}
