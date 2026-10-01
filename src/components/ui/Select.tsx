import { SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
};

export function Select({
  label,
  id,
  name,
  className = "",
  children,
  ...props
}: SelectProps) {
  const fieldId = id ?? name;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="text-[10.5px] font-bold uppercase tracking-wider text-[#6b6553]"
      >
        {label}
      </label>
      <select
        id={fieldId}
        name={name}
        className={`rounded-[10px] border border-brand-input-border bg-white px-3.5 py-2.5 text-[15px] text-brand-navy focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
