export type CookieOptions = {
  secure: boolean;
  maxAgeSeconds: number;
};

export const SESSION_COOKIE = "quantify_session";
export const CSRF_COOKIE = "quantify_csrf";

export function serializeSessionCookie(token: string, options: CookieOptions): string {
  return serializeCookie(SESSION_COOKIE, token, {
    ...options,
    httpOnly: true,
  });
}

export function serializeCsrfCookie(token: string, options: CookieOptions): string {
  return serializeCookie(CSRF_COOKIE, token, {
    ...options,
    httpOnly: false,
  });
}

export function clearSessionCookies(secure: boolean): string[] {
  return [
    serializeCookie(SESSION_COOKIE, "", { secure, maxAgeSeconds: 0, httpOnly: true }),
    serializeCookie(CSRF_COOKIE, "", { secure, maxAgeSeconds: 0, httpOnly: false }),
  ];
}

function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions & { httpOnly: boolean },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${options.maxAgeSeconds}`,
  ];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function parseCookies(header: string | null | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}
