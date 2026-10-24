import { describe, expect, it } from "vitest";
import { canonicalRedirect } from "@/proxy";

const u = (p: string) => new URL(`https://juryhour.vercel.app${p}`);

describe("canonicalRedirect", () => {
  it("does nothing until CANONICAL_HOST is set", () => {
    expect(canonicalRedirect(u("/pricing"), "juryhour.vercel.app", undefined)).toBeNull();
  });
  it("redirects production-alias pages with path and query", () => {
    expect(canonicalRedirect(u("/pricing?src=x"), "juryhour.vercel.app", "juryhour.com")).toBe(
      "https://juryhour.com/pricing?src=x",
    );
  });
  it("never redirects API routes or the juror page", () => {
    expect(canonicalRedirect(u("/api/whop-webhook"), "juryhour.vercel.app", "juryhour.com")).toBeNull();
    expect(canonicalRedirect(u("/t/abc?sid=1"), "juryhour.vercel.app", "juryhour.com")).toBeNull();
  });
  it("leaves preview deployments and the canonical host alone", () => {
    expect(canonicalRedirect(u("/"), "juryhour-git-x-ashwin.vercel.app", "juryhour.com")).toBeNull();
    expect(canonicalRedirect(u("/"), "juryhour.com", "juryhour.com")).toBeNull();
  });
});
