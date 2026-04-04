const BASE_URL = "/api";

interface ApiError {
  status: number;
  message: string;
}

class ApiResponseError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiResponseError";
    this.status = status;
  }
}

/** Registered by auth store on init — breaks circular dep between api ↔ auth */
let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(fn: () => void) {
  onUnauthorized = fn;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    onUnauthorized?.();
    throw new ApiResponseError(401, "Unauthorized");
  }

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as ApiError;
      message = body.message || message;
    } catch {
      // response body is not JSON — keep statusText
    }
    throw new ApiResponseError(response.status, message);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
  });
  return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${BASE_URL}${path}`, init);
  return handleResponse<T>(response);
}

export { ApiResponseError };
