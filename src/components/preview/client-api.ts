// Browser fetch helper for the preview/checkout UX. Never throws: network failures come back as
// status 0 so logic.ts maps them to plain-language messages.

export async function postJson(url: string, body: unknown, timeoutMs = 65_000): Promise<{ status: number; body: unknown }> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl?.signal,
    });
    const data: unknown = await res.json().catch(() => null);
    return { status: res.status, body: data };
  } catch {
    return { status: 0, body: { ok: false, code: "network" } };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
