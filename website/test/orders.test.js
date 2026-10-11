const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-test-'));
process.env.ADMIN_PASSWORD = 'secret';
delete process.env.STRIPE_SECRET_KEY;
const app = require('../server');

let server, base;
test.before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => server.close());

function form(fields, files = []) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const [name, content] of files) fd.append('files', new Blob([content]), name);
  return fd;
}
const valid = { service: 'document', source: 'en', target: 'de', name: 'Ana', email: 'ana@example.com' };
const admin = { Authorization: 'Basic ' + Buffer.from('admin:secret').toString('base64') };

test('full flow: quote, estimate, pay (dev mode), deliver, download', async () => {
  const words = Array(2000).fill('word').join(' ');
  let res = await fetch(`${base}/api/orders`, { method: 'POST', body: form(valid, [['Übersetzung.txt', words], ['slides.pptx', 'binary']]) });
  assert.equal(res.status, 201);
  const order = await res.json();
  assert.equal(order.countedWords, 2000);
  assert.equal(order.needsEstimate, true);
  assert.equal(order.files[0].name, 'Übersetzung.txt');

  const h = { 'Content-Type': 'application/json', 'X-Order-Token': order.token };
  res = await fetch(`${base}/api/orders/${order.id}/checkout`, { method: 'POST', headers: h, body: '{}' });
  assert.equal(res.status, 400, 'estimate required');

  res = await fetch(`${base}/api/orders/${order.id}/quote`, { method: 'POST', headers: h, body: JSON.stringify({ estimatedWords: 1000, express: true }) });
  const q = await res.json();
  assert.equal(q.quote.words, 3000);
  assert.equal(q.quote.totalCents, Math.round(9000 * 1.5));

  res = await fetch(`${base}/api/orders/${order.id}/checkout`, { method: 'POST', headers: h, body: JSON.stringify({ estimatedWords: 1000, express: true }) });
  assert.match((await res.json()).url, /success\.html/);

  res = await fetch(`${base}/api/orders/${order.id}`, { headers: { 'X-Order-Token': order.token } });
  assert.equal((await res.json()).status, 'paid');

  res = await fetch(`${base}/api/orders/${order.id}`, { headers: { 'X-Order-Token': 'wrong' } });
  assert.equal(res.status, 404);

  res = await fetch(`${base}/api/admin/orders`);
  assert.equal(res.status, 401);
  res = await fetch(`${base}/api/admin/orders`, { headers: admin });
  const [listed] = await res.json();
  assert.equal(listed.public_id, order.id);
  assert.equal(listed.client_token, undefined);

  const fd = new FormData();
  fd.append('files', new Blob(['Hallo']), 'translation.txt');
  fd.append('message', 'Enjoy!');
  res = await fetch(`${base}/api/admin/orders/${order.id}/deliver`, { method: 'POST', headers: admin, body: fd });
  assert.equal(res.status, 200);

  res = await fetch(`${base}/delivery/${order.token}`);
  const page = await res.text();
  assert.match(page, /translation\.txt/);
  assert.match(page, /Enjoy!/);
  const link = page.match(/href="(\/delivery\/[^"]+\/files\/\d+)"/)[1];
  res = await fetch(base + link);
  assert.equal(await res.text(), 'Hallo');
});

test('rejects unsupported file types and pairs', async () => {
  let res = await fetch(`${base}/api/orders`, { method: 'POST', body: form(valid, [['virus.exe', 'x']]) });
  assert.equal(res.status, 400);
  res = await fetch(`${base}/api/orders`, { method: 'POST', body: form({ ...valid, target: 'en' }, [['a.txt', 'hi']]) });
  assert.equal(res.status, 400);
  res = await fetch(`${base}/api/orders`, { method: 'POST', body: form(valid) });
  assert.equal(res.status, 400);
});

test('pasted text is accepted', async () => {
  const res = await fetch(`${base}/api/orders`, { method: 'POST', body: form({ ...valid, text: 'One two three' }) });
  const o = await res.json();
  assert.equal(o.countedWords, 3);
  assert.equal(o.quote.totalCents, 1500);
});
