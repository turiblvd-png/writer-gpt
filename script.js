/* Writer-GPT landing page — interactions */
(() => {
  'use strict';
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k){ try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v){ try { localStorage.setItem(k, v); } catch { /* private mode */ } }
  };

  /* ---------- theme ---------- */
  const root = document.documentElement;
  // dark is the brand default; only an explicit choice overrides it
  const saved = store.get('wg-theme');
  if (saved) root.dataset.theme = saved;

  $('#themeBtn')?.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    store.set('wg-theme', next);
  });

  /* ---------- sticky header ---------- */
  const hdr = $('#hdr');
  const onScroll = () => hdr.classList.toggle('is-stuck', window.scrollY > 8);
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });

  /* ---------- nav: mobile + mega menu ---------- */
  const nav = $('#nav'), burger = $('#burger');
  burger?.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    // the cookie bar sits at the bottom of the screen and would cover the sheet's last links
    document.body.classList.toggle('nav-open', open);
  });

  const menuItem = $('.has-menu'), menuBtn = menuItem?.querySelector('.nav__link');
  const setMenu = open => {
    menuItem.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn?.addEventListener('click', e => { e.stopPropagation(); setMenu(!menuItem.classList.contains('is-open')); });
  document.addEventListener('click', e => { if (menuItem && !menuItem.contains(e.target)) setMenu(false); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    setMenu(false);
    if (nav.classList.contains('is-open')) burger.click();
  });

  // close the mobile sheet after tapping a link
  $$('.nav a').forEach(a => a.addEventListener('click', () => {
    if (nav.classList.contains('is-open')) burger.click();
    setMenu(false);
  }));

  /* ---------- hero typewriter ---------- */
  const typed = $('#typed');
  if (typed) {
    const words = ['Google', '160+ languages', 'ChatGPT', 'every market', 'position #1'];
    let w = 0, i = 0, erasing = false;
    (function tick() {
      const word = words[w];
      typed.textContent = word.slice(0, i);
      let wait = erasing ? 45 : 85;
      if (!erasing && i === word.length)      { erasing = true;  wait = 1600; }
      else if (erasing && i === 0)            { erasing = false; w = (w + 1) % words.length; wait = 260; }
      else                                     { i += erasing ? -1 : 1; }
      setTimeout(tick, wait);
    })();
  }

  /* ---------- count-up stats ---------- */
  const fmt = n => n.toLocaleString('en-US');
  const countUp = el => {
    const target = Number(el.dataset.count);
    const dur = 1600, t0 = performance.now();
    const step = now => {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  $$('.count').forEach(el => {
    if (reduced) { el.textContent = fmt(Number(el.dataset.count)); return; }
    new IntersectionObserver((entries, obs) => {
      entries.forEach(en => { if (en.isIntersecting) { countUp(en.target); obs.disconnect(); } });
    }, { threshold: .4 }).observe(el);
  });

  /* ---------- scroll reveal ---------- */
  if (!reduced && 'IntersectionObserver' in window) {
    const items = $$('.card, .steps li, .quote, .plan, .faq details, .sec__head');
    items.forEach((el, n) => {
      el.classList.add('reveal');
      el.style.transitionDelay = `${(n % 3) * 70}ms`;
    });
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        obs.unobserve(en.target);
      });
    }, { threshold: .12, rootMargin: '0px 0px -40px' });
    items.forEach(el => io.observe(el));

    // failsafe: never leave content invisible if the observer never fires
    // (print, headless capture, restored bfcache page, etc.)
    const revealAll = () => items.forEach(el => el.classList.add('is-in'));
    setTimeout(revealAll, 4000);
    addEventListener('beforeprint', revealAll);
  }

  /* ---------- pricing toggle ---------- */
  const cycleBtns = $$('.toggle__b');
  cycleBtns.forEach(btn => btn.addEventListener('click', () => {
    cycleBtns.forEach(b => b.classList.toggle('is-on', b === btn));
    const key = btn.dataset.cycle;                       // 'month' | 'year'
    $$('.plan__p b').forEach(b => { b.textContent = b.dataset[key]; });
    $$('.plan__p .per').forEach(p => { p.textContent = key === 'year' ? '/mo, billed yearly' : '/mo'; });
  }));

  /* ---------- signup form ---------- */
  const form = $('#signupForm'), msg = $('#signupMsg');
  form?.addEventListener('submit', e => {
    e.preventDefault();
    const value = $('#email').value.trim();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
    msg.classList.toggle('is-err', !ok);
    msg.textContent = ok
      ? `Thanks — we'd send your workspace invite to ${value}. (Demo only, nothing was submitted.)`
      : 'Please enter a valid email address.';
    if (ok) form.reset();
  });

  /* ---------- cookie banner ---------- */
  const cookie = $('#cookie');
  if (cookie && !store.get('wg-cookie')) {
    setTimeout(() => cookie.hidden = false, 700);
  }
  $$('[data-cookie]').forEach(btn => btn.addEventListener('click', () => {
    const choice = btn.dataset.cookie;
    if (choice === 'manage') {                          // demo: no preference centre yet
      btn.textContent = 'Essential only';
      btn.dataset.cookie = 'reject';
      return;
    }
    store.set('wg-cookie', choice);
    cookie.hidden = true;
  }));

  /* ---------- misc ---------- */
  $('#yr').textContent = new Date().getFullYear();
  $('#langBtn')?.addEventListener('click', function () {
    const langs = ['GB EN', 'US EN', 'DE DE', 'FR FR', 'ES ES'];
    const label = this.querySelector('.lang');
    label.textContent = langs[(langs.indexOf(label.textContent) + 1) % langs.length];
  });
})();
