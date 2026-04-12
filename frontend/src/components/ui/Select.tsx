import React from 'react'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <select ref={ref} className={['input', 'select', className].filter(Boolean).join(' ')} {...props}>
        {children}
      </select>
    )
  }
)
Select.displayName = 'Select'

