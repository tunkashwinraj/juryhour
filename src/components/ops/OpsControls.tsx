"use client";
// /ops client islands: 10s auto-refresh and the human kill switch.
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [on, seconds, router]);
  return (
    <label className="check small">
      <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
      <span>Auto-refresh every {seconds}s</span>
    </label>
  );
}

export function KillSwitch({ salesPaused }: { salesPaused: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function press() {
    const action = salesPaused ? "resume" : "pause";
    const ok = window.confirm(
      salesPaused
        ? "Resume sales? This is a human action and adds 1 to Human interventions."
        : "Pause ALL sales? This is a human action and adds 1 to Human interventions. Only do this if something is on fire.",
    );
    if (!ok) return;
    setError(null);
    try {
      const res = await fetch(`/api/ops-ui/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ops-ui": "1" },
        body: "{}",
      });
      const body = await res.json().catch(() => null);
      if (!body?.ok) setError(body?.error ?? `Failed (${res.status})`);
    } catch {
      setError("Network error");
    }
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <button type="button" className={salesPaused ? "btn btn-sm" : "btn btn-sm btn-danger"} onClick={press} disabled={pending}>
        {salesPaused ? "Resume sales" : "Pause all sales"}
      </button>
      {error ? (
        <p className="form-error small" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
