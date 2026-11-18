// 橫向卡片的左右按鈕、焦點卡輪播，以及依裝置篩選卡片
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
      scope.querySelectorAll('[data-os]').forEach(c => { c.hidden = b.dataset.os !== 'all' && !c.dataset.os.includes(b.dataset.os); });
      scope.querySelectorAll('[data-rail]').forEach(r => {
        r.querySelector('.rail__track').scrollLeft = 0;
        r.closest('.apprail').hidden = !r.querySelector('[data-os]:not([hidden])');
        r.update();
      });
    });
  });
})();
