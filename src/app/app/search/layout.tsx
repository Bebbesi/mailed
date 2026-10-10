import { MailboxRoute } from "@/components/mail/mailbox-route";

export const metadata = { title: "Search" };

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MailboxRoute kind="search" />
      {children}
    </>
  );
}
