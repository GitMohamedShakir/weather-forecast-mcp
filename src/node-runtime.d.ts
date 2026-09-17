/**
 * Minimal Node runtime declarations kept locally so Vercel's secondary
 * TypeScript transpilation does not depend on resolving @types/node.
 * Node itself still provides these modules and globals at runtime.
 */
declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
  once(event: string, listener: () => void): unknown;
};

declare module 'node:http' {
  export interface IncomingMessage extends AsyncIterable<unknown> {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
  }

  export interface ServerResponse {
    writeHead(statusCode: number, headers?: Record<string, string>): unknown;
    write(chunk: string | Uint8Array): unknown;
    end(chunk?: string | Uint8Array): unknown;
    on(event: string, listener: (...args: unknown[]) => void): unknown;
    destroyed?: boolean;
  }
}

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
}
