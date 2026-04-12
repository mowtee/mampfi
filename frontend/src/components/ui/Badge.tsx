import React from 'react'

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'ok' | 'warn' | 'finalized' | 'muted' | 'locked' | 'open'
}

export function Badge({ className = '', variant = 'default', ...props }: BadgeProps) {
  const cn = ['chip', variant !== 'default' ? variant : '', className].filter(Boolean).join(' ')
  return <span className={cn} {...props} />
}

