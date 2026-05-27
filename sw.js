// Service Worker désactivé intentionnellement — ChassNid v1.0
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
