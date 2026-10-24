"use client";
// Time left until the launch offer's real end time. Renders nothing on the server (the static
// label next to it already says when it ends); ticks every 30 s in the browser. Never resets.
import { useMemo, useSyncExternalStore } from "react";
import { formatDuration } from "@/components/pricing/pricing-data";

function subscribeTick(notify: () => void) {
  const id = setInterval(notify, 30_000);
  document.addEventListener("visibilitychange", notify);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", notify);
  };
}

export function OfferCountdown({ endsAt, className }: { endsAt: string; className?: string }) {
  const endsAtMs = useMemo(() => new Date(endsAt).getTime(), [endsAt]);
  const minutesLeft = useSyncExternalStore<number | null>(
    subscribeTick,
    () => Math.ceil((endsAtMs - Date.now()) / 60_000),
    () => null,
  );
  if (minutesLeft === null || minutesLeft <= 0) return null;
  return <span className={className}>({formatDuration(minutesLeft)} left)</span>;
}
