const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');

const config = require('./src/config');
const { db, UPLOAD_DIR } = require('./src/db');
const { quote } = require('./src/pricing');
const { countFileWords } = require('./src/wordcount');
const mailer = require('./src/mailer');

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || config.profile.contactEmail;
const IS_PROD = process.env.NODE_ENV === 'production';

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
if (!stripe && IS_PROD) {
  console.error('STRIPE_SECRET_KEY is required in production.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  next();
});

// ---------- helpers ----------

const randomId = (bytes) => crypto.randomBytes(bytes).toString('hex');

function newPublicId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  return 'LB-' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function money(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: config.currency }).format(cents / 100);
}

const getOrder = db.prepare('SELECT * FROM orders WHERE public_id = ?');
const getOrderFiles = db.prepare('SELECT * FROM files WHERE order_id = ? ORDER BY id');

function orderQuote(order, files) {
  const q = quote({ service: order.service, words: order.counted_words + order.estimated_words, express: order.express });
  const needsEstimate = files.some((f) => f.kind === 'source' && f.words === null);
  return { q, needsEstimate };
}

function orderView(order, { includeToken = false } = {}) {
  const files = getOrderFiles.all(order.id);
  const { q, needsEstimate } = orderQuote(order, files);
  return {
    id: order.public_id,
    ...(includeToken && { token: order.client_token }),
    status: order.status,
    service: order.service,
    source: order.source_lang,
    target: order.target_lang,
    express: Boolean(order.express),
    countedWords: order.counted_words,
    estimatedWords: order.estimated_words,
    needsEstimate,
    files: files.filter((f) => f.kind === 'source').map((f) => ({ name: f.original_name, words: f.words, size: f.size })),
    quote: q,
    paidAt: order.paid_at,
    dueAt: order.due_at,
    deliveredAt: order.delivered_at,
  };
}

function tokenMatches(order, token) {
  if (!order || typeof token !== 'string') return false;
  const a = Buffer.from(order.client_token);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function findClientOrder(req) {
  const order = getOrder.get(req.params.id);
  const token = req.get('x-order-token') || req.query.token || req.body?.token;
  return tokenMatches(order, token) ? order : null;
}

function removeStoredFile(storedName) {
  if (!storedName) return;
  fs.rm(path.join(UPLOAD_DIR, storedName), { force: true }, () => {});
}

// Multer stores names as latin1; restore UTF-8 so "Übersetzung.docx" survives.
function decodeName(name) {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

const LANG_PAIRS = new Set(config.pairs.map(([s, t]) => `${s}-${t}`));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, randomId(16) + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: config.uploads.maxFileSizeMb * 1024 * 1024, files: config.uploads.maxFiles, fieldSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (config.uploads.accepted.includes(ext)) return cb(null, true);
    cb(Object.assign(new Error(`File type ${ext || '(none)'} is not supported.`), { status: 400 }));
  },
});

// Small in-memory limiter for the endpoints that accept uploads from anyone.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const n = (hits.get(req.ip) || 0) + 1;
    hits.set(req.ip, n);
    if (n > max) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    next();
  };
}

// ---------- payment ----------

const markPaidStmt = db.prepare(`
  UPDATE orders SET status = 'paid', paid_at = datetime('now'), updated_at = datetime('now'),
    due_at = datetime('now', '+' || days || ' days')
  WHERE id = ? AND status IN ('draft', 'awaiting_payment')
`);

function markPaid(order) {
  if (markPaidStmt.run(order.id).changes === 0) return; // already handled
  const paid = getOrder.get(order.public_id);
  const v = orderView(paid);
  const pair = `${config.languages[paid.source_lang]} → ${config.languages[paid.target_lang]}`;
  const fileList = v.files.map((f) => `  - ${f.name} (${f.words ?? 'not counted'} words)`).join('\n');

  mailer.send({
    to: ADMIN_EMAIL,
    replyTo: paid.email,
    subject: `New paid order ${paid.public_id}: ${pair}, ${v.quote.words.toLocaleString('en-US')} words`,
    text: `${paid.name} <${paid.email}> paid ${money(paid.total_cents)}.

Service: ${paid.service}${paid.express ? ' (express)' : ''}
Languages: ${pair}
Words: ${v.quote.words} (${paid.counted_words} counted, ${paid.estimated_words} estimated by client)
Due: ${paid.due_at} UTC

Files:
${fileList}

Notes:
${paid.notes || '(none)'}

Open the dashboard: ${BASE_URL}/admin`,
  });

  mailer.send({
    to: paid.email,
    replyTo: config.profile.contactEmail,
    subject: `Order ${paid.public_id} confirmed`,
    text: `Hi ${paid.name},

thank you for your order. Payment of ${money(paid.total_cents)} was received and I have started on your ${pair} translation.

Order reference: ${paid.public_id}
Expected delivery: within ${paid.days} day${paid.days === 1 ? '' : 's'} (by ${paid.due_at.slice(0, 10)})

When it's ready you'll receive an email with a download link. If you have questions, just reply to this email.

Best regards,
${config.profile.name}`,
  });
}

