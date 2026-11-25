// 捲字測試版下載引導（/download/juango/）。一次一題，按 Enter 下一題，單選題可以按字母鍵；填完用一次性連結下載 IPA 或 APK，不用到 GitHub。
// 改題目只要改 QUESTIONS；檢查規則在 beta-api.js（Edge Function beta-signup 也照同樣的規則再檢查一次）。
(() => {
  const root = document.querySelector('[data-beta-form]');
  const B = window.Beta;
  if (!root || !B) return;
  const V = B.config;
  const KEY = 'beta-form-v1';
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 從 beta-download 被轉回來時帶 ?link=used|expired|invalid|error；顯示一次後從網址拿掉
  const LINK = new URLSearchParams(location.search).get('link') || '';
  if (LINK) history.replaceState(null, '', location.pathname);

  const QUESTIONS = [
    { id: 'welcome', type: 'welcome' },
    { id: 'source', type: 'choice', title: '你在哪裡知道捲字的？', hint: '選最接近的一個就好。', required: true, options: B.SOURCES },
    { id: 'email', type: 'email', title: '之後登入捲字要用的 Email？', hint: '我們會把 Pro 開在用這個 Email 登入的帳號，也會寄通知到這裡。請填你等一下要在 App 裡登入的 Email。', required: true,
      validate: v => B.checkEmail(v) },
    { id: 'nickname', type: 'text', title: '怎麼稱呼你？', hint: `暱稱就好，${B.NAME_MAX} 個字以內。`, required: true, validate: v => B.checkName(v) },
    { id: 'os', type: 'choice', title: '你用哪一種手機？', hint: `會下載對應的安裝檔。iPhone 需要 iOS ${V.minIos || 26} 以上。`, required: true, options: B.OS },
    { id: 'review', type: 'review', title: '確認一下。', hint: '沒問題就按下載，要改的話按「修改」。' },
    { id: 'done', type: 'done' },
  ];
  const ASK = QUESTIONS.filter(q => !['welcome', 'review', 'done'].includes(q.type));
  const LABELS = { source: '在哪裡知道', email: 'Email', nickname: '暱稱', os: '手機' };
  const indexOf = id => QUESTIONS.findIndex(q => q.id === id);

  // ---------------------------------------------------------------- 狀態：答案暫存在 sessionStorage，重新整理不會不見
  let a = {}, i = 0, resume = 0, editing = false, busy = false, token = "", used = false;
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY));
    if (s && s.a) { a = s.a; i = Math.min(Math.max(+s.i || 0, 0), indexOf('review')); }
  } catch {}
  if (!a.os) { const g = B.guessOs(); if (g) { a.os = g; a.osGuessed = true; } }
  // 表單關著的時候 i 是 0（開頭畫面），停在哪一題記在 resume；重新整理後也從開頭畫面按「繼續」接著填
  if (i > 0) { resume = i; i = 0; }
  const persist = () => { try { sessionStorage.setItem(KEY, JSON.stringify({ a, i: i || resume })); } catch {} };

  // ---------------------------------------------------------------- 外框
  root.innerHTML = `<div class="tf__bar" aria-hidden="true"><i></i></div>
${B.api.preview ? '<p class="tf__preview">預覽模式：後端還沒接上，資料只存在這個瀏覽器，不會真的送出。</p>' : ''}
<button class="tf__close" type="button" aria-label="關閉表單（答案會保留）">✕</button>
<div class="tf__stage"></div>
<input class="tf__hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<div class="tf__nav"><button class="round" type="button" data-step="-1" aria-label="上一題"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 10.5 3.5 12 8 7.5l4.5 4.5 1.5-1.5-6-6z"/></svg></button><button class="round" type="button" data-step="1" aria-label="下一題"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5.5 3.5 4 8 8.5 12.5 4 14 5.5l-6 6z"/></svg></button></div>
<p class="sr-only" aria-live="polite" id="tf-live"></p>`;
  const stage = root.querySelector('.tf__stage'), bar = root.querySelector('.tf__bar i'), live = root.querySelector('#tf-live');
  const hp = root.querySelector('.tf__hp');
  const [up, down] = root.querySelectorAll('[data-step]');

  // ---------------------------------------------------------------- 安裝說明
  function steps(os) {
    if (os === 'android') return `<ol class="tf__steps">
<li>下載完打開 <b>JuanGo-${esc(V.version || '')}.apk</b>，依畫面提示允許安裝未知來源的 App。</li>
<li>手機裡如果有<b>之前任何版本</b>的捲字（包括 0.2.1 build 13），要先刪掉再裝，因為這版改用正式版簽名。刪除前先登入讓進度同步，或到「設定 › 備份」匯出。</li>
<li>打開捲字，用 <b>${esc(a.email)}</b> 登入。</li></ol>`;
    return `<ol class="tf__steps">
<li>下載的 <b>JuanGo-${esc(V.version || '')}.ipa</b> 會存在「檔案」App 的「下載項目」。</li>
<li>用 <a href="https://sideinstaller.net/" target="_blank" rel="noopener">SideInstaller</a> 以自己的 Apple ID 簽名安裝。iOS 27 以上直接在手機上就能裝，iOS 26 要先用電腦做一次配對檔。只從 sideinstaller.net 下載，sideinstaller.com 是假網站。</li>
<li>打開捲字，用 <b>${esc(a.email)}</b> 登入。免費 Apple ID 每 7 天要重簽一次，資料不會消失。</li></ol>`;
  }

  // ---------------------------------------------------------------- 每一題的畫面
  const enter = '<span class="tf__enter" aria-hidden="true">按 Enter ↵</span>';
  function head(q, n) {
    return `<p class="tf__num" aria-hidden="true">${n} <span>→</span></p><h2 class="tf__title" id="tf-t-${q.id}">${q.title}</h2>`
      + (q.hint ? `<p class="tf__hint" id="tf-h-${q.id}">${q.hint}</p>` : '');
  }
  function build(k) {
    const q = QUESTIONS[k], el = document.createElement('div');
    el.className = 'tf__q tf__q--' + q.type;
    el.setAttribute('role', 'group');
    const n = ASK.indexOf(q) + 1;
    if (q.type === 'welcome') {
      el.setAttribute('aria-label', '下載說明');
      const why = { used: '這個下載連結已經用過了，每個連結只能下載一次。', expired: '這個下載連結過期了（30 分鐘內有效）。',
                    invalid: '這不是有效的下載連結，可能是被轉傳或複製錯了。', error: '下載時出了一點問題，連結還可以再用。' }[LINK] || '';
      el.innerHTML = `${why ? `<p class="tf__note" role="status">${why}重新填一次，就能拿到新的下載連結。</p>` : ''}<h2 class="tf__title tf__title--lg">回答 4 個問題就能下載。</h2>
<ul class="tf__rules"><li>大約 <b>30 秒</b>填完</li><li>填你之後要<b>登入捲字的 Email</b>，我們會把 Pro 開在這個帳號</li>
<li>填完拿到<b>你專屬的一次性下載連結</b>：iPhone 是 IPA，Android 是 APK</li></ul>
<div class="tf__act"><button class="btn btn--lg tf__ok" type="button" data-start>${resume > 0 ? '繼續填寫' : '開始'}</button>${enter}</div>
<p class="tf__fine">送出的資料只用來開 Pro 和聯絡你，詳見<a href="/privacy/#beta">隱私權政策</a>。</p>`;
      return el;
    }
    if (q.type === 'done') {
      const file = a.os === 'android' ? 'APK' : 'IPA';
      el.setAttribute('aria-label', '開始下載');
      const action = used
        ? `<p class="tf__note">這個下載連結已經用過了（每個連結只能下載一次）。沒有下載成功的話，按下面拿一個新的。</p>
<div class="tf__act"><button class="btn btn--lg" type="button" data-again>拿新的下載連結</button></div>`
        : `<div class="tf__act"><button class="btn btn--lg" type="button" data-dl>${B.preview ? `模擬下載 ${file}` : `下載 ${file}`}</button><span class="tf__enter">沒有自動開始的話按這裡</span></div>
<p class="tf__fine">這是你專屬的一次性連結，只能下載一次，30 分鐘內有效，轉傳給別人也不能用。</p>`;
      el.innerHTML = `<div class="tf__check" aria-hidden="true">↓</div><h2 class="tf__title tf__title--lg" tabindex="-1">${esc(a.nickname)}，開始下載了。</h2>
<p class="tf__hint">我們幫你開好 Pro 後，會寄信到 <b>${esc(a.email)}</b>。</p>
${B.preview ? '<p class="tf__preview">預覽模式：不會真的下載。正式版會轉到 Supabase 私人空間 60 秒有效的下載網址。</p>' : ''}
${action}<p class="tf__err" id="tf-e-done" role="alert" hidden></p>
<h3 class="tf__sub">${a.os === 'android' ? 'Android' : 'iPhone'} 安裝步驟</h3>${steps(a.os)}
<p class="tf__fine"><button class="tlink tlink--sm" type="button" data-restart>用另一支手機下載</button>・<a href="/juango/">回到捲字介紹</a></p>`;
      return el;
    }
    el.setAttribute('aria-labelledby', `tf-t-${q.id}`);
    if (q.hint) el.setAttribute('aria-describedby', `tf-h-${q.id}`);
    let field = '';
    const err = `<p class="tf__err" id="tf-e-${q.id}" role="alert" hidden></p>`;
    if (q.type === 'email' || q.type === 'text') {
      const attrs = q.type === 'email' ? 'type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="name@example.com"'
        : `type="text" autocomplete="nickname" maxlength="${B.NAME_MAX * 2}" placeholder="例如：小明"`;
      field = `<input class="tf__in" id="tf-in-${q.id}" ${attrs} enterkeyhint="next"
        aria-labelledby="tf-t-${q.id}" aria-describedby="tf-h-${q.id} tf-e-${q.id}" value="${esc(a[q.id])}">${err}
<div class="tf__act"><button class="btn tf__ok" type="button" data-next>確定</button>${enter}</div>`;
    } else if (q.type === 'choice') {
      const guessed = q.id === 'os' && a.osGuessed ? '<p class="tf__keys tf__keys--show">已經從你的瀏覽器幫你選好了，不對的話可以改。</p>' : '';
      field = `<div class="tf__opts${q.options.length > 4 ? ' tf__opts--many' : ''}" role="radiogroup" aria-labelledby="tf-t-${q.id}">${q.options.map(([v, t], k) =>
        `<button class="tf__opt" type="button" role="radio" aria-checked="${a[q.id] === v}" data-value="${v}"><kbd>${String.fromCharCode(65 + k)}</kbd>${t}</button>`).join('')}</div>${err}
${guessed}<p class="tf__keys" aria-hidden="true">按 ${q.options.map((_, k) => String.fromCharCode(65 + k)).join('、')} 選擇</p>
${a[q.id] ? `<div class="tf__act"><button class="btn tf__ok" type="button" data-next>確定</button>${enter}</div>` : ''}`;
    } else if (q.type === 'review') {
      field = `<dl class="tf__review">${ASK.map(x => `<div><dt>${LABELS[x.id]}</dt><dd>${esc(show(x))}</dd>
<dd><button class="tlink tlink--sm" type="button" data-edit="${x.id}" aria-label="修改${LABELS[x.id]}">修改</button></dd></div>`).join('')}</dl>
<p class="tf__err" id="tf-e-review" role="alert" hidden></p>
<div class="tf__act"><button class="btn btn--lg tf__ok" type="button" data-submit>${a.os === 'android' ? '送出並下載 APK' : '送出並下載 IPA'}</button>${enter}</div>`;
    }
    el.innerHTML = `${head(q, n)}${field}`;
    return el;
  }
  function show(q) {
    const v = a[q.id];
    if (q.type === 'choice') return B.label(q.options, v);
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
    if (dir) { void el.offsetWidth; el.classList.remove('in-up', 'in-down'); }
    const n = ASK.indexOf(q);
    bar.style.transform = `scaleX(${q.type === 'done' || q.type === 'review' ? 1 : Math.max(0, n) / ASK.length})`;
    up.disabled = i <= 1 || q.type === 'done';
    down.disabled = q.type === 'review' || q.type === 'done' || q.type === 'welcome';
    if (q.type !== 'welcome') {
      live.textContent = n >= 0 ? `第 ${n + 1} 題，共 ${ASK.length} 題。${strip(q.title)}${q.hint ? '。' + strip(q.hint) : ''}` : strip(el.querySelector('.tf__title').textContent);
    }
    if (q.type !== 'done') persist();
    if (dir) focusIn(el);
  }
  const strip = s => String(s).replace(/<[^>]+>/g, '');
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
  function check(q) {
    const v = a[q.id];
    if (q.required && q.type === 'choice' && !v) return '請選一個。';
    if (q.validate) return q.validate(v, a);
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
    if (q.type === 'email' || q.type === 'text') a[q.id] = String(a[q.id] || '').trim();
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
    const label = btn.textContent;
    busy = true;
    btn.disabled = true;
    btn.textContent = '送出中…';
    try {
      token = (await B.api.signup({ ...a, website: hp.value })).token || '';
    } catch (err) {
      // 一次性連結要由伺服器發，送不出去就不能下載：留在確認頁顯示錯誤
      busy = false;
      btn.disabled = false;
      btn.textContent = label;
      if (err.code === 'invalid' && err.field && indexOf(err.field) > 0) { go(indexOf(err.field)); setTimeout(() => fail(err.message), 20); }
      else fail(err.message || '送出失敗，請再試一次。', 'review');
      return;
    }
    busy = false;
    used = false;
    try { sessionStorage.removeItem(KEY); } catch {}
    go(indexOf('done'));
    setTimeout(download, still.matches ? 300 : 900);
  }
  // 用一次性連結下載：beta-download 標成已用後轉到 60 秒有效的簽名網址（Content-Disposition: attachment，瀏覽器會下載而不是離開這頁）
  function download() {
    if (used || !token) return;
    if (B.preview) {
      const r = B.api.previewUse(token);
      used = true;
      render();
      if (r !== 'ok') fail('這個下載連結已經用過或過期了。', 'done');
      return;
    }
    const url = B.downloadUrl(token);
    used = true;
    location.href = url;
    setTimeout(() => { if (QUESTIONS[i].type === 'done') render(); }, 1500);
  }
  // 沒下載成功：用同一份資料再拿一個新連結（伺服器會限制每小時次數）
  async function again(b) {
    b.disabled = true;
    b.textContent = '拿新的連結…';
    try {
      token = (await B.api.signup({ ...a, website: hp.value })).token || '';
      used = false;
      render();
      download();
    } catch (err) {
      b.disabled = false;
      b.textContent = '拿新的下載連結';
      fail(err.message || '拿不到新的連結，請再試一次。', 'done');
    }
  }

  // ---------------------------------------------------------------- 手機全螢幕
  const vv = window.visualViewport;
  function fit() {
    if (!root.classList.contains('tf--full')) return;
    root.style.setProperty('--vvh', `${vv ? vv.height : innerHeight}px`);
    root.style.setProperty('--vvt', `${vv ? vv.offsetTop : 0}px`);
  }
  // 整頁式：按「開始」後不管手機或電腦都蓋滿整個畫面，一次一題；按 ✕ 或 Esc 收起，答案會保留
  function full(on) {
    const want = !!on;
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

  // ---------------------------------------------------------------- 事件
  root.addEventListener('input', ev => {
    const t = ev.target;
    if (!t.id || !t.id.startsWith('tf-in-')) return;
    a[t.id.slice(6)] = t.value;
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
    else if (b.dataset.dl !== undefined) download();
    else if (b.dataset.again !== undefined) again(b);
    else if (b.dataset.restart !== undefined) { const keep = { email: a.email, nickname: a.nickname, source: a.source }; a = keep; editing = true; go(indexOf('os')); }
    else if (b.dataset.value) pick(b);
  });
  function pick(b) {
    const q = QUESTIONS[i];
    a[q.id] = b.dataset.value;
    if (q.id === 'os') a.osGuessed = false;
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
