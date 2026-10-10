import { cn } from "@/lib/cn";

const PALETTE = [
  "bg-[#dbe4ff] text-[#1e3a8a] dark:bg-[#1e2a4a] dark:text-[#a5b8f3]",
  "bg-[#d5f2ec] text-[#0f5a4c] dark:bg-[#123a33] dark:text-[#8fd8c7]",
  "bg-[#fde6d6] text-[#8a3b0b] dark:bg-[#3a2416] dark:text-[#f2b48a]",
  "bg-[#ece2fb] text-[#4c2a85] dark:bg-[#2b2140] dark:text-[#c6b0ef]",
  "bg-[#fbe0e6] text-[#8a1d3a] dark:bg-[#3d1a24] dark:text-[#f0a6b8]",
  "bg-[#e3ecd5] text-[#3d5a12] dark:bg-[#26331a] dark:text-[#b8d58c]",
  "bg-[#e4e4e7] text-[#3f3f46] dark:bg-[#27272a] dark:text-[#c7c7cc]",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string, fallback = "?") {
  const clean = name.replace(/[<>"@].*$/, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback.slice(0, 1).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  email,
  src,
  size = 32,
  className,
}: {
  name: string;
  email?: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const key = (email || name || "?").toLowerCase();
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} style={style} className={cn("shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <span
      aria-hidden
      style={style}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-medium select-none", PALETTE[hash(key) % PALETTE.length], className)}
    >
      {initials(name || email || "?", email)}
    </span>
  );
}
