import type { ReactNode } from "react";

interface FormErrorProps {
  children: ReactNode;
  className?: string;
}

/** Shared error banner for forms. */
export function FormError({ children, className }: FormErrorProps) {
  if (!children) return null;
  return (
    <p className={`text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/30 rounded-xl p-3 leading-relaxed ${className ?? ""}`}>
      {children}
    </p>
  );
}
