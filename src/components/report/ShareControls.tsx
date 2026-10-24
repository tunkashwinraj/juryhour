"use client";
// "Share my verdict": opt-in checkbox (report_public), Share on X, and the share image.
import { useState } from "react";

export function ShareControls({
  token,
  initialPublic,
  xUrl,
}: {
  token: string;
  initialPublic: boolean;
  xUrl: string;
}) {
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imgUrl = `/api/og/verdict/${token}`;

  async function toggle(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/report/${encodeURIComponent(token)}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public: next }),
      });
      const body = await res.json().catch(() => null);
      if (body?.ok) setIsPublic(Boolean(body.public));
      else setError(body?.error ?? "Could not save your choice. Try again.");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label className="check">
        <input type="checkbox" checked={isPublic} disabled={saving} onChange={(e) => toggle(e.target.checked)} />
        <span>
          Allow JuryHour to show this card publicly
          <span className="small muted" style={{ display: "block" }}>
            Only the card below: the verdict line and the number of jurors. Never your report, your page, or juror
            answers. Untick to remove it.
          </span>
        </span>
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic OG PNG */}
      <img className="share-card" src={imgUrl} alt="Your verdict share card" width={1200} height={630} />
      <div className="cta-row">
        <a className="btn btn-sm" href={xUrl} target="_blank" rel="noopener noreferrer">
          Share on X
        </a>
        <a className="btn btn-sm" href={imgUrl} download="juryhour-verdict.png">
          Download image
        </a>
      </div>
    </div>
  );
}
