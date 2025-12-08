self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// No custom caching logic – we just want it to be installable
self.addEventListener("fetch", () => {});
