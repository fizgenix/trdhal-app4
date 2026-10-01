import { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  fullWidth?: boolean;
};

const base =
  "inline-flex items-center justify-center rounded-full px-6 py-3.5 text-base font-bold tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-brand-navy text-brand-gold-text shadow-[0_6px_14px_-6px_rgba(15,26,51,0.5)] hover:bg-brand-navy-2",
  secondary:
    "bg-white text-brand-navy border border-brand-navy hover:bg-brand-navy hover:text-white",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export function Button({
  variant = "primary",
  fullWidth,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
}
