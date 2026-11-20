// 首頁「最新進度」：讀 js/updates.json 重排列表。HTML 裡已經有 build 時排好的版本，讀不到 JSON 時就保留那份。
(() => {
  const box = document.querySelector('[data-updates]');
  if (!box) return;
  const show = +box.dataset.show || 6;
  const fmt = d => `${+d.slice(0, 4)} 年 ${+d.slice(5, 7)} 月 ${+d.slice(8, 10)} 日`;
  fetch(box.dataset.updates, { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(data => {
      const items = (data.items || [])
        .filter(x => x && x.title && /^\d{4}-\d{2}-\d{2}$/.test(x.date))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, data.show || show);
      if (!items.length) return;
      box.replaceChildren(...items.map(x => {
        const a = document.createElement('a');
        a.href = x.href || '#news';
        const k = document.createElement('small'), t = document.createElement('b'), d = document.createElement('time');
        k.textContent = x.kind || '更新';
        t.textContent = x.title;
        d.dateTime = x.date;
        d.textContent = fmt(x.date);
        a.append(k, t, d);
        return a;
      }));
    })
    .catch(() => {});
})();
