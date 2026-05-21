export interface StreamProxyOptions {
  /**
   * URL path where this proxy is mounted. Used to rewrite HLS manifest entries
   * so segments are also routed back through the proxy.
   *
   * @default "/api/media-proxy"
   */
  pathPrefix?: string;

  /**
   * Header names (or prefixes) the client is allowed to forward to upstream via
   * the `h` query parameter. Matching is case-insensitive: a value matches if
   * the incoming header name equals the entry, or starts with it.
   *
   * @default ["referer", "origin", "user-agent", "cookie", "x-"]
   */
  allowedHeaderPrefixes?: string[];

  /**
   * Fallback User-Agent if the incoming request did not carry one.
   */
  defaultUserAgent?: string;

  /**
   * Override the global `fetch` (e.g. to inject a custom HTTPS agent on Node,
   * to add request logging, or to inject test doubles).
   */
  fetchImpl?: typeof fetch;
}

export interface BuildProxyUrlInput {
  /** Absolute target URL. */
  targetUrl: string;
  /** Optional per-request headers to forward upstream. */
  headers?: Record<string, string>;
  /** Where the proxy is mounted. Defaults to "/api/media-proxy". */
  pathPrefix?: string;
}
