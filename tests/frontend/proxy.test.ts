import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { checkBasicAuth, config, proxy } from "@/proxy";

const basic = (u: string, p: string) => `Basic ${btoa(`${u}:${p}`)}`;

describe("checkBasicAuth", () => {
  it("accepts the configured credentials", () => {
    expect(checkBasicAuth(basic("admin", "test-password"), "admin", "test-password")).toBe("ok");
  });
  it("rejects wrong or malformed credentials", () => {
    expect(checkBasicAuth(basic("admin", "nope"), "admin", "test-password")).toBe("unauthorized");
    expect(checkBasicAuth(basic("root", "test-password"), "admin", "test-password")).toBe("unauthorized");
    expect(checkBasicAuth("Bearer xyz", "admin", "test-password")).toBe("unauthorized");
    expect(checkBasicAuth("Basic !!!notbase64", "admin", "test-password")).toBe("unauthorized");
    expect(checkBasicAuth(`Basic ${btoa("nocolon")}`, "admin", "test-password")).toBe("unauthorized");
    expect(checkBasicAuth(null, "admin", "test-password")).toBe("unauthorized");
  });
  it("allows colons in the password", () => {
    expect(checkBasicAuth(basic("admin", "a:b:c"), "admin", "a:b:c")).toBe("ok");
  });
  it("fails closed when not configured", () => {
    expect(checkBasicAuth(basic("admin", "x"), "", "x")).toBe("not_configured");
    expect(checkBasicAuth(basic("", ""), "", "")).toBe("not_configured");
  });
  it("reads env by default (tests/setup.ts sets admin / test-password)", () => {
    expect(checkBasicAuth(basic("admin", "test-password"))).toBe("ok");
  });
});

describe("proxy", () => {
  it("challenges unauthenticated /ops requests", () => {
    const res = proxy(new NextRequest("https://juryhour.test/ops"));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toMatch(/^Basic /);
  });
  it("passes authenticated requests through", () => {
    const res = proxy(
      new NextRequest("https://juryhour.test/api/ops-ui/pause", {
        headers: { authorization: basic("admin", "test-password") },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
  it("matches the dashboard, its write routes, and ?src= page loads", () => {
    expect(config.matcher.slice(0, 3)).toEqual(["/ops", "/ops/:path*", "/api/ops-ui/:path*"]);
    expect(config.matcher[3]).toMatchObject({ has: [{ type: "query", key: "src" }] });
  });
  it("sets the jh_src cookie on public pages with ?src= and never asks for auth there", () => {
    const res = proxy(new NextRequest("https://juryhour.test/?src=Reddit"));
    expect(res.status).toBe(200);
    expect(res.cookies.get("jh_src")?.value).toBe("reddit");
  });
  it("ignores invalid src values", () => {
    const res = proxy(new NextRequest("https://juryhour.test/?src=%3Cscript%3E"));
    expect(res.cookies.get("jh_src")).toBeUndefined();
  });
  it("still demands auth for /ops?src=", () => {
    expect(proxy(new NextRequest("https://juryhour.test/ops?src=x")).status).toBe(401);
  });
});
