/* ================= 単語データ(data/words.json を読み込み) ================= */
let CARDS=[];
const LEVEL_LABEL={1:"TOEIC 600",2:"TOEIC 730",3:"TOEIC 860+"};
const LEVEL_SHORT={1:"600",2:"730",3:"860+"};
function normalizeCard(raw){
  return Object.assign({},raw,{
    pron:raw.pronunciation,
    ja:raw.meaning_ja,
    en:raw.meaning_en,
    syn:raw.synonyms,
    col:raw.collocations||[],
    ex:raw.examples.map(e=>{
      const h=highlightWord(e.en,raw.word);
      return{html:h.html,ja:e.ja,token:h.matched?h.token:null};
    })
  });
}
async function loadCards(){
  try{
    const res=await fetch("data/words.json",{cache:"no-cache"});
    const raw=await res.json();
    CARDS=raw.flatMap(c=>{
      try{return[normalizeCard(c)];}
      catch(e){console.warn("不正なカードをスキップしました:",c&&c.id,e);return[];}
    });
  }catch(e){
    console.error("単語データの読み込みに失敗しました",e);
    CARDS=[];
  }
}

/* ================= 状態管理(IndexedDB / メモリフォールバック) ================= */
const KEY="goi-proto-v1";
let state={cards:{},log:{}};          // log: {"YYYY-MM-DD":{n:回数,ok:正解数,newN:新規数}}
let storageOk=false;
const pad2=n=>String(n).padStart(2,"0");
// 日付キーは端末ローカル(JST)基準。toISOString(UTC)だと午前0〜9時が前日扱いになる
const dateKey=(d=new Date())=>d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());
const today=()=>dateKey();
async function loadState(){
  try{const v=await idbGet(KEY);
    if(v)state=JSON.parse(v);
    storageOk=true;
  }catch(e){storageOk=false;}
}
async function saveState(){
  if(!storageOk)return;
  try{await idbSet(KEY,JSON.stringify(state));}catch(e){}
}

/* ================= 学習キュー ================= */
const NEW_PER_DAY=10;
let queue=[],sessionTotal=0,current=null,revealed=false;
function buildQueue(){
  const now=Date.now();
  const due=CARDS.filter(c=>state.cards[c.id]&&state.cards[c.id].due<=now)
    .sort((a,b)=>state.cards[a.id].due-state.cards[b.id].due);
  const newIntroduced=(state.log[today()]&&state.log[today()].newN)||0;
  const news=CARDS.filter(c=>!state.cards[c.id]).slice(0,Math.max(0,NEW_PER_DAY-newIntroduced));
  queue=[...due,...news];sessionTotal=queue.length;
}

/* ================= 音声 ================= */
function speak(text){
  try{
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    u.lang="en-US";u.rate=0.92;
    const v=speechSynthesis.getVoices().find(v=>v.lang.startsWith("en"));
    if(v)u.voice=v;
    speechSynthesis.speak(u);
  }catch(e){}
}

/* ================= トースト(Undo / SW更新 共用) ================= */
let toastTimer=null;
function showToast(msg,opts){
  opts=opts||{};
  let t=document.getElementById("toast");
  if(!t){t=document.createElement("div");t.id="toast";document.body.appendChild(t);}
  t.innerHTML="";
  const span=document.createElement("span");
  span.textContent=msg;t.appendChild(span);
  if(opts.actionLabel){
    const btn=document.createElement("button");
    btn.textContent=opts.actionLabel;
    btn.addEventListener("click",()=>{hideToast();if(opts.onAction)opts.onAction();});
    t.appendChild(btn);
  }
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(hideToast,opts.duration||4000);
}
function hideToast(){
  const t=document.getElementById("toast");
  if(t)t.classList.remove("show");
}

