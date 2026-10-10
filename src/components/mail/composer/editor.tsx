"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, Link2, List, ListOrdered, Quote, RemoveFormatting, Underline as UnderlineIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

function ToolButton({ label, active, onClick, children, shortcut }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode; shortcut?: string }) {
  return (
    <Tooltip content={label} shortcut={shortcut} side="top">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={cn(
          "flex size-7 items-center justify-center rounded text-ink-subtle hover:bg-hover hover:text-ink [&_svg]:size-4",
          active && "bg-active text-ink",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function LinkButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const apply = () => {
    const v = url.trim();
    if (!v) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else {
      const href = /^(https?:|mailto:)/i.test(v) ? v : `https://${v}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setUrl((editor.getAttributes("link").href as string) ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Insert link"
          aria-pressed={editor.isActive("link")}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "flex size-7 items-center justify-center rounded text-ink-subtle hover:bg-hover hover:text-ink [&_svg]:size-4",
            editor.isActive("link") && "bg-active text-ink",
          )}
        >
          <Link2 />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-80">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
          className="flex gap-2"
        >
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" aria-label="Link address" autoFocus className="h-8" />
          <Button type="submit" size="sm" variant="primary">
            {url ? "Apply" : "Remove"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return <div className="h-8" />;
  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
      <ToolButton label="Bold" shortcut="Ctrl B" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold />
      </ToolButton>
      <ToolButton label="Italic" shortcut="Ctrl I" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic />
      </ToolButton>
      <ToolButton label="Underline" shortcut="Ctrl U" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon />
      </ToolButton>
      <LinkButton editor={editor} />
      <span className="mx-1 h-4 w-px bg-line" aria-hidden />
      <ToolButton label="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List />
      </ToolButton>
      <ToolButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolButton>
      <ToolButton label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote />
      </ToolButton>
      <ToolButton label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
        <RemoveFormatting />
      </ToolButton>
    </div>
  );
}

export function useMailEditor({
  initialHtml,
  placeholder,
  onChange,
  onSubmitShortcut,
  autofocus,
}: {
  initialHtml: string;
  placeholder?: string;
  onChange: (html: string) => void;
  onSubmitShortcut?: () => void;
  autofocus?: boolean;
}) {
  // Callbacks are read through refs so the editor is created once.
  const changeRef = useRef(onChange);
  const submitRef = useRef(onSubmitShortcut);
  useEffect(() => {
    changeRef.current = onChange;
    submitRef.current = onSubmitShortcut;
  });
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"], HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "Write your message" }),
    ],
    content: initialHtml,
    autofocus: autofocus ? "start" : false,
    editorProps: {
      attributes: { class: "mailed-editor", role: "textbox", "aria-multiline": "true", "aria-label": "Message body" },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          submitRef.current?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => changeRef.current(editor.getHTML()),
  });
  return editor;
}

export function MailEditorContent({ editor, className }: { editor: Editor | null; className?: string }) {
  return <EditorContent editor={editor} className={className} />;
}
