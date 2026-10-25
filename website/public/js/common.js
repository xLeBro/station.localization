const configPromise = fetch('/api/config').then((r) => r.json());

function formatMoney(cents, currency, { precise = false } = {}) {
  const locale = currentLang === 'de' ? 'de-DE' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: precise ? 2 : (cents % 100 === 0 ? 0 : 2),
    maximumFractionDigits: precise ? 3 : 2,
  }).format(cents / 100);
}

function formatNumber(n) {
  return new Intl.NumberFormat(currentLang === 'de' ? 'de-DE' : 'en-US').format(n);
}

// Mirrors src/pricing.js for instant estimates in the browser; the server's quote is authoritative.
function estimate(services, service, words, express) {
  const s = services[service];
  const base = Math.max(Math.round(words * s.perWord * 100), s.minimum * 100);
  const total = base + (express ? Math.round(base * s.expressSurcharge) : 0);
  let days = Math.max(s.minDays, Math.ceil(words / s.wordsPerDay));
  if (express) days = Math.max(1, Math.ceil(days * s.expressDayFactor));
  return { total, days };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

document.addEventListener('DOMContentLoaded', () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const header = document.querySelector('.site-header');
  const onScroll = () => header?.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const toggle = document.querySelector('.menu-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && links.classList.contains('open')) {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
    links.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  configPromise.then((cfg) => {
    document.querySelectorAll('.contact-email').forEach((a) => {
      a.href = `mailto:${cfg.profile.contactEmail}`;
    });
  });
});
