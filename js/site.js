// 橫向卡片、焦點卡輪播、依裝置篩選、手機選單，以及卡片進入畫面才播放動畫
(() => {
  document.documentElement.classList.add('js');
  // iPhone Safari 要頁面有聽觸控事件，:active 的按下效果才會出現
  document.addEventListener('touchstart', () => {}, { passive: true });
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 兩指放大時在 <html> 加上 zoomed，讓 CSS 停掉卡片裡的動畫（省記憶體，不然 iPhone 會崩潰）。
  // 第二根手指一碰到就先停，放大結束後還停在原本大小才恢復
  const root = document.documentElement;
  const syncZoom = () => root.classList.toggle('zoomed', (window.visualViewport?.scale || 1) > 1.05);
  addEventListener('touchstart', e => { if (e.touches.length > 1) root.classList.add('zoomed'); }, { passive: true });
  ['touchend', 'touchcancel'].forEach(n => addEventListener(n, e => { if (!e.touches.length) setTimeout(syncZoom, 400); }, { passive: true }));
  window.visualViewport?.addEventListener('resize', syncZoom);

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

    // 自動輪播：目前這張的動畫播完一輪才換下一張，游標停在卡片上時不倒數
    let timer = 0, seen = false, shown = 0, left = 0, last = 0, moving = 0;
    const canHover = matchMedia('(hover: hover)');
    const cardAnimations = card => card.getAnimations({ subtree: true }).filter(a => a instanceof CSSAnimation);
    const nearest = () => {
      const list = cards(), x = track.scrollLeft + list[0].offsetLeft;
      return list.reduce((best, c, i) => (Math.abs(c.offsetLeft - x) < Math.abs(list[best].offsetLeft - x) ? i : best), 0);
    };
    // 循環動畫各項目是錯開播放的，一輪就是一個週期；只播一次的動畫要算到最後一個結束。至少停留 5 秒讓人讀字
    const playTime = card => cardAnimations(card).reduce((ms, a) => {
      const t = a.effect.getComputedTiming();
      return Math.max(ms, t.iterations === Infinity ? t.duration : t.delay + t.duration * t.iterations);
    }, 5000);
    const begin = (i, extra = 0) => {
      const card = cards()[i];
      shown = i;
      cardAnimations(card).forEach(a => { a.currentTime = 0; });
      left = playTime(card) + extra;
    };
    function tick() {
      const now = performance.now(), passed = now - last;
      last = now;
      if (!seen || document.hidden) return;
      if (now > moving && nearest() !== shown) begin(nearest());  // 使用者自己滑到別張
      if (canHover.matches && track.matches(':hover')) return;
      left -= passed;
      if (left > 0) return;
      const list = cards(), n = atEnd() ? 0 : (shown + 1) % list.length;
      moving = now + 1000;
      track.scrollTo({ left: list[n].offsetLeft - list[0].offsetLeft, behavior: 'smooth' });
      begin(n, 800);  // 多留滑動的時間
    }
    function stop() {
      clearInterval(timer);
      timer = 0;
      if (pause) { pause.setAttribute('aria-pressed', 'true'); pause.setAttribute('aria-label', '播放輪播'); }
    }
    function play() {
      clearInterval(timer);
      last = performance.now();
      begin(nearest());
      timer = setInterval(tick, 200);
      pause.setAttribute('aria-pressed', 'false');
      pause.setAttribute('aria-label', '暫停輪播');
    }
    if (pause) {
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting && !seen && timer) begin(nearest());
        seen = e.isIntersecting;
      }, { threshold: .5 }).observe(track);
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
      menu.classList.toggle('is-closing', !open);
      document.documentElement.classList.toggle('menu-open', open);
      const tint = document.querySelector('meta[name="theme-color"]:not([media])');
      if (tint) { tint.dataset.base ||= tint.content; tint.content = open ? '#ffcf00' : tint.dataset.base; }
      if (open) {
        menu.style.setProperty('--menu-h', innerHeight - bar.getBoundingClientRect().top + 'px');
        menu.open = true;
        void menu.offsetWidth;
        menu.classList.add('is-open');
      } else {
        menu.classList.remove('is-open');
        timer = setTimeout(() => { menu.open = false; menu.classList.remove('is-closing'); }, still ? 0 : 500);
      }
    };
    button.addEventListener('click', ev => { ev.preventDefault(); setOpen(!menu.classList.contains('is-open')); });
    menu.querySelector('.gnav__sheet').addEventListener('click', ev => { if (ev.target.closest('a')) setOpen(false); });
    addEventListener('keydown', ev => { if (ev.key === 'Escape' && menu.classList.contains('is-open')) { setOpen(false); button.focus(); } });
    matchMedia('(min-width: 834px)').addEventListener('change', ev => { if (ev.matches && menu.classList.contains('is-open')) setOpen(false); });
  }
})();

// 點子導覽列左邊的 App 名稱回到頁面最上方（和 Apple 一樣），網址也不留 #main
(() => {
  document.querySelectorAll('.subnav__name').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }));
})();
