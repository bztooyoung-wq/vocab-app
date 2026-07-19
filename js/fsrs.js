/* ================= FSRS(簡易実装・デフォルトパラメータ) ================= */
const W=[0.4872,1.4003,3.7145,13.8206,5.1618,1.2298,0.8975,0.031,1.6474,0.1367,1.0461,2.1072,0.0793,0.3246,1.587,0.2272,2.8755];
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const initS=g=>W[g-1];
const initD=g=>clamp(W[4]-(g-3)*W[5],1,10);
function nextD(d,g){const nd=d-W[6]*(g-3);return clamp(W[7]*initD(4)+(1-W[7])*nd,1,10);}
function retr(t,s){return Math.pow(1+t/(9*s),-1);}
function nextS(d,s,r,g){
  if(g===1){return clamp(W[11]*Math.pow(d,-W[12])*(Math.pow(s+1,W[13])-1)*Math.exp(W[14]*(1-r)),0.1,s);}
  let mod=Math.exp(W[8])*(11-d)*Math.pow(s,-W[9])*(Math.exp(W[10]*(1-r))-1);
  if(g===2)mod*=W[15]; if(g===4)mod*=W[16];
  return s*(1+mod);
}
function schedule(cs,g,now){
  const t=cs.due?Math.max(0,(now-cs.lastReview)/86400000):0;
  let d,s;
  if(!cs.reps){d=initD(g);s=initS(g);}
  else{const r=retr(t,cs.stability);d=nextD(cs.difficulty,g);s=nextS(cs.difficulty,cs.stability,r,g);}
  let ivl;
  if(g===1)ivl=0;                       // 同セッション内で再出題
  else if(!cs.reps&&g===2)ivl=0.5;      // 12時間後
  else ivl=Math.max(1,Math.round(s));   // R=0.9 目安 → 安定度日数
  return {difficulty:d,stability:s,reps:(cs.reps||0)+1,lapses:(cs.lapses||0)+(g===1?1:0),
    lastReview:now,due:now+ivl*86400000,state:g===1?"learning":(cs.reps?"review":"learning")};
}
function previewIvl(cs,g){
  const r=schedule(cs,g,Date.now());const d=(r.due-Date.now())/86400000;
  if(d<0.02)return"すぐ";if(d<1)return Math.round(d*24)+"h";
  if(d<30)return Math.round(d)+"d";return(d/30).toFixed(1)+"mo";
}
