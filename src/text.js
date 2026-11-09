// -----------------------------------------------------------------------------
// The text sent to Google.
//
// The voice of Gladys reads scene notifications and the replies of the AI
// assistant, which come with Markdown (**bold**, lists, links) and emoji.
// Read aloud, those are noise — and Google bills every character — so they
// go before the text leaves. A request carries at most 5,000 bytes (the
// core already cuts the text at 2,000 characters, but a non-Latin script
// takes up to 4 bytes per character): beyond, the text stops at the last
// sentence that fits.
// -----------------------------------------------------------------------------

export const MAX_BYTES = 5000;

/**
 * @description Clean a text for speech.
 * @param {unknown} value - The text Gladys sent.
 * @returns {string} The text to speak, '' when nothing is left.
 */
export function prepareText(value) {
  let text = String(value ?? '');
  text = text
    // [label](https://…) → label
    .replace(/\[([^\]\n]{1,200})\]\((?:https?:\/\/|mailto:)[^)\s]+\)/g, '$1')
    // bare links are not read
    .replace(/https?:\/\/\S+/g, '')
    // code fences and inline code marks
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/`/g, '')
    // headings, quotes and bullets at line start
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]{0,3}>[ \t]?/gm, '')
    .replace(/^[ \t]*(?:[-*+•]|\d{1,3}[.)])[ \t]+/gm, '')
    // emphasis marks (not a lone * or _ inside a word)
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[\s(])[*_](?=\S)([^*_\n]*?\S)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
    // emoji and their joiners / variation selectors
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\u200d|\ufe0e|\ufe0f|[\u{1f3fb}-\u{1f3ff}]/gu, '')
    // a list item becomes a sentence of its own
    .replace(/([^\s.!?:;,])[ \t]*\n+/g, '$1.\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
  // Only marks and punctuation left: nothing to say.
  if (!/[\p{L}\p{N}]/u.test(text)) {
    return '';
  }
  return fitBytes(text);
}

/**
 * @description Keep a text under the byte limit of a request, ending on a
 * sentence when one fits.
 * @param {string} text - The text.
 * @param {number} [max] - Bytes at most.
 * @returns {string} The text.
 */
export function fitBytes(text, max = MAX_BYTES) {
  if (Buffer.byteLength(text, 'utf8') <= max) {
    return text;
  }
  let cut = '';
  let bytes = 0;
  for (const char of text) {
    const size = Buffer.byteLength(char, 'utf8');
    if (bytes + size > max) {
      break;
    }
    cut += char;
    bytes += size;
  }
  const sentence = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? '),
    cut.lastIndexOf('\n'),
    cut.lastIndexOf('。'),
  );
  if (sentence > cut.length / 2) {
    return cut.slice(0, sentence + 1).trim();
  }
  const space = cut.lastIndexOf(' ');
  return (space > cut.length / 2 ? cut.slice(0, space) : cut).trim();
}
