---
title: "Rebuilding the movie-web proxy after it shut down: HLS, headers, and the sandbox-detection trap"
published: false
description: A walk through the gotchas behind a tiny HLS / MP4 media proxy — manifest rewriting, header forwarding, the Cloudflare wall, and why some embed providers detect iframe sandbox attributes and refuse to play.
tags: video, hls, nextjs, opensource
cover_image: ""
---

When [movie-web shut down](https://github.com/movie-web/movie-web) in 2024 under legal pressure, the proxy that powered it went with it. The community immediately fractured into forks — each one independently reinventing the same handful of pieces: an HLS proxy, an iframe ad-guard, a list of working embed providers. Most reinvented them badly.

I'd written all three for [Aetherly](https://github.com/Astralchemist), a private streaming front-end, so over the weekend I extracted them as standalone MIT-licensed packages:

- **[`aetherly-stream-proxy`](https://github.com/Astralchemist/aetherly-stream-proxy)** — zero-dep HLS / MP4 proxy with header forwarding
- **[`aetherly-embed-guard`](https://github.com/Astralchemist/aetherly-embed-guard)** — iframe popup/redirect guard for third-party video providers
- **[`tmdb-embed-providers`](https://github.com/Astralchemist/tmdb-embed-providers)** — typed list of TMDB-id-keyed providers with a probeProvider() health check

The stream-proxy is the load-bearing piece, and it has a surprising number of trapdoors. This post walks through them.

## The naive proxy

If you've never built one, the first attempt always looks like this:

```ts
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url')!;
  const upstream = await fetch(url);
  return new Response(upstream.body, { headers: upstream.headers });
}
```

This works for about 30 seconds, then breaks in five different ways.

## Trapdoor 1: HLS manifests reference segments by relative URL

An HLS playlist looks like this:

```
#EXTM3U
#EXT-X-VERSION:3
#EXTINF:10.0,
segment-001.ts
#EXTINF:10.0,
segment-002.ts
#EXT-X-ENDLIST
```

Your proxy fetches `master.m3u8` and returns it. The browser parses it, then tries to load `segment-001.ts` from your origin — **not** from the original CDN. Result: 404 for every segment.

You have to rewrite every non-comment line back through the proxy:

```ts
function rewriteHlsManifest(text: string, manifestUrl: URL): string {
  return text.split(/\r?\n/).map((line) => {
    if (line.length === 0 || line.startsWith('#')) return line;
    const absolute = new URL(line.trim(), manifestUrl).href;
    return `/api/media-proxy?url=${encodeURIComponent(absolute)}`;
  }).join('\n');
}
```

And the `#`-prefixed lines aren't safe either — `#EXT-X-KEY`, `#EXT-X-MAP`, and `#EXT-X-MEDIA` all carry `URI="..."` attributes for AES keys, init segments, and alternate audio tracks. Miss those and encrypted streams silently fail.

## Trapdoor 2: providers gate playback on Referer / Origin

A lot of embed providers do something like:

```js
if (request.headers.get('referer') !== 'https://expected-domain/') {
  return new Response('Forbidden', { status: 403 });
}
```

The browser cannot send a forged `Referer` — that header is set by the browser based on the page making the request, and CORS will block almost every workaround. So the client tells the proxy which headers to forward, and the proxy attaches them server-side.

The dangerous version of this passes raw header values straight through:

```ts
// Don't do this
const headers = JSON.parse(req.headers.get('x-forward-headers')!);
return fetch(url, { headers });
```

You've just built an open SSRF: anyone can hit your proxy with `Authorization: Bearer ...` headers targeted at any internal service. Gate header forwarding through an allowlist:

```ts
const ALLOWED_HEADER_PREFIXES = ['referer', 'origin', 'user-agent', 'cookie', 'x-'];

function decodeProxyHeaders(encoded: string): Record<string, string> {
  const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString());
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const lower = key.toLowerCase();
    if (!ALLOWED_HEADER_PREFIXES.some((p) => lower === p || lower.startsWith(p))) continue;
    out[key] = String(value);
  }
  return out;
}
```

## Trapdoor 3: upstream `Content-Encoding` will make the browser reject the response

If you copy upstream response headers verbatim, you carry over `Content-Encoding: gzip` (or `br`, or `zstd`). But `fetch()` has *already* decompressed the body — the bytes you're streaming back are plain. The browser sees `Content-Encoding: gzip` on uncompressed bytes and throws `net::ERR_CONTENT_DECODING_FAILED`.

Same problem with `Content-Length` (often wrong after rewriting an `.m3u8`), `Transfer-Encoding`, and the connection-management hop-by-hop set. Strip them:

```ts
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
  'content-encoding', 'content-length',
  'content-security-policy', 'x-frame-options',
]);
```

`content-security-policy` and `x-frame-options` also need to go, otherwise the browser refuses to render your proxied content inside an iframe.

## Trapdoor 4: MP4 seeking requires Range request forwarding

For MP4 streams (which some providers serve instead of HLS), seeking in the `<video>` element works via `Range: bytes=...` requests. If your proxy doesn't forward those, scrubbing breaks.

```ts
const range = req.headers.get('range');
if (range) forwardHeaders.Range = range;
```

You also need to preserve the upstream `206 Partial Content` status and `Content-Range` response header. Most importantly: don't `await response.arrayBuffer()` and re-emit — stream the body through (`new Response(upstream.body, ...)`) so the browser can play before the whole file is buffered.

## Trapdoor 5: the sandbox-detection trap

This one is specific to embed providers, and it's the dumbest of the bunch.

`<iframe sandbox>` is the right tool for embedding third-party video. You add `allow-scripts allow-same-origin allow-forms` and so on, and the browser blocks popups, top-window navigation, and a long list of other ad-injection tricks. Perfect.

Except some providers — `vidfast.pro`, `vidlink.pro`, a couple of others — run this on page load:

```js
if (window.frameElement && window.frameElement.sandbox) {
  document.body.innerHTML = 'Please disable sandbox';
  return;
}
```

If you sandbox them at all, they refuse to play. The "solution" is to maintain an allowlist of *trusted-direct* providers that are rendered with no sandbox attribute, relying on the browser's popup blocker as your only ad mitigation:

```ts
const TRUSTED_DIRECT_HOSTS = ['vidfast.pro', 'vidlink.pro'];

function isTrustedDirect(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return TRUSTED_DIRECT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
```

For everyone else, the reverse-proxy injects a guard script into the upstream HTML that fakes `window.open`, cancels cross-origin clicks, and re-routes `fetch` / `XHR` back through the proxy. That covers ~90% of the ad-injection patterns, but it's an arms race.

## Trapdoor 6: providers rotate domains weekly

Half the providers in any list are dead within a quarter. They get DMCA'd, the domain expires, they migrate to a sibling TLD. The first version of my providers list shipped with `autoembed.cc`, `moviesapi.club`, `vidsrc.icu`, `smashy.stream` — every single one of them had no DNS resolution within 24 hours of release. Even `embed.su`, which I'd been using in production for months, turned out to be dead globally.

The fix isn't to maintain the list more aggressively — it's to ship a runtime probe:

```ts
const result = await probeProvider(provider);
// result.status === 'alive-embed' | 'alive-spa' | 'cf-challenge' | 'http-error' | 'dead'
```

…and have consumers prune their fallback chain at startup or on a cron.

## Trapdoor 7: Cloudflare blocks server-side fetches

Some of the most useful providers (`vidsrc.to`, `vidsrc.cc`, `2embed.cc`, `multiembed.mov`) sit behind Cloudflare with browser-integrity checks turned on. From a real Chrome they work fine. From a server-side `fetch()` they return 403 with a JS challenge page.

You can't reverse-proxy these — the challenge runs in a real browser, and a server-side fetch can't execute it. But they still work as **direct** iframes (because the user's browser passes the challenge naturally). So you need a third tier:

- **Trusted-direct** (sandbox refuses → load with no sandbox, no proxy)
- **Proxied** (proxy with guard script + sandbox)
- **CF-direct** (proxy probe will fail → fall back to direct iframe with sandbox)

The client-side fallback chain tries proxy first, and if the probe returns 403 or JSON (challenge page), it loads the direct sandboxed iframe instead. Slower than ideal, but it's the only thing that works for that tier.

## All the pieces

The three packages are zero-dependency, ESM, typed, and Web-Fetch-API-native — they work in Next.js App Router, Cloudflare Workers, Bun, and Deno without changes. Each is around 150-300 lines.

If you're building a movie-web fork, a self-hosted media frontend, or anything that has to embed third-party video and wants the ad-defense plumbing solved correctly, they're worth ten minutes:

```bash
npm install aetherly-stream-proxy aetherly-embed-guard tmdb-embed-providers
```

Repos:

- https://github.com/Astralchemist/aetherly-stream-proxy
- https://github.com/Astralchemist/aetherly-embed-guard
- https://github.com/Astralchemist/tmdb-embed-providers

PRs welcome, especially provider list maintenance and new framework adapters.
