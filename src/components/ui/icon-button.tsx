"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import { Button, type ButtonProps } from "./button";
import { Tooltip } from "./tooltip";

type Props = Omit<ButtonProps, "children" | "size"> & {
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  size?: "icon" | "icon-sm";
  tooltipSide?: "top" | "bottom" | "left" | "right";
  pressed?: boolean;
};

/** Icon-only button: always has an accessible name and a tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, icon, shortcut, size = "icon-sm", variant = "ghost", tooltipSide, pressed, className, ...props },
  ref,
) {
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      <Button
        ref={ref}
        size={size}
        variant={variant}
        aria-label={label}
        aria-pressed={pressed}
        className={cn("[&_svg]:size-[17px]", className)}
        {...props}
      >
        {icon}
      </Button>
    </Tooltip>
  );
});
