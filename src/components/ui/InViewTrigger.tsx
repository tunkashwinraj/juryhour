"use client";

import { useEffect, useRef } from "react";

/**
 * Renders nothing visible. On mount, if its parent is below the fold, marks the parent
 * `data-waiting` (CSS holds the animation at its start) and removes it once the parent scrolls into
 * view, which restarts the CSS animation. Without JS the animation simply plays on load.
 */
export function InViewTrigger() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const r = host.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) return; // already visible: let it play
    host.setAttribute("data-waiting", "");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          host.removeAttribute("data-waiting");
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(host);
    return () => io.disconnect();
  }, []);
  return <span ref={ref} hidden />;
}
