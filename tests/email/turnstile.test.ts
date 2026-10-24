import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { resetTurnstileWarning, TURNSTILE_VERIFY_URL, verifyTurnstile } from "@/lib/turnstile";

const fetchMock = vi.fn();

function setEnv(secret: string | undefined, mode: "live" | "sandbox") {
  if (secret === undefined) delete process.env.TURNSTILE_SECRET;
  else process.env.TURNSTILE_SECRET = secret;
  process.env.APP_MODE = mode;
  resetEnvCache();
  resetTurnstileWarning();
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  setEnv(undefined, "sandbox");
});

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("verifyTurnstile", () => {
  it("success: posts form-encoded secret/response/remoteip with a timeout signal", async () => {
    setEnv("ts_secret", "live");
    fetchMock.mockResolvedValue(ok({ success: true, "error-codes": [], action: "preview" }));
    expect(await verifyTurnstile("tok123", "203.0.113.5")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("secret")).toBe("ts_secret");
    expect(body.get("response")).toBe("tok123");
    expect(body.get("remoteip")).toBe("203.0.113.5");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("omits remoteip when ip is null", async () => {
    setEnv("ts_secret", "live");
    fetchMock.mockResolvedValue(ok({ success: true }));
    await verifyTurnstile("tok", null);
    expect(new URLSearchParams(String(fetchMock.mock.calls[0][1].body)).has("remoteip")).toBe(false);
  });

  it("failure responses → false", async () => {
    setEnv("ts_secret", "live");
    fetchMock.mockResolvedValueOnce(ok({ success: false, "error-codes": ["timeout-or-duplicate"] }));
    expect(await verifyTurnstile("tok", null)).toBe(false);
    fetchMock.mockResolvedValueOnce(ok({ error: "x" }, 500));
    expect(await verifyTurnstile("tok", null)).toBe(false);
    fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    expect(await verifyTurnstile("tok", null)).toBe(false);
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    expect(await verifyTurnstile("tok", null)).toBe(false);
  });

  it("missing/oversized token → false without calling Cloudflare", async () => {
    setEnv("ts_secret", "sandbox");
    expect(await verifyTurnstile(null, "1.2.3.4")).toBe(false);
    expect(await verifyTurnstile("", "1.2.3.4")).toBe(false);
    expect(await verifyTurnstile("x".repeat(2049), null)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("action mismatch → false when an action is expected", async () => {
    setEnv("ts_secret", "live");
    fetchMock.mockResolvedValue(ok({ success: true, action: "other" }));
    expect(await verifyTurnstile("tok", null, { action: "preview" })).toBe(false);
  });

  it("missing secret: sandbox allows, live fails closed, warns, never calls fetch", async () => {
    setEnv(undefined, "sandbox");
    expect(await verifyTurnstile(null, null)).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("TURNSTILE_SECRET is not configured"));
    setEnv(undefined, "live");
    expect(await verifyTurnstile("tok", null)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
