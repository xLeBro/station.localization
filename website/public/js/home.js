// Hand-written examples for the hero card. Source/target are language codes.
const SAMPLES = [
  {
    src: 'en', tgt: 'de',
    a: '“The ocean keeps its secrets well, until someone is reckless enough to go looking.”',
    b: '„Der Ozean hütet seine Geheimnisse gut, bis jemand leichtsinnig genug ist, nach ihnen zu suchen.“',
  },
  {
    src: 'en', tgt: 'fr',
    a: '“She hadn’t planned on staying in town, but the town had other plans.”',
    b: '« Elle n’avait pas prévu de rester en ville, mais la ville en avait décidé autrement. »',
  },
  {
    src: 'de', tgt: 'en',
    a: '„Bitte lesen Sie die Bedingungen sorgfältig durch, bevor Sie unterschreiben.“',
    b: '“Please read the terms carefully before signing.”',
  },
  {
    src: 'en', tgt: 'de',
    a: '“Free shipping on every order over $50.”',
    b: '„Kostenloser Versand ab 50 $ Bestellwert.“',
  },
];
const NATIVE = { en: 'English', de: 'Deutsch', fr: 'Français' };
const SAMPLE_INTERVAL = 7000;

function setupSamples() {
  const box = document.getElementById('sample');
  const card = box.closest('.hero-card');
  const dots = document.getElementById('sample-dots');
  const toggle = document.getElementById('sample-toggle');
  const srcEl = document.getElementById('sample-src');
  const tgtEl = document.getElementById('sample-tgt');
  let index = 0;
  let timer;
  let userPaused = reduceMotion.matches;
  let hoverPaused = false;
  let visible = true;

  dots.innerHTML = SAMPLES.map((_, i) => `<button type="button" class="sample-dot" data-i="${i}"></button>`).join('');

  function labels() {
    dots.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-label', t('sampleN', i + 1, SAMPLES.length)));
    toggle.setAttribute('aria-label', userPaused ? t('playSamples') : t('pauseSamples'));
    toggle.classList.toggle('is-paused', userPaused);
  }

  function show(i, { animate = true } = {}) {
    index = (i + SAMPLES.length) % SAMPLES.length;
    const s = SAMPLES[index];
    document.getElementById('sample-src-lang').textContent = NATIVE[s.src];
    document.getElementById('sample-tgt-lang').textContent = NATIVE[s.tgt];
    srcEl.lang = s.src;
    tgtEl.lang = s.tgt;
    srcEl.textContent = s.a;
    tgtEl.innerHTML = s.b.split(' ').map((w, n) => `<span class="w" style="--i:${n}">${escapeHtml(w)}</span>`).join(' ');
    dots.querySelectorAll('button').forEach((b, n) => b.setAttribute('aria-current', String(n === index)));
    box.classList.remove('animate');
    if (animate && !reduceMotion.matches) requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('animate')));
  }

  function schedule() {
    clearTimeout(timer);
    if (userPaused || hoverPaused || !visible || document.hidden) return;
    timer = setTimeout(() => { show(index + 1); schedule(); }, SAMPLE_INTERVAL);
  }

  dots.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    box.setAttribute('aria-live', 'polite'); // announce only changes the user asked for
    show(Number(b.dataset.i));
    schedule();
  });
  toggle.addEventListener('click', () => {
    userPaused = !userPaused;
    labels();
    schedule();
  });
  card.addEventListener('pointerenter', () => { hoverPaused = true; schedule(); });
  card.addEventListener('pointerleave', () => { hoverPaused = false; schedule(); });
  card.addEventListener('focusin', () => { hoverPaused = true; schedule(); });
  card.addEventListener('focusout', (e) => { if (!card.contains(e.relatedTarget)) { hoverPaused = false; schedule(); } });
  document.addEventListener('visibilitychange', schedule);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); }).observe(card);
  }
  document.addEventListener('langchange', labels);

  labels();
  show(0, { animate: false });
  schedule();
}

// Word slider is logarithmic so both a 300-word letter and a 150,000-word novel are easy to pick.
const MIN_WORDS = 100;
const MAX_WORDS = 200000;
const SLIDER_STEPS = 1000;
const sliderToWords = (v) => {
  const raw = MIN_WORDS * Math.pow(MAX_WORDS / MIN_WORDS, v / SLIDER_STEPS);
  const step = raw < 1000 ? 50 : raw < 10000 ? 100 : 500;
  return Math.round(raw / step) * step;
};
const wordsToSlider = (w) => Math.round((SLIDER_STEPS * Math.log(Math.max(MIN_WORDS, w) / MIN_WORDS)) / Math.log(MAX_WORDS / MIN_WORDS));

