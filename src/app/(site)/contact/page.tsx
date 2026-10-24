import Link from "next/link";
import { Section } from "@/components/ui";
import { OrderLookupForm } from "@/components/preview/LeadForms";
import { CopyButton } from "@/components/report/CopyButton";
import { pageMetadata, supportEmail } from "@/lib/seo";
import { PageHero, kit } from "../for/_kit";

export const metadata = pageMetadata({
  title: "Contact JuryHour support",
  description:
    "Email JuryHour about an order, a refund or a partnership. We aim to reply the same day. Lost your order link? Look it up by email.",
  path: "/contact",
  ogTitle: "Contact JuryHour",
});

export default function ContactPage() {
  const email = supportEmail();
  return (
    <main id="main">
      <PageHero
        crumbs={[{ name: "Contact", path: "/contact" }]}
        eyebrow="CONTACT"
        title="How do I reach JuryHour?"
        lede="Email us. We aim to reply the same day. If your question is about an order, include the email you paid with."
      />

      <Section id="email" title="What's the support email?">
        <div className={kit.emailRow}>
          <span className={kit.email}>{email}</span>
          <CopyButton text={email} label="Copy address" />
        </div>
        <ul className={kit.prose}>
          <li>Order questions and refunds: include the email you used at checkout.</li>
          <li>
            Refunds follow fixed rules, most of them automatic. See the <Link href="/legal/refunds">refund policy</Link>.
          </li>
          <li>Agencies and white-label reports: tell us about the client page.</li>
          <li>Accessibility problems or a juror question: we want to hear about it.</li>
        </ul>
      </Section>

      <Section id="lookup" title="Lost the link to your order?">
        <p className={kit.answer}>
          Enter the email you paid with. If we have orders for it, we&apos;ll email you their status links. We show the same
          message either way, so nobody can use this to check who our customers are.
        </p>
        <OrderLookupForm />
      </Section>

      <Section id="before" title="Can I find the answer without writing?">
        <p className={kit.answer}>Often, yes. Most questions are answered on these pages:</p>
        <ul className={kit.prose}>
          <li>
            <Link href="/faq">FAQ</Link>: jurors, privacy, pricing and refunds.
          </li>
          <li>
            <Link href="/how-it-works">How it works</Link>: the full method and its limits.
          </li>
          <li>
            Your order page (the link in your confirmation email) shows live progress and the deadline.
          </li>
        </ul>
      </Section>
    </main>
  );
}
