var staticCacheName = "django-pwa-v1" + new Date().getTime();
var filesToCache = [
    '/app/',
    '/app/login/', // Adicionei para garantir que o login funcione offline
    '/static/css/app.css',
    '/static/css/login.css',
    // Caminhos corrigidos conforme sua imagem:
    '/static/js/manifesto.js',
    '/static/images/icon-160x160.png',
    '/static/images/icon-512x512.png'
];

// Cache on install
self.addEventListener("install", event => {
    this.skipWaiting();
    event.waitUntil(
        caches.open(staticCacheName)
            .then(cache => {
                return cache.addAll(filesToCache);
            })
    );
});

// Serve from cache
self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});