/* ================= 学習画面 ================= */
const $=s=>document.querySelector(s);
function renderStudy(){
  const area=$("#studyArea");
  $("#progNum").textContent=(sessionTotal-queue.length)+" / "+sessionTotal;
  $("#progFill").style.width=sessionTotal?((sessionTotal-queue.length)/sessionTotal*100)+"%":"0%";
  if(!queue.length){
    const done=state.log[today()]?state.log[today()].n:0;
    const noData=CARDS.length===0;
    area.innerHTML=`<div class="done-box">
      <div class="big">${noData?"NO SIGNAL":(done?"SIDE COMPLETE":"NEEDLE'S UP")}</div>
      <p>${noData?"単語データを読み込めませんでした。オンライン環境で一度アプリを開いてください。":(done?`今日は ${done} 回学習しました。<br>明日の棚には次のセッションが並んでいます。`:"今日のセッションを始めましょう。")}</p>
      <button class="primary-btn" data-action="restart">キューを再確認</button>
      <div class="save-note">${storageOk?"✓ 進捗は自動保存されます":"⚠ この環境では進捗はセッション内のみ保持"}</div>
    </div>`;
    area.querySelector("[data-action='restart']").addEventListener("click",restartSession);
    return;
  }
  current=queue[0];revealed=false;
  const cs=state.cards[current.id]||{};
  const isNew=!cs.reps;
  const trackNo=String((sessionTotal-queue.length)+1).padStart(2,"0");
  const tagHtml=`<span class="card-tag ${isNew?"new":""}">${isNew?"NEW":"REVIEW"}</span>`;
  const exAll=pickEx(current,cs);           // レビュー回数で例文をローテーション
  let effMode=mode,kinfureEx=null;
  if(mode==="kinfure"){
    const cands=current.ex.filter(e=>e.token);
    if(cands.length){kinfureEx=cands[((cs&&cs.reps)||0)%cands.length];}
    else effMode="card";                    // 穴埋めが作れない場合は単語カード式にフォールバック
  }
  const frontEx=kinfureEx||exAll;
  let front="";
  if(effMode==="kinfure"){
    front=`
      <div class="card-front-extra">
        <div class="player-row">
          <div class="record record--sm" id="record"><div class="tonearm" id="tonearm"></div></div>
          <div class="trackinfo">
            <div class="lbl">${tagHtml}&nbsp;SIDE A · TRACK ${trackNo}</div>
            <div class="quiz-ja">${kinfureEx.ja}</div>
          </div>
        </div>
        <div class="quiz-en">${blankEn(kinfureEx.html)}</div>
        <div class="ctrl-row">
          <button class="ctrl-btn" data-say="ex-cur">▶ PLAY TRACK</button>
          <button class="hint-btn" id="hintBtn">HINT</button>
        </div>
      </div>`;
  }else if(effMode==="listen"){
    front=`
      <div class="card-front-extra" style="text-align:center">
        <div class="lbl" style="margin-bottom:12px">${tagHtml}&nbsp;SIDE A · TRACK ${trackNo}</div>
        <div class="record record--lg" id="record"><div class="tonearm" id="tonearm"></div></div>
        <div class="listen-note">針を落として、聞こえてくる単語と<br>その意味を思い出してください</div>
        <div class="ctrl-row"><button class="ctrl-btn" data-say="ex-cur">▶ PLAY AGAIN</button></div>
      </div>`;
  }else{
    front=`
      <div class="card-front-extra now-playing">
        <div class="lbl" style="margin-bottom:12px">${tagHtml}&nbsp;SIDE A · TRACK ${trackNo}</div>
        <div class="record record--lg" id="record"><div class="tonearm" id="tonearm"></div></div>
        <div class="now-playing-word">${current.word}</div>
        <div class="now-playing-pron">${current.pron} · ${current.pos.toUpperCase()} ${current.emoji}</div>
        <div class="ctrl-row"><button class="ctrl-btn" data-say="word">▶ PLAY TRACK</button></div>
      </div>`;
  }
  const pressing=`${LEVEL_LABEL[current.level]||"—"}${(current.tags&&current.tags.length)?" · "+current.tags.join(" / "):""}`;
  area.innerHTML=`
    <div class="sleeve" id="fc">
      ${front}
      <div class="card-back">
        <div class="bw-row">
          <div class="big-word">${current.word}</div>
          ${current.svg?`<span class="svg-badge">${current.svg}</span>`:""}
        </div>
        <div class="big-pron">${current.pron} · ${current.pos.toUpperCase()} <span style="margin-left:4px">${current.emoji}</span></div>
        <div class="readout">
          <div class="k">TITLE (JA)</div><div class="v jp">${current.ja}</div>
          <div class="k">LINER NOTES</div><div class="v sub">${current.en}</div>
          <div class="k">PRESSING</div><div class="v sub">${pressing}</div>
        </div>
        <div class="sect">TRACKLIST</div>
        ${current.ex.map((e,i)=>`<div class="example"><div class="no">A${i+1}</div><div style="flex:1"><div class="en">${e.html}
          <button class="speak-mini" data-say="ex${i}">▶</button></div>
          <div class="ja">${e.ja}</div></div></div>`).join("")}
        ${current.col.length?`<div class="sect">PAIRS WELL WITH</div>
        <div class="chips">${current.col.map(c=>`<span class="chip">${c}</span>`).join("")}</div>`:""}
        <div class="sect">ALSO PRESSED AS</div>
        <div class="chips">${current.syn.map(s=>`<span class="chip">${s}</span>`).join("")}</div>
      </div>
      <div class="tap-hint" id="tapHint">${effMode==="card"?"タップしてライナーノーツを表示":"思い出したらタップして針を落とす"}</div>
    </div>
    <div class="rating" id="rating">
      <button class="rate-btn rate-again" data-g="1"><b>POOR</b><small>${previewIvl(cs,1)}</small></button>
      <button class="rate-btn rate-hard" data-g="2"><b>GOOD</b><small>${previewIvl(cs,2)}</small></button>
      <button class="rate-btn rate-good" data-g="3"><b>VG+</b><small>${previewIvl(cs,3)}</small></button>
      <button class="rate-btn rate-easy" data-g="4"><b>MINT</b><small>${previewIvl(cs,4)}</small></button>
    </div>`;
  bindStudyEvents(area,frontEx);
  if(mode==="listen")setTimeout(()=>speak(plainEn(frontEx.html)),350);   // リスニングは自動再生
}
function bindStudyEvents(area,frontEx){
  const fc=area.querySelector("#fc");
  if(fc)fc.addEventListener("click",(e)=>{
    if(e.target.closest("[data-say],[data-g],#hintBtn"))return;
    reveal();
  });
  area.querySelectorAll("[data-say]").forEach(b=>b.addEventListener("click",(e)=>{
    e.stopPropagation();
    const k=b.dataset.say;
    if(k==="word")speak(current.word);
    else if(k==="ex-cur")speak(plainEn(frontEx.html));
    else speak(plainEn(current.ex[+k.slice(2)].html));
  }));
  const hb=area.querySelector("#hintBtn");
  if(hb){
    const tok=frontEx.token||current.word;
    hb.addEventListener("click",(e)=>{
      e.stopPropagation();
      hb.classList.toggle("on");
      hb.textContent=hb.classList.contains("on")?`💡 ${tok[0]}… (${tok.length}文字)`:"HINT";
    });
  }
  area.querySelectorAll("[data-g]").forEach(b=>b.addEventListener("click",(e)=>{
    e.stopPropagation();rate(+b.dataset.g);
  }));
}
function reveal(){
  if(revealed)return;revealed=true;
  $("#fc").classList.add("revealed");
  $("#rating").classList.add("show");
  $("#tapHint").style.display="none";
  const rec=document.getElementById("record"),arm=document.getElementById("tonearm");
  if(rec)rec.classList.add("playing");
  if(arm)arm.classList.add("down");
  // 単語 → 例文全文の順で読み上げ(音声で記憶を定着)
  const ex=plainEn(pickEx(current,state.cards[current.id]||{}).html);
  speak(current.word+". "+ex);
}
/* ---- モード用ヘルパー ---- */
let mode="kinfure";
function pickEx(c,cs){return c.ex[((cs&&cs.reps)||0)%c.ex.length];}
function plainEn(html){return html.replace(/<[^>]+>/g,"");}
function blankEn(html){return html.replace(/<b>[^<]*<\/b>/,'<span class="blank">?</span>');}
document.querySelectorAll(".mode-btn").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".mode-btn").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");mode=b.dataset.m;renderStudy();
  if(mode==="listen"&&current)speak(plainEn(pickEx(current,state.cards[current.id]||{}).html));
}));

