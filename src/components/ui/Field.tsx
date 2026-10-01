import { InputHTMLAttributes } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function Field({ label, id, name, className = "", ...props }: FieldProps) {
  const fieldId = id ?? name;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="text-[10.5px] font-bold uppercase tracking-wider text-[#6b6553]"
      >
        {label}
      </label>
      <input
        id={fieldId}
        name={name}
        className={`rounded-[10px] border border-brand-input-border px-3.5 py-2.5 text-[15px] text-brand-navy placeholder:text-gray-400 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 ${className}`}
        {...props}
      />
    </div>
  );
}