// Stripe needs the raw body to verify the signature, so this goes before express.json().
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).end();
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;
    const order = getOrder.get(session.metadata?.orderId || '');
    if (order && session.payment_status === 'paid') markPaid(order);
  }
  res.json({ received: true });
});

app.use(express.json({ limit: '100kb' }));

// ---------- public API ----------

app.get('/api/config', (req, res) => {
  res.json({
    profile: config.profile,
    currency: config.currency,
    languages: config.languages,
    pairs: config.pairs,
    services: config.services,
    books: config.books,
    uploads: config.uploads,
    paymentsEnabled: Boolean(stripe),
  });
});

const insertOrder = db.prepare(`
  INSERT INTO orders (public_id, client_token, service, source_lang, target_lang, express, name, email, notes, counted_words, estimated_words, total_cents, days)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertFile = db.prepare('INSERT INTO files (order_id, kind, original_name, stored_name, size, words) VALUES (?, ?, ?, ?, ?, ?)');

app.post('/api/orders', rateLimit({ windowMs: 60 * 60 * 1000, max: 30 }), upload.array('files'), async (req, res, next) => {
  const uploaded = req.files || [];
  const fail = (status, error) => {
    uploaded.forEach((f) => removeStoredFile(f.filename));
    res.status(status).json({ error });
  };

  try {
    const b = req.body;
    const service = String(b.service || '');
    const name = String(b.name || '').trim();
    const email = String(b.email || '').trim();
    const notes = String(b.notes || '').trim();
    const text = String(b.text || '').trim();
    const express = b.express === '1' || b.express === 'true';
    const estimatedWords = Math.max(0, Math.min(2_000_000, parseInt(b.estimatedWords, 10) || 0));

    if (!config.services[service]) return fail(400, 'Please choose a service.');
    if (!LANG_PAIRS.has(`${b.source}-${b.target}`)) return fail(400, 'This language pair is not offered.');
    if (!name || name.length > 120) return fail(400, 'Please enter your name.');
    if (!EMAIL_RE.test(email) || email.length > 200) return fail(400, 'Please enter a valid email address.');
    if (notes.length > 5000) return fail(400, 'Notes are limited to 5,000 characters.');
    if (!uploaded.length && !text) return fail(400, 'Please upload a file or paste your text.');

    const files = [];
    for (const f of uploaded) {
      const originalName = decodeName(f.originalname).slice(0, 200);
      files.push({ originalName, storedName: f.filename, size: f.size, words: await countFileWords(f.path, originalName) });
    }
    if (text) {
      const storedName = randomId(16) + '.txt';
      fs.writeFileSync(path.join(UPLOAD_DIR, storedName), text);
      uploaded.push({ filename: storedName });
      files.push({ originalName: 'pasted-text.txt', storedName, size: Buffer.byteLength(text), words: await countFileWords(path.join(UPLOAD_DIR, storedName), 'pasted.txt') });
    }

    const countedWords = files.reduce((sum, f) => sum + (f.words || 0), 0);
    const needsEstimate = files.some((f) => f.words === null);
    const q = quote({ service, words: countedWords + (needsEstimate ? estimatedWords : 0), express });

    const publicId = newPublicId();
    db.exec('BEGIN');
    try {
      const { lastInsertRowid } = insertOrder.run(
        publicId, randomId(24), service, b.source, b.target, express ? 1 : 0, name, email, notes,
        countedWords, needsEstimate ? estimatedWords : 0, q.totalCents, q.days,
      );
      for (const f of files) insertFile.run(lastInsertRowid, 'source', f.originalName, f.storedName, f.size, f.words);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.status(201).json(orderView(getOrder.get(publicId), { includeToken: true }));
  } catch (err) {
    uploaded.forEach((f) => removeStoredFile(f.filename));
    next(err);
  }
});

const updateQuoteStmt = db.prepare(`
  UPDATE orders SET express = ?, estimated_words = ?, total_cents = ?, days = ?, updated_at = datetime('now') WHERE id = ?
`);

function applyQuoteChanges(order, { express, estimatedWords }) {
  const files = getOrderFiles.all(order.id);
  const { needsEstimate } = orderQuote(order, files);
  const est = needsEstimate ? Math.max(0, Math.min(2_000_000, parseInt(estimatedWords ?? order.estimated_words, 10) || 0)) : 0;
  const exp = express === undefined ? Boolean(order.express) : Boolean(express);
  const q = quote({ service: order.service, words: order.counted_words + est, express: exp });
  updateQuoteStmt.run(exp ? 1 : 0, est, q.totalCents, q.days, order.id);
  return getOrder.get(order.public_id);
}

app.post('/api/orders/:id/quote', (req, res) => {
  const order = findClientOrder(req);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (!['draft', 'awaiting_payment'].includes(order.status)) return res.status(409).json({ error: 'This order is already paid.' });
  res.json(orderView(applyQuoteChanges(order, req.body)));
});

app.post('/api/orders/:id/checkout', async (req, res, next) => {
  try {
    let order = findClientOrder(req);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!['draft', 'awaiting_payment'].includes(order.status)) return res.status(409).json({ error: 'This order is already paid.' });

    order = applyQuoteChanges(order, req.body);
    const view = orderView(order);
    if (view.needsEstimate && order.estimated_words === 0) {
      return res.status(400).json({ error: 'Please enter an estimated word count for the files we could not count.' });
    }
    if (view.quote.words === 0) return res.status(400).json({ error: 'We could not find any text to translate in your files.' });

    const successUrl = `${BASE_URL}/success.html?order=${order.public_id}&token=${order.client_token}`;

    if (!stripe) {
      // Local development without Stripe keys: skip payment so the whole flow can be tried.
      markPaid(order);
      return res.json({ url: successUrl });
    }

    // A client returning from a cancelled checkout gets a fresh session; close the old one so it can't be paid too.
    if (order.stripe_session_id) {
      const previous = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
      if (previous.payment_status === 'paid') {
        markPaid(order);
        return res.json({ url: successUrl });
      }
      if (previous.status === 'open') await stripe.checkout.sessions.expire(previous.id);
    }

    const pair = `${config.languages[order.source_lang]} → ${config.languages[order.target_lang]}`;
    const serviceName = { document: 'Translation', book: 'Book translation', proofreading: 'Proofreading' }[order.service];
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: order.email,
      client_reference_id: order.public_id,
      metadata: { orderId: order.public_id },
      payment_intent_data: { metadata: { orderId: order.public_id }, description: `Order ${order.public_id}` },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: config.currency,
          unit_amount: order.total_cents,
          product_data: {
            name: `${serviceName}, ${pair}${order.express ? ' (express)' : ''}`,
            description: `${view.quote.words.toLocaleString('en-US')} words · delivery within ${order.days} day${order.days === 1 ? '' : 's'} · order ${order.public_id}`,
          },
        },
      }],
      success_url: successUrl,
      cancel_url: `${BASE_URL}/order.html?resume=${order.public_id}&token=${order.client_token}`,
    });

    db.prepare(`UPDATE orders SET status = 'awaiting_payment', stripe_session_id = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(session.id, order.id);
    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

app.get('/api/orders/:id', async (req, res, next) => {
  try {
    const order = findClientOrder(req);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    // Fallback for when the webhook hasn't arrived (or isn't configured): ask Stripe directly.
    if (order.status === 'awaiting_payment' && stripe && order.stripe_session_id) {
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
      if (session.payment_status === 'paid') markPaid(order);
    }
    res.json(orderView(getOrder.get(order.public_id)));
  } catch (err) {
    next(err);
  }
});

// ---------- client delivery downloads ----------

const getOrderByToken = db.prepare('SELECT * FROM orders WHERE client_token = ?');

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

app.get('/delivery/:token', (req, res) => {
  const order = getOrderByToken.get(req.params.token);
  if (!order) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  const files = getOrderFiles.all(order.id).filter((f) => f.kind === 'delivery');
  const items = files.length
    ? files.map((f) => `<li><a class="file-link" href="/delivery/${order.client_token}/files/${f.id}">${escapeHtml(f.original_name)}</a><span class="muted">${(f.size / 1024).toFixed(0)} KB</span></li>`).join('')
    : '<li class="muted">Your translation isn\'t ready yet. You\'ll get an email as soon as it is.</li>';
  const template = fs.readFileSync(path.join(__dirname, 'views', 'delivery.html'), 'utf8');
  const values = {
    orderId: escapeHtml(order.public_id),
    name: escapeHtml(order.name),
    message: order.delivery_message ? `<blockquote>${escapeHtml(order.delivery_message).replace(/\n/g, '<br>')}</blockquote>` : '',
    files: items,
    contactEmail: escapeHtml(config.profile.contactEmail),
  };
  res.set('Cache-Control', 'no-store').send(template.replace(/\{\{(\w+)\}\}/g, (m, key) => values[key] ?? m));
});

app.get('/delivery/:token/files/:fileId', (req, res) => {
  const order = getOrderByToken.get(req.params.token);
  const file = order && db.prepare(`SELECT * FROM files WHERE id = ? AND order_id = ? AND kind = 'delivery'`).get(req.params.fileId, order.id);
  if (!file) return res.status(404).end();
  res.download(path.join(UPLOAD_DIR, file.stored_name), file.original_name);
});

// ---------- admin ----------

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).send('Set ADMIN_PASSWORD to enable the dashboard.');
  const [scheme, encoded] = (req.get('authorization') || '').split(' ');
  const password = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':') : '';
  const a = crypto.createHash('sha256').update(password).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  if (crypto.timingSafeEqual(a, b)) return next();
  res.set('WWW-Authenticate', 'Basic realm="Orders", charset="UTF-8"').status(401).send('Authentication required.');
}

