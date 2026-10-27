import { InputHTMLAttributes, ReactNode } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Shown inside the box on the right, e.g. the unit next to a quantity. */
  suffix?: ReactNode;
  /** Extra classes for the label — e.g. "sm:sr-only" under a table header row. */
  labelClassName?: string;
};

export function Field({ label, id, name, suffix, labelClassName = "", className = "", ...props }: FieldProps) {
  const fieldId = id ?? name;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className={`text-[10.5px] font-bold uppercase tracking-wider text-[#6b6553] ${labelClassName}`}
      >
        {label}
      </label>
      {/* The suffix sits beside the input (not over it) so it only takes
          the width it needs and never hides what's typed. */}
      <div className="flex items-center rounded-[10px] border border-brand-input-border focus-within:border-brand-gold focus-within:ring-2 focus-within:ring-brand-gold/40">
        <input
          id={fieldId}
          name={name}
          className={`w-full min-w-0 flex-1 rounded-[10px] bg-transparent px-3.5 py-2.5 text-[15px] text-brand-navy placeholder:text-gray-400 focus:outline-none ${suffix ? "pr-1" : ""} ${className}`}
          {...props}
        />
        {suffix && (
          <span className="pointer-events-none max-w-[40%] shrink-0 truncate pr-3.5 text-sm font-bold text-[#6b6553]">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
