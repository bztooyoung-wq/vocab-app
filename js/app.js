/* ================= 単語データ(data/words.json を読み込み) ================= */
let CARDS=[];
function highlightWord(en,word){
  const base=word.toLowerCase().split(" ")[0].replace(/e$/,"");
  const stem=base.slice(0,Math.max(3,Math.min(base.length,5)));
  const re=new RegExp("\\b("+stem+"\\w*)\\b","i");
  return re.test(en)?en.replace(re,"<b>$1</b>"):en;
}
function normalizeCard(raw){
  return Object.assign({},raw,{
    pron:raw.pronunciation,
    ja:raw.meaning_ja,
    en:raw.meaning_en,
    syn:raw.synonyms,
    ex:raw.examples.map(e=>[highlightWord(e.en,raw.word),e.ja])
  });
}
async function loadCards(){
  try{
    const res=await fetch("data/words.json",{cache:"no-cache"});
    const raw=await res.json();
    CARDS=raw.map(normalizeCard);
  }catch(e){
    console.error("単語データの読み込みに失敗しました",e);
    CARDS=[];
  }
}

/* ================= 状態管理(IndexedDB / メモリフォールバック) ================= */
const KEY="goi-proto-v1";
let state={cards:{},log:{}};          // log: {"YYYY-MM-DD":{n:回数,ok:正解数}}
let storageOk=false;
const today=()=>new Date().toISOString().slice(0,10);
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
      <p>${noData?"単語データを読み込めませんでした。オンライン環境で一度アプリを開いてください。":(done?`今日は ${done} トラック再生しました。<br>明日の棚には次のセッションが並んでいます。`:"今日のセッションを始めましょう。")}</p>
      <button class="primary-btn" onclick="restartSession()">キューを再確認</button>
      <div class="save-note">${storageOk?"✓ 進捗は自動保存されます":"⚠ この環境では進捗はセッション内のみ保持"}</div>
    </div>`;
    return;
  }
  current=queue[0];revealed=false;
  const cs=state.cards[current.id]||{};
  const isNew=!cs.reps;
  const trackNo=String((sessionTotal-queue.length)+1).padStart(2,"0");
  const tagHtml=`<span class="card-tag ${isNew?"new":""}">${isNew?"NEW":"REVIEW"}</span>`;
  const exPair=pickEx(current,cs);          // レビュー回数で例文をローテーション
  const exPlain=plainEn(exPair[0]);
  let front="";
  if(mode==="kinfure"){
    front=`
      <div class="card-front-extra">
        <div class="player-row">
          <div class="record record--sm" id="record"><div class="tonearm" id="tonearm"></div></div>
          <div class="trackinfo">
            <div class="lbl">${tagHtml}&nbsp;SIDE A · TRACK ${trackNo}</div>
            <div class="quiz-ja">${exPair[1]}</div>
          </div>
        </div>
        <div class="quiz-en">${blankEn(exPair[0])}</div>
        <div class="ctrl-row">
          <button class="ctrl-btn" onclick="event.stopPropagation();speak('${escQ(exPlain)}')">▶ PLAY TRACK</button>
          <button class="hint-btn" id="hintBtn"
            onclick="event.stopPropagation();this.textContent='💡 ${current.word[0]}… (${current.word.length}文字)'">HINT</button>
        </div>
      </div>`;
  }else if(mode==="listen"){
    front=`
      <div class="card-front-extra" style="text-align:center">
        <div class="lbl" style="margin-bottom:12px">${tagHtml}&nbsp;SIDE A · TRACK ${trackNo}</div>
        <div class="record record--lg" id="record"><div class="tonearm" id="tonearm"></div></div>
        <div class="listen-note">針を落として、聞こえてくる単語と<br>その意味を思い出してください</div>
        <div class="ctrl-row"><button class="ctrl-btn" onclick="event.stopPropagation();speak('${escQ(exPlain)}')">▶ PLAY AGAIN</button></div>
      </div>`;
  }else{
    front=`
      <div class="card-front-extra now-playing">
        <div class="lbl" style="margin-bottom:12px">${tagHtml}&nbsp;SIDE A · TRACK ${trackNo}</div>
        <div class="record record--lg" id="record"><div class="tonearm" id="tonearm"></div></div>
        <div class="now-playing-word">${current.word}</div>
        <div class="now-playing-pron">${current.pron} · ${current.pos.toUpperCase()} ${current.emoji}</div>
        <div class="ctrl-row"><button class="ctrl-btn" onclick="event.stopPropagation();speak('${escQ(current.word)}')">▶ PLAY TRACK</button></div>
      </div>`;
  }
  area.innerHTML=`
    <div class="sleeve" id="fc" onclick="reveal()">
      ${front}
      <div class="card-back">
        <div class="big-word">${current.word}</div>
        <div class="big-pron">${current.pron} · ${current.pos.toUpperCase()} <span style="margin-left:4px">${current.emoji}</span></div>
        <div class="readout">
          <div class="k">TITLE (JA)</div><div class="v jp">${current.ja}</div>
          <div class="k">LINER NOTES</div><div class="v sub">${current.en}</div>
        </div>
        <div class="sect">TRACKLIST</div>
        ${current.ex.map((e,i)=>`<div class="example"><div class="no">A${i+1}</div><div style="flex:1"><div class="en">${e[0]}
          <button class="speak-mini" onclick="event.stopPropagation();speak('${e[0].replace(/<[^>]+>/g,"").replace(/'/g,"\\'")}')">▶</button></div>
          <div class="ja">${e[1]}</div></div></div>`).join("")}
        <div class="sect">ALSO PRESSED AS</div>
        <div class="chips">${current.syn.map(s=>`<span class="chip">${s}</span>`).join("")}</div>
      </div>
      <div class="tap-hint" id="tapHint">${mode==="card"?"タップしてライナーノーツを表示":"思い出したらタップして針を落とす"}</div>
    </div>
    <div class="rating" id="rating">
      <button class="rate-btn rate-again" onclick="rate(1)"><b>POOR</b><small>${previewIvl(cs,1)}</small></button>
      <button class="rate-btn rate-hard" onclick="rate(2)"><b>GOOD</b><small>${previewIvl(cs,2)}</small></button>
      <button class="rate-btn rate-good" onclick="rate(3)"><b>VG+</b><small>${previewIvl(cs,3)}</small></button>
      <button class="rate-btn rate-easy" onclick="rate(4)"><b>MINT</b><small>${previewIvl(cs,4)}</small></button>
    </div>`;
  if(mode==="listen")setTimeout(()=>speak(exPlain),350);   // リスニングは自動再生
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
  const ex=plainEn(pickEx(current,state.cards[current.id]||{})[0]);
  speak(current.word+". "+ex);
}
/* ---- モード用ヘルパー ---- */
let mode="kinfure";
function pickEx(c,cs){return c.ex[((cs&&cs.reps)||0)%c.ex.length];}
function plainEn(html){return html.replace(/<[^>]+>/g,"");}
function blankEn(html){return html.replace(/<b>[^<]*<\/b>/,'<span class="blank">?</span>');}
function escQ(s){return s.replace(/'/g,"\\'");}
document.querySelectorAll(".mode-btn").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".mode-btn").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");mode=b.dataset.m;renderStudy();
  if(mode==="listen"&&current)speak(plainEn(pickEx(current,state.cards[current.id]||{})[0]));
}));
async function rate(g){
  const now=Date.now();
  const prev=state.cards[current.id]||{};
  const wasNew=!prev.reps;
  state.cards[current.id]=schedule(prev,g,now);
  const d=today();
  if(!state.log[d])state.log[d]={n:0,ok:0,newN:0};
  state.log[d].n++;if(g>=3)state.log[d].ok++;
  if(wasNew)state.log[d].newN=(state.log[d].newN||0)+1;
  queue.shift();
  if(g===1){queue.splice(Math.min(3,queue.length),0,current);sessionTotal++;}
  await saveState();
  renderStudy();renderHeader();
}
function restartSession(){buildQueue();renderStudy();}

/* ================= 統計画面 ================= */
function renderHeader(){
  let streak=0;const d=new Date();
  for(;;){const k=d.toISOString().slice(0,10);
    if(state.log[k]&&state.log[k].n>0){streak++;d.setDate(d.getDate()-1);}
    else if(k===today()){d.setDate(d.getDate()-1);}   // 今日未学習でも昨日から数える
    else break;}
  $("#streakBadge").textContent="◉ "+streak+" SPINS";
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
  const bars=[];let max=1;const days=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);
    const k=d.toISOString().slice(0,10);const n=(state.log[k]||{}).n||0;
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
    const n=(state.log[d.toISOString().slice(0,10)]||{}).n||0;
    const lv=n===0?"":n<5?"h1":n<15?"h2":n<30?"h3":"h4";
    cells+=`<div class="heat-cell ${lv}" title="${d.getMonth()+1}/${d.getDate()}: ${n}回"></div>`;}
  $("#heatGrid").innerHTML=cells;
}

/* ================= 単語帳画面 ================= */
function renderList(){
  const q=($("#searchBox").value||"").toLowerCase();
  $("#wordList").innerHTML=CARDS
    .filter(c=>!q||c.word.includes(q)||c.ja.includes(q))
    .map(c=>{const cs=state.cards[c.id];
      const st=!cs?["WISHLIST","b-new"]:(cs.state==="review"?["SHELVED","b-review"]:["IN CRATE","b-learn"]);
      const due=cs?new Date(cs.due):null;
      const dueTxt=cs?(cs.due<=Date.now()?"期日到来":`${due.getMonth()+1}/${due.getDate()}`):"";
      return `<div class="word-item">
        <div class="wi-emoji">${c.emoji.slice(0,2)}</div>
        <div class="wi-main"><div class="wi-word">${c.word}</div>
        <div class="wi-mean">${c.ja}</div></div>
        <div style="text-align:right"><span class="badge ${st[1]}">${st[0]}</span>
        <div style="font-size:10px;color:var(--label-dim);margin-top:3px">${dueTxt}</div></div>
      </div>`;}).join("")||`<p style="text-align:center;color:var(--label-dim);font-size:13px;margin-top:30px">該当する単語がありません</p>`;
}

/* ================= タブ切替・初期化 ================= */
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  $("#scr-"+b.dataset.scr).classList.add("active");
  if(b.dataset.scr==="stats")renderStats();
  if(b.dataset.scr==="list")renderList();
}));
$("#searchBox").addEventListener("input",renderList);
window.reveal=reveal;window.rate=rate;window.speak=speak;window.restartSession=restartSession;

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
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
