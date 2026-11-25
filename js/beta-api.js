// 捲字測試版下載引導（/download/juango/）和後台共用：檢查規則、呼叫 Edge Function beta-signup、beta-admin。
// 要先載入 promo-config.js 和 promo-api.js（共用 functionsUrl、anonKey、Turnstile）。
// PROMO_CONFIG.functionsUrl 是空的時候是「預覽模式」：用瀏覽器裡的假後端，資料只存在這台電腦。
(() => {
  const P = window.Promo;
  if (!P) return;
  const C = P.config;
  const preview = !C.functionsUrl;
  const BETA = C.beta || {};

  // ---------------------------------------------------------------- 檢查規則（supabase/functions/beta-signup 也照這些再檢查一次）
  // 「你在哪裡知道捲字的？」的選項。改這裡的話，Edge Function 的 SOURCES 也要一起改
  const SOURCES = [['instagram', 'Instagram'], ['threads', 'Threads'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'],
                   ['youtube', 'YouTube'], ['x', 'X（Twitter）'], ['dcard', 'Dcard'], ['xiaohongshu', '小紅書'],
                   ['friend', '朋友或同學'], ['school', '老師或學校'], ['search', 'Google 搜尋'], ['other', '其他']];
  const OS = [['ios', 'iPhone'], ['android', 'Android']];
  const NAME_MAX = 20;
  function checkName(v) {
    v = String(v || '').trim();
    if (!v) return '請填一個暱稱。';
    if ([...v].length > NAME_MAX) return `暱稱最多 ${NAME_MAX} 個字。`;
    if (/[<>]/.test(v)) return '暱稱不能有 < 或 >。';
    return '';
  }
  const label = (list, v) => (list.find(o => o[0] === v) || [, v || '—'])[1];
  // 從瀏覽器猜手機系統，用來預先選好；猜不到就讓使用者自己選
  function guessOs() {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
    return '';
  }
  // 一次性下載連結：beta-signup 回傳的 token 只能用一次、30 分鐘內有效。
  // beta-download 收到後先把 token 標成已用，再轉到 Supabase Storage 私人空間 60 秒有效的簽名網址。安裝檔不放公開網址。
  const downloadUrl = token => (token && !preview ? `${C.functionsUrl}/beta-download?t=${encodeURIComponent(token)}` : '');

  // ---------------------------------------------------------------- 呼叫 Edge Function
  const MESSAGES = {
    rate: '送出太多次了，請一個小時後再試。',
    invalid: '有欄位不符合規則，請回去檢查。',
    bot: '沒有通過機器人檢查，請重新整理再試一次。',
    network: '連不上伺服器，請確認網路後再試一次。',
    unauthorized: '後台密碼不對。',
    not_found: '找不到這筆申請。',
    no_account: '這個 Email 還沒登入過捲字。請對方先用這個 Email 在 App 裡登入一次，再按啟用。',
    revenuecat: 'RevenueCat 沒有回應，Pro 還沒開，請稍後再試。',
    config: '後端還沒設定好（缺少 Secrets），請看 supabase/README.md。',
  };
  async function call(name, body, key) {
    if (preview) return mock(name, body, key);
    let res;
    try {
      res = await fetch(`${C.functionsUrl}/${name}`, {
        method: 'POST',
        headers: { apikey: C.anonKey, Authorization: `Bearer ${C.anonKey}`, 'Content-Type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) },
        body: JSON.stringify(body || {}),
      });
    } catch { throw new P.ApiError('network', MESSAGES.network); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = data.error || (res.status === 401 ? 'unauthorized' : res.status === 429 ? 'rate' : 'invalid');
      throw new P.ApiError(code, data.message || MESSAGES[code] || MESSAGES.invalid, data.field);
    }
    return data;
  }

  const api = {
    preview,
    async signup(a) {
      return call('beta-signup', { source: a.source, email: String(a.email || '').trim(), nickname: String(a.nickname || '').trim(), os: a.os,
                                   website: a.website || '', turnstile: await P.turnstileToken().catch(() => '') });
    },
    list: key => call('beta-admin', { action: 'list' }, key),
    grant: (key, id) => call('beta-admin', { action: 'grant', id }, key),
    // 預覽模式模擬 beta-download：第一次 ok，之後 used，超過 30 分鐘 expired
    previewUse(token) {
      const db = load(), t = (db.tokens || {})[token];
      if (!t) return 'not_found';
      if (t.used_at) return 'used';
      if (Date.now() > t.expires) return 'expired';
      t.used_at = Date.now();
      save(db);
      return 'ok';
    },
  };

  // ---------------------------------------------------------------- 預覽模式的假後端（跟 Edge Function 回一樣的格式）
  const DB = 'beta-preview-db';
  const load = () => { try { return JSON.parse(localStorage.getItem(DB)) || { rows: [] }; } catch { return { rows: [] }; } };
  const save = db => { try { localStorage.setItem(DB, JSON.stringify(db)); } catch {} };
  function fail(code, field) { throw new P.ApiError(code, MESSAGES[code] || MESSAGES.invalid, field); }
  async function mock(name, body, key) {
    await new Promise(r => setTimeout(r, 450));
    const db = load();
    if (name === 'beta-signup') {
      const email = body.email.toLowerCase();
      if (body.website) return { ok: true, token: 'bot' };  // 機器人填了隱藏欄位：假裝成功
      if (!SOURCES.some(([k]) => k === body.source)) fail('invalid', 'source');
      if (P.checkEmail(email)) fail('invalid', 'email');
      if (checkName(body.nickname)) fail('invalid', 'nickname');
      if (!OS.some(([k]) => k === body.os)) fail('invalid', 'os');
      const old = db.rows.find(r => r.email === email);
      if (old) Object.assign(old, { source: body.source, nickname: body.nickname, os: body.os, updated_at: new Date().toISOString() });
      else db.rows.push({ id: crypto.randomUUID(), email, source: body.source, nickname: body.nickname, os: body.os,
                          created_at: new Date().toISOString(), pro_granted_at: null });
      const token = 'preview-' + crypto.randomUUID();
      db.tokens = { ...(db.tokens || {}), [token]: { os: body.os, expires: Date.now() + 30 * 60_000, used_at: null } };
      save(db);
      return { ok: true, token, expires_in: 1800 };
    }
    if (name === 'beta-admin') {
      if (!key) fail('unauthorized');
      if (body.action === 'list') return { rows: [...db.rows].sort((x, y) => y.created_at.localeCompare(x.created_at)) };
      if (body.action === 'grant') {
        const row = db.rows.find(r => r.id === body.id);
        if (!row) fail('not_found');
        if (row.email.includes('nologin')) fail('no_account');  // 預覽用：Email 含 nologin 就當成還沒登入過
        if (!row.pro_granted_at) row.pro_granted_at = new Date().toISOString();
        save(db);
        return { ok: true, row };
      }
    }
    fail('invalid');
  }

  window.Beta = { config: BETA, api, MESSAGES, SOURCES, OS, NAME_MAX, checkName, checkEmail: P.checkEmail, label, guessOs, downloadUrl, preview };
})();
