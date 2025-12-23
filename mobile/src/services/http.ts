import { ENV } from '../config/env';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type HttpOptions = {
  method?: HttpMethod;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
};

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly responseText?: string;

  constructor(args: { status: number; url: string; message: string; responseText?: string }) {
    super(args.message);
    this.name = 'HttpError';
    this.status = args.status;
    this.url = args.url;
    this.responseText = args.responseText;
  }
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return { signal: controller.signal, cleanup: () => clearTimeout(timeout) };
}

export async function http<T>(options: HttpOptions): Promise<T> {
  const method = options.method ?? 'GET';
  const baseUrl = ENV.apiBaseUrl.replace(/\/+$/, '');
  const path = options.path.startsWith('/') ? options.path : `/${options.path}`;
  const url = `${baseUrl}${path}`;

  const timeoutMs = options.timeoutMs ?? 20_000;
  const { signal, cleanup } = withTimeout(undefined, timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal,
    });

    const text = await res.text();

    if (!res.ok) {
      throw new HttpError({
        status: res.status,
        url,
        message: `HTTP ${res.status} ${res.statusText}`,
        responseText: text,
      });
    }

    // Allow empty responses.
    if (!text) return undefined as T;

    return JSON.parse(text) as T;
  } finally {
    cleanup();
  }
}
