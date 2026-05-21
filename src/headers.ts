const DEFAULT_ALLOWED_HEADER_PREFIXES = ['referer', 'origin', 'user-agent', 'cookie', 'x-'];

export const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
  'content-security-policy',
  'x-frame-options',
]);

function base64UrlEncode(input: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'utf-8').toString('base64url');
  }
  const b64 = btoa(unescape(encodeURIComponent(input)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'base64url').toString('utf-8');
  }
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return decodeURIComponent(escape(atob(padded + pad)));
}

export function encodeProxyHeaders(headers: Record<string, string>): string {
  return base64UrlEncode(JSON.stringify(headers));
}

export function decodeProxyHeaders(
  encoded: string | null,
  allowedPrefixes: string[] = DEFAULT_ALLOWED_HEADER_PREFIXES,
): Record<string, string> {
  if (!encoded) return {};
  try {
    const json = base64UrlDecode(encoded);
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};

    const allowedLower = allowedPrefixes.map((p) => p.toLowerCase());
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'string') continue;
      const lower = key.toLowerCase();
      if (!allowedLower.some((p) => lower === p || lower.startsWith(p))) continue;
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function copyResponseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
    headers.set(key, value);
  });
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'no-store');
  return headers;
}

export function buildProxyUrl(
  targetUrl: string,
  headers: Record<string, string> = {},
  pathPrefix = '/api/media-proxy',
): string {
  const params = new URLSearchParams({ url: targetUrl });
  if (Object.keys(headers).length > 0) {
    params.set('h', encodeProxyHeaders(headers));
  }
  return `${pathPrefix}?${params.toString()}`;
}
