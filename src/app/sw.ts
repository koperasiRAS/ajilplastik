import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkOnly } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope;

const customCache = defaultCache.filter(
  (entry) => {
    if (typeof entry === 'object' && entry !== null && 'urlPattern' in entry) {
      const urlPattern = entry.urlPattern;
      if (urlPattern instanceof RegExp) {
        if (urlPattern.source.includes('supabase.co')) return false;
      }
    }
    return true;
  }
);

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url }) => url.hostname.includes('supabase.co'),
      handler: new NetworkOnly(),
    },
    ...customCache,
  ],
});

serwist.addEventListeners();
