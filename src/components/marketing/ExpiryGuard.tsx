"use client";
// Client guard for time-limited content in a (possibly minutes-stale) static shell: renders
// `children` until `endsAt`, then `after` (default nothing). The server snapshot is "not expired",
// matching the server render; the browser swaps on hydration if the time has already passed and
// again exactly at `endsAt` if the tab stays open.
import { useMemo, useSyncExternalStore, type ReactNode } from "react";

const MAX_TIMEOUT = 2_147_483_647;

function subscribeUntil(endsAtMs: number) {
  return (notify: () => void) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      const left = endsAtMs - Date.now();
      if (left <= 0) return notify();
      timer = setTimeout(arm, Math.min(left + 50, MAX_TIMEOUT));
    };
    arm();
    const onVisible = () => notify();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  };
}

export function useExpired(endsAt: string): boolean {
  const endsAtMs = new Date(endsAt).getTime();
  const subscribe = useMemo(() => subscribeUntil(endsAtMs), [endsAtMs]);
  return useSyncExternalStore(
    subscribe,
    () => Date.now() >= endsAtMs,
    () => false,
  );
}

export function ExpiryGuard({ endsAt, children, after = null }: { endsAt: string; children: ReactNode; after?: ReactNode }) {
  return <>{useExpired(endsAt) ? after : children}</>;
}
