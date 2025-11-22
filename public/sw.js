// Simple Service Worker for PWA installability
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    // Network-only strategy for dynamic content
    event.respondWith(fetch(event.request));
});
