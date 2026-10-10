"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MailEditorContent, Toolbar, useMailEditor } from "@/components/mail/composer/editor";
import type { MeDTO, SettingsDTO } from "@/lib/types";
import { Section } from "./section";
import { useSettingsPatch } from "./use-settings-patch";

export function SignatureSettings({ settings, me }: { settings: SettingsDTO; me: MeDTO }) {
  const patch = useSettingsPatch();
  const [displayName, setDisplayName] = useState(settings.displayName ?? "");
  const [html, setHtml] = useState(settings.signatureHtml);
  const [saving, setSaving] = useState(false);
  const editor = useMailEditor({ initialHtml: settings.signatureHtml, placeholder: "e.g. Your name, role, phone number", onChange: setHtml });
  const defaultName = `${me.firstName} ${me.lastName}`;

  return (
    <>
      <Section title="Sender name" description="The name recipients see next to your address.">
        <Field id="display-name" label="Name" hint={`Leave empty to use “${defaultName}”.`}>
          <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} placeholder={defaultName} />
        </Field>
        <p className="text-[13px] text-ink-subtle">
          Recipients will see: <span className="font-medium text-ink">{(displayName.trim() || defaultName) + ` <${me.address}>`}</span>
        </p>
      </Section>
      <Section title="Signature" description="Added to new messages, replies and forwards. You can edit it in each message.">
        <div className="overflow-hidden rounded-lg border border-line-strong">
          <div className="border-b border-line bg-hover/50 px-2 py-1">
            <Toolbar editor={editor} />
          </div>
          <div className="px-3 py-2" onClick={() => editor?.commands.focus()}>
            <MailEditorContent editor={editor} />
          </div>
        </div>
      </Section>
      <div className="flex justify-end pt-2 pb-8">
        <Button
          variant="primary"
          loading={saving}
          disabled={displayName === (settings.displayName ?? "") && html === settings.signatureHtml}
          onClick={async () => {
            setSaving(true);
            try {
              const empty = editor?.isEmpty ?? !html.trim();
              await patch({ displayName: displayName.trim() || null, signatureHtml: empty ? "" : html });
            } finally {
              setSaving(false);
            }
          }}
        >
          Save changes
        </Button>
      </div>
    </>
  );
}