configPromise.then((cfg) => {
  const $ = (id) => document.getElementById(id);
  const words = $('calc-words');
  const range = $('calc-range');
  const express = $('calc-express');
  const out = $('calc-out');
  let lastCents = 0;

  $('stat-books').dataset.count = cfg.books.length;
  $('rating').dataset.count = cfg.profile.fiverrRating;
  $('reviews').dataset.count = cfg.profile.fiverrReviews;
  ['stat-books', 'rating', 'reviews'].forEach((id) => refreshCount($(id)));
  $('amazon-link').href = cfg.profile.amazonUrl;
  $('amazon-footer').href = cfg.profile.amazonUrl;
  $('fiverr-link').href = cfg.profile.fiverrUrl;

  const books = $('books');
  books.innerHTML = cfg.books.map((b, i) => `
    <a class="book reveal" href="${escapeHtml(b.url)}" target="_blank" rel="noopener">
      <div class="cover-wrap">
        <div class="cover cover-${i % 8}" translate="no">
          <span class="c-series">${escapeHtml(b.series)}</span>
          <span class="c-title">${escapeHtml(b.title)}</span>
          <span class="c-author">${escapeHtml(b.author)}</span>
        </div>
      </div>
      <div class="book-meta"><b translate="no">${escapeHtml(b.title)}</b><span class="book-pair" data-pair="${escapeHtml(b.pair)}"></span></div>
    </a>`).join('');
  books.querySelectorAll('.book').forEach(enableTilt);
  observeReveal(books);

  function render() {
    // Group pairs like English ⇄ German when both directions exist.
    const seen = new Set();
    const chips = [];
    for (const [s, tg] of cfg.pairs) {
      if (seen.has(`${s}-${tg}`)) continue;
      const both = cfg.pairs.some(([a, b]) => a === tg && b === s);
      seen.add(`${s}-${tg}`);
      if (both) seen.add(`${tg}-${s}`);
      chips.push(`<span class="pair-chip">${langName(s)} <span>${both ? '⇄' : '→'}</span> ${langName(tg)}</span>`);
    }
    $('pairs').innerHTML = chips.join('');

    books.querySelectorAll('[data-pair]').forEach((el) => {
      const [s, tg] = el.dataset.pair.split('-');
      el.textContent = `${langName(s)} → ${langName(tg)}`;
    });

    document.querySelectorAll('[data-rate]').forEach((el) => {
      el.textContent = formatMoney(cfg.services[el.dataset.rate].perWord * 100, cfg.currency, { precise: true });
    });
    document.querySelectorAll('[data-min]').forEach((el) => {
      el.textContent = formatMoney(cfg.services[el.dataset.min].minimum * 100, cfg.currency);
    });
    document.querySelectorAll('[data-rev]').forEach((el) => { el.textContent = cfg.services[el.dataset.rev].revisions; });
    document.querySelectorAll('[data-speed]').forEach((el) => { el.textContent = formatNumber(cfg.services[el.dataset.speed].wordsPerDay); });

    const exampleWords = 50000;
    const normal = estimate(cfg.services, 'book', exampleWords, false);
    const fast = estimate(cfg.services, 'book', exampleWords, true);
    const ex = { words: formatNumber(exampleWords), price: formatMoney(normal.total, cfg.currency), days: normal.days, xdays: fast.days };
    document.querySelectorAll('[data-ex]').forEach((el) => { el.textContent = ex[el.dataset.ex]; });

    updateCalc(false);
  }

  function updateCalc(animate = true) {
    const service = document.querySelector('input[name="calc-service"]:checked').value;
    const n = Math.max(0, Math.min(500000, parseInt(words.value, 10) || 0));
    const { total, days } = estimate(cfg.services, service, n, express.checked);
    const fmt = (c) => formatMoney(Math.round(c / 100) * 100, cfg.currency);
    if (animate) tweenNumber(out, lastCents, total, fmt, 450);
    else out.textContent = fmt(total);
    lastCents = total;
    $('calc-days').textContent = t('calcDays', days);
    $('calc-order').href = `/order?service=${service}${express.checked ? '&express=1' : ''}`;
  }

  range.max = SLIDER_STEPS;
  range.value = wordsToSlider(Number(words.value));
  range.addEventListener('input', () => { words.value = sliderToWords(Number(range.value)); updateCalc(); });
  words.addEventListener('input', () => { range.value = wordsToSlider(parseInt(words.value, 10) || 0); updateCalc(); });
  express.addEventListener('change', () => updateCalc());
  document.querySelectorAll('input[name="calc-service"]').forEach((r) => r.addEventListener('change', () => updateCalc()));

  document.addEventListener('langchange', render);
  render();
});

document.addEventListener('DOMContentLoaded', setupSamples);
