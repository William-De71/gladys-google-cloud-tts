import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitBytes, MAX_BYTES, prepareText } from '../src/text.js';

test('Markdown, links and emoji are not read aloud', () => {
  assert.equal(
    prepareText(
      '## Météo\n**Il pleut** 🌧️ demain, voir [la carte](https://example.com/x) ou https://a.b/c',
    ),
    'Météo.\nIl pleut demain, voir la carte ou',
  );
  assert.equal(prepareText('- lait\n- œufs\n- pain'), 'lait.\nœufs.\npain');
  assert.equal(prepareText('La porte_du_garage est *ouverte*'), 'La porte_du_garage est ouverte');
  assert.equal(prepareText('Il est 20 h 30.'), 'Il est 20 h 30.');
  assert.equal(prepareText('🎉 ** **'), '');
  assert.equal(prepareText(null), '');
});

test('a request stays under 5,000 bytes, ending on a sentence', () => {
  const sentence = '日本語の文章です。';
  const long = `${sentence.repeat(300)}`;
  const fitted = fitBytes(long);
  assert.ok(Buffer.byteLength(fitted) <= MAX_BYTES);
  assert.ok(fitted.endsWith('。'));
  const words = 'mot '.repeat(2000);
  assert.ok(Buffer.byteLength(fitBytes(words)) <= MAX_BYTES);
  assert.equal(fitBytes('court'), 'court');
});
