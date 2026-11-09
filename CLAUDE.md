# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** that makes a **Google Cloud
Text-to-Speech voice** the voice of a Gladys instance: a Node.js service
(Node 22+, ESM, no build step) in its own sandboxed Docker container, talking
to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and to the official Cloud Text-to-Speech API
(`https://texttospeech.googleapis.com/v1`) with the administrator's own API
key. Runtime dependency: the SDK only (plain `fetch`, no Google library).
`type: "tts"`, Gladys 5.3.0+, `transports: ["cloud"]`,
`categories: ["assistants"]`. Not affiliated with Google.

The contract (SDK README, "Text-to-speech providers"): `onTtsSynthesize(text,
language)`, `text` at most 2,000 characters, `language` the user's (`null`
when unknown); resolve `<content type>;base64,<audio>` (`audio/mpeg`,
`audio/ogg`, `audio/wav`), 5 MB decoded at most, within 30 s. **Never tested
with a real Google Cloud key**: request and response shapes follow the REST
reference (`text:synthesize`, `voices.list`, `AudioConfig`, `AudioEncoding`)
and the pricing / quotas pages, checked on 2026-11-09.

## Commands

```bash
npm install
npm test                                  # node --test; a fake Google API on 127.0.0.1
node --test test/app.test.js              # one file
UPDATE_BASELINE=1 npm test                # rewrite test/fixtures/manifest.baseline.json (on purpose only)
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js               SDK wiring only (new GladysIntegration + createApp)
src/app.js             every handler: onTtsSynthesize, the three buttons, widget,
                       configuration, status following the clips
src/synthesize.js      one clip: clean text, voice, request, cache, monthly limit
                       BEFORE spending, Google, counters, thresholds
src/text.js            Markdown / emoji / links removed; 5,000-byte cut on a sentence
src/voices.js          voice per language: typed name, else family > gender >
                       alphabetical in the main locale; lists kept 24 h
src/google-api.js      fetch client: POST text:synthesize, GET voices; X-Goog-Api-Key
                       header, deadline, retries on 429 / 5xx / network, error kinds
                       from the ErrorInfo reason, keys masked
src/clip-cache.js      /data/clips: 300 clips / 40 MB, least recently used out
src/usage.js           /data/usage.json: characters per Pacific billing month and
                       per local day, cache hits, refusals, alerts once a month
src/events.js          triggers: error (once per kind), recovered, monthly_limit
src/widgets.js         the usage widget
src/connection.js      status (voices list, free), Test the voice, List the voices
src/config.js          families (free allowance, price, pitch), selects, bounds
src/i18n.js            runtime texts, en / fr / de / es
src/time.js            local days and times (TZ of Gladys, Intl only)
test/helpers/fake-google.js     the fake API (voices, synthesize, 400 API_KEY_INVALID)
.github/scripts/release.mjs     version, changelog, bump (tested in test/)
```

## Rules

- **Every key users store is forever**: the keys of `config_schema` and the
  values of its selects (`family`, `gender`, `fallback_language`,
  `speaking_rate`, `pitch`, `volume_gain_db`, `effects_profile`,
  `audio_format`), `actions` and their fields, the widget, the triggers
  (fields, options, variables). `test/structure.test.js` compares them to
  `test/fixtures/manifest.baseline.json`: never update it to make a test pass
  without a documented migration.
- **Speech settings are selects**, not typed decimals (a decimal `number`
  field can be impossible to type in some cores): their values are strings,
  turned into numbers by `normalizeConfig`.
- **The monthly limit is checked before spending**, against the characters of
  the **Pacific** billing month (`America/Los_Angeles`, like Google invoices),
  counted as code points of the cleaned text (spaces included). A cache hit is
  free and never counted. `monthly_limit: 0` = 95 % of the free allowance of
  the chosen family.
- **Never fall back silently**: a failure throws (the core fails the scene
  action, the assistant answers in text). Never answer with another voice
  than the one resolved; a family without a voice for a language falls back
  to Chirp 3 HD, Neural2, WaveNet then Standard, and the status says so.
- **Pitch is not sent to Chirp 3 HD and Studio** (they refuse it); any other
  audio config field is sent only when it differs from the default.
- **Deadlines**: the core waits 30 s; Google gets 25 s, retries included.
- **Scene events** once per transition: `error` when the failure kind
  changes, `recovered` at the first clip after, `monthly_limit` once per level
  (`warning` at 80 %, `reached` when a clip is refused) and billing month. A
  refused text (`request`) and the limit (`limit`) never start `error`.
- **The clip cache never fails a clip**: every write error is swallowed; the
  key is a hash of the whole request, so a changed setting simply misses.
- **The API key** is a `secret`: never logged, never in /data, never in an
  error message (`maskKeys` hides `AIza…`), never in a URL (header only).
- **The container rootfs is read-only.** Write only under `/data` (usage
  counters written at most every 10 s and at shutdown, the clip cache).
- **Four languages.** Every user-facing text (manifest, `src/i18n.js`,
  `docs/*.md`, README) exists in en, fr, de, es; `test/i18n.test.js` checks it.
  German says "du", Spanish "usted".
- **Widget images.** After any change to a widget content, run
  `docs/illustrations/render.sh` again and look at the four PNG files. Tile
  icons must exist in the Gladys theme (`fe-archive` does not).
- **Logo**: the Google G (Wikimedia Commons) names the service only; keep the
  "not affiliated" notices.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  Below 1.0.0 until the maintainer runs Release with `release-as: 1.0.0`.
- **Changelog.** Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Commits and PR titles** follow Conventional Commits, in English.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.

## Pitfalls

- A wrong key is a **400** `INVALID_ARGUMENT` with the reason
  `API_KEY_INVALID`, not a 401. A key restricted to other APIs is a 403
  `API_KEY_SERVICE_BLOCKED`; an API not enabled a 403 `SERVICE_DISABLED`; a
  project without billing a 403 `BILLING_DISABLED`.
- Listing voices proves the key and the API but not billing: only a synthesis
  does (the "Test the voice" button).
- Standard and WaveNet share one SKU (4 million free together); Neural2 and
  Polyglot share another (1 million).
- A request carries at most 5,000 bytes, not characters: a non-Latin text of
  2,000 characters can exceed it.
- LINEAR16 is uncompressed: a long text in WAV goes over the 5 MB the core
  accepts (refused with a clear message).
- `node --test` also runs `test/helpers/`: nothing starts on import.
- The validator of the Gladys core creates `gladys-development.duckdb` in the
  current folder: run it from elsewhere.
