# Leandro Brouschert · translation website

A small website where clients order translations directly: they upload their files (or paste text), see an instant per-word quote with automatic word counting, pay through Stripe, and receive the translation through a private download link. You manage everything at `/admin`.

## What's included

| Page | Purpose |
| --- | --- |
| `/` | Home: services, published book translations (Amazon), process, pricing with a price calculator, FAQ. English and German. |
| `/order` | Order form: service, language pair, file upload or pasted text, notes, express option → quote → Stripe Checkout. |
| `/success` | Order confirmation with reference and expected delivery date. |
| `/delivery/<token>` | Private client page to download the finished translation. |
| `/admin` | Password-protected dashboard: paid orders, download source files, upload the translation (emails the client), change status, delete source files. |
| `/legal` | Legal notice, terms and privacy **template; fill in the bracketed parts**. |

Word counts are automatic for `.docx`, `.pdf` (with a text layer), `.txt`, `.md`, `.srt`, `.html` and `.csv`. Other accepted formats (`.doc`, `.odt`, `.rtf`, `.pptx`, `.xlsx`, `.epub`, scanned PDFs) ask the client for an estimate.

## Editing content and prices

Everything business-related is in [`src/config.js`](src/config.js): prices per word, minimums, delivery speed, express surcharge, language pairs, Fiverr rating, and the list of published books. The default prices are derived from the Fiverr gigs ($45 for 1,500 words in 2 days; $650 for a 50,000-word book in 10 days, +$120 for 7 days). Proofreading prices are a starting suggestion.

Page text is in `public/index.html` (English) and `public/js/i18n.js` (German).

## Running locally

Requires Node.js 22.13 or newer (uses the built-in SQLite).

```bash
npm install
ADMIN_PASSWORD=test npm run dev   # http://localhost:3000
npm test
```

Without Stripe keys, checkout skips payment and marks the order as paid so you can try the whole flow. Emails are printed to the console until SMTP is configured.

## Going live

1. **Stripe:** create an account at stripe.com and activate payments. Copy the secret key into `STRIPE_SECRET_KEY`. Add a webhook endpoint `https://your-domain.com/api/stripe/webhook` for the events `checkout.session.completed` and `checkout.session.async_payment_succeeded`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`. Payment methods (cards, Apple Pay, Google Pay, Bancontact, PayPal etc.) are switched on in the Stripe dashboard; no code changes needed.
2. **Email:** sign up with any SMTP provider (e.g. Brevo or Postmark have free tiers) and fill in the `SMTP_*` variables, verifying your domain so mails don't land in spam.
3. **Hosting:** any host that runs Docker or Node with a **persistent disk** for `DATA_DIR` (orders and uploaded files live there). Good options: Render (web service + disk), Railway (+ volume), Fly.io (+ volume), or a small VPS (Hetzner, from about €4/month). Set the variables from `.env.example`.
4. **Domain:** point your domain to the host and set `BASE_URL` to it.
5. Fill in `public/legal.html` and set `CONTACT_EMAIL`.
6. Back up `DATA_DIR/orders.db` regularly.

## Order lifecycle

`draft` (quote shown) → `awaiting_payment` (sent to Stripe) → `paid` (you and the client get an email) → `in_progress` → `delivered` (client gets an email with the download link) → `completed`. Unpaid quotes and their files are deleted automatically after 7 days. Refunds are issued from the Stripe dashboard.
