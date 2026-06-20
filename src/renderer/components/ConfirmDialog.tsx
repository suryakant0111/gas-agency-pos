import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'danger' | 'warning' | 'info'
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open, title, message, confirmText = 'Confirm', cancelText = 'Cancel',
  onConfirm, onCancel, variant = 'info'
}) => {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onCancel])

  const btnClass = variant === 'danger' ? 'btn-danger' :
                   variant === 'warning' ? 'btn-warning' : 'btn-primary'

  if (!open) return null

  return createPortal(
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal-box p-6 w-96"
           onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-300 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onCancel}>{cancelText}</button>
          <button className={btnClass} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ConfirmDialog
