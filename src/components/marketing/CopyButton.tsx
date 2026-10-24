"use client";
// Copies a block of text (the winning copy). Announces the result politely for screen readers.
import { useState } from "react";
import s from "./marketing.module.css";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <>
      <button type="button" className={s.copyBtn} onClick={copy}>
        {state === "copied" ? "Copied" : label}
      </button>
      <span className={s.visuallyHidden} aria-live="polite">
        {state === "copied" ? "Copied to clipboard" : state === "failed" ? "Copy failed; select the text instead" : ""}
      </span>
    </>
  );
}
