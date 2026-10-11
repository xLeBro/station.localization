configPromise.then((cfg) => {
  const pairs = document.getElementById('pairs');
  const books = document.getElementById('books');
  const calcWords = document.getElementById('calc-words');
  const calcService = document.getElementById('calc-service');

  document.getElementById('rating').textContent = cfg.profile.fiverrRating;
  document.getElementById('stat-books').textContent = cfg.books.length;
  document.getElementById('amazon-link').href = cfg.profile.amazonUrl;
  document.getElementById('amazon-footer').href = cfg.profile.amazonUrl;
  document.getElementById('fiverr-link').href = cfg.profile.fiverrUrl;

  books.innerHTML = cfg.books.map((b, i) => `
    <a class="book" href="${escapeHtml(b.url)}" target="_blank" rel="noopener">
      <div class="cover cover-${i % 8}">
        <span class="c-series">${escapeHtml(b.series)}</span>
        <span class="c-title">${escapeHtml(b.title)}</span>
        <span class="c-author">${escapeHtml(b.author)}</span>
      </div>
      <div class="book-meta"><b>${escapeHtml(b.title)}</b><span>${b.pair.toUpperCase().replace('-', ' → ')}</span></div>
    </a>`).join('');

  function render() {
    // Group pairs like EN ⇄ DE when both directions exist.
    const seen = new Set();
    const chips = [];
    for (const [s, tg] of cfg.pairs) {
      if (seen.has(`${s}-${tg}`)) continue;
      const both = cfg.pairs.some(([a, b]) => a === tg && b === s);
      seen.add(`${s}-${tg}`);
      if (both) seen.add(`${tg}-${s}`);
      chips.push(`<span class="pair-chip">${langName(s)} <span>${both ? '⇄' : '→'}</span> ${langName(tg)}</span>`);
    }
    pairs.innerHTML = chips.join('');

    document.getElementById('reviews').textContent = formatNumber(cfg.profile.fiverrReviews);
    document.querySelectorAll('[data-rate]').forEach((el) => {
      el.textContent = formatMoney(cfg.services[el.dataset.rate].perWord * 100, cfg.currency, { precise: true });
    });
    document.querySelectorAll('[data-min]').forEach((el) => {
      el.textContent = formatMoney(cfg.services[el.dataset.min].minimum * 100, cfg.currency);
    });
    document.querySelectorAll('[data-rev]').forEach((el) => {
      el.textContent = cfg.services[el.dataset.rev].revisions;
    });
    updateCalc();
  }

  function updateCalc() {
    const words = Math.max(0, parseInt(calcWords.value, 10) || 0);
    const { total, days } = estimate(cfg.services, calcService.value, words, false);
    document.getElementById('calc-out').textContent = formatMoney(total, cfg.currency);
    document.getElementById('calc-days').textContent = t('calcDays', days);
  }

  calcWords.addEventListener('input', updateCalc);
  calcService.addEventListener('change', updateCalc);
  document.addEventListener('langchange', render);
  render();
});
