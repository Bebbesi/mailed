/**
 * Sends a test message to the built-in SMTP receiver, as an external server would:
 *   npm run mail:test-inbound -- --to alice@mailed.local [--from someone@example.org] [--subject "Hello"]
 */
import { parseArgs } from "node:util";
import nodemailer from "nodemailer";

async function main() {
  const { values } = parseArgs({
    options: {
      to: { type: "string" },
      from: { type: "string", default: "sender@example.org" },
      subject: { type: "string", default: "Test message from the SMTP receiver" },
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: process.env.INBOUND_SMTP_PORT ?? "2525" },
    },
  });
  if (!values.to) throw new Error("--to is required");
  const transport = nodemailer.createTransport({ host: values.host, port: Number(values.port), secure: false, ignoreTLS: true });
  const info = await transport.sendMail({
    from: values.from,
    to: values.to,
    subject: values.subject,
    text: "This message was delivered over SMTP to Mailed's inbound receiver.",
    html: "<p>This message was delivered over <strong>SMTP</strong> to Mailed's inbound receiver.</p>",
  });
  console.log(`Accepted: ${info.accepted.join(", ")} — ${info.response}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
