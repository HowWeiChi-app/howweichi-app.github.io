// 活動表單和兌換頁共用：檢查規則、呼叫 Supabase Edge Function。
// PROMO_CONFIG.functionsUrl 是空的時候是「預覽模式」：用瀏覽器裡的假後端，規則跟真的 Edge Function 一樣，資料只存在這台電腦。
(() => {
  const C = window.PROMO_CONFIG || {};
  const preview = !C.functionsUrl;

  // ---------------------------------------------------------------- 檢查規則（Edge Function 也要照這些再檢查一次）
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function checkEmail(v) {
    v = String(v || '').trim();
    if (!v) return '請填 Email。';
    if (!EMAIL.test(v) || v.length > 254) return '這個 Email 的格式不對，請再檢查一次。';
    return '';
  }
  // 回傳 { url, platform } 或 { error }。只收一般貼文：instagram.com/p/、/reel/，threads.net、threads.com 的 /post/
  function parsePost(raw) {
    let s = String(raw || '').trim();
    if (!s) return { error: '請貼上貼文連結。' };
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    let u;
    try { u = new URL(s); } catch { return { error: '這不是網址，請從貼文的「分享 › 複製連結」貼上。' }; }
    const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    if (host === 'instagram.com' || host === 'instagr.am') {
      if (/^\/stories\//i.test(path) || /^\/s\//i.test(path)) return { error: '這是限時動態的連結，限動不算。請發一則一般貼文再來申請。' };
      const m = path.match(/^\/(?:[\w.]+\/)?(p|reel)\/([\w-]{5,})$/i);
      if (!m) return { error: '這不是一般貼文的連結。請在貼文按「分享 › 複製連結」，網址會有 /p/ 或 /reel/。' };
      return { url: `https://www.instagram.com/${m[1].toLowerCase()}/${m[2]}/`, platform: 'instagram' };
    }
    if (host === 'threads.net' || host === 'threads.com') {
      const m = path.match(/^\/@([\w.]+)\/post\/([\w-]{5,})$/i);
      if (!m) return { error: '這不是 Threads 貼文的連結。請在貼文按「分享 › 複製連結」，網址會有 /post/。' };
      return { url: `https://www.threads.com/@${m[1]}/post/${m[2]}`, platform: 'threads' };
    }
    return { error: '只收 Instagram 或 Threads 的貼文連結。' };
  }
  function checkCount(v) {
    const s = String(v ?? '').replace(/[,\s]/g, '');
    if (s === '') return '請填數字，沒有就填 0。';
    if (!/^\d{1,9}$/.test(s)) return '請只填數字。';
    return '';
  }
  const num = v => parseInt(String(v ?? '').replace(/[,\s]/g, ''), 10) || 0;
  const reached = (likes, views) => num(likes) >= (C.likes || 100) || num(views) >= (C.views || 10000);
  const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
  function checkProof(file) {
    if (!file) return '';
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!PROOF_TYPES.includes(file.type) && !['jpg', 'jpeg', 'png', 'heic', 'heif'].includes(ext)) return '只收 JPG、PNG 或 HEIC 圖片。';
    if (file.size > 5 * 1024 * 1024) return '圖片要在 5MB 以內。';
    return '';
  }

  // ---------------------------------------------------------------- 這台瀏覽器送過的申請：重複的話不用等伺服器就先擋
  const MINE = 'promo-applied';
  function mine() { try { return JSON.parse(localStorage.getItem(MINE)) || []; } catch { return []; } }
  function remember(email, post) {
    try { localStorage.setItem(MINE, JSON.stringify([...mine(), { email: email.toLowerCase(), post }].slice(-20))); } catch {}
  }
  const appliedEmail = email => mine().some(x => x.email === String(email || '').trim().toLowerCase());
  const appliedPost = post => mine().some(x => x.post === post);

  // ---------------------------------------------------------------- Turnstile：隱形模式，每次送出前拿一個新的 token
  let widget = null, waiting = null;
  function turnstileToken() {
    if (!C.turnstileSiteKey) return Promise.resolve('');
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function ready() {
        if (window.turnstile) return go();
        if (Date.now() - start > 8000) return reject(new Error('驗證服務載入失敗，請重新整理再試一次。'));
        setTimeout(ready, 100);
      })();
      function go() {
        waiting = { resolve, reject };
        if (widget === null) {
          const box = document.createElement('div');
          box.className = 'tf__ts';
          document.body.append(box);
          widget = turnstile.render(box, {
            sitekey: C.turnstileSiteKey, size: 'invisible', execution: 'execute', appearance: 'interaction-only',
            callback: t => { waiting && waiting.resolve(t); waiting = null; },
            'error-callback': () => { waiting && waiting.reject(new Error('沒有通過機器人檢查，請重新整理再試一次。')); waiting = null; },
          });
        } else {
          turnstile.reset(widget);
        }
        turnstile.execute(widget);
      }
    });
  }

  // ---------------------------------------------------------------- 呼叫 Edge Function
  class ApiError extends Error {
    constructor(code, message, field) { super(message); this.code = code; this.field = field; }
  }
  const MESSAGES = {
    duplicate: '已經申請過了。同一個 Email 或同一篇貼文只能申請一次。',
    closed: '活動已經結束了，謝謝你的參與。',
    rate: '送出太多次了，請一個小時後再試。',
    invalid: '有欄位不符合規則，請回去檢查。',
    bot: '沒有通過機器人檢查，請重新整理再試一次。',
    expired: '這個啟用連結已經過期了（寄出後 30 天內有效）。',
    redeemed: '這個連結的代碼已經兌換過了。',
    sold_out: '這個平台的兌換碼發完了。',
    not_found: '找不到這個啟用連結，請確認網址跟信裡的一樣。',
    network: '連不上伺服器，請確認網路後再試一次。',
  };
  async function call(name, body) {
    if (preview) return mock(name, body);
    let res;
    try {
      res = await fetch(`${C.functionsUrl}/${name}`, {
        method: body ? 'POST' : 'GET',
        headers: { apikey: C.anonKey, Authorization: `Bearer ${C.anonKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch { throw new ApiError('network', MESSAGES.network); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = data.error || (res.status === 409 ? 'duplicate' : res.status === 429 ? 'rate' : res.status === 410 ? 'closed' : 'invalid');
      throw new ApiError(code, data.message || MESSAGES[code] || MESSAGES.invalid, data.field);
    }
    return data;
  }

  const api = {
    preview,
    stats: () => call('promo-stats'),
    async apply(a, file) {
      const body = { email: a.email.trim(), post_url: a.post, platform: a.platform, likes: num(a.likes), views: num(a.views),
                     app: a.app, device: a.device, agreed: a.agree === true };
      if (file) {
        // 先拿 signed upload URL，把截圖傳到私人 bucket promo-proofs，再把路徑一起送出
        const up = await call('promo-apply', { step: 'proof', type: file.type || 'image/heic', size: file.size, turnstile: await turnstileToken() });
        if (!preview) {
          const r = await fetch(up.upload_url, { method: 'PUT', headers: { 'Content-Type': file.type || 'image/heic', 'x-upsert': 'false' }, body: file })
            .catch(() => null);
          if (!r || !r.ok) throw new ApiError('network', '截圖上傳失敗，請再試一次，或回去略過截圖。');
        }
        body.proof_path = up.path;
      }
      body.turnstile = await turnstileToken();
      const out = await call('promo-apply', { step: 'submit', ...body });
      remember(body.email, body.post_url);
      return out;
    },
    claim: (token, platform, peek = false) => call('promo-claim', { token, platform, peek }),
  };

  // ---------------------------------------------------------------- 預覽模式的假後端（行為照規格，重新驗證所有欄位）
  const DB = 'promo-preview-db';
  const load = () => { try { return JSON.parse(localStorage.getItem(DB)) || { claims: [] }; } catch { return { claims: [] }; } };
  const save = db => { try { localStorage.setItem(DB, JSON.stringify(db)); } catch {} };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function mock(name, body) {
    await wait(350);
    const q = new URLSearchParams(location.search);
    const db = load();
    const fail = (code, field) => { throw new ApiError(code, MESSAGES[code], field); };
    if (name === 'promo-stats') {
      if (q.has('full')) return { remaining: 0, open: false };
      return { remaining: Math.max(0, 143 - db.claims.length), open: true };
    }
    if (name === 'promo-apply') {
      if (q.has('full')) fail('closed');
      if (body.step === 'proof') return { path: `preview/${Date.now()}.img`, upload_url: '' };
      const post = parsePost(body.post_url);
      if (checkEmail(body.email)) fail('invalid', 'email');
      if (post.error || post.url !== body.post_url) fail('invalid', 'post');
      if (!['instagram', 'threads'].includes(body.platform)) fail('invalid', 'platform');
      if (!Number.isInteger(body.likes) || !Number.isInteger(body.views) || !reached(body.likes, body.views)) fail('invalid', 'views');
      if (!['juango', 'bango'].includes(body.app) || !['ios', 'android'].includes(body.device)) fail('invalid', 'app');
      if (body.agreed !== true) fail('invalid', 'agree');
      const email = body.email.toLowerCase();
      if (db.claims.some(c => c.email === email || c.post_url === body.post_url)) fail('duplicate');
      db.claims.push({ email, post_url: body.post_url, status: 'pending' });
      save(db);
      return { ok: true };
    }
    if (name === 'promo-claim') {
      // 測試用 token：demo（正常）、expired、redeemed、soldout、其他都當成找不到
      const t = body.token;
      if (t === 'expired') fail('expired');
      if (t === 'redeemed') fail('redeemed');
      if (t !== 'demo' && t !== 'soldout') fail('not_found');
      const issued = db.issued && db.issued[t];
      if (issued) return { ...issued, already: true };
      if (body.peek) return { status: 'fresh', app: 'juango' };
      if (t === 'soldout') fail('sold_out');
      const code = (body.platform === 'ios' ? 'JG' : 'GP') + Math.random().toString(36).slice(2, 12).toUpperCase();
      db.issued = { ...(db.issued || {}), [t]: { status: 'issued', app: 'juango', platform: body.platform, code } };
      save(db);
      return { ...db.issued[t], already: false };
    }
    fail('invalid');
  }

  window.Promo = { config: C, api, ApiError, MESSAGES, checkEmail, parsePost, checkCount, checkProof, num, reached, appliedEmail, appliedPost };
})();
