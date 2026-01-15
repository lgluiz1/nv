// UNIFICADO: Versão única para controle total de cache
const CACHE_NAME = 'fluxo-logistica-v1.16'; // Mude aqui para forçar atualização

const filesToCache = [
    '/app/',
    '/app/login/',
    //'/static/css/app.css?v=1.0.5',
    '/static/css/login.css',
    //'/static/js/manifesto.js?v=1.0.6',
    '/static/images/icon-160x160.png',
    '/static/images/icon-512x512.png'
];

// Instalação: Abre o cache e guarda os arquivos
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Força a nova versão a assumir
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(filesToCache);
        })
    );
});

// Ativação: Deleta QUALQUER cache que não seja a versão atual
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deletando cache antigo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Busca (Fetch): Tenta buscar na rede primeiro para ter dados novos, 
// se falhar (offline), pega do cache.
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});