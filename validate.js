#!/usr/bin/env node
/**
 * data/words.json のスキーマ検証・重複チェック
 * 使い方: node scripts/validate.js
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "words.json");
const POS = ["noun", "verb", "adjective", "adverb", "phrase"];
const TAGS = ["office", "finance", "hr", "logistics", "marketing", "travel", "daily", "contract", "manufacturing"];
const LEVELS = [1, 2, 3];

const errors = [];
const err = (i, id, msg) => errors.push(`[${i}] ${id || "(no id)"}: ${msg}`);

let raw;
try {
  raw = fs.readFileSync(FILE, "utf8");
} catch {
  console.error(`ERROR: ${FILE} が見つかりません`);
  process.exit(1);
}

let cards;
try {
  cards = JSON.parse(raw);
} catch (e) {
  console.error(`ERROR: JSONパース失敗: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(cards)) {
  console.error("ERROR: ルートは配列である必要があります");
  process.exit(1);
}

const seen = new Set();
cards.forEach((c, i) => {
  const id = c.id;
  // 必須文字列フィールド
  for (const f of ["id", "word", "pos", "pronunciation", "meaning_ja", "meaning_en", "emoji"]) {
    if (typeof c[f] !== "string" || c[f].trim() === "") err(i, id, `${f} が空または文字列でない`);
  }
  // id 一意性・小文字
  if (typeof id === "string") {
    if (seen.has(id)) err(i, id, "id が重複");
    seen.add(id);
    if (id !== id.toLowerCase()) err(i, id, "id は小文字にする");
  }
  // pos / level / tags
  if (!POS.includes(c.pos)) err(i, id, `pos が不正: ${c.pos}`);
  if (!LEVELS.includes(c.level)) err(i, id, `level が不正: ${c.level}`);
  if (!Array.isArray(c.tags) || c.tags.length < 1 || c.tags.length > 3) {
    err(i, id, "tags は1〜3個の配列");
  } else {
    c.tags.forEach((t) => { if (!TAGS.includes(t)) err(i, id, `tag が不正: ${t}`); });
  }
  // examples
  if (!Array.isArray(c.examples) || c.examples.length !== 2) {
    err(i, id, "examples は必ず2件");
  } else {
    c.examples.forEach((ex, j) => {
      if (!ex || typeof ex.en !== "string" || typeof ex.ja !== "string") {
        err(i, id, `examples[${j}] に en/ja が必要`);
      } else if (typeof c.word === "string") {
        const stem = c.word.toLowerCase().split(" ")[0].slice(0, 5);
        if (!ex.en.toLowerCase().includes(stem)) {
          err(i, id, `examples[${j}] に対象単語(語幹 "${stem}")が含まれていない可能性`);
        }
      }
    });
  }
  // synonyms / collocations
  for (const f of ["synonyms", "collocations"]) {
    if (!Array.isArray(c[f]) || c[f].length < 2 || c[f].length > 4) {
      err(i, id, `${f} は2〜4個の配列`);
    }
  }
  // icon / svg (null許容)
  if (c.icon !== null && typeof c.icon !== "string") err(i, id, "icon は string か null");
  if (c.svg !== null && typeof c.svg !== "string") err(i, id, "svg は string か null");
  if (typeof c.svg === "string" && !c.svg.includes("<svg")) err(i, id, "svg に <svg タグがない");
});

if (errors.length) {
  console.error(`NG: ${errors.length} 件のエラー`);
  errors.forEach((e) => console.error("  " + e));
  process.exit(1);
} else {
  console.log(`OK: ${cards.length} 件のカードすべて検証パス`);
}
