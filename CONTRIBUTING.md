# Contributing

Thanks for considering a contribution.

## Quick setup

```bash
git clone https://github.com/Astralchemist/aetherly-stream-proxy.git
cd aetherly-stream-proxy
npm install
npm run typecheck
npm run build
```

## What this package is (and isn't)

This is a **Web Fetch API native** library. It must run unchanged in:

- Next.js App Router (`runtime = 'nodejs'` or `'edge'`)
- Cloudflare Workers
- Bun
- Deno
- Plain Node.js 18+

That rules out: Node-specific globals (other than `Buffer`, which is feature-detected), the `http` / `https` modules, `fs`, anything that needs a server framework runtime. If you need to add a feature, please write it against the standard `Request` / `Response` / `fetch` API.

## Good first contributions

- **Framework adapters.** A thin adapter for Hono / Elysia / Fastify that wraps `createStreamProxyHandler()` would be welcome.
- **Test coverage.** A handful of unit tests around the HLS manifest rewriter (variant playlists, EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA, absolute vs. relative URIs).
- **Performance.** Streaming the body without buffering for the non-HLS path — currently the response is piped through, but there may be additional opportunities.
- **Documentation.** Real-world examples (Hono, Elysia, plain Node `http`) in `examples/`.

## What probably won't be merged

- Removing the `allowedHeaderPrefixes` allowlist. It's the only thing stopping this becoming an open SSRF.
- Re-enabling `Content-Encoding` / `X-Frame-Options` forwarding. The package strips these intentionally — see the README.
- Tightly coupling to any single framework or HTTP server.

## PR checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] Any new option is documented in the README
- [ ] Commit messages are imperative, descriptive, and under 72 chars on the subject line

## Security disclosures

For security issues, please open a private security advisory on GitHub rather than a public issue.
