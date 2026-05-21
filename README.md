# aetherly-stream-proxy

[![CI](https://github.com/Astralchemist/aetherly-stream-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/Astralchemist/aetherly-stream-proxy/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/aetherly-stream-proxy.svg)](https://www.npmjs.com/package/aetherly-stream-proxy)
[![npm downloads](https://img.shields.io/npm/dm/aetherly-stream-proxy.svg)](https://www.npmjs.com/package/aetherly-stream-proxy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/aetherly-stream-proxy)](https://bundlephobia.com/package/aetherly-stream-proxy)

Zero-dependency HLS / MP4 media proxy with per-request header forwarding and `.m3u8` manifest rewriting. Built on the Web Fetch API — drop it into a Next.js App Router route, a Cloudflare Worker, a Bun server, or a Hono adapter without changes.

**[Try the live demo →](./examples/nextjs-app-router)** &nbsp;·&nbsp; [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FAstralchemist%2Faetherly-stream-proxy&project-name=aetherly-stream-proxy-demo&repository-name=aetherly-stream-proxy-demo&root-directory=examples%2Fnextjs-app-router)

## Why this exists

When you embed a video stream that gates playback behind specific `Referer` / `Origin` / `Cookie` / `User-Agent` headers, the browser cannot send those itself — and CORS will block almost every direct request anyway. The usual fix is a server-side proxy, but writing one correctly is a surprising amount of trapdoors:

- HLS manifests reference segments by relative URL → each segment must also be rewritten back through the proxy.
- Variant playlists, EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA all carry `URI="..."` attributes that need rewriting too.
- The `Content-Encoding`, `Content-Length`, and `X-Frame-Options` headers from upstream must be stripped, or the browser will reject the response.
- Range requests for MP4 must be forwarded, or seeking breaks.
- Headers the caller wants to forward must be opt-in, or you've built an open SSRF.

This package gets all of that right in ~150 lines and ships with TypeScript types.

## Install

```bash
npm install aetherly-stream-proxy
```

## Use with Next.js App Router

```ts
// app/api/media-proxy/route.ts
import { createStreamProxyHandler } from 'aetherly-stream-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, HEAD, OPTIONS } = createStreamProxyHandler({
  pathPrefix: '/api/media-proxy',
});
```

That's the whole server. To build the URL your `<video>` or `hls.js` should fetch:

```ts
import { buildProxyUrl } from 'aetherly-stream-proxy';

const proxied = buildProxyUrl(
  'https://example.cdn/stream/master.m3u8',
  { Referer: 'https://example.com/', 'User-Agent': 'Mozilla/5.0 ...' },
);
// → /api/media-proxy?url=...&h=eyJSZWZlcmVyIjoi...
```

Point your player at that URL. The proxy fetches the manifest with your forwarded headers, rewrites every segment line so it also flows back through `/api/media-proxy?h=...`, and streams the bytes back to the browser.

## Use with Cloudflare Workers / Bun / Deno

```ts
import { createStreamProxyHandler } from 'aetherly-stream-proxy';

const proxy = createStreamProxyHandler();

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/media-proxy') {
      if (request.method === 'OPTIONS') return proxy.OPTIONS();
      if (request.method === 'HEAD') return proxy.HEAD(request);
      return proxy.GET(request);
    }
    return new Response('Not found', { status: 404 });
  },
};
```

## Options

```ts
createStreamProxyHandler({
  pathPrefix: '/api/media-proxy',          // where this proxy is mounted
  allowedHeaderPrefixes: ['referer', ...], // which client-supplied headers may flow upstream
  defaultUserAgent: 'Mozilla/5.0 ...',     // fallback UA
  fetchImpl: fetch,                        // override for testing / custom agents
});
```

## Security notes

- The `h=` parameter is **client-controlled**. Header forwarding is gated by `allowedHeaderPrefixes` — by default `referer`, `origin`, `user-agent`, `cookie`, and any `x-*`. Anything else is dropped.
- The proxy will follow redirects (`redirect: 'follow'`). If you need to restrict the destinations, wrap `fetchImpl` and validate the resolved URL.
- This proxy intentionally has **no host allowlist** — pair it with [`aetherly-embed-guard`](https://github.com/Astralchemist/aetherly-embed-guard) (or your own check) if you only want a fixed set of upstreams.

## License

MIT
