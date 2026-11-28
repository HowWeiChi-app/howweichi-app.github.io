// 聯絡我們表單（/contact/）。版面和操作跟下載表單（beta-form.js）一樣：一次一題，Enter 下一題，單選題可以按字母鍵。
// 要先載入 promo-config.js 和 promo-api.js（共用 functionsUrl、anonKey、Turnstile）。
// 選項和檢查規則改這裡的話，supabase/functions/_shared/contact-rules.ts 也要一起改。
(() => {
  const root = document.querySelector('[data-contact-form]');
  const P = window.Promo;
  if (!root || !P) return;
  const C = P.config;
  // 後端（23_聯絡表單.sql 和 Edge Function contact-send）部署好之後改成 true。false 的時候本機是預覽模式，正式網站只顯示 Email 和 Instagram
  const CONTACT_READY = false;
  const preview = !C.functionsUrl || !CONTACT_READY;
  const mailto = `<a href="mailto:${C.contactEmail}">${C.contactEmail}</a>`;
  const ig = `<a href="${C.instagram}" target="_blank" rel="noopener">@howweichi.co</a>`;
  if (preview && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    root.innerHTML = `<div class="tf__stage"><div class="tf__q"><h2 class="tf__title tf__title--lg">聯絡表單還沒開放。</h2><p class="tf__hint">目前請寄 Email 到 ${mailto}，或用 Instagram 私訊 ${ig}。</p></div></div>`;
    return;
  }

  const TOPICS = [['bug', '回報問題'], ['idea', '功能建議'], ['account', '帳號或刪除資料'], ['billing', '訂閱和付款'], ['news', '校網公告有錯'], ['other', '合作或其他']];
  const APPS = [['juango', '捲字'], ['bango', '校板'], ['web', '這個網站'], ['other', '其他或不確定']];
  const NAME_MAX = 20, MESSAGE_MIN = 5, MESSAGE_MAX = 1000;
  // 訊息那一題的說明跟著主題換
  const MESSAGE_HINT = {
    bug: '請寫手機型號、系統版本，還有做了什麼之後出問題。',
    idea: '想要什麼功能？什麼情況下會用到？',
    account: '要刪除帳號的話，寫「刪除帳號」。我們會先寄確認信到你登入用的 Email，你回覆確認後 7 天內刪除。',
    billing: '退款由 Apple 或 Google 處理。其他訂閱問題請寫手機型號和發生了什麼事。',
    news: '請寫哪一所學校、哪一則公告，哪裡不對。',
    other: '想說什麼都可以。',
  };
  const checkName = v => {
    v = String(v || '').trim();
    if (!v) return '請填一個暱稱。';
    if ([...v].length > NAME_MAX) return `暱稱最多 ${NAME_MAX} 個字。`;
    if (/[<>]/.test(v)) return '暱稱不能有 < 或 >。';
    return '';
  };
  const checkMessage = v => {
    const n = [...String(v || '').trim()].length;
    if (!n) return '請寫一下內容。';
    if (n < MESSAGE_MIN) return `再多寫一點，至少 ${MESSAGE_MIN} 個字。`;
    if (n > MESSAGE_MAX) return `最多 ${MESSAGE_MAX} 個字，現在是 ${n} 個。`;
    return '';
  };

  const QUESTIONS = [
    { id: 'welcome', type: 'welcome' },
    { id: 'topic', type: 'choice', title: '想跟我們說什麼？', hint: '選最接近的一個就好。', options: TOPICS },
    { id: 'app', type: 'choice', title: '是關於哪一個？', options: APPS },
    { id: 'message', type: 'area', title: '請寫下內容。', validate: checkMessage },
    { id: 'nickname', type: 'text', title: '怎麼稱呼你？', hint: `暱稱就好，${NAME_MAX} 個字以內。`, validate: checkName },
    { id: 'email', type: 'email', title: '回覆要寄到哪個 Email？', hint: '帳號或訂閱的問題，請填你登入 App 用的 Email。', validate: P.checkEmail },
    { id: 'review', type: 'review', title: '確認一下。', hint: '沒問題就按送出，要改的話按「修改」。' },
    { id: 'done', type: 'done' },
  ];
  const ASK = QUESTIONS.filter(q => !['welcome', 'review', 'done'].includes(q.type));
  const LABELS = { topic: '主題', app: '關於', message: '內容', nickname: '暱稱', email: 'Email' };
  const indexOf = id => QUESTIONS.findIndex(q => q.id === id);
  const label = (list, v) => (list.find(o => o[0] === v) || [, v || '—'])[1];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  // ---------------------------------------------------------------- 送出
  const MESSAGES = {
    rate: '送出太多次了，請一個小時後再試。',
    invalid: '有欄位不符合規則，請回去檢查。',
    bot: '沒有通過機器人檢查，請重新整理再試一次。',
    network: '連不上伺服器，請確認網路後再試一次。',
  };
  async function send(body) {
    if (preview) {  // 預覽模式：只存在這個瀏覽器
      await new Promise(r => setTimeout(r, 450));
      if (body.website) return;
      try {
        const rows = JSON.parse(localStorage.getItem('contact-preview-db')) || [];
        localStorage.setItem('contact-preview-db', JSON.stringify([...rows, { ...body, created_at: new Date().toISOString() }]));
      } catch {}
      return;
    }
    const turnstile = await P.turnstileToken().catch(() => '');
    let res;
    try {
      res = await fetch(`${C.functionsUrl}/contact-send`, {
        method: 'POST',
        headers: { apikey: C.anonKey, Authorization: `Bearer ${C.anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, turnstile }),
      });
    } catch { throw new P.ApiError('network', MESSAGES.network); }
    if (res.ok) return;
    const data = await res.json().catch(() => ({}));
    const code = data.error || (res.status === 429 ? 'rate' : 'invalid');
    throw new P.ApiError(code, data.message || MESSAGES[code] || MESSAGES.invalid, data.field);
  }

  // ---------------------------------------------------------------- 狀態：答案暫存在 sessionStorage，重新整理不會不見
  const KEY = 'contact-form-v1';
  let a = {}, i = 0, resume = 0, editing = false, busy = false;
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY));
    if (s && s.a) { a = s.a; resume = Math.min(Math.max(+s.i || 0, 0), indexOf('review')); }
  } catch {}
  const persist = () => { try { sessionStorage.setItem(KEY, JSON.stringify({ a, i: i || resume })); } catch {} };

  // ---------------------------------------------------------------- 外框
  root.innerHTML = `<div class="tf__bar" aria-hidden="true"><i></i></div>
${preview ? '<p class="tf__preview">預覽模式：後端還沒接上，資料只存在這個瀏覽器，不會真的送出。</p>' : ''}
<button class="tf__close" type="button" aria-label="關閉表單（答案會保留）">✕</button>
<div class="tf__stage"></div>
<input class="tf__hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<div class="tf__nav"><button class="round" type="button" data-step="-1" aria-label="上一題"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 10.5 3.5 12 8 7.5l4.5 4.5 1.5-1.5-6-6z"/></svg></button><button class="round" type="button" data-step="1" aria-label="下一題"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5.5 3.5 4 8 8.5 12.5 4 14 5.5l-6 6z"/></svg></button></div>
<p class="sr-only" aria-live="polite" id="tf-live"></p>`;
  const stage = root.querySelector('.tf__stage'), bar = root.querySelector('.tf__bar i'), live = root.querySelector('#tf-live');
  const hp = root.querySelector('.tf__hp');
  const [up, down] = root.querySelectorAll('[data-step]');

  // ---------------------------------------------------------------- 每一題的畫面
  const enter = '<span class="tf__enter" aria-hidden="true">按 Enter ↵</span>';
  const hintOf = q => q.id === 'message' ? `${MESSAGE_HINT[a.topic] || MESSAGE_HINT.other}請不要寫密碼、卡號或身分證字號。` : q.hint;
  const show = q => q.type === 'choice' ? label(q.options, a[q.id]) : a[q.id] || '—';
  function build(k) {
    const q = QUESTIONS[k], el = document.createElement('div');
    el.className = 'tf__q tf__q--' + q.type;
    el.setAttribute('role', 'group');
    if (q.type === 'welcome') {
      el.setAttribute('aria-label', '聯絡表單說明');
      el.innerHTML = `<h2 class="tf__title tf__title--lg">回答 ${ASK.length} 個問題就能聯絡我們。</h2>
<ul class="tf__rules"><li>大約 <b>1 分鐘</b>填完</li><li>我們是學生，通常<b>一到三天內</b>回覆</li><li>回覆會寄到你填的 <b>Email</b></li></ul>
<div class="tf__act"><button class="btn btn--lg tf__ok" type="button" data-start>${resume > 0 ? '繼續填寫' : '開始'}</button>${enter}</div>
<p class="tf__fine">送出的資料只用來回覆和處理你的問題，詳見<a href="/privacy/#contact">隱私權政策</a>。不想填表單的話，也可以寄 Email 到 ${mailto}，或用 Instagram 私訊 ${ig}。</p>`;
      return el;
    }
    if (q.type === 'done') {
      el.setAttribute('aria-label', '已送出');
      el.innerHTML = `<div class="tf__check" aria-hidden="true">✓</div><h2 class="tf__title tf__title--lg" tabindex="-1">${esc(a.nickname)}，收到了。</h2>
<p class="tf__hint">我們通常一到三天內回覆到 <b>${esc(a.email)}</b>。沒看到的話，請看一下垃圾郵件匣。</p>
${preview ? '<p class="tf__note">預覽模式：這則訊息沒有真的送出。</p>' : ''}
<div class="tf__act"><a class="btn btn--lg" href="/">回到首頁</a></div>
<p class="tf__fine"><button class="tlink tlink--sm" type="button" data-again>再寫一則</button></p>`;
      return el;
    }
    const hint = hintOf(q);
    el.setAttribute('aria-labelledby', `tf-t-${q.id}`);
    if (hint) el.setAttribute('aria-describedby', `tf-h-${q.id}`);
    const err = `<p class="tf__err" id="tf-e-${q.id}" role="alert" hidden></p>`;
    const described = `${hint ? `tf-h-${q.id} ` : ''}tf-e-${q.id}`;
    let field = '';
    if (q.type === 'email' || q.type === 'text') {
      const attrs = q.type === 'email' ? 'type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="name@example.com"'
        : `type="text" autocomplete="nickname" maxlength="${NAME_MAX * 2}" placeholder="例如：小明"`;
      field = `<input class="tf__in" id="tf-in-${q.id}" ${attrs} enterkeyhint="next" aria-labelledby="tf-t-${q.id}" aria-describedby="${described}" value="${esc(a[q.id])}">${err}
<div class="tf__act"><button class="btn tf__ok" type="button" data-next>確定</button>${enter}</div>`;
    } else if (q.type === 'area') {
      field = `<textarea class="tf__in tf__area" id="tf-in-${q.id}" rows="5" maxlength="${MESSAGE_MAX}" aria-labelledby="tf-t-${q.id}" aria-describedby="${described}">${esc(a[q.id])}</textarea>
<p class="tf__count" aria-hidden="true">${[...(a[q.id] || '')].length} / ${MESSAGE_MAX}</p>${err}
<div class="tf__act"><button class="btn tf__ok" type="button" data-next>確定</button><span class="tf__enter" aria-hidden="true">按 ⌘ 或 Ctrl＋Enter ↵</span></div>`;
    } else if (q.type === 'choice') {
      field = `<div class="tf__opts${q.options.length > 4 ? ' tf__opts--many' : ''}" role="radiogroup" aria-labelledby="tf-t-${q.id}">${q.options.map(([v, t], k) =>
        `<button class="tf__opt" type="button" role="radio" aria-checked="${a[q.id] === v}" data-value="${v}"><kbd>${String.fromCharCode(65 + k)}</kbd>${t}</button>`).join('')}</div>${err}
<p class="tf__keys" aria-hidden="true">按 ${q.options.map((_, k) => String.fromCharCode(65 + k)).join('、')} 選擇</p>
${a[q.id] ? `<div class="tf__act"><button class="btn tf__ok" type="button" data-next>確定</button>${enter}</div>` : ''}`;
    } else if (q.type === 'review') {
      field = `<dl class="tf__review">${ASK.map(x => `<div><dt>${LABELS[x.id]}</dt><dd${x.type === 'area' ? ' class="tf__long"' : ''}>${esc(show(x))}</dd>
<dd><button class="tlink tlink--sm" type="button" data-edit="${x.id}" aria-label="修改${LABELS[x.id]}">修改</button></dd></div>`).join('')}</dl>
<p class="tf__err" id="tf-e-review" role="alert" hidden></p>
<div class="tf__act"><button class="btn btn--lg tf__ok" type="button" data-submit>送出</button>${enter}</div>`;
    }
    const num = ASK.includes(q) ? `<p class="tf__num" aria-hidden="true">${ASK.indexOf(q) + 1} <span>→</span></p>` : '';
    el.innerHTML = `${num}<h2 class="tf__title" id="tf-t-${q.id}">${q.title}</h2>`
      + (hint ? `<p class="tf__hint" id="tf-h-${q.id}">${hint}</p>` : '') + field;
    return el;
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
    if (dir) { void el.offsetWidth; el.classList.remove('in-up', 'in-down'); }
    const n = ASK.indexOf(q);
    bar.style.transform = `scaleX(${q.type === 'done' || q.type === 'review' ? 1 : Math.max(0, n) / ASK.length})`;
    up.disabled = i <= 1 || q.type === 'done';
    down.disabled = q.type === 'review' || q.type === 'done' || q.type === 'welcome';
    if (q.type !== 'welcome') {
      live.textContent = n >= 0 ? `第 ${n + 1} 題，共 ${ASK.length} 題。${q.title}${hintOf(q) ? '。' + hintOf(q) : ''}` : el.querySelector('.tf__title').textContent;
    }
    if (q.type !== 'done') persist();
    if (dir) focusIn(el);
  }
  function focusIn(el) {
    const t = el.querySelector('.tf__in, [aria-checked=true], .tf__opt, [data-submit], .tf__title[tabindex]');
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
    const input = el.querySelector('.tf__in, .tf__opts');
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      if (!still.matches) { input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); }
      if (input.matches('.tf__in')) input.focus({ preventScroll: true });
    }
  }
  function clearErr() {
    const el = stage.lastElementChild;
    el.querySelectorAll('.tf__err[id]').forEach(x => { x.hidden = true; x.textContent = ''; });
    el.querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
  }
  const check = q => q.type === 'choice' ? (q.options.some(([v]) => v === a[q.id]) ? '' : '請選一個。') : q.validate(a[q.id]);
  function next() {
    const q = QUESTIONS[i];
    if (busy) return;
    if (q.type === 'welcome') return start();
    if (q.type === 'review') return submit();
    if (q.type === 'done') return;
    const msg = check(q);
    if (msg) return fail(msg);
    if (q.type !== 'choice') a[q.id] = String(a[q.id] || '').trim();
    if (editing) { editing = false; return go(indexOf('review')); }
    go(i + 1);
  }
  function start() {
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
      await send({ topic: a.topic, app: a.app, message: a.message.trim(), nickname: a.nickname.trim(), email: a.email.trim(), website: hp.value });
    } catch (err) {
      busy = false;
      btn.disabled = false;
      btn.textContent = '送出';
      if (err.code === 'invalid' && err.field && indexOf(err.field) > 0) { go(indexOf(err.field)); setTimeout(() => fail(err.message), 20); }
      else fail(err.message || '送出失敗，請再試一次。', 'review');
      return;
    }
    busy = false;
    try { sessionStorage.removeItem(KEY); } catch {}
    go(indexOf('done'));
  }

  // ---------------------------------------------------------------- 全螢幕（跟下載表單一樣）
  const vv = window.visualViewport;
  function fit() {
    if (!root.classList.contains('tf--full')) return;
    root.style.setProperty('--vvh', `${vv ? vv.height : innerHeight}px`);
    root.style.setProperty('--vvt', `${vv ? vv.offsetTop : 0}px`);
  }
  function full(on) {
    root.classList.toggle('tf--full', on);
    document.documentElement.classList.toggle('tf-lock', on);
    if (on) fit();
  }
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
  // ✕：回到開頭畫面（答案和停在哪一題都留著）。送出後的畫面只退出全螢幕
  function close() {
    full(false);
    if (i > 0 && QUESTIONS[i].type !== 'done') { resume = i; editing = false; go(0); }
    root.scrollIntoView({ block: 'start' });
  }
  root.querySelector('.tf__close').addEventListener('click', close);

  // ---------------------------------------------------------------- 事件
  root.addEventListener('input', ev => {
    const t = ev.target;
    if (!t.id || !t.id.startsWith('tf-in-')) return;
    a[t.id.slice(6)] = t.value;
    if (t.matches('textarea')) t.parentElement.querySelector('.tf__count').textContent = `${[...t.value].length} / ${MESSAGE_MAX}`;
    clearErr();
    persist();
  });
  root.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.start !== undefined) start();
    else if (b.dataset.next !== undefined) next();
    else if (b.dataset.submit !== undefined) submit();
    else if (b.dataset.step) (+b.dataset.step < 0 ? go(Math.max(1, i - 1)) : next());
    else if (b.dataset.edit) { editing = true; go(indexOf(b.dataset.edit)); }
    else if (b.dataset.again !== undefined) { a = { nickname: a.nickname, email: a.email }; go(1); }
    else if (b.dataset.value) pick(b);
  });
  function pick(b) {
    const q = QUESTIONS[i];
    a[q.id] = b.dataset.value;
    b.parentElement.querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    clearErr();
    persist();
    b.classList.add('is-picked');
    const at = i;
    setTimeout(() => { if (i === at) next(); }, 400);  // 選完 0.4 秒自動下一題
  }
  root.addEventListener('keydown', ev => {
    const q = QUESTIONS[i], t = ev.target;
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && ev.keyCode !== 229) {
      if (t.closest && t.closest('button, a')) return;
      if (t.matches('textarea') && !ev.metaKey && !ev.ctrlKey) return;  // 內容欄的 Enter 是換行
      ev.preventDefault();
      next();
      return;
    }
    if (q.type === 'choice' && !ev.metaKey && !ev.ctrlKey && !ev.altKey && ev.key.length === 1 && !t.matches('input')) {
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
  // 剛載入、焦點還在 body 時按 Enter 也能開始
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && ev.target === document.body && QUESTIONS[i].type === 'welcome') { ev.preventDefault(); start(); }
  });
  render();
})();
