// @vitest-environment node
import { test, expect, vi, beforeEach } from "vitest";
import { jwtVerify } from "jose";

vi.mock("server-only", () => ({}));

const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ set: mockCookieSet })),
}));

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

beforeEach(() => {
  mockCookieSet.mockClear();
  delete process.env.JWT_SECRET;
  process.env.NODE_ENV = "test";
});

test("genera un token JWT con userId y email correctos", async () => {
  const { createSession } = await import("@/lib/auth");

  await createSession("user-123", "test@example.com");

  const [, token] = mockCookieSet.mock.calls[0];
  const { payload } = await jwtVerify(token, JWT_SECRET);

  expect(payload.userId).toBe("user-123");
  expect(payload.email).toBe("test@example.com");
});

test("el token expira en aproximadamente 7 días", async () => {
  const { createSession } = await import("@/lib/auth");

  await createSession("user-123", "test@example.com");

  const [, token] = mockCookieSet.mock.calls[0];
  const { payload } = await jwtVerify(token, JWT_SECRET);

  const sevenDaysFromNow = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  expect(payload.exp).toBeGreaterThan(sevenDaysFromNow - 10);
  expect(payload.exp).toBeLessThanOrEqual(sevenDaysFromNow + 10);
});

test("llama a cookieStore.set con el nombre de cookie 'auth-token'", async () => {
  const { createSession } = await import("@/lib/auth");

  await createSession("user-123", "test@example.com");

  expect(mockCookieSet).toHaveBeenCalledOnce();
  const [cookieName] = mockCookieSet.mock.calls[0];
  expect(cookieName).toBe("auth-token");
});

test("opciones de cookie en desarrollo: secure es false, httpOnly true, sameSite lax", async () => {
  process.env.NODE_ENV = "test";
  const { createSession } = await import("@/lib/auth");

  await createSession("user-123", "test@example.com");

  const [, , options] = mockCookieSet.mock.calls[0];
  expect(options.httpOnly).toBe(true);
  expect(options.secure).toBe(false);
  expect(options.sameSite).toBe("lax");
  expect(options.path).toBe("/");
});

test("opciones de cookie en producción: secure es true", async () => {
  process.env.NODE_ENV = "production";
  const { createSession } = await import("@/lib/auth");

  await createSession("user-123", "test@example.com");

  const [, , options] = mockCookieSet.mock.calls[0];
  expect(options.secure).toBe(true);

  process.env.NODE_ENV = "test";
});

test("expires de la cookie es aproximadamente 7 días desde ahora", async () => {
  const before = new Date();
  const { createSession } = await import("@/lib/auth");

  await createSession("user-123", "test@example.com");

  const [, , options] = mockCookieSet.mock.calls[0];
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  expect(options.expires.getTime()).toBeGreaterThanOrEqual(
    before.getTime() + sevenDays - 1000
  );
  expect(options.expires.getTime()).toBeLessThanOrEqual(
    Date.now() + sevenDays + 1000
  );
});
