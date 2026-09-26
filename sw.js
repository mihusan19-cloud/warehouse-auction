const CACHE_NAME = 'warehouse-auction-v39';
const CORE = ['./', './index.html', './manifest.json', './css/main.css', './css/home.css', './css/game.css', './css/encyclopedia.css', './css/showroom.css', './css/mobile.css', './css/animation.css', './css/popup.css', './css/theme.css', './js/app.js', './js/router.js', './js/settings.js', './js/save.js', './js/achievements.js', './js/utils/storage.js', './js/utils/audio.js', './js/game/auction.js', './js/game/bidderView.js', './js/game/warehouse.js', './js/game/clue.js', './js/game/round.js', './js/game/bid.js', './js/game/animation.js', './js/ai/aiEngine.js', './js/encyclopedia/encyclopedia.js', './js/inventory/backpack.js', './js/inventory/sell.js', './js/inventory/income.js', './js/inventory/showroom.js', './data/items.json', './data/qualities.json', './data/ai.json', './data/achievements.json', './data/warehouseTemplates.json', './data/auctionConditions.json', './data/auctionMeta.json', './data/showroomConfig.json', './data/gameConfig.json'];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(async (response) => {
    if (response.ok) {
      const copy = response.clone();
      try { await (await caches.open(CACHE_NAME)).put(event.request, copy); } catch { /* Keep the live response usable if storage is unavailable. */ }
    }
    return response;
  }).catch(async () => (await caches.match(event.request, { ignoreSearch: true })) || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
