# 英単語学習PWA — 単語カード生成プロジェクト

## プロジェクト概要

TOEIC 900を目標とした英単語学習PWAの単語カードデータを生成・管理するプロジェクト。
Claude Codeで単語カード(JSON)をバッチ生成し、PWA本体が `data/words.json` を読み込んで
SRS(FSRS)学習・音声再生・統計表示を行う。

## ディレクトリ構成

```
vocab-app/
├── CLAUDE.md                ← このファイル(スキーマと生成ルール)
├── index.html                ← PWA本体(エントリーポイント)
├── manifest.json              ← PWAマニフェスト
├── sw.js                      ← Service Worker(オフラインキャッシュ)
├── css/
│   └── style.css             ← 全画面のスタイル
├── js/
│   ├── fsrs.js                ← FSRS間隔反復スケジューリング
│   ├── db.js                  ← IndexedDBラッパー(学習進捗の永続化)
│   └── app.js                 ← 画面描画・学習フロー・状態管理
├── icons/                     ← PWAアイコン(icon.svg / icon-maskable.svg が生成元)
├── input/
│   └── word_list.txt         ← 生成対象の単語リスト(1行1単語)
├── data/
│   └── words.json            ← 生成済みカードデータ(PWAが読む)
└── scripts/
    └── validate.js           ← スキーマ検証・重複チェック
```

PWA本体は `index.html` を起点に `data/words.json` を `fetch` で読み込み、学習進捗は IndexedDB に保存する。オフラインでも動作するよう `sw.js` がアプリシェルと単語データをキャッシュする。ローカル確認には `fetch`/Service Worker が動く簡易HTTPサーバーが必要(例: `python3 -m http.server` を `vocab-app/` 直下で実行し `http://localhost:8000` を開く)。

## カードスキーマ

`data/words.json` は以下の形式のオブジェクト配列。**全フィールド必須**(nullを許容するのは `icon` と `svg` のみ)。

```json
{
  "id": "reimburse",
  "word": "reimburse",
  "pos": "verb",
  "pronunciation": "/ˌriːɪmˈbɜːrs/",
  "meaning_ja": "〜に払い戻す、返済する",
  "meaning_en": "to pay back money to someone who has spent it for you",
  "examples": [
    {
      "en": "The company will reimburse employees for travel expenses.",
      "ja": "会社は従業員に出張費を払い戻します。"
    },
    {
      "en": "Please submit your receipts to be reimbursed by the end of the month.",
      "ja": "月末までに払い戻しを受けるには領収書を提出してください。"
    }
  ],
  "synonyms": ["repay", "refund", "compensate"],
  "collocations": ["reimburse expenses", "fully reimbursed", "reimburse A for B"],
  "emoji": "💴🔙",
  "icon": "receipt",
  "svg": null,
  "level": 2,
  "tags": ["finance", "office"]
}
```

### フィールド定義

| フィールド | 型 | ルール |
|---|---|---|
| `id` | string | 単語の小文字形。配列内で一意 |
| `word` | string | 見出し語 |
| `pos` | string | `noun` / `verb` / `adjective` / `adverb` / `phrase` のいずれか |
| `pronunciation` | string | IPA発音記号(アメリカ英語) |
| `meaning_ja` | string | 日本語の意味。TOEICで問われる語義を優先。複数語義は「、」区切りで最大3つ |
| `meaning_en` | string | 平易な英語での定義(英英辞典スタイル、既知語彙のみ使用) |
| `examples` | array(2) | **必ず2文**。TOEICに出る文脈(オフィス・出張・請求・会議・採用・物流など)。1文12〜18語程度 |
| `synonyms` | array | 2〜4語。TOEICレベルの語のみ |
| `collocations` | array | 2〜4個。頻出の共起表現 |
| `emoji` | string | 単語を最もよく表す絵文字1〜3個。**全カード必須** |
| `icon` | string \| null | [Lucide](https://lucide.dev)のアイコン名。適切なものがなければ `null`(無理にこじつけない) |
| `svg` | string \| null | 重要語・覚えにくい語のみ。シンプルなアイコン風SVG(viewBox="0 0 64 64"、単色ストローク、テキスト要素禁止)。通常は `null` |
| `level` | number | 1=TOEIC 600レベル / 2=730レベル / 3=860+レベル |
| `tags` | array | 1〜3個。`office` / `finance` / `hr` / `logistics` / `marketing` / `travel` / `daily` / `contract` / `manufacturing` から選択 |

## 生成ルール

1. **バッチサイズ**: 1回の依頼で50語まで。`input/word_list.txt` の上から順に、`data/words.json` に未登録の単語のみ処理する
2. **重複禁止**: 生成前に `data/words.json` の既存 `id` を確認し、重複をスキップ
3. **例文の品質基準**:
   - TOEIC Part 3/4/7に出そうな自然なビジネス文脈にする
   - 対象単語を必ず含める(活用形は可)
   - 例文中の他の語彙はTOEIC 700レベル以下に抑える(対象単語の学習を妨げないため)
4. **絵文字選定基準**: 意味の中核を表すものを選ぶ。抽象語は関連する場面・動作の絵文字で代用(例: comply → ✅📋)
5. **icon選定基準**: Lucideに実在するアイコン名のみ使用。確信がなければ `null`。具象語・場面が明確な語を優先
6. **svg生成基準**: 依頼で明示的に指定された単語のみ生成。それ以外は `null`
7. **生成後**: 必ず `node scripts/validate.js` を実行し、エラーがあれば修正してから完了報告する

## よく使う依頼例

```
input/word_list.txt の未処理単語を50件、スキーマ通りに生成して data/words.json に追記して。
最後に validate.js で検証して。
```

```
data/words.json の level 3 の単語のうち、次の10語にSVGイラストを追加して: [単語リスト]
```

## 検証コマンド

```bash
node scripts/validate.js
```

- スキーマ準拠(必須フィールド・型・examplesが2件)
- `id` の重複
- `pos` / `level` / `tags` の値域
を検証し、エラー行を報告する。
