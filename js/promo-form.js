// 「發一篇文，免費用一年」申請表單。整頁式：按「開始」後手機和電腦都全螢幕，一次一題，按 Enter 下一題，單選題可以按字母鍵。
// 改題目只要改 QUESTIONS；檢查規則在 promo-api.js（Edge Function 也要照同樣的規則再檢查一次）。
(() => {
  const root = document.querySelector('[data-promo-form]');
  const P = window.Promo;
  if (!root || !P) return;
  const C = P.config;
  const KEY = 'promo-form-v1';
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const likesMin = C.likes || 100, viewsMin = C.views || 10000;
  const fmt = n => n.toLocaleString('en-US');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const QUESTIONS = [
    { id: 'welcome', type: 'welcome' },
    { id: 'email', type: 'email', title: '你的 Email 是？', hint: '審核通過後，我們會把啟用連結寄到這裡。', required: true,
      validate: v => P.checkEmail(v) || (P.appliedEmail(v) ? '這個 Email 已經申請過了，同一個人只能申請一次。' : '') },
    { id: 'post', type: 'url', title: '貼文連結', hint: '任何平台的公開貼文都可以，限動不算。在貼文按「分享 › 複製連結」再貼上。', required: true,
      validate: v => {
        const r = P.parsePost(v);
        if (r.error) return r.error;
        return P.appliedPost(r.url) ? '這篇貼文已經申請過了，同一篇只能申請一次。' : '';
      } },
    { id: 'platform', type: 'choice', title: '貼文發在哪裡？', hint: '已經從連結幫你選好了，不對的話可以改。', required: true,
      options: P.PLATFORMS },
    { id: 'likes', type: 'number', title: '這篇貼文目前有幾個讚？', hint: '照貼文上顯示的數字填，沒有就填 0。', required: true, validate: v => P.checkCount(v) },
    { id: 'views', type: 'number', title: '目前有幾次瀏覽？', hint: `在貼文的洞察報告或後台可以看到。${fmt(likesMin)} 個讚或 ${fmt(viewsMin)} 次瀏覽，達到一個就可以。`, required: true,
      validate: (v, a) => P.checkCount(v) || (P.reached(a.likes, v) ? '' : `還沒達到門檻（${fmt(likesMin)} 個讚或 ${fmt(viewsMin)} 次瀏覽），達到後再來申請。`) },
    { id: 'app', type: 'choice', title: '想要哪個 App 的 Pro？', hint: '送的是這個 App 的 Pro 一年。', required: true,
      options: [['juango', '捲字 JuanGo'], ['bango', '校板 BanGo']] },
    { id: 'device', type: 'choice', title: '你用哪一種手機？', hint: '兌換碼要對應手機的商店。', required: true,
      options: [['ios', 'iPhone'], ['android', 'Android']] },
    { id: 'agree', type: 'checkbox', title: '最後確認一下。', hint: '審核時我們會打開連結確認。', required: true,
      label: '我的貼文是公開的一般貼文、內文有官網連結；IG 和 Threads 有標記 @howweichi.co，其他平台有提到 HowWeiChi、捲字或校板，而且我已閱讀<a href="../promo-terms/" target="_blank">活動辦法</a>。',
      validate: v => (v === true ? '' : '請先勾選，確認貼文符合規則。') },
    { id: 'proof', type: 'file', title: '洞察報告截圖', hint: '選填，可以略過。別人看不到瀏覽數的話，附上截圖比較好審核。只收 JPG、PNG 或 HEIC，5MB 以內。', required: false,
      validate: (_, a, f) => P.checkProof(f) },
    { id: 'review', type: 'review', title: '確認你的申請。', hint: '沒問題就送出，要改的話按「修改」。' },
    { id: 'done', type: 'done' },
  ];
  const ASK = QUESTIONS.filter(q => !['welcome', 'review', 'done'].includes(q.type));
  const LABELS = { email: 'Email', post: '貼文連結', platform: '平台', likes: '讚數', views: '瀏覽數', app: 'App', device: '手機', agree: '確認', proof: '截圖' };
  const indexOf = id => QUESTIONS.findIndex(q => q.id === id);

  // ---------------------------------------------------------------- 狀態：答案暫存在 sessionStorage，重新整理不會不見
  let a = {}, i = 0, resume = 0, file = null, editing = false, busy = false, remaining = null;
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY));
    if (s && s.a) { a = s.a; i = Math.min(Math.max(+s.i || 0, 0), indexOf('review')); delete a.proofName; }
  } catch {}
  // 表單關著的時候 i 是 0（開頭畫面），停在哪一題記在 resume；重新整理後也從開頭畫面按「繼續」接著填
  if (i > 0) { resume = i; i = 0; }
  const persist = () => { try { sessionStorage.setItem(KEY, JSON.stringify({ a, i: i || resume })); } catch {} };

  // ---------------------------------------------------------------- 外框
  root.innerHTML = `<div class="tf__bar" aria-hidden="true"><i></i></div>
${P.api.preview ? '<p class="tf__preview">預覽模式：後端還沒接上，資料只存在這個瀏覽器，不會真的送出。</p>' : ''}
<button class="tf__close" type="button" aria-label="關閉表單（答案會保留）">✕</button>
<div class="tf__stage"></div>
<div class="tf__nav"><button class="round" type="button" data-step="-1" aria-label="上一題"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 10.5 3.5 12 8 7.5l4.5 4.5 1.5-1.5-6-6z"/></svg></button><button class="round" type="button" data-step="1" aria-label="下一題"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5.5 3.5 4 8 8.5 12.5 4 14 5.5l-6 6z"/></svg></button></div>
<p class="sr-only" aria-live="polite" id="tf-live"></p>`;
  const stage = root.querySelector('.tf__stage'), bar = root.querySelector('.tf__bar i'), live = root.querySelector('#tf-live');
  const [up, down] = root.querySelectorAll('[data-step]');

  // ---------------------------------------------------------------- 每一題的畫面
  const enter = '<span class="tf__enter" aria-hidden="true">按 Enter ↵</span>';
  function head(q, n) {
    return `<p class="tf__num" aria-hidden="true">${n} <span>→</span></p><h2 class="tf__title" id="tf-t-${q.id}">${q.title}${q.required === false ? ' <small>（選填）</small>' : ''}</h2>`
      + (q.hint ? `<p class="tf__hint" id="tf-h-${q.id}">${q.hint}</p>` : '');
  }
  function build(k) {
    const q = QUESTIONS[k], el = document.createElement('div');
    el.className = 'tf__q tf__q--' + q.type;
    el.setAttribute('role', 'group');
    const n = ASK.indexOf(q) + 1;
    if (q.type === 'welcome') {
      const over = remaining === 0;
      const soon = over && C.startsAt && Date.now() < Date.parse(C.startsAt);
      el.setAttribute('aria-label', '活動說明');
      el.innerHTML = soon
        ? `<h2 class="tf__title tf__title--lg">活動還沒開始。</h2><p class="tf__hint">${esc(C.startLabel || '')}開放申請，開始時會在 <a href="${esc(C.instagram)}">Instagram</a> 公告。</p>`
        : over
        ? `<h2 class="tf__title tf__title--lg">活動已結束。</h2><p class="tf__hint">名額都送完了，謝謝大家幫忙介紹。之後有新活動會在 <a href="${esc(C.instagram)}">Instagram</a> 公告。</p>`
        : `<h2 class="tf__title tf__title--lg">發一篇文，免費用一年。</h2>
<ul class="tf__rules"><li>在任何平台發一則<b>公開的一般貼文</b>，限動不算</li><li>內文附上官網連結；IG 和 Threads 標記 <b>@howweichi.co</b>，其他平台提到捲字或校板</li>
<li>同一篇達到 <b>${fmt(likesMin)} 個讚或 ${fmt(viewsMin)} 次瀏覽</b></li><li>大約 1 分鐘填完，審核通過後寄啟用連結</li></ul>
<p class="tf__left" aria-live="polite">${remaining == null ? '讀取剩餘名額…' : `還剩 <b>${fmt(remaining)}</b> 名`}</p>
<div class="tf__act"><button class="btn btn--lg tf__ok" type="button" data-start>${resume > 0 ? '繼續填寫' : '開始'}</button>${enter}</div>`;
      return el;
    }
    if (q.type === 'done') {
      el.setAttribute('aria-label', '申請完成');
      el.innerHTML = `<div class="tf__check" aria-hidden="true">✓</div><h2 class="tf__title tf__title--lg" tabindex="-1">收到了！</h2>
<p class="tf__hint">審核通過後，我們會在 ${C.reviewDays || 3} 天內寄啟用連結到 <b>${esc(a.email)}</b>。審核完成前請不要刪文，也不要把帳號改成私人。</p>
<p class="tf__hint"><a href="../promo-terms/">活動辦法</a>・<a href="../pro/">看看 Pro 有什麼</a></p>`;
      return el;
    }
    el.setAttribute('aria-labelledby', `tf-t-${q.id}`);
    if (q.hint) el.setAttribute('aria-describedby', `tf-h-${q.id}`);
    let field = '';
    const err = `<p class="tf__err" id="tf-e-${q.id}" role="alert" hidden></p>`;
    if (q.type === 'email' || q.type === 'url' || q.type === 'number') {
      const attrs = q.type === 'email' ? 'type="email" inputmode="email" autocomplete="email" placeholder="name@example.com"'
        : q.type === 'url' ? 'type="url" inputmode="url" autocomplete="off" placeholder="https://…"'
        : 'type="text" inputmode="numeric" pattern="[0-9,]*" autocomplete="off" placeholder="0"';
      field = `<input class="tf__in" id="tf-in-${q.id}" ${attrs} autocapitalize="off" spellcheck="false" enterkeyhint="next"
        aria-labelledby="tf-t-${q.id}" aria-describedby="tf-h-${q.id} tf-e-${q.id}" value="${esc(a[q.id])}">${err}
<div class="tf__act"><button class="btn tf__ok" type="button" data-next>確定</button>${enter}</div>`;
    } else if (q.type === 'choice') {
      field = `<div class="tf__opts${q.options.length > 4 ? " tf__opts--many" : ""}" role="radiogroup" aria-labelledby="tf-t-${q.id}">${q.options.map(([v, t], k) =>
        `<button class="tf__opt" type="button" role="radio" aria-checked="${a[q.id] === v}" data-value="${v}"><kbd>${String.fromCharCode(65 + k)}</kbd>${t}</button>`).join('')}</div>${err}
<p class="tf__keys" aria-hidden="true">按 ${q.options.map((_, k) => String.fromCharCode(65 + k)).join('、')} 選擇</p>`;
    } else if (q.type === 'checkbox') {
      field = `<label class="tf__chk"><input type="checkbox" id="tf-in-${q.id}" ${a[q.id] ? 'checked' : ''} aria-describedby="tf-e-${q.id}"><span>${q.label}</span></label>${err}
<div class="tf__act"><button class="btn tf__ok" type="button" data-next>確定</button>${enter}</div>`;
    } else if (q.type === 'file') {
      field = `<div class="tf__file"><label class="tf__pick"><input type="file" id="tf-in-proof" accept=".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/png,image/heic,image/heif" aria-describedby="tf-h-proof tf-e-proof"><span>${file ? '換一張' : '選擇圖片'}</span></label>
<span class="tf__fname">${file ? esc(file.name) : '還沒選擇'}</span>${file ? '<button class="tlink tlink--sm" type="button" data-clear>移除</button>' : ''}</div>${err}
<div class="tf__act"><button class="btn tf__ok" type="button" data-next>${file ? '確定' : '略過'}</button>${enter}</div>`;
    } else if (q.type === 'review') {
      field = `<dl class="tf__review">${ASK.map(x => `<div><dt>${LABELS[x.id]}</dt><dd>${esc(show(x))}</dd>
<dd><button class="tlink tlink--sm" type="button" data-edit="${x.id}" aria-label="修改${LABELS[x.id]}">修改</button></dd></div>`).join('')}</dl>
<p class="tf__err" id="tf-e-review" role="alert" hidden></p>
<div class="tf__act"><button class="btn btn--lg tf__ok" type="button" data-submit>送出申請</button>${enter}</div>`;
    }
    el.innerHTML = `${n ? head(q, n) : `<h2 class="tf__title" id="tf-t-${q.id}">${q.title}</h2><p class="tf__hint" id="tf-h-${q.id}">${q.hint}</p>`}${field}`;
    return el;
  }
  function show(q) {
    const v = a[q.id];
    if (q.type === 'choice') return (q.options.find(o => o[0] === v) || [, '—'])[1];
    if (q.type === 'checkbox') return v ? '已確認' : '—';
    if (q.type === 'file') return file ? file.name : '沒有附上';
    if (q.id === 'post') return a.postUrl || v || '—';
    if (q.type === 'number') return v === undefined || v === '' ? '—' : fmt(P.num(v));
    return v || '—';
  }

  // ---------------------------------------------------------------- 換題
  function render(dir = 0) {
    const old = stage.firstElementChild, el = build(i), q = QUESTIONS[i];
    root.dataset.step = q.type;
    if (old) {
      old.inert = true;
      old.classList.add(dir < 0 ? 'out-down' : 'out-up');
      setTimeout(() => old.remove(), still.matches ? 160 : 300);
    }
    if (dir) el.classList.add(dir < 0 ? 'in-down' : 'in-up');
    stage.append(el);
    if (dir) { void el.offsetWidth; el.classList.remove('in-up', 'in-down'); }  // 先套用起點，再移除 class 開始轉場
    const n = ASK.indexOf(q);
    bar.style.transform = `scaleX(${q.type === 'done' || q.type === 'review' ? 1 : Math.max(0, n) / ASK.length})`;
    up.disabled = i <= 1 || q.type === 'done';
    down.disabled = q.type === 'review' || q.type === 'done' || q.type === 'welcome';
    if (q.type !== 'welcome') {
      live.textContent = n >= 0 ? `第 ${n + 1} 題，共 ${ASK.length} 題。${strip(q.title)}${q.hint ? '。' + strip(q.hint) : ''}` : strip(el.querySelector('.tf__title').textContent);
    }
    persist();
    if (dir) focusIn(el);
  }
  const strip = s => String(s).replace(/<[^>]+>/g, '');
  function focusIn(el) {
    const t = el.querySelector('.tf__in, input[type=checkbox], [aria-checked=true], .tf__opt, input[type=file], [data-submit], .tf__title[tabindex]');
    if (t) setTimeout(() => t.focus({ preventScroll: true }), still.matches ? 0 : 120);
  }
  function go(k) {
    if (k === i) return;
    const dir = k > i ? 1 : -1;
    i = k;
    render(dir);
  }

  // ---------------------------------------------------------------- 檢查和前進
  function fail(msg, id = QUESTIONS[i].id) {
    const el = stage.lastElementChild, box = el.querySelector(`#tf-e-${id}`);
    if (!box) return;
    box.textContent = msg;
    box.hidden = false;
    const input = el.querySelector('.tf__in, .tf__opts, .tf__chk, .tf__file');
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      if (!still.matches) { input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); }
      if (input.focus && input.matches('.tf__in')) input.focus({ preventScroll: true });
    }
  }
  function clearErr() {
    const el = stage.lastElementChild;
    el.querySelectorAll('.tf__err').forEach(x => { x.hidden = true; x.textContent = ''; });
    el.querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
  }
  function check(q) {
    const v = a[q.id];
    if (q.required && q.type === 'choice' && !v) return '請選一個。';
    if (q.validate) return q.validate(v, a, file);
    return '';
  }
  function next() {
    const q = QUESTIONS[i];
    if (busy) return;
    if (q.type === 'welcome') return start();
    if (q.type === 'review') return submit();
    if (q.type === 'done') return;
    const msg = check(q);
    if (msg) return fail(msg);
    if (q.id === 'post') {
      const r = P.parsePost(a.post);
      if (r.url !== a.postUrl) { a.postUrl = r.url; a.platform = r.platform; }
    }
    if (editing) {
      // 從確認頁跳回來改：改完直接回確認頁，除非後面的題目因為這次修改變成不合格
      const bad = ASK.find(x => check(x));
      if (bad && bad !== q) { go(indexOf(bad.id)); setTimeout(() => fail(check(bad)), 20); return; }
      editing = false;
      return go(indexOf('review'));
    }
    go(i + 1);
  }
  function start() {
    if (remaining === 0) return;
    full(true);
    const at = Math.max(1, i || resume);
    resume = 0;
    go(at);
  }

  async function submit() {
    const bad = ASK.find(x => check(x));
    if (bad) { go(indexOf(bad.id)); setTimeout(() => fail(check(bad)), 20); return; }
    const btn = stage.lastElementChild.querySelector('[data-submit]');
    busy = true;
    btn.disabled = true;
    btn.textContent = '送出中…';
    try {
      await P.api.apply({ ...a, post: a.postUrl }, file);
      try { sessionStorage.removeItem(KEY); } catch {}
      go(indexOf('done'));
      try { sessionStorage.removeItem(KEY); } catch {}
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '送出申請';
      const field = err.field && indexOf(err.field === 'views' ? 'views' : err.field);
      if (field > 0 && err.code === 'invalid') { go(field); setTimeout(() => fail(check(QUESTIONS[field]) || err.message), 20); }
      else fail(err.message || '送出失敗，請再試一次。', 'review');
      if (err.code === 'closed') { remaining = 0; }
    } finally {
      busy = false;
    }
  }

  // ---------------------------------------------------------------- 手機全螢幕
  const vv = window.visualViewport;
  function fit() {
    if (!root.classList.contains('tf--full')) return;
    root.style.setProperty('--vvh', `${vv ? vv.height : innerHeight}px`);
    root.style.setProperty('--vvt', `${vv ? vv.offsetTop : 0}px`);
  }
  function full(on) {
    const want = !!on;  // 整頁式：手機和電腦都全螢幕
    root.classList.toggle('tf--full', want);
    document.documentElement.classList.toggle('tf-lock', want);
    if (want) fit();
  }
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
  // ✕：關掉表單，回到開頭畫面（答案和停在哪一題都留著，按「繼續」接著填）。填完的畫面只退出全螢幕
  function close() {
    full(false);
    if (i > 0 && QUESTIONS[i].type !== 'done') { resume = i; editing = false; go(0); }
    root.scrollIntoView({ block: 'start' });
  }
  root.querySelector('.tf__close').addEventListener('click', close);
  root.addEventListener('focusin', ev => { if (i > 0 && remaining !== 0 && QUESTIONS[i].type !== 'done' && !ev.target.closest('.tf__close')) full(true); });

  // ---------------------------------------------------------------- 事件
  root.addEventListener('input', ev => {
    const t = ev.target;
    if (!t.id || !t.id.startsWith('tf-in-') || t.type === 'file') return;
    const id = t.id.slice(6);
    a[id] = t.type === 'checkbox' ? t.checked : t.value;
    clearErr();
    persist();
  });
  root.addEventListener('change', ev => {
    const t = ev.target;
    if (t.type !== 'file') return;
    const f = t.files && t.files[0];
    const msg = P.checkProof(f);
    if (msg) { t.value = ''; return fail(msg); }
    file = f || null;
    a.proofName = file ? file.name : '';
    const el = build(i);
    stage.lastElementChild.replaceWith(el);
    el.querySelector('[data-next]').focus({ preventScroll: true });
  });
  root.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.start !== undefined) start();
    else if (b.dataset.next !== undefined) next();
    else if (b.dataset.submit !== undefined) submit();
    else if (b.dataset.step) (+b.dataset.step < 0 ? go(Math.max(1, i - 1)) : next());
    else if (b.dataset.edit) { editing = true; go(indexOf(b.dataset.edit)); }
    else if (b.dataset.clear !== undefined) { file = null; a.proofName = ''; const el = build(i); stage.lastElementChild.replaceWith(el); focusIn(el); }
    else if (b.dataset.value) pick(b);
  });
  function pick(b) {
    const q = QUESTIONS[i];
    a[q.id] = b.dataset.value;
    b.parentElement.querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    clearErr();
    persist();
    b.classList.add('is-picked');
    // 選完 0.4 秒自動下一題
    const at = i;
    setTimeout(() => { if (i === at) next(); }, 400);
  }
  root.addEventListener('keydown', ev => {
    const q = QUESTIONS[i], t = ev.target;
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && ev.keyCode !== 229) {
      if (t.closest && t.closest('button, a')) return;  // 按鈕和連結用瀏覽器原本的 Enter；選圖片的欄位按 Enter 是略過或下一題，選圖用空白鍵
      ev.preventDefault();
      next();
      return;
    }
    if (q.type === 'choice' && !ev.metaKey && !ev.ctrlKey && !ev.altKey && ev.key.length === 1) {
      const k = ev.key.toUpperCase().charCodeAt(0) - 65;
      const opt = stage.lastElementChild.querySelectorAll('.tf__opt')[k];
      if (opt) { ev.preventDefault(); opt.focus({ preventScroll: true }); pick(opt); }
    }
    if (q.type === 'choice' && /^Arrow(Up|Down|Left|Right)$/.test(ev.key) && t.matches('.tf__opt')) {
      const list = [...stage.lastElementChild.querySelectorAll('.tf__opt')], d = /Up|Left/.test(ev.key) ? -1 : 1;
      ev.preventDefault();
      list[(list.indexOf(t) + d + list.length) % list.length].focus();
    }
    if (ev.key === 'Escape' && root.classList.contains('tf--full')) close();
  });
  // Enter 在頁面其他地方（例如剛載入、焦點還在 body）也能開始
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && ev.target === document.body && QUESTIONS[i].type === 'welcome' && remaining !== 0) { ev.preventDefault(); start(); }
  });

  // ---------------------------------------------------------------- 剩餘名額
  const left = document.querySelector('[data-left]');
  render();
  P.api.stats().then(s => {
    remaining = Math.max(0, +s.remaining || 0);
    if (s.open === false) remaining = 0;
    if (left) left.textContent = remaining ? `還剩 ${fmt(remaining)} 名。` : C.startsAt && Date.now() < Date.parse(C.startsAt) ? `${C.startLabel || ''}開始。` : '活動已結束。';
    if (QUESTIONS[i].type === 'welcome' || remaining === 0) { if (remaining === 0) i = 0; stage.replaceChildren(); render(); }
  }).catch(() => {
    remaining = undefined;
    const p = stage.querySelector('.tf__left');
    if (p) p.textContent = '';
  });
})();
