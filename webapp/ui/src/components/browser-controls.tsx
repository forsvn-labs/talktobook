import type { ComponentProps } from 'react'

// Native controls keep the standalone converter free of the local desk's UI runtime.
export const buttonClass = 'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oxblood disabled:opacity-50 disabled:cursor-not-allowed'
export function Button({ variant, className = '', ...props }: ComponentProps<'button'> & { variant?: 'outline' }) {
  return <button className={`${buttonClass} ${variant === 'outline' ? 'border border-rule bg-panel text-ink hover:bg-paper-2' : 'border border-ink bg-ink text-paper hover:bg-oxblood'} ${className}`} {...props} />
}
const fieldClass = 'w-full rounded-md border border-rule bg-paper px-3 py-2 text-base md:text-sm text-ink shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oxblood disabled:opacity-50'
export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input className={`${fieldClass} ${className}`} {...props} />
}
export function Textarea({ className = '', ...props }: ComponentProps<'textarea'>) {
  return <textarea className={`${fieldClass} ${className}`} {...props} />
}
