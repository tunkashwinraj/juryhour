// Tiny helpers for Workstream A route handlers: structured JSON errors + request-id logging.

export function rid(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function jsonError(status: number, code: string, error: string, requestId?: string) {
  return Response.json(
    { ok: false, code, error },
    { status, headers: { "Cache-Control": "no-store", ...(requestId ? { "x-request-id": requestId } : {}) } },
  );
}

export function jsonOk<T extends Record<string, unknown>>(body: T, requestId?: string) {
  return Response.json(
    { ok: true, ...body },
    { headers: { "Cache-Control": "no-store", ...(requestId ? { "x-request-id": requestId } : {}) } },
  );
}

export function log(requestId: string, route: string, msg: string, extra?: unknown) {
  console.log(`[${route}] [${requestId}] ${msg}`, extra === undefined ? "" : extra);
}