/* ---- 評価と取り消し(Undo) ---- */
let lastAction=null;
async function rate(g){
  const now=Date.now();
  const id=current.id;
  const prev=state.cards[id];
  const wasNew=!(prev&&prev.reps);
  const d=today();
  lastAction={
    id:id,card:current,
    prevCard:prev?Object.assign({},prev):undefined,
    dayKey:d,wasNew:wasNew,wasOk:g>=3,wasAgain:g===1,
    sessionTotalPrev:sessionTotal
  };
  state.cards[id]=schedule(prev||{},g,now);
  if(!state.log[d])state.log[d]={n:0,ok:0,newN:0};
  state.log[d].n++;if(g>=3)state.log[d].ok++;
  if(wasNew)state.log[d].newN=(state.log[d].newN||0)+1;
  queue.shift();
  if(g===1){queue.splice(Math.min(3,queue.length),0,current);sessionTotal++;}
  await saveState();
  renderStudy();renderHeader();
  showToast("評価を記録しました",{actionLabel:"取り消し",onAction:undoRate,duration:5000});
}
async function undoRate(){
  if(!lastAction)return;
  const a=lastAction;lastAction=null;
  if(a.prevCard)state.cards[a.id]=a.prevCard;else delete state.cards[a.id];
  const lg=state.log[a.dayKey];
  if(lg){
    lg.n=Math.max(0,lg.n-1);
    if(a.wasOk)lg.ok=Math.max(0,lg.ok-1);
    if(a.wasNew)lg.newN=Math.max(0,(lg.newN||0)-1);
  }
  if(a.wasAgain){const i=queue.indexOf(a.card);if(i>=0)queue.splice(i,1);}
  queue.unshift(a.card);
  sessionTotal=a.sessionTotalPrev;
  await saveState();
  renderStudy();renderHeader();
}
function restartSession(){buildQueue();renderStudy();}

