// Pure helpers behind the design-system components (unit-tested in tests/website/a).

/** Clamp a tally to sane integers: 0 ≤ filled ≤ total, total ≥ 0. */
export function tallyCounts(total: number, filled: number): { total: number; filled: number } {
  const t = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const f = Number.isFinite(filled) ? Math.min(t, Math.max(0, Math.floor(filled))) : 0;
  return { total: t, filled: f };
}

/** One entry per mark (true = filled), split into groups of `groupSize` like hand-drawn tallies. */
export function tallyGroups(total: number, filled: number, groupSize = 5): boolean[][] {
  const c = tallyCounts(total, filled);
  const size = Math.max(1, Math.floor(groupSize));
  const groups: boolean[][] = [];
  for (let i = 0; i < c.total; i++) {
    if (i % size === 0) groups.push([]);
    groups[groups.length - 1].push(i < c.filled);
  }
  return groups;
}

/** "Juror 06" for 6, "Juror 12" for 12, "Juror 104" for 104; strings pass through ("Juror A" → as given). */
export function jurorLabel(juror: number | string): string {
  if (typeof juror === "number") {
    if (!Number.isFinite(juror)) return "Juror";
    return `Juror ${String(Math.max(0, Math.floor(juror))).padStart(2, "0")}`;
  }
  const s = juror.trim();
  if (/^\d+$/.test(s)) return `Juror ${s.padStart(2, "0")}`;
  if (/^juror\b/i.test(s)) return s;
  return `Juror ${s}`;
}

/** Whole-dollar price for display: 239 → "$239", 1499 → "$1,499", 9.5 → "$9.50". */
export function formatPrice(n: number): string {
  const cents = !Number.isInteger(n);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
}

/** Join class names, skipping falsy values. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Ids shared by SegmentedControl and the panel(s) it controls. */
export function segmentTabId(idPrefix: string, value: string): string {
  return `${idPrefix}-tab-${value}`;
}
export function segmentPanelId(idPrefix: string, value: string): string {
  return `${idPrefix}-panel-${value}`;
}
