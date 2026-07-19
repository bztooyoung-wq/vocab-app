# vocab-app

TOEIC 900を目標とした英単語学習PWA。FSRS(間隔反復)による出題・音声再生・学習統計・オフライン対応(Service Worker + IndexedDB)を備える。

## ローカルでの起動

`fetch` と Service Worker は `file://` では動作しないため、簡易HTTPサーバー経由で開く。

```bash
cd vocab-app
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開く。初回アクセス後はオフラインでも動作し、モバイルではホーム画面に追加してアプリのように使える。

## 単語データの生成

単語カード(`data/words.json`)の生成ルールは [CLAUDE.md](./CLAUDE.md) を参照。

```bash
node scripts/validate.js
```