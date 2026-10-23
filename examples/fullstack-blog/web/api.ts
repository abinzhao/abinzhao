export type Tenant = { id: string; slug: string; name: string; role: string };
export type Session = { user: { id: string; email: string } | null; csrfToken: string | null; tenants: Tenant[] };
export type Post = { id: string; slug: string; title: string; summary: string; body: string; status: 'draft' | 'published'; revision: number };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export async function request<T>(path: string, options: {
  method?: string; body?: unknown; csrfToken?: string | null; signal?: AbortSignal;
} = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    signal: options.signal,
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.csrfToken ? { 'X-CSRF-Token': options.csrfToken } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  if (response.status === 204) return undefined as T;
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = value as { code?: string; message?: string };
    throw new ApiError(response.status, error.code ?? 'REQUEST_FAILED', error.message ?? 'Request failed');
  }
  // Compile-time DTOs are not runtime validators; contract checks cover this course API.
  return value as T;
}
