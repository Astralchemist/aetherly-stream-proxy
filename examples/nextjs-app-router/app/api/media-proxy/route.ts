import { createStreamProxyHandler } from 'aetherly-stream-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const { GET, HEAD, OPTIONS } = createStreamProxyHandler({
  pathPrefix: '/api/media-proxy',
});
