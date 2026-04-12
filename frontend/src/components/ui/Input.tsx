import React from 'react'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    return <input ref={ref} className={['input', className].filter(Boolean).join(' ')} {...props} />
  }
)
Input.displayName = 'Input'

