const CACHE = "chess-offline-v2";
const ASSETS = [
  "./","./index.html","./styles.css","./app.js","./engine-worker.js","./manifest.json"
];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE?null:caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e=>{
  e.respondWith(
    caches.match(e.request).then(cached=>{
      if (cached) return cached;
      return fetch(e.request).then(res=>{
        if (e.request.method==="GET"){
          try{
            const url=new URL(e.request.url);
            if (url.origin===location.origin || /cdn.jsdelivr|unpkg\.com|githubusercontent|github/.test(url.host)){
              const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request, copy));
            }
          }catch{}
        }
        return res;
      }).catch(()=> e.request.mode==="navigate" ? caches.match("./index.html") : undefined)
    })
  );
});
