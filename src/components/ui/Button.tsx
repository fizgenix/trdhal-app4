import { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  fullWidth?: boolean;
  /** Disables the button and shows a spinner — use while a save is in flight. */
  loading?: boolean;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-base font-bold tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed aria-busy:cursor-wait aria-busy:opacity-80";

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-brand-navy text-brand-gold-text shadow-[0_6px_14px_-6px_rgba(15,26,51,0.5)] hover:bg-brand-navy-2",
  secondary:
    "bg-white text-brand-navy border border-brand-navy hover:bg-brand-navy hover:text-white",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

export function Button({
  variant = "primary",
  fullWidth,
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
