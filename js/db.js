/* ================= IndexedDB ラッパー(window.storage の代替) ================= */
const IDB_NAME="goi-db";
const IDB_STORE="kv";
function idbOpen(){
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==="undefined"){reject(new Error("indexedDB unavailable"));return;}
    const req=indexedDB.open(IDB_NAME,1);
    req.onupgradeneeded=()=>{req.result.createObjectStore(IDB_STORE);};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function idbGet(key){
  const db=await idbOpen();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_STORE,"readonly");
    const req=tx.objectStore(IDB_STORE).get(key);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function idbSet(key,value){
  const db=await idbOpen();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_STORE,"readwrite");
    tx.objectStore(IDB_STORE).put(value,key);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
