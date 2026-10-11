configPromise.then((cfg) => {
  const $ = (id) => document.getElementById(id);
  const form = $('order-form');
  const review = $('review');
  const alertBox = $('alert');
  const source = $('source');
  const target = $('target');
  const fileInput = $('file-input');
  const dropzone = $('dropzone');
  const fileList = $('file-list');
  const maxBytes = cfg.uploads.maxFileSizeMb * 1024 * 1024;

  let files = [];
  let order = null; // server view of the current order, plus token

  // ---------- step 1 ----------

  const params = new URLSearchParams(location.search);
  const preset = params.get('service');
  if (preset && cfg.services[preset]) $(`svc-${preset}`).checked = true;

  function renderLanguages() {
    const s = source.value || 'en';
    const tg = target.value;
    const sources = [...new Set(cfg.pairs.map(([a]) => a))];
    source.innerHTML = sources.map((c) => `<option value="${c}">${langName(c)}</option>`).join('');
    source.value = s;
    const targets = cfg.pairs.filter(([a]) => a === source.value).map(([, b]) => b);
    target.innerHTML = targets.map((c) => `<option value="${c}">${langName(c)}</option>`).join('');
    target.value = targets.includes(tg) ? tg : targets[0];
    $('swap').disabled = !cfg.pairs.some(([a, b]) => a === target.value && b === source.value);
    $('pair-hint').textContent = t('pairHint');
  }
  source.addEventListener('change', renderLanguages);
  target.addEventListener('change', renderLanguages);
  $('swap').addEventListener('click', () => {
    const s = source.value;
    source.value = target.value;
    renderLanguages();
    target.value = s;
    renderLanguages();
  });

  function showError(msg) {
    alertBox.textContent = msg;
    alertBox.classList.remove('hidden');
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const clearError = () => alertBox.classList.add('hidden');

  function addFiles(list) {
    clearError();
    for (const f of list) {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      if (!cfg.uploads.accepted.includes(ext)) { showError(t('badType', f.name)); continue; }
      if (f.size > maxBytes) { showError(t('tooBig', f.name, cfg.uploads.maxFileSizeMb)); continue; }
      if (files.length >= cfg.uploads.maxFiles) { showError(t('tooMany', cfg.uploads.maxFiles)); break; }
      if (!files.some((x) => x.name === f.name && x.size === f.size)) files.push(f);
    }
    renderFiles();
  }

  function renderFiles() {
    fileList.innerHTML = files.map((f, i) => `
      <li>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>
        <span class="fname">${escapeHtml(f.name)}</span>
        <span class="muted">${(f.size / 1024 / 1024).toFixed(f.size < 1024 * 1024 ? 2 : 1)} MB</span>
        <button type="button" data-remove="${i}" aria-label="Remove">✕</button>
      </li>`).join('');
  }

  fileList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    files.splice(Number(btn.dataset.remove), 1);
    renderFiles();
  });

  fileInput.accept = cfg.uploads.accepted.join(',');
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); }));
  dropzone.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

  $('paste-toggle').addEventListener('click', () => {
    $('paste-wrap').classList.toggle('hidden');
    $('text').focus();
  });

  function setBusy(btn, busy, label) {
    btn.disabled = busy;
    if (busy) {
      btn.dataset.html = btn.innerHTML;
      btn.innerHTML = `<span class="spinner"></span> <span>${escapeHtml(label)}</span>`;
    } else if (btn.dataset.html) {
      btn.innerHTML = btn.dataset.html;
    }
  }

  // XHR instead of fetch so large manuscripts show upload progress.
  function upload(formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/orders');
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => {
        let body = {};
        try { body = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body.error || t('network')));
      };
      xhr.onerror = () => reject(new Error(t('network')));
      xhr.send(formData);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const text = $('text').value.trim();
    const name = $('name').value.trim();
    const email = $('email').value.trim();
    if (!files.length && !text) return showError(t('needFile'));
    if (!name) return showError(t('needName'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError(t('needEmail'));

    const fd = new FormData();
    fd.append('service', form.service.value);
    fd.append('source', source.value);
    fd.append('target', target.value);
    fd.append('name', name);
    fd.append('email', email);
    fd.append('notes', $('notes').value.trim());
    fd.append('express', $('express').checked ? '1' : '0');
    if (text) fd.append('text', text);
    files.forEach((f) => fd.append('files', f));

    const btn = $('quote-btn');
    setBusy(btn, true, t('calculating'));
    try {
      order = await upload(fd, (p) => {
        const label = btn.querySelector('span:last-child');
        if (label) label.textContent = p < 100 ? `${p}%` : t('calculating');
      });
      try { sessionStorage.setItem('order', JSON.stringify({ id: order.id, token: order.token })); } catch {}
      showReview();
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(btn, false);
    }
  });

  // ---------- step 2 ----------

  function showReview() {
    form.classList.add('hidden');
    review.classList.remove('hidden');
    $('ind-1').classList.remove('active');
    $('ind-2').classList.add('active');
    $('express-2').checked = order.express;
    if (order.needsEstimate && order.estimatedWords) $('estimate').value = order.estimatedWords;
    renderReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderReview() {
    if (!order) return;
    const q = order.quote;
    const s = cfg.services[order.service];
    const rows = [
      [t('serviceLabel'), escapeHtml(t('service')[order.service])],
      [t('languagesLabel'), `${langName(order.source)} → ${langName(order.target)}`],
      ...order.files.map((f) => [
        escapeHtml(f.name === 'pasted-text.txt' ? t('pasted') : f.name),
        f.words === null ? `<span class="muted">${t('notCounted')}</span>` : t('words', formatNumber(f.words)),
      ]),
      [`<b>${t('wordsLabel')}</b>`, `<b>${formatNumber(q.words)}</b>${order.estimatedWords ? ` <span class="muted">(${formatNumber(order.estimatedWords)} ${t('estimated')})</span>` : ''}`],
      [
        q.baseCents === s.minimum * 100 && q.words * s.perWord < s.minimum
          ? t('minimumApplied', formatMoney(s.minimum * 100, cfg.currency))
          : t('perWordLine', formatMoney(s.perWord * 100, cfg.currency, { precise: true })),
        formatMoney(q.baseCents, cfg.currency),
      ],
    ];
    if (q.express) rows.push([t('express'), formatMoney(q.expressCents, cfg.currency)]);
    $('summary-rows').innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');

    $('estimate-wrap').classList.toggle('hidden', !order.needsEstimate);
    $('total').textContent = formatMoney(q.totalCents, cfg.currency);
    $('pay-amount').textContent = formatMoney(q.totalCents, cfg.currency);
    $('delivery-line').textContent = t('deliveryIn', q.days);

    const fast = estimate(cfg.services, order.service, q.words, true);
    const slow = estimate(cfg.services, order.service, q.words, false);
    $('express-price').textContent = `· ${t('expressAdd', formatMoney(fast.total - slow.total, cfg.currency))}, ${t('days', fast.days)}`;
    updatePayButton();
  }

  function updatePayButton() {
    const needsEstimate = order?.needsEstimate && !(parseInt($('estimate').value, 10) > 0);
    $('pay-btn').disabled = !$('terms').checked || needsEstimate;
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Order-Token': order.token },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('network'));
    return data;
  }

  let requoteTimer;
  function requote() {
    clearTimeout(requoteTimer);
    requoteTimer = setTimeout(async () => {
      try {
        const updated = await api(`/api/orders/${order.id}/quote`, {
          express: $('express-2').checked,
          estimatedWords: parseInt($('estimate').value, 10) || 0,
        });
        order = { ...updated, token: order.token };
        renderReview();
      } catch (err) {
        showError(err.message);
      }
    }, 250);
  }

  $('express-2').addEventListener('change', requote);
  $('estimate').addEventListener('input', () => { updatePayButton(); requote(); });
  $('terms').addEventListener('change', updatePayButton);

  $('pay-btn').addEventListener('click', async () => {
    clearError();
    const btn = $('pay-btn');
    setBusy(btn, true, t('redirecting'));
    try {
      const { url } = await api(`/api/orders/${order.id}/checkout`, {
        express: $('express-2').checked,
        estimatedWords: parseInt($('estimate').value, 10) || 0,
      });
      location.href = url;
    } catch (err) {
      showError(err.message);
      setBusy(btn, false);
      updatePayButton();
    }
  });

  $('back-btn').addEventListener('click', () => {
    review.classList.add('hidden');
    form.classList.remove('hidden');
    $('ind-2').classList.remove('active');
    $('ind-1').classList.add('active');
    order = null;
  });

  // Returning from a cancelled Stripe checkout: reopen the same quote.
  async function resume() {
    const id = params.get('resume');
    const token = params.get('token');
    if (!id || !token) return;
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, { headers: { 'X-Order-Token': token } });
      if (!res.ok) return;
      const data = await res.json();
      if (!['draft', 'awaiting_payment'].includes(data.status)) {
        location.href = `/success?order=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
        return;
      }
      order = { ...data, token };
      showReview();
    } catch {}
  }

  document.addEventListener('langchange', () => { renderLanguages(); renderReview(); $('file-types').textContent = t('fileTypes', cfg.uploads.accepted.join(' '), cfg.uploads.maxFileSizeMb); });
  renderLanguages();
  $('file-types').textContent = t('fileTypes', cfg.uploads.accepted.join(' '), cfg.uploads.maxFileSizeMb);
  resume();
});
