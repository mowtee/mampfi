import React from 'react'

type DialogProps = {
  open: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={() => onOpenChange?.(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export function DialogActions({ children }: { children: React.ReactNode }) {
  return <div className="modal-actions">{children}</div>
}

