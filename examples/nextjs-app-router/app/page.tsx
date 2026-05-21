'use client';

import { useState } from 'react';
import { buildProxyUrl } from 'aetherly-stream-proxy';

export default function Page() {
  const [streamUrl, setStreamUrl] = useState(
    'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  );
  const [referer, setReferer] = useState('');
  const [proxied, setProxied] = useState<string | null>(null);

  function build() {
    const headers: Record<string, string> = {};
    if (referer) headers.Referer = referer;
    setProxied(buildProxyUrl(streamUrl, headers));
  }

  return (
    <main style={{ maxWidth: 760, margin: '40px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: 28 }}>aetherly-stream-proxy demo</h1>
      <p style={{ color: '#555' }}>
        Paste any HLS (<code>.m3u8</code>) or MP4 URL below. The proxy will fetch it with
        the headers you specify, rewrite manifest segments back through itself, and stream
        the result.
      </p>

      <label style={{ display: 'block', marginTop: 24, fontWeight: 600 }}>
        Stream URL
        <input
          type="url"
          value={streamUrl}
          onChange={(e) => setStreamUrl(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            padding: 8,
            marginTop: 4,
            fontSize: 14,
            border: '1px solid #ccc',
            borderRadius: 4,
          }}
        />
      </label>

      <label style={{ display: 'block', marginTop: 16, fontWeight: 600 }}>
        Referer header to forward (optional)
        <input
          type="text"
          value={referer}
          onChange={(e) => setReferer(e.target.value)}
          placeholder="https://example.com/"
          style={{
            display: 'block',
            width: '100%',
            padding: 8,
            marginTop: 4,
            fontSize: 14,
            border: '1px solid #ccc',
            borderRadius: 4,
          }}
        />
      </label>

      <button
        onClick={build}
        style={{
          marginTop: 16,
          padding: '10px 20px',
          fontSize: 14,
          fontWeight: 600,
          background: '#111',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        Build proxy URL & play
      </button>

      {proxied ? (
        <>
          <p style={{ marginTop: 24, fontFamily: 'monospace', fontSize: 12, color: '#444', wordBreak: 'break-all' }}>
            <strong>Proxy URL:</strong> {proxied}
          </p>
          <video
            key={proxied}
            controls
            autoPlay
            src={proxied}
            style={{ width: '100%', marginTop: 16, background: '#000', borderRadius: 4 }}
          />
        </>
      ) : null}

      <p style={{ marginTop: 40, fontSize: 12, color: '#888' }}>
        Powered by{' '}
        <a href="https://github.com/Astralchemist/aetherly-stream-proxy">
          aetherly-stream-proxy
        </a>
      </p>
    </main>
  );
}
