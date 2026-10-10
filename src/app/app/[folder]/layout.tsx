import { notFound } from "next/navigation";
import { MailboxRoute } from "@/components/mail/mailbox-route";
import { SYSTEM_VIEWS, type SystemView } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ folder: string }> }) {
  const { folder } = await params;
  const name = folder.charAt(0).toUpperCase() + folder.slice(1);
  return { title: name };
}

export default async function FolderLayout({ params, children }: { params: Promise<{ folder: string }>; children: React.ReactNode }) {
  const { folder } = await params;
  if (!(SYSTEM_VIEWS as readonly string[]).includes(folder)) notFound();
  return (
    <>
      <MailboxRoute kind="system" value={folder as SystemView} />
      {children}
    </>
  );
}
