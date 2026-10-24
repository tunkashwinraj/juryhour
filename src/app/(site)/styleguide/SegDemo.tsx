"use client";

import { useState } from "react";
import { Field, Input, SegmentedControl, Textarea, segmentPanelId } from "@/components/ui";

/** Interactive SegmentedControl demo for /styleguide (URL / pitch toggle, as on the preview form). */
export function SegDemo() {
  const [mode, setMode] = useState<"url" | "pitch">("url");
  return (
    <div style={{ maxWidth: 520 }}>
      <SegmentedControl
        ariaLabel="What to test"
        idPrefix="sg-mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: "url", label: "Page URL" },
          { value: "pitch", label: "Paste your pitch" },
        ]}
      />
      <div id={segmentPanelId("sg-mode", mode)} role="tabpanel" aria-labelledby={`sg-mode-tab-${mode}`} style={{ marginTop: 16 }}>
        {mode === "url" ? (
          <Field id="sg-seg-url" label="Your landing page" hint="Public pages only.">
            <Input type="url" inputMode="url" placeholder="yourproduct.com" autoComplete="url" />
          </Field>
        ) : (
          <Field id="sg-seg-pitch" label="Your pitch" hint="Headline, subheadline and what it costs.">
            <Textarea />
          </Field>
        )}
      </div>
    </div>
  );
}
