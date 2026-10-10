import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "danger-ghost" | "link";
type Size = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover shadow-xs disabled:bg-accent/50",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-hover shadow-xs",
  outline: "bg-transparent text-ink border border-line hover:bg-hover",
  ghost: "bg-transparent text-ink-muted hover:bg-hover hover:text-ink",
  danger: "bg-danger text-white hover:brightness-95 shadow-xs",
  "danger-ghost": "bg-transparent text-danger hover:bg-danger-soft",
  link: "bg-transparent text-accent-ink underline-offset-4 hover:underline px-0 h-auto",
};

const sizes: Record<Size, string> = {
  xs: "h-7 px-2 text-xs gap-1.5",
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-10 px-4 text-sm gap-2",
  icon: "h-9 w-9 p-0",
  "icon-sm": "h-8 w-8 p-0",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  asChild?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", loading, disabled, asChild, children, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-55 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Spinner className="size-3.5" /> : null}
          {children}
        </>
      )}
    </Comp>
  );
});
