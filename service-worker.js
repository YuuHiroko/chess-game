const CACHE = "chess-offline-v4";
const SHELL = ["./","./index.html","./styles.css","./app.js","./engine-worker.js","./manifest.json"];
const CDN_RE = /cdn\.jsdelivr\.net|unpkg\.com/;

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE?null:caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e=>{
  const req=e.request;
  e.respondWith(
    caches.match(req).then(cached=>{
      if (cached) return cached;
      return fetch(req).then(res=>{
        if (req.method==="GET"){
          try{
            const u=new URL(req.url);
            if (u.origin===location.origin || CDN_RE.test(u.host)){
              const copy=res.clone(); caches.open(CACHE).then(c=>c.put(req, copy));
            }
          }catch{}
        }
        return res;
      }).catch(()=> req.mode==="navigate" ? caches.match("./index.html") : undefined)
    })
  );
});
