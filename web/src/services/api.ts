export interface User {
  id: string;
  username: string;
  avatar: string;
  email_configured: boolean;
}

export interface Profile {
  username: string;
  avatar: string;
  display_name: string;
  bio: string;
  interests: string[];
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
const TOKEN_KEY = "entanglement.session";

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiRequest<T>(path: string, options: {
  method?: string;
  body?: unknown;
  authenticated?: boolean;
} = {}): Promise<T> {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = getToken();
  if (options.authenticated !== false && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error ?? "Nao foi possivel concluir a solicitacao");
  }
  return result as T;
}