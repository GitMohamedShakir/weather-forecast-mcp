import { Injectable } from '@nestjs/common';

@Injectable()
export class HttpClient {
  async getJson<T>(url: URL, headers: Record<string, string> = {}): Promise<T> {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'EarthPulse-MCP/0.1 (+https://modelcontextprotocol.io)',
        ...headers,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`${url.hostname} returned HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }
}
