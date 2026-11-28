# HowWeiChi 開發者官網

HowWeiChi 開發者官網介紹捲字 JuanGo 和校板 BanGo，並提供下載連結。網站放在 GitHub Pages：<https://howweichi.me/>

## 專案結構

| 路徑 | 內容 |
|---|---|
| `index.html` | 首頁 |
| `juango/` | 捲字 JuanGo 介紹頁 |
| `bango/` | 校板 BanGo 介紹頁 |
| `download/juango/` | 捲字測試版下載引導（一次一題，發一次性下載連結） |
| `download/bango/` | 校板測試版下載引導，和捲字共用 `js/beta-form.js` |
| `pro/` | Pro 方案介紹（不賣訂閱，付款都在 App 裡） |
| `privacy/`、`terms/`、`support/` | 隱私權政策、服務條款、支援和刪除帳號說明（商店審核用） |
| `free-year/`、`redeem/`、`promo-terms/` | 「發一篇文，免費用一年」活動頁、兌換頁和活動辦法 |
| `news/` | 最新消息列表和內文頁，由上一層的 `tools/news.py` 產生（內文在 `tools/news_articles.py`），不要直接改 |
| `js/updates.json` | 首頁「最新進度」和最新消息頁的資料；改完要執行 `python3 tools/news.py` |
| `img/og/` | 社群分享預覽圖（1200×630，由上一層的 `tools/og_images.swift` 產生） |
| `css/` | 網站樣式 |
| `js/` | 卡片列、輪播和裝置篩選 |
| `img/` | 圖示和 App 畫面 |
