const DEFAULT_SERVER_URL = 'http://localhost:4000';

export function getPublicServerUrl(): string {
  const value = process.env.PUBLIC_SERVER_URL ?? DEFAULT_SERVER_URL;
  return value.replace(/\/+$/, '');
}

/** Derives the WebSocket endpoint from the HTTP base URL. */
export function toWebSocketUrl(httpUrl: string, path: string): string {
  const url = new URL(path, httpUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
