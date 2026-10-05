import { InputHTMLAttributes, ReactNode } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Shown inside the box on the right, e.g. the unit next to a quantity. */
  suffix?: ReactNode;
};

export function Field({ label, id, name, suffix, className = "", ...props }: FieldProps) {
  const fieldId = id ?? name;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="text-[10.5px] font-bold uppercase tracking-wider text-[#6b6553]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          name={name}
          className={`w-full rounded-[10px] border border-brand-input-border px-3.5 py-2.5 text-[15px] text-brand-navy placeholder:text-gray-400 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 ${suffix ? "pr-24" : ""} ${className}`}
          {...props}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-bold text-[#6b6553]">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
