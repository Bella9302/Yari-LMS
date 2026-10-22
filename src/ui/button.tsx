import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/ui/cn";

type Variant = "primary" | "secondary" | "ghost" | "accent" | "danger";
type Size = "md" | "lg" | "sm";

const variants: Record<Variant, string> = {
  primary: "bg-inverse text-on-inverse hover:bg-graphite dark:hover:bg-white",
  secondary: "border border-line-strong text-fg hover:bg-sunk",
  ghost: "text-fg hover:bg-sunk",
  accent: "bg-accent text-ink hover:brightness-95",
  danger: "border border-danger text-danger hover:bg-danger-bg",
};

// Minimum 44px tap target on md/lg (WCAG 2.5.5 / mobile on site).
const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-5 text-[0.95rem]",
  lg: "min-h-13 px-7 text-base",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-sm font-medium tracking-tight",
    "transition-[background-color,filter,transform] duration-150 active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );
}

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

export function Button({ variant, size, asChild, className, type = "button", ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp type={asChild ? undefined : type} className={buttonClasses(variant, size, className)} {...props} />
  );
}