/* ================= 統計画面 ================= */
function renderHeader(){
  let streak=0;const d=new Date();
  for(;;){const k=dateKey(d);
    if(state.log[k]&&state.log[k].n>0){streak++;d.setDate(d.getDate()-1);}
    else if(k===today()){d.setDate(d.getDate()-1);}   // 今日未学習でも昨日から数える
    else break;}
  $("#streakBadge").textContent="◉ "+streak+" DAY STREAK";
}
function renderStats(){
  const t=state.log[today()]||{n:0,ok:0};
  $("#stToday").textContent=t.n;
  $("#stAcc").textContent=t.n?Math.round(t.ok/t.n*100)+"%":"–";
  $("#stTotal").textContent=Object.values(state.log).reduce((a,v)=>a+v.n,0);
  const counts={new:0,learning:0,review:0};
  CARDS.forEach(c=>{const cs=state.cards[c.id];
    counts[!cs?"new":(cs.state==="review"?"review":"learning")]++;});
  $("#stKnown").textContent=counts.review;
  // 7日バー
  let max=1;const days=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);
    const n=(state.log[dateKey(d)]||{}).n||0;
    max=Math.max(max,n);days.push([d.getDate(),n]);}
  $("#weekBars").innerHTML=days.map(([lbl,n])=>
    `<div class="bar-col"><div class="bar" style="height:${n/max*100}%"></div><small>${lbl}</small></div>`).join("");
  // 習得状況バー
  const total=CARDS.length||1;
  $("#stateRow").innerHTML=
    `<div style="width:${counts.new/total*100}%;background:rgba(232,220,192,.15)"></div>
     <div style="width:${counts.learning/total*100}%;background:var(--rose)"></div>
     <div style="width:${counts.review/total*100}%;background:var(--teal)"></div>`;
  // ヒートマップ 35日
  let cells="";
  for(let i=34;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);
    const n=(state.log[dateKey(d)]||{}).n||0;
    const lv=n===0?"":n<5?"h1":n<15?"h2":n<30?"h3":"h4";
    cells+=`<div class="heat-cell ${lv}" title="${d.getMonth()+1}/${d.getDate()}: ${n}回"></div>`;}
  $("#heatGrid").innerHTML=cells;
}

