const MEDIA_CACHE_NAME = "mad-monkey-tv-media-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function cachedMediaResponse(request) {
  const cache = await caches.open(MEDIA_CACHE_NAME);
  const cached = await cache.match(request.url, { ignoreVary: true });
  if (!cached) return fetch(request);

  const range = request.headers.get("range");
  if (!range) return cached;

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  if (!match) return cached;

  const blob = await cached.blob();
  const size = blob.size;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || end < start) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  const body = blob.slice(start, end + 1);
  return new Response(body, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(body.size),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Type": cached.headers.get("Content-Type") || "application/octet-stream",
    },
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(cachedMediaResponse(event.request));
});