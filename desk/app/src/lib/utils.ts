import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtSize(n?: number | null): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—"
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1048576) return `${Math.max(1, Math.round(n / 1024))} KB`
  if (n < 1073741824) {
    const mb = n / 1048576
    return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`
  }
  const gb = n / 1073741824
  return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`
}
