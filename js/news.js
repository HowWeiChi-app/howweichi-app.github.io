// 最新消息列表的分類篩選
(() => {
  const bar = document.querySelector('[data-news-filter]');
  if (!bar) return;
  const cards = [...document.querySelectorAll('.nr-grid .nr-card')];
  bar.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    bar.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    let first = true;
    cards.forEach(c => {
      c.hidden = b.dataset.kind !== '全部' && c.dataset.kind !== b.dataset.kind;
      c.classList.toggle('nr-card--lead', !c.hidden && first);  // 篩選後第一張當大卡
      if (!c.hidden) first = false;
    });
  });
})();
