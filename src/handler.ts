import { copyResponseHeaders, decodeProxyHeaders } from './headers.js';
import { looksLikeHlsManifest, rewriteHlsManifest } from './manifest.js';
import type { StreamProxyOptions } from './types.js';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

export interface StreamProxyHandler {
  GET: (request: Request) => Promise<Response>;
  HEAD: (request: Request) => Promise<Response>;
  OPTIONS: () => Response;
}

/**
 * Build a Web-Fetch-compatible HLS / MP4 media proxy. The returned object can
 * be re-exported directly from a Next.js App Router `route.ts`, mounted on a
 * Hono/Express adapter, or invoked from a Cloudflare Worker `fetch` handler.
 */
export function createStreamProxyHandler(options: StreamProxyOptions = {}): StreamProxyHandler {
  const pathPrefix = options.pathPrefix ?? '/api/media-proxy';
  const allowedHeaderPrefixes = options.allowedHeaderPrefixes;
  const defaultUserAgent = options.defaultUserAgent ?? DEFAULT_USER_AGENT;
  const fetchImpl = options.fetchImpl ?? fetch;

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    const headersParam = url.searchParams.get('h');

    if (!targetUrl) {
      return new Response('Missing url parameter', { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return new Response('Invalid url parameter', { status: 400 });
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return new Response('Unsupported protocol', { status: 400 });
    }

    const forwardHeaders: Record<string, string> = {
      'User-Agent': request.headers.get('user-agent') || defaultUserAgent,
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    const range = request.headers.get('range');
    if (range) forwardHeaders.Range = range;

    for (const [key, value] of Object.entries(
      decodeProxyHeaders(headersParam, allowedHeaderPrefixes),
    )) {
      forwardHeaders[key] = value;
    }

    let upstream: Response;
    try {
      const init: RequestInit & { duplex?: 'half' } = {
        method: request.method,
        headers: forwardHeaders,
        redirect: 'follow',
      };

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = request.body;
        init.duplex = 'half';
      }

      upstream = await fetchImpl(parsed.href, init);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return new Response(`Upstream fetch failed: ${message}`, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    const responseHeaders = copyResponseHeaders(upstream);

    if (request.method === 'HEAD') {
      return new Response(null, { status: upstream.status, headers: responseHeaders });
    }

    if (looksLikeHlsManifest(parsed.href, contentType)) {
      const text = await upstream.text();
      const rewritten = rewriteHlsManifest(text, parsed, headersParam, pathPrefix);
      responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
      return new Response(rewritten, { status: upstream.status, headers: responseHeaders });
    }

    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  }

  return {
    GET: handle,
    HEAD: handle,
    OPTIONS: () =>
      new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Accept, Content-Type',
          'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
        },
      }),
  };
}
