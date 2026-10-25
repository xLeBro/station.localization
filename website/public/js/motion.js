// Scroll-driven motion for the home page. Everything here is progressive enhancement:
// without JS (or with reduced motion) the content is simply shown in its final state.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

// Tweens a number in el from `from` to `to`, formatting each frame.
function tweenNumber(el, from, to, format, duration = 900) {
  cancelAnimationFrame(el._tween);
  if (reduceMotion.matches || from === to) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / duration);
    el.textContent = format(from + (to - from) * easeOutCubic(p));
    if (p < 1) el._tween = requestAnimationFrame(step);
  };
  el._tween = requestAnimationFrame(step);
}

function formatCount(el, value) {
  const decimals = Number(el.dataset.decimals || 0);
  const locale = currentLang === 'de' ? 'de-DE' : 'en-US';
  const n = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  return n + (el.dataset.suffix || '');
}

// Shows a [data-count] element's final value, counting up the first time it becomes visible.
function refreshCount(el) {
  const target = Number(el.dataset.count);
  if (el.dataset.counted) el.textContent = formatCount(el, target);
}

function startCount(el) {
  if (el.dataset.counted) return;
  el.dataset.counted = '1';
  tweenNumber(el, 0, Number(el.dataset.count), (v) => formatCount(el, v), 1400);
}

const revealObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        settle(entry.target);
        entry.target.querySelectorAll('[data-count]').forEach(startCount);
        if (entry.target.matches('[data-count]')) startCount(entry.target);
        revealObserver.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
  : null;

// Once revealed, drop the reveal transition so the element's own hover transitions apply.
function settle(el) {
  const delay = parseFloat(getComputedStyle(el).transitionDelay) * 1000 || 0;
  setTimeout(() => el.classList.add('settled'), delay + 800);
}

// Observes .reveal elements (and loose counters) inside root; siblings get a staggered delay.
function observeReveal(root = document) {
  const items = root.querySelectorAll('.reveal:not(.in)');
  items.forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
    el.style.setProperty('--d', `${Math.min(siblings.indexOf(el), 6) * 80}ms`);
    if (revealObserver && !reduceMotion.matches) revealObserver.observe(el);
    else el.classList.add('in', 'settled');
  });
  root.querySelectorAll('[data-count]').forEach((el) => {
    if (el.closest('.reveal')) return;
    if (revealObserver && !reduceMotion.matches) revealObserver.observe(el);
    else startCount(el);
  });
  if (!revealObserver || reduceMotion.matches) root.querySelectorAll('[data-count]').forEach(startCount);
}

// 3D tilt that follows the pointer, for book covers.
function enableTilt(el) {
  if (!finePointer.matches || reduceMotion.matches) return;
  const target = el.querySelector('.cover-wrap') || el;
  let frame;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      target.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
      target.style.setProperty('--rx', `${(-y * 14).toFixed(2)}deg`);
      target.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
      target.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
    });
  });
  el.addEventListener('pointerleave', () => {
    cancelAnimationFrame(frame);
    ['--rx', '--ry', '--gx', '--gy'].forEach((p) => target.style.removeProperty(p));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  observeReveal();

  // Scroll progress bar and hero parallax, batched into one frame per scroll.
  const bar = document.querySelector('.scroll-progress');
  const glow = document.querySelector('.hero-glow');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const y = scrollY;
      if (bar) bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
      if (glow && !reduceMotion.matches && y < innerHeight * 1.2) glow.style.transform = `translate3d(0, ${y * 0.25}px, 0)`;
      ticking = false;
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Highlight the nav link of the section in view.
  const links = new Map([...document.querySelectorAll('.nav-links a[href^="#"]')].map((a) => [a.getAttribute('href').slice(1), a]));
  if ('IntersectionObserver' in window && links.size) {
    const navObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const link = links.get(entry.target.id);
        if (!link) continue;
        if (entry.isIntersecting) {
          links.forEach((a) => a.removeAttribute('aria-current'));
          link.setAttribute('aria-current', 'true');
        } else if (link.getAttribute('aria-current')) {
          link.removeAttribute('aria-current');
        }
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((a, id) => {
      const section = document.getElementById(id);
      if (section) navObserver.observe(section);
    });
  }

  document.addEventListener('langchange', () => document.querySelectorAll('[data-count]').forEach(refreshCount));
});
