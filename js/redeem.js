// 兌換頁：Email 裡的連結 /redeem/?t=<token>。拿一組商店兌換碼，轉到 App Store 或 Google Play 兌換。
// 同一個 token 再打開，只會顯示已經發出的那組代碼。預覽模式的測試 token：demo、expired、redeemed、soldout。
(() => {
  const root = document.querySelector('[data-redeem]');
  const P = window.Promo;
  if (!root || !P) return;
  const C = P.config;
  const body = root.querySelector('#rd-body'), lead = root.querySelector('#rd-lead');
  const token = new URLSearchParams(location.search).get('t') || '';
  const APPS = { juango: '捲字 JuanGo', bango: '校板 BanGo' };
  const OS = { ios: 'iPhone', android: 'Android' };
  const ua = navigator.userAgent;
  const guess = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(ua) ? 'android' : '';
  let platform = guess, app = 'juango';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ig = `Instagram 私訊 <a href="${esc(C.instagram)}">@howweichi.co</a>`;
  const contact = C.contactEmail ? `Email <a href="mailto:${esc(C.contactEmail)}">${esc(C.contactEmail)}</a> 或 ${ig}` : ig;
  const preview = P.api.preview ? '<p class="tf__preview">預覽模式：後端還沒接上，代碼是假的。測試連結：?t=demo、?t=expired、?t=redeemed、?t=soldout。</p>' : '';

  function storeUrl(p, code, a) {
    if (p === 'android') return `https://play.google.com/redeem?code=${encodeURIComponent(code)}`;
    const id = C.appleAppId && C.appleAppId[a];
    return id ? `https://apps.apple.com/redeem?ctx=offercodes&id=${encodeURIComponent(id)}&code=${encodeURIComponent(code)}` : '';
  }
  function set(html, focus) {
    body.innerHTML = preview + html;
    const t = body.querySelector(focus || 'h2');
    if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); }
  }
  const seg = () => `<div class="seg seg--light" role="group" aria-label="選擇手機">${Object.entries(OS).map(([k, n]) =>
    `<button type="button" data-os="${k}" aria-pressed="${platform === k}">我用 ${n}</button>`).join('')}</div>`;

  function error(code, msg) {
    const extra = code === 'sold_out' || code === 'network' || code === 'invalid'
      ? `<p>請用 ${contact} 告訴我們，我們會另外處理。</p>` : code === 'expired'
      ? `<p>啟用連結在寄出後 30 天內有效。如果還沒兌換，請用 ${contact} 聯絡我們。</p>` : code === 'redeemed'
      ? '<p>兌換成功的話，打開 App 的 設定 › Pro 就能看到。換手機時登入同一個帳號就好。</p>' : '';
    lead.textContent = '';
    set(`<div class="rd__err" role="alert"><h2>${esc(msg || P.MESSAGES[code] || '出了一點問題。')}</h2>${extra}</div>`);
  }

  function fresh() {
    lead.innerHTML = `這是 <b>${esc(APPS[app])} Pro</b> 的免費一年。兌換前先在 App 裡登入，這樣換手機也不會不見。`;
    set(`<h2 class="rd__h">你用哪一種手機？</h2>${seg()}
<p class="rd__err-inline" role="alert" hidden></p>
<button class="btn btn--lg" type="button" data-claim ${platform ? '' : 'disabled'}>啟用免費一年</button>
<p class="note">一個連結只能拿一組代碼，請選你要用的那支手機。</p>`, '.seg button[aria-pressed=true], .seg button');
  }

  function issued(r, auto) {
    app = r.app || app;
    const url = storeUrl(r.platform, r.code, app);
    const store = r.platform === 'ios' ? 'App Store' : 'Google Play';
    lead.innerHTML = `<b>${esc(APPS[app])} Pro</b> 免費一年的兌換碼（${OS[r.platform] || ''}）。`;
    set(`<h2 class="rd__h">${r.already ? '這是你之前拿到的代碼。' : '拿到了！'}</h2>
<div class="rd__code"><code id="rd-code">${esc(r.code)}</code><button class="btn" type="button" data-copy>複製</button></div>
${url ? `<a class="btn btn--lg" href="${esc(url)}" data-store>前往 ${store} 兌換</a>` : `<p>打開 ${store} 的兌換頁，貼上這組代碼。</p>`}
<ol class="rd__steps"><li>兌換前先在 App 裡登入，這樣捲字和校板都能用，換手機也不會不見。</li>
<li>也可以在 App 的 設定 › Pro › 有兌換碼？ 輸入這組代碼。</li>
<li>${r.platform === 'ios' ? 'iPhone 的代碼只能在 App Store 兌換' : 'Android 的代碼只能在 Google Play 兌換'}，一個連結只能拿一組。</li></ol>`, auto && url ? '[data-store]' : 'h2');
    if (auto && url && r.platform === guess) setTimeout(() => { location.href = url; }, 1500);
  }

  root.addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.os) {
      platform = b.dataset.os;
      body.querySelectorAll('[data-os]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      body.querySelector('[data-claim]').disabled = false;
    } else if (b.dataset.claim !== undefined) {
      if (!platform) return;
      b.disabled = true;
      b.textContent = '處理中…';
      try { issued(await P.api.claim(token, platform), true); }
      catch (err) {
        if (err.code === 'network') {
          const box = body.querySelector('.rd__err-inline');
          box.textContent = err.message; box.hidden = false;
          b.disabled = false; b.textContent = '啟用免費一年';
        } else error(err.code, err.message);
      }
    } else if (b.dataset.copy !== undefined) {
      const code = body.querySelector('#rd-code').textContent;
      try { await navigator.clipboard.writeText(code); }
      catch {
        const r = document.createRange(); r.selectNodeContents(body.querySelector('#rd-code'));
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      }
      b.textContent = '已複製';
      setTimeout(() => { b.textContent = '複製'; }, 2000);
    }
  });

  if (!/^[\w-]{4,128}$/.test(token)) {
    lead.textContent = '';
    set(`<div class="rd__err"><h2>這個頁面要從活動信件的連結打開。</h2><p>還沒申請的話，先看看<a href="../free-year/">發一篇文，免費用一年</a>。</p></div>`);
    return;
  }
  set('<p class="rd__wait">讀取中…</p>', 'p');
  P.api.claim(token, platform, true)
    .then(r => { app = r.app || app; return r.code ? issued(r, false) : fresh(); })
    .catch(err => error(err.code, err.message));
})();
