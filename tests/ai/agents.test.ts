import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { AgentFireError, AgentRateLimitError, fireAgent } from "@/lib/agents";

const FIRE_URL = "https://api.anthropic.com/v1/claude_code/routines/trig_01TEST/fire";
const TOKEN = "sk-ant-oat01-test-token";
const ORDER = "4b7f0c55-2d4e-4f7e-9b51-3f0b2b8f9e10";

function setRoutineEnv() {
  process.env.AGENT_RESEARCHER_FIRE_URL = FIRE_URL;
  process.env.AGENT_RESEARCHER_FIRE_TOKEN = TOKEN;
  resetEnvCache();
}

beforeEach(() => {
  delete process.env.AGENT_RESEARCHER_FIRE_URL;
  delete process.env.AGENT_RESEARCHER_FIRE_TOKEN;
  resetEnvCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AGENT_RESEARCHER_FIRE_URL;
  delete process.env.AGENT_RESEARCHER_FIRE_TOKEN;
  resetEnvCache();
});

describe("fireAgent", () => {
  it("POSTs the documented request shape and returns the session", async () => {
    setRoutineEnv();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        type: "routine_fire",
        claude_code_session_id: "session_01ABC",
        claude_code_session_url: "https://claude.ai/code/session_01ABC",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await fireAgent("researcher", { order_id: ORDER, attempt: 2 });
    expect(out).toEqual({ sessionId: "session_01ABC", sessionUrl: "https://claude.ai/code/session_01ABC" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(FIRE_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      "anthropic-beta": "experimental-cc-routine-2026-04-01",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(init.body);
    expect(Object.keys(body)).toEqual(["text"]);
    expect(typeof body.text).toBe("string");
    expect(JSON.parse(body.text)).toEqual({ order_id: ORDER, attempt: 2 });
  });

  it("throws a clear error when the fire URL is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fireAgent("researcher", { order_id: ORDER, attempt: 1 })).rejects.toThrow(
      "AGENT_RESEARCHER_FIRE_URL is not configured",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws a clear error when the token is missing", async () => {
    process.env.AGENT_RESEARCHER_FIRE_URL = FIRE_URL;
    resetEnvCache();
    await expect(fireAgent("researcher", { order_id: ORDER, attempt: 1 })).rejects.toThrow(
      "AGENT_RESEARCHER_FIRE_TOKEN is not configured",
    );
  });

  it("maps 429 to AgentRateLimitError with Retry-After", async () => {
    setRoutineEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { type: "error", error: { type: "rate_limit_error", message: "hourly limit" } },
          { status: 429, headers: { "retry-after": "1200" } },
        ),
      ),
    );
    const err = await fireAgent("researcher", { order_id: ORDER, attempt: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(AgentRateLimitError);
    expect(err.retryAfterSeconds).toBe(1200);
    expect(err.agent).toBe("researcher");
  });

  it("maps other errors to AgentFireError without leaking the token, and never retries", async () => {
    setRoutineEnv();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ type: "error", error: { type: "authentication_error", message: "bad token" } }, { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const err = await fireAgent("researcher", { order_id: ORDER, attempt: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(AgentFireError);
    expect(err.status).toBe(401);
    expect(err.message).toContain("authentication_error");
    expect(err.message).not.toContain(TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an unexpected success body", async () => {
    setRoutineEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
    await expect(fireAgent("researcher", { order_id: ORDER, attempt: 1 })).rejects.toBeInstanceOf(AgentFireError);
  });

  it("validates the payload (uuid order id, attempt ≥ 1) before any request", async () => {
    setRoutineEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fireAgent("researcher", { order_id: "not-a-uuid", attempt: 1 })).rejects.toThrow();
    await expect(fireAgent("researcher", { order_id: ORDER, attempt: 0 })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
