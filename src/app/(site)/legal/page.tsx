import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "./_ui/LegalPage";
import { LAST_UPDATED_ISO, LAST_UPDATED_LABEL, LEGAL_PAGES } from "./_ui/legal";
import s from "./_ui/prose.module.css";

export const metadata: Metadata = pageMetadata({
  title: "Legal",
  description: "JuryHour's privacy policy, terms of service, refund policy and accessibility statement, in plain English.",
  path: "/legal",
});

export default function LegalIndexPage() {
  return (
    <main id="main" className={s.page}>
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Legal", path: "/legal" },
        ]}
      />
      <header className={s.header}>
        <p className={s.eyebrow}>Legal</p>
        <h1 className={s.title}>Policies</h1>
        <p className={s.meta}>
          <span>
            Last updated: <time dateTime={LAST_UPDATED_ISO}>{LAST_UPDATED_LABEL}</time>
          </span>
        </p>
      </header>
      <ul className={s.cardList}>
        {LEGAL_PAGES.map((p) => (
          <li key={p.path}>
            <h2 className={s.cardTitle}>
              <a href={p.path}>{p.name}</a>
            </h2>
            <p className={s.cardText}>{p.summary}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
