# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - 2026-11-09

### Added

- **tts:** the voice of Gladys on Google Cloud Text-to-Speech (your own API key): scene notifications and the replies of the voice assistant, in the language of the user
- **voices:** Chirp 3 HD, Neural2, WaveNet, Standard, Studio and Polyglot families, female or male voice picked automatically per language, or voices chosen by name; speed, pitch, volume gain, device profile, MP3, Ogg Opus or WAV
- **costs:** monthly character limit (95 % of the free allowance by default, Pacific billing month), checked before every clip; clip cache so a sentence already spoken is not billed again; Markdown and emoji removed before sending
- **scenes:** triggers when speech fails (key refused, API or billing not enabled, voice unknown, API unreachable), when it works again, and at 80 % and 100 % of the monthly limit
- **widgets:** characters of the month against the limit, clips of the day, clips from the cache, characters per day over 30 days, last clip and last error
- **configuration:** "Test the voice", "List the voices" and "Empty the clip cache" buttons; connection status checked without billing a character
- **i18n:** English, French, German and Spanish for the manifest, the runtime texts, the documentation and the README

[0.1.0]: https://github.com/William-De71/gladys-google-cloud-tts/releases/tag/v0.1.0
