// public/sw.js
self.addEventListener('install', (event) => {
    self.skipWaiting(); 
});

self.addEventListener('fetch', (event) => {
    // ต้องมี fetch handler ไว้เพื่อให้เบราว์เซอร์ยอมรับว่าเป็น PWA
    event.respondWith(fetch(event.request));
});