app.get('/admin', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const showDrafts = req.query.drafts === '1';
  const orders = db.prepare(`SELECT * FROM orders ${showDrafts ? '' : "WHERE status NOT IN ('draft', 'awaiting_payment')"} ORDER BY id DESC LIMIT 500`).all();
  res.json(orders.map((o) => ({
    ...o,
    client_token: undefined,
    deliveryUrl: `${BASE_URL}/delivery/${o.client_token}`,
    files: getOrderFiles.all(o.id).map(({ id, kind, original_name, size, words, created_at }) => ({ id, kind, original_name, size, words, created_at })),
  })));
});

app.get('/api/admin/files/:fileId', requireAdmin, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.fileId);
  if (!file) return res.status(404).end();
  res.download(path.join(UPLOAD_DIR, file.stored_name), file.original_name);
});

const ADMIN_STATUSES = ['paid', 'in_progress', 'delivered', 'completed', 'cancelled'];

app.post('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
  if (!ADMIN_STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status.' });
  const r = db.prepare(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE public_id = ?`).run(req.body.status, req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Order not found.' });
  res.json({ ok: true });
});

app.post('/api/admin/orders/:id/deliver', requireAdmin, multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, randomId(16) + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 20 },
}).array('files'), (req, res) => {
  const order = getOrder.get(req.params.id);
  const uploaded = req.files || [];
  if (!order) {
    uploaded.forEach((f) => removeStoredFile(f.filename));
    return res.status(404).json({ error: 'Order not found.' });
  }
  if (!uploaded.length) return res.status(400).json({ error: 'Attach at least one file.' });

  const message = String(req.body.message || '').trim().slice(0, 5000);
  for (const f of uploaded) insertFile.run(order.id, 'delivery', decodeName(f.originalname).slice(0, 200), f.filename, f.size, null);
  db.prepare(`UPDATE orders SET status = 'delivered', delivered_at = datetime('now'), delivery_message = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(message, order.id);

  mailer.send({
    to: order.email,
    replyTo: config.profile.contactEmail,
    subject: `Your translation is ready (order ${order.public_id})`,
    text: `Hi ${order.name},

your translation is ready. Download it here:
${BASE_URL}/delivery/${order.client_token}
${message ? `\n${message}\n` : ''}
If you'd like any changes, just reply to this email. Your order includes ${config.services[order.service].revisions} revision${config.services[order.service].revisions === 1 ? '' : 's'}.

Best regards,
${config.profile.name}`,
  });
  res.json({ ok: true });
});

// Deletes the client's source files from disk (keeps the order record and delivered files).
app.post('/api/admin/orders/:id/purge-sources', requireAdmin, (req, res) => {
  const order = getOrder.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const files = getOrderFiles.all(order.id).filter((f) => f.kind === 'source');
  files.forEach((f) => removeStoredFile(f.stored_name));
  db.prepare(`DELETE FROM files WHERE order_id = ? AND kind = 'source'`).run(order.id);
  res.json({ ok: true, removed: files.length });
});

// ---------- static site & errors ----------

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: `Each file can be at most ${config.uploads.maxFileSizeMb} MB.`,
      LIMIT_FILE_COUNT: `You can upload up to ${config.uploads.maxFiles} files at once.`,
    };
    return res.status(400).json({ error: messages[err.code] || err.message });
  }
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again or contact us by email.' });
});

// ---------- housekeeping ----------

function purgeOldDrafts() {
  const old = db.prepare(`
    SELECT id FROM orders WHERE status IN ('draft', 'awaiting_payment') AND created_at < datetime('now', ?)
  `).all(`-${config.draftRetentionDays} days`);
  for (const { id } of old) {
    getOrderFiles.all(id).forEach((f) => removeStoredFile(f.stored_name));
    db.prepare('DELETE FROM orders WHERE id = ?').run(id);
  }
}

if (require.main === module) {
  purgeOldDrafts();
  setInterval(purgeOldDrafts, 60 * 60 * 1000).unref();
  app.listen(PORT, () => {
    console.log(`Listening on ${BASE_URL}`);
    if (!stripe) console.log('Stripe is not configured: checkout marks orders as paid without charging (development only).');
    if (!ADMIN_PASSWORD) console.log('ADMIN_PASSWORD is not set: the /admin dashboard is disabled.');
  });
}

module.exports = app;
