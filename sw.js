self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  // Nécessaire pour valider le critère d'installation Chrome PWA
});
