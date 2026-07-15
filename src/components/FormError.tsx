import type { ReactNode } from "react";

interface FormErrorProps {
  children: ReactNode;
  className?: string;
}

/** Shared error banner for forms. */
export function FormError({ children, className }: FormErrorProps) {
  if (!children) return null;
  return (
    <p className={`text-xs font-semibold text-red-400 bg-red-950/20 border border-red-900/30 rounded-xl p-3 leading-relaxed ${className ?? ""}`}>
      {children}
    </p>
  );
}
