"use client";

import { useId } from "react";
import { clsx } from "@/lib/clsx";

export function TextField({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3"
      >
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={clsx(
          "rounded-[12px] border bg-surface-2 px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-3",
          error ? "border-danger" : "border-line focus:border-basil",
          className,
        )}
        {...props}
      />
      {hint && !error && (
        <p id={`${fieldId}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fieldId}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
