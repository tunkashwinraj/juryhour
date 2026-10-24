import type { Metadata } from "next";
import { pageMetadata, supportEmail } from "@/lib/seo";
import { LegalPage, type LegalSection } from "../_ui/LegalPage";
import s from "../_ui/prose.module.css";

const PATH = "/legal/accessibility";

export const metadata: Metadata = pageMetadata({
  title: "Accessibility statement",
  description:
    "JuryHour aims to meet WCAG 2.2 level AA across the website, the order and report pages, and the juror answer page. Tell us about any barrier.",
  path: PATH,
});

function sections(): LegalSection[] {
  const email = supportEmail();
  return [
    {
      id: "commitment",
      title: "Our target",
      body: (
        <p>
          We want everyone to be able to use JuryHour, customers and jurors alike. Our target is{" "}
          <strong>WCAG 2.2 level AA</strong> for the website, the free preview and checkout flow, the order and report pages,
          and the page jurors use to answer.
        </p>
      ),
    },
    {
      id: "what-we-do",
      title: "What we build and test for",
      body: (
        <ul>
          <li>Every flow, including the preview and checkout, usable with a keyboard alone, with a visible focus indicator.</li>
          <li>Labeled form fields, with errors announced to screen readers.</li>
          <li>Color contrast checked in both light and dark themes.</li>
          <li>Animations that respect your &ldquo;reduce motion&rdquo; setting.</li>
          <li>Layouts that work from small phone screens up and zoom to 200% without losing content.</li>
          <li>Text equivalents for charts and the tally graphic.</li>
        </ul>
      ),
    },
    {
      id: "known-limits",
      title: "Known limitations",
      body: (
        <>
          <p>
            The site was rebuilt in October 2026 and has not yet had an independent accessibility audit. Some known limits:
          </p>
          <ul>
            <li>
              The juror page shows each version for a timed few seconds, because first impressions are what we measure. If
              timing is a barrier for you as a juror, contact us.
            </li>
            <li>Checkout runs on Whop&apos;s pages, which we don&apos;t control.</li>
          </ul>
        </>
      ),
    },
    {
      id: "contact",
      title: "Report a barrier",
      body: (
        <p>
          If something on JuryHour is hard or impossible to use, email <strong className={s.mono}>{email}</strong> with the
          page address and what happened. We aim to reply within two business days and to fix or offer an alternative as
          soon as we can.
        </p>
      ),
    },
  ];
}

export default function AccessibilityPage() {
  return (
    <LegalPage
      title="Accessibility statement"
      lede="Our accessibility target, what we do to meet it, what we know isn't perfect yet, and how to tell us."
      path={PATH}
      sections={sections()}
    />
  );
}
