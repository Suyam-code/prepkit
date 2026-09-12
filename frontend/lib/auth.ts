import { api } from "./api";

export interface AuthUser {
  id: string;
  email?: string;
}

export function register(email: string, password: string) {
  return api<AuthUser>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function login(email: string, password: string) {
  return api<AuthUser>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return api<void>("/auth/logout", { method: "POST" });
}
