import { api, setToken, clearToken } from "./api";

export interface AuthUser {
  id: string;
  email?: string;
  token: string;
}

export async function register(email: string, password: string): Promise<AuthUser> {
  const user = await api<AuthUser>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(user.token);
  return user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const user = await api<AuthUser>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(user.token);
  return user;
}

export async function logout(): Promise<void> {
  clearToken();
  // Best-effort — the token is already discarded client-side regardless of whether this succeeds.
  await api<void>("/auth/logout", { method: "POST" }).catch(() => {});
}
