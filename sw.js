// Offline support: network first (so updates show), cache fallback when offline.
const C='ttr-v3',F=['./','index.html','logic.js','game.js','manifest.json','apple-touch-icon.png','icon-192.png','icon-512.png','icon-maskable-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(F)))});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x))))));
self.addEventListener('fetch',e=>e.respondWith(fetch(e.request).then(r=>{if(!r.ok||e.request.method!=='GET')return r;const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request))));
