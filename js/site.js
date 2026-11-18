// 橫向卡片、焦點卡輪播、依裝置篩選、手機選單，以及卡片進入畫面才播放動畫
(() => {
  document.documentElement.classList.add('js');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-rail]').forEach(rail => {
    const track = rail.querySelector('.rail__track');
    const prev = rail.querySelector('[data-go="-1"]');
    const next = rail.querySelector('[data-go="1"]');
    const pause = rail.querySelector('[data-pause]');
    const cards = () => [...track.children].filter(c => !c.hidden);
    const step = () => {
      const [a, b] = cards();
      return a && b ? b.offsetLeft - a.offsetLeft : track.clientWidth;
    };
    const atEnd = () => track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    const update = () => {
      prev.disabled = track.scrollLeft <= 4;
      next.disabled = atEnd();
    };
    const go = dir => track.scrollBy({ left: dir * step(), behavior: still ? 'auto' : 'smooth' });
    rail.update = update;
    prev.addEventListener('click', () => { stop(); go(-1); });
    next.addEventListener('click', () => { stop(); go(1); });
    track.addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    update();

    let timer = 0, seen = false;
    function stop() {
      clearInterval(timer);
      timer = 0;
      if (pause) { pause.setAttribute('aria-pressed', 'true'); pause.setAttribute('aria-label', '播放輪播'); }
    }
    function play() {
      clearInterval(timer);
      timer = setInterval(() => {
        if (!seen || document.hidden) return;
        if (atEnd()) track.scrollTo({ left: 0, behavior: 'smooth' }); else go(1);
      }, 6000);
      pause.setAttribute('aria-pressed', 'false');
      pause.setAttribute('aria-label', '暫停輪播');
    }
    if (pause) {
      new IntersectionObserver(([e]) => { seen = e.isIntersecting; }, { threshold: .5 }).observe(track);
      pause.addEventListener('click', () => (timer ? stop() : play()));
      track.addEventListener('pointerdown', stop, { passive: true });
      track.addEventListener('focusin', stop);
      if (still) stop(); else play();
    }
  });

  document.querySelectorAll('[data-filters]').forEach(bar => {
    const scope = bar.closest('section');
    bar.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      bar.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      scope.dataset.show = b.dataset.os === 'android' ? 'android' : 'iphone';
      scope.querySelectorAll('.acard[data-os]').forEach(c => { c.hidden = b.dataset.os !== 'all' && !c.dataset.os.includes(b.dataset.os); });
      scope.querySelectorAll('[data-rail]').forEach(r => {
        r.querySelector('.rail__track').scrollLeft = 0;
        r.closest('.apprail').hidden = !r.querySelector('[data-os]:not([hidden])');
        const t = r.querySelector('.rail__track');
        t.classList.remove('refilter');
        void t.offsetWidth;
        t.classList.add('refilter');
        r.update();
      });
    });
  });

  // 卡片在畫面裡才跑動畫，字庫數字從 0 數上去
  const countUp = el => {
    const end = +el.dataset.count.replace(/,/g, ''), t0 = performance.now();
    const tick = now => {
      const k = Math.min(1, (now - t0) / 1100), v = Math.round(end * (1 - (1 - k) ** 3));
      el.textContent = v.toLocaleString('en-US');
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const seen = new IntersectionObserver(items => items.forEach(({ target, isIntersecting }) => {
    target.classList.toggle('in', isIntersecting);
    const n = isIntersecting && !still && target.querySelector('[data-count]:not([data-done])');
    if (n) { n.dataset.done = '1'; countUp(n); }
  }), { threshold: .28 });
  document.querySelectorAll('.gcard, .acard, .router, .more').forEach(el => seen.observe(el));

  // 手機選單：從右上角的按鈕展開，關閉時播完動畫才收起
  const menu = document.querySelector('.gnav__menu');
  if (menu) {
    const button = menu.querySelector('summary'), bar = menu.closest('.gnav');
    let timer = 0;
    const setOpen = open => {
      clearTimeout(timer);
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? '關閉選單' : '選單');
      document.documentElement.classList.toggle('menu-open', open);
      if (open) {
        menu.style.setProperty('--menu-h', innerHeight - bar.getBoundingClientRect().top + 'px');
        menu.open = true;
        void menu.offsetWidth;
        menu.classList.add('is-open');
      } else {
        menu.classList.remove('is-open');
        timer = setTimeout(() => { menu.open = false; }, still ? 0 : 480);
      }
    };
    button.addEventListener('click', ev => { ev.preventDefault(); setOpen(!menu.classList.contains('is-open')); });
    menu.querySelector('.gnav__sheet').addEventListener('click', ev => { if (ev.target.closest('a')) setOpen(false); });
    addEventListener('keydown', ev => { if (ev.key === 'Escape' && menu.classList.contains('is-open')) { setOpen(false); button.focus(); } });
    matchMedia('(min-width: 834px)').addEventListener('change', ev => { if (ev.matches && menu.classList.contains('is-open')) setOpen(false); });
  }
})();
