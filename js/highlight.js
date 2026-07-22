/* ================= 対象単語のマッチ・ハイライト(ブラウザ/Node共用) =================
   例文中から見出し語(またはその活用形)を探して <b> で囲む。
   優先順: 完全一致 → 規則活用 → 語末e脱落形/y変化形 → 語幹前方一致(対象語と長さ差最小)。
   scripts/validate.js からも require され、検証基準と実行時の穴埋め基準を一致させる。 */
function escapeReg(s){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}

function findTargetToken(en,word){
  const w=word.toLowerCase().split(" ")[0];
  const ew=escapeReg(w);
  const patterns=[
    "\\b("+ew+")\\b",
    "\\b("+ew+"(?:s|es|d|ed|ing))\\b",
  ];
  if(w.length>2&&w.endsWith("e")){
    patterns.push("\\b("+escapeReg(w.slice(0,-1))+"(?:ing|ed|es|s))\\b");
  }
  if(w.length>2&&w.endsWith("y")){
    patterns.push("\\b("+escapeReg(w.slice(0,-1))+"(?:ies|ied))\\b");
  }
  for(const p of patterns){
    const m=en.match(new RegExp(p,"i"));
    if(m)return{token:m[1],index:m.index};
  }
  // フォールバック: 語幹前方一致の全候補から、対象語と長さ差が最小のトークンを選ぶ
  const base=w.replace(/e$/,"");
  const stem=base.slice(0,Math.max(3,Math.min(base.length,5)));
  if(stem.length<3)return null;   // "sue"→"su" 等の短すぎる語幹は誤爆するため使わない
  const re=new RegExp("\\b("+escapeReg(stem)+"\\w*)\\b","gi");
  let best=null,m2;
  while((m2=re.exec(en))!==null){
    const diff=Math.abs(m2[1].length-w.length);
    if(!best||diff<best.diff)best={token:m2[1],index:m2.index,diff:diff};
  }
  return best?{token:best.token,index:best.index}:null;
}

function highlightWord(en,word){
  const hit=findTargetToken(en,word);
  if(!hit)return{html:en,matched:false,token:null};
  const html=en.slice(0,hit.index)+"<b>"+hit.token+"</b>"+en.slice(hit.index+hit.token.length);
  return{html:html,matched:true,token:hit.token};
}

if(typeof module!=="undefined"&&module.exports){
  module.exports={findTargetToken:findTargetToken,highlightWord:highlightWord};
}
