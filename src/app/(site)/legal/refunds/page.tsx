import type { Metadata } from "next";
import { pageMetadata, supportEmail } from "@/lib/seo";
import { LegalPage, type LegalSection } from "../_ui/LegalPage";
import {
  LATE_MULTIPLIER,
  MAX_STAGE_ATTEMPTS,
  PANEL_GRACE_HOURS,
  SUPPORT_REFUNDS_PER_ORDER,
  proRataExample,
  tierRefundRows,
  usd,
} from "../_ui/refund-policy";
import s from "../_ui/prose.module.css";

const PATH = "/legal/refunds";

export const metadata: Metadata = pageMetadata({
  title: "Refund policy",
  description:
    "When JuryHour refunds you: in full if we can't recruit your panel, pro-rata if we deliver short, and on request for late or failed delivery.",
  path: PATH,
});

function sections(): LegalSection[] {
  const rows = tierRefundRows();
  const ex = proRataExample();
  const email = supportEmail();
  return [
    {
      id: "summary",
      title: "The short version",
      body: (
        <>
          <p>
            You pay for a panel of real people and a written verdict. If we can&apos;t deliver the panel, you get your money
            back automatically. If we deliver fewer jurors than you paid for, you get the difference back automatically. If
            your verdict is very late or our system fails, you can ask for a refund. Nobody has to argue for it: these rules
            are written into the code that runs the company.
          </p>
          <p>Every refund goes back to the card or account you paid with, through Whop, our payment processor.</p>
        </>
      ),
    },
    {
      id: "full-refund-no-panel",
      title: "Full refund if we can't recruit your panel",
      body: (
        <>
          <p>
            We recruit jurors who match your buyer through Terac. If recruiting your audience isn&apos;t possible within the
            budget for your package (even after we shrink the panel to its minimum or broaden the audience once), we refund
            you in full automatically.
          </p>
          <p>
            We also refund you in full automatically if, when your deadline passes, fewer than the minimum number of jurors
            have given usable answers. We wait {PANEL_GRACE_HOURS} extra hour{PANEL_GRACE_HOURS === 1 ? "" : "s"} after the
            deadline for late answers before refunding.
          </p>
          <div className={s.tableWrap} role="region" aria-label="Panel minimums by package" tabIndex={0}>
            <table>
              <caption className={s.caption}>
                Panel minimums by package
              </caption>
              <thead>
                <tr>
                  <th scope="col">Package</th>
                  <th scope="col">Jurors in package</th>
                  <th scope="col">Minimum for delivery</th>
                  <th scope="col">Delivery window</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tier} data-tier={r.tier}>
                    <th scope="row">{r.name}</th>
                    <td className={s.mono}>{r.jurors}</td>
                    <td className={s.mono}>{r.minJurors}</td>
                    <td className={s.mono}>{r.deadlineHours} hours</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            The delivery window starts when your payment clears. Rush halves it. If you added +5 jurors, your panel has 5 more
            jurors; the minimum for delivery stays the same.
          </p>
        </>
      ),
    },
    {
      id: "pro-rata",
      title: "Pro-rata refund if we deliver short",
      body: (
        <>
          <p>
            If we reach the minimum but not the full panel by the deadline, we deliver your verdict with the jurors we have
            and refund the missing share automatically:
          </p>
          <p className={s.mono}>refund = price paid × (jurors requested − jurors delivered) ÷ jurors requested</p>
          <p>
            Example: a {usd(ex.price)} Proof with {ex.requested} jurors requested that delivers {ex.approved} gets{" "}
            <strong className={s.mono}>{usd(ex.refund)}</strong> back ({usd(ex.price)} × {ex.requested - ex.approved} ÷{" "}
            {ex.requested}). Only answers that pass our quality checks count as delivered.
          </p>
          <p>
            &ldquo;Jurors requested&rdquo; is the size of the panel we actually launch with Terac. Usually that is the number
            in your package. If recruiting your audience costs more than your package allows, we may launch a smaller panel,
            never below the minimum above; your order page shows the panel size.
          </p>
        </>
      ),
    },
    {
      id: "failed",
      title: "Full refund if our system fails",
      body: (
        <p>
          If any step of your order (research, recruiting, grading or report writing) fails {MAX_STAGE_ATTEMPTS} times, the
          order is marked failed and refunded in full automatically.
        </p>
      ),
    },
    {
      id: "on-request",
      title: "Refunds on request: late or failed delivery",
      body: (
        <>
          <p>You can ask for a refund of whatever you haven&apos;t already been refunded if:</p>
          <ul>
            <li>
              your verdict hasn&apos;t been delivered more than {LATE_MULTIPLIER}× its delivery window after you paid (for
              example, more than {rows.find((r) => r.tier === "proof")?.lateAfterHours} hours for a Proof), or
            </li>
            <li>your report failed or never arrived.</li>
          </ul>
          <p>
            We issue {SUPPORT_REFUNDS_PER_ORDER === 1 ? "one" : SUPPORT_REFUNDS_PER_ORDER} refund on request per order. Total
            refunds on an order never exceed what you paid.
          </p>
        </>
      ),
    },
    {
      id: "not-covered",
      title: "What isn't refunded",
      body: (
        <>
          <p>
            A verdict is directional research from real people, not a guarantee of sales. We don&apos;t refund because the
            verdict wasn&apos;t the one you hoped for, or because your page later performs differently.
          </p>
          <p>
            Pages we refuse at the free preview (see the prohibited content in our <a href="/legal/terms">terms</a>) are never
            charged, so there&apos;s nothing to refund.
          </p>
        </>
      ),
    },
    {
      id: "how-to-request",
      title: "How to ask for a refund",
      body: (
        <>
          <p>
            Email <strong className={s.mono}>{email}</strong> from the address you used at checkout, and include your order
            link if you have it. We aim to reply the same day. Refunds can take 5–10 business days to appear, depending on
            your bank.
          </p>
          <p>
            Please write to us before opening a chargeback; a dispute freezes the payment and is slower for everyone. If you
            do open one, it is handled through Whop&apos;s dispute process.
          </p>
        </>
      ),
    },
  ];
}

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund policy"
      lede="Exactly when you get your money back. These are the same rules our code enforces on every order."
      path={PATH}
      sections={sections()}
    />
  );
}
