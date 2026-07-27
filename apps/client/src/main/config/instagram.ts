import type { ProxyConfig } from "@autouploader/shared";

/** Optional default Instagram proxy from env (applied when connecting an account). */
export function getInstagramProxyFromEnv(): ProxyConfig | undefined {
  const proxyServer = process.env.INSTAGRAM_PROXY_SERVER;
  if (!proxyServer) {
    return undefined;
  }

  return {
    server: proxyServer,
    username: process.env.INSTAGRAM_PROXY_USERNAME || undefined,
    password: process.env.INSTAGRAM_PROXY_PASSWORD || undefined,
  };
}
