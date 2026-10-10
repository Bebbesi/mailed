import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/marketing/prose";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <ProsePage
      title="Privacy policy"
      updated="October 2026"
      intro="This policy explains what data this Mailed installation processes, why, and the choices you have. The organisation operating this installation is the data controller."
    >
      <section>
        <h2>Data we process</h2>
        <ul>
          <li>Account data: your name, Mailed address, recovery email and a hash of your password (Argon2id). We never store your password itself.</li>
          <li>Mail data: messages you send and receive, attachments, labels, contacts, filters and settings.</li>
          <li>Security data: active sessions (IP address and browser), and a log of security events such as sign-ins and password changes.</li>
        </ul>
      </section>
      <section>
        <h2>How we use it</h2>
        <p>
          To deliver, store and display your email; to protect your account and the service from abuse; and to classify incoming mail into
          categories and detect spam or phishing. Classification runs on our servers. Corrections you make (for example marking a message as
          spam) train a model that belongs to your account only. Aggregate counts of spam reports per sending domain, without message contents,
          are used to estimate domain reputation.
        </p>
        <p>We do not sell your data, show advertising based on your mail, or read your messages for marketing.</p>
      </section>
      <section>
        <h2>Remote content and tracking</h2>
        <p>
          Images and other remote content in messages are blocked until you choose to load them. This prevents senders from learning when or
          where you opened a message.
        </p>
      </section>
      <section>
        <h2>Processors</h2>
        <p>
          Depending on configuration, this installation may use an email delivery provider for sending and receiving mail and an object storage
          provider for attachments. They process data only to provide those services.
        </p>
      </section>
      <section>
        <h2>Retention</h2>
        <p>
          Messages stay in your mailbox until you delete them. Messages in Trash and Spam are permanently deleted after 30 days. Security logs are
          kept for as long as your account exists. When you delete your account, all mail, attachments and settings are deleted immediately.
        </p>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>
          You can access and export your data at any time from <Link href="/app/settings?tab=data">Settings → Data</Link> (account data as JSON,
          messages as mbox), correct your profile, and delete your account. If you are in the EU or UK you also have the right to object, to
          restrict processing, and to lodge a complaint with your supervisory authority.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Questions about privacy can be sent through the <Link href="/support">support page</Link>.
        </p>
      </section>
    </ProsePage>
  );
}
