import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/marketing/prose";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <ProsePage title="Terms of service" updated="October 2026" intro="By creating an account you agree to these terms. Please read them carefully.">
      <section>
        <h2>Your account</h2>
        <p>
          You are responsible for keeping your password secure and for activity under your account. Keep your recovery email up to date so you
          can regain access if you forget your password.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>Do not send spam, unsolicited bulk mail, phishing or malware.</li>
          <li>Do not use Mailed to harass others or to break the law.</li>
          <li>Do not attempt to access other people&apos;s accounts or to disrupt the service.</li>
        </ul>
        <p>Sending limits apply to protect the service and its reputation. Accounts that break these rules may be suspended.</p>
      </section>
      <section>
        <h2>Your content</h2>
        <p>
          You keep all rights to the messages and files in your mailbox. We process them only to provide the service, as described in the{" "}
          <Link href="/privacy">privacy policy</Link>.
        </p>
      </section>
      <section>
        <h2>Availability</h2>
        <p>
          We work to keep Mailed available and your data safe, but the service is provided as is. Delivery of email also depends on other mail
          systems outside our control.
        </p>
      </section>
      <section>
        <h2>Ending your account</h2>
        <p>You can delete your account at any time from Settings. Deletion is permanent.</p>
      </section>
    </ProsePage>
  );
}
