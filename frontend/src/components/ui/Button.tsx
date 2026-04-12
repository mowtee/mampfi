import React from 'react'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'destructive'
  size?: 'sm' | 'md'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'md', ...props }, ref) => {
    const base = 'btn'
    const v = variant === 'primary' ? 'primary' : variant === 'ghost' ? 'ghost' : variant === 'destructive' ? 'danger' : ''
    const sz = size === 'sm' ? 'btn-sm' : ''
    const cn = [base, v && v !== 'danger' ? v : '', v === 'danger' ? '' : '', sz, className].filter(Boolean).join(' ')
    return <button ref={ref} className={cn} {...props} />
  }
)
Button.displayName = 'Button'

