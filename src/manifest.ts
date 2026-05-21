import { buildProxyUrl } from './headers.js';

export function looksLikeHlsManifest(url: string, contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes('application/vnd.apple.mpegurl')) return true;
  if (ct.includes('application/x-mpegurl')) return true;
  if (ct.includes('audio/mpegurl')) return true;
  const pathOnly = url.toLowerCase().split('?')[0] ?? '';
  return pathOnly.endsWith('.m3u8');
}

function resolveSegmentUrl(raw: string, manifestUrl: URL): string | null {
  if (!raw) return null;
  try {
    return new URL(raw, manifestUrl).href;
  } catch {
    return null;
  }
}

function rewriteAttributeLine(
  line: string,
  manifestUrl: URL,
  headersParam: string | null,
  pathPrefix: string,
): string {
  return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
    const absolute = resolveSegmentUrl(uri, manifestUrl);
    if (!absolute) return `URI="${uri}"`;
    return `URI="${proxyEntry(absolute, headersParam, pathPrefix)}"`;
  });
}

function proxyEntry(absoluteUrl: string, headersParam: string | null, pathPrefix: string): string {
  if (!headersParam) return buildProxyUrl(absoluteUrl, {}, pathPrefix);
  const params = new URLSearchParams({ url: absoluteUrl, h: headersParam });
  return `${pathPrefix}?${params.toString()}`;
}

/**
 * Rewrite every segment URI and `URI="..."` attribute in a fetched HLS manifest
 * so the player loads them back through this proxy (preserving the per-request
 * header bundle).
 */
export function rewriteHlsManifest(
  text: string,
  manifestUrl: URL,
  headersParam: string | null,
  pathPrefix = '/api/media-proxy',
): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];

  for (const line of lines) {
    if (line.length === 0) {
      out.push(line);
      continue;
    }

    if (line.startsWith('#')) {
      out.push(rewriteAttributeLine(line, manifestUrl, headersParam, pathPrefix));
      continue;
    }

    const absolute = resolveSegmentUrl(line.trim(), manifestUrl);
    if (!absolute) {
      out.push(line);
      continue;
    }
    out.push(proxyEntry(absolute, headersParam, pathPrefix));
  }

  return out.join('\n');
}
