const CACHE_NAME = "chess-offline-v1";
const ASSETS = [
  "./","./index.html","./styles.css","./app.js","./engine-worker.js","./manifest.json",
  "./lib/chess.min.js"
  // Add Stockfish files if you want them cached:
  // "./engine/stockfish.js","./engine/stockfish.wasm"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener("activate", (e)=>{
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k===CACHE_NAME?null:caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e)=>{
  e.respondWith(
    caches.match(e.request).then(cached=>{
      if (cached) return cached;
      return fetch(e.request).then(resp=>{
        if (e.request.method==="GET"){
          try{
            const url = new URL(e.request.url);
            if (url.origin === location.origin){
              const copy = resp.clone();
              caches.open(CACHE_NAME).then(c=>c.put(e.request, copy));
            }
          }catch{}
        }
        return resp;
      }).catch(()=> e.request.mode==="navigate" ? caches.match("./index.html") : undefined)
    })
  );
});
