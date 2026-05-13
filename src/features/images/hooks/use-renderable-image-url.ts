import { useEffect, useState } from "react";

import { isLikelyFilePath, readManagedImageBytes } from "@/features/project/persistence/project-io";
import { hasTauriRuntime } from "@/features/project/persistence/tauri-runtime";

const MAX_RENDERABLE_IMAGE_CACHE_SIZE = 96;
const MAX_RENDERABLE_IMAGE_ELEMENT_CACHE_SIZE = 64;
const DEFAULT_PRELOAD_CONCURRENCY = 3;

interface CachedRenderableImageUrl {
  url: string;
  objectUrl: string | null;
  lastUsed: number;
}

interface CachedRenderableImageElement {
  image: HTMLImageElement;
  lastUsed: number;
}

const renderableImageUrlCache = new Map<string, CachedRenderableImageUrl>();
const pendingRenderableImageUrls = new Map<string, Promise<string>>();
const renderableImageElementCache = new Map<string, CachedRenderableImageElement>();
const pendingRenderableImageElements = new Map<string, Promise<HTMLImageElement | null>>();
let renderableImageUrlCacheClock = 0;
let renderableImageElementCacheClock = 0;

function touchCachedRenderableImage(source: string, entry: CachedRenderableImageUrl) {
  entry.lastUsed = ++renderableImageUrlCacheClock;
  renderableImageUrlCache.set(source, entry);
}

function trimRenderableImageUrlCache() {
  if (renderableImageUrlCache.size <= MAX_RENDERABLE_IMAGE_CACHE_SIZE) {
    return;
  }

  const entries = [...renderableImageUrlCache.entries()]
    .filter(
      ([source]) =>
        !pendingRenderableImageUrls.has(source) &&
        !pendingRenderableImageElements.has(source) &&
        !renderableImageElementCache.has(source),
    )
    .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);
  const trimCount = renderableImageUrlCache.size - MAX_RENDERABLE_IMAGE_CACHE_SIZE;

  for (const [source, entry] of entries.slice(0, trimCount)) {
    renderableImageUrlCache.delete(source);

    if (entry.objectUrl) {
      URL.revokeObjectURL(entry.objectUrl);
    }
  }
}

function touchCachedRenderableImageElement(source: string, entry: CachedRenderableImageElement) {
  entry.lastUsed = ++renderableImageElementCacheClock;
  renderableImageElementCache.set(source, entry);
}

function trimRenderableImageElementCache() {
  if (renderableImageElementCache.size <= MAX_RENDERABLE_IMAGE_ELEMENT_CACHE_SIZE) {
    return;
  }

  const entries = [...renderableImageElementCache.entries()]
    .filter(([source]) => !pendingRenderableImageElements.has(source))
    .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);
  const trimCount = renderableImageElementCache.size - MAX_RENDERABLE_IMAGE_ELEMENT_CACHE_SIZE;

  for (const [source] of entries.slice(0, trimCount)) {
    renderableImageElementCache.delete(source);
  }
}

async function createRenderableImageUrl(source: string) {
  if (hasTauriRuntime() && isLikelyFilePath(source)) {
    const bytes = await readManagedImageBytes(source);
    return URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
  }

  return source;
}

export async function resolveRenderableImageUrl(source: string) {
  if (!source) {
    return "";
  }

  const cached = renderableImageUrlCache.get(source);

  if (cached) {
    touchCachedRenderableImage(source, cached);
    return cached.url;
  }

  const pending = pendingRenderableImageUrls.get(source);

  if (pending) {
    return pending;
  }

  const pendingUrl = createRenderableImageUrl(source)
    .then((url) => {
      const entry: CachedRenderableImageUrl = {
        url,
        objectUrl: url === source ? null : url,
        lastUsed: ++renderableImageUrlCacheClock,
      };

      renderableImageUrlCache.set(source, entry);
      trimRenderableImageUrlCache();

      return url;
    })
    .finally(() => {
      pendingRenderableImageUrls.delete(source);
    });

  pendingRenderableImageUrls.set(source, pendingUrl);

  return pendingUrl;
}

export function getCachedRenderableImageElement(source: string) {
  const cached = renderableImageElementCache.get(source);

  if (!cached) {
    return null;
  }

  touchCachedRenderableImageElement(source, cached);
  return cached.image;
}

export async function loadRenderableImageElement(source: string) {
  if (!source || typeof window === "undefined") {
    return null;
  }

  const cached = getCachedRenderableImageElement(source);

  if (cached) {
    return cached;
  }

  const pending = pendingRenderableImageElements.get(source);

  if (pending) {
    return pending;
  }

  const pendingImage = (async () => {
    let url = source;

    try {
      url = await resolveRenderableImageUrl(source);
    } catch {
      url = source;
    }

    if (!url) {
      return null;
    }

    return new Promise<HTMLImageElement | null>((resolve) => {
      const image = new window.Image();

      image.crossOrigin = "anonymous";
      image.onload = () => {
        touchCachedRenderableImageElement(source, {
          image,
          lastUsed: ++renderableImageElementCacheClock,
        });
        trimRenderableImageElementCache();
        resolve(image);
      };
      image.onerror = () => resolve(null);
      image.src = url;
    });
  })().finally(() => {
    pendingRenderableImageElements.delete(source);
  });

  pendingRenderableImageElements.set(source, pendingImage);

  return pendingImage;
}

export async function preloadRenderableImage(source: string) {
  try {
    await loadRenderableImageElement(source);
  } catch {
    // Preloading is a best-effort optimization; visible rendering still falls back normally.
  }
}

export async function preloadRenderableImages(
  sources: string[],
  concurrency = DEFAULT_PRELOAD_CONCURRENCY,
) {
  const uniqueSources = [...new Set(sources)].filter(Boolean);
  let nextIndex = 0;

  const workerCount = Math.max(1, Math.min(concurrency, uniqueSources.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < uniqueSources.length) {
      const source = uniqueSources[nextIndex]!;
      nextIndex += 1;
      await preloadRenderableImage(source);
    }
  });

  await Promise.all(workers);
}

export function useRenderableImageUrl(source: string) {
  const [resolvedSource, setResolvedSource] = useState(source);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      try {
        const url = await resolveRenderableImageUrl(source);

        if (!cancelled) {
          setResolvedSource(url);
        }
      } catch {
        if (!cancelled) {
          setResolvedSource(source);
        }
      }
    };

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [source]);

  return resolvedSource;
}