/* ================= 単語帳画面 ================= */
let levelFilter=0;                 // 0=ALL / 1〜3=レベル絞り込み
const LIST_LIMIT=200;
function renderList(){
  const q=($("#searchBox").value||"").toLowerCase();
  const items=CARDS.filter(c=>{
    if(levelFilter&&c.level!==levelFilter)return false;
    if(!q)return true;
    return c.word.toLowerCase().includes(q)||c.ja.includes(q)||
      (c.en||"").toLowerCase().includes(q)||
      (c.syn||[]).some(s=>s.toLowerCase().includes(q));
  });
  const shown=items.slice(0,LIST_LIMIT);
  let html=shown.map(c=>{const cs=state.cards[c.id];
    const st=!cs?["WISHLIST","b-new"]:(cs.state==="review"?["SHELVED","b-review"]:["IN CRATE","b-learn"]);
    const due=cs?new Date(cs.due):null;
    const dueTxt=cs?(cs.due<=Date.now()?"期日到来":`${due.getMonth()+1}/${due.getDate()}`):"";
    const sub=[LEVEL_SHORT[c.level]||"",dueTxt].filter(Boolean).join(" · ");
    return `<div class="word-item">
      <div class="wi-emoji">${c.emoji.slice(0,2)}</div>
      <div class="wi-main"><div class="wi-word">${c.word}</div>
      <div class="wi-mean">${c.ja}</div></div>
      <div style="text-align:right"><span class="badge ${st[1]}">${st[0]}</span>
      <div style="font-size:10px;color:var(--label-dim);margin-top:3px">${sub}</div></div>
    </div>`;}).join("");
  if(items.length>LIST_LIMIT)html+=`<p class="list-note">他 ${items.length-LIST_LIMIT} 件 — 検索で絞り込んでください</p>`;
  $("#wordList").innerHTML=html||`<p class="list-note">該当する単語がありません</p>`;
}
let searchTimer=null;
$("#searchBox").addEventListener("input",()=>{
  clearTimeout(searchTimer);searchTimer=setTimeout(renderList,200);
});
document.querySelectorAll(".lv-chip").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".lv-chip").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  levelFilter=+b.dataset.lv;
  renderList();
}));

/* ================= タブ切替・初期化 ================= */
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  $("#scr-"+b.dataset.scr).classList.add("active");
  if(b.dataset.scr==="stats")renderStats();
  if(b.dataset.scr==="list")renderList();
}));

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    const hadController=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      if(!hadController)return;   // 初回インストール時は通知しない
      showToast("アプリが更新されました",{actionLabel:"再読み込み",onAction:()=>location.reload(),duration:8000});
    });
  });
}

(async()=>{
  await loadCards();
  await loadState();
  buildQueue();
  renderHeader();
  renderStudy();
  if(typeof speechSynthesis!=="undefined")speechSynthesis.getVoices(); // 音声リスト事前ロード
})();
