import { type Env, LIMITS } from "@quantify/config";
import type { Store, UserRecord } from "@quantify/db";
import {
  CSRF_COOKIE,
  clearSessionCookies,
  parseCookies,
  SESSION_COOKIE,
  serializeCsrfCookie,
  serializeSessionCookie,
} from "./cookies.js";
import {
  createCsrfToken,
  createSessionToken,
  hashPassword,
  hashToken,
  safeEqual,
  verifyPassword,
} from "./password.js";

export class AuthError extends Error {
  constructor(
    readonly code: "UNAUTHORIZED" | "CONFLICT" | "VALIDATION_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  isDemo: boolean;
};

export type AuthSession = {
  user: AuthUser;
  token: string;
  tokenHash: string;
  csrfToken: string;
};

function toAuthUser(user: UserRecord): AuthUser {
  return { id: user.id, email: user.email, name: user.name, isDemo: user.is_demo };
}

const DUMMY_HASH = hashPassword("dummy-password-for-timing");

export class AuthService {
  constructor(
    private readonly store: Store,
    private readonly env: Env,
  ) {}

  async signUp(input: { email: string; password: string; name?: string }): Promise<AuthSession> {
    if (input.password.length < 10) {
      throw new AuthError("VALIDATION_FAILED", "Password must be at least 10 characters.");
    }
    const email = input.email.trim().toLowerCase();
    const existing = await this.store.findUserByEmail(email);
    if (existing) {
      throw new AuthError("CONFLICT", "An account with this email already exists.");
    }
    const user = await this.store.createUser({
      email,
      passwordHash: hashPassword(input.password),
      name: input.name ?? null,
    });
    return this.issueSession(user);
  }

  async signIn(input: { email: string; password: string }): Promise<AuthSession> {
    const email = input.email.trim().toLowerCase();
    const user = await this.store.findUserByEmail(email);
    const passwordHash = user?.password_hash ?? DUMMY_HASH;
    const valid = verifyPassword(input.password, passwordHash);
    if (!user || !valid) {
      throw new AuthError("UNAUTHORIZED", "Email or password is incorrect.");
    }
    return this.issueSession(user);
  }

  async signOut(tokenHash: string | null): Promise<void> {
    if (tokenHash) await this.store.deleteSession(tokenHash);
  }

  async getSession(cookieHeader: string | null | undefined): Promise<{
    user: AuthUser;
    tokenHash: string;
  } | null> {
    const cookies = parseCookies(cookieHeader);
    const token = cookies[SESSION_COOKIE];
    if (!token) return null;
    const tokenHash = hashToken(token);
    const record = await this.store.findSessionUser(tokenHash);
    if (!record) return null;
    return { user: toAuthUser(record), tokenHash };
  }

  verifyCsrf(
    cookieHeader: string | null | undefined,
    headerToken: string | null | undefined,
  ): boolean {
    const cookies = parseCookies(cookieHeader);
    const cookieToken = cookies[CSRF_COOKIE];
    if (!cookieToken || !headerToken) return false;
    return safeEqual(cookieToken, headerToken);
  }

  cookieOptions(): { secure: boolean; maxAgeSeconds: number } {
    return {
      secure: this.env.COOKIE_SECURE,
      maxAgeSeconds: LIMITS.sessionTtlDays * 24 * 60 * 60,
    };
  }

  sessionCookies(session: AuthSession): string[] {
    const options = this.cookieOptions();
    return [
      serializeSessionCookie(session.token, options),
      serializeCsrfCookie(session.csrfToken, options),
    ];
  }

  clearCookies(): string[] {
    return clearSessionCookies(this.env.COOKIE_SECURE);
  }

  private async issueSession(user: UserRecord): Promise<AuthSession> {
    const { token, tokenHash } = createSessionToken();
    const expiresAt = new Date(Date.now() + LIMITS.sessionTtlDays * 24 * 60 * 60 * 1000);
    await this.store.createSession({ userId: user.id, tokenHash, expiresAt });
    return { user: toAuthUser(user), token, tokenHash, csrfToken: createCsrfToken() };
  }
}
