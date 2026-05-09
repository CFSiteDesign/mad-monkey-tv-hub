const CACHE_NAME = "mad-monkey-tv-media-v1";
const SERVICE_WORKER_URL = "/tv-media-cache-sw.js";

export type MediaCacheStatus = {
  total: number;
  cached: number;
  active: boolean;
};

export async function registerMediaCacheWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    await navigator.storage?.persist?.();
    await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
    await navigator.serviceWorker.ready;
    return true;
  } catch {
    return false;
  }
}

export async function cacheMediaFiles(
  urls: string[],
  onProgress?: (status: MediaCacheStatus) => void,
) {
  if (typeof window === "undefined" || !("caches" in window)) {
    onProgress?.({ total: urls.length, cached: 0, active: false });
    return;
  }

  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
  const cache = await caches.open(CACHE_NAME);
  const keep = new Set(uniqueUrls);
  let cached = 0;

  for (const request of await cache.keys()) {
    if (!keep.has(request.url)) await cache.delete(request);
  }

  for (const url of uniqueUrls) {
    const existing = await cache.match(url, { ignoreVary: true });
    if (existing) cached += 1;
  }
  onProgress?.({ total: uniqueUrls.length, cached, active: cached < uniqueUrls.length });

  for (const url of uniqueUrls) {
    if (await cache.match(url, { ignoreVary: true })) continue;
    try {
      const response = await fetch(url, { mode: "cors", credentials: "omit", cache: "reload" });
      if (response.ok || response.type === "opaque") {
        await cache.put(url, response.clone());
        cached += 1;
        onProgress?.({ total: uniqueUrls.length, cached, active: cached < uniqueUrls.length });
      }
    } catch {
      onProgress?.({ total: uniqueUrls.length, cached, active: cached < uniqueUrls.length });
    }
  }

  onProgress?.({ total: uniqueUrls.length, cached, active: false });
}

export async function createCachedMediaObjectUrl(url: string) {
  if (typeof window === "undefined" || !("caches" in window)) return url;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url, { ignoreVary: true });
  if (!cached) return url;
  const blob = await cached.blob();
  return blob.size ? URL.createObjectURL(blob) : url;
}
