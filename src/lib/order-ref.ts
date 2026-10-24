// Human-readable order reference customers quote to support: "JH-" + the first 8 hex chars of the
// order uuid, uppercased (f9da6201-… → JH-F9DA6201). Derived, so nothing is stored. Pure.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "JH-F9DA6201" for an order uuid. Throws on anything that isn't a uuid. */
export function orderRef(id: string): string {
  const v = String(id ?? "").trim();
  if (!UUID_RE.test(v)) throw new Error("orderRef: not an order id");
  return `JH-${v.slice(0, 8).toUpperCase()}`;
}

/** orderRef, or null when the value isn't an order uuid (for optional/untrusted inputs). */
export function orderRefOrNull(id: unknown): string | null {
  return typeof id === "string" && UUID_RE.test(id.trim()) ? orderRef(id) : null;
}
