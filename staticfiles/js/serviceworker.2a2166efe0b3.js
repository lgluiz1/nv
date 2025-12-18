var staticCacheName = "django-pwa-v" + new Date().getTime();
var filesToCache = [
    '/app/',
    '/static/css/bootstrap.min.css',
    '/static/js/authFetch.js',
    '/static/js/manifesto.js',
    // Adicione aqui outros arquivos estáticos essenciais
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