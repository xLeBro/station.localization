const test = require('node:test');
const assert = require('node:assert/strict');
const { quote } = require('../src/pricing');
const { countWords } = require('../src/wordcount');

test('document: 1,500 words matches the $45 / 2 day Fiverr package', () => {
  const q = quote({ service: 'document', words: 1500, express: false });
  assert.equal(q.totalCents, 4500);
  assert.equal(q.days, 2);
});

test('document: minimum price applies to short texts', () => {
  assert.equal(quote({ service: 'document', words: 40, express: false }).totalCents, 1500);
});

test('book: 50,000 words matches the $650 / 10 day package, express ≈ +$120 in 7 days', () => {
  const q = quote({ service: 'book', words: 50000, express: false });
  assert.equal(q.totalCents, 65000);
  assert.equal(q.days, 10);
  const e = quote({ service: 'book', words: 50000, express: true });
  assert.equal(e.expressCents, 12025);
  assert.equal(e.days, 7);
});

test('unknown service throws', () => {
  assert.throws(() => quote({ service: 'nope', words: 10 }));
});

test('countWords ignores punctuation-only tokens', () => {
  assert.equal(countWords('Hallo Welt – wie geht’s? 42 !'), 5);
  assert.equal(countWords(''), 0);
});
