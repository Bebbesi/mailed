import { notFound } from "next/navigation";
import { MailboxRoute } from "@/components/mail/mailbox-route";

export const metadata = { title: "Label" };

export default async function LabelLayout({ params, children }: { params: Promise<{ labelId: string }>; children: React.ReactNode }) {
  const { labelId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(labelId)) notFound();
  return (
    <>
      <MailboxRoute kind="label" value={labelId} />
      {children}
    </>
  );
}
