// ============================================================
// Service Worker — Offline Support
// ============================================================
const CACHE_NAME = 'vidyarthi-app-v1.0.0';
const RUNTIME_CACHE = 'vidyarthi-runtime-v1.0.0';

// App shell files — यी पहिलो पटक load हुँदा cache हुनेछन्
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js',
    'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js'
];

// Install — App shell cache गर्ने
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Caching app shell');
                return cache.addAll(APP_SHELL).catch(err => {
                    console.warn('⚠️ Some files failed to cache:', err);
                });
            })
            .then(() => self.skipWaiting())
    );
});

// Activate — पुरानो cache हटाउने
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker activated');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
                        console.log('🗑️ Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch — Cache-first strategy (Firestore बाहेक)
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Firestore requests — NEVER cache (यो Firebase आफैंले manage गर्छ)
    if (url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('firebase') ||
        url.hostname.includes('googleapis.com') ||
        request.method !== 'GET') {
        return; // Browser लाई default handle गर्न दिने
    }
    
    // HTML page — Network first, cache fallback
    if (request.mode === 'navigate' || 
        (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const responseClone = response.clone();
                    caches.open(RUNTIME_CACHE).then((cache) => {
                        cache.put(request, responseClone);
                    });
                    return response;
                })
                .catch(() => caches.match(request).then(r => r || caches.match('./index.html')))
        );
        return;
    }
    
    // बाँकी सबै — Cache first, network fallback
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                // Background मा update गर्ने (stale-while-revalidate)
                fetch(request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(RUNTIME_CACHE).then((cache) => {
                            cache.put(request, networkResponse);
                        });
                    }
                }).catch(() => {});
                
                return cachedResponse;
            }
            
            return fetch(request).then((response) => {
                if (!response || response.status !== 200 || response.type === 'opaque') {
                    return response;
                }
                const responseClone = response.clone();
                caches.open(RUNTIME_CACHE).then((cache) => {
                    cache.put(request, responseClone);
                });
                return response;
            }).catch(() => {
                // Offline fallback
                if (request.destination === 'image') {
                    return caches.match('./icons/icon-192.png');
                }
            });
        })
    );
});

// Message — App बाट command लिने
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.keys().then(names => {
            Promise.all(names.map(name => caches.delete(name)));
        });
    }
});