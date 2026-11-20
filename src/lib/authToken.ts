/**
 * Подписанный токен сессии GTW: `v1.<base64url(payload)>.<base64url(HMAC-SHA256)>`.
 * payload = { login, role: "admin" | "user", exp (unix sec) }.
 * Web Crypto — работает и в edge-middleware, и в Node-роутах.
 * Секрет: GTW_AUTH_SECRET, иначе GTW_TOKEN (уже есть в gtw.env), иначе dev-заглушка.
 * Тот же формат проверяет server.js (node:crypto) при апгрейде /ws.
 */
export type Role = "admin" | "user";

export interface SessionPayload {
  login: string;
  role: Role;
  exp: number;
}

const SECRET =
  process.env.GTW_AUTH_SECRET || process.env.GTW_TOKEN || "gtw-dev-secret";
const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signSession(
  login: string,
  role: Role,
  ttlSec = 60 * 60 * 24 * 7
): Promise<string> {
  const payload: SessionPayload = {
    login,
    role,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(`v1.${body}`))
  );
  return `v1.${body}.${b64url(sig)}`;
}

export async function verifySession(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      unb64url(parts[2]),
      enc.encode(`v1.${parts[1]}`)
    );
    if (!ok) return null;
    const p = JSON.parse(
      new TextDecoder().decode(unb64url(parts[1]))
    ) as SessionPayload;
    if (
      typeof p.login !== "string" ||
      !p.login ||
      (p.role !== "admin" && p.role !== "user") ||
      typeof p.exp !== "number"
    ) {
      return null;
    }
    if (p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}
