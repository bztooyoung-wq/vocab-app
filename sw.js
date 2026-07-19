/* GOI — オフライン対応 Service Worker */
const SHELL_CACHE="goi-shell-v1";
const DATA_CACHE="goi-data-v1";
const SHELL_ASSETS=[
  "./",
  "./index.html",
  "./css/style.css",
  "./js/fsrs.js",
  "./js/db.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable.png"
];

self.addEventListener("install",(event)=>{
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache)=>cache.addAll(SHELL_ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",(event)=>{
  event.waitUntil(
    caches.keys()
      .then((keys)=>Promise.all(
        keys.filter((k)=>k!==SHELL_CACHE&&k!==DATA_CACHE).map((k)=>caches.delete(k))
      ))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",(event)=>{
  const req=event.request;
  const url=new URL(req.url);
  if(req.method!=="GET"||url.origin!==self.location.origin)return;

  if(url.pathname.endsWith("/data/words.json")){
    event.respondWith(networkFirst(req,DATA_CACHE));
    return;
  }
  event.respondWith(cacheFirst(req,SHELL_CACHE));
});

async function cacheFirst(request,cacheName){
  const cached=await caches.match(request);
  if(cached)return cached;
  try{
    const res=await fetch(request);
    if(res&&res.ok)(await caches.open(cacheName)).put(request,res.clone());
    return res;
  }catch(e){
    return cached||Response.error();
  }
}

async function networkFirst(request,cacheName){
  try{
    const res=await fetch(request);
    if(res&&res.ok)(await caches.open(cacheName)).put(request,res.clone());
    return res;
  }catch(e){
    const cached=await caches.match(request);
    if(cached)return cached;
    throw e;
  }
}
