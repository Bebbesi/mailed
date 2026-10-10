import { notFound } from "next/navigation";
import { ComposePage } from "@/components/mail/composer/compose-page";

export const metadata = { title: "Draft" };

export default async function DraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) notFound();
  return <ComposePage draftId={draftId} />;
}
