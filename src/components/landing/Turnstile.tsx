"use client";
// Cloudflare Turnstile widget. Only rendered when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  return new Promise((resolve, reject) => {
    const s = existing ?? document.createElement("script");
    s.addEventListener("load", () => resolve());
    s.addEventListener("error", () => reject(new Error("Turnstile failed to load")));
    if (!existing) {
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
  });
}

export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={ref} className="turnstile-slot" />;
